import { describe, expect, it } from 'vitest';
import { CircuitStore } from './store';
import { compile } from './netlist';
import { Simulator } from './engine';
import { pinKey } from './simulator';
import type { CircuitState } from './model';

const N = (s: CircuitStore, x: number, y: number) => s.addNode('nand', { x, y });

describe('Simulator — oscilação e casos de borda', () => {
  it('marca nets oscilantes num oscilador (NAND inversora realimentada nela mesma)', () => {
    // out = ¬(out·out) = ¬out → alterna a cada atraso de porta, nunca converge.
    const s = new CircuitStore();
    const n = N(s, 0, 0);
    const o = s.addNode('output', { x: 160, y: 0 });
    s.addWire({ nodeId: n.id, pinId: 'out' }, { nodeId: n.id, pinId: 'in0' });
    s.addWire({ nodeId: n.id, pinId: 'out' }, { nodeId: n.id, pinId: 'in1' });
    s.addWire({ nodeId: n.id, pinId: 'out' }, { nodeId: o.id, pinId: 'in' });
    const sim = new Simulator(compile(s.toJSON()));
    const snap = sim.snapshot();
    expect(snap.oscillating, 'há nets oscilando').toBeDefined();
    expect(snap.oscillating?.has(pinKey(n.id, 'out')), 'saída da NAND instável').toBe(true);
  });

  it('circuito estável não marca nada como oscilando', () => {
    const s = new CircuitStore();
    const a = s.addNode('input', { x: 0, y: 0 });
    const n = N(s, 100, 0);
    const o = s.addNode('output', { x: 220, y: 0 });
    s.addWire({ nodeId: a.id, pinId: 'out' }, { nodeId: n.id, pinId: 'in0' });
    s.addWire({ nodeId: a.id, pinId: 'out' }, { nodeId: n.id, pinId: 'in1' });
    s.addWire({ nodeId: n.id, pinId: 'out' }, { nodeId: o.id, pinId: 'in' });
    const sim = new Simulator(compile(s.toJSON()));
    sim.setInput(a.id, true);
    expect(sim.snapshot().oscillating?.size ?? 0).toBe(0);
  });

  it('circuito vazio não quebra', () => {
    const empty: CircuitState = { nodes: [], wires: [] };
    const sim = new Simulator(compile(empty));
    sim.advanceTo(0);
    expect(sim.snapshot().pinValues.size).toBe(0);
  });

  it('pino de entrada de NAND sem fio lê false (saída = NOT do outro)', () => {
    const s = new CircuitStore();
    const b = s.addNode('input', { x: 0, y: 0 });
    const n = N(s, 100, 0);
    const o = s.addNode('output', { x: 220, y: 0 });
    // só in1 recebe fio; in0 fica solto (→ false)
    s.addWire({ nodeId: b.id, pinId: 'out' }, { nodeId: n.id, pinId: 'in1' });
    s.addWire({ nodeId: n.id, pinId: 'out' }, { nodeId: o.id, pinId: 'in' });
    const sim = new Simulator(compile(s.toJSON()));
    sim.setInput(b.id, true);
    // NAND(false, true) = true
    expect(sim.snapshot().pinValues.get(pinKey(o.id, 'in'))).toBe(true);
    expect(sim.snapshot().pinValues.get(pinKey(n.id, 'in0'))).toBe(false);
  });

  it('remover fio dispara recompilação que propaga o desligamento', () => {
    const s = new CircuitStore();
    const a = s.addNode('input', { x: 0, y: 0 });
    const bnode = s.addNode('input', { x: 0, y: 60 });
    const n = N(s, 120, 30);
    const o = s.addNode('output', { x: 260, y: 30 });
    const wa = s.addWire({ nodeId: a.id, pinId: 'out' }, { nodeId: n.id, pinId: 'in0' });
    s.addWire({ nodeId: bnode.id, pinId: 'out' }, { nodeId: n.id, pinId: 'in1' });
    s.addWire({ nodeId: n.id, pinId: 'out' }, { nodeId: o.id, pinId: 'in' });
    s.setNodeValue(a.id, true);
    s.setNodeValue(bnode.id, true);

    const sim1 = new Simulator(compile(s.toJSON()));
    sim1.setInput(a.id, true);
    sim1.setInput(bnode.id, true);
    // NAND(1,1) = 0 → saída desligada
    expect(sim1.snapshot().pinValues.get(pinKey(o.id, 'in'))).toBe(false);

    const before = s.topologyVersion;
    s.removeWire(wa.id);
    expect(s.topologyVersion, 'remover fio bumpa a versão de topologia').toBeGreaterThan(before);

    // Recompila após a mudança estrutural: in0 fica solto (false) → NAND(0,1)=1
    const sim2 = new Simulator(compile(s.toJSON()));
    sim2.setInput(bnode.id, true);
    expect(sim2.snapshot().pinValues.get(pinKey(o.id, 'in'))).toBe(true);
  });
});
