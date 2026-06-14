import { describe, expect, it } from 'vitest';
import { GRID_SIZE, snapScalar, snapToGrid, snapNodePos } from './grid';
import { createPins, NODE_SIZE, pinWorldPos, type CircuitNode } from './model';

describe('snapScalar / snapToGrid', () => {
  it('arredonda ao múltiplo de GRID_SIZE mais próximo', () => {
    expect(snapScalar(0)).toBe(0);
    expect(snapScalar(7)).toBe(0); // 7 < 8 → 0
    expect(snapScalar(8)).toBe(16); // ponto médio arredonda para cima
    expect(snapScalar(17)).toBe(16);
    expect(snapScalar(-7)).toBeCloseTo(0); // -0 é aceitável
    expect(snapScalar(-9)).toBe(-16);
  });

  it('snapToGrid arredonda ambos os eixos', () => {
    expect(snapToGrid({ x: 17, y: 31 })).toEqual({ x: 16, y: 32 });
  });
});

describe('snapNodePos', () => {
  /** Cria um nó primitivo com pos arbitrária. */
  function node(type: 'nand' | 'input' | 'output', pos: { x: number; y: number }): CircuitNode {
    return { id: 'n', type, pos, pins: createPins(type) };
  }

  it('corpo retangular (nand): snapa o canto ao grid', () => {
    const n = node('nand', { x: 17, y: 31 });
    expect(snapNodePos(n)).toEqual({ x: 16, y: 32 });
  });

  it('nand snapado deixa todos os pinos em cruzamentos da grade', () => {
    const n = node('nand', { x: 103, y: 57 });
    const p = snapNodePos(n);
    n.pos = p;
    for (const pin of n.pins) {
      const wp = pinWorldPos(n, pin);
      expect(wp.x % GRID_SIZE).toBe(0);
      expect(wp.y % GRID_SIZE).toBe(0);
    }
  });

  it('nó de I/O (input): leva o conector ao cruzamento, não o canto', () => {
    // input: pino de saída em offset { x: 40, y: 20 }.
    const n = node('input', { x: 0, y: 0 });
    const p = snapNodePos(n);
    n.pos = p;
    const wp = pinWorldPos(n, n.pins[0]!);
    expect(wp.x % GRID_SIZE).toBe(0);
    expect(wp.y % GRID_SIZE).toBe(0);
    // O tamanho do nó é preservado (snap pelo conector, não redimensiona).
    expect(NODE_SIZE.input).toEqual({ w: 40, h: 40 });
  });

  it('I/O (output) para posição arbitrária: conector cai em cruzamento', () => {
    const n = node('output', { x: 13, y: 27 });
    n.pos = snapNodePos(n);
    const wp = pinWorldPos(n, n.pins[0]!);
    expect(wp.x % GRID_SIZE).toBe(0);
    expect(wp.y % GRID_SIZE).toBe(0);
  });
});
