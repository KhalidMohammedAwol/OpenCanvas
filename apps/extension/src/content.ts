import type { CaptureEnvelope } from "@filmboard/contracts";

const ROOT_ID = "filmboard-extension-root";
const processed = new WeakSet<Element>();

function sourceFor(image: HTMLImageElement): { pageUrl: string; imageUrl: string; title?: string } {
  const anchor = image.closest("a");
  const pin = image.closest<HTMLElement>('[data-test-id="pin"]') ?? anchor?.parentElement;
  const heading = pin?.querySelector("h1, h2, h3, [data-test-id='pin-title']");
  const title = heading?.textContent?.trim() || anchor?.getAttribute("title")?.trim() || "";
  return { pageUrl: anchor?.href ?? location.href, imageUrl: image.currentSrc || image.src, ...(title ? { title } : {}) };
}

function capture(image: HTMLImageElement, noteText = "", captureId = crypto.randomUUID()): void {
  const source = sourceFor(image);
  const envelope: CaptureEnvelope = { schemaVersion: 1, captureId, operationId: crypto.randomUUID(), source: { site: "pinterest", pageUrl: source.pageUrl, imageCandidateUrl: source.imageUrl, ...(source.title ? { title: source.title } : {}) }, capture: { capturedAt: new Date().toISOString(), noteText, noteRevision: 0 }, intent: noteText ? "quick-note" : "save" };
  chrome.runtime.sendMessage({ type: "capture", envelope }, (response: { queued?: boolean; delivered?: boolean; lastError?: string; error?: string }) => {
    if (chrome.runtime.lastError || !response?.queued) { toast(image, response?.error ?? "Couldn't queue capture"); return; }
    if (response.delivered) toast(image, "Saved to FilmBoard");
    else toast(image, response.lastError ? `Queued — ${response.lastError}` : "Queued — waiting for FilmBoard");
  });
}

function toast(image: HTMLImageElement, message: string): void {
  const host = image.parentElement; if (!host) return;
  const label = document.createElement("span"); label.textContent = message; label.className = "filmboard-toast"; host.append(label); setTimeout(() => label.remove(), 2200);
}

function openNote(image: HTMLImageElement): void {
  const existing = document.getElementById(ROOT_ID); if (existing) existing.remove();
  const captureId = crypto.randomUUID(); const root = document.createElement("div"); root.id = ROOT_ID; root.innerHTML = `<div class="filmboard-backdrop"><section role="dialog" aria-label="FilmBoard Quick Note"><button class="filmboard-close" aria-label="Close">×</button><div class="filmboard-preview"></div><label>What scene did this make you think of?<textarea autofocus placeholder="A figure waits outside…"></textarea></label><div class="filmboard-state">Saved in browser after you type</div><button class="filmboard-save">Save & close</button></section></div>`;
  const style = document.createElement("style"); style.textContent = `#${ROOT_ID}{all:initial;font-family:system-ui;color:#f5f1ea}.filmboard-backdrop{position:fixed;inset:0;background:#0008;z-index:2147483647;display:grid;place-items:center}.filmboard-backdrop section{width:min(410px,calc(100vw - 32px));background:#1a1c21;border:1px solid #454850;border-radius:12px;padding:18px;box-shadow:0 20px 80px #000}.filmboard-preview{height:220px;background:#111 url('${sourceFor(image).imageUrl}') center/contain no-repeat;border-radius:8px;margin-bottom:14px}.filmboard-backdrop label{display:grid;gap:8px;font:13px system-ui;color:#c6c5c1}.filmboard-backdrop textarea{min-height:110px;resize:vertical;background:#111318;border:1px solid #3a3d45;border-radius:6px;color:#fff;padding:10px;font:14px system-ui}.filmboard-save{margin-top:12px;width:100%;padding:10px;background:#e8b875;border:0;border-radius:6px;color:#1d1711;font-weight:700}.filmboard-close{float:right;border:0;background:transparent;color:#aaa;font-size:22px}.filmboard-state{color:#8c929c;font-size:11px;margin-top:8px}.filmboard-toast{position:absolute;z-index:2147483647;top:8px;right:8px;background:#1a1c21;color:#e8b875;padding:7px 9px;border-radius:5px;font:12px system-ui}`; root.append(style); document.body.append(root);
  const textarea = root.querySelector("textarea") as HTMLTextAreaElement; const close = () => root.remove(); textarea.addEventListener("input", () => chrome.runtime.sendMessage({ type: "note-draft", captureId, text: textarea.value, revision: 0 })); (root.querySelector(".filmboard-close") as HTMLButtonElement).onclick = close; root.querySelector(".filmboard-backdrop")?.addEventListener("mousedown", (event) => { if (event.target === event.currentTarget) close(); }); root.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); }); (root.querySelector(".filmboard-save") as HTMLButtonElement).onclick = () => { capture(image, textarea.value, captureId); close(); }; textarea.focus();
}

function inject(): void {
  document.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    if (processed.has(image) || image.naturalWidth < 120 || image.naturalHeight < 120) return;
    processed.add(image); const host = image.parentElement; if (!host) return; if (getComputedStyle(host).position === "static") host.style.position = "relative";
    const controls = document.createElement("span"); controls.className = "filmboard-controls"; controls.innerHTML = `<button type="button" title="Save to FilmBoard">Save</button><button type="button" title="Quick Note">✎</button>`; const style = document.createElement("style"); style.textContent = `.filmboard-controls{position:absolute;right:8px;top:8px;z-index:2147483646;display:none;gap:4px}.filmboard-controls button{border:0;border-radius:5px;background:#181a1eec;color:#f3c98e;padding:6px 8px;cursor:pointer;font:700 11px system-ui}.filmboard-controls button+button{padding-inline:7px}.filmboard-toast{position:absolute}`; controls.append(style); host.append(controls); host.addEventListener("mouseenter", () => { controls.style.display = "flex"; }); host.addEventListener("mouseleave", () => { controls.style.display = "none"; }); const buttons = controls.querySelectorAll("button"); const stopPinterestEvent = (event: Event) => { event.stopPropagation(); }; buttons.forEach((button) => button.addEventListener("pointerdown", stopPinterestEvent)); buttons[0]?.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); if (event.altKey) openNote(image); else capture(image); }); buttons[0]?.addEventListener("contextmenu", (event) => { event.preventDefault(); event.stopPropagation(); openNote(image); }); buttons[1]?.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); openNote(image); });
  });
}

const observer = new MutationObserver(() => inject()); observer.observe(document.body, { childList: true, subtree: true }); inject();
chrome.runtime.onMessage.addListener((message: any) => { const image = Array.from(document.images).find((candidate) => candidate.currentSrc === message.imageUrl || candidate.src === message.imageUrl); if (!image) return; if (message.type === "open-note") openNote(image); else capture(image); });
