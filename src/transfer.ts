import type { ChipDefinition } from './model';

/**
 * Serialização da biblioteca de chips para um arquivo `.json` portável, usado
 * pelas ações Export/Import do menu. O arquivo é um envelope versionado:
 *
 * ```json
 * { "format": "nands-on", "version": "1.0", "chips": [ ...ChipDefinition ] }
 * ```
 *
 * O campo `version` torna explícita a (in)compatibilidade entre formatos: um
 * arquivo de versão diferente da atual é rejeitado no import — não há migração
 * automática nesta versão. Apenas a biblioteca de chips é transferida (não o
 * espaço de trabalho em edição).
 *
 * Este módulo é puro e independente de DOM/UI: a camada de UI mapeia os erros
 * ({@link ImportError.kind}) para mensagens localizadas.
 */

/** Identificador do formato gravado em todo arquivo exportado. */
export const FORMAT = 'nands-on';

/** Versão atual do formato. Arquivos de versão diferente são rejeitados. */
export const FORMAT_VERSION = '1.0';

/** Envelope de um arquivo de biblioteca exportado. */
export interface LibraryFile {
  format: typeof FORMAT;
  version: string;
  chips: ChipDefinition[];
}

/** Causa de uma falha de import — usada pela UI para escolher a mensagem. */
export type ImportErrorKind = 'json' | 'format' | 'version' | 'structure';

/** Erro de import com a causa categorizada em {@link ImportErrorKind}. */
export class ImportError extends Error {
  constructor(
    readonly kind: ImportErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

/** Serializa a biblioteca de chips no envelope versionado, com indentação. */
export function serializeLibrary(chips: ChipDefinition[]): string {
  const file: LibraryFile = { format: FORMAT, version: FORMAT_VERSION, chips };
  return JSON.stringify(file, null, 2);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Verifica a estrutura mínima de uma `ChipDefinition` desserializada. */
function isChipDefinition(value: unknown): value is ChipDefinition {
  if (!isObject(value)) return false;
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return false;
  if (typeof value.inputCount !== 'number' || typeof value.outputCount !== 'number') return false;
  if (!isObject(value.internal)) return false;
  if (!Array.isArray(value.internal.nodes) || !Array.isArray(value.internal.wires)) return false;
  return true;
}

/**
 * Desserializa e valida um arquivo de biblioteca, devolvendo as definições de
 * chip. Lança {@link ImportError} categorizando a causa: JSON inválido,
 * `format` desconhecido, `version` incompatível ou estrutura inconsistente.
 */
export function parseLibrary(text: string): ChipDefinition[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError('json', 'O arquivo não é um JSON válido.');
  }
  if (!isObject(data)) {
    throw new ImportError('structure', 'O conteúdo do arquivo não é um objeto.');
  }
  if (data.format !== FORMAT) {
    throw new ImportError('format', 'O arquivo não é uma biblioteca do NANDS-ON.');
  }
  if (data.version !== FORMAT_VERSION) {
    throw new ImportError(
      'version',
      `Versão de formato incompatível: ${String(data.version)} (esperado ${FORMAT_VERSION}).`,
    );
  }
  if (!Array.isArray(data.chips) || !data.chips.every(isChipDefinition)) {
    throw new ImportError('structure', 'A lista de chips está ausente ou malformada.');
  }
  return data.chips;
}
