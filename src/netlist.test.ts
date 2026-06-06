import { describe, expect, it } from 'vitest';
import { CircuitStore } from './store';
import { captureDefinition } from './chip';
import type { ChipDefinition, CircuitState } from './model';
import { simulate, pinKey, type ChipResolver, type SignalState } from './simulator';
import { compile, liftSignal, type CompiledNetlist } from './netlist';

function resolverFor(...defs: ChipDefinition[]): ChipResolver {
  const byId = new Map(defs.map((d) => [d.id, d.internal]));
  return (node) => (node.defId ? byId.get(node.defId) : undefined);
}

/** NOT (1→1) a partir de uma NAND. */
function notChip(): ChipDefinition {
  const s = new CircuitStore();
  const a = s.addNode('input', { x: 0, y: 0 });
  const n = s.addNode('nand', { x: 100, y: 0 });
  const o = s.addNode('output', { x: 220, y: 0 });
  s.addWire({ nodeId: a.id, pinId: 'out' }, { nodeId: n.id, pinId: 'in0' });
  s.addWire({ nodeId: a.id, pinId: 'out' }, { nodeId: n.id, pinId: 'in1' });
  s.addWire({ nodeId: n.id, pinId: 'out' }, { nodeId: o.id, pinId: 'in' });
  return captureDefinition(s.toJSON(), 'NOT');
}

/** AND (2→1) = NAND seguida de um chip NOT (testa aninhamento). */
function andChip(not: ChipDefinition): ChipDefinition {
  const s = new CircuitStore();
  const a = s.addNode('input', { x: 0, y: 0 });
  const b = s.addNode('input', { x: 0, y: 80 });
  const nand = s.addNode('nand', { x: 100, y: 40 });
  const inv = s.addChipInstance(not, { x: 240, y: 40 });
  const o = s.addNode('output', { x: 380, y: 40 });
  s.addWire({ nodeId: a.id, pinId: 'out' }, { nodeId: nand.id, pinId: 'in0' });
  s.addWire({ nodeId: b.id, pinId: 'out' }, { nodeId: nand.id, pinId: 'in1' });
  s.addWire({ nodeId: nand.id, pinId: 'out' }, { nodeId: inv.id, pinId: 'in0' });
  s.addWire({ nodeId: inv.id, pinId: 'out0' }, { nodeId: o.id, pinId: 'in' });
  return captureDefinition(s.toJSON(), 'AND');
}

/** SR Latch (2→2) com duas NANDs cruzadas. Entradas S (topo) / R (base). */
function srLatchChip(): ChipDefinition {
  const s = new CircuitStore();
  const S = s.addNode('input', { x: 0, y: 0 });
  const R = s.addNode('input', { x: 0, y: 120 });
  const nq = s.addNode('nand', { x: 120, y: 20 });
  const nqn = s.addNode('nand', { x: 120, y: 100 });
  const Q = s.addNode('output', { x: 260, y: 20 });
  const Qn = s.addNode('output', { x: 260, y: 100 });
  s.addWire({ nodeId: S.id, pinId: 'out' }, { nodeId: nq.id, pinId: 'in0' });
  s.addWire({ nodeId: nqn.id, pinId: 'out' }, { nodeId: nq.id, pinId: 'in1' });
  s.addWire({ nodeId: R.id, pinId: 'out' }, { nodeId: nqn.id, pinId: 'in1' });
  s.addWire({ nodeId: nq.id, pinId: 'out' }, { nodeId: nqn.id, pinId: 'in0' });
  s.addWire({ nodeId: nq.id, pinId: 'out' }, { nodeId: Q.id, pinId: 'in' });
  s.addWire({ nodeId: nqn.id, pinId: 'out' }, { nodeId: Qn.id, pinId: 'in' });
  return captureDefinition(s.toJSON(), 'SRLatch');
}

/** Monta um circuito de topo com uma instância de chip ligada a I/O em ordem. */
function topWithChip(def: ChipDefinition) {
  const store = new CircuitStore();
  const inIds: string[] = [];
  const outIds: string[] = [];
  for (let i = 0; i < def.inputCount; i++) {
    inIds.push(store.addNode('input', { x: 0, y: i * 60 }).id);
  }
  const chip = store.addChipInstance(def, { x: 200, y: 0 });
  for (let i = 0; i < def.outputCount; i++) {
    outIds.push(store.addNode('output', { x: 500, y: i * 60 }).id);
  }
  inIds.forEach((id, i) =>
    store.addWire({ nodeId: id, pinId: 'out' }, { nodeId: chip.id, pinId: `in${i}` }),
  );
  outIds.forEach((id, i) =>
    store.addWire({ nodeId: chip.id, pinId: `out${i}` }, { nodeId: id, pinId: 'in' }),
  );
  return { store, inIds, outIds, chipId: chip.id };
}

/** Verifica que os sinais de topo do circuito plano (liftados) batem com o original. */
function expectEquivalent(orig: SignalState, lifted: SignalState, nl: CompiledNetlist): void {
  for (const k of nl.pinMap.keys()) {
    expect(lifted.pinValues.get(k) ?? false, `pino ${k}`).toBe(orig.pinValues.get(k) ?? false);
  }
  for (const k of nl.wireMap.keys()) {
    expect(lifted.wireValues.get(k) ?? false, `fio ${k}`).toBe(orig.wireValues.get(k) ?? false);
  }
}

/** Define um valor de entrada tanto no estado de topo quanto no circuito plano. */
function setInput(top: CircuitState, flat: CircuitState, nodeId: string, v: boolean): void {
  top.nodes.find((n) => n.id === nodeId)!.value = v;
  const fn = flat.nodes.find((n) => n.id === nodeId);
  if (fn) fn.value = v;
}

describe('compile() — achatamento de netlist', () => {
  it('não deixa nenhum nó chip no circuito plano', () => {
    const not = notChip();
    const { store } = topWithChip(andChip(not));
    const nl = compile(store.toJSON(), resolverFor(andChip(not), not));
    expect(nl.flat.nodes.some((n) => n.type === 'chip')).toBe(false);
  });

  it('NOT: tabela-verdade equivale ao motor hierárquico', () => {
    const not = notChip();
    const { store, inIds, outIds } = topWithChip(not);
    const resolver = resolverFor(not);
    const top = store.toJSON();
    const nl = compile(top, resolver);
    for (const v of [false, true]) {
      setInput(top, nl.flat, inIds[0]!, v);
      const orig = simulate(top, resolver, undefined, 0);
      const flat = simulate(nl.flat, undefined, undefined, 0);
      expectEquivalent(orig, liftSignal(flat, nl), nl);
      expect(orig.pinValues.get(pinKey(outIds[0]!, 'in'))).toBe(!v);
    }
  });

  it('AND aninhado (NAND + chip NOT): tabela-verdade correta e equivalente', () => {
    const not = notChip();
    const and = andChip(not);
    const { store, inIds, outIds } = topWithChip(and);
    const resolver = resolverFor(and, not);
    const top = store.toJSON();
    const nl = compile(top, resolver);
    for (const a of [false, true]) {
      for (const b of [false, true]) {
        setInput(top, nl.flat, inIds[0]!, a);
        setInput(top, nl.flat, inIds[1]!, b);
        const orig = simulate(top, resolver, undefined, 0);
        const flat = simulate(nl.flat, undefined, undefined, 0);
        expectEquivalent(orig, liftSignal(flat, nl), nl);
        expect(orig.pinValues.get(pinKey(outIds[0]!, 'in'))).toBe(a && b);
      }
    }
  });

  it('SR Latch (sequencial): preserva memória e equivale ao motor hierárquico', () => {
    const sr = srLatchChip();
    const { store, inIds, outIds } = topWithChip(sr);
    const resolver = resolverFor(sr);
    const top = store.toJSON();
    const nl = compile(top, resolver);
    const [S, R] = inIds as [string, string];
    const [Q] = outIds as [string];

    let prevOrig: SignalState | undefined;
    let prevFlat: SignalState | undefined;
    // NAND latch é ATIVO-BAIXO (S̄/R̄): set/reset em 0, ambos 1 = hold.
    const seq: Array<[boolean, boolean, boolean]> = [
      [false, true, true], // S̄=0 → set → Q=1
      [true, true, true], // hold → Q=1
      [true, false, false], // R̄=0 → reset → Q=0
      [true, true, false], // hold → Q=0
    ];
    for (const [s, r, expectedQ] of seq) {
      setInput(top, nl.flat, S, s);
      setInput(top, nl.flat, R, r);
      prevOrig = simulate(top, resolver, prevOrig, 0);
      prevFlat = simulate(nl.flat, undefined, prevFlat, 0);
      expectEquivalent(prevOrig, liftSignal(prevFlat, nl), nl);
      expect(prevOrig.pinValues.get(pinKey(Q, 'in')), `Q após S=${s} R=${r}`).toBe(expectedQ);
    }
  });
});
