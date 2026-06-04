import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

describe('chaves data-i18n do index.html', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

  /** Coleta todas as chaves referenciadas em `data-i18n` e `data-i18n-attr`. */
  function referencedKeys(): string[] {
    const keys: string[] = [];
    for (const [, key] of html.matchAll(/data-i18n="([^"]+)"/g)) keys.push(key);
    for (const [, spec] of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
      for (const pair of spec.split(',')) keys.push(pair.split(':')[1].trim());
    }
    return keys;
  }

  it('toda chave referenciada existe em STRINGS', () => {
    const missing = referencedKeys().filter((k) => !(k in STRINGS));
    expect(missing).toEqual([]);
  });
});
