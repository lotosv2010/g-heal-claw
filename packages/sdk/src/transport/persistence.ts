import type { SdkEvent } from "@g-heal-claw/shared";

/**
 * IndexedDB 离线持久化（ADR-0034 T1.2.6.1）
 *
 * DB: ghc-offline-queue
 * Store: pending-events
 * 容量: ≤ 500 事件（超出 trim 最旧）
 * 重试: 最多 3 次（retryCount >= 3 永久删除）
 */

const DB_NAME = "ghc-offline-queue";
const STORE_NAME = "pending-events";
const DB_VERSION = 1;
const MAX_EVENTS = 500;
const MAX_RETRIES = 3;

export interface PendingBatch {
  readonly id: number;
  readonly events: SdkEvent[];
  readonly retryCount: number;
  readonly createdAt: number;
}

export interface Persistence {
  store(events: SdkEvent[]): Promise<void>;
  readAll(): Promise<PendingBatch[]>;
  remove(id: number): Promise<void>;
  incrementRetry(id: number): Promise<void>;
  trim(): Promise<void>;
  isAvailable(): boolean;
}

export function createPersistence(): Persistence {
  let dbPromise: Promise<IDBDatabase> | null = null;

  function available(): boolean {
    return typeof indexedDB !== "undefined";
  }

  function getDb(): Promise<IDBDatabase> {
    if (!dbPromise) {
      dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return dbPromise;
  }

  async function withStore<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await getDb();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return {
    isAvailable(): boolean {
      return available();
    },

    async store(events: SdkEvent[]): Promise<void> {
      if (!available()) return;
      const record = { events, retryCount: 0, createdAt: Date.now() };
      await withStore("readwrite", (s) => s.add(record));
      await this.trim();
    },

    async readAll(): Promise<PendingBatch[]> {
      if (!available()) return [];
      const db = await getDb();
      return new Promise<PendingBatch[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result ?? []) as PendingBatch[]);
        req.onerror = () => reject(req.error);
      });
    },

    async remove(id: number): Promise<void> {
      if (!available()) return;
      await withStore("readwrite", (s) => s.delete(id));
    },

    async incrementRetry(id: number): Promise<void> {
      if (!available()) return;
      const db = await getDb();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);
      await new Promise<void>((resolve, reject) => {
        getReq.onsuccess = () => {
          const record = getReq.result as PendingBatch | undefined;
          if (!record) { resolve(); return; }
          if (record.retryCount + 1 >= MAX_RETRIES) {
            store.delete(id);
          } else {
            store.put({ ...record, retryCount: record.retryCount + 1 });
          }
          resolve();
        };
        getReq.onerror = () => reject(getReq.error);
      });
    },

    async trim(): Promise<void> {
      if (!available()) return;
      const all = await this.readAll();
      // 计算总事件数
      let total = 0;
      for (const batch of all) total += batch.events.length;
      if (total <= MAX_EVENTS) return;
      // 按 createdAt 排序，删最旧的直到 ≤ MAX_EVENTS
      const sorted = [...all].sort((a, b) => a.createdAt - b.createdAt);
      for (const batch of sorted) {
        if (total <= MAX_EVENTS) break;
        await this.remove(batch.id);
        total -= batch.events.length;
      }
    },
  };
}
