import type { Camera, Vec2 } from './camera';
import { type CircuitNode, type NodeType, nodeSize, pinLabel, pinWorldPos } from './model';
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
  pinLabel: '#aeb6c2',
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
  // Entrada (inclusive em modo clock) acende pelo seu pino de saída; saída, pelo
  // de entrada.
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

/**
 * Trunca `text` com reticências para caber em `maxWidth` (px de tela), medindo
 * com a fonte já configurada no contexto. Remove de trás para frente por ponto
 * de código (preservando o que couber).
 */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0 || ctx.measureText(text).width <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 1) {
    chars.pop();
    const candidate = `${chars.join('')}…`;
    if (ctx.measureText(candidate).width <= maxWidth) return candidate;
  }
  return '…';
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

/**
 * Desenha um rótulo (já com a fonte/cor/baseline configuradas), truncando com
 * reticências para caber em `maxWidth`. `x` é interpretado conforme `align`.
 */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  align: 'left' | 'center' | 'right',
  maxWidth: number,
): void {
  const fitted = fitText(ctx, text, maxWidth);
  if (!fitted) return;
  ctx.textAlign = align;
  ctx.fillText(fitted, x, y);
}

/** Rótulo central exibido em cada tipo de nó. */
function nodeLabel(node: CircuitNode): string {
  switch (node.type) {
    case 'nand':
      return 'NAND';
    case 'input':
      // Em modo clock exibe "CLK"; do contrário "IN" (ou o nome dado pelo usuário).
      return node.name ?? (node.clock ? 'CLK' : 'IN');
    case 'output':
      return node.name ?? 'OUT';
    case 'chip':
      return node.name ?? 'CHIP';
  }
}

/** Fonte (px de tela) dos rótulos de pino. */
function pinLabelFontPx(cam: Camera): number {
  return Math.max(7, 9 * cam.zoom);
}

/**
 * Espaço lateral (px de tela) ocupado pelos rótulos dos pinos de um dado lado:
 * largura do maior rótulo + a folga até a borda. `0` quando não há rótulo nesse
 * lado. Usado para reservar a faixa lateral e posicionar o nome central.
 */
function pinLabelReserve(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  node: CircuitNode,
  kind: 'in' | 'out',
): number {
  const gap = (PIN_RADIUS + 3) * cam.zoom;
  ctx.font = `${pinLabelFontPx(cam)}px system-ui, sans-serif`;
  let maxW = 0;
  for (const pin of node.pins) {
    if (pin.kind !== kind) continue;
    const label = pinLabel(node, pin);
    if (label) maxW = Math.max(maxW, ctx.measureText(label).width);
  }
  return maxW > 0 ? maxW + gap + 4 * cam.zoom : 0;
}

/**
 * Desenha os rótulos dos pinos (ex.: A/B/Q do NAND ou nomes das entradas/saídas
 * de um chip) em fonte pequena, dentro do corpo, junto a cada pino. Entradas à
 * esquerda alinham à esquerda; saídas à direita alinham à direita. `inReserve`/
 * `outReserve` limitam a largura por lado.
 */
function drawPinLabels(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  node: CircuitNode,
  inReserve: number,
  outReserve: number,
): void {
  if (inReserve <= 0 && outReserve <= 0) return;
  const gap = (PIN_RADIUS + 3) * cam.zoom;
  ctx.fillStyle = COLOR.pinLabel;
  ctx.font = `${pinLabelFontPx(cam)}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  for (const pin of node.pins) {
    const label = pinLabel(node, pin);
    if (!label) continue;
    const p = cam.worldToScreen(pinWorldPos(node, pin));
    if (pin.kind === 'in') {
      drawLabel(ctx, label, p.x + gap, p.y, 'left', inReserve);
    } else {
      drawLabel(ctx, label, p.x - gap, p.y, 'right', outReserve);
    }
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

  // Faixas laterais reservadas (por lado) aos rótulos dos pinos. Só se aplica a
  // nós lógicos (NAND/chip), que têm pinos nos dois lados; entradas/saídas são
  // círculos com um único pino e o rótulo é apenas centrado, com leve folga.
  const minReserve = (PIN_RADIUS + 6) * cam.zoom;
  const leftReserve = logic
    ? Math.max(minReserve, pinLabelReserve(ctx, cam, node, 'in'))
    : 4 * cam.zoom;
  const rightReserve = logic
    ? Math.max(minReserve, pinLabelReserve(ctx, cam, node, 'out'))
    : 4 * cam.zoom;

  // Rótulo central, centrado na região livre entre as reservas (equilibrado
  // mesmo quando um lado tem rótulos mais largos que o outro).
  const label = nodeLabel(node);
  ctx.fillStyle = lit && !logic ? COLOR.signalOnLabel : COLOR.label;
  ctx.font = `${Math.max(9, 12 * cam.zoom)}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  const centerX = origin.x + (leftReserve + (sw - rightReserve)) / 2;
  const centerMax = Math.max(0, sw - leftReserve - rightReserve);
  drawLabel(ctx, label, centerX, origin.y + sh / 2, 'center', centerMax);

  // Pinos (verde quando carregam sinal ligado).
  for (const pin of node.pins) {
    const p = cam.worldToScreen(pinWorldPos(node, pin));
    const on = signal?.pinValues.get(pinKey(node.id, pin.id)) ?? false;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PIN_RADIUS * cam.zoom, 0, Math.PI * 2);
    ctx.fillStyle = on ? COLOR.signalOn : pin.kind === 'in' ? COLOR.pinIn : COLOR.pinOut;
    ctx.fill();
  }

  // Rótulos curtos junto aos pinos (A/B/Q do NAND, nomes de I/O dos chips).
  drawPinLabels(
    ctx,
    cam,
    node,
    pinLabelReserve(ctx, cam, node, 'in'),
    pinLabelReserve(ctx, cam, node, 'out'),
  );
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
