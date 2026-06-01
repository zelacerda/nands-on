import type { CircuitNode, CircuitState } from './model';

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
}

/** Chave estável de um pino para indexar valores de sinal. */
export function pinKey(nodeId: string, pinId: string): string {
  return `${nodeId}:${pinId}`;
}

/** Resolve a topologia interna de um chip a partir do nó instância (via `defId`). */
export type ChipResolver = (node: CircuitNode) => CircuitState | undefined;

/**
 * Avalia um circuito de forma combinacional. Os nós `input` fornecem seu
 * `value` como fonte; a NAND calcula `!(in0 && in1)`; os fios transportam o
 * valor do pino de saída para o de entrada. A propagação é iterativa
 * (relaxação) até estabilizar, com um teto de iterações que garante término
 * mesmo na presença de ciclos (fora de escopo, mas defensivo).
 */
export function simulate(state: CircuitState, resolveChip?: ChipResolver): SignalState {
  return simulateWith(state, (node) => node.value === true, resolveChip);
}

/**
 * Núcleo da avaliação. `inputValueOf` informa o valor de cada nó `input` — no
 * topo vem de `node.value`; dentro de um chip, vem dos pinos externos mapeados.
 */
function simulateWith(
  state: CircuitState,
  inputValueOf: (node: CircuitNode) => boolean,
  resolveChip?: ChipResolver,
): SignalState {
  const pinValues = new Map<string, boolean>();
  for (const node of state.nodes) {
    for (const pin of node.pins) pinValues.set(pinKey(node.id, pin.id), false);
  }

  const getPin = (nodeId: string, pinId: string): boolean =>
    pinValues.get(pinKey(nodeId, pinId)) ?? false;
  const setPin = (nodeId: string, pinId: string, v: boolean): boolean => {
    const key = pinKey(nodeId, pinId);
    const changed = pinValues.get(key) !== v;
    pinValues.set(key, v);
    return changed;
  };

  // Teto de iterações proporcional à profundidade máxima possível do circuito.
  const maxIter = state.nodes.length + 2;
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;

    // 1. Recalcula os pinos de saída de cada nó a partir das suas entradas.
    for (const node of state.nodes) {
      changed = computeNodeOutputs(node, getPin, setPin, inputValueOf, resolveChip) || changed;
    }

    // 2. Propaga: cada pino de entrada recebe o valor do pino de saída ligado.
    for (const wire of state.wires) {
      const v = getPin(wire.from.nodeId, wire.from.pinId);
      changed = setPin(wire.to.nodeId, wire.to.pinId, v) || changed;
    }

    if (!changed) break;
  }

  const wireValues = new Map<string, boolean>();
  for (const wire of state.wires) {
    wireValues.set(wire.id, getPin(wire.from.nodeId, wire.from.pinId));
  }

  return { pinValues, wireValues };
}

/** Escreve os pinos de saída de um nó a partir dos seus pinos de entrada. */
function computeNodeOutputs(
  node: CircuitNode,
  getPin: (nodeId: string, pinId: string) => boolean,
  setPin: (nodeId: string, pinId: string, v: boolean) => boolean,
  inputValueOf: (node: CircuitNode) => boolean,
  resolveChip?: ChipResolver,
): boolean {
  switch (node.type) {
    case 'input':
      return setPin(node.id, 'out', inputValueOf(node));
    case 'output':
      return false; // sem pinos de saída
    case 'nand': {
      const out = !(getPin(node.id, 'in0') && getPin(node.id, 'in1'));
      return setPin(node.id, 'out', out);
    }
    case 'chip':
      return computeChipOutputs(node, getPin, setPin, resolveChip);
  }
}

/** Placeholder de avaliação de chip; implementado na Fase 3. */
function computeChipOutputs(
  _node: CircuitNode,
  _getPin: (nodeId: string, pinId: string) => boolean,
  _setPin: (nodeId: string, pinId: string, v: boolean) => boolean,
  _resolveChip?: ChipResolver,
): boolean {
  return false;
}
