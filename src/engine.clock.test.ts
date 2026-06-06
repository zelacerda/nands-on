import { describe, expect, it } from 'vitest';
import { CircuitStore } from './store';
import { compile } from './netlist';
import { Simulator } from './engine';
import { clockValue, pinKey } from './simulator';
import type { CircuitState } from './model';

const N = (s: CircuitStore, x: number, y: number) => s.addNode('nand', { x, y });

/** Marca um nó de entrada como clock (como o usuário faria via cycleInputState). */
function markClock(state: CircuitState, id: string): void {
  state.nodes.find((n) => n.id === id)!.clock = true;
}

/** NAND combinacional alimentada por clock (A) e por uma entrada estática (B). */
function clockedNand() {
  const s = new CircuitStore();
  const CLK = s.addNode('input', { x: 0, y: 0 });
  const B = s.addNode('input', { x: 0, y: 60 });
  const n = N(s, 120, 30);
  const Q = s.addNode('output', { x: 260, y: 30 });
  s.addWire({ nodeId: CLK.id, pinId: 'out' }, { nodeId: n.id, pinId: 'in0' });
  s.addWire({ nodeId: B.id, pinId: 'out' }, { nodeId: n.id, pinId: 'in1' });
  s.addWire({ nodeId: n.id, pinId: 'out' }, { nodeId: Q.id, pinId: 'in' });
  const state = s.toJSON();
  markClock(state, CLK.id);
  return { state, B: B.id, Q: Q.id };
}

/** Gated D latch (4 NANDs): transparente com CLK alto, segura com CLK baixo. */
function gatedDLatch() {
  const s = new CircuitStore();
  const D = s.addNode('input', { x: 0, y: 0 });
  const CLK = s.addNode('input', { x: 0, y: 120 });
  const n1 = N(s, 150, 20), n2 = N(s, 150, 100), Q = N(s, 300, 20), Qn = N(s, 300, 100);
  const w = (f: string, fp: string, t: string, tp: string) =>
    s.addWire({ nodeId: f, pinId: fp }, { nodeId: t, pinId: tp });
  w(D.id, 'out', n1.id, 'in0'); w(CLK.id, 'out', n1.id, 'in1');
  w(n1.id, 'out', n2.id, 'in0'); w(CLK.id, 'out', n2.id, 'in1');
  w(n1.id, 'out', Q.id, 'in0'); w(Qn.id, 'out', Q.id, 'in1');
  w(n2.id, 'out', Qn.id, 'in0'); w(Q.id, 'out', Qn.id, 'in1');
  const state = s.toJSON();
  markClock(state, CLK.id);
  return { state, D: D.id, Q: Q.id };
}

/** JK mestre-escravo (13 NANDs de 2 entradas), CLK em modo clock. */
function masterSlaveJK() {
  const s = new CircuitStore();
  const J = s.addNode('input', { x: 0, y: 0 });
  const K = s.addNode('input', { x: 0, y: 200 });
  const CLK = s.addNode('input', { x: 0, y: 100 });
  const CLKn = N(s, 100, 100), a1 = N(s, 200, 0), a1b = N(s, 300, 0), n1 = N(s, 400, 0);
  const a2 = N(s, 200, 200), a2b = N(s, 300, 200), n2 = N(s, 400, 200);
  const Qm = N(s, 500, 60), Qmn = N(s, 500, 160), n3 = N(s, 600, 60), n4 = N(s, 600, 160);
  const Q = N(s, 700, 60), Qn = N(s, 700, 160);
  const w = (f: string, fp: string, t: string, tp: string) =>
    s.addWire({ nodeId: f, pinId: fp }, { nodeId: t, pinId: tp });
  w(CLK.id, 'out', CLKn.id, 'in0'); w(CLK.id, 'out', CLKn.id, 'in1');
  w(J.id, 'out', a1.id, 'in0'); w(CLK.id, 'out', a1.id, 'in1');
  w(a1.id, 'out', a1b.id, 'in0'); w(a1.id, 'out', a1b.id, 'in1');
  w(a1b.id, 'out', n1.id, 'in0'); w(Qn.id, 'out', n1.id, 'in1');
  w(K.id, 'out', a2.id, 'in0'); w(CLK.id, 'out', a2.id, 'in1');
  w(a2.id, 'out', a2b.id, 'in0'); w(a2.id, 'out', a2b.id, 'in1');
  w(a2b.id, 'out', n2.id, 'in0'); w(Q.id, 'out', n2.id, 'in1');
  w(n1.id, 'out', Qm.id, 'in0'); w(Qmn.id, 'out', Qm.id, 'in1');
  w(n2.id, 'out', Qmn.id, 'in0'); w(Qm.id, 'out', Qmn.id, 'in1');
  w(Qm.id, 'out', n3.id, 'in0'); w(CLKn.id, 'out', n3.id, 'in1');
  w(Qmn.id, 'out', n4.id, 'in0'); w(CLKn.id, 'out', n4.id, 'in1');
  w(n3.id, 'out', Q.id, 'in0'); w(Qn.id, 'out', Q.id, 'in1');
  w(n4.id, 'out', Qn.id, 'in0'); w(Q.id, 'out', Qn.id, 'in1');
  const state = s.toJSON();
  markClock(state, CLK.id);
  return { state, J: J.id, K: K.id, Q: Q.id };
}

describe('clock como nível (advanceTo)', () => {
  it('a lógica combinacional acompanha o nível do clock (anti-fase numa NAND)', () => {
    const c = clockedNand();
    const sim = new Simulator(compile(c.state));
    const qKey = pinKey(c.Q, 'in');
    sim.setInput(c.B, true); // B=1: saída = ¬CLK
    // clockValue: alto em [0,500), baixo em [500,1000).
    sim.advanceTo(100); // CLK alto
    expect(sim.snapshot().pinValues.get(qKey), 'CLK alto → saída baixa').toBe(false);
    sim.advanceTo(600); // CLK baixo
    expect(sim.snapshot().pinValues.get(qKey), 'CLK baixo → saída alta').toBe(true);
  });

  it('gated D latch: transparente com CLK alto, segura com CLK baixo', () => {
    const c = gatedDLatch();
    const sim = new Simulator(compile(c.state));
    const qKey = pinKey(c.Q, 'out');
    sim.setInput(c.D, true);
    sim.advanceTo(100); // alto → transparente, Q=D=1
    expect(sim.snapshot().pinValues.get(qKey), 'transparente D=1').toBe(true);
    sim.advanceTo(600); // baixo → segura
    sim.setInput(c.D, false); // muda D com clock baixo
    expect(sim.snapshot().pinValues.get(qKey), 'segura com CLK baixo').toBe(true);
    sim.advanceTo(1100); // alto de novo → captura D=0
    expect(sim.snapshot().pinValues.get(qKey), 'transparente D=0').toBe(false);
  });

  it('JK mestre-escravo: alterna a cada ciclo sob clock automático (J=K=1)', () => {
    const c = masterSlaveJK();
    const sim = new Simulator(compile(c.state));
    const qKey = pinKey(c.Q, 'out');
    sim.setInput(c.J, true);
    sim.setInput(c.K, true);
    const seq: number[] = [];
    for (let cyc = 0; cyc < 6; cyc++) {
      sim.advanceTo(cyc * 1000 + 100); // fase alta (mestre captura)
      sim.advanceTo(cyc * 1000 + 600); // fase baixa (escravo copia)
      seq.push(sim.snapshot().pinValues.get(qKey) ? 1 : 0);
    }
    let toggles = 0;
    for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) toggles++;
    expect(toggles, `toggle seq=${seq.join('')}`).toBe(seq.length - 1);
  });

  it('clockValue: nível alto na 1ª metade do período, baixo na 2ª', () => {
    expect(clockValue(0)).toBe(true);
    expect(clockValue(600)).toBe(false);
  });
});
