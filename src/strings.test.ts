import { describe, expect, it } from 'vitest';
import { STRINGS, t } from './strings';

describe('t', () => {
  it('devolve o texto cru quando não há placeholders', () => {
    expect(t('palette.input')).toBe('IN');
    expect(t('clearDb.confirm')).toBe(STRINGS['clearDb.confirm']);
  });

  it('interpola placeholders no formato {nome}', () => {
    expect(t('editBar.editing', { name: 'AND' })).toBe('Editing: AND');
    expect(t('validation.duplicateName', { name: 'XOR' })).toBe('A chip named "XOR" already exists.');
  });

  it('converte valores numéricos para string', () => {
    // Chave arbitrária só para exercitar a coerção; reutiliza o placeholder {name}.
    expect(t('editBar.editing', { name: 42 })).toBe('Editing: 42');
  });

  it('mantém placeholders sem valor correspondente', () => {
    expect(t('editBar.editing', {})).toBe('Editing: {name}');
  });
});
