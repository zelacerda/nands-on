import type { ChipDefinition, CircuitState } from './model';

let seq = 0;

/**
 * Captura um `CircuitState` como a definição de um chip. Os nós de entrada e
 * de saída do espaço viram os pinos externos, **ordenados de cima para baixo**
 * (pela posição vertical). A topologia interna é preservada integralmente
 * (incluindo nós `chip` aninhados) para a simulação futura.
 */
export function captureDefinition(state: CircuitState, name: string): ChipDefinition {
  const byY = (a: { pos: { y: number } }, b: { pos: { y: number } }) => a.pos.y - b.pos.y;
  const inputs = state.nodes.filter((n) => n.type === 'input').sort(byY);
  const outputs = state.nodes.filter((n) => n.type === 'output').sort(byY);
  seq += 1;
  return {
    id: `chip${seq}`,
    name,
    inputCount: inputs.length,
    outputCount: outputs.length,
    internal: state,
  };
}

export type NameValidation = { ok: true; name: string } | { ok: false; reason: string };

/**
 * Valida o nome de um novo chip: não pode ser vazio (após trim) nem já existir
 * na biblioteca. Em caso de sucesso devolve o nome normalizado (trimado).
 */
export function validateChipName(library: ChipLibrary, raw: string): NameValidation {
  const name = raw.trim();
  if (!name) return { ok: false, reason: 'Informe um nome para o componente.' };
  if (library.has(name)) return { ok: false, reason: `Já existe um chip chamado "${name}".` };
  return { ok: true, name };
}

/** Erro lançado ao tentar adicionar um chip com nome já existente. */
export class DuplicateChipNameError extends Error {
  constructor(name: string) {
    super(`Já existe um chip chamado "${name}".`);
    this.name = 'DuplicateChipNameError';
  }
}

/**
 * Biblioteca de chips em memória, indexada por nome (único). Não há
 * persistência nesta etapa — a biblioteca é perdida ao recarregar a página.
 */
export class ChipLibrary {
  private byName = new Map<string, ChipDefinition>();

  has(name: string): boolean {
    return this.byName.has(name);
  }

  /** Adiciona uma definição; lança {@link DuplicateChipNameError} se o nome já existir. */
  add(def: ChipDefinition): void {
    if (this.byName.has(def.name)) throw new DuplicateChipNameError(def.name);
    this.byName.set(def.name, def);
  }

  get(name: string): ChipDefinition | undefined {
    return this.byName.get(name);
  }

  list(): ChipDefinition[] {
    return [...this.byName.values()];
  }
}
