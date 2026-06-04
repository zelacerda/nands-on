import type { ChipDefinition, CircuitState } from './model';

let seq = 0;

/** Próximo id sequencial de chip (`chip1`, `chip2`, …). */
function nextChipId(): string {
  seq += 1;
  return `chip${seq}`;
}

/** Extrai o sufixo numérico de um id de chip (`chip12` → 12), ou 0 se não casar. */
function chipIdNumber(id: string): number {
  const m = /^chip(\d+)$/.exec(id);
  return m ? Number(m[1]) : 0;
}

/**
 * Avança o contador de ids para além de todos os ids dados, evitando colisão de
 * `chipN` após restaurar definições persistidas. Idempotente.
 */
export function primeSeqFromIds(ids: Iterable<string>): void {
  for (const id of ids) seq = Math.max(seq, chipIdNumber(id));
}

/**
 * Captura um `CircuitState` como a definição de um chip. Os nós de entrada e
 * de saída do espaço viram os pinos externos, **ordenados de cima para baixo**
 * (pela posição vertical). A topologia interna é preservada integralmente
 * (incluindo nós `chip` aninhados) para a simulação futura.
 *
 * `id` permite **reusar** o id de uma definição existente (ao reeditar um chip),
 * preservando as referências (`defId`) das instâncias já colocadas. Sem `id`,
 * gera um novo id sequencial.
 */
export function captureDefinition(state: CircuitState, name: string, id?: string): ChipDefinition {
  const byY = (a: { pos: { y: number } }, b: { pos: { y: number } }) => a.pos.y - b.pos.y;
  const inputs = state.nodes.filter((n) => n.type === 'input').sort(byY);
  const outputs = state.nodes.filter((n) => n.type === 'output').sort(byY);
  return {
    id: id ?? nextChipId(),
    name,
    inputCount: inputs.length,
    outputCount: outputs.length,
    // Os nomes dos nós I/O viram os rótulos dos pinos do chip, na mesma ordem
    // vertical. Nós não renomeados caem para o padrão "IN"/"OUT".
    inputLabels: inputs.map((n) => n.name ?? 'IN'),
    outputLabels: outputs.map((n) => n.name ?? 'OUT'),
    internal: state,
  };
}

export type NameValidation = { ok: true; name: string } | { ok: false; reason: string };

/**
 * Valida o nome de um chip: não pode ser vazio (após trim) nem colidir com outro
 * chip da biblioteca. `excludeId` ignora a definição com aquele id na checagem de
 * duplicata — usado ao renomear um chip para o que ele já é, ou variações de
 * caixa do próprio nome. Em caso de sucesso devolve o nome normalizado (trimado).
 */
export function validateChipName(
  library: ChipLibrary,
  raw: string,
  excludeId?: string,
): NameValidation {
  const name = raw.trim();
  if (!name) return { ok: false, reason: 'Informe um nome para o componente.' };
  const existing = library.get(name);
  if (existing && existing.id !== excludeId) {
    return { ok: false, reason: `Já existe um chip chamado "${name}".` };
  }
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
 * Biblioteca de chips em memória, indexada por nome (único). A ordem de inserção
 * é preservada (a paleta a usa). Mutar a biblioteca dispara {@link ChipLibrary.onMutate},
 * usado para persistir em IndexedDB (ver `persistence.ts`).
 */
export class ChipLibrary {
  private byName = new Map<string, ChipDefinition>();

  /**
   * Chamado após qualquer mutação (add/update/rename/load) com a lista atual de
   * definições. A camada de persistência liga este hook para salvar a biblioteca.
   */
  onMutate?: (defs: ChipDefinition[]) => void;

  has(name: string): boolean {
    return this.byName.has(name);
  }

  /** Adiciona uma definição; lança {@link DuplicateChipNameError} se o nome já existir. */
  add(def: ChipDefinition): void {
    if (this.byName.has(def.name)) throw new DuplicateChipNameError(def.name);
    this.byName.set(def.name, def);
    this.onMutate?.(this.list());
  }

  get(name: string): ChipDefinition | undefined {
    return this.byName.get(name);
  }

  /** Recupera uma definição por id (estável; usado pela resolução de instâncias). */
  getById(id: string): ChipDefinition | undefined {
    for (const def of this.byName.values()) if (def.id === id) return def;
    return undefined;
  }

  /**
   * Substitui a definição de mesmo `id`, preservando a posição na ordem e a
   * chave de nome (assume nome inalterado — para renomear use {@link rename}).
   * No-op se o id não existir.
   */
  update(def: ChipDefinition): void {
    const current = this.getById(def.id);
    if (!current) return;
    this.byName.set(current.name, def);
    this.onMutate?.(this.list());
  }

  /**
   * Renomeia a definição de id `id` para `newName`, preservando a posição na
   * ordem de inserção. No-op se o id não existir.
   */
  rename(id: string, newName: string): void {
    const entries = [...this.byName.entries()];
    const idx = entries.findIndex(([, d]) => d.id === id);
    if (idx === -1) return;
    entries[idx] = [newName, { ...entries[idx]![1], name: newName }];
    this.byName = new Map(entries);
    this.onMutate?.(this.list());
  }

  /**
   * Substitui todo o conteúdo da biblioteca pelas definições dadas (ex.: ao
   * restaurar do IndexedDB no boot). Avança o contador de ids para não colidir.
   * Não dispara {@link onMutate} (a carga não é uma mutação a persistir).
   */
  load(defs: ChipDefinition[]): void {
    this.byName = new Map(defs.map((d) => [d.name, d]));
    primeSeqFromIds(defs.map((d) => d.id));
  }

  list(): ChipDefinition[] {
    return [...this.byName.values()];
  }
}
