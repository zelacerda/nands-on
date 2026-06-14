import type { Camera, Vec2 } from './camera';

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
