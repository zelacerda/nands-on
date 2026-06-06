import { describe, expect, it } from 'vitest';
import { CircuitStore } from './store';
import { compile } from './netlist';
import { Simulator } from './engine';
import { pinKey } from './simulator';

/** Circuito plano (sem chips): A,B → NAND → saída Q. */
function nandCircuit() {
  const s = new CircuitStore();
  const a = s.addNode('input', { x: 0, y: 0 });
  const b = s.addNode('input', { x: 0, y: 60 });
  const n = s.addNode('nand', { x: 120, y: 30 });
  const q = s.addNode('output', { x: 260, y: 30 });
  s.addWire({ nodeId: a.id, pinId: 'out' }, { nodeId: n.id, pinId: 'in0' });
  s.addWire({ nodeId: b.id, pinId: 'out' }, { nodeId: n.id, pinId: 'in1' });
  s.addWire({ nodeId: n.id, pinId: 'out' }, { nodeId: q.id, pinId: 'in' });
  return { state: s.toJSON(), a: a.id, b: b.id, q: q.id };
}

/** SR latch ativo-baixo: S̄,R̄ → 2 NANDs cruzadas → Q, Q̄. */
function srCircuit() {
  const s = new CircuitStore();
  const S = s.addNode('input', { x: 0, y: 0 });
  const R = s.addNode('input', { x: 0, y: 120 });
  const nq = s.addNode('nand', { x: 120, y: 20 });
  const nqn = s.addNode('nand', { x: 120, y: 100 });
  const Q = s.addNode('output', { x: 260, y: 20 });
  s.addWire({ nodeId: S.id, pinId: 'out' }, { nodeId: nq.id, pinId: 'in0' });
  s.addWire({ nodeId: nqn.id, pinId: 'out' }, { nodeId: nq.id, pinId: 'in1' });
  s.addWire({ nodeId: nq.id, pinId: 'out' }, { nodeId: nqn.id, pinId: 'in0' });
  s.addWire({ nodeId: R.id, pinId: 'out' }, { nodeId: nqn.id, pinId: 'in1' });
  s.addWire({ nodeId: nq.id, pinId: 'out' }, { nodeId: Q.id, pinId: 'in' });
  return { state: s.toJSON(), S: S.id, R: R.id, Q: Q.id };
}

/** JK mestre-escravo (13 NANDs de 2 entradas). Devolve ids de J, K, CLK e do NAND Q. */
function jkCircuit() {
  const s = new CircuitStore();
  const J = s.addNode('input', { x: 0, y: 0 });
  const K = s.addNode('input', { x: 0, y: 200 });
  const CLK = s.addNode('input', { x: 0, y: 100 });
  const CLKn = s.addNode('nand', { x: 100, y: 100 });
  const a1 = s.addNode('nand', { x: 200, y: 0 });
  const a1b = s.addNode('nand', { x: 300, y: 0 });
  const n1 = s.addNode('nand', { x: 400, y: 0 });
  const a2 = s.addNode('nand', { x: 200, y: 200 });
  const a2b = s.addNode('nand', { x: 300, y: 200 });
  const n2 = s.addNode('nand', { x: 400, y: 200 });
  const Qm = s.addNode('nand', { x: 500, y: 60 });
  const Qmn = s.addNode('nand', { x: 500, y: 160 });
  const n3 = s.addNode('nand', { x: 600, y: 60 });
  const n4 = s.addNode('nand', { x: 600, y: 160 });
  const Q = s.addNode('nand', { x: 700, y: 60 });
  const Qn = s.addNode('nand', { x: 700, y: 160 });
  const w = (f: string, fp: string, t: string, tp: string) =>
    s.addWire({ nodeId: f, pinId: fp }, { nodeId: t, pinId: tp });
  w(CLK.id, 'out', CLKn.id, 'in0');
  w(CLK.id, 'out', CLKn.id, 'in1');
  w(J.id, 'out', a1.id, 'in0');
  w(CLK.id, 'out', a1.id, 'in1');
  w(a1.id, 'out', a1b.id, 'in0');
  w(a1.id, 'out', a1b.id, 'in1');
  w(a1b.id, 'out', n1.id, 'in0');
  w(Qn.id, 'out', n1.id, 'in1');
  w(K.id, 'out', a2.id, 'in0');
  w(CLK.id, 'out', a2.id, 'in1');
  w(a2.id, 'out', a2b.id, 'in0');
  w(a2.id, 'out', a2b.id, 'in1');
  w(a2b.id, 'out', n2.id, 'in0');
  w(Q.id, 'out', n2.id, 'in1');
  w(n1.id, 'out', Qm.id, 'in0');
  w(Qmn.id, 'out', Qm.id, 'in1');
  w(n2.id, 'out', Qmn.id, 'in0');
  w(Qm.id, 'out', Qmn.id, 'in1');
  w(Qm.id, 'out', n3.id, 'in0');
  w(CLKn.id, 'out', n3.id, 'in1');
  w(Qmn.id, 'out', n4.id, 'in0');
  w(CLKn.id, 'out', n4.id, 'in1');
  w(n3.id, 'out', Q.id, 'in0');
  w(Qn.id, 'out', Q.id, 'in1');
  w(n4.id, 'out', Qn.id, 'in0');
  w(Q.id, 'out', Qn.id, 'in1');
  return { state: s.toJSON(), J: J.id, K: K.id, CLK: CLK.id, Q: Q.id };
}

describe('Simulator (event-driven)', () => {
  it('NAND: tabela-verdade correta', () => {
    const c = nandCircuit();
    const sim = new Simulator(compile(c.state));
    const qKey = pinKey(c.q, 'in');
    for (const [a, b, expected] of [
      [false, false, true],
      [false, true, true],
      [true, false, true],
      [true, true, false],
    ] as Array<[boolean, boolean, boolean]>) {
      sim.setInput(c.a, a);
      sim.setInput(c.b, b);
      expect(sim.snapshot().pinValues.get(qKey), `NAND(${a},${b})`).toBe(expected);
    }
  });

  it('SR latch: set/reset/hold preserva memória entre chamadas', () => {
    const c = srCircuit();
    const sim = new Simulator(compile(c.state));
    const qKey = pinKey(c.Q, 'in');
    const read = () => sim.snapshot().pinValues.get(qKey);

    sim.setInput(c.S, false); // S̄=0 → set
    sim.setInput(c.R, true);
    expect(read(), 'set').toBe(true);

    sim.setInput(c.S, true); // hold (ambos 1)
    expect(read(), 'hold após set').toBe(true);

    sim.setInput(c.R, false); // R̄=0 → reset
    expect(read(), 'reset').toBe(false);

    sim.setInput(c.R, true); // hold
    expect(read(), 'hold após reset').toBe(false);
  });

  it('JK mestre-escravo: hold / set / reset / toggle', () => {
    const c = jkCircuit();
    const sim = new Simulator(compile(c.state));
    const qKey = pinKey(c.Q, 'out');
    // Um ciclo de clock: sobe (mestre captura) e desce (escravo copia).
    const cycle = () => {
      sim.setInput(c.CLK, true);
      sim.setInput(c.CLK, false);
      return sim.snapshot().pinValues.get(qKey) ?? false;
    };

    // SET: J=1,K=0 → Q=1, e segura em HOLD (J=K=0).
    sim.setInput(c.J, true);
    sim.setInput(c.K, false);
    cycle();
    expect(sim.snapshot().pinValues.get(qKey), 'set').toBe(true);
    sim.setInput(c.J, false);
    expect(cycle(), 'hold após set').toBe(true);

    // RESET: J=0,K=1 → Q=0.
    sim.setInput(c.K, true);
    cycle();
    expect(sim.snapshot().pinValues.get(qKey), 'reset').toBe(false);

    // TOGGLE: J=K=1 inverte a cada ciclo.
    sim.setInput(c.J, true);
    sim.setInput(c.K, true);
    const seq = [cycle(), cycle(), cycle(), cycle()];
    let toggles = 0;
    for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) toggles++;
    expect(toggles, `toggle seq=${seq.map((b) => (b ? 1 : 0)).join('')}`).toBe(seq.length - 1);
  });
});
