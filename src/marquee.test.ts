import { describe, expect, it } from 'vitest';
import { CircuitStore } from './store';
import { nodesInRect, rectFromCorners, translatePositions } from './marquee';

describe('rectFromCorners', () => {
  it('normaliza independentemente da direção do arraste', () => {
    const ne = rectFromCorners({ x: 10, y: 60 }, { x: 50, y: 20 });
    expect(ne).toEqual({ x: 10, y: 20, w: 40, h: 40 });
    // Cantos trocados produzem o mesmo retângulo.
    const sw = rectFromCorners({ x: 50, y: 20 }, { x: 10, y: 60 });
    expect(sw).toEqual(ne);
  });
});

describe('nodesInRect', () => {
  it('inclui nó cujo corpo está inteiramente contido', () => {
    const store = new CircuitStore();
    const n = store.addNode('input', { x: 100, y: 100 }); // 40x40
    const ids = nodesInRect(store.listNodes(), { x: 90, y: 90, w: 100, h: 100 });
    expect(ids).toEqual([n.id]);
  });

  it('exclui nó parcialmente sobreposto (um canto de fora)', () => {
    const store = new CircuitStore();
    store.addNode('input', { x: 100, y: 100 }); // corpo 100..140
    // Retângulo corta o canto inferior-direito do nó.
    const ids = nodesInRect(store.listNodes(), { x: 90, y: 90, w: 40, h: 40 });
    expect(ids).toEqual([]);
  });

  it('exclui nó totalmente fora do retângulo', () => {
    const store = new CircuitStore();
    store.addNode('nand', { x: 500, y: 500 });
    const ids = nodesInRect(store.listNodes(), { x: 0, y: 0, w: 100, h: 100 });
    expect(ids).toEqual([]);
  });

  it('seleciona apenas os nós contidos quando há vários', () => {
    const store = new CircuitStore();
    const a = store.addNode('input', { x: 10, y: 10 });
    const b = store.addNode('output', { x: 60, y: 10 });
    store.addNode('nand', { x: 400, y: 400 }); // fora
    const ids = nodesInRect(store.listNodes(), { x: 0, y: 0, w: 200, h: 200 });
    expect(ids.sort()).toEqual([a.id, b.id].sort());
  });

  it('inclui um chip (corpo maior) somente quando totalmente contido', () => {
    const store = new CircuitStore();
    const n = store.addNode('nand', { x: 100, y: 100 }); // 128x64
    // Retângulo justo cobrindo todo o corpo.
    expect(nodesInRect(store.listNodes(), { x: 100, y: 100, w: 128, h: 64 })).toEqual([n.id]);
    // Retângulo 1px menor não contém o corpo.
    expect(nodesInRect(store.listNodes(), { x: 100, y: 100, w: 127, h: 64 })).toEqual([]);
  });
});

describe('translatePositions', () => {
  it('preserva as posições relativas ao transladar o grupo', () => {
    const starts = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 32, y: 16 }],
    ]);
    const moved = translatePositions(starts, { x: 48, y: -16 });
    expect(moved.get('a')).toEqual({ x: 48, y: -16 });
    expect(moved.get('b')).toEqual({ x: 80, y: 0 });
    // O vetor entre a e b é o mesmo antes e depois.
    expect(moved.get('b')!.x - moved.get('a')!.x).toBe(32);
    expect(moved.get('b')!.y - moved.get('a')!.y).toBe(16);
  });

  it('não muta o mapa de origem', () => {
    const starts = new Map([['a', { x: 5, y: 5 }]]);
    translatePositions(starts, { x: 10, y: 10 });
    expect(starts.get('a')).toEqual({ x: 5, y: 5 });
  });
});
