import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
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

function displayTitle(capture: Capture): string {
  const title = capture.title?.trim();
  if (!title || (capture.sourceSite === "pinterest" && (title.length > 100 || /^(?:story )?pin image$/i.test(title)))) return "Untitled reference";
  return title;
}

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

  const loadBoards = async () => {
    try {
      const [boardResponse, captureResponse] = await Promise.all([
        api<{ items: Board[] }>("/api/v1/boards"),
        api<{ items: Capture[] }>("/api/v1/captures?limit=100")
      ]);
      setBoards(boardResponse.items);
      setCaptures(captureResponse.items);
      const details = await Promise.all(captureResponse.items.map((capture) => api<CaptureDetail>(`/api/v1/captures/${capture.id}`)));
      setNotes(Object.fromEntries(details.map((detail) => [detail.capture.id, detail.note.text])));
      if (boardResponse.items[0]) setSelectedBoard(await api<BoardGraph>(`/api/v1/boards/${boardResponse.items[0].id}`));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load boards");
    }
  };

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
    try {
      const available = await api<{ items: Board[] }>("/api/v1/boards");
      const board = available.items[0] ?? await api<Board>("/api/v1/boards", { method: "POST", body: JSON.stringify({ boardTitle: "Reference board" }) });
      await api(`/api/v1/captures/${captureId}/place`, { method: "POST", body: JSON.stringify({ boardId: board.id }) });
      setBoards(available.items.length ? available.items : [board]);
      setSelectedBoard(await api<BoardGraph>(`/api/v1/boards/${board.id}`));
      setView("boards");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not place reference on a board");
    }
  };

  return <div className="shell">
    <aside className="rail">
      <div className="brand"><span className="brand-mark">F</span><span>FilmBoard</span></div>
      <div className="eyebrow">Reference Room</div>
      <nav><button className={view === "inbox" ? "nav-active" : ""} onClick={() => setView("inbox")}>Inbox <span>{captures.length}</span></button><button>Projects</button><button className={view === "boards" ? "nav-active" : ""} onClick={() => { setView("boards"); void loadBoards(); }}>Boards</button><button>All media</button></nav>
      <div className="rail-footer"><span className="status-dot" /> Local only<br /><small>Saved on this Mac</small></div>
    </aside>
    <main className="main">
      {view === "boards" ? <BoardView boards={boards} selectedBoard={selectedBoard} captures={captures} notes={notes} onSelect={async (board) => setSelectedBoard(await api<BoardGraph>(`/api/v1/boards/${board.id}`))} onCreate={async () => { const board = await api<Board>("/api/v1/boards", { method: "POST", body: JSON.stringify({ boardTitle: "New reference board" }) }); setBoards((current) => [board, ...current]); setSelectedBoard(await api<BoardGraph>(`/api/v1/boards/${board.id}`)); }} /> : <>
      <header className="topbar"><div><div className="eyebrow">Your captured references</div><h1>Inbox</h1></div><button className="primary" onClick={() => setShowCapture(true)}>＋ Capture reference</button></header>
      <section className="toolbar"><label className="search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notes and sources" /></label><div className="filters">{([['all', 'All'], ['noted', 'Noted'], ['link-only', 'Link only'], ['archived', 'Archived']] as const).map(([key, label]) => <button key={key} className={filter === key ? "filter-active" : ""} onClick={() => setFilter(key)}>{label}</button>)}</div></section>
      {error && <div className="error">{error}<button onClick={() => void refresh()}>Retry</button></div>}
      {visible.length === 0 ? <div className="empty"><div className="empty-icon">✦</div><h2>Your reference room is quiet.</h2><p>Capture a visual from Pinterest or add a reference here to begin shaping a scene.</p><button className="primary" onClick={() => setShowCapture(true)}>Add your first reference</button></div> : <section className="grid">{visible.map((capture) => <article className="card" key={capture.id}>
        <div className="media">{capture.assetId ? <img src={`/api/v1/assets/${capture.assetId}/preview`} alt={displayTitle(capture)} /> : capture.imageCandidateUrl ? <img src={capture.imageCandidateUrl} alt={displayTitle(capture)} /> : <div className="link-placeholder"><span>↗</span></div>}</div>
        <div className="card-body"><h3>{displayTitle(capture)}</h3><textarea aria-label={`Notes for ${displayTitle(capture)}`} value={notes[capture.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [capture.id]: event.target.value }))} onBlur={() => void saveNote(capture)} placeholder="Add your note…" /><div className="card-actions"><button onClick={() => window.open(capture.sourceUrl, "_blank", "noopener,noreferrer")}>Open source</button><button onClick={() => void place(capture.id)}>Place on board</button>{capture.status === "inbox" && <button onClick={() => void archive(capture.id)}>Archive</button>}</div></div>
      </article>)}</section>}
      </>}
    </main>
    {showCapture && <CaptureDialog onClose={() => setShowCapture(false)} onSaved={() => { setShowCapture(false); void refresh(); }} />}
  </div>;
}

function BoardView({ boards, selectedBoard, captures, notes, onSelect, onCreate }: { boards: Board[]; selectedBoard: BoardGraph | null; captures: Capture[]; notes: Record<string, string>; onSelect: (board: Board) => void; onCreate: () => void }) {
  const [nodes, setNodes] = useState<BoardGraph["nodes"]>([]);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [dragging, setDragging] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [panning, setPanning] = useState<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const [boardError, setBoardError] = useState("");
  const nodesRef = useRef(nodes);
  const viewportRef = useRef(viewport);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const nextNodes = selectedBoard?.nodes ?? [];
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
    let nextViewport = { x: 0, y: 0, zoom: 1 };
    try {
      const parsed = JSON.parse(selectedBoard?.viewportJson ?? "{}") as Partial<typeof nextViewport>;
      if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y) && Number.isFinite(parsed.zoom) && parsed.zoom! > 0) nextViewport = { x: parsed.x!, y: parsed.y!, zoom: parsed.zoom! };
    } catch { /* use the default viewport when stored state is malformed */ }
    viewportRef.current = nextViewport;
    setViewport(nextViewport);
    setBoardError("");
  }, [selectedBoard]);
  const exportProject = async () => { if (!selectedBoard) return; const response = await fetch(`/api/v1/exports/projects/${selectedBoard.projectId}`, { method: "POST" }); const blob = await response.blob(); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `filmboard-${selectedBoard.title.replaceAll(" ", "-").toLowerCase()}.json`; link.click(); URL.revokeObjectURL(link.href); };
  const save = async (nextNodes = nodesRef.current, nextViewport = viewportRef.current) => {
    if (!selectedBoard) return;
    try {
      await api(`/api/v1/boards/${selectedBoard.id}/snapshot`, { method: "PUT", body: JSON.stringify({ viewportJson: JSON.stringify(nextViewport), nodes: nextNodes }) });
      setBoardError("");
    } catch (caught) {
      setBoardError(caught instanceof Error ? caught.message : "Could not save board");
    }
  };
  const importProject = async (file: File | undefined) => { if (!file) return; const response = await fetch("/api/v1/exports/import", { method: "POST", headers: { "content-type": "application/json" }, body: await file.text() }); if (!response.ok) throw new Error("Could not import project"); window.location.reload(); };
  const setNextNodes = (next: BoardGraph["nodes"]) => { nodesRef.current = next; setNodes(next); };
  const setNextViewport = (next: typeof viewport) => { viewportRef.current = next; setViewport(next); };
  const pointInWorld = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const current = viewportRef.current;
    return { x: (clientX - rect.left - current.x) / current.zoom, y: (clientY - rect.top - current.y) / current.zoom };
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) {
      const point = pointInWorld(event.clientX, event.clientY);
      setNextNodes(nodesRef.current.map((node) => node.id === dragging.id ? { ...node, x: point.x - dragging.dx, y: point.y - dragging.dy } : node));
    } else if (panning) {
      setNextViewport({ ...viewportRef.current, x: panning.originX + event.clientX - panning.x, y: panning.originY + event.clientY - panning.y });
    }
  };
  const finishPointer = () => {
    if (dragging || panning) void save();
    setDragging(null);
    setPanning(null);
  };
  const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest(".canvas-card")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPanning({ x: event.clientX, y: event.clientY, originX: viewportRef.current.x, originY: viewportRef.current.y });
  };
  const zoomAtPointer = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const current = viewportRef.current;
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const zoom = Math.min(4, Math.max(0.1, current.zoom * Math.exp(-event.deltaY * 0.001)));
    const worldX = (cursorX - current.x) / current.zoom;
    const worldY = (cursorY - current.y) / current.zoom;
    const next = { x: cursorX - worldX * zoom, y: cursorY - worldY * zoom, zoom };
    setNextViewport(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(nodesRef.current, viewportRef.current), 250);
  };
  const captureById = (node: BoardGraph["nodes"][number]) => {
    try { return captures.find((capture) => capture.id === (JSON.parse(node.propsJson) as { captureId?: string }).captureId); }
    catch { return undefined; }
  };
  const dropCapture = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const captureId = event.dataTransfer.getData("application/x-filmboard-capture");
    if (!selectedBoard || !captures.some((capture) => capture.id === captureId)) return;
    const position = pointInWorld(event.clientX, event.clientY);
    try {
      await api(`/api/v1/captures/${captureId}/place`, {
        method: "POST",
        body: JSON.stringify({ boardId: selectedBoard.id, x: position.x, y: position.y })
      });
      const updatedBoard = await api<BoardGraph>(`/api/v1/boards/${selectedBoard.id}`);
      setNextNodes(updatedBoard.nodes);
      setBoardError("");
    } catch (caught) {
      setBoardError(caught instanceof Error ? caught.message : "Could not add reference to board");
    }
  };
  return <>
    <header className="topbar">
      <div><div className="eyebrow">Drag an Inbox reference onto the board · scroll to zoom · drag empty space to pan</div><h1>Boards</h1></div>
      <div className="top-actions"><button onClick={() => void exportProject()} disabled={!selectedBoard}>Export JSON</button><label className="import-button">Import JSON<input type="file" accept="application/json" onChange={(event) => void importProject(event.target.files?.[0])} /></label><button onClick={() => { const next = { x: 0, y: 0, zoom: 1 }; setNextViewport(next); void save(nodesRef.current, next); }}>Reset view</button><button className="primary" onClick={onCreate}>＋ New board</button></div>
    </header>
    <section className="board-layout">
      <aside className="board-list">{boards.length === 0 && <p>No boards yet.</p>}{boards.map((board) => <button key={board.id} className={selectedBoard?.id === board.id ? "board-selected" : ""} onClick={() => onSelect(board)}>{board.title}<small>{board.id.slice(0, 6)}</small></button>)}</aside>
      <aside className="board-inbox">
        <h2>Inbox <span>{captures.length}</span></h2>
        {captures.length === 0 && <p className="board-inbox-empty">No Inbox references yet.</p>}
        <div className="board-inbox-items">{captures.map((capture) => {
          const imageSrc = capture.assetId ? `/api/v1/assets/${capture.assetId}/preview` : capture.imageCandidateUrl;
          return <div className="board-inbox-item" key={capture.id} data-capture-id={capture.id} draggable onDragStart={(event) => { event.dataTransfer.setData("application/x-filmboard-capture", capture.id); event.dataTransfer.effectAllowed = "copy"; }}>
            <div className="board-inbox-image">{imageSrc ? <img src={imageSrc} alt="" draggable={false} /> : <span>↗</span>}</div>
            <div><strong>{displayTitle(capture)}</strong>{notes[capture.id] && <small>{notes[capture.id]}</small>}</div>
          </div>;
        })}</div>
      </aside>
      <div ref={canvasRef} className="canvas" onPointerDown={startPan} onPointerMove={move} onPointerUp={finishPointer} onWheel={zoomAtPointer} onDragOver={(event) => { if (event.dataTransfer.types.includes("application/x-filmboard-capture")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDrop={(event) => void dropCapture(event)} style={{ backgroundPosition: `${viewport.x}px ${viewport.y}px`, backgroundSize: `${28 * viewport.zoom}px ${28 * viewport.zoom}px` }}>
        <div className="canvas-world" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
          {nodes.map((node) => {
            const capture = captureById(node);
            const imageSrc = capture?.assetId ? `/api/v1/assets/${capture.assetId}/preview` : capture?.imageCandidateUrl;
            return <div className="canvas-card" key={node.id} onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); const point = pointInWorld(event.clientX, event.clientY); setDragging({ id: node.id, dx: point.x - node.x, dy: point.y - node.y }); }} style={{ left: node.x, top: node.y, width: node.width }}>
              <div className="canvas-card-image">{imageSrc ? <img src={imageSrc} alt={capture ? displayTitle(capture) : "Reference"} draggable={false} /> : <span>Image preview unavailable</span>}</div>
              <h3>{capture ? displayTitle(capture) : "Untitled reference"}</h3><p>{capture ? notes[capture.id] || "" : ""}</p>
            </div>;
          })}
        </div>
        {boardError && <div className="error board-error">{boardError}<button onClick={() => void save()}>Retry save</button></div>}
        {selectedBoard && nodes.length === 0 && <div className="canvas-empty">Drag a reference here from the Inbox.</div>}
      </div>
    </section>
  </>;
}

function CaptureDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(""); const [url, setUrl] = useState(""); const [imageUrl, setImageUrl] = useState(""); const [note, setNote] = useState(""); const [file, setFile] = useState<File | null>(null); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); try { const created = await api<{ captureId: string }>("/api/v1/captures", { method: "POST", body: JSON.stringify({ schemaVersion: 1, captureId: crypto.randomUUID(), operationId: crypto.randomUUID(), source: { site: "manual", pageUrl: url, ...(imageUrl ? { imageCandidateUrl: imageUrl } : {}), ...(title ? { title } : {}) }, capture: { capturedAt: new Date().toISOString(), noteText: note, noteRevision: 0 }, intent: note ? "quick-note" : "save" }) }); if (file) { const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); await api("/api/v1/assets/import", { method: "POST", body: JSON.stringify({ dataBase64: btoa(binary), mimeType: file.type || undefined, captureId: created.captureId }) }); } onSaved(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save capture"); } finally { setSaving(false); } };
  return <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="dialog" onSubmit={submit}><div className="dialog-head"><div><div className="eyebrow">New reference</div><h2>Capture a thought</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div><label>Source URL<input required type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.pinterest.com/pin/..." /></label><label>Image URL <span className="optional">optional</span><input type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://i.pinimg.com/..." /></label><label>Import local media <span className="optional">optional</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,audio/mpeg,video/mp4" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><label>Short title <span className="optional">optional</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Window silhouette" /></label><label>What scene did this make you think of?<textarea autoFocus value={note} onChange={(event) => setNote(event.target.value)} placeholder="A figure waits outside in the rain…" /></label>{error && <div className="error">{error}</div>}<div className="dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save to Inbox"}</button></div></form></div>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
