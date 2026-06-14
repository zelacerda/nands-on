import { describe, expect, it } from 'vitest';
import { wirePath } from './wire';
import { GRID_SIZE } from './grid';

/** Verdadeiro se o segmento a→b é horizontal ou vertical (ortogonal). */
function isOrthogonal(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return a.x === b.x || a.y === b.y;
}

describe('wirePath — caso Z (from.x < to.x)', () => {
  const from = { x: 0, y: 0 };
  const to = { x: 128, y: 64 };

  it('tem 4 vértices (3 segmentos) e shape Z', () => {
    const g = wirePath(from, to);
    expect(g.points).toHaveLength(4);
    expect(g.shape).toBe('Z');
  });

  it('todos os segmentos são ortogonais', () => {
    const { points } = wirePath(from, to);
    for (let i = 1; i < points.length; i++) {
      expect(isOrthogonal(points[i - 1]!, points[i]!)).toBe(true);
    }
  });

  it('começa em from e termina em to', () => {
    const { points } = wirePath(from, to);
    expect(points[0]).toEqual(from);
    expect(points[points.length - 1]).toEqual(to);
  });

  it('a barra é vertical, ajustável no eixo x, e fica no meio por padrão', () => {
    const g = wirePath(from, to);
    expect(g.bar.axis).toBe('x');
    expect(g.bar.a.x).toBe(g.bar.b.x); // vertical
    expect(g.bar.a.x).toBe(64); // meio de 0..128, snapado
  });

  it('barOffset desloca a barra no eixo x (em grade), limitado entre from.x e to.x', () => {
    expect(wirePath(from, to, 32).bar.a.x).toBe(96);
    expect(wirePath(from, to, 1000).bar.a.x).toBe(128); // clamp em to.x
    expect(wirePath(from, to, -1000).bar.a.x).toBe(0); // clamp em from.x
  });

  it('mesma altura: caminho reto horizontal (segmentos degenerados, ainda ortogonais)', () => {
    const { points } = wirePath({ x: 0, y: 32 }, { x: 128, y: 32 });
    for (let i = 1; i < points.length; i++) {
      expect(isOrthogonal(points[i - 1]!, points[i]!)).toBe(true);
    }
  });
});

describe('wirePath — caso S (from.x >= to.x)', () => {
  const from = { x: 128, y: 0 };
  const to = { x: 0, y: 64 };

  it('tem 6 vértices (5 segmentos) e shape S', () => {
    const g = wirePath(from, to);
    expect(g.points).toHaveLength(6);
    expect(g.shape).toBe('S');
  });

  it('todos os segmentos são ortogonais', () => {
    const { points } = wirePath(from, to);
    for (let i = 1; i < points.length; i++) {
      expect(isOrthogonal(points[i - 1]!, points[i]!)).toBe(true);
    }
  });

  it('os trechos junto aos pinos têm exatamente 1 grid', () => {
    const { points } = wirePath(from, to);
    expect(points[1]!.x - points[0]!.x).toBe(GRID_SIZE); // sai 1 grid à direita
    expect(points[5]!.x - points[4]!.x).toBe(GRID_SIZE); // entra 1 grid pela esquerda
  });

  it('a barra é horizontal, ajustável no eixo y, e fica no meio por padrão', () => {
    const g = wirePath(from, to);
    expect(g.bar.axis).toBe('y');
    expect(g.bar.a.y).toBe(g.bar.b.y); // horizontal
    expect(g.bar.a.y).toBe(32); // meio de 0..64
  });

  it('barOffset desloca a barra no eixo y', () => {
    expect(wirePath(from, to, 16).bar.a.y).toBe(48);
    expect(wirePath(from, to, -32).bar.a.y).toBe(0);
  });
});
