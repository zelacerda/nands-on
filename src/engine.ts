import { type CompiledNetlist, liftSignal } from './netlist';
import { clockValue, pinKey, type SignalState } from './simulator';

/** Atraso de propagação de uma porta, em ticks de tempo simulado. */
const GATE_DELAY = 1;

/**
 * Quantas vezes um net precisa mudar, num `settle` que **não convergiu**, para
 * ser considerado oscilante (filtra nets que só assentaram tarde dos que de fato
 * ficam alternando). Só se aplica quando o teto de delta-cycles é atingido.
 */
const OSCILLATION_MIN_CHANGES = 3;

/** Uma porta NAND no netlist plano: dois nets de entrada (ou nulo = false) e o net de saída. */
interface Gate {
  out: string;
  inA: string | null;
  inB: string | null;
}

/**
 * Motor de simulação **event-driven** sobre um {@link CompiledNetlist} plano.
 *
 * Em vez de reavaliar o circuito inteiro a cada frame (relaxação), mantém o
 * valor corrente de cada *net* e uma fila de eventos por tempo simulado: quando
 * um net muda, apenas as portas que o consomem são reavaliadas, após um atraso
 * de porta. O custo escala com a **atividade**, não com o tamanho do circuito.
 *
 * É **stateful**: o valor dos nets persiste entre chamadas, dando memória de
 * runtime a circuitos com realimentação (latches). Um teto de delta-cycles por
 * assentamento evita laço infinito em estados oscilantes/metaestáveis.
 */
export class Simulator {
  private readonly value = new Map<string, boolean>();
  private readonly gates: Gate[] = [];
  /** net → índices das portas que o consomem (para propagar mudanças). */
  private readonly fanout = new Map<string, number[]>();
  /** nodeId de entrada → seu net de saída. */
  private readonly inputNet = new Map<string, string>();
  /** nodeIds de entradas em modo clock (fonte de nível ~1Hz, onda quadrada). */
  private readonly clockInputs: string[] = [];
  /** Todos os pinos planos e o net cujo valor cada um carrega (nulo = false). */
  private readonly flatPins: { pin: string; net: string | null }[] = [];
  /** Eventos pendentes: tempo → conjunto de índices de porta a reavaliar. */
  private readonly buckets = new Map<number, Set<number>>();
  private time = 0;
  private readonly settleCap: number;
  /** Quantas vezes cada net mudou no `settle` corrente (detecção de oscilação). */
  private readonly changeCount = new Map<string, number>();
  /** Nets que não convergiram no último `settle` (oscilando/metaestáveis). */
  private readonly oscillating = new Set<string>();

  constructor(private readonly netlist: CompiledNetlist) {
    const flat = netlist.flat;
    // Produtor que dirige cada pino consumidor (no plano, todo produtor é `…:out`).
    const driver = new Map<string, string>();
    for (const w of flat.wires) {
      driver.set(pinKey(w.to.nodeId, w.to.pinId), pinKey(w.from.nodeId, w.from.pinId));
    }

    for (const node of flat.nodes) {
      if (node.type === 'input') {
        const net = pinKey(node.id, 'out');
        this.inputNet.set(node.id, net);
        this.value.set(net, node.value === true);
        if (node.clock) this.clockInputs.push(node.id);
        this.flatPins.push({ pin: net, net });
      } else if (node.type === 'nand') {
        const out = pinKey(node.id, 'out');
        const inA = driver.get(pinKey(node.id, 'in0')) ?? null;
        const inB = driver.get(pinKey(node.id, 'in1')) ?? null;
        const gi = this.gates.length;
        this.gates.push({ out, inA, inB });
        this.value.set(out, false);
        this.addFanout(inA, gi);
        if (inB !== inA) this.addFanout(inB, gi);
        this.flatPins.push({ pin: pinKey(node.id, 'in0'), net: inA });
        this.flatPins.push({ pin: pinKey(node.id, 'in1'), net: inB });
        this.flatPins.push({ pin: out, net: out });
      } else if (node.type === 'output') {
        this.flatPins.push({ pin: pinKey(node.id, 'in'), net: driver.get(pinKey(node.id, 'in')) ?? null });
      }
    }

    // Teto generoso de delta-cycles por assentamento (proporcional ao tamanho).
    this.settleCap = this.gates.length * 8 + 1000;

    // Assentamento inicial: avalia todas as portas a partir do estado zerado,
    // levando o circuito ao seu estado estável de "ligar".
    for (let i = 0; i < this.gates.length; i++) this.schedule(i, this.time + GATE_DELAY);
    this.settle();
  }

  private addFanout(net: string | null, gate: number): void {
    if (!net) return;
    const list = this.fanout.get(net);
    if (list) list.push(gate);
    else this.fanout.set(net, [gate]);
  }

  private schedule(gate: number, atTime: number): void {
    const bucket = this.buckets.get(atTime);
    if (bucket) bucket.add(gate);
    else this.buckets.set(atTime, new Set([gate]));
  }

  /** Reavalia uma porta; se a saída mudar, agenda as portas que a consomem. */
  private evaluate(gate: number): void {
    const g = this.gates[gate]!;
    const a = g.inA ? (this.value.get(g.inA) ?? false) : false;
    const b = g.inB ? (this.value.get(g.inB) ?? false) : false;
    const out = !(a && b);
    if (this.value.get(g.out) === out) return;
    this.value.set(g.out, out);
    this.changeCount.set(g.out, (this.changeCount.get(g.out) ?? 0) + 1);
    for (const consumer of this.fanout.get(g.out) ?? []) {
      this.schedule(consumer, this.time + GATE_DELAY);
    }
  }

  /** Menor tempo com eventos pendentes, ou `undefined` se a fila está vazia. */
  private nextTime(): number | undefined {
    let min: number | undefined;
    for (const t of this.buckets.keys()) if (min === undefined || t < min) min = t;
    return min;
  }

  /**
   * Processa a fila até esvaziar, em ordem de tempo, ou até atingir o teto de
   * delta-cycles (guarda contra oscilação/metaestabilidade). Cada "tempo" é um
   * delta-cycle: todas as portas agendadas para aquele instante são avaliadas
   * juntas.
   */
  private settle(): void {
    this.changeCount.clear();
    this.oscillating.clear();
    let steps = 0;
    let capped = false;
    for (;;) {
      const t = this.nextTime();
      if (t === undefined) break;
      if (++steps > this.settleCap) {
        this.buckets.clear();
        capped = true;
        break;
      }
      const bucket = this.buckets.get(t)!;
      this.buckets.delete(t);
      this.time = t;
      for (const gate of bucket) this.evaluate(gate);
    }
    // Não convergiu: os nets que mais oscilaram são marcados como instáveis. Só
    // se considera oscilação quando o teto é atingido — um circuito que assenta
    // (mesmo com hazards transitórios) nunca é marcado.
    if (capped) {
      for (const [net, count] of this.changeCount) {
        if (count >= OSCILLATION_MIN_CHANGES) this.oscillating.add(net);
      }
    }
  }

  /** Atualiza o valor de um net e agenda as portas que o consomem. */
  private driveNet(net: string, value: boolean): void {
    if (this.value.get(net) === value) return;
    this.value.set(net, value);
    for (const consumer of this.fanout.get(net) ?? []) {
      this.schedule(consumer, this.time + GATE_DELAY);
    }
  }

  /**
   * Define o valor de uma entrada (estática) e propaga. No-op se o nó não for
   * uma entrada conhecida ou o valor não mudar.
   */
  setInput(nodeId: string, value: boolean): void {
    const net = this.inputNet.get(nodeId);
    if (!net) return;
    this.driveNet(net, value);
    this.settle();
  }

  /**
   * Liga/desliga o modo clock de uma entrada **sem reconstruir** o motor (e,
   * portanto, sem perder a memória de runtime). Idempotente; no-op se o nó não
   * for uma entrada conhecida.
   */
  setClock(nodeId: string, isClock: boolean): void {
    if (!this.inputNet.has(nodeId)) return;
    const i = this.clockInputs.indexOf(nodeId);
    if (isClock && i < 0) this.clockInputs.push(nodeId);
    else if (!isClock && i >= 0) this.clockInputs.splice(i, 1);
  }

  /**
   * Avança o tempo até o instante `now` (ms): leva cada entrada de clock ao seu
   * **nível** atual (onda quadrada ~1Hz via {@link clockValue}) e assenta o
   * circuito. Como o clock é nível, flip-flops mestre-escravo/edge-triggered
   * funcionam e a lógica combinacional acompanha o blink; um latch
   * level-triggered "ingênuo" (ex.: JK mínimo) oscila enquanto o clock fica
   * alto — comportamento fiel ao hardware.
   */
  advanceTo(now: number): void {
    const level = clockValue(now);
    for (const id of this.clockInputs) this.driveNet(this.inputNet.get(id)!, level);
    this.settle();
  }

  /**
   * Snapshot do estado atual no espaço de pinos/fios do circuito de **topo**,
   * pronto para a renderização. Reconstrói os valores de todos os pinos planos e
   * os traduz via os mapas do netlist compilado.
   */
  snapshot(): SignalState {
    const pinValues = new Map<string, boolean>();
    for (const { pin, net } of this.flatPins) {
      pinValues.set(pin, net ? (this.value.get(net) ?? false) : false);
    }
    return liftSignal(
      { pinValues, wireValues: new Map(), chipStates: new Map(), oscillating: this.oscillating },
      this.netlist,
    );
  }
}
