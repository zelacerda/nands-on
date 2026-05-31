import type { Vec2 } from './camera';

/**
 * Deslocamento mínimo (em px de tela) para classificar um gesto na paleta como
 * arrasto em vez de clique. Toques curtos ficam abaixo do limiar e não criam
 * instância (o clique é reservado para o futuro fluxo de edição).
 */
export const DRAG_THRESHOLD_PX = 6;

/** Distância euclidiana entre dois pontos de tela. */
function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Classifica o gesto como arrasto quando o deslocamento atinge o limiar. */
export function isDrag(start: Vec2, end: Vec2, threshold = DRAG_THRESHOLD_PX): boolean {
  return distance(start, end) >= threshold;
}

/**
 * Canto superior esquerdo que centraliza um componente de dimensões `size` no
 * ponto `point` (em coordenadas de mundo).
 */
export function centeredTopLeft(point: Vec2, size: { w: number; h: number }): Vec2 {
  return { x: point.x - size.w / 2, y: point.y - size.h / 2 };
}
