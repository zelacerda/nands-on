import type { Camera, Vec2 } from './camera';
import { NODE_SIZE, type CircuitNode, pinWorldPos } from './model';
import type { CircuitStore } from './store';

/** Raio do pino, em unidades de mundo. */
export const PIN_RADIUS = 5;

const COLOR = {
  body: '#2d333b',
  bodyStroke: '#4a525e',
  label: '#d8dee9',
  pinIn: '#7aa2f7',
  pinOut: '#e0af68',
  wire: '#9aa5b1',
} as const;

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

/** Desenha um nó (porta ou pino de I/O) em coordenadas de tela. */
export function drawNode(ctx: CanvasRenderingContext2D, cam: Camera, node: CircuitNode): void {
  const { w, h } = NODE_SIZE[node.type];
  const origin = cam.worldToScreen(node.pos);
  const sw = w * cam.zoom;
  const sh = h * cam.zoom;

  ctx.fillStyle = COLOR.body;
  ctx.strokeStyle = COLOR.bodyStroke;
  ctx.lineWidth = Math.max(1, 1.5 * cam.zoom);
  roundedRect(ctx, origin.x, origin.y, sw, sh, 8 * cam.zoom);
  ctx.fill();
  ctx.stroke();

  // Rótulo central.
  const label = node.type === 'nand' ? 'NAND' : node.type === 'input' ? 'IN' : 'OUT';
  ctx.fillStyle = COLOR.label;
  ctx.font = `${Math.max(9, 12 * cam.zoom)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, origin.x + sw / 2, origin.y + sh / 2);

  // Pinos.
  for (const pin of node.pins) {
    const p = cam.worldToScreen(pinWorldPos(node, pin));
    ctx.beginPath();
    ctx.arc(p.x, p.y, PIN_RADIUS * cam.zoom, 0, Math.PI * 2);
    ctx.fillStyle = pin.kind === 'in' ? COLOR.pinIn : COLOR.pinOut;
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

/** Desenha todos os fios do circuito. */
export function drawWires(ctx: CanvasRenderingContext2D, cam: Camera, store: CircuitStore): void {
  ctx.strokeStyle = COLOR.wire;
  ctx.lineWidth = Math.max(1.5, 2 * cam.zoom);
  for (const wire of store.listWires()) {
    const from = store.pinPos(wire.from);
    const to = store.pinPos(wire.to);
    if (!from || !to) continue;
    drawWireSegment(ctx, cam.worldToScreen(from), cam.worldToScreen(to));
  }
}

/** Desenha o circuito inteiro: fios primeiro (atrás), depois os nós. */
export function drawCircuit(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  store: CircuitStore,
): void {
  drawWires(ctx, cam, store);
  for (const node of store.listNodes()) {
    drawNode(ctx, cam, node);
  }
}
