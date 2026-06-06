import { type CompiledNetlist, liftSignal } from './netlist';
import { CLOCK_PERIOD_MS, clockValue, pinKey, type SignalState } from './simulator';

/** Atraso de propagação de uma porta, em ticks de tempo simulado. */
const GATE_DELAY = 1;

/**
 * Largura do pulso de clock, em ticks. Curta o bastante para o JK
 * level-triggered mínimo inverter **uma só vez** (o laço de re-toggle leva mais
 * ticks que isto — calibrado: o JK mínimo alterna com ≤2 e trava com ≥3), e
 * longa o bastante para um latch/mestre-escravo capturar o dado na borda
 * (verificado robusto para qualquer largura). Ver engine.clock.test.ts.
 */
const CLOCK_PULSE_TICKS = 2;

/**
 * Limite de pulsos de clock disparados numa única chamada de `advanceTo` quando
 * muitos ciclos passaram (ex.: aba em segundo plano). Evita travar processando
 * milhares de pulsos atrasados; o clock apenas "continua andando".
 */
const MAX_CATCHUP_PULSES = 4;

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
  /** nodeIds de entradas em modo clock (fontes de pulso). */
  private readonly clockInputs: string[] = [];
  /** Valor de **exibição** de cada entrada de clock (nível ~1Hz, p/ o blink). */
  private readonly clockDisplay = new Map<string, boolean>();
  /** Índice do último ciclo de clock processado (detecção de borda de subida). */
  private lastEdgeIndex: number | undefined;
  /** Todos os pinos planos e o net cujo valor cada um carrega (nulo = false). */
  private readonly flatPins: { pin: string; net: string | null }[] = [];
  /** Eventos pendentes: tempo → conjunto de índices de porta a reavaliar. */
  private readonly buckets = new Map<number, Set<number>>();
  private time = 0;
  private readonly settleCap: number;
  private readonly pulseTicks: number;

  constructor(
    private readonly netlist: CompiledNetlist,
    options: { pulseTicks?: number } = {},
  ) {
    this.pulseTicks = options.pulseTicks ?? CLOCK_PULSE_TICKS;
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
        if (node.clock) {
          this.clockInputs.push(node.id);
          this.clockDisplay.set(node.id, false);
        }
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
   * Processa a fila até esvaziar (ou `maxTime`, se dado), em ordem de tempo, ou
   * até atingir o teto de delta-cycles (guarda contra oscilação). Cada "tempo" é
   * um delta-cycle: todas as portas agendadas para aquele instante são avaliadas
   * juntas. Com `maxTime`, para após processar os eventos até esse instante e
   * fixa `time = maxTime` (usado para janelar o pulso de clock).
   */
  private settle(maxTime?: number): void {
    let steps = 0;
    for (;;) {
      const t = this.nextTime();
      if (t === undefined || (maxTime !== undefined && t > maxTime)) break;
      if (++steps > this.settleCap) {
        this.buckets.clear();
        break;
      }
      const bucket = this.buckets.get(t)!;
      this.buckets.delete(t);
      this.time = t;
      for (const gate of bucket) this.evaluate(gate);
    }
    if (maxTime !== undefined && maxTime > this.time) this.time = maxTime;
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
   * Dispara um pulso de clock: leva todas as entradas de clock a 1 por uma
   * janela curta (`CLOCK_PULSE_TICKS`), depois a 0, assentando o circuito. A
   * janela estreita faz o JK level-triggered inverter uma única vez, em vez de
   * oscilar enquanto o clock fica alto.
   */
  private pulseClocks(): void {
    if (this.clockInputs.length === 0) return;
    const start = this.time;
    for (const id of this.clockInputs) this.driveNet(this.inputNet.get(id)!, true);
    this.settle(start + this.pulseTicks);
    for (const id of this.clockInputs) this.driveNet(this.inputNet.get(id)!, false);
    this.settle();
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
   * for uma entrada conhecida. Uma entrada que vira clock passa a repousar em 0
   * entre pulsos.
   */
  setClock(nodeId: string, isClock: boolean): void {
    const net = this.inputNet.get(nodeId);
    if (!net) return;
    const isMember = this.clockDisplay.has(nodeId);
    if (isClock && !isMember) {
      this.clockInputs.push(nodeId);
      this.clockDisplay.set(nodeId, false);
      this.driveNet(net, false);
      this.settle();
    } else if (!isClock && isMember) {
      const i = this.clockInputs.indexOf(nodeId);
      if (i >= 0) this.clockInputs.splice(i, 1);
      this.clockDisplay.delete(nodeId);
    }
  }

  /**
   * Avança o tempo até o instante `now` (ms): atualiza o nível de exibição dos
   * clocks (blink ~1Hz) e dispara um pulso de lógica a cada **borda de subida**
   * cruzada desde a última chamada (limitado por {@link MAX_CATCHUP_PULSES}).
   */
  advanceTo(now: number): void {
    for (const id of this.clockInputs) this.clockDisplay.set(id, clockValue(now));
    const edgeIndex = Math.floor(now / CLOCK_PERIOD_MS);
    if (this.lastEdgeIndex === undefined) {
      this.lastEdgeIndex = edgeIndex; // primeira chamada: sincroniza sem disparar
    } else if (edgeIndex > this.lastEdgeIndex) {
      const pulses = Math.min(edgeIndex - this.lastEdgeIndex, MAX_CATCHUP_PULSES);
      for (let i = 0; i < pulses; i++) this.pulseClocks();
      this.lastEdgeIndex = edgeIndex;
    }
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
    // Entradas de clock exibem o nível ~1Hz (blink), não o pulso de lógica.
    for (const id of this.clockInputs) {
      pinValues.set(pinKey(id, 'out'), this.clockDisplay.get(id) ?? false);
    }
    return liftSignal({ pinValues, wireValues: new Map(), chipStates: new Map() }, this.netlist);
  }
}
