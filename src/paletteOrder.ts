/**
 * Ordem de exibição dos componentes reordenáveis da paleta (NAND + chips).
 *
 * A ordem é uma lista de chaves: {@link NAND_KEY} para a primitiva NAND e o `id`
 * de cada chip. Vive em `localStorage` (preferência leve do navegador; o IndexedDB
 * segue exclusivo para os dados dos chips). As funções de transformação são puras
 * e o storage é injetável, o que as torna testáveis.
 *
 * O IndexedDB devolve os chips ordenados pela chave `id` (não pela inserção), então
 * sem esta ordem explícita a reordenação não sobreviveria a um reload.
 */

/** Sentinela da primitiva NAND dentro da ordem da paleta. */
export const NAND_KEY = 'nand';

/** Chave em `localStorage` que guarda a ordem da paleta (JSON de `string[]`). */
export const PALETTE_ORDER_KEY = 'nandson.paletteOrder';

/**
 * Concilia a ordem persistida com os chips realmente existentes:
 * - mantém as chaves válidas na ordem salva (NAND + ids de chips presentes);
 * - descarta ids de chips que não existem mais e chaves duplicadas/desconhecidas;
 * - garante o NAND exatamente uma vez (no topo, se ausente da ordem salva);
 * - anexa ao fim os chips novos (na ordem de `chipIds`), preservando a sequência.
 */
export function reconcileOrder(stored: readonly string[], chipIds: readonly string[]): string[] {
  const chipSet = new Set(chipIds);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const key of stored) {
    if (key === NAND_KEY) {
      if (!seen.has(NAND_KEY)) {
        result.push(NAND_KEY);
        seen.add(NAND_KEY);
      }
    } else if (chipSet.has(key) && !seen.has(key)) {
      result.push(key);
      seen.add(key);
    }
  }

  if (!seen.has(NAND_KEY)) {
    result.unshift(NAND_KEY);
    seen.add(NAND_KEY);
  }

  for (const id of chipIds) {
    if (!seen.has(id)) {
      result.push(id);
      seen.add(id);
    }
  }

  return result;
}

/**
 * Move o item de `fromIndex` para `toIndex`, devolvendo uma nova lista. Índices
 * fora do intervalo (ou iguais) resultam em uma cópia inalterada.
 */
export function moveItem(order: readonly string[], fromIndex: number, toIndex: number): string[] {
  const result = [...order];
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= result.length ||
    toIndex >= result.length
  ) {
    return result;
  }
  const [item] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, item as string);
  return result;
}

/** Lê a ordem persistida; devolve `[NAND_KEY]` se ausente/ilegível/corrompida. */
export function loadPaletteOrder(storage: Pick<Storage, 'getItem'> = localStorage): string[] {
  try {
    const raw = storage.getItem(PALETTE_ORDER_KEY);
    if (!raw) return [NAND_KEY];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((k) => typeof k === 'string')) {
      return parsed as string[];
    }
    return [NAND_KEY];
  } catch {
    return [NAND_KEY];
  }
}

/** Persiste a ordem; silencioso se `localStorage` não estiver disponível. */
export function savePaletteOrder(
  order: readonly string[],
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try {
    storage.setItem(PALETTE_ORDER_KEY, JSON.stringify(order));
  } catch {
    // Ambiente sem localStorage: ignora — a ordem simplesmente não persiste.
  }
}
