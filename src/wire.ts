import type { Vec2 } from './camera';
import { GRID_SIZE, snapScalar } from './grid';

/**
 * Geometria de um fio ortogonal: a polilinha (vértices) e o segmento da "barra"
 * intermediária ajustável pelo usuário.
 */
export interface WireGeometry {
  /** Vértices da polilinha: 4 pontos (3 segmentos) no caso Z; 6 (5 segmentos) no S. */
  points: Vec2[];
  /** Segmento ajustável e o eixo do ajuste (`x` no caso Z, `y` no S). */
  bar: { a: Vec2; b: Vec2; axis: 'x' | 'y' };
  /** Caso do traçado: Z quando `from.x < to.x`; S caso contrário. */
  shape: 'Z' | 'S';
}

/** Restringe `v` ao intervalo [lo, hi] (lo/hi em qualquer ordem). */
function clamp(v: number, lo: number, hi: number): number {
  const min = Math.min(lo, hi);
  const max = Math.max(lo, hi);
  return Math.max(min, Math.min(max, v));
}

/**
 * Caminho ortogonal entre o pino de saída `from` e o de entrada `to`, com a
 * barra deslocada de `barOffset` (mundo) em relação ao padrão (meio do caminho).
 *
 * - **Z** (`from.x < to.x`): H, V, H. A barra é o segmento vertical do meio,
 *   ajustável no eixo X (limitado entre `from.x` e `to.x`).
 * - **S** (`from.x ≥ to.x`): trechos de exatamente 1 grid junto aos pinos, e a
 *   barra é o segmento horizontal do meio, ajustável no eixo Y.
 */
export function wirePath(from: Vec2, to: Vec2, barOffset = 0): WireGeometry {
  if (from.x < to.x) {
    // Caso Z — barra vertical, ajuste horizontal.
    const barX = clamp(snapScalar((from.x + to.x) / 2) + barOffset, from.x, to.x);
    const p0 = from;
    const p1 = { x: barX, y: from.y };
    const p2 = { x: barX, y: to.y };
    const p3 = to;
    return { points: [p0, p1, p2, p3], bar: { a: p1, b: p2, axis: 'x' }, shape: 'Z' };
  }
  // Caso S — barra horizontal, ajuste vertical. Trechos de 1 grid nos pinos.
  const ax = from.x + GRID_SIZE;
  const bx = to.x - GRID_SIZE;
  const barY = snapScalar((from.y + to.y) / 2) + barOffset;
  const p0 = from;
  const p1 = { x: ax, y: from.y };
  const p2 = { x: ax, y: barY };
  const p3 = { x: bx, y: barY };
  const p4 = { x: bx, y: to.y };
  const p5 = to;
  return { points: [p0, p1, p2, p3, p4, p5], bar: { a: p2, b: p3, axis: 'y' }, shape: 'S' };
}
