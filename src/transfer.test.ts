import { describe, expect, it } from 'vitest';
import { FORMAT, FORMAT_VERSION, ImportError, parseLibrary, serializeLibrary } from './transfer';
import { captureDefinition } from './chip';
import { CircuitStore } from './store';
import type { ChipDefinition } from './model';

/** Constrói uma definição de chip plausível (um NOT: 1 in, 1 out, 1 NAND). */
function sampleDef(name = 'NOT'): ChipDefinition {
  const store = new CircuitStore();
  store.addNode('input', { x: 0, y: 0 });
  store.addNode('nand', { x: 80, y: 0 });
  store.addNode('output', { x: 200, y: 0 });
  return captureDefinition(store.toJSON(), name);
}

describe('transfer — serialização da biblioteca', () => {
  it('serializeLibrary embute format e version no envelope', () => {
    const json = serializeLibrary([sampleDef()]);
    const parsed = JSON.parse(json);
    expect(parsed.format).toBe(FORMAT);
    expect(parsed.version).toBe(FORMAT_VERSION);
    expect(Array.isArray(parsed.chips)).toBe(true);
    expect(parsed.chips).toHaveLength(1);
  });

  it('round-trip preserva as definições (serialize → parse)', () => {
    const defs = [sampleDef('NOT'), sampleDef('OUTRO')];
    const restored = parseLibrary(serializeLibrary(defs));
    expect(restored).toEqual(defs);
  });

  it('aceita uma biblioteca vazia', () => {
    expect(parseLibrary(serializeLibrary([]))).toEqual([]);
  });
});

describe('transfer — validação no parse', () => {
  it('rejeita JSON corrompido com kind "json"', () => {
    expect(() => parseLibrary('{ não é json }')).toThrowError(ImportError);
    try {
      parseLibrary('{ não é json }');
    } catch (e) {
      expect((e as ImportError).kind).toBe('json');
    }
  });

  it('rejeita format desconhecido com kind "format"', () => {
    const bad = JSON.stringify({ format: 'outra-coisa', version: FORMAT_VERSION, chips: [] });
    try {
      parseLibrary(bad);
      throw new Error('deveria ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(ImportError);
      expect((e as ImportError).kind).toBe('format');
    }
  });

  it('rejeita versão incompatível com kind "version"', () => {
    const bad = JSON.stringify({ format: FORMAT, version: '2.0', chips: [sampleDef()] });
    try {
      parseLibrary(bad);
      throw new Error('deveria ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(ImportError);
      expect((e as ImportError).kind).toBe('version');
    }
  });

  it('rejeita estrutura sem array de chips com kind "structure"', () => {
    const bad = JSON.stringify({ format: FORMAT, version: FORMAT_VERSION, chips: 'nope' });
    try {
      parseLibrary(bad);
      throw new Error('deveria ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(ImportError);
      expect((e as ImportError).kind).toBe('structure');
    }
  });

  it('rejeita chip malformado (faltando campos) com kind "structure"', () => {
    const bad = JSON.stringify({
      format: FORMAT,
      version: FORMAT_VERSION,
      chips: [{ id: 'chip1', name: 'X' }], // faltam inputCount/outputCount/internal
    });
    try {
      parseLibrary(bad);
      throw new Error('deveria ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(ImportError);
      expect((e as ImportError).kind).toBe('structure');
    }
  });
});
