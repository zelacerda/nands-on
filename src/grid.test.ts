import { describe, expect, it } from 'vitest';
import { GRID_SIZE, snapScalar, snapToGrid, snapNodePos, recenterState } from './grid';
import {
  createPins,
  NODE_SIZE,
  pinWorldPos,
  type CircuitNode,
  type CircuitState,
} from './model';

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

describe('recenterState', () => {
  let counter = 0;
  /** Cria um nó com pos arbitrária (id único por chamada). */
  function node(type: 'nand' | 'input' | 'output', pos: { x: number; y: number }): CircuitNode {
    counter += 1;
    return { id: `n${counter}`, type, pos, pins: createPins(type) };
  }

  /** Centro do bounding box das posições dos nós. */
  function center(state: CircuitState): { x: number; y: number } {
    const xs = state.nodes.map((n) => n.pos.x);
    const ys = state.nodes.map((n) => n.pos.y);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  }

  it('translada o centro do bounding box para perto da origem (±meio grid)', () => {
    const state: CircuitState = {
      nodes: [
        node('input', { x: 1008, y: 1008 }),
        node('nand', { x: 1120, y: 1040 }),
        node('output', { x: 1248, y: 1072 }),
      ],
      wires: [],
    };
    recenterState(state);
    const c = center(state);
    expect(Math.abs(c.x)).toBeLessThanOrEqual(GRID_SIZE / 2);
    expect(Math.abs(c.y)).toBeLessThanOrEqual(GRID_SIZE / 2);
  });

  it('mantém os nós alinhados ao grid (deslocamento múltiplo de GRID_SIZE)', () => {
    const state: CircuitState = {
      nodes: [
        node('input', { x: 16 * 60, y: 16 * 60 }),
        node('nand', { x: 16 * 67, y: 16 * 62 }),
        node('output', { x: 16 * 75, y: 16 * 64 }),
      ],
      wires: [],
    };
    recenterState(state);
    for (const n of state.nodes) {
      // Math.abs normaliza o -0 que surge quando a coordenada cai exatamente na malha.
      expect(Math.abs(n.pos.x % GRID_SIZE)).toBe(0);
      expect(Math.abs(n.pos.y % GRID_SIZE)).toBe(0);
    }
  });

  it('translação é uniforme: preserva as posições relativas entre os nós', () => {
    const state: CircuitState = {
      nodes: [
        node('input', { x: 1008, y: 1008 }),
        node('nand', { x: 1120, y: 1040 }),
        node('output', { x: 1248, y: 1072 }),
      ],
      wires: [],
    };
    const before = state.nodes.map((n) => ({ ...n.pos }));
    recenterState(state);
    // Vetores entre pares de nós permanecem idênticos.
    for (let i = 1; i < state.nodes.length; i++) {
      const dxBefore = before[i]!.x - before[0]!.x;
      const dyBefore = before[i]!.y - before[0]!.y;
      const dxAfter = state.nodes[i]!.pos.x - state.nodes[0]!.pos.x;
      const dyAfter = state.nodes[i]!.pos.y - state.nodes[0]!.pos.y;
      expect(dxAfter).toBe(dxBefore);
      expect(dyAfter).toBe(dyBefore);
    }
  });

  it('é idempotente: recentrar de novo não altera as posições', () => {
    const state: CircuitState = {
      nodes: [
        node('input', { x: 1008, y: 1008 }),
        node('nand', { x: 1120, y: 1040 }),
        node('output', { x: 1248, y: 1072 }),
      ],
      wires: [],
    };
    recenterState(state);
    const once = state.nodes.map((n) => ({ ...n.pos }));
    recenterState(state);
    expect(state.nodes.map((n) => ({ ...n.pos }))).toEqual(once);
  });

  it('um único nó vai para a origem (snapped ao grid)', () => {
    const state: CircuitState = { nodes: [node('nand', { x: 1600, y: 800 })], wires: [] };
    recenterState(state);
    expect(state.nodes[0]!.pos).toEqual({ x: 0, y: 0 });
  });

  it('no-op quando não há nós', () => {
    const state: CircuitState = { nodes: [], wires: [] };
    expect(() => recenterState(state)).not.toThrow();
    expect(state.nodes).toHaveLength(0);
  });
});
