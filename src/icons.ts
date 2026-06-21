/**
 * Registro central de ícones SVG.
 *
 * Os ícones são do pacote **coolicons** (CC-BY) — créditos e licença em
 * `src/assets/icons/ATTRIBUTION.md`. Cada SVG é importado como markup (`?raw`) e
 * injetado inline no DOM, o que permite herdar a cor do tema via
 * `stroke="currentColor"` e dimensionar pelo CSS (classe `.icon`).
 *
 * Uso declarativo: marque um elemento com `data-icon="nome"` no HTML e chame
 * {@link applyIcons} no carregamento — o ícone é inserido no início do elemento,
 * preservando rótulos em `<span data-i18n>` (que são preenchidos por `applyStrings`).
 */
import addPlus from './assets/icons/add-plus-svgrepo-com.svg?raw';
import checkBig from './assets/icons/check-big-svgrepo-com.svg?raw';
import closeMd from './assets/icons/close-md-svgrepo-com.svg?raw';
import dragVertical from './assets/icons/drag-vertical-svgrepo-com.svg?raw';
import editPencil from './assets/icons/edit-pencil-01-svgrepo-com.svg?raw';
import fileDownload from './assets/icons/file-download-svgrepo-com.svg?raw';
import fileUpload from './assets/icons/file-upload-svgrepo-com.svg?raw';
import hamburger from './assets/icons/hamburger-lg-svgrepo-com.svg?raw';
import help from './assets/icons/help-svgrepo-com.svg?raw';
import info from './assets/icons/info-svgrepo-com.svg?raw';
import text from './assets/icons/text-svgrepo-com.svg?raw';
import trash from './assets/icons/trash-full-svgrepo-com.svg?raw';
import warning from './assets/icons/triangle-warning-svgrepo-com.svg?raw';

export const ICONS = {
  'add-plus': addPlus,
  'check-big': checkBig,
  'close-md': closeMd,
  // Reservado para a futura reordenação de componentes por arrastar.
  'drag-vertical': dragVertical,
  'edit-pencil': editPencil,
  'file-download': fileDownload,
  'file-upload': fileUpload,
  hamburger,
  help,
  info,
  text,
  trash,
  warning,
} as const;

export type IconName = keyof typeof ICONS;

/** Markup de um `<span class="icon">` com o SVG embutido (decorativo). */
export function iconSpan(name: IconName): string {
  return `<span class="icon" aria-hidden="true">${ICONS[name]}</span>`;
}

/**
 * Insere ícones nos elementos com `data-icon="nome"`, prefixando-os ao conteúdo
 * existente (rótulos em `<span data-i18n>` permanecem intactos). Nomes
 * desconhecidos são ignorados.
 */
export function applyIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    const name = el.dataset.icon;
    if (name && name in ICONS) {
      el.insertAdjacentHTML('afterbegin', iconSpan(name as IconName));
    }
  });
}
