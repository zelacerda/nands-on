import type { CircuitNode, CircuitState } from './model';

/**
 * Resultado de uma avaliação do circuito. Os valores são indexados por chaves
 * estáveis de pino (`nodeId:pinId`) e por id de fio, para que a renderização
 * possa colorir pinos, fios e acender entradas/saídas.
 */
export interface SignalState {
  /** Valor booleano de cada pino (entrada e saída), por `pinKey`. */
  pinValues: Map<string, boolean>;
  /** Valor booleano transportado por cada fio, por id de fio. */
  wireValues: Map<string, boolean>;
}

/** Chave estável de um pino para indexar valores de sinal. */
export function pinKey(nodeId: string, pinId: string): string {
  return `${nodeId}:${pinId}`;
}

/** Resolve a definição de um chip a partir do nó instância (via `defId`). */
export type ChipResolver = (node: CircuitNode) => CircuitState | undefined;
