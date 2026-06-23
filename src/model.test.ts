import { describe, expect, it } from 'vitest';
import { CircuitStore } from './store';
import { type ChipDefinition, ioNodeForPin } from './model';

function pinOf(store: CircuitStore, nodeId: string, pinId: string) {
  const node = store.getNode(nodeId)!;
  const pin = node.pins.find((p) => p.id === pinId)!;
  return { node, pin };
}

describe('ioNodeForPin', () => {
  it('pino de entrada do NAND vira IN herdando o rótulo (A/B)', () => {
    const store = new CircuitStore();
    const nand = store.addNode('nand', { x: 0, y: 0 });

    const a = pinOf(store, nand.id, 'in0');
    expect(ioNodeForPin(a.node, a.pin)).toEqual({ type: 'input', name: 'A' });

    const b = pinOf(store, nand.id, 'in1');
    expect(ioNodeForPin(b.node, b.pin)).toEqual({ type: 'input', name: 'B' });
  });

  it('pino de saída do NAND vira OUT herdando o rótulo (Q)', () => {
    const store = new CircuitStore();
    const nand = store.addNode('nand', { x: 0, y: 0 });

    const q = pinOf(store, nand.id, 'out');
    expect(ioNodeForPin(q.node, q.pin)).toEqual({ type: 'output', name: 'Q' });
  });

  it('herda o rótulo do pino de uma instância de chip', () => {
    const store = new CircuitStore();
    const def: ChipDefinition = {
      id: 'c1',
      name: 'AND',
      inputCount: 2,
      outputCount: 1,
      inputLabels: ['X', 'Y'],
      outputLabels: ['Z'],
      internal: { nodes: [], wires: [] },
    };
    const chip = store.addChipInstance(def, { x: 0, y: 0 });

    const x = pinOf(store, chip.id, 'in0');
    expect(ioNodeForPin(x.node, x.pin)).toEqual({ type: 'input', name: 'X' });

    const z = pinOf(store, chip.id, 'out0');
    expect(ioNodeForPin(z.node, z.pin)).toEqual({ type: 'output', name: 'Z' });
  });

  it('sem rótulo, não define name (cai no padrão IN/OUT)', () => {
    const store = new CircuitStore();
    const def: ChipDefinition = {
      id: 'c2',
      name: 'X',
      inputCount: 1,
      outputCount: 1,
      internal: { nodes: [], wires: [] },
    };
    const chip = store.addChipInstance(def, { x: 0, y: 0 });

    const inPin = pinOf(store, chip.id, 'in0');
    expect(ioNodeForPin(inPin.node, inPin.pin)).toEqual({ type: 'input' });

    const outPin = pinOf(store, chip.id, 'out0');
    expect(ioNodeForPin(outPin.node, outPin.pin)).toEqual({ type: 'output' });
  });
});
