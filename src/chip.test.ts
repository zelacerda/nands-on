import { describe, expect, it } from 'vitest';
import { chipInstancePins, chipSize, nodeSize, type CircuitState } from './model';
import { ChipLibrary, captureDefinition, DuplicateChipNameError } from './chip';
import { CircuitStore } from './store';

/** Monta um CircuitState simples: 2 entradas, 1 saída e uma NAND. */
function sampleState(): CircuitState {
  const store = new CircuitStore();
  // Entradas fora de ordem vertical de propósito.
  store.addNode('input', { x: 0, y: 80 }); // mais abaixo
  store.addNode('input', { x: 0, y: 10 }); // mais acima
  store.addNode('nand', { x: 120, y: 40 });
  store.addNode('output', { x: 240, y: 40 });
  return store.toJSON();
}

describe('captureDefinition', () => {
  it('conta entradas e saídas corretamente', () => {
    const def = captureDefinition(sampleState(), 'MeuChip');
    expect(def.name).toBe('MeuChip');
    expect(def.inputCount).toBe(2);
    expect(def.outputCount).toBe(1);
  });

  it('preserva a topologia interna capturada', () => {
    const state = sampleState();
    const def = captureDefinition(state, 'X');
    expect(def.internal.nodes).toHaveLength(4);
    expect(def.internal).toBe(state);
  });

  it('gera ids únicos por captura', () => {
    const a = captureDefinition(sampleState(), 'A');
    const b = captureDefinition(sampleState(), 'B');
    expect(a.id).not.toBe(b.id);
  });
});

describe('chipInstancePins / chipSize / nodeSize', () => {
  it('gera N entradas à esquerda e M saídas à direita, ordenadas verticalmente', () => {
    const def = captureDefinition(sampleState(), 'C'); // 2 in, 1 out
    const pins = chipInstancePins(def);
    const ins = pins.filter((p) => p.kind === 'in');
    const outs = pins.filter((p) => p.kind === 'out');
    expect(ins).toHaveLength(2);
    expect(outs).toHaveLength(1);

    const { w } = chipSize(2, 1);
    expect(ins.every((p) => p.offset.x === 0)).toBe(true);
    expect(outs.every((p) => p.offset.x === w)).toBe(true);
    // Entradas em ordem vertical crescente.
    expect(ins[0]!.offset.y).toBeLessThan(ins[1]!.offset.y);
  });

  it('nodeSize de um chip cresce com o número de pinos', () => {
    const small = chipSize(1, 1).h;
    const big = chipSize(5, 2).h;
    expect(big).toBeGreaterThan(small);
  });

  it('nodeSize usa os pinos do nó de chip', () => {
    const store = new CircuitStore();
    const def = captureDefinition(sampleState(), 'D'); // 2 in, 1 out
    const node = store.addChipInstance(def, { x: 0, y: 0 });
    expect(nodeSize(node)).toEqual(chipSize(2, 1));
  });
});

describe('ChipLibrary', () => {
  it('adiciona e recupera por nome', () => {
    const lib = new ChipLibrary();
    const def = captureDefinition(sampleState(), 'AND');
    lib.add(def);
    expect(lib.has('AND')).toBe(true);
    expect(lib.get('AND')).toBe(def);
    expect(lib.list()).toHaveLength(1);
  });

  it('rejeita nome duplicado', () => {
    const lib = new ChipLibrary();
    lib.add(captureDefinition(sampleState(), 'OR'));
    expect(() => lib.add(captureDefinition(sampleState(), 'OR'))).toThrow(DuplicateChipNameError);
  });
});
