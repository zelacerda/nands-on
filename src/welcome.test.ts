import { describe, expect, it } from 'vitest';
import {
  WELCOME_DISMISSED_KEY,
  isWelcomeDismissed,
  setWelcomeDismissed,
  shouldAutoShowWelcome,
} from './welcome';

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

describe('shouldAutoShowWelcome', () => {
  it('abre quando não dispensado e não abre quando dispensado', () => {
    expect(shouldAutoShowWelcome(false)).toBe(true);
    expect(shouldAutoShowWelcome(true)).toBe(false);
  });
});

describe('isWelcomeDismissed / setWelcomeDismissed', () => {
  it('retorna false quando a flag não foi salva', () => {
    expect(isWelcomeDismissed(memoryStorage())).toBe(false);
  });

  it('retorna true apenas para o valor "true" salvo', () => {
    expect(isWelcomeDismissed(memoryStorage({ [WELCOME_DISMISSED_KEY]: 'true' }))).toBe(true);
    expect(isWelcomeDismissed(memoryStorage({ [WELCOME_DISMISSED_KEY]: 'false' }))).toBe(false);
  });

  it('persiste a flag como string', () => {
    const s = memoryStorage();
    setWelcomeDismissed(true, s);
    expect(s.store[WELCOME_DISMISSED_KEY]).toBe('true');
    expect(isWelcomeDismissed(s)).toBe(true);
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
    expect(isWelcomeDismissed(throwing)).toBe(false);
    expect(() => setWelcomeDismissed(true, throwing)).not.toThrow();
  });
});
