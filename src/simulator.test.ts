import { describe, expect, it } from 'vitest';
import { CircuitStore } from './store';
import { pinKey, simulate } from './simulator';

/** Lê o valor (lit) do pino de entrada de um nó `output`. */
function outValue(store: CircuitStore, outNodeId: string): boolean {
  return simulate(store.toJSON()).pinValues.get(pinKey(outNodeId, 'in')) ?? false;
}

describe('simulate — circuito plano', () => {
  it('propaga input → output diretamente', () => {
    const store = new CircuitStore();
    const inp = store.addNode('input', { x: 0, y: 0 });
    const out = store.addNode('output', { x: 100, y: 0 });
    store.addWire({ nodeId: inp.id, pinId: 'out' }, { nodeId: out.id, pinId: 'in' });

    store.setNodeValue(inp.id, true);
    expect(outValue(store, out.id)).toBe(true);

    store.setNodeValue(inp.id, false);
    expect(outValue(store, out.id)).toBe(false);
  });

  it('avalia a tabela-verdade completa da NAND', () => {
    const store = new CircuitStore();
    const a = store.addNode('input', { x: 0, y: 0 });
    const b = store.addNode('input', { x: 0, y: 60 });
    const nand = store.addNode('nand', { x: 100, y: 0 });
    const out = store.addNode('output', { x: 220, y: 0 });
    store.addWire({ nodeId: a.id, pinId: 'out' }, { nodeId: nand.id, pinId: 'in0' });
    store.addWire({ nodeId: b.id, pinId: 'out' }, { nodeId: nand.id, pinId: 'in1' });
    store.addWire({ nodeId: nand.id, pinId: 'out' }, { nodeId: out.id, pinId: 'in' });

    const cases: Array<[boolean, boolean, boolean]> = [
      [false, false, true],
      [false, true, true],
      [true, false, true],
      [true, true, false],
    ];
    for (const [va, vb, expected] of cases) {
      store.setNodeValue(a.id, va);
      store.setNodeValue(b.id, vb);
      expect(outValue(store, out.id), `NAND(${va}, ${vb})`).toBe(expected);
    }
  });

  it('trata entrada não conectada como false', () => {
    const store = new CircuitStore();
    const a = store.addNode('input', { x: 0, y: 0 });
    const nand = store.addNode('nand', { x: 100, y: 0 });
    const out = store.addNode('output', { x: 220, y: 0 });
    // Apenas in0 conectado; in1 fica solto (= false) ⇒ NAND(true, false) = true.
    store.addWire({ nodeId: a.id, pinId: 'out' }, { nodeId: nand.id, pinId: 'in0' });
    store.addWire({ nodeId: nand.id, pinId: 'out' }, { nodeId: out.id, pinId: 'in' });

    store.setNodeValue(a.id, true);
    expect(outValue(store, out.id)).toBe(true);
  });

  it('estabiliza uma cadeia de NANDs (NOT de NOT = identidade)', () => {
    const store = new CircuitStore();
    const inp = store.addNode('input', { x: 0, y: 0 });
    // NOT = NAND com as duas entradas ligadas ao mesmo sinal.
    const not1 = store.addNode('nand', { x: 100, y: 0 });
    const not2 = store.addNode('nand', { x: 220, y: 0 });
    const out = store.addNode('output', { x: 340, y: 0 });
    store.addWire({ nodeId: inp.id, pinId: 'out' }, { nodeId: not1.id, pinId: 'in0' });
    store.addWire({ nodeId: inp.id, pinId: 'out' }, { nodeId: not1.id, pinId: 'in1' });
    store.addWire({ nodeId: not1.id, pinId: 'out' }, { nodeId: not2.id, pinId: 'in0' });
    store.addWire({ nodeId: not1.id, pinId: 'out' }, { nodeId: not2.id, pinId: 'in1' });
    store.addWire({ nodeId: not2.id, pinId: 'out' }, { nodeId: out.id, pinId: 'in' });

    store.setNodeValue(inp.id, true);
    expect(outValue(store, out.id)).toBe(true);
    store.setNodeValue(inp.id, false);
    expect(outValue(store, out.id)).toBe(false);
  });

  it('preenche wireValues conforme o sinal transportado', () => {
    const store = new CircuitStore();
    const inp = store.addNode('input', { x: 0, y: 0 });
    const out = store.addNode('output', { x: 100, y: 0 });
    const wire = store.addWire(
      { nodeId: inp.id, pinId: 'out' },
      { nodeId: out.id, pinId: 'in' },
    );

    store.setNodeValue(inp.id, true);
    expect(simulate(store.toJSON()).wireValues.get(wire.id)).toBe(true);
    store.setNodeValue(inp.id, false);
    expect(simulate(store.toJSON()).wireValues.get(wire.id)).toBe(false);
  });
});
