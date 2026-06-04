import { type ChipDefinition, type CircuitState, chipInstancePins } from './model';
import { t } from './strings';

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
  // Captura uma cópia independente do espaço (sem mutar o original) e grava as
  // entradas **desligadas**: estado estático e modo clock zerados, para que um chip
  // recém-criado não carregue os últimos estados das entradas. Como nenhum nó fica
  // em modo clock, toda entrada vira um pino de entrada externo comum.
  const internal = structuredClone(state);
  for (const node of internal.nodes) {
    if (node.type === 'input') {
      node.value = false;
      node.clock = false;
    }
  }
  const byY = (a: { pos: { y: number } }, b: { pos: { y: number } }) => a.pos.y - b.pos.y;
  const inputs = internal.nodes.filter((n) => n.type === 'input').sort(byY);
  const outputs = internal.nodes.filter((n) => n.type === 'output').sort(byY);
  return {
    id: id ?? nextChipId(),
    name,
    inputCount: inputs.length,
    outputCount: outputs.length,
    // Os nomes dos nós I/O viram os rótulos dos pinos do chip, na mesma ordem
    // vertical. Nós não renomeados caem para o padrão "IN"/"OUT".
    inputLabels: inputs.map((n) => n.name ?? 'IN'),
    outputLabels: outputs.map((n) => n.name ?? 'OUT'),
    internal,
  };
}

/**
 * Reconcilia, **in place**, as instâncias de um chip dentro de um `CircuitState`
 * após a sua definição ter sido editada. Os pinos de cada instância são
 * regenerados a partir da nova definição (refletindo novos rótulos/posições) e
 * os fios ligados a pinos que **deixaram de existir** (quando o nº de I/O diminui)
 * são removidos. Como os ids de pino são estáveis por índice (`in0..inN`,
 * `out0..outM`), os fios dos índices sobreviventes permanecem válidos e os pinos
 * recém-criados ficam sem conexão. No-op se não houver instâncias do chip.
 */
export function reconcileInstances(state: CircuitState, def: ChipDefinition): void {
  const template = chipInstancePins(def);
  const validPinIds = new Set(template.map((p) => p.id));
  const affected = new Set<string>();
  for (const node of state.nodes) {
    if (node.type !== 'chip' || node.defId !== def.id) continue;
    affected.add(node.id);
    node.name = def.name;
    node.pins = template.map((p) => ({ ...p })); // pinos próprios por instância
  }
  if (affected.size === 0) return;
  const endpointDangling = (ref: { nodeId: string; pinId: string }) =>
    affected.has(ref.nodeId) && !validPinIds.has(ref.pinId);
  state.wires = state.wires.filter((w) => !endpointDangling(w.from) && !endpointDangling(w.to));
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
  if (!name) return { ok: false, reason: t('validation.emptyName') };
  const existing = library.get(name);
  if (existing && existing.id !== excludeId) {
    return { ok: false, reason: t('validation.duplicateName', { name }) };
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
