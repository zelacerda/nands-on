import type { PinRef } from './model';
import type { CircuitStore } from './store';

export type ConnectionResult =
  | { ok: true; from: PinRef; to: PinRef }
  | { ok: false; reason: string };

/**
 * Valida uma tentativa de conexão entre dois pinos `a` e `b`, em qualquer
 * ordem. Regras:
 *  - ambos os pinos devem existir;
 *  - não pode ser o mesmo pino;
 *  - exatamente um deve ser de saída (`out`) e o outro de entrada (`in`);
 *  - o pino de entrada não pode já estar ocupado por outro fio.
 *
 * Em caso de sucesso, normaliza para `{ from: saída, to: entrada }`.
 */
export function validateConnection(store: CircuitStore, a: PinRef, b: PinRef): ConnectionResult {
  const pinA = store.getPin(a);
  const pinB = store.getPin(b);
  if (!pinA || !pinB) return { ok: false, reason: 'Pino inexistente.' };

  if (a.nodeId === b.nodeId && a.pinId === b.pinId) {
    return { ok: false, reason: 'Não é possível conectar um pino a ele mesmo.' };
  }

  if (pinA.kind === pinB.kind) {
    const tipo = pinA.kind === 'out' ? 'saída' : 'entrada';
    return { ok: false, reason: `Não é possível ligar dois pinos de ${tipo}.` };
  }

  const from = pinA.kind === 'out' ? a : b;
  const to = pinA.kind === 'out' ? b : a;

  if (store.isInputOccupied(to)) {
    return { ok: false, reason: 'O pino de entrada já está conectado.' };
  }

  return { ok: true, from, to };
}
