import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearChips, loadChips, saveChips } from './persistence';
import { captureDefinition } from './chip';
import { CircuitStore } from './store';

/**
 * O ambiente de teste é `node`, sem IndexedDB. Estes testes verificam a
 * degradação graciosa: sem storage, a aplicação não quebra — `loadChips`
 * devolve vazio e as escritas viram no-ops silenciosos. O comportamento com
 * IndexedDB real é validado manualmente no navegador.
 */
describe('persistence — degradação sem IndexedDB', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loadChips devolve [] quando o IndexedDB está indisponível', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(typeof indexedDB).toBe('undefined'); // pré-condição do ambiente node
    await expect(loadChips()).resolves.toEqual([]);
  });

  it('saveChips e clearChips não lançam sem IndexedDB', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = new CircuitStore();
    store.addNode('input', { x: 0, y: 0 });
    store.addNode('output', { x: 100, y: 0 });
    const def = captureDefinition(store.toJSON(), 'NOP');
    await expect(saveChips([def])).resolves.toBeUndefined();
    await expect(clearChips()).resolves.toBeUndefined();
  });
});
