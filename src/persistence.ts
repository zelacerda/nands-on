import type { ChipDefinition } from './model';

/**
 * Persistência da biblioteca de chips em IndexedDB. O espaço de trabalho não é
 * persistido — apenas as definições de chip, que sobrevivem a recargas da página.
 *
 * A camada degrada graciosamente: se o IndexedDB estiver indisponível (modo
 * privado, navegador antigo, contexto sem suporte), `loadChips` devolve `[]` e
 * `saveChips`/`clearChips` viram no-ops — a aplicação segue funcionando só em
 * memória.
 */

const DB_NAME = 'from-nand-to-cpu';
const STORE = 'chips';
const VERSION = 1;

/** Abre (e cria, se preciso) o banco. Rejeita se o IndexedDB não existir. */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // Cada definição é guardada sob a sua própria `id` (`chip1`, …).
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Falha ao abrir o IndexedDB.'));
  });
}

/** Envolve uma transação numa promessa que resolve no `complete`. */
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Falha na transação do IndexedDB.'));
    tx.onabort = () => reject(tx.error ?? new Error('Transação do IndexedDB abortada.'));
  });
}

/** Carrega todas as definições persistidas. Devolve `[]` se o storage falhar. */
export async function loadChips(): Promise<ChipDefinition[]> {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      const defs = await new Promise<ChipDefinition[]>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result as ChipDefinition[]);
        req.onerror = () => reject(req.error ?? new Error('Falha ao ler chips.'));
      });
      return defs;
    } finally {
      db.close();
    }
  } catch (err) {
    console.warn('[persistence] não foi possível carregar a biblioteca:', err);
    return [];
  }
}

/**
 * Persiste a biblioteca inteira: limpa o store e regrava todas as definições.
 * Reescrever tudo é simples e barato para o tamanho esperado da biblioteca, e
 * garante que remoções/renomeações fiquem refletidas.
 */
export async function saveChips(defs: ChipDefinition[]): Promise<void> {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.clear();
      for (const def of defs) store.put(def);
      await txDone(tx);
    } finally {
      db.close();
    }
  } catch (err) {
    console.warn('[persistence] não foi possível salvar a biblioteca:', err);
  }
}

/** Apaga toda a biblioteca persistida (usado pelo botão de limpar banco). */
export async function clearChips(): Promise<void> {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      await txDone(tx);
    } finally {
      db.close();
    }
  } catch (err) {
    console.warn('[persistence] não foi possível limpar a biblioteca:', err);
  }
}
