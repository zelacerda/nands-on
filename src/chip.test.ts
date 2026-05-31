import { describe, expect, it } from 'vitest';
import { chipInstancePins, chipSize, nodeSize, type CircuitState } from './model';
import {
  ChipLibrary,
  captureDefinition,
  DuplicateChipNameError,
  validateChipName,
} from './chip';
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

describe('instância de chip na store', () => {
  it('cria um nó chip com defId, nome e pinos derivados da definição', () => {
    const store = new CircuitStore();
    const def = captureDefinition(sampleState(), 'E'); // 2 in, 1 out
    const node = store.addChipInstance(def, { x: 10, y: 20 });
    expect(node.type).toBe('chip');
    expect(node.defId).toBe(def.id);
    expect(node.name).toBe('E');
    expect(node.pins.filter((p) => p.kind === 'in')).toHaveLength(2);
    expect(node.pins.filter((p) => p.kind === 'out')).toHaveLength(1);
  });

  it('remover um chip também remove os fios conectados a ele', () => {
    const store = new CircuitStore();
    const def = captureDefinition(sampleState(), 'F'); // 2 in, 1 out
    const input = store.addNode('input', { x: -100, y: 0 });
    const chip = store.addChipInstance(def, { x: 0, y: 0 });
    store.addWire({ nodeId: input.id, pinId: 'out' }, { nodeId: chip.id, pinId: 'in0' });
    expect(store.listWires()).toHaveLength(1);

    store.removeNode(chip.id);
    expect(store.listNodes()).toHaveLength(1);
    expect(store.listWires()).toHaveLength(0);
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

describe('validateChipName', () => {
  it('rejeita nome vazio ou só espaços', () => {
    const lib = new ChipLibrary();
    expect(validateChipName(lib, '   ').ok).toBe(false);
  });

  it('rejeita nome já existente', () => {
    const lib = new ChipLibrary();
    lib.add(captureDefinition(sampleState(), 'XOR'));
    expect(validateChipName(lib, 'XOR').ok).toBe(false);
  });

  it('aceita e normaliza (trim) um nome válido', () => {
    const lib = new ChipLibrary();
    const res = validateChipName(lib, '  AND  ');
    expect(res).toEqual({ ok: true, name: 'AND' });
  });
});

describe('aninhamento', () => {
  it('captura inclui instâncias de chips presentes no espaço', () => {
    const lib = new ChipLibrary();
    const half = lib; // legibilidade
    half.add(captureDefinition(sampleState(), 'HALF'));
    const def = half.get('HALF')!;

    // Monta um espaço que usa o chip HALF como peça, mais I/O próprios.
    const store = new CircuitStore();
    store.addNode('input', { x: 0, y: 0 });
    store.addChipInstance(def, { x: 100, y: 0 });
    store.addNode('output', { x: 260, y: 0 });

    const outer = captureDefinition(store.toJSON(), 'FULL');
    expect(outer.inputCount).toBe(1);
    expect(outer.outputCount).toBe(1);
    expect(outer.internal.nodes.some((n) => n.type === 'chip')).toBe(true);
  });
});
