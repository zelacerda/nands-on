import { describe, expect, it } from 'vitest';
import { createPins, NODE_SIZE, pinWorldPos } from './model';
import { CircuitStore } from './store';

describe('model', () => {
  it('cria os pinos corretos por tipo de nó', () => {
    expect(createPins('nand').map((p) => p.kind)).toEqual(['in', 'in', 'out']);
    expect(createPins('input').map((p) => p.kind)).toEqual(['out']);
    expect(createPins('output').map((p) => p.kind)).toEqual(['in']);
  });

  it('calcula a posição absoluta de um pino a partir do nó', () => {
    const node = { id: 'n1', type: 'nand' as const, pos: { x: 100, y: 50 }, pins: createPins('nand') };
    const out = node.pins.find((p) => p.id === 'out')!;
    expect(pinWorldPos(node, out)).toEqual({
      x: 100 + NODE_SIZE.nand.w,
      y: 50 + NODE_SIZE.nand.h * 0.5,
    });
  });
});

describe('CircuitStore', () => {
  it('adiciona nós com ids únicos', () => {
    const store = new CircuitStore();
    const a = store.addNode('nand', { x: 0, y: 0 });
    const b = store.addNode('input', { x: 10, y: 10 });
    expect(a.id).not.toBe(b.id);
    expect(store.listNodes()).toHaveLength(2);
  });

  it('remove um nó e os fios conectados a ele', () => {
    const store = new CircuitStore();
    const input = store.addNode('input', { x: 0, y: 0 });
    const nand = store.addNode('nand', { x: 100, y: 0 });
    store.addWire({ nodeId: input.id, pinId: 'out' }, { nodeId: nand.id, pinId: 'in0' });
    expect(store.listWires()).toHaveLength(1);

    store.removeNode(nand.id);
    expect(store.listNodes()).toHaveLength(1);
    expect(store.listWires()).toHaveLength(0);
  });

  it('resolve a posição de mundo de um pino referenciado', () => {
    const store = new CircuitStore();
    const node = store.addNode('output', { x: 200, y: 80 });
    const pos = store.pinPos({ nodeId: node.id, pinId: 'in' });
    expect(pos).toEqual({ x: 200, y: 80 + NODE_SIZE.output.h * 0.5 });
  });

  it('pinPos retorna undefined para referência inexistente', () => {
    const store = new CircuitStore();
    expect(store.pinPos({ nodeId: 'nope', pinId: 'out' })).toBeUndefined();
  });

  it('detecta pino de entrada já ocupado', () => {
    const store = new CircuitStore();
    const input = store.addNode('input', { x: 0, y: 0 });
    const nand = store.addNode('nand', { x: 100, y: 0 });
    const inRef = { nodeId: nand.id, pinId: 'in0' };
    expect(store.isInputOccupied(inRef)).toBe(false);
    store.addWire({ nodeId: input.id, pinId: 'out' }, inRef);
    expect(store.isInputOccupied(inRef)).toBe(true);
  });

  it('toJSON devolve um snapshot serializável', () => {
    const store = new CircuitStore();
    store.addNode('nand', { x: 1, y: 2 });
    const json = JSON.parse(JSON.stringify(store.toJSON()));
    expect(json.nodes).toHaveLength(1);
    expect(json.wires).toHaveLength(0);
    expect(json.nodes[0].type).toBe('nand');
  });

  describe('loadState', () => {
    it('substitui o conteúdo por uma cópia profunda (sem alias)', () => {
      const store = new CircuitStore();
      const source = { nodes: [{ id: 'n1', type: 'nand' as const, pos: { x: 5, y: 6 }, pins: [] }], wires: [] };
      store.loadState(source);
      expect(store.listNodes()).toHaveLength(1);
      // Mutar a origem não afeta o estado carregado.
      source.nodes[0]!.pos.x = 999;
      expect(store.getNode('n1')!.pos.x).toBe(5);
    });

    it('avança o contador de ids para além dos nós/fios carregados', () => {
      const store = new CircuitStore();
      store.loadState({
        nodes: [{ id: 'n4', type: 'input' as const, pos: { x: 0, y: 0 }, pins: createPins('input') }],
        wires: [],
      });
      // O próximo nó criado não pode reutilizar n1..n4.
      const next = store.addNode('nand', { x: 0, y: 0 });
      expect(Number(next.id.replace('n', ''))).toBeGreaterThan(4);
    });

    it('preserva o barOffset de um fio no round-trip (toJSON → loadState)', () => {
      const store = new CircuitStore();
      const a = store.addNode('input', { x: 0, y: 0 });
      const b = store.addNode('nand', { x: 200, y: 80 });
      const wire = store.addWire({ nodeId: a.id, pinId: 'out' }, { nodeId: b.id, pinId: 'in0' });
      wire.barOffset = 32;

      const json = JSON.parse(JSON.stringify(store.toJSON()));
      const restored = new CircuitStore();
      restored.loadState(json);
      expect(restored.listWires()[0]!.barOffset).toBe(32);
    });
  });

  describe('estado do input (tap OFF↔ON, long press CLK)', () => {
    it('cycleInputState alterna apenas entre OFF e ON', () => {
      const store = new CircuitStore();
      const inp = store.addNode('input', { x: 0, y: 0 });
      expect(inp.value ?? false).toBe(false); // OFF

      store.cycleInputState(inp.id);
      expect(store.getNode(inp.id)!.value).toBe(true); // ON
      expect(store.getNode(inp.id)!.clock ?? false).toBe(false);

      store.cycleInputState(inp.id);
      expect(store.getNode(inp.id)!.value).toBe(false); // OFF
      expect(store.getNode(inp.id)!.clock ?? false).toBe(false);
    });

    it('setInputClock ativa o modo CLK e zera o value', () => {
      const store = new CircuitStore();
      const inp = store.addNode('input', { x: 0, y: 0 });
      store.cycleInputState(inp.id); // ON

      store.setInputClock(inp.id);
      expect(store.getNode(inp.id)!.clock).toBe(true);
      expect(store.getNode(inp.id)!.value).toBe(false);
    });

    it('um tap em CLK desliga o clock e alterna o valor (vai para ON)', () => {
      const store = new CircuitStore();
      const inp = store.addNode('input', { x: 0, y: 0 });
      store.setInputClock(inp.id); // CLK

      store.cycleInputState(inp.id);
      expect(store.getNode(inp.id)!.clock).toBe(false);
      expect(store.getNode(inp.id)!.value).toBe(true); // ON
    });

    it('cycleInputState e setInputClock são no-op para nós que não são input', () => {
      const store = new CircuitStore();
      const nand = store.addNode('nand', { x: 0, y: 0 });
      store.cycleInputState(nand.id);
      store.setInputClock(nand.id);
      expect(store.getNode(nand.id)!.value).toBeUndefined();
      expect(store.getNode(nand.id)!.clock).toBeUndefined();
    });
  });
});
