import { describe, expect, it } from 'vitest';
import { NODE_SIZE } from './model';
import { CircuitStore } from './store';
import { hitNode, hitPin, hitWire } from './hittest';

describe('hitNode', () => {
  it('acerta um ponto dentro do retângulo do nó', () => {
    const store = new CircuitStore();
    const n = store.addNode('nand', { x: 100, y: 100 });
    expect(hitNode(store, { x: 110, y: 120 })).toBe(n.id);
  });

  it('retorna null fora de qualquer nó', () => {
    const store = new CircuitStore();
    store.addNode('nand', { x: 100, y: 100 });
    expect(hitNode(store, { x: 0, y: 0 })).toBeNull();
  });

  it('devolve o nó de cima quando há sobreposição', () => {
    const store = new CircuitStore();
    store.addNode('nand', { x: 0, y: 0 });
    const top = store.addNode('nand', { x: 0, y: 0 });
    expect(hitNode(store, { x: 10, y: 10 })).toBe(top.id);
  });
});

describe('hitPin', () => {
  it('acerta o pino de saída da NAND', () => {
    const store = new CircuitStore();
    const n = store.addNode('nand', { x: 100, y: 100 });
    const out = { x: 100 + NODE_SIZE.nand.w, y: 100 + NODE_SIZE.nand.h * 0.5 };
    expect(hitPin(store, out, 8)).toEqual({ nodeId: n.id, pinId: 'out' });
  });

  it('retorna null longe de qualquer pino', () => {
    const store = new CircuitStore();
    store.addNode('nand', { x: 100, y: 100 });
    expect(hitPin(store, { x: 500, y: 500 }, 8)).toBeNull();
  });
});

describe('hitWire', () => {
  it('acerta um fio próximo do seu traçado', () => {
    const store = new CircuitStore();
    const input = store.addNode('input', { x: 0, y: 0 });
    const nand = store.addNode('nand', { x: 200, y: 0 });
    const wire = store.addWire({ nodeId: input.id, pinId: 'out' }, { nodeId: nand.id, pinId: 'in0' });
    const from = store.pinPos(wire.from)!;
    const to = store.pinPos(wire.to)!;
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    expect(hitWire(store, mid, 6)).toBe(wire.id);
  });

  it('retorna null longe de qualquer fio', () => {
    const store = new CircuitStore();
    const input = store.addNode('input', { x: 0, y: 0 });
    const nand = store.addNode('nand', { x: 200, y: 0 });
    store.addWire({ nodeId: input.id, pinId: 'out' }, { nodeId: nand.id, pinId: 'in0' });
    expect(hitWire(store, { x: 100, y: 400 }, 6)).toBeNull();
  });
});
