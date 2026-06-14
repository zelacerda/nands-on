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
  'meta.description':
    'NANDS-ON — build digital logic from a single NAND gate up to a CPU, right in your browser.',
  'a11y.editor': 'Circuit editor',
  'a11y.palette': 'Component palette',
  'a11y.renameInput': 'Input or output name',
  'a11y.about': 'About NANDS-ON',
  'a11y.menu': 'Commands menu',

  // Marca e painel "Sobre" / boas-vindas
  'app.name': 'NANDS-ON',
  'app.tagline': 'From NAND to CPU',
  'about.button': '?',
  'about.intro':
    'Build digital logic hands-on: start from a single NAND gate, package your circuits into reusable chips, and work your way up to a CPU — all in the browser.',
  'about.creditsTitle': 'Credits',
  'about.author': 'Created by Zé Lacerda.',
  'about.inspiredBy': 'Inspired by',
  'about.dlsLink': "Sebastian Lague's Digital-Logic-Sim",
  'about.repoLink': 'Source on GitHub',
  'about.dontShowAgain': "Don't show this at start-up",
  'about.close': 'Close',

  // Paleta de componentes
  'palette.input': 'IN',
  'palette.output': 'OUT',

  // Menu de comandos (≡)
  'menu.title': 'COMMANDS',
  'menu.import': 'Import',
  'menu.export': 'Export',
  'menu.about': 'About',

  // Barra de ações contextual (componente/nó/fio selecionado)
  'action.edit': 'Edit',
  'action.rename': 'Rename',
  'action.delete': 'Delete',

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

  // Tutorial (walkthrough): controles e mensagens
  'tutorial.start': 'Start Tutorial',
  'tutorial.exit': 'Exit',
  'tutorial.progress': 'Step {n} of {total}',
  'tutorial.done':
    'You built a NOT gate from a NAND — and packaged it as a chip. That is the whole idea of NANDS-ON: keep composing simple parts into bigger ones, all the way up to a CPU.',
  'tutorial.doneTitle': 'Nicely done!',

  // Tutorial: passos
  'tutorial.step.addInput': 'Drag the round IN button onto the canvas to place an input.',
  'tutorial.step.addNand': 'Now drag the NAND button onto the canvas — our only building block.',
  'tutorial.step.addOutput': 'Drag the round OUT button onto the canvas to place an output.',
  'tutorial.step.wireInput':
    'Wire the input to BOTH inputs of the NAND: drag from the input pin to each NAND input pin.',
  'tutorial.step.wireOutput': 'Now wire the NAND output pin to the output.',
  'tutorial.step.toggle':
    'Tap the input to select it, then tap again to cycle its state: OFF → ON → CLK → OFF. Watch the output show the opposite — congrats, you just made a NOT gate!',
  'tutorial.step.rename':
    'Select the input (or the output), then tap "Rename" in the bar below — try naming the input "A".',
  'tutorial.step.make': 'Finally, click "Make" to package your NOT into a reusable chip.',
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
