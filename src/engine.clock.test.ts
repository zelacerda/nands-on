import { describe, expect, it } from 'vitest';
import { CircuitStore } from './store';
import { compile } from './netlist';
import { Simulator } from './engine';
import { CLOCK_PERIOD_MS, pinKey } from './simulator';
import type { CircuitState } from './model';

const N = (s: CircuitStore, x: number, y: number) => s.addNode('nand', { x, y });

/** Marca um nó de entrada como clock (como o usuário faria via cycleInputState). */
function markClock(state: CircuitState, id: string): void {
  state.nodes.find((n) => n.id === id)!.clock = true;
}

/** JK level-triggered MÍNIMO (2 NAND3 decompostas + 2 NAND), com CLK em modo clock. */
function naiveJK() {
  const s = new CircuitStore();
  const J = s.addNode('input', { x: 0, y: 0 });
  const K = s.addNode('input', { x: 0, y: 200 });
  const CLK = s.addNode('input', { x: 0, y: 100 });
  const a1 = N(s, 200, 0), a1b = N(s, 300, 0), n1 = N(s, 400, 0);
  const a2 = N(s, 200, 200), a2b = N(s, 300, 200), n2 = N(s, 400, 200);
  const Q = N(s, 500, 60), Qn = N(s, 500, 160);
  const w = (f: string, fp: string, t: string, tp: string) =>
    s.addWire({ nodeId: f, pinId: fp }, { nodeId: t, pinId: tp });
  w(J.id, 'out', a1.id, 'in0'); w(CLK.id, 'out', a1.id, 'in1');
  w(a1.id, 'out', a1b.id, 'in0'); w(a1.id, 'out', a1b.id, 'in1');
  w(a1b.id, 'out', n1.id, 'in0'); w(Qn.id, 'out', n1.id, 'in1');
  w(K.id, 'out', a2.id, 'in0'); w(CLK.id, 'out', a2.id, 'in1');
  w(a2.id, 'out', a2b.id, 'in0'); w(a2.id, 'out', a2b.id, 'in1');
  w(a2b.id, 'out', n2.id, 'in0'); w(Q.id, 'out', n2.id, 'in1');
  w(n1.id, 'out', Q.id, 'in0'); w(Qn.id, 'out', Q.id, 'in1');
  w(n2.id, 'out', Qn.id, 'in0'); w(Q.id, 'out', Qn.id, 'in1');
  const state = s.toJSON();
  markClock(state, CLK.id);
  return { state, J: J.id, K: K.id, Q: Q.id };
}

/** Gated D latch (4 NANDs), com CLK em modo clock. */
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

describe('clock por pulso/edge (advanceTo)', () => {
  it('JK level-triggered mínimo: hold / set / reset / toggle sob clock automático', () => {
    const c = naiveJK();
    const sim = new Simulator(compile(c.state));
    const qKey = pinKey(c.Q, 'out');
    let now = 0;
    sim.advanceTo(now); // sincroniza sem disparar
    const tick = () => {
      now += CLOCK_PERIOD_MS;
      sim.advanceTo(now);
      return sim.snapshot().pinValues.get(qKey) ?? false;
    };

    // SET: J=1,K=0 → Q=1; HOLD mantém.
    sim.setInput(c.J, true);
    sim.setInput(c.K, false);
    expect(tick(), 'set').toBe(true);
    sim.setInput(c.J, false);
    expect(tick(), 'hold após set').toBe(true);

    // RESET: J=0,K=1 → Q=0.
    sim.setInput(c.K, true);
    expect(tick(), 'reset').toBe(false);

    // TOGGLE: J=K=1 inverte a cada ciclo.
    sim.setInput(c.J, true);
    sim.setInput(c.K, true);
    const seq = [tick(), tick(), tick(), tick()];
    let toggles = 0;
    for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) toggles++;
    expect(toggles, `toggle seq=${seq.map((b) => (b ? 1 : 0)).join('')}`).toBe(seq.length - 1);
  });

  it('gated D latch: amostra D na borda do clock', () => {
    const c = gatedDLatch();
    const sim = new Simulator(compile(c.state));
    const qKey = pinKey(c.Q, 'out');
    let now = 0;
    sim.advanceTo(now);
    const tick = () => {
      now += CLOCK_PERIOD_MS;
      sim.advanceTo(now);
      return sim.snapshot().pinValues.get(qKey) ?? false;
    };

    sim.setInput(c.D, true);
    expect(tick(), 'captura D=1').toBe(true);
    sim.setInput(c.D, false);
    expect(tick(), 'captura D=0').toBe(false);
    sim.setInput(c.D, true);
    expect(tick(), 'captura D=1 de novo').toBe(true);
  });

  it('clock exibe nível (blink) enquanto a lógica recebe pulso', () => {
    const c = naiveJK();
    const sim = new Simulator(compile(c.state));
    const clkKey = pinKey(c.state.nodes.find((n) => n.clock)!.id, 'out');
    // clockValue: alto na 1ª metade do período, baixo na 2ª.
    sim.advanceTo(0);
    expect(sim.snapshot().pinValues.get(clkKey), 'display alto em t=0').toBe(true);
    sim.advanceTo(CLOCK_PERIOD_MS / 2 + 1);
    expect(sim.snapshot().pinValues.get(clkKey), 'display baixo na 2ª metade').toBe(false);
  });
});
