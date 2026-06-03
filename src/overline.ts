/**
 * Barra superior (overline) para rótulos de sinais negados (ex.: `Q̄`).
 *
 * Implementada com o caractere combinante U+0305, aplicado após cada caractere
 * base. Assim o rótulo continua sendo uma string comum, renderizável no canvas
 * e digitável sem teclado especial.
 */

/** Marca combinante de barra superior (U+0305). */
export const OVERLINE = '̅';

/** Verdadeiro se o texto já contém ao menos uma barra superior. */
export function hasOverline(text: string): boolean {
  return text.includes(OVERLINE);
}

/** Remove todas as barras superiores do texto. */
export function removeOverline(text: string): string {
  return text.replaceAll(OVERLINE, '');
}

/** Aplica barra superior sobre cada caractere base do texto. */
export function applyOverline(text: string): string {
  return [...removeOverline(text)].map((c) => c + OVERLINE).join('');
}

/** Alterna a barra superior sobre todo o texto (aplica se não houver, remove se houver). */
export function toggleOverline(text: string): string {
  return hasOverline(text) ? removeOverline(text) : applyOverline(text);
}
