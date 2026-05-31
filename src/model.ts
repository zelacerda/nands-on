import type { Vec2 } from './camera';

/** Tipos de nó disponíveis no v1: porta NAND e pinos de I/O. */
export type NodeType = 'nand' | 'input' | 'output';

/** Direção de um pino em relação ao nó. */
export type PinKind = 'in' | 'out';

/**
 * Pino de um nó. `offset` é a posição do pino relativa à origem (canto
 * superior esquerdo) do nó, em unidades de mundo.
 */
export interface Pin {
  id: string;
  kind: PinKind;
  offset: Vec2;
}

/** Nó do circuito (porta ou pino de I/O), com posição de mundo e seus pinos. */
export interface CircuitNode {
  id: string;
  type: NodeType;
  pos: Vec2;
  pins: Pin[];
}

/** Referência a um pino específico de um nó. */
export interface PinRef {
  nodeId: string;
  pinId: string;
}

/** Fio ligando um pino de saída (`from`) a um pino de entrada (`to`). */
export interface Wire {
  id: string;
  from: PinRef;
  to: PinRef;
}

/** Estado serializável do circuito (útil para persistência futura). */
export interface CircuitState {
  nodes: CircuitNode[];
  wires: Wire[];
}

/** Dimensões de cada tipo de nó, em unidades de mundo. */
export const NODE_SIZE: Record<NodeType, { w: number; h: number }> = {
  nand: { w: 72, h: 56 },
  input: { w: 40, h: 40 },
  output: { w: 40, h: 40 },
};

/**
 * Cria os pinos de um nó conforme o seu tipo. As posições são fixas e
 * derivadas das dimensões em {@link NODE_SIZE}.
 */
export function createPins(type: NodeType): Pin[] {
  const { w, h } = NODE_SIZE[type];
  switch (type) {
    case 'nand':
      return [
        { id: 'in0', kind: 'in', offset: { x: 0, y: h * 0.3 } },
        { id: 'in1', kind: 'in', offset: { x: 0, y: h * 0.7 } },
        { id: 'out', kind: 'out', offset: { x: w, y: h * 0.5 } },
      ];
    case 'input':
      return [{ id: 'out', kind: 'out', offset: { x: w, y: h * 0.5 } }];
    case 'output':
      return [{ id: 'in', kind: 'in', offset: { x: 0, y: h * 0.5 } }];
  }
}

/** Posição absoluta (mundo) de um pino, dada a posição do seu nó. */
export function pinWorldPos(node: CircuitNode, pin: Pin): Vec2 {
  return { x: node.pos.x + pin.offset.x, y: node.pos.y + pin.offset.y };
}
