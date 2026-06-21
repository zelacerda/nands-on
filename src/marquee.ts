import type { Vec2 } from './camera';
import { type CircuitNode, nodeSize } from './model';

/** Retângulo axis-aligned em coordenadas de mundo. */
export interface WorldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Normaliza um retângulo a partir de dois cantos quaisquer (em mundo), de modo
 * que `(x, y)` seja o canto superior-esquerdo e `w`/`h` sejam não-negativos.
 * Assim o retângulo independe da direção do arraste.
 */
export function rectFromCorners(a: Vec2, b: Vec2): WorldRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

/**
 * IDs dos nós cujo **corpo está inteiramente contido** em `rect`. Captura apenas
 * nós (chips e I/O); fios não são selecionados pelo retângulo (são removidos em
 * cascata ao excluir os nós aos quais se conectam).
 */
export function nodesInRect(nodes: CircuitNode[], rect: WorldRect): string[] {
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  const ids: string[] = [];
  for (const node of nodes) {
    const { w, h } = nodeSize(node);
    const x2 = node.pos.x + w;
    const y2 = node.pos.y + h;
    if (node.pos.x >= rect.x && x2 <= right && node.pos.y >= rect.y && y2 <= bottom) {
      ids.push(node.id);
    }
  }
  return ids;
}

/**
 * Aplica uma translação rígida `delta` (mundo) a um conjunto de posições
 * iniciais, devolvendo as novas posições. Como o mesmo delta é somado a todos os
 * pontos, as posições relativas entre os nós do grupo são preservadas — base do
 * movimento em conjunto. O `delta` deve vir já snapado à grade para manter os
 * nós alinhados.
 */
export function translatePositions(
  starts: Map<string, Vec2>,
  delta: Vec2,
): Map<string, Vec2> {
  const out = new Map<string, Vec2>();
  for (const [id, p] of starts) {
    out.set(id, { x: p.x + delta.x, y: p.y + delta.y });
  }
  return out;
}
