import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Capture = {
  id: string;
  sourceUrl: string;
  pageUrl: string;
  sourceSite: string;
  title: string | null;
  description: string | null;
  imageCandidateUrl: string | null;
  capturedAt: string;
  status: "inbox" | "archived";
  importStatus: "pending" | "local" | "preview" | "link-only" | "failed";
  assetId: string | null;
  archivedAt: string | null;
};

type CaptureDetail = { capture: Capture; note: { text: string; revision: number } };
type Board = { id: string; title: string; projectId: string };
type BoardGraph = Board & { viewportJson: string; nodes: Array<{ id: string; propsJson: string; x: number; y: number; width: number; height: number }> };

const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, { headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  return body as T;
};

function App() {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showCapture, setShowCapture] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"inbox" | "boards">("inbox");
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<BoardGraph | null>(null);

  const refresh = async () => {
    try {
      const response = await api<{ items: Capture[] }>(`/api/v1/captures${search ? `?q=${encodeURIComponent(search)}` : ""}`);
      setCaptures(response.items);
      const details = await Promise.all(response.items.map((item) => api<CaptureDetail>(`/api/v1/captures/${item.id}`)));
      setNotes(Object.fromEntries(details.map((detail) => [detail.capture.id, detail.note.text])));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "FilmBoard service is unavailable");
    }
  };

  useEffect(() => { void refresh(); }, [search]);

  const loadBoards = async () => { try { const response = await api<{ items: Board[] }>("/api/v1/boards"); setBoards(response.items); if (response.items[0]) setSelectedBoard(await api<BoardGraph>(`/api/v1/boards/${response.items[0].id}`)); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load boards"); } };

  const visible = useMemo(() => captures.filter((capture) => {
    if (filter === "noted") return Boolean(notes[capture.id]);
    if (filter === "link-only") return capture.importStatus === "link-only";
    if (filter === "archived") return capture.status === "archived";
    return capture.status === "inbox";
  }), [captures, filter, notes]);

  const saveNote = async (capture: Capture) => {
    try {
      const detail = await api<CaptureDetail>(`/api/v1/captures/${capture.id}`);
      await api(`/api/v1/captures/${capture.id}/note`, { method: "PATCH", body: JSON.stringify({ operationId: crypto.randomUUID(), revision: detail.note.revision + 1, text: notes[capture.id] ?? "", updatedAt: new Date().toISOString() }) });
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save note"); }
  };

  const archive = async (captureId: string) => {
    await api(`/api/v1/captures/${captureId}/archive`, { method: "POST" });
    await refresh();
  };

  const place = async (captureId: string) => {
    const board = await api<{ id: string }>("/api/v1/boards", { method: "POST", body: JSON.stringify({ boardTitle: "Reference board" }) });
    await api(`/api/v1/captures/${captureId}/place`, { method: "POST", body: JSON.stringify({ boardId: board.id }) });
    await refresh();
  };

  return <div className="shell">
    <aside className="rail">
      <div className="brand"><span className="brand-mark">F</span><span>FilmBoard</span></div>
      <div className="eyebrow">Reference Room</div>
      <nav><button className={view === "inbox" ? "nav-active" : ""} onClick={() => setView("inbox")}>Inbox <span>{captures.length}</span></button><button>Projects</button><button className={view === "boards" ? "nav-active" : ""} onClick={() => { setView("boards"); void loadBoards(); }}>Boards</button><button>All media</button></nav>
      <div className="rail-footer"><span className="status-dot" /> Local only<br /><small>Saved on this Mac</small></div>
    </aside>
    <main className="main">
      {view === "boards" ? <BoardView boards={boards} selectedBoard={selectedBoard} onSelect={async (board) => setSelectedBoard(await api<BoardGraph>(`/api/v1/boards/${board.id}`))} onCreate={async () => { const board = await api<Board>("/api/v1/boards", { method: "POST", body: JSON.stringify({ boardTitle: "New reference board" }) }); setBoards((current) => [board, ...current]); setSelectedBoard(await api<BoardGraph>(`/api/v1/boards/${board.id}`)); }} /> : <>
      <header className="topbar"><div><div className="eyebrow">Your captured references</div><h1>Inbox</h1></div><button className="primary" onClick={() => setShowCapture(true)}>＋ Capture reference</button></header>
      <section className="toolbar"><label className="search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notes and sources" /></label><div className="filters">{([['all', 'All'], ['noted', 'Noted'], ['link-only', 'Link only'], ['archived', 'Archived']] as const).map(([key, label]) => <button key={key} className={filter === key ? "filter-active" : ""} onClick={() => setFilter(key)}>{label}</button>)}</div></section>
      {error && <div className="error">{error}<button onClick={() => void refresh()}>Retry</button></div>}
      {visible.length === 0 ? <div className="empty"><div className="empty-icon">✦</div><h2>Your reference room is quiet.</h2><p>Capture a visual from Pinterest or add a reference here to begin shaping a scene.</p><button className="primary" onClick={() => setShowCapture(true)}>Add your first reference</button></div> : <section className="grid">{visible.map((capture) => <article className="card" key={capture.id}>
        <div className="media">{capture.assetId ? <img src={`/api/v1/assets/${capture.assetId}/preview`} alt={capture.title ?? "Captured reference"} /> : capture.imageCandidateUrl ? <img src={capture.imageCandidateUrl} alt={capture.title ?? "Captured reference"} /> : <div className="link-placeholder"><span>↗</span><small>Source preview</small></div>}<span className={`badge badge-${capture.importStatus}`}>{capture.importStatus === "link-only" ? "Link only" : capture.importStatus}</span></div>
        <div className="card-body"><div className="card-meta"><span>{capture.sourceSite}</span><time>{new Date(capture.capturedAt).toLocaleDateString()}</time></div><h3>{capture.title ?? "Untitled reference"}</h3><textarea value={notes[capture.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [capture.id]: event.target.value }))} onBlur={() => void saveNote(capture)} placeholder="Add the scene this made you think of…" /><div className="card-actions"><button onClick={() => window.open(capture.sourceUrl, "_blank", "noopener,noreferrer")}>Open source</button><button onClick={() => void place(capture.id)}>Place on board</button>{capture.status === "inbox" && <button onClick={() => void archive(capture.id)}>Archive</button>}</div></div>
      </article>)}</section>}
      </>}
    </main>
    {showCapture && <CaptureDialog onClose={() => setShowCapture(false)} onSaved={() => { setShowCapture(false); void refresh(); }} />}
  </div>;
}

function BoardView({ boards, selectedBoard, onSelect, onCreate }: { boards: Board[]; selectedBoard: BoardGraph | null; onSelect: (board: Board) => void; onCreate: () => void }) {
  const [nodes, setNodes] = useState<BoardGraph["nodes"]>([]);
  const [dragging, setDragging] = useState<{ id: string; dx: number; dy: number } | null>(null);
  useEffect(() => { setNodes(selectedBoard?.nodes ?? []); }, [selectedBoard]);
  const exportProject = async () => { if (!selectedBoard) return; const response = await fetch(`/api/v1/exports/projects/${selectedBoard.projectId}`, { method: "POST" }); const blob = await response.blob(); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `filmboard-${selectedBoard.title.replaceAll(" ", "-").toLowerCase()}.json`; link.click(); URL.revokeObjectURL(link.href); };
  const save = async (nextNodes: BoardGraph["nodes"]) => { if (!selectedBoard) return; await fetch(`/api/v1/boards/${selectedBoard.id}/snapshot`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ viewportJson: selectedBoard.viewportJson, nodes: nextNodes }) }); };
  const importProject = async (file: File | undefined) => { if (!file) return; const response = await fetch("/api/v1/exports/import", { method: "POST", headers: { "content-type": "application/json" }, body: await file.text() }); if (!response.ok) throw new Error("Could not import project"); window.location.reload(); };
  const move = (event: React.PointerEvent<HTMLDivElement>) => { if (!dragging) return; const next = nodes.map((node) => node.id === dragging.id ? { ...node, x: Math.max(-200, event.nativeEvent.offsetX - dragging.dx), y: Math.max(-100, event.nativeEvent.offsetY - dragging.dy) } : node); setNodes(next); };
  const finishDrag = () => { if (dragging) void save(nodes); setDragging(null); };
  return <><header className="topbar"><div><div className="eyebrow">Arrange references visually</div><h1>Boards</h1></div><div className="top-actions"><button onClick={() => void exportProject()} disabled={!selectedBoard}>Export JSON</button><label className="import-button">Import JSON<input type="file" accept="application/json" onChange={(event) => void importProject(event.target.files?.[0])} /></label><button className="primary" onClick={onCreate}>＋ New board</button></div></header><section className="board-layout"><aside className="board-list">{boards.length === 0 && <p>No boards yet.</p>}{boards.map((board) => <button key={board.id} className={selectedBoard?.id === board.id ? "board-selected" : ""} onClick={() => onSelect(board)}>{board.title}<small>{board.id.slice(0, 6)}</small></button>)}</aside><div className="canvas" onPointerMove={move} onPointerUp={finishDrag} onPointerLeave={finishDrag}><div className="canvas-grid" />{nodes.map((node) => { let props: { captureId?: string } = {}; try { props = JSON.parse(node.propsJson) as { captureId?: string }; } catch {} return <div className="canvas-card" key={node.id} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDragging({ id: node.id, dx: event.nativeEvent.offsetX, dy: event.nativeEvent.offsetY }); }} style={{ left: node.x + 40, top: node.y + 40, width: node.width }}><div className="canvas-card-image">{props.captureId ? "Reference" : "Text card"}</div><span>{props.captureId?.slice(0, 8) ?? "Untitled"}</span></div>; })}{selectedBoard && nodes.length === 0 && <div className="canvas-empty">Place references from Inbox to start a board.</div>}</div></section></>;
}

function CaptureDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(""); const [url, setUrl] = useState(""); const [imageUrl, setImageUrl] = useState(""); const [note, setNote] = useState(""); const [file, setFile] = useState<File | null>(null); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); try { const created = await api<{ captureId: string }>("/api/v1/captures", { method: "POST", body: JSON.stringify({ schemaVersion: 1, captureId: crypto.randomUUID(), operationId: crypto.randomUUID(), source: { site: "manual", pageUrl: url, ...(imageUrl ? { imageCandidateUrl: imageUrl } : {}), ...(title ? { title } : {}) }, capture: { capturedAt: new Date().toISOString(), noteText: note, noteRevision: 0 }, intent: note ? "quick-note" : "save" }) }); if (file) { const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); await api("/api/v1/assets/import", { method: "POST", body: JSON.stringify({ dataBase64: btoa(binary), mimeType: file.type || undefined, captureId: created.captureId }) }); } onSaved(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save capture"); } finally { setSaving(false); } };
  return <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="dialog" onSubmit={submit}><div className="dialog-head"><div><div className="eyebrow">New reference</div><h2>Capture a thought</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div><label>Source URL<input required type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.pinterest.com/pin/..." /></label><label>Image URL <span className="optional">optional</span><input type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://i.pinimg.com/..." /></label><label>Import local media <span className="optional">optional</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,audio/mpeg,video/mp4" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><label>Short title <span className="optional">optional</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Window silhouette" /></label><label>What scene did this make you think of?<textarea autoFocus value={note} onChange={(event) => setNote(event.target.value)} placeholder="A figure waits outside in the rain…" /></label>{error && <div className="error">{error}</div>}<div className="dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save to Inbox"}</button></div></form></div>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
