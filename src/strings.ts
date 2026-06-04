/**
 * Fonte única de verdade para os textos da interface, em inglês.
 *
 * Centralizar aqui prepara o terreno para internacionalização (i18n) futura: as
 * chaves são agrupadas por contexto e tipadas (`StringKey`), e os textos estáticos
 * do `index.html` são preenchidos por {@link applyStrings} a partir dos atributos
 * `data-i18n` / `data-i18n-attr`. Apenas os VALORES exibidos ao usuário são
 * traduzidos — código, comentários e identificadores permanecem em português.
 *
 * Para adicionar um idioma no futuro, basta envolver `STRINGS` em um mapa de
 * locales (ex.: `{ en: {...}, pt: {...} }`) e selecionar o idioma em `t`.
 */
export const STRINGS = {
  // Metadados / acessibilidade
  'meta.description': 'From NAND to CPU — a digital logic simulator in the browser.',
  'a11y.editor': 'Circuit editor',
  'a11y.palette': 'Component palette',
  'a11y.renameInput': 'Input or output name',

  // Paleta de componentes
  'palette.input': 'IN',
  'palette.output': 'OUT',
  'palette.clock': 'CLK',
  'palette.edit': 'Edit',
  'palette.delete': 'Delete',

  // Fluxo "Make"
  'make': 'Make',

  // Barra de edição de chip
  'editBar.finish': 'Save',
  'editBar.cancel': 'Cancel',
  'editBar.editing': 'Editing: {name}',

  // Limpar banco local
  'clearDb': 'Clear DB',
  'clearDb.confirm': 'Clear the local database? All saved chips will be removed.',

  // Validação de nome de chip
  'validation.emptyName': 'Enter a name for the component.',
  'validation.duplicateName': 'A chip named "{name}" already exists.',
} as const;

export type StringKey = keyof typeof STRINGS;

/**
 * Devolve o texto da chave, interpolando placeholders no formato `{nome}` com os
 * valores de `params`. Placeholders sem valor correspondente são mantidos como
 * estão (útil para detectar parâmetros faltando em desenvolvimento).
 */
export function t(key: StringKey, params?: Record<string, string | number>): string {
  const template: string = STRINGS[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Preenche os textos estáticos do DOM a partir de {@link STRINGS}.
 *
 * - `data-i18n="chave"` → define o `textContent` do elemento.
 * - `data-i18n-attr="attr:chave[,attr2:chave2]"` → define atributos (ex.:
 *   `aria-label`, `content`, `placeholder`).
 *
 * Deve ser chamada no carregamento, antes de qualquer leitura de texto da UI.
 */
export function applyStrings(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (key && key in STRINGS) el.textContent = STRINGS[key as StringKey];
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach((el) => {
    for (const pair of (el.dataset.i18nAttr ?? '').split(',')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key && key in STRINGS) el.setAttribute(attr, STRINGS[key as StringKey]);
    }
  });
}
