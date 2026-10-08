import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID as uuid } from "node:crypto";
import { validateCaptureEnvelope, validateNoteUpdateRequest } from "@filmboard/contracts";
import { FilmBoardDatabase } from "./db.js";
import { MediaStore } from "./media.js";
import { PairingManager } from "./pairing.js";

export interface AppOptions {
  databasePath?: string;
  logger?: boolean;
}

function errorCode(error: unknown): string {
  return error instanceof Error ? (error.message.split(":", 1)[0] ?? "INTERNAL_ERROR") : "INTERNAL_ERROR";
}

export function buildApp(options: AppOptions = {}): FastifyInstance & { database: FilmBoardDatabase } {
  const databasePath = options.databasePath ?? join(process.cwd(), ".filmboard", "filmboard.sqlite");
  mkdirSync(join(databasePath, ".."), { recursive: true });
  const database = new FilmBoardDatabase(databasePath);
  const mediaStore = new MediaStore(join(databasePath, "..", "media"));
  const pairing = new PairingManager();
  const app = Fastify({ logger: options.logger ?? false }) as unknown as FastifyInstance & { database: FilmBoardDatabase };
  app.database = database;

  app.addHook("onRequest", async (request, reply) => {
    const rawHost = request.headers.host;
    const host = Array.isArray(rawHost) ? rawHost[0] : rawHost;
    if (host && !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return reply.code(403).send({ error: { code: "HOST_NOT_ALLOWED", message: "Local service accepts loopback hosts only", retryable: false, requestId: randomUUID() } });
    const rawOrigin = request.headers.origin;
    const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
    if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin) && !origin.startsWith("chrome-extension://")) return reply.code(403).send({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin is not allowed", retryable: false, requestId: randomUUID() } });
  });

  app.get("/health", async () => ({ ok: true, service: "filmboard-local", version: "0.1.0" }));

  const extensionAuthorized = (request: { headers: Record<string, string | string[] | undefined> }, scope: "capture:create" | "capture:update" | "inbox:read"): boolean => {
    const rawOrigin = request.headers.origin;
    const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
    if (!origin?.startsWith("chrome-extension://")) return true;
    const extensionId = new URL(origin).hostname;
    const rawToken = request.headers["x-filmboard-token"];
    const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
    return pairing.authorize(token, scope, extensionId);
  };

  app.post("/api/v1/pairings/start", async (_request, reply) => reply.send(pairing.start()));

  app.post<{ Body: { code: string; extensionId: string } }>("/api/v1/pairings/confirm", async (request, reply) => {
    try { return reply.send(pairing.confirm(request.body.code, request.body.extensionId)); }
    catch (error) { return reply.code(400).send({ error: { code: "PAIRING_INVALID", message: error instanceof Error ? error.message : "Invalid pairing", retryable: false, requestId: randomUUID() } }); }
  });

  app.post<{ Body: { token: string } }>("/api/v1/pairings/revoke", async (request, reply) => { pairing.revoke(request.body.token); return reply.send({ revoked: true }); });

  app.post("/api/v1/captures", async (request, reply) => {
    if (!extensionAuthorized(request, "capture:create")) return reply.code(401).send({ error: { code: "PAIRING_REQUIRED", message: "Pair the FilmBoard extension before capturing", retryable: false, requestId: randomUUID() } });
    try {
      const response = database.createCapture(validateCaptureEnvelope(request.body));
      return reply.code(201).send(response);
    } catch (error) {
      return reply.code(errorCode(error) === "CAPTURE_INVALID" || errorCode(error) === "NOTE_TOO_LONG" ? 400 : 500).send({ error: { code: errorCode(error), message: error instanceof Error ? error.message : "Unable to create capture", retryable: false, requestId: randomUUID() } });
    }
  });

  app.patch<{ Params: { captureId: string } }>("/api/v1/captures/:captureId/note", async (request, reply) => {
    if (!extensionAuthorized(request, "capture:update")) return reply.code(401).send({ error: { code: "PAIRING_REQUIRED", message: "Pair the FilmBoard extension before updating notes", retryable: false, requestId: randomUUID() } });
    try {
      const response = database.updateNote(request.params.captureId, validateNoteUpdateRequest(request.body));
      return reply.code(response.accepted ? 200 : 200).send(response);
    } catch (error) {
      const code = errorCode(error);
      return reply.code(code === "CAPTURE_NOT_FOUND" ? 404 : 400).send({ error: { code, message: error instanceof Error ? error.message : "Unable to update note", retryable: code === "CAPTURE_NOT_FOUND" } });
    }
  });

  app.get<{ Querystring: { q?: string; limit?: string; offset?: string } }>("/api/v1/captures", async (request) => {
    if (!extensionAuthorized(request, "inbox:read")) return { error: { code: "PAIRING_REQUIRED", message: "Pair the FilmBoard extension before reading Inbox", retryable: false, requestId: randomUUID() } };
    const limitValue = Number(request.query.limit ?? 50);
    const offsetValue = Number(request.query.offset ?? 0);
    return { items: database.listCaptures(request.query.q, Number.isFinite(limitValue) ? limitValue : 50, Number.isFinite(offsetValue) ? offsetValue : 0) };
  });

  app.get<{ Params: { captureId: string } }>("/api/v1/captures/:captureId", async (request, reply) => {
    if (!extensionAuthorized(request, "inbox:read")) return reply.code(401).send({ error: { code: "PAIRING_REQUIRED", message: "Pair the FilmBoard extension before reading a capture", retryable: false, requestId: randomUUID() } });
    const capture = database.getCapture(request.params.captureId);
    return capture ? reply.send(capture) : reply.code(404).send({ error: { code: "CAPTURE_NOT_FOUND", message: "Capture not found", retryable: false, requestId: randomUUID() } });
  });

  app.post<{ Params: { captureId: string } }>("/api/v1/captures/:captureId/archive", async (request, reply) => {
    if (!extensionAuthorized(request, "capture:update")) return reply.code(401).send({ error: { code: "PAIRING_REQUIRED", message: "Pair the FilmBoard extension before archiving a capture", retryable: false, requestId: randomUUID() } });
    return database.archiveCapture(request.params.captureId) ? reply.send({ archived: true }) : reply.code(404).send({ error: { code: "CAPTURE_NOT_FOUND", message: "Capture not found", retryable: false, requestId: randomUUID() } });
  });

  app.post<{ Body: { projectTitle?: string; boardTitle?: string } }>("/api/v1/boards", async (request, reply) => {
    return reply.code(201).send(database.createBoard(request.body?.projectTitle, request.body?.boardTitle));
  });

  app.get("/api/v1/boards", async () => ({ items: database.listBoards() }));

  app.get<{ Params: { boardId: string } }>("/api/v1/boards/:boardId", async (request, reply) => {
    const board = database.getBoard(request.params.boardId);
    return board ? reply.send(board) : reply.code(404).send({ error: { code: "BOARD_NOT_FOUND", message: "Board not found", retryable: false, requestId: randomUUID() } });
  });

  app.put<{ Params: { boardId: string }; Body: { viewportJson?: string; nodes?: Array<{ id: string; x: number; y: number; width: number; height: number; zRank?: number; propsJson?: string }> } }>("/api/v1/boards/:boardId/snapshot", async (request, reply) => {
    try {
      const count = database.saveBoardSnapshot(request.params.boardId, request.body?.viewportJson ?? JSON.stringify({ x: 0, y: 0, zoom: 1 }), request.body?.nodes ?? []);
      return reply.send({ saved: true, nodeCount: count, savedAt: new Date().toISOString() });
    } catch (error) {
      const code = errorCode(error);
      return reply.code(code === "BOARD_NOT_FOUND" ? 404 : 400).send({ error: { code, message: error instanceof Error ? error.message : "Unable to save board", retryable: true, requestId: randomUUID() } });
    }
  });

  app.post<{ Params: { id: string } }>("/api/v1/exports/projects/:id", async (request, reply) => {
    const exported = database.exportProject(request.params.id);
    if (!exported) return reply.code(404).send({ error: { code: "PROJECT_NOT_FOUND", message: "Project not found", retryable: false, requestId: randomUUID() } });
    return reply.header("content-disposition", `attachment; filename=filmboard-project-${request.params.id}.json`).type("application/json").send(exported);
  });

  app.post<{ Body: import("./db.js").ProjectExport }>("/api/v1/exports/import", async (request, reply) => {
    try { return reply.code(201).send(database.importProject(request.body)); }
    catch (error) { return reply.code(400).send({ error: { code: errorCode(error), message: error instanceof Error ? error.message : "Invalid project export", retryable: false, requestId: randomUUID() } }); }
  });

  app.post<{ Params: { captureId: string }; Body: { boardId: string; x?: number; y?: number } }>("/api/v1/captures/:captureId/place", async (request, reply) => {
    try {
      const { x, y } = request.body;
      if ((x !== undefined && !Number.isFinite(x)) || (y !== undefined && !Number.isFinite(y)) || (x === undefined) !== (y === undefined)) {
        return reply.code(400).send({ error: { code: "BOARD_POSITION_INVALID", message: "Both finite x and y coordinates are required when placing at a position", retryable: false, requestId: randomUUID() } });
      }
      return reply.code(201).send(database.placeCapture(request.params.captureId, request.body.boardId, x === undefined || y === undefined ? undefined : { x, y }));
    } catch (error) {
      const code = errorCode(error);
      return reply.code(code.endsWith("NOT_FOUND") ? 404 : 400).send({ error: { code, message: error instanceof Error ? error.message : "Unable to place capture", retryable: false, requestId: randomUUID() } });
    }
  });

  app.post<{ Body: { dataBase64: string; mimeType?: string; captureId?: string } }>("/api/v1/assets/import", async (request, reply) => {
    try {
      const body = request.body;
      if (!body?.dataBase64) return reply.code(400).send({ error: { code: "ASSET_DATA_REQUIRED", message: "dataBase64 is required", retryable: false, requestId: randomUUID() } });
      const imported = await mediaStore.importBuffer(Buffer.from(body.dataBase64, "base64"), body.mimeType);
      const asset = { id: uuid(), ...imported, width: null, height: null, state: "local" as const, createdAt: new Date().toISOString() };
      database.registerAsset(asset, body.captureId);
      return reply.code(201).send({ asset });
    } catch (error) {
      const code = errorCode(error);
      return reply.code(400).send({ error: { code, message: error instanceof Error ? error.message : "Unable to import asset", retryable: false, requestId: randomUUID() } });
    }
  });

  app.get<{ Params: { assetId: string } }>("/api/v1/assets/:assetId/preview", async (request, reply) => {
    const asset = database.getAsset(request.params.assetId);
    if (!asset) return reply.code(404).send({ error: { code: "ASSET_NOT_FOUND", message: "Asset not found", retryable: false, requestId: randomUUID() } });
    try {
      const contents = await mediaStore.read(asset.relativePath);
      return reply.type(asset.mimeType).send(contents);
    } catch (error) {
      return reply.code(404).send({ error: { code: "ASSET_UNAVAILABLE", message: error instanceof Error ? error.message : "Asset unavailable", retryable: true, requestId: randomUUID() } });
    }
  });

  app.addHook("onClose", async () => database.close());
  return app;
}
