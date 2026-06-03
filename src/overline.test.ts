import { describe, expect, it } from 'vitest';
import { OVERLINE, applyOverline, hasOverline, removeOverline, toggleOverline } from './overline';

describe('overline', () => {
  it('aplica a barra após cada caractere base', () => {
    expect(applyOverline('Q')).toBe(`Q${OVERLINE}`);
    expect(applyOverline('AB')).toBe(`A${OVERLINE}B${OVERLINE}`);
  });

  it('remove todas as barras', () => {
    expect(removeOverline(`Q${OVERLINE}`)).toBe('Q');
    expect(removeOverline(`A${OVERLINE}B${OVERLINE}`)).toBe('AB');
  });

  it('detecta a presença de barra', () => {
    expect(hasOverline('Q')).toBe(false);
    expect(hasOverline(`Q${OVERLINE}`)).toBe(true);
  });

  it('alterna: aplica quando não há, remove quando há', () => {
    const on = toggleOverline('Q');
    expect(on).toBe(`Q${OVERLINE}`);
    expect(toggleOverline(on)).toBe('Q');
  });

  it('reaplica de forma idempotente sem duplicar marcas', () => {
    expect(applyOverline(`Q${OVERLINE}`)).toBe(`Q${OVERLINE}`);
  });

  it('texto vazio permanece vazio', () => {
    expect(applyOverline('')).toBe('');
    expect(toggleOverline('')).toBe('');
  });
});
