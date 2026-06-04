import { describe, expect, it } from 'vitest';
import { CircuitStore } from './store';
import { captureDefinition } from './chip';
import type { ChipDefinition } from './model';
import { CLOCK_PERIOD_MS, type ChipResolver, clockValue, pinKey, simulate } from './simulator';

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

/** Definição de uma OR (2 entradas, 1 saída) montada com três NANDs. */
function orChip(): ChipDefinition {
  const store = new CircuitStore();
  const a = store.addNode('input', { x: 0, y: 0 });
  const b = store.addNode('input', { x: 0, y: 80 });
  const na = store.addNode('nand', { x: 100, y: 0 }); // ¬a
  const nb = store.addNode('nand', { x: 100, y: 80 }); // ¬b
  const orN = store.addNode('nand', { x: 220, y: 40 }); // NAND(¬a, ¬b) = a ∨ b
  const out = store.addNode('output', { x: 340, y: 40 });
  store.addWire({ nodeId: a.id, pinId: 'out' }, { nodeId: na.id, pinId: 'in0' });
  store.addWire({ nodeId: a.id, pinId: 'out' }, { nodeId: na.id, pinId: 'in1' });
  store.addWire({ nodeId: b.id, pinId: 'out' }, { nodeId: nb.id, pinId: 'in0' });
  store.addWire({ nodeId: b.id, pinId: 'out' }, { nodeId: nb.id, pinId: 'in1' });
  store.addWire({ nodeId: na.id, pinId: 'out' }, { nodeId: orN.id, pinId: 'in0' });
  store.addWire({ nodeId: nb.id, pinId: 'out' }, { nodeId: orN.id, pinId: 'in1' });
  store.addWire({ nodeId: orN.id, pinId: 'out' }, { nodeId: out.id, pinId: 'in' });
  return captureDefinition(store.toJSON(), 'OR');
}

/** Definição de uma NOR (2 entradas, 1 saída) = OR seguida de NOT, em NANDs. */
function norChip(): ChipDefinition {
  const store = new CircuitStore();
  const a = store.addNode('input', { x: 0, y: 0 });
  const b = store.addNode('input', { x: 0, y: 80 });
  const na = store.addNode('nand', { x: 100, y: 0 }); // ¬a
  const nb = store.addNode('nand', { x: 100, y: 80 }); // ¬b
  const orN = store.addNode('nand', { x: 220, y: 40 }); // a ∨ b
  const inv = store.addNode('nand', { x: 340, y: 40 }); // ¬(a ∨ b)
  const out = store.addNode('output', { x: 460, y: 40 });
  store.addWire({ nodeId: a.id, pinId: 'out' }, { nodeId: na.id, pinId: 'in0' });
  store.addWire({ nodeId: a.id, pinId: 'out' }, { nodeId: na.id, pinId: 'in1' });
  store.addWire({ nodeId: b.id, pinId: 'out' }, { nodeId: nb.id, pinId: 'in0' });
  store.addWire({ nodeId: b.id, pinId: 'out' }, { nodeId: nb.id, pinId: 'in1' });
  store.addWire({ nodeId: na.id, pinId: 'out' }, { nodeId: orN.id, pinId: 'in0' });
  store.addWire({ nodeId: nb.id, pinId: 'out' }, { nodeId: orN.id, pinId: 'in1' });
  store.addWire({ nodeId: orN.id, pinId: 'out' }, { nodeId: inv.id, pinId: 'in0' });
  store.addWire({ nodeId: orN.id, pinId: 'out' }, { nodeId: inv.id, pinId: 'in1' });
  store.addWire({ nodeId: inv.id, pinId: 'out' }, { nodeId: out.id, pinId: 'in' });
  return captureDefinition(store.toJSON(), 'NOR');
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

  it('avalia uma OR montada com três NANDs', () => {
    const or = orChip();
    const store = new CircuitStore();
    const a = store.addNode('input', { x: 0, y: 0 });
    const b = store.addNode('input', { x: 0, y: 60 });
    const chip = store.addChipInstance(or, { x: 100, y: 0 });
    const out = store.addNode('output', { x: 260, y: 0 });
    store.addWire({ nodeId: a.id, pinId: 'out' }, { nodeId: chip.id, pinId: 'in0' });
    store.addWire({ nodeId: b.id, pinId: 'out' }, { nodeId: chip.id, pinId: 'in1' });
    store.addWire({ nodeId: chip.id, pinId: 'out0' }, { nodeId: out.id, pinId: 'in' });

    const resolve = resolverFor(or);
    const cases: Array<[boolean, boolean, boolean]> = [
      [false, false, false],
      [false, true, true],
      [true, false, true],
      [true, true, true],
    ];
    for (const [va, vb, expected] of cases) {
      store.setNodeValue(a.id, va);
      store.setNodeValue(b.id, vb);
      const sig = simulate(store.toJSON(), resolve);
      expect(sig.pinValues.get(pinKey(out.id, 'in')), `OR(${va}, ${vb})`).toBe(expected);
    }
  });

  it('avalia uma NOR montada com quatro NANDs', () => {
    const nor = norChip();
    const store = new CircuitStore();
    const a = store.addNode('input', { x: 0, y: 0 });
    const b = store.addNode('input', { x: 0, y: 60 });
    const chip = store.addChipInstance(nor, { x: 100, y: 0 });
    const out = store.addNode('output', { x: 260, y: 0 });
    store.addWire({ nodeId: a.id, pinId: 'out' }, { nodeId: chip.id, pinId: 'in0' });
    store.addWire({ nodeId: b.id, pinId: 'out' }, { nodeId: chip.id, pinId: 'in1' });
    store.addWire({ nodeId: chip.id, pinId: 'out0' }, { nodeId: out.id, pinId: 'in' });

    const resolve = resolverFor(nor);
    const cases: Array<[boolean, boolean, boolean]> = [
      [false, false, true],
      [false, true, false],
      [true, false, false],
      [true, true, false],
    ];
    for (const [va, vb, expected] of cases) {
      store.setNodeValue(a.id, va);
      store.setNodeValue(b.id, vb);
      const sig = simulate(store.toJSON(), resolve);
      expect(sig.pinValues.get(pinKey(out.id, 'in')), `NOR(${va}, ${vb})`).toBe(expected);
    }
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

/**
 * Monta um SR Latch com duas NORs realimentadas:
 * `Q = NOR(R, Q̄)` e `Q̄ = NOR(S, Q)`. Retorna o store e as referências dos
 * nós para acionar S/R e ler Q/Q̄.
 */
function srLatchStore(nor: ChipDefinition) {
  const store = new CircuitStore();
  const s = store.addNode('input', { x: 0, y: 0 });
  const r = store.addNode('input', { x: 0, y: 160 });
  const norQ = store.addChipInstance(nor, { x: 160, y: 0 }); // saída = Q
  const norQbar = store.addChipInstance(nor, { x: 160, y: 160 }); // saída = Q̄
  const q = store.addNode('output', { x: 340, y: 0 });
  const qbar = store.addNode('output', { x: 340, y: 160 });
  store.addWire({ nodeId: r.id, pinId: 'out' }, { nodeId: norQ.id, pinId: 'in0' });
  store.addWire({ nodeId: norQbar.id, pinId: 'out0' }, { nodeId: norQ.id, pinId: 'in1' }); // realimentação
  store.addWire({ nodeId: s.id, pinId: 'out' }, { nodeId: norQbar.id, pinId: 'in0' });
  store.addWire({ nodeId: norQ.id, pinId: 'out0' }, { nodeId: norQbar.id, pinId: 'in1' }); // realimentação
  store.addWire({ nodeId: norQ.id, pinId: 'out0' }, { nodeId: q.id, pinId: 'in' });
  store.addWire({ nodeId: norQbar.id, pinId: 'out0' }, { nodeId: qbar.id, pinId: 'in' });
  return { store, s, r, q, qbar };
}

describe('simulate — circuitos sequenciais (realimentação)', () => {
  it('SR Latch (NORs) reproduz a tabela-verdade, incluindo o estado de hold', () => {
    const nor = norChip();
    const { store, s, r, q, qbar } = srLatchStore(nor);
    const resolve = resolverFor(nor);

    const read = (sig: ReturnType<typeof simulate>) => ({
      q: sig.pinValues.get(pinKey(q.id, 'in')) ?? false,
      qbar: sig.pinValues.get(pinKey(qbar.id, 'in')) ?? false,
    });
    // Aplica S/R e avança a simulação preservando o estado anterior.
    let sig = simulate(store.toJSON(), resolve);
    const step = (sv: boolean, rv: boolean) => {
      store.setNodeValue(s.id, sv);
      store.setNodeValue(r.id, rv);
      sig = simulate(store.toJSON(), resolve, sig);
      return read(sig);
    };

    // Set: S=1, R=0 ⇒ Q=1, Q̄=0.
    expect(step(true, false)).toEqual({ q: true, qbar: false });
    // Hold: S=0, R=0 ⇒ mantém Q=1.
    expect(step(false, false)).toEqual({ q: true, qbar: false });
    // Reset: S=0, R=1 ⇒ Q=0, Q̄=1.
    expect(step(false, true)).toEqual({ q: false, qbar: true });
    // Hold: S=0, R=0 ⇒ mantém Q=0.
    expect(step(false, false)).toEqual({ q: false, qbar: true });
    // Proibido: S=1, R=1 ⇒ ambos 0.
    expect(step(true, true)).toEqual({ q: false, qbar: false });
  });

  it('preserva o estado de um latch encapsulado dentro de um chip', () => {
    const nor = norChip();
    const { store: latchStore } = srLatchStore(nor);
    const latch = captureDefinition(latchStore.toJSON(), 'SR'); // 2 entradas (S,R), 2 saídas (Q,Q̄)

    const store = new CircuitStore();
    const s = store.addNode('input', { x: 0, y: 0 });
    const r = store.addNode('input', { x: 0, y: 160 });
    const chip = store.addChipInstance(latch, { x: 160, y: 0 });
    const q = store.addNode('output', { x: 360, y: 0 });
    store.addWire({ nodeId: s.id, pinId: 'out' }, { nodeId: chip.id, pinId: 'in0' });
    store.addWire({ nodeId: r.id, pinId: 'out' }, { nodeId: chip.id, pinId: 'in1' });
    store.addWire({ nodeId: chip.id, pinId: 'out0' }, { nodeId: q.id, pinId: 'in' });

    const resolve = resolverFor(nor, latch);
    let sig = simulate(store.toJSON(), resolve);
    const step = (sv: boolean, rv: boolean) => {
      store.setNodeValue(s.id, sv);
      store.setNodeValue(r.id, rv);
      sig = simulate(store.toJSON(), resolve, sig);
      return sig.pinValues.get(pinKey(q.id, 'in')) ?? false;
    };

    expect(step(true, false)).toBe(true); // Set ⇒ Q=1
    expect(step(false, false)).toBe(true); // Hold ⇒ mantém Q=1 (memória interna do chip)
    expect(step(false, true)).toBe(false); // Reset ⇒ Q=0
    expect(step(false, false)).toBe(false); // Hold ⇒ mantém Q=0
  });
});

describe('simulate — clock', () => {
  const HALF = CLOCK_PERIOD_MS / 2;

  it('clockValue liga na 1ª metade do período e desliga na 2ª, repetindo', () => {
    expect(clockValue(0)).toBe(true);
    expect(clockValue(HALF - 1)).toBe(true);
    expect(clockValue(HALF)).toBe(false);
    expect(clockValue(CLOCK_PERIOD_MS - 1)).toBe(false);
    expect(clockValue(CLOCK_PERIOD_MS)).toBe(true); // novo ciclo
  });

  it('uma entrada em modo clock oscila a saída conforme o instante `now`', () => {
    const store = new CircuitStore();
    const clk = store.addNode('input', { x: 0, y: 0 });
    store.cycleInputState(clk.id); // OFF → ON
    store.cycleInputState(clk.id); // ON → CLK
    const out = store.addNode('output', { x: 100, y: 0 });
    store.addWire({ nodeId: clk.id, pinId: 'out' }, { nodeId: out.id, pinId: 'in' });

    const at = (now: number) =>
      simulate(store.toJSON(), undefined, undefined, now).pinValues.get(pinKey(out.id, 'in')) ??
      false;

    expect(at(0)).toBe(true);
    expect(at(HALF - 1)).toBe(true);
    expect(at(HALF)).toBe(false);
    expect(at(CLOCK_PERIOD_MS - 1)).toBe(false);
    expect(at(CLOCK_PERIOD_MS)).toBe(true);
  });

  it('uma entrada em modo clock encapsulada num chip continua oscilando', () => {
    // Chip sem entradas e com 1 saída, alimentada por um clock interno.
    const inner = new CircuitStore();
    const clk = inner.addNode('input', { x: 0, y: 0 });
    inner.cycleInputState(clk.id); // OFF → ON
    inner.cycleInputState(clk.id); // ON → CLK
    const o = inner.addNode('output', { x: 100, y: 0 });
    inner.addWire({ nodeId: clk.id, pinId: 'out' }, { nodeId: o.id, pinId: 'in' });
    const clockChip = captureDefinition(inner.toJSON(), 'CLK');
    expect(clockChip.inputCount).toBe(0); // entrada em modo clock não vira pino externo
    expect(clockChip.outputCount).toBe(1);

    const store = new CircuitStore();
    const chip = store.addChipInstance(clockChip, { x: 0, y: 0 });
    const out = store.addNode('output', { x: 200, y: 0 });
    store.addWire({ nodeId: chip.id, pinId: 'out0' }, { nodeId: out.id, pinId: 'in' });

    const resolve = resolverFor(clockChip);
    const at = (now: number) =>
      simulate(store.toJSON(), resolve, undefined, now).pinValues.get(pinKey(out.id, 'in')) ??
      false;

    expect(at(0)).toBe(true);
    expect(at(HALF)).toBe(false);
    expect(at(CLOCK_PERIOD_MS)).toBe(true);
  });
});
