/**
 * Solve storage. IndexedDB in the browser (one object store keyed by id); an in-memory store for
 * tests and as a fallback when IndexedDB is unavailable (private mode). Capacitor's SQLite can
 * implement the same interface later.
 */
import type { Solve } from './stats';

export interface SolveStore {
  /** All solves, oldest first. */
  list(): Promise<Solve[]>;
  put(s: Solve): Promise<void>;
  putMany(s: Solve[]): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  readonly persistent: boolean;
}

export class MemoryStore implements SolveStore {
  readonly persistent = false;
  private m = new Map<string, Solve>();
  async list() {
    return [...this.m.values()].sort((a, b) => a.date - b.date);
  }
  async put(s: Solve) {
    this.m.set(s.id, { ...s });
  }
  async putMany(list: Solve[]) {
    for (const s of list) this.m.set(s.id, { ...s });
  }
  async remove(id: string) {
    this.m.delete(id);
  }
  async clear() {
    this.m.clear();
  }
}

const DB = 'rubik-solver';
const STORE = 'solves';

export class IdbStore implements SolveStore {
  readonly persistent = true;
  private constructor(private db: IDBDatabase) {}

  static async open(): Promise<IdbStore> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('date', 'date');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return new IdbStore(db);
  }

  private tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const t = this.db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  async list() {
    const all = (await this.tx<Solve[]>('readonly', (s) => s.getAll())) ?? [];
    return all.sort((a, b) => a.date - b.date);
  }
  async put(s: Solve) {
    await this.tx('readwrite', (st) => st.put(s));
  }
  async putMany(list: Solve[]) {
    await this.tx('readwrite', (st) => {
      for (const s of list) st.put(s);
    });
  }
  async remove(id: string) {
    await this.tx('readwrite', (st) => st.delete(id));
  }
  async clear() {
    await this.tx('readwrite', (st) => st.clear());
  }
}

export async function openStore(): Promise<SolveStore> {
  try {
    if (typeof indexedDB === 'undefined') return new MemoryStore();
    return await IdbStore.open();
  } catch {
    return new MemoryStore();
  }
}
