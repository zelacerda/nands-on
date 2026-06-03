import type { Vec2 } from './camera';

/** Tipos primitivos com pinos e dimensões fixas. */
export type PrimitiveType = 'nand' | 'input' | 'output';

/** Tipos de nó disponíveis: primitivas e instâncias de chip. */
export type NodeType = PrimitiveType | 'chip';

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
  /**
   * Rótulo curto desenhado junto ao pino (ex.: nome de uma entrada/saída de um
   * chip). Opcional; pinos sem rótulo não exibem texto.
   */
  label?: string;
}

/** Nó do circuito (porta, pino de I/O ou instância de chip). */
export interface CircuitNode {
  id: string;
  type: NodeType;
  pos: Vec2;
  pins: Pin[];
  /** Para nós `chip`: id da definição na biblioteca. */
  defId?: string;
  /** Para nós `chip`: nome exibido na caixa. */
  name?: string;
  /**
   * Para nós `input`: estado booleano atual (ligado/desligado). Alternado pelo
   * usuário e usado como fonte de sinal pela simulação. `undefined` equivale a
   * desligado.
   */
  value?: boolean;
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

/** Dimensões fixas das primitivas, em unidades de mundo. */
export const NODE_SIZE: Record<PrimitiveType, { w: number; h: number }> = {
  nand: { w: 72, h: 56 },
  input: { w: 40, h: 40 },
  output: { w: 40, h: 40 },
};

/** Parâmetros de layout dos chips. */
export const CHIP_MIN_W = 90;
export const CHIP_PIN_SPACING = 22;
export const CHIP_PAD_Y = 16;
/** Padding horizontal e largura média estimada por caractere do nome do chip. */
export const CHIP_PAD_X = 14;
export const CHIP_NAME_CHAR_W = 8;

/**
 * Definição de um chip reutilizável: nome, número de pinos externos e a
 * topologia interna capturada (preservada para a simulação futura).
 */
export interface ChipDefinition {
  id: string;
  name: string;
  inputCount: number;
  outputCount: number;
  /**
   * Rótulos dos pinos de entrada/saída, na ordem (de cima para baixo). Derivados
   * dos nomes dos nós `input`/`output` no momento da captura. Posições sem nome
   * ficam com string vazia.
   */
  inputLabels?: string[];
  outputLabels?: string[];
  internal: CircuitState;
}

/** Rótulos padrão dos pinos do chip primitivo NAND: A (topo), B (base), Q (saída). */
export const NAND_PIN_LABELS: Record<string, string> = {
  in0: 'A',
  in1: 'B',
  out: 'Q',
};

/**
 * Rótulo curto a desenhar junto a um pino. Para o NAND, são os rótulos padrão
 * A/B/Q; para instâncias de chip, o rótulo capturado do pino. Demais nós (I/O)
 * não exibem rótulo de pino (seu nome aparece no corpo). `undefined` quando não
 * há rótulo a exibir.
 */
export function pinLabel(node: CircuitNode, pin: Pin): string | undefined {
  if (node.type === 'nand') return NAND_PIN_LABELS[pin.id];
  if (node.type === 'chip') return pin.label || undefined;
  return undefined;
}

/**
 * Dimensão de uma caixa de chip a partir do nº de pinos de entrada/saída. A
 * largura também acomoda o nome do chip (estimado por nº de caracteres), de
 * modo que nomes longos não estourem o corpo.
 */
export function chipSize(
  inputCount: number,
  outputCount: number,
  name?: string,
): { w: number; h: number } {
  const rows = Math.max(inputCount, outputCount, 1);
  const h = Math.max(NODE_SIZE.nand.h, rows * CHIP_PIN_SPACING + CHIP_PAD_Y);
  const nameW = name ? name.length * CHIP_NAME_CHAR_W + 2 * CHIP_PAD_X : 0;
  return { w: Math.max(CHIP_MIN_W, nameW), h };
}

/** Dimensão de um nó qualquer (primitiva ou chip). */
export function nodeSize(node: CircuitNode): { w: number; h: number } {
  if (node.type === 'chip') {
    const inCount = node.pins.filter((p) => p.kind === 'in').length;
    const outCount = node.pins.filter((p) => p.kind === 'out').length;
    return chipSize(inCount, outCount, node.name);
  }
  return NODE_SIZE[node.type];
}

/**
 * Cria os pinos de uma primitiva. As posições são fixas e derivadas das
 * dimensões em {@link NODE_SIZE}.
 */
export function createPins(type: PrimitiveType): Pin[] {
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

/**
 * Pinos de uma instância de chip: N entradas à esquerda e M saídas à direita,
 * distribuídas verticalmente de forma uniforme.
 */
export function chipInstancePins(def: ChipDefinition): Pin[] {
  const { w, h } = chipSize(def.inputCount, def.outputCount, def.name);
  const pins: Pin[] = [];
  for (let i = 0; i < def.inputCount; i++) {
    pins.push({
      id: `in${i}`,
      kind: 'in',
      offset: { x: 0, y: (h * (i + 1)) / (def.inputCount + 1) },
      label: def.inputLabels?.[i],
    });
  }
  for (let i = 0; i < def.outputCount; i++) {
    pins.push({
      id: `out${i}`,
      kind: 'out',
      offset: { x: w, y: (h * (i + 1)) / (def.outputCount + 1) },
      label: def.outputLabels?.[i],
    });
  }
  return pins;
}

/** Posição absoluta (mundo) de um pino, dada a posição do seu nó. */
export function pinWorldPos(node: CircuitNode, pin: Pin): Vec2 {
  return { x: node.pos.x + pin.offset.x, y: node.pos.y + pin.offset.y };
}
