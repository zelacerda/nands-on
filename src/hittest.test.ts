import { describe, expect, it } from 'vitest';
import { NODE_SIZE } from './model';
import { CircuitStore } from './store';
import { hitNode, hitPin, hitWire, hitWireBar } from './hittest';
import { wirePath } from './wire';

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

  it('acerta o fio no segmento vertical da barra (canto do Z)', () => {
    const store = new CircuitStore();
    const input = store.addNode('input', { x: 0, y: 0 });
    const nand = store.addNode('nand', { x: 200, y: 80 });
    const wire = store.addWire(
      { nodeId: input.id, pinId: 'out' },
      { nodeId: nand.id, pinId: 'in0' },
    );
    const from = store.pinPos(wire.from)!;
    const to = store.pinPos(wire.to)!;
    const { bar } = wirePath(from, to, wire.barOffset);
    const mid = { x: bar.a.x, y: (bar.a.y + bar.b.y) / 2 };
    expect(hitWire(store, mid, 6)).toBe(wire.id);
  });
});

describe('hitWireBar', () => {
  it('detecta a barra e o eixo de ajuste (caso Z → eixo x)', () => {
    const store = new CircuitStore();
    const input = store.addNode('input', { x: 0, y: 0 });
    const nand = store.addNode('nand', { x: 200, y: 80 });
    const wire = store.addWire(
      { nodeId: input.id, pinId: 'out' },
      { nodeId: nand.id, pinId: 'in0' },
    );
    const from = store.pinPos(wire.from)!;
    const to = store.pinPos(wire.to)!;
    const { bar } = wirePath(from, to, wire.barOffset);
    const mid = { x: bar.a.x, y: (bar.a.y + bar.b.y) / 2 };
    expect(hitWireBar(store, mid, 6)).toEqual({ wireId: wire.id, axis: 'x' });
  });

  it('retorna null fora da barra', () => {
    const store = new CircuitStore();
    const input = store.addNode('input', { x: 0, y: 0 });
    const nand = store.addNode('nand', { x: 200, y: 80 });
    store.addWire({ nodeId: input.id, pinId: 'out' }, { nodeId: nand.id, pinId: 'in0' });
    expect(hitWireBar(store, { x: 1000, y: 1000 }, 6)).toBeNull();
  });
});
