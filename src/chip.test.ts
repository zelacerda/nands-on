import { describe, expect, it } from 'vitest';
import { chipInstancePins, chipSize, nodeSize, type CircuitState } from './model';
import {
  ChipLibrary,
  captureDefinition,
  DuplicateChipNameError,
  primeSeqFromIds,
  reconcileInstances,
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

describe('captureDefinition — rótulos dos pinos', () => {
  /** Espaço com nomes nos nós I/O, fora de ordem vertical de propósito. */
  function namedState(): CircuitState {
    const store = new CircuitStore();
    const b = store.addNode('input', { x: 0, y: 80 }); // mais abaixo
    const a = store.addNode('input', { x: 0, y: 10 }); // mais acima
    const q = store.addNode('output', { x: 240, y: 40 });
    a.name = 'A';
    b.name = 'B';
    q.name = 'Q';
    return store.toJSON();
  }

  it('captura os rótulos na ordem vertical (de cima para baixo)', () => {
    const def = captureDefinition(namedState(), 'Chip');
    expect(def.inputLabels).toEqual(['A', 'B']);
    expect(def.outputLabels).toEqual(['Q']);
  });

  it('usa "IN"/"OUT" como padrão para nós I/O sem nome', () => {
    const def = captureDefinition(sampleState(), 'Chip'); // nenhum nó tem nome
    expect(def.inputLabels).toEqual(['IN', 'IN']);
    expect(def.outputLabels).toEqual(['OUT']);
  });

  it('propaga os rótulos para os pinos da instância, na ordem dos pinos', () => {
    const def = captureDefinition(namedState(), 'Chip');
    const pins = chipInstancePins(def);
    expect(pins.find((p) => p.id === 'in0')?.label).toBe('A');
    expect(pins.find((p) => p.id === 'in1')?.label).toBe('B');
    expect(pins.find((p) => p.id === 'out0')?.label).toBe('Q');
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

    const { w } = chipSize(2, 1, def.name, def.inputLabels, def.outputLabels);
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

  it('largura do chip cresce com nomes longos, mas respeita o mínimo', () => {
    const short = chipSize(2, 1, 'AND').w;
    const long = chipSize(2, 1, 'LOOOONG_AND').w;
    expect(short).toBe(chipSize(2, 1).w); // nome curto não passa do mínimo
    expect(long).toBeGreaterThan(short);
  });

  it('largura reserva espaço para os rótulos dos pinos ao lado do nome', () => {
    const semRotulos = chipSize(1, 1, 'OR').w;
    const comRotulos = chipSize(1, 1, 'OR', ['+5V'], ['OUT']).w;
    expect(comRotulos).toBeGreaterThan(semRotulos);
  });

  it('pino de saída fica exatamente na borda direita do corpo (nome longo)', () => {
    const store = new CircuitStore();
    const a = store.addNode('input', { x: 0, y: 0 });
    const b = store.addNode('input', { x: 0, y: 40 });
    store.addNode('output', { x: 200, y: 20 });
    a.name = 'A';
    b.name = 'B';
    const def = captureDefinition(store.toJSON(), 'THIS IS VERY LARGE');
    const node = new CircuitStore().addChipInstance(def, { x: 0, y: 0 });
    const outPin = node.pins.find((p) => p.kind === 'out')!;
    // A posição do pino (offset.x) deve casar com a largura do corpo renderizado.
    expect(outPin.offset.x).toBe(nodeSize(node).w);
  });

  it('nodeSize usa os pinos do nó de chip', () => {
    const store = new CircuitStore();
    const def = captureDefinition(sampleState(), 'D'); // 2 in, 1 out
    const node = store.addChipInstance(def, { x: 0, y: 0 });
    expect(nodeSize(node)).toEqual(chipSize(2, 1, def.name, def.inputLabels, def.outputLabels));
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

  it('ignora o próprio chip (excludeId) ao revalidar o mesmo nome', () => {
    const lib = new ChipLibrary();
    lib.add(captureDefinition(sampleState(), 'AND'));
    const def = lib.get('AND')!;
    // Renomear "AND" para "AND" deve passar quando exclui a si mesmo...
    expect(validateChipName(lib, 'AND', def.id).ok).toBe(true);
    // ...mas continua colidindo com OUTRO chip de mesmo nome.
    lib.add(captureDefinition(sampleState(), 'OR'));
    expect(validateChipName(lib, 'OR', def.id).ok).toBe(false);
  });
});

describe('primeSeqFromIds / captureDefinition com id', () => {
  it('reusa o id passado e não consome o contador sequencial', () => {
    const reused = captureDefinition(sampleState(), 'X', 'chip42');
    expect(reused.id).toBe('chip42');
    // O próximo id automático não deve ser afetado pelo id reusado.
    const auto = captureDefinition(sampleState(), 'Y');
    expect(auto.id).not.toBe('chip42');
  });

  it('avança o contador para além dos ids restaurados, evitando colisão', () => {
    primeSeqFromIds(['chip3', 'chip100', 'chip7']);
    const next = captureDefinition(sampleState(), 'Z');
    expect(Number(next.id.replace('chip', ''))).toBeGreaterThan(100);
  });
});

describe('ChipLibrary — edição e carga', () => {
  it('getById recupera por id estável', () => {
    const lib = new ChipLibrary();
    const def = captureDefinition(sampleState(), 'AND');
    lib.add(def);
    expect(lib.getById(def.id)).toBe(def);
  });

  it('update substitui a definição de mesmo id preservando a chave de nome', () => {
    const lib = new ChipLibrary();
    const def = captureDefinition(sampleState(), 'AND');
    lib.add(def);
    const edited = captureDefinition(sampleState(), 'AND', def.id);
    lib.update(edited);
    expect(lib.get('AND')).toBe(edited);
    expect(lib.list()).toHaveLength(1);
  });

  it('rename muda o nome mantendo o id e a posição na ordem', () => {
    const lib = new ChipLibrary();
    const first = captureDefinition(sampleState(), 'A');
    lib.add(first);
    lib.add(captureDefinition(sampleState(), 'B'));
    lib.rename(first.id, 'AND');
    expect(lib.get('A')).toBeUndefined();
    expect(lib.getById(first.id)?.name).toBe('AND');
    // Mantém a ordem: o renomeado continua sendo o primeiro.
    expect(lib.list()[0]!.id).toBe(first.id);
  });

  it('load substitui o conteúdo e prepara o contador de ids', () => {
    const lib = new ChipLibrary();
    const defs = [
      captureDefinition(sampleState(), 'A', 'chip5'),
      captureDefinition(sampleState(), 'B', 'chip9'),
    ];
    lib.load(defs);
    expect(lib.list()).toHaveLength(2);
    // Após carregar, um chip novo recebe id além dos restaurados.
    lib.add(captureDefinition(sampleState(), 'C'));
    expect(Number(lib.get('C')!.id.replace('chip', ''))).toBeGreaterThan(9);
  });

  it('dispara onMutate em add/update/rename, mas não em load', () => {
    const lib = new ChipLibrary();
    let calls = 0;
    lib.onMutate = () => {
      calls += 1;
    };
    const def = captureDefinition(sampleState(), 'A');
    lib.add(def);
    lib.update(captureDefinition(sampleState(), 'A', def.id));
    lib.rename(def.id, 'B');
    expect(calls).toBe(3);
    lib.load([captureDefinition(sampleState(), 'C')]);
    expect(calls).toBe(3); // load não conta como mutação a persistir
  });
});

describe('reconcileInstances', () => {
  /** Definição com `ins` entradas e `outs` saídas, sob um id fixo. */
  function defWithIO(ins: number, outs: number, id: string) {
    const store = new CircuitStore();
    for (let i = 0; i < ins; i++) store.addNode('input', { x: 0, y: i * 40 });
    for (let i = 0; i < outs; i++) store.addNode('output', { x: 200, y: i * 40 });
    return captureDefinition(store.toJSON(), `C_${id}`, id);
  }

  /** Espaço com uma instância de `def`: 2 entradas externas em in0/in1 e out0→saída. */
  function stateWithInstance(def: ReturnType<typeof defWithIO>): CircuitState {
    const store = new CircuitStore();
    const a = store.addNode('input', { x: -100, y: 0 });
    const b = store.addNode('input', { x: -100, y: 50 });
    const chip = store.addChipInstance(def, { x: 0, y: 0 });
    const out = store.addNode('output', { x: 200, y: 0 });
    store.addWire({ nodeId: a.id, pinId: 'out' }, { nodeId: chip.id, pinId: 'in0' });
    store.addWire({ nodeId: b.id, pinId: 'out' }, { nodeId: chip.id, pinId: 'in1' });
    store.addWire({ nodeId: chip.id, pinId: 'out0' }, { nodeId: out.id, pinId: 'in' });
    return store.toJSON();
  }

  const chipNode = (state: CircuitState) => state.nodes.find((n) => n.type === 'chip')!;
  const inCount = (state: CircuitState) =>
    chipNode(state).pins.filter((p) => p.kind === 'in').length;

  it('I/O inalterado: mantém os fios e regenera os pinos (com o novo nome)', () => {
    const state = stateWithInstance(defWithIO(2, 1, 'chip1'));
    const edited = captureDefinition(defWithIO(2, 1, 'chip1').internal, 'RENOMEADO', 'chip1');
    reconcileInstances(state, edited);
    expect(state.wires).toHaveLength(3);
    expect(inCount(state)).toBe(2);
    expect(chipNode(state).name).toBe('RENOMEADO');
  });

  it('aumento de I/O: cria o pino novo (sem conexão) e preserva os fios', () => {
    const state = stateWithInstance(defWithIO(2, 1, 'chip1'));
    reconcileInstances(state, defWithIO(3, 1, 'chip1'));
    expect(inCount(state)).toBe(3);
    expect(chipNode(state).pins.some((p) => p.id === 'in2')).toBe(true);
    expect(state.wires).toHaveLength(3); // in0, in1, out0 sobrevivem
  });

  it('redução de I/O: remove os fios dos pinos eliminados', () => {
    const state = stateWithInstance(defWithIO(2, 1, 'chip1'));
    reconcileInstances(state, defWithIO(1, 1, 'chip1'));
    expect(inCount(state)).toBe(1);
    // O fio que chegava em in1 (pino removido) some; in0 e out0 permanecem.
    expect(state.wires).toHaveLength(2);
    expect(state.wires.some((w) => w.to.pinId === 'in1')).toBe(false);
  });

  it('reconcilia instâncias aninhadas dentro de outra definição', () => {
    const inner = defWithIO(2, 1, 'chip1');
    // "Outro" chip que contém uma instância do inner, mais I/O próprios.
    const store = new CircuitStore();
    const a = store.addNode('input', { x: -100, y: 0 });
    const nested = store.addChipInstance(inner, { x: 0, y: 0 });
    store.addWire({ nodeId: a.id, pinId: 'out' }, { nodeId: nested.id, pinId: 'in1' });
    const outer = captureDefinition(store.toJSON(), 'OUTER', 'chip2');

    reconcileInstances(outer.internal, defWithIO(1, 1, 'chip1')); // inner perdeu in1
    expect(outer.internal.wires.some((w) => w.to.pinId === 'in1')).toBe(false);
  });

  it('é no-op quando não há instâncias do chip no estado', () => {
    const state = stateWithInstance(defWithIO(2, 1, 'chip1'));
    const before = state.wires.length;
    reconcileInstances(state, defWithIO(1, 1, 'chip-outro')); // id diferente
    expect(state.wires).toHaveLength(before);
    expect(inCount(state)).toBe(2);
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
