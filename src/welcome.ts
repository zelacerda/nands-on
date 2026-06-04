/**
 * Preferência de UI da tela de boas-vindas. A flag de "não mostrar novamente" vive
 * em `localStorage` (preferência leve do navegador); o IndexedDB segue exclusivo
 * para circuitos/chips. As funções recebem o storage por parâmetro (com `localStorage`
 * como padrão), o que as torna puras o suficiente para teste.
 */

/** Chave em `localStorage` que marca a dispensa das boas-vindas. */
export const WELCOME_DISMISSED_KEY = 'nandson.welcomeDismissed';

/**
 * Decide se o painel deve abrir automaticamente como boas-vindas: abre sempre que
 * o usuário ainda não pediu para não mostrar de novo.
 */
export function shouldAutoShowWelcome(dismissed: boolean): boolean {
  return !dismissed;
}

/** Lê a flag de dispensa; trata ambientes sem `localStorage` (ex.: modo privado). */
export function isWelcomeDismissed(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  try {
    return storage.getItem(WELCOME_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Persiste a flag de dispensa; silencioso se `localStorage` não estiver disponível. */
export function setWelcomeDismissed(
  dismissed: boolean,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try {
    storage.setItem(WELCOME_DISMISSED_KEY, String(dismissed));
  } catch {
    // Ambiente sem localStorage: ignora — a flag simplesmente não persiste.
  }
}
