type Operation = { operationId: string; payload: { source: { pageUrl: string }; capture: { noteText: string } }; status: string; attempts: number; lastError?: string };
const summary = document.querySelector("#summary") as HTMLElement;
const items = document.querySelector("#items") as HTMLElement;

function render(operations: Operation[] = []): void {
  const pending = operations.filter((operation) => operation.status === "pending");
  summary.textContent = pending.length ? `${pending.length} capture${pending.length === 1 ? "" : "s"} waiting to transfer.` : "Queue is clear.";
  items.replaceChildren(...pending.map((operation) => { const row = document.createElement("div"); row.className = "row"; row.textContent = operation.payload.capture.noteText || "Image capture without a note"; const detail = document.createElement("small"); detail.textContent = `${operation.payload.source.pageUrl}${operation.lastError ? ` · ${operation.lastError}` : ""}`; row.append(detail); const copy = document.createElement("button"); copy.className = "secondary"; copy.textContent = "Copy"; copy.onclick = () => navigator.clipboard.writeText(`${operation.payload.capture.noteText}\n${operation.payload.source.pageUrl}`); row.append(copy); return row; }));
}

function load(): void { chrome.runtime.sendMessage({ type: "queue-status" }, (response: { operations?: Operation[]; error?: string }) => { if (response?.error) summary.textContent = response.error; else render(response?.operations); }); }
document.querySelector("#retry")?.addEventListener("click", () => chrome.runtime.sendMessage({ type: "queue-retry" }, (response: { operations?: Operation[]; error?: string }) => { if (response?.error) summary.textContent = response.error; else render(response?.operations); }));
document.querySelector("#inbox")?.addEventListener("click", () => chrome.tabs.create({ url: "http://127.0.0.1:5173/" }));
load();
