import type { CircuitNode, CircuitState, Wire } from './model';

/**
 * Resultado de uma avaliação do circuito. Os valores são indexados por chaves
 * estáveis de pino (`nodeId:pinId`) e por id de fio, para que a renderização
 * possa colorir pinos, fios e acender entradas/saídas.
 */
export interface SignalState {
  /** Valor booleano de cada pino (entrada e saída), por `pinKey`. */
  pinValues: Map<string, boolean>;
  /** Valor booleano transportado por cada fio, por id de fio. */
  wireValues: Map<string, boolean>;
  /**
   * Estado interno de cada instância de chip, por id do nó instância. Preserva
   * a memória de runtime de chips que contêm realimentação (ex.: um latch
   * encapsulado), permitindo que o estado interno persista entre avaliações.
   */
  chipStates: Map<string, SignalState>;
}

/** Chave estável de um pino para indexar valores de sinal. */
export function pinKey(nodeId: string, pinId: string): string {
  return `${nodeId}:${pinId}`;
}

/**
 * Período do ciclo de clock, em ms. Fixo nesta versão (1s: 0,5s ligado, 0,5s
 * desligado); ponto único a alterar quando o intervalo virar configurável.
 */
export const CLOCK_PERIOD_MS = 1000;

/**
 * Estado (ligado/desligado) de um clock no instante `now` (ms). Liga na primeira
 * metade do período e desliga na segunda. A fase deriva do tempo absoluto, então
 * todos os clocks ficam em sincronia.
 */
export function clockValue(now: number): boolean {
  return Math.floor(now / (CLOCK_PERIOD_MS / 2)) % 2 === 0;
}

/** Resolve a topologia interna de um chip a partir do nó instância (via `defId`). */
export type ChipResolver = (node: CircuitNode) => CircuitState | undefined;

/**
 * Avalia um circuito. Os nós `input` fornecem seu `value` como fonte; a NAND
 * calcula `!(in0 && in1)`; os fios transportam o valor do pino de saída para o
 * de entrada. A propagação é iterativa (relaxação) até estabilizar.
 *
 * Suporta circuitos sequenciais com realimentação (ex.: SR Latch): o estado
 * anterior (`prev`) é preservado entre avaliações, dando ao circuito uma
 * memória de runtime. Para circuitos puramente combinacionais, `prev` é
 * irrelevante — o resultado depende apenas das entradas.
 *
 * `now` (ms) é o instante da avaliação, usado pelos nós `clock` para oscilar com
 * o tempo. Padrão `0` para chamadas combinacionais/sem clock (ex.: testes).
 */
export function simulate(
  state: CircuitState,
  resolveChip?: ChipResolver,
  prev?: SignalState,
  now = 0,
): SignalState {
  return simulateWith(state, (node) => node.value === true, resolveChip, prev, now);
}

/**
 * Núcleo da avaliação. `inputValueOf` informa o valor de cada nó `input` — no
 * topo vem de `node.value`; dentro de um chip, vem dos pinos externos mapeados.
 */
function simulateWith(
  state: CircuitState,
  inputValueOf: (node: CircuitNode) => boolean,
  resolveChip?: ChipResolver,
  prev?: SignalState,
  now = 0,
): SignalState {
  // Inicializa cada pino com seu valor anterior (memória), ou `false` quando o
  // nó/pino é novo. É o que permite a um latch manter o estado entre frames.
  const pinValues = new Map<string, boolean>();
  for (const node of state.nodes) {
    for (const pin of node.pins) {
      const key = pinKey(node.id, pin.id);
      pinValues.set(key, prev?.pinValues.get(key) ?? false);
    }
  }

  const getPin = (nodeId: string, pinId: string): boolean =>
    pinValues.get(pinKey(nodeId, pinId)) ?? false;
  const setPin = (nodeId: string, pinId: string, v: boolean): boolean => {
    const key = pinKey(nodeId, pinId);
    const changed = pinValues.get(key) !== v;
    pinValues.set(key, v);
    return changed;
  };

  // Fios indexados pelo nó de origem, para propagar logo após computar o nó.
  const wiresFrom = new Map<string, Wire[]>();
  for (const wire of state.wires) {
    const list = wiresFrom.get(wire.from.nodeId);
    if (list) list.push(wire);
    else wiresFrom.set(wire.from.nodeId, [wire]);
  }

  // Estado interno acumulado de cada instância de chip neste frame.
  const chipStates = new Map<string, SignalState>();

  // Teto de iterações proporcional ao tamanho do circuito; garante término
  // mesmo num estado metaestável (oscilação física, ex.: latch em S=R=1→0,0).
  const maxIter = state.nodes.length + 2;
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;

    // Avalia cada nó e propaga suas saídas imediatamente pelos fios que partem
    // dele. Essa atualização entrelaçada (em vez de "todas as saídas, depois
    // todos os fios") cria a assimetria que faz a realimentação convergir a um
    // estado estável, em vez de oscilar.
    for (const node of state.nodes) {
      changed =
        computeNodeOutputs(
          node,
          getPin,
          setPin,
          inputValueOf,
          resolveChip,
          prev,
          chipStates,
          now,
        ) || changed;
      for (const wire of wiresFrom.get(node.id) ?? []) {
        const v = getPin(wire.from.nodeId, wire.from.pinId);
        changed = setPin(wire.to.nodeId, wire.to.pinId, v) || changed;
      }
    }

    if (!changed) break;
  }

  const wireValues = new Map<string, boolean>();
  for (const wire of state.wires) {
    wireValues.set(wire.id, getPin(wire.from.nodeId, wire.from.pinId));
  }

  return { pinValues, wireValues, chipStates };
}

/** Escreve os pinos de saída de um nó a partir dos seus pinos de entrada. */
function computeNodeOutputs(
  node: CircuitNode,
  getPin: (nodeId: string, pinId: string) => boolean,
  setPin: (nodeId: string, pinId: string, v: boolean) => boolean,
  inputValueOf: (node: CircuitNode) => boolean,
  resolveChip: ChipResolver | undefined,
  prev: SignalState | undefined,
  chipStates: Map<string, SignalState>,
  now: number,
): boolean {
  switch (node.type) {
    case 'input':
      // Em modo clock, a entrada oscila com o tempo (fonte autônoma); caso
      // contrário, emite seu estado estático (ou, dentro de um chip, o valor do
      // pino externo mapeado por `inputValueOf`).
      return setPin(node.id, 'out', node.clock ? clockValue(now) : inputValueOf(node));
    case 'output':
      return false; // sem pinos de saída
    case 'nand': {
      const out = !(getPin(node.id, 'in0') && getPin(node.id, 'in1'));
      return setPin(node.id, 'out', out);
    }
    case 'chip':
      return computeChipOutputs(node, getPin, setPin, resolveChip, prev, chipStates, now);
  }
}

/**
 * Avalia uma instância de chip expandindo sua topologia interna. Os pinos
 * externos de entrada (`in0`, `in1`, …) alimentam, em ordem, os nós `input`
 * internos (ordenados pela posição vertical, como na captura); os nós `output`
 * internos (mesma ordenação) preenchem os pinos externos de saída (`out0`, …).
 */
function computeChipOutputs(
  node: CircuitNode,
  getPin: (nodeId: string, pinId: string) => boolean,
  setPin: (nodeId: string, pinId: string, v: boolean) => boolean,
  resolveChip: ChipResolver | undefined,
  prev: SignalState | undefined,
  chipStates: Map<string, SignalState>,
  now: number,
): boolean {
  const internal = resolveChip?.(node);
  if (!internal) return false;

  const byY = (a: CircuitNode, b: CircuitNode) => a.pos.y - b.pos.y;
  // Entradas em modo clock não recebem pino externo — são fontes internas que
  // oscilam pelo tempo —, então não entram no mapeamento dos pinos de entrada.
  const inNodes = internal.nodes.filter((n) => n.type === 'input' && !n.clock).sort(byY);
  const outNodes = internal.nodes.filter((n) => n.type === 'output').sort(byY);

  // Valores das entradas externas, na ordem dos pinos `in` do nó instância.
  const externalIns = node.pins.filter((p) => p.kind === 'in');
  const inputValues = new Map<string, boolean>();
  inNodes.forEach((inNode, i) => {
    const pin = externalIns[i];
    inputValues.set(inNode.id, pin ? getPin(node.id, pin.id) : false);
  });

  // Continua do estado interno já computado neste frame, ou — na primeira vez —
  // do estado do frame anterior, preservando a memória de latches internos.
  const innerPrev = chipStates.get(node.id) ?? prev?.chipStates.get(node.id);
  const result = simulateWith(
    internal,
    (n) => inputValues.get(n.id) === true,
    resolveChip,
    innerPrev,
    now, // mesmo instante: clocks aninhados oscilam junto com o circuito externo
  );
  chipStates.set(node.id, result);

  // Mapeia as saídas internas para os pinos externos `out` na mesma ordem.
  const externalOuts = node.pins.filter((p) => p.kind === 'out');
  let changed = false;
  outNodes.forEach((outNode, i) => {
    const pin = externalOuts[i];
    if (!pin) return;
    const v = result.pinValues.get(pinKey(outNode.id, 'in')) ?? false;
    changed = setPin(node.id, pin.id, v) || changed;
  });
  return changed;
}
