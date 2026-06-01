import { describe, expect, it } from 'vitest';
import { CircuitStore } from './store';
import { captureDefinition } from './chip';
import type { ChipDefinition } from './model';
import { type ChipResolver, pinKey, simulate } from './simulator';

/** Resolver que mapeia cada nó `chip` à topologia interna da sua definição. */
function resolverFor(...defs: ChipDefinition[]): ChipResolver {
  const byId = new Map(defs.map((d) => [d.id, d.internal]));
  return (node) => (node.defId ? byId.get(node.defId) : undefined);
}

/** Definição de um chip NOT (1 entrada, 1 saída) feito a partir de uma NAND. */
function notChip(): ChipDefinition {
  const store = new CircuitStore();
  const inp = store.addNode('input', { x: 0, y: 0 });
  const nand = store.addNode('nand', { x: 100, y: 0 });
  const out = store.addNode('output', { x: 220, y: 0 });
  store.addWire({ nodeId: inp.id, pinId: 'out' }, { nodeId: nand.id, pinId: 'in0' });
  store.addWire({ nodeId: inp.id, pinId: 'out' }, { nodeId: nand.id, pinId: 'in1' });
  store.addWire({ nodeId: nand.id, pinId: 'out' }, { nodeId: out.id, pinId: 'in' });
  return captureDefinition(store.toJSON(), 'NOT');
}

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

describe('simulate — chips', () => {
  it('avalia um chip simples (NOT) a partir da topologia interna', () => {
    const not = notChip();
    const store = new CircuitStore();
    const inp = store.addNode('input', { x: 0, y: 0 });
    const chip = store.addChipInstance(not, { x: 100, y: 0 });
    const out = store.addNode('output', { x: 240, y: 0 });
    store.addWire({ nodeId: inp.id, pinId: 'out' }, { nodeId: chip.id, pinId: 'in0' });
    store.addWire({ nodeId: chip.id, pinId: 'out0' }, { nodeId: out.id, pinId: 'in' });

    const resolve = resolverFor(not);
    store.setNodeValue(inp.id, true);
    expect(simulate(store.toJSON(), resolve).pinValues.get(pinKey(out.id, 'in'))).toBe(false);
    store.setNodeValue(inp.id, false);
    expect(simulate(store.toJSON(), resolve).pinValues.get(pinKey(out.id, 'in'))).toBe(true);
  });

  it('avalia chip aninhado (NOT dentro de outro chip) = dupla negação', () => {
    const not = notChip();
    // Chip externo "BUFFER": input → NOT → NOT → output (identidade).
    const inner = new CircuitStore();
    const iIn = inner.addNode('input', { x: 0, y: 0 });
    const n1 = inner.addChipInstance(not, { x: 80, y: 0 });
    const n2 = inner.addChipInstance(not, { x: 200, y: 0 });
    const iOut = inner.addNode('output', { x: 320, y: 0 });
    inner.addWire({ nodeId: iIn.id, pinId: 'out' }, { nodeId: n1.id, pinId: 'in0' });
    inner.addWire({ nodeId: n1.id, pinId: 'out0' }, { nodeId: n2.id, pinId: 'in0' });
    inner.addWire({ nodeId: n2.id, pinId: 'out0' }, { nodeId: iOut.id, pinId: 'in' });
    const buffer = captureDefinition(inner.toJSON(), 'BUFFER');

    const store = new CircuitStore();
    const inp = store.addNode('input', { x: 0, y: 0 });
    const chip = store.addChipInstance(buffer, { x: 100, y: 0 });
    const out = store.addNode('output', { x: 240, y: 0 });
    store.addWire({ nodeId: inp.id, pinId: 'out' }, { nodeId: chip.id, pinId: 'in0' });
    store.addWire({ nodeId: chip.id, pinId: 'out0' }, { nodeId: out.id, pinId: 'in' });

    const resolve = resolverFor(not, buffer);
    store.setNodeValue(inp.id, true);
    expect(simulate(store.toJSON(), resolve).pinValues.get(pinKey(out.id, 'in'))).toBe(true);
    store.setNodeValue(inp.id, false);
    expect(simulate(store.toJSON(), resolve).pinValues.get(pinKey(out.id, 'in'))).toBe(false);
  });
});
