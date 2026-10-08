import type { CaptureEnvelope } from "@filmboard/contracts";

export type QueueOperation = {
  operationId: string;
  captureId: string;
  payload: CaptureEnvelope;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
  createdAt: string;
};

export interface QueueStore {
  put(operation: QueueOperation): Promise<void>;
  getAll(): Promise<QueueOperation[]>;
  getPending(now?: number): Promise<QueueOperation[]>;
  markDelivered(operationId: string): Promise<void>;
  markFailed(operationId: string, error: string, nextAttemptAt: number): Promise<void>;
}

export type NoteDraft = { captureId: string; text: string; revision: number; updatedAt: string };

export class IndexedDbDraftStore {
  private readonly databaseName = "filmboard-extension";
  private readonly storeName = "capture-drafts";

  async save(draft: NoteDraft): Promise<void> {
    const database = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(this.storeName, "readwrite");
      transaction.objectStore(this.storeName).put(draft);
      transaction.onerror = () => reject(transaction.error ?? new Error("DRAFT_WRITE_FAILED"));
      transaction.oncomplete = () => { database.close(); resolve(); };
    });
  }

  async get(captureId: string): Promise<NoteDraft | undefined> {
    const database = await this.open();
    return new Promise<NoteDraft | undefined>((resolve, reject) => {
      const transaction = database.transaction(this.storeName, "readonly");
      const request = transaction.objectStore(this.storeName).get(captureId);
      request.onsuccess = () => resolve(request.result as NoteDraft | undefined);
      request.onerror = () => reject(request.error ?? new Error("DRAFT_READ_FAILED"));
      transaction.oncomplete = () => database.close();
    });
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 2);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("capture-queue")) request.result.createObjectStore("capture-queue", { keyPath: "operationId" }); if (!request.result.objectStoreNames.contains(this.storeName)) request.result.createObjectStore(this.storeName, { keyPath: "captureId" }); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("DRAFT_OPEN_FAILED"));
    });
  }
}

export class IndexedDbQueueStore implements QueueStore {
  private readonly databaseName = "filmboard-extension";
  private readonly storeName = "capture-queue";

  async put(operation: QueueOperation): Promise<void> {
    const database = await this.open();
    await this.transaction(database, "readwrite", (store) => store.put(operation));
  }

  async getAll(): Promise<QueueOperation[]> {
    const database = await this.open();
    return this.transaction<QueueOperation[]>(database, "readonly", (store, resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as QueueOperation[]);
      request.onerror = () => reject(request.error ?? new Error("QUEUE_READ_FAILED"));
    });
  }

  async getPending(now = Date.now()): Promise<QueueOperation[]> {
    const database = await this.open();
    return this.transaction<QueueOperation[]>(database, "readonly", (store, resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve((request.result as QueueOperation[]).filter((item) => item.status === "pending" && item.nextAttemptAt <= now).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      request.onerror = () => reject(request.error ?? new Error("QUEUE_READ_FAILED"));
    });
  }

  async markDelivered(operationId: string): Promise<void> {
    await this.update(operationId, (item) => ({ ...item, status: "delivered" }));
  }

  async markFailed(operationId: string, error: string, nextAttemptAt: number): Promise<void> {
    await this.update(operationId, (item) => ({ ...item, status: "pending", attempts: item.attempts + 1, lastError: error, nextAttemptAt }));
  }

  private async update(operationId: string, transform: (item: QueueOperation) => QueueOperation): Promise<void> {
    const database = await this.open();
    await this.transaction(database, "readwrite", (store, resolve, reject) => {
      const request = store.get(operationId);
      request.onsuccess = () => {
        if (request.result) store.put(transform(request.result as QueueOperation));
        resolve();
      };
      request.onerror = () => reject(request.error ?? new Error("QUEUE_UPDATE_FAILED"));
    });
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 2);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(this.storeName)) request.result.createObjectStore(this.storeName, { keyPath: "operationId" }); if (!request.result.objectStoreNames.contains("capture-drafts")) request.result.createObjectStore("capture-drafts", { keyPath: "captureId" }); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("QUEUE_OPEN_FAILED"));
    });
  }

  private transaction<T = void>(database: IDBDatabase, mode: IDBTransactionMode, action: (store: IDBObjectStore, resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: unknown) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(this.storeName, mode);
      let result: T | PromiseLike<T>;
      const fail = (reason?: unknown) => { database.close(); reject(reason ?? new Error("QUEUE_TRANSACTION_FAILED")); };
      transaction.onerror = () => fail(transaction.error);
      transaction.onabort = () => fail(transaction.error ?? new Error("QUEUE_TRANSACTION_ABORTED"));
      transaction.oncomplete = () => { database.close(); resolve(result); };
      try {
        action(transaction.objectStore(this.storeName), (value) => { result = value; }, fail);
      } catch (error) {
        transaction.abort();
        fail(error);
      }
    });
  }
}

export function nextRetryAt(attempts: number, now = Date.now()): number {
  const delay = Math.min(15 * 60_000, 1_000 * 2 ** Math.min(attempts, 10));
  return now + delay + Math.floor(Math.random() * 500);
}
