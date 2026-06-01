import type { Camera, Vec2 } from './camera';
import { type CircuitNode, type NodeType, nodeSize, pinWorldPos } from './model';
import type { CircuitStore } from './store';
import { type SignalState, pinKey } from './simulator';

/** Raio do pino, em unidades de mundo. */
export const PIN_RADIUS = 7;

const COLOR = {
  ioBody: '#2d333b',
  ioStroke: '#4a525e',
  logicBody: '#3a4360',
  logicStroke: '#5a68a0',
  label: '#d8dee9',
  pinIn: '#7aa2f7',
  pinOut: '#e0af68',
  wire: '#9aa5b1',
  /** Sinal ligado (1): destaca pinos, fios e o corpo de entradas/saídas acesas. */
  signalOn: '#ffd23f',
  signalOnStroke: '#ffe27a',
  signalOnLabel: '#1b1f17',
} as const;

/** Verdadeiro se o nó deve aparecer "aceso" segundo o estado de sinal. */
function nodeLit(node: CircuitNode, signal: SignalState): boolean {
  if (node.type === 'input') return signal.pinValues.get(pinKey(node.id, 'out')) ?? false;
  if (node.type === 'output') return signal.pinValues.get(pinKey(node.id, 'in')) ?? false;
  return false;
}

/**
 * Componentes lógicos (NAND e instâncias de chip) compartilham uma cor de corpo,
 * distinta da cor dos pinos de I/O (Entrada/Saída), para diferenciar visualmente
 * o que processa sinal do que apenas o injeta/observa.
 */
function isLogicNode(type: NodeType): boolean {
  return type === 'nand' || type === 'chip';
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

/** Rótulo central exibido em cada tipo de nó. */
function nodeLabel(node: CircuitNode): string {
  switch (node.type) {
    case 'nand':
      return 'NAND';
    case 'input':
      return 'IN';
    case 'output':
      return 'OUT';
    case 'chip':
      return node.name ?? 'CHIP';
  }
}

/** Desenha um nó (porta, pino de I/O ou chip) em coordenadas de tela. */
export function drawNode(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  node: CircuitNode,
  signal?: SignalState,
): void {
  const { w, h } = nodeSize(node);
  const origin = cam.worldToScreen(node.pos);
  const sw = w * cam.zoom;
  const sh = h * cam.zoom;

  const logic = isLogicNode(node.type);
  const lit = signal ? nodeLit(node, signal) : false;
  if (!logic && lit) {
    ctx.fillStyle = COLOR.signalOn;
    ctx.strokeStyle = COLOR.signalOnStroke;
  } else {
    ctx.fillStyle = logic ? COLOR.logicBody : COLOR.ioBody;
    ctx.strokeStyle = logic ? COLOR.logicStroke : COLOR.ioStroke;
  }
  ctx.lineWidth = Math.max(2, 2.5 * cam.zoom);
  // Entradas e saídas são redondas; portas e chips, retângulos arredondados.
  if (!logic) {
    ctx.beginPath();
    ctx.arc(origin.x + sw / 2, origin.y + sh / 2, Math.min(sw, sh) / 2, 0, Math.PI * 2);
  } else {
    roundedRect(ctx, origin.x, origin.y, sw, sh, 8 * cam.zoom);
  }
  ctx.fill();
  ctx.stroke();

  // Rótulo central (escurecido quando o corpo está aceso, para contraste).
  const label = nodeLabel(node);
  ctx.fillStyle = lit && !logic ? COLOR.signalOnLabel : COLOR.label;
  ctx.font = `${Math.max(9, 12 * cam.zoom)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, origin.x + sw / 2, origin.y + sh / 2);

  // Pinos (verde quando carregam sinal ligado).
  for (const pin of node.pins) {
    const p = cam.worldToScreen(pinWorldPos(node, pin));
    const on = signal?.pinValues.get(pinKey(node.id, pin.id)) ?? false;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PIN_RADIUS * cam.zoom, 0, Math.PI * 2);
    ctx.fillStyle = on ? COLOR.signalOn : pin.kind === 'in' ? COLOR.pinIn : COLOR.pinOut;
    ctx.fill();
  }
}

/** Desenha uma linha de fio entre dois pontos de tela (curva de Bézier horizontal). */
export function drawWireSegment(ctx: CanvasRenderingContext2D, from: Vec2, to: Vec2): void {
  const dx = Math.max(30, Math.abs(to.x - from.x) * 0.5);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.bezierCurveTo(from.x + dx, from.y, to.x - dx, to.y, to.x, to.y);
  ctx.stroke();
}

/** Desenha todos os fios do circuito (verde quando transportam sinal ligado). */
export function drawWires(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  store: CircuitStore,
  signal?: SignalState,
): void {
  ctx.lineWidth = Math.max(2.5, 3.5 * cam.zoom);
  for (const wire of store.listWires()) {
    const from = store.pinPos(wire.from);
    const to = store.pinPos(wire.to);
    if (!from || !to) continue;
    ctx.strokeStyle = signal?.wireValues.get(wire.id) ? COLOR.signalOn : COLOR.wire;
    drawWireSegment(ctx, cam.worldToScreen(from), cam.worldToScreen(to));
  }
}

/** Desenha o circuito inteiro: fios primeiro (atrás), depois os nós. */
export function drawCircuit(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  store: CircuitStore,
  signal?: SignalState,
): void {
  drawWires(ctx, cam, store, signal);
  for (const node of store.listNodes()) {
    drawNode(ctx, cam, node, signal);
  }
}

const COLOR_SELECT = '#7aa2f7';
const COLOR_VALID = '#9ece6a';
const COLOR_INVALID = '#f7768e';

/** Realça um nó selecionado com um contorno. */
export function drawNodeHighlight(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  node: CircuitNode,
): void {
  const { w, h } = nodeSize(node);
  const origin = cam.worldToScreen(node.pos);
  const pad = 3 * cam.zoom;
  const sw = w * cam.zoom;
  const sh = h * cam.zoom;
  ctx.strokeStyle = COLOR_SELECT;
  ctx.lineWidth = Math.max(2.5, 3 * cam.zoom);
  // O realce acompanha o formato do nó: círculo para I/O, retângulo para o resto.
  if (!isLogicNode(node.type)) {
    ctx.beginPath();
    ctx.arc(origin.x + sw / 2, origin.y + sh / 2, Math.min(sw, sh) / 2 + pad, 0, Math.PI * 2);
  } else {
    roundedRect(ctx, origin.x - pad, origin.y - pad, sw + 2 * pad, sh + 2 * pad, 10 * cam.zoom);
  }
  ctx.stroke();
}

/** Realça um fio selecionado. */
export function drawWireHighlight(ctx: CanvasRenderingContext2D, from: Vec2, to: Vec2): void {
  ctx.strokeStyle = COLOR_SELECT;
  ctx.lineWidth = 6;
  drawWireSegment(ctx, from, to);
}

/**
 * Desenha o "fio fantasma" durante o arrasto de criação de conexão.
 * `valid` controla a cor (verde válido / vermelho inválido).
 */
export function drawGhostWire(
  ctx: CanvasRenderingContext2D,
  from: Vec2,
  to: Vec2,
  valid: boolean,
): void {
  ctx.save();
  ctx.strokeStyle = valid ? COLOR_VALID : COLOR_INVALID;
  ctx.lineWidth = 3.5;
  ctx.setLineDash([6, 4]);
  drawWireSegment(ctx, from, to);
  ctx.restore();
}
