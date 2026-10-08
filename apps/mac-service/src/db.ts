import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type {
  AssetRecord,
  BoardRecord,
  CaptureEnvelope,
  CaptureRecord,
  CreateCaptureResponse,
  NoteUpdateRequest
} from "@filmboard/contracts";

type CaptureDetail = {
  capture: CaptureRecord;
  note: { id: string; captureId: string; text: string; createdAt: string; updatedAt: string; revision: number };
  placements: Array<{ boardId: string; nodeId: string; placedAt: string }>;
};

export type BoardGraph = BoardRecord & { nodes: Array<{ id: string; captureId?: string; type: string; x: number; y: number; width: number; height: number; propsJson: string }> };
export type BoardSnapshotNode = { id: string; x: number; y: number; width: number; height: number; zRank?: number; propsJson?: string };
export type ProjectExport = { schemaVersion: 1; exportedAt: string; project: { id: string; title: string }; boards: BoardGraph[]; captures: Array<{ capture: CaptureRecord; note: CaptureDetail["note"] }> };

const MIGRATIONS = [
  `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS captures (
      id TEXT PRIMARY KEY,
      source_url TEXT NOT NULL,
      page_url TEXT NOT NULL,
      source_site TEXT NOT NULL,
      title TEXT,
      description TEXT,
      image_candidate_url TEXT,
      captured_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('inbox', 'archived')),
      import_status TEXT NOT NULL CHECK (import_status IN ('pending', 'local', 'preview', 'link-only', 'failed')),
      asset_id TEXT,
      archived_at TEXT
    );
    CREATE TABLE IF NOT EXISTS capture_notes (
      id TEXT PRIMARY KEY,
      capture_id TEXT NOT NULL UNIQUE REFERENCES captures(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision >= 0)
    );
    CREATE TABLE IF NOT EXISTS capture_operations (
      operation_id TEXT PRIMARY KEY,
      capture_id TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      applied_at TEXT
    );
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      sha256 TEXT NOT NULL UNIQUE,
      relative_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_length INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      state TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      viewport_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS board_nodes (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      z_rank REAL NOT NULL,
      props_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS board_edges (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      source_node_id TEXT NOT NULL REFERENCES board_nodes(id) ON DELETE CASCADE,
      target_node_id TEXT NOT NULL REFERENCES board_nodes(id) ON DELETE CASCADE,
      style_json TEXT NOT NULL,
      label TEXT
    );
    CREATE TABLE IF NOT EXISTS capture_placements (
      capture_id TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      node_id TEXT NOT NULL REFERENCES board_nodes(id) ON DELETE CASCADE,
      placed_at TEXT NOT NULL,
      PRIMARY KEY (capture_id, board_id, node_id)
    );
    CREATE INDEX IF NOT EXISTS captures_captured_at_idx ON captures(captured_at DESC);
    CREATE INDEX IF NOT EXISTS captures_status_idx ON captures(status, import_status);
    CREATE INDEX IF NOT EXISTS capture_notes_capture_id_idx ON capture_notes(capture_id);
    CREATE INDEX IF NOT EXISTS board_nodes_board_id_idx ON board_nodes(board_id);
    CREATE INDEX IF NOT EXISTS capture_placements_board_id_idx ON capture_placements(board_id);
    CREATE VIRTUAL TABLE IF NOT EXISTS capture_search USING fts5(capture_id UNINDEXED, title, note_text);
  `
];

export class FilmBoardDatabase {
  readonly sqlite: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.sqlite = new DatabaseSync(databasePath);
    this.sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.sqlite.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);");
    this.migrate();
  }

  migrate(): void {
    const applied = this.sqlite.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: number }>;
    const appliedVersions = new Set(applied.map((row) => row.version));
    for (let index = 0; index < MIGRATIONS.length; index += 1) {
      const version = index + 1;
      if (appliedVersions.has(version)) continue;
      const migration = MIGRATIONS[index];
      if (!migration) continue;
      this.sqlite.exec("BEGIN IMMEDIATE");
      try {
        this.sqlite.exec(migration);
        this.sqlite.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(version, new Date().toISOString());
        this.sqlite.exec("COMMIT");
      } catch (error) {
        this.sqlite.exec("ROLLBACK");
        throw error;
      }
    }
  }

  createCapture(envelope: CaptureEnvelope): CreateCaptureResponse {
    const now = new Date().toISOString();
    const existingOperation = this.sqlite.prepare("SELECT capture_id FROM capture_operations WHERE operation_id = ?").get(envelope.operationId) as { capture_id: string } | undefined;
    if (existingOperation) {
      const existing = this.sqlite.prepare("SELECT id, import_status, status, captured_at FROM captures WHERE id = ?").get(existingOperation.capture_id) as { id: string; import_status: string; status: "inbox"; captured_at: string };
      const note = this.sqlite.prepare("SELECT revision FROM capture_notes WHERE capture_id = ?").get(existing.id) as { revision: number };
      return { captureId: existing.id, noteRevision: note.revision, assetState: existing.import_status as CreateCaptureResponse["assetState"], status: existing.status, persistedAt: existing.captured_at };
    }

    const importStatus = envelope.source.imageCandidateUrl ? "preview" : "link-only";
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      this.sqlite.prepare(`INSERT OR IGNORE INTO captures (id, source_url, page_url, source_site, title, description, image_candidate_url, captured_at, status, import_status, asset_id, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'inbox', ?, NULL, NULL)`).run(
        envelope.captureId,
        envelope.source.pageUrl,
        envelope.source.pageUrl,
        envelope.source.site,
        envelope.source.title ?? null,
        envelope.source.description ?? null,
        envelope.source.imageCandidateUrl ?? null,
        envelope.capture.capturedAt,
        importStatus
      );
      this.sqlite.prepare("INSERT INTO capture_notes (id, capture_id, text, created_at, updated_at, revision) VALUES (?, ?, ?, ?, ?, ?)").run(randomUUID(), envelope.captureId, envelope.capture.noteText, now, now, envelope.capture.noteRevision);
      this.sqlite.prepare("INSERT INTO capture_operations (operation_id, capture_id, revision, type, payload_json, created_at, applied_at) VALUES (?, ?, ?, 'capture.create', ?, ?, ?)").run(envelope.operationId, envelope.captureId, envelope.capture.noteRevision, JSON.stringify(envelope), now, now);
      this.refreshSearchIndex(envelope.captureId);
      this.sqlite.exec("COMMIT");
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
    return { captureId: envelope.captureId, noteRevision: envelope.capture.noteRevision, assetState: importStatus, status: "inbox", persistedAt: now };
  }

  updateNote(captureId: string, request: NoteUpdateRequest): { accepted: boolean; revision: number } {
    const current = this.sqlite.prepare("SELECT revision FROM capture_notes WHERE capture_id = ?").get(captureId) as { revision: number } | undefined;
    if (!current) throw new Error("CAPTURE_NOT_FOUND");
    if (request.revision <= current.revision) return { accepted: false, revision: current.revision };
    const now = new Date().toISOString();
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      this.sqlite.prepare("UPDATE capture_notes SET text = ?, updated_at = ?, revision = ? WHERE capture_id = ? AND revision < ?").run(request.text, request.updatedAt || now, request.revision, captureId, request.revision);
      this.sqlite.prepare("INSERT OR IGNORE INTO capture_operations (operation_id, capture_id, revision, type, payload_json, created_at, applied_at) VALUES (?, ?, ?, 'capture.note.update', ?, ?, ?)").run(request.operationId, captureId, request.revision, JSON.stringify(request), now, now);
      this.refreshSearchIndex(captureId);
      this.sqlite.exec("COMMIT");
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
    return { accepted: true, revision: request.revision };
  }

  listCaptures(query: string | undefined, limit: number, offset: number): CaptureRecord[] {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max(offset, 0);
    if (query?.trim()) {
      return this.sqlite.prepare(`SELECT c.id, c.source_url as sourceUrl, c.page_url as pageUrl, c.source_site as sourceSite, c.title, c.description, c.image_candidate_url as imageCandidateUrl, c.captured_at as capturedAt, c.status, c.import_status as importStatus, c.asset_id as assetId, c.archived_at as archivedAt FROM captures c JOIN capture_search s ON s.capture_id = c.id WHERE capture_search MATCH ? ORDER BY c.captured_at DESC LIMIT ? OFFSET ?`).all(query.trim(), safeLimit, safeOffset) as unknown as CaptureRecord[];
    }
    return this.sqlite.prepare(`SELECT id, source_url as sourceUrl, page_url as pageUrl, source_site as sourceSite, title, description, image_candidate_url as imageCandidateUrl, captured_at as capturedAt, status, import_status as importStatus, asset_id as assetId, archived_at as archivedAt FROM captures WHERE status = 'inbox' ORDER BY captured_at DESC LIMIT ? OFFSET ?`).all(safeLimit, safeOffset) as unknown as CaptureRecord[];
  }

  getCapture(captureId: string): CaptureDetail | undefined {
    const capture = this.sqlite.prepare(`SELECT id, source_url as sourceUrl, page_url as pageUrl, source_site as sourceSite, title, description, image_candidate_url as imageCandidateUrl, captured_at as capturedAt, status, import_status as importStatus, asset_id as assetId, archived_at as archivedAt FROM captures WHERE id = ?`).get(captureId) as CaptureRecord | undefined;
    if (!capture) return undefined;
    const note = this.sqlite.prepare("SELECT id, capture_id as captureId, text, created_at as createdAt, updated_at as updatedAt, revision FROM capture_notes WHERE capture_id = ?").get(captureId) as CaptureDetail["note"];
    const placements = this.sqlite.prepare("SELECT board_id as boardId, node_id as nodeId, placed_at as placedAt FROM capture_placements WHERE capture_id = ?").all(captureId) as CaptureDetail["placements"];
    return { capture, note, placements };
  }

  archiveCapture(captureId: string): boolean {
    const result = this.sqlite.prepare("UPDATE captures SET status = 'archived', archived_at = ? WHERE id = ? AND status != 'archived'").run(new Date().toISOString(), captureId);
    return result.changes > 0;
  }

  createBoard(projectTitle = "First project", boardTitle = "Untitled board"): BoardRecord {
    const now = new Date().toISOString();
    const projectId = randomUUID();
    const boardId = randomUUID();
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      this.sqlite.prepare("INSERT INTO projects (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)").run(projectId, projectTitle, now, now);
      this.sqlite.prepare("INSERT INTO boards (id, project_id, title, viewport_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(boardId, projectId, boardTitle, JSON.stringify({ x: 0, y: 0, zoom: 1 }), now, now);
      this.sqlite.exec("COMMIT");
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
    return { id: boardId, projectId, title: boardTitle, viewportJson: JSON.stringify({ x: 0, y: 0, zoom: 1 }), createdAt: now, updatedAt: now };
  }

  listBoards(): BoardRecord[] {
    return this.sqlite.prepare("SELECT id, project_id as projectId, title, viewport_json as viewportJson, created_at as createdAt, updated_at as updatedAt FROM boards ORDER BY updated_at DESC").all() as unknown as BoardRecord[];
  }

  getBoard(boardId: string): BoardGraph | undefined {
    const board = this.sqlite.prepare("SELECT id, project_id as projectId, title, viewport_json as viewportJson, created_at as createdAt, updated_at as updatedAt FROM boards WHERE id = ?").get(boardId) as unknown as BoardRecord | undefined;
    if (!board) return undefined;
    const nodes = this.sqlite.prepare("SELECT id, type, x, y, width, height, props_json as propsJson FROM board_nodes WHERE board_id = ? ORDER BY z_rank").all(boardId) as unknown as BoardGraph["nodes"];
    return { ...board, nodes };
  }

  exportProject(projectId: string): ProjectExport | undefined {
    const project = this.sqlite.prepare("SELECT id, title FROM projects WHERE id = ?").get(projectId) as { id: string; title: string } | undefined;
    if (!project) return undefined;
    const boards = this.sqlite.prepare("SELECT id FROM boards WHERE project_id = ? ORDER BY updated_at DESC").all(projectId) as Array<{ id: string }>;
    const boardGraphs = boards.map((board) => this.getBoard(board.id)).filter((board): board is BoardGraph => Boolean(board));
    const captures = this.sqlite.prepare("SELECT DISTINCT capture_id as captureId FROM capture_placements WHERE board_id IN (SELECT id FROM boards WHERE project_id = ?)").all(projectId) as Array<{ captureId: string }>;
    const captureDetails = captures.map(({ captureId }) => this.getCapture(captureId)).filter((detail): detail is CaptureDetail => Boolean(detail)).map(({ capture, note }) => ({ capture, note }));
    return { schemaVersion: 1, exportedAt: new Date().toISOString(), project, boards: boardGraphs, captures: captureDetails };
  }

  saveBoardSnapshot(boardId: string, viewportJson: string, nodes: BoardSnapshotNode[]): number {
    const board = this.sqlite.prepare("SELECT id FROM boards WHERE id = ?").get(boardId) as { id: string } | undefined;
    if (!board) throw new Error("BOARD_NOT_FOUND");
    const now = new Date().toISOString();
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      this.sqlite.prepare("UPDATE boards SET viewport_json = ?, updated_at = ? WHERE id = ?").run(viewportJson, now, boardId);
      const update = this.sqlite.prepare("UPDATE board_nodes SET x = ?, y = ?, width = ?, height = ?, z_rank = COALESCE(?, z_rank), props_json = COALESCE(?, props_json), updated_at = ? WHERE id = ? AND board_id = ?");
      for (const node of nodes) update.run(node.x, node.y, node.width, node.height, node.zRank ?? null, node.propsJson ?? null, now, node.id, boardId);
      this.sqlite.exec("COMMIT");
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
    return nodes.length;
  }

  importProject(exported: ProjectExport): { projectId: string; boardCount: number; captureCount: number } {
    if (exported.schemaVersion !== 1 || !exported.project?.id || !Array.isArray(exported.boards) || !Array.isArray(exported.captures)) throw new Error("EXPORT_INVALID");
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const now = new Date().toISOString();
      this.sqlite.prepare("INSERT OR IGNORE INTO projects (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)").run(exported.project.id, exported.project.title, now, now);
      for (const item of exported.captures) {
        const capture = item.capture;
        this.sqlite.prepare("INSERT OR IGNORE INTO captures (id, source_url, page_url, source_site, title, description, image_candidate_url, captured_at, status, import_status, asset_id, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(capture.id, capture.sourceUrl, capture.pageUrl, capture.sourceSite, capture.title, capture.description, capture.imageCandidateUrl, capture.capturedAt, capture.status, capture.importStatus, capture.assetId, capture.archivedAt);
        this.sqlite.prepare("INSERT OR IGNORE INTO capture_notes (id, capture_id, text, created_at, updated_at, revision) VALUES (?, ?, ?, ?, ?, ?)").run(item.note.id, item.note.captureId, item.note.text, item.note.createdAt, item.note.updatedAt, item.note.revision);
      }
      for (const board of exported.boards) {
        this.sqlite.prepare("INSERT OR IGNORE INTO boards (id, project_id, title, viewport_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(board.id, board.projectId, board.title, board.viewportJson, board.createdAt, board.updatedAt);
        for (const node of board.nodes) {
          this.sqlite.prepare("INSERT OR IGNORE INTO board_nodes (id, board_id, type, x, y, width, height, z_rank, props_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(node.id, board.id, node.type, node.x, node.y, node.width, node.height, 0, node.propsJson, board.createdAt, board.updatedAt);
          let props: { captureId?: string } = {};
          try { props = JSON.parse(node.propsJson) as { captureId?: string }; } catch { /* preserve opaque node props */ }
          if (props.captureId) this.sqlite.prepare("INSERT OR IGNORE INTO capture_placements (capture_id, board_id, node_id, placed_at) VALUES (?, ?, ?, ?)").run(props.captureId, board.id, node.id, board.updatedAt);
        }
      }
      this.sqlite.exec("COMMIT");
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
    return { projectId: exported.project.id, boardCount: exported.boards.length, captureCount: exported.captures.length };
  }

  placeCapture(captureId: string, boardId: string, position?: { x: number; y: number }): { nodeId: string; boardId: string; captureId: string } {
    if (!this.getCapture(captureId)) throw new Error("CAPTURE_NOT_FOUND");
    const board = this.sqlite.prepare("SELECT id FROM boards WHERE id = ?").get(boardId) as { id: string } | undefined;
    if (!board) throw new Error("BOARD_NOT_FOUND");
    const existing = this.sqlite.prepare("SELECT node_id as nodeId FROM capture_placements WHERE capture_id = ? AND board_id = ? LIMIT 1").get(captureId, boardId) as { nodeId: string } | undefined;
    if (existing) {
      if (position) this.sqlite.prepare("UPDATE board_nodes SET x = ?, y = ?, updated_at = ? WHERE id = ? AND board_id = ?").run(position.x, position.y, new Date().toISOString(), existing.nodeId, boardId);
      return { nodeId: existing.nodeId, boardId, captureId };
    }
    const count = this.sqlite.prepare("SELECT COUNT(*) as count FROM board_nodes WHERE board_id = ?").get(boardId) as { count: number };
    const x = position?.x ?? 40 + (count.count % 3) * 360;
    const y = position?.y ?? 40 + Math.floor(count.count / 3) * 330;
    const now = new Date().toISOString();
    const nodeId = randomUUID();
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      this.sqlite.prepare("INSERT INTO board_nodes (id, board_id, type, x, y, width, height, z_rank, props_json, created_at, updated_at) VALUES (?, ?, 'image', ?, ?, 320, 280, ?, ?, ?, ?)").run(nodeId, boardId, x, y, count.count, JSON.stringify({ captureId }), now, now);
      this.sqlite.prepare("INSERT INTO capture_placements (capture_id, board_id, node_id, placed_at) VALUES (?, ?, ?, ?)").run(captureId, boardId, nodeId, now);
      this.sqlite.exec("COMMIT");
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
    return { nodeId, boardId, captureId };
  }

  registerAsset(asset: AssetRecord, captureId?: string): void {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      this.sqlite.prepare("INSERT OR IGNORE INTO assets (id, sha256, relative_path, mime_type, byte_length, width, height, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(asset.id, asset.sha256, asset.relativePath, asset.mimeType, asset.byteLength, asset.width, asset.height, asset.state, asset.createdAt);
      if (captureId) {
        this.sqlite.prepare("UPDATE captures SET asset_id = ?, import_status = 'local' WHERE id = ?").run(asset.id, captureId);
      }
      this.sqlite.exec("COMMIT");
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  getAsset(assetId: string): AssetRecord | undefined {
    return this.sqlite.prepare("SELECT id, sha256, relative_path as relativePath, mime_type as mimeType, byte_length as byteLength, width, height, state, created_at as createdAt FROM assets WHERE id = ?").get(assetId) as unknown as AssetRecord | undefined;
  }

  private refreshSearchIndex(captureId: string): void {
    const row = this.sqlite.prepare("SELECT c.title, n.text FROM captures c JOIN capture_notes n ON n.capture_id = c.id WHERE c.id = ?").get(captureId) as { title: string | null; text: string };
    this.sqlite.prepare("DELETE FROM capture_search WHERE capture_id = ?").run(captureId);
    this.sqlite.prepare("INSERT INTO capture_search (capture_id, title, note_text) VALUES (?, ?, ?)").run(captureId, row.title ?? "", row.text);
  }

  close(): void {
    this.sqlite.close();
  }
}
