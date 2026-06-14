import type { Vec2 } from './camera';
import { type PinRef, nodeSize, pinWorldPos } from './model';
import { PIN_RADIUS } from './render';
import type { CircuitStore } from './store';
import { wirePath } from './wire';

/** Distância euclidiana entre dois pontos. */
function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Menor distância de um ponto `p` ao segmento `a`–`b`. */
function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * Retorna a referência do pino mais próximo de `p` dentro da tolerância
 * (`tol` em unidades de mundo), ou `null`.
 */
export function hitPin(store: CircuitStore, p: Vec2, tol: number): PinRef | null {
  let best: { ref: PinRef; d: number } | null = null;
  const reach = PIN_RADIUS + tol;
  for (const node of store.listNodes()) {
    for (const pin of node.pins) {
      const d = dist(p, pinWorldPos(node, pin));
      if (d <= reach && (!best || d < best.d)) {
        best = { ref: { nodeId: node.id, pinId: pin.id }, d };
      }
    }
  }
  return best?.ref ?? null;
}

/**
 * Retorna o id do nó cujo retângulo contém `p`. Itera de cima para baixo
 * (último desenhado primeiro), devolvendo o nó "em cima".
 */
export function hitNode(store: CircuitStore, p: Vec2): string | null {
  const nodes = store.listNodes();
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]!;
    const { w, h } = nodeSize(node);
    if (p.x >= node.pos.x && p.x <= node.pos.x + w && p.y >= node.pos.y && p.y <= node.pos.y + h) {
      return node.id;
    }
  }
  return null;
}

/** Menor distância de `p` a uma polilinha (mínimo entre seus segmentos). */
function distToPolyline(p: Vec2, pts: Vec2[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    best = Math.min(best, distToSegment(p, pts[i - 1]!, pts[i]!));
  }
  return best;
}

/**
 * Retorna o id do fio cujo traçado ortogonal passa a até `tol` (mundo) de `p`,
 * considerando todos os segmentos da polilinha.
 */
export function hitWire(store: CircuitStore, p: Vec2, tol: number): string | null {
  for (const wire of store.listWires()) {
    const from = store.pinPos(wire.from);
    const to = store.pinPos(wire.to);
    if (!from || !to) continue;
    const { points } = wirePath(from, to, wire.barOffset);
    if (distToPolyline(p, points) <= tol) return wire.id;
  }
  return null;
}

/** Resultado de um acerto na barra ajustável de um fio. */
export interface WireBarHit {
  wireId: string;
  /** Eixo do ajuste da barra: `x` (caso Z) ou `y` (caso S). */
  axis: 'x' | 'y';
}

/**
 * Retorna o fio (e o eixo de ajuste) cuja **barra** intermediária passa a até
 * `tol` (mundo) de `p`, ou `null`. Usado para iniciar o arraste da barra.
 */
export function hitWireBar(store: CircuitStore, p: Vec2, tol: number): WireBarHit | null {
  for (const wire of store.listWires()) {
    const from = store.pinPos(wire.from);
    const to = store.pinPos(wire.to);
    if (!from || !to) continue;
    const { bar } = wirePath(from, to, wire.barOffset);
    if (distToSegment(p, bar.a, bar.b) <= tol) return { wireId: wire.id, axis: bar.axis };
  }
  return null;
}
