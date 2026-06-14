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
   * desligado. Ignorado quando {@link CircuitNode.clock} é `true`.
   */
  value?: boolean;
  /**
   * Para nós `input`: quando `true`, a entrada está em **modo clock** — sua saída
   * oscila automaticamente com o tempo (ver `clockValue`), ignorando `value`. O
   * usuário cicla OFF → ON → CLK → OFF tocando a entrada selecionada. Um clock
   * encapsulado num chip permanece como fonte interna (não vira pino externo).
   */
  clock?: boolean;
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
  /**
   * Deslocamento manual da "barra" intermediária do traçado ortogonal, relativo
   * à posição padrão (meio do caminho), em unidades de mundo. Interpretado no
   * eixo X no caso Z (`out.x < in.x`) e no eixo Y no caso S. `undefined`/`0` =
   * traçado padrão. Ver `wirePath` em `wire.ts`.
   */
  barOffset?: number;
}

/** Estado serializável do circuito (útil para persistência futura). */
export interface CircuitState {
  nodes: CircuitNode[];
  wires: Wire[];
}

/**
 * Espaçamento vertical entre pinos adjacentes de um mesmo lado, em unidades de
 * mundo. Múltiplo de GRID_SIZE (16) para que, com o nó snapado, os pinos caiam
 * em cruzamentos da grade.
 */
export const PIN_SPACING = 32;

/** Largura fixa de todo corpo retangular (NAND e chips), em unidades de mundo. */
export const CHIP_WIDTH = 128;

/**
 * Posições verticais (offset Y) de `count` pinos centralizados num corpo de
 * altura `h`, espaçados de {@link PIN_SPACING}. Com `h = max(nIn, nOut) * 32`,
 * todos os valores resultam em múltiplos de GRID_SIZE.
 */
export function pinYs(count: number, h: number): number[] {
  if (count <= 0) return [];
  const span = (count - 1) * PIN_SPACING;
  const start = (h - span) / 2;
  return Array.from({ length: count }, (_, i) => start + i * PIN_SPACING);
}

/** Altura de um corpo retangular dado o nº de entradas/saídas. Múltiplo de 32. */
export function bodyHeight(inputCount: number, outputCount: number): number {
  return Math.max(inputCount, outputCount, 1) * PIN_SPACING;
}

/** Dimensões fixas das primitivas, em unidades de mundo. */
export const NODE_SIZE: Record<PrimitiveType, { w: number; h: number }> = {
  // Corpo retangular alinhado à grade: largura fixa, altura = max(in,out) * 32.
  nand: { w: CHIP_WIDTH, h: bodyHeight(2, 1) },
  input: { w: 40, h: 40 },
  output: { w: 40, h: 40 },
};

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
 * Dimensão de uma caixa de chip. A largura é fixa ({@link CHIP_WIDTH}) — nomes
 * extensos são truncados na renderização — e a altura segue
 * {@link bodyHeight} (`max(nIn, nOut) * 32`), garantindo pinos em cruzamentos da
 * grade quando o nó está snapado.
 */
export function chipSize(inputCount: number, outputCount: number): { w: number; h: number } {
  return { w: CHIP_WIDTH, h: bodyHeight(inputCount, outputCount) };
}

/** Dimensão de um nó qualquer (primitiva ou chip). */
export function nodeSize(node: CircuitNode): { w: number; h: number } {
  if (node.type === 'chip') {
    const inCount = node.pins.filter((p) => p.kind === 'in').length;
    const outCount = node.pins.filter((p) => p.kind === 'out').length;
    return chipSize(inCount, outCount);
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
    case 'nand': {
      const ins = pinYs(2, h); // entradas: 2 posições
      const out = pinYs(1, h); // saída: 1 posição
      return [
        { id: 'in0', kind: 'in', offset: { x: 0, y: ins[0]! } },
        { id: 'in1', kind: 'in', offset: { x: 0, y: ins[1]! } },
        { id: 'out', kind: 'out', offset: { x: w, y: out[0]! } },
      ];
    }
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
  // Mesma altura/largura usadas por nodeSize, para que a borda direita (onde
  // ficam os pinos de saída) coincida exatamente com a largura do corpo, e os
  // pinos fiquem espaçados de PIN_SPACING (caindo em cruzamentos da grade).
  const { w, h } = chipSize(def.inputCount, def.outputCount);
  const pins: Pin[] = [];
  const inYs = pinYs(def.inputCount, h);
  const outYs = pinYs(def.outputCount, h);
  for (let i = 0; i < def.inputCount; i++) {
    pins.push({
      id: `in${i}`,
      kind: 'in',
      offset: { x: 0, y: inYs[i]! },
      label: def.inputLabels?.[i],
    });
  }
  for (let i = 0; i < def.outputCount; i++) {
    pins.push({
      id: `out${i}`,
      kind: 'out',
      offset: { x: w, y: outYs[i]! },
      label: def.outputLabels?.[i],
    });
  }
  return pins;
}

/** Posição absoluta (mundo) de um pino, dada a posição do seu nó. */
export function pinWorldPos(node: CircuitNode, pin: Pin): Vec2 {
  return { x: node.pos.x + pin.offset.x, y: node.pos.y + pin.offset.y };
}
