import { describe, expect, it } from 'vitest';
import {
  NAND_KEY,
  PALETTE_ORDER_KEY,
  loadPaletteOrder,
  moveItem,
  reconcileOrder,
  savePaletteOrder,
} from './paletteOrder';

/** Storage em memória que implementa o subconjunto usado (getItem/setItem). */
function memoryStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    store,
    getItem: (k: string): string | null => store[k] ?? null,
    setItem: (k: string, v: string): void => {
      store[k] = v;
    },
  };
}

describe('reconcileOrder', () => {
  it('mantém NAND no topo e anexa chips quando não há ordem salva', () => {
    expect(reconcileOrder([], ['chip1', 'chip2'])).toEqual([NAND_KEY, 'chip1', 'chip2']);
  });

  it('preserva a ordem salva válida', () => {
    expect(reconcileOrder(['chip2', NAND_KEY, 'chip1'], ['chip1', 'chip2'])).toEqual([
      'chip2',
      NAND_KEY,
      'chip1',
    ]);
  });

  it('descarta ids de chips inexistentes', () => {
    expect(reconcileOrder([NAND_KEY, 'chip1', 'gone'], ['chip1'])).toEqual([NAND_KEY, 'chip1']);
  });

  it('anexa chips novos ao fim, na ordem de chipIds', () => {
    expect(reconcileOrder([NAND_KEY, 'chip1'], ['chip1', 'chip2', 'chip3'])).toEqual([
      NAND_KEY,
      'chip1',
      'chip2',
      'chip3',
    ]);
  });

  it('garante NAND uma única vez mesmo se ausente ou duplicado', () => {
    expect(reconcileOrder(['chip1'], ['chip1'])).toEqual([NAND_KEY, 'chip1']);
    expect(reconcileOrder([NAND_KEY, NAND_KEY, 'chip1'], ['chip1'])).toEqual([NAND_KEY, 'chip1']);
  });

  it('remove ids duplicados na ordem salva', () => {
    expect(reconcileOrder([NAND_KEY, 'chip1', 'chip1'], ['chip1'])).toEqual([NAND_KEY, 'chip1']);
  });
});

describe('moveItem', () => {
  it('move um item para baixo', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('move um item para cima', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('não altera quando os índices são iguais', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });

  it('devolve cópia inalterada para índices fora do intervalo', () => {
    expect(moveItem(['a', 'b'], -1, 0)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });

  it('não muta o array original', () => {
    const order = ['a', 'b', 'c'];
    moveItem(order, 0, 2);
    expect(order).toEqual(['a', 'b', 'c']);
  });
});

describe('loadPaletteOrder / savePaletteOrder', () => {
  it('devolve [NAND] quando não há nada salvo', () => {
    expect(loadPaletteOrder(memoryStorage())).toEqual([NAND_KEY]);
  });

  it('faz round-trip da ordem salva', () => {
    const s = memoryStorage();
    savePaletteOrder([NAND_KEY, 'chip2', 'chip1'], s);
    expect(s.store[PALETTE_ORDER_KEY]).toBe(JSON.stringify([NAND_KEY, 'chip2', 'chip1']));
    expect(loadPaletteOrder(s)).toEqual([NAND_KEY, 'chip2', 'chip1']);
  });

  it('devolve [NAND] para JSON corrompido ou de tipo inesperado', () => {
    expect(loadPaletteOrder(memoryStorage({ [PALETTE_ORDER_KEY]: 'not json' }))).toEqual([NAND_KEY]);
    expect(loadPaletteOrder(memoryStorage({ [PALETTE_ORDER_KEY]: '{"a":1}' }))).toEqual([NAND_KEY]);
    expect(loadPaletteOrder(memoryStorage({ [PALETTE_ORDER_KEY]: '[1,2,3]' }))).toEqual([NAND_KEY]);
  });

  it('não lança quando o storage falha (ex.: modo privado)', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadPaletteOrder(throwing)).toEqual([NAND_KEY]);
    expect(() => savePaletteOrder([NAND_KEY], throwing)).not.toThrow();
  });
});
