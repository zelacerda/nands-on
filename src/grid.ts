import type { Camera, Vec2 } from './camera';
import { type CircuitNode, type CircuitState, pinWorldPos } from './model';

/** Espaçamento base do grid, em unidades de mundo. */
export const GRID_SIZE = 16;

/**
 * A cada quantas linhas desenhamos uma linha "forte" (major). Com GRID_SIZE=16,
 * 8 linhas mantêm o ritmo visual de uma malha "forte" a cada 128 unidades.
 */
const MAJOR_EVERY = 8;

/** Arredonda um valor escalar ao múltiplo de GRID_SIZE mais próximo. */
export function snapScalar(v: number): number {
  return Math.round(v / GRID_SIZE) * GRID_SIZE;
}

/** Arredonda um ponto (mundo) ao cruzamento de grade mais próximo. */
export function snapToGrid(v: Vec2): Vec2 {
  return { x: snapScalar(v.x), y: snapScalar(v.y) };
}

/**
 * Posição (canto superior esquerdo) que alinha um nó à grade. Estratégia por
 * tipo:
 * - **Corpos retangulares** (`nand`/`chip`): snap do próprio canto. Como os
 *   offsets de pino já são múltiplos de GRID_SIZE, os conectores caem em
 *   cruzamentos automaticamente.
 * - **Nós de I/O** (`input`/`output`, redondos): snap pelo **conector** — a
 *   posição é deslocada para que o (único) pino caia no cruzamento mais próximo,
 *   preservando o tamanho do nó.
 */
export function snapNodePos(node: CircuitNode): Vec2 {
  if (node.type === 'input' || node.type === 'output') {
    const pin = node.pins[0];
    if (!pin) return snapToGrid(node.pos);
    const pinPos = pinWorldPos(node, pin);
    const target = snapToGrid(pinPos);
    return {
      x: node.pos.x + (target.x - pinPos.x),
      y: node.pos.y + (target.y - pinPos.y),
    };
  }
  return snapToGrid(node.pos);
}

/**
 * Recentraliza um {@link CircuitState} **in place** em torno da origem `{0, 0}`:
 * translada todas as posições de nós para que o **centro do bounding box** dos
 * nós caia em (0, 0). O deslocamento é arredondado ao grid ({@link snapScalar}),
 * de modo que nós já alinhados à malha permaneçam alinhados após a translação.
 *
 * Apenas `node.pos` é transladado: os offsets de pino são relativos ao nó e o
 * `barOffset` dos fios é um deslocamento **relativo** (ver `model.ts`/`wire.ts`),
 * então uma translação uniforme dos nós recentraliza o circuito inteiro sem
 * tocar em fios ou pinos, preservando exatamente a topologia relativa.
 *
 * No-op se não houver nós, ou se o centro já estiver na origem (idempotente).
 */
export function recenterState(state: CircuitState): void {
  const { nodes } = state;
  if (nodes.length === 0) return;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    if (n.pos.x < minX) minX = n.pos.x;
    if (n.pos.y < minY) minY = n.pos.y;
    if (n.pos.x > maxX) maxX = n.pos.x;
    if (n.pos.y > maxY) maxY = n.pos.y;
  }
  const dx = -snapScalar((minX + maxX) / 2);
  const dy = -snapScalar((minY + maxY) / 2);
  if (dx === 0 && dy === 0) return;
  for (const n of nodes) {
    n.pos = { x: n.pos.x + dx, y: n.pos.y + dy };
  }
}

/**
 * Desenha um grid de fundo no espaço de mundo, recortado à viewport.
 * `width`/`height` estão em CSS px (a transformação de DPR já foi aplicada).
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  width: number,
  height: number,
): void {
  const topLeft = cam.screenToWorld({ x: 0, y: 0 });
  const bottomRight = cam.screenToWorld({ x: width, y: height });

  const startX = Math.floor(topLeft.x / GRID_SIZE) * GRID_SIZE;
  const startY = Math.floor(topLeft.y / GRID_SIZE) * GRID_SIZE;

  ctx.lineWidth = 1;

  // Linhas verticais.
  for (let wx = startX; wx <= bottomRight.x; wx += GRID_SIZE) {
    const sx = Math.round(cam.worldToScreen({ x: wx, y: 0 }).x) + 0.5;
    const isMajor = Math.round(wx / GRID_SIZE) % MAJOR_EVERY === 0;
    ctx.strokeStyle = isMajor ? '#323742' : '#272b33';
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, height);
    ctx.stroke();
  }

  // Linhas horizontais.
  for (let wy = startY; wy <= bottomRight.y; wy += GRID_SIZE) {
    const sy = Math.round(cam.worldToScreen({ x: 0, y: wy }).y) + 0.5;
    const isMajor = Math.round(wy / GRID_SIZE) % MAJOR_EVERY === 0;
    ctx.strokeStyle = isMajor ? '#323742' : '#272b33';
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(width, sy);
    ctx.stroke();
  }
}
