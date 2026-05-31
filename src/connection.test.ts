import { describe, expect, it } from 'vitest';
import { CircuitStore } from './store';
import { validateConnection } from './connection';

function setup() {
  const store = new CircuitStore();
  const input = store.addNode('input', { x: 0, y: 0 });
  const nand = store.addNode('nand', { x: 100, y: 0 });
  const output = store.addNode('output', { x: 200, y: 0 });
  return { store, input, nand, output };
}

describe('validateConnection', () => {
  it('aceita saída → entrada', () => {
    const { store, input, nand } = setup();
    const res = validateConnection(
      store,
      { nodeId: input.id, pinId: 'out' },
      { nodeId: nand.id, pinId: 'in0' },
    );
    expect(res).toEqual({
      ok: true,
      from: { nodeId: input.id, pinId: 'out' },
      to: { nodeId: nand.id, pinId: 'in0' },
    });
  });

  it('normaliza entrada → saída para from=saída', () => {
    const { store, input, nand } = setup();
    const res = validateConnection(
      store,
      { nodeId: nand.id, pinId: 'in0' },
      { nodeId: input.id, pinId: 'out' },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.from).toEqual({ nodeId: input.id, pinId: 'out' });
      expect(res.to).toEqual({ nodeId: nand.id, pinId: 'in0' });
    }
  });

  it('rejeita saída → saída', () => {
    const { store, input, nand } = setup();
    const res = validateConnection(
      store,
      { nodeId: input.id, pinId: 'out' },
      { nodeId: nand.id, pinId: 'out' },
    );
    expect(res.ok).toBe(false);
  });

  it('rejeita entrada → entrada', () => {
    const { store, nand, output } = setup();
    const res = validateConnection(
      store,
      { nodeId: nand.id, pinId: 'in0' },
      { nodeId: output.id, pinId: 'in' },
    );
    expect(res.ok).toBe(false);
  });

  it('rejeita conexão de um pino com ele mesmo', () => {
    const { store, input } = setup();
    const ref = { nodeId: input.id, pinId: 'out' };
    expect(validateConnection(store, ref, ref).ok).toBe(false);
  });

  it('rejeita pino de entrada já ocupado', () => {
    const { store, input, nand } = setup();
    const inRef = { nodeId: nand.id, pinId: 'in0' };
    store.addWire({ nodeId: input.id, pinId: 'out' }, inRef);
    const res = validateConnection(store, { nodeId: input.id, pinId: 'out' }, inRef);
    expect(res.ok).toBe(false);
  });

  it('rejeita pino inexistente', () => {
    const { store, input } = setup();
    const res = validateConnection(
      store,
      { nodeId: input.id, pinId: 'out' },
      { nodeId: 'ghost', pinId: 'in' },
    );
    expect(res.ok).toBe(false);
  });
});
