import { describe, expect, it } from 'vitest';
import { CircuitStore } from './store';
import { ChipLibrary, captureDefinition } from './chip';
import {
  NOT_TUTORIAL_STEPS,
  type TutorialContext,
  type TutorialState,
  advanceIfComplete,
  captureStepStart,
  currentStep,
  isFinished,
} from './tutorial';

/** Constrói um contexto a partir do estado vivo do store/biblioteca + snapshot. */
function makeCtx(
  store: CircuitStore,
  library: ChipLibrary,
  stepStart = captureStepStart(store.listNodes(), library.list().length),
): TutorialContext {
  return {
    nodes: store.listNodes(),
    wires: store.listWires(),
    libraryCount: library.list().length,
    stepStart,
  };
}

describe('tutorial — predicados de passo', () => {
  it('o passo de fiação só completa com AS DUAS entradas do NAND ligadas ao input', () => {
    const store = new CircuitStore();
    const inp = store.addNode('input', { x: 0, y: 0 });
    const nand = store.addNode('nand', { x: 100, y: 0 });
    const wireStep = NOT_TUTORIAL_STEPS.find((s) => s.id === 'wire-input')!;

    store.addWire({ nodeId: inp.id, pinId: 'out' }, { nodeId: nand.id, pinId: 'in0' });
    expect(wireStep.isComplete(makeCtx(store, new ChipLibrary()))).toBe(false); // só in0

    store.addWire({ nodeId: inp.id, pinId: 'out' }, { nodeId: nand.id, pinId: 'in1' });
    expect(wireStep.isComplete(makeCtx(store, new ChipLibrary()))).toBe(true); // in0 + in1
  });

  it('o passo de toggle completa quando o estado da entrada muda vs. o início do passo', () => {
    const store = new CircuitStore();
    const inp = store.addNode('input', { x: 0, y: 0 });
    const toggleStep = NOT_TUTORIAL_STEPS.find((s) => s.id === 'toggle-input')!;

    const stepStart = captureStepStart(store.listNodes(), 0); // value = false
    expect(toggleStep.isComplete(makeCtx(store, new ChipLibrary(), stepStart))).toBe(false);

    store.cycleInputState(inp.id); // OFF → ON
    expect(toggleStep.isComplete(makeCtx(store, new ChipLibrary(), stepStart))).toBe(true);
  });

  it('o passo "Make" completa quando a biblioteca cresce', () => {
    const store = new CircuitStore();
    store.addNode('input', { x: 0, y: 0 });
    store.addNode('output', { x: 100, y: 0 });
    const library = new ChipLibrary();
    const makeStep = NOT_TUTORIAL_STEPS.find((s) => s.id === 'make')!;

    const stepStart = captureStepStart(store.listNodes(), library.list().length);
    expect(makeStep.isComplete(makeCtx(store, library, stepStart))).toBe(false);

    library.add(captureDefinition(store.toJSON(), 'NOT'));
    expect(makeStep.isComplete(makeCtx(store, library, stepStart))).toBe(true);
  });
});

describe('tutorial — walkthrough completo', () => {
  it('avança por todos os passos ao executar as ações na ordem', () => {
    const store = new CircuitStore();
    const library = new ChipLibrary();
    let state: TutorialState = { active: true, index: 0 };
    let stepStart = captureStepStart(store.listNodes(), library.list().length);

    // Executa uma ação e tenta avançar; ao avançar, recaptura o snapshot do passo
    // seguinte (como faz o loop de render).
    const act = (action: () => void): number => {
      action();
      const before = state.index;
      state = advanceIfComplete(NOT_TUTORIAL_STEPS, state, makeCtx(store, library, stepStart));
      if (state.index !== before) stepStart = captureStepStart(store.listNodes(), library.list().length);
      return state.index;
    };

    const inp = store.addNode('input', { x: 0, y: 0 });
    expect(act(() => {})).toBe(1); // entrada já adicionada acima

    const nand = store.addNode('nand', { x: 100, y: 0 });
    expect(act(() => {})).toBe(2);

    const out = store.addNode('output', { x: 220, y: 0 });
    expect(act(() => {})).toBe(3);

    expect(
      act(() => {
        store.addWire({ nodeId: inp.id, pinId: 'out' }, { nodeId: nand.id, pinId: 'in0' });
        store.addWire({ nodeId: inp.id, pinId: 'out' }, { nodeId: nand.id, pinId: 'in1' });
      }),
    ).toBe(4);

    expect(
      act(() => store.addWire({ nodeId: nand.id, pinId: 'out' }, { nodeId: out.id, pinId: 'in' })),
    ).toBe(5);

    expect(act(() => store.cycleInputState(inp.id))).toBe(6); // toggle
    expect(act(() => store.setNodeName(inp.id, 'A'))).toBe(7); // rename
    expect(act(() => library.add(captureDefinition(store.toJSON(), 'NOT')))).toBe(8); // make

    expect(isFinished(NOT_TUTORIAL_STEPS, state)).toBe(true);
    expect(currentStep(NOT_TUTORIAL_STEPS, state)).toBeUndefined();
  });

  it('não avança enquanto o passo corrente não estiver completo', () => {
    const store = new CircuitStore();
    const library = new ChipLibrary();
    const state: TutorialState = { active: true, index: 0 };
    // Nada foi adicionado: o passo 0 (add-input) não completa.
    const next = advanceIfComplete(NOT_TUTORIAL_STEPS, state, makeCtx(store, library));
    expect(next.index).toBe(0);
  });
});
