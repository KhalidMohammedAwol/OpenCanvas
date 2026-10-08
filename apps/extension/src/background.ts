import type { CaptureEnvelope } from "@filmboard/contracts";
import { IndexedDbDraftStore, IndexedDbQueueStore, nextRetryAt, type QueueOperation } from "./queue.js";

const store = new IndexedDbQueueStore();
const drafts = new IndexedDbDraftStore();
const API = "http://127.0.0.1:43117";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "filmboard-save", title: "Save to FilmBoard", contexts: ["image"] });
  chrome.contextMenus.create({ id: "filmboard-note", title: "Save to FilmBoard with note", contexts: ["image"] });
});

chrome.contextMenus.onClicked.addListener((info: any, tab: any) => {
  if (!tab?.id || !info.srcUrl) return;
  chrome.tabs.sendMessage(tab.id, { type: info.menuItemId === "filmboard-note" ? "open-note" : "save-image", imageUrl: info.srcUrl, pageUrl: info.pageUrl ?? tab.url });
});

chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (response: unknown) => void) => {
  if (message?.type === "queue-status") {
    void store.getAll().then((operations) => sendResponse({ operations })).catch((error) => sendResponse({ error: error instanceof Error ? error.message : "QUEUE_READ_FAILED" }));
    return true;
  }
  if (message?.type === "queue-retry") {
    void flush().then(() => store.getAll()).then((operations) => sendResponse({ operations })).catch((error) => sendResponse({ error: error instanceof Error ? error.message : "QUEUE_RETRY_FAILED" }));
    return true;
  }
  if (message?.type === "note-draft" && message.captureId) {
    void drafts.save({ captureId: message.captureId, text: message.text ?? "", revision: message.revision ?? 0, updatedAt: new Date().toISOString() }).then(() => sendResponse({ saved: true })).catch((error) => sendResponse({ saved: false, error: error instanceof Error ? error.message : "DRAFT_WRITE_FAILED" }));
    return true;
  }
  if (message?.type !== "capture") return false;
  const envelope = message.envelope as CaptureEnvelope;
  const operation: QueueOperation = { operationId: envelope.operationId, captureId: envelope.captureId, payload: envelope, status: "pending", attempts: 0, nextAttemptAt: Date.now(), createdAt: new Date().toISOString() };
  void store.put(operation).then(() => flush()).then(async () => {
    const saved = (await store.getAll()).find((item) => item.operationId === operation.operationId);
    sendResponse({ queued: true, delivered: saved?.status === "delivered", lastError: saved?.lastError });
  }).catch((error) => sendResponse({ queued: false, error: error instanceof Error ? error.message : "QUEUE_WRITE_FAILED" }));
  return true;
});

chrome.alarms.create("filmboard-retry", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(() => void flush());

async function flush(): Promise<void> {
  const pending = await store.getPending();
  const stored = await chrome.storage.local.get("filmboardToken");
  for (const operation of pending.slice(0, 2)) {
    try {
      const headers: Record<string, string> = { "content-type": "application/json" }; if (stored.filmboardToken) headers["x-filmboard-token"] = stored.filmboardToken;
      const response = await fetch(`${API}/api/v1/captures`, { method: "POST", headers, body: JSON.stringify(operation.payload) });
      if (!response.ok) throw new Error(`API_${response.status}`);
      await store.markDelivered(operation.operationId);
    } catch (error) {
      await store.markFailed(operation.operationId, error instanceof Error ? error.message : "TRANSFER_FAILED", nextRetryAt(operation.attempts));
    }
  }
}
