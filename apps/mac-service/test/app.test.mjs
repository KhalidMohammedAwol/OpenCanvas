import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../dist/app.js";

const envelope = {
  schemaVersion: 1,
  captureId: "capture-e2e-1",
  operationId: "operation-e2e-1",
  source: { site: "pinterest", pageUrl: "https://www.pinterest.com/pin/example/", title: "Window light" },
  capture: { capturedAt: "2026-10-08T07:00:00Z", noteText: "A figure waits outside.", noteRevision: 0 },
  intent: "quick-note"
};

test("persists idempotent captures and monotonic notes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "filmboard-service-"));
  const app = buildApp({ databasePath: join(directory, "filmboard.sqlite") });
  try {
    const health = await app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200);
    const pairing = await app.inject({ method: "POST", url: "/api/v1/pairings/start" });
    assert.equal(pairing.statusCode, 200);

    const first = await app.inject({ method: "POST", url: "/api/v1/captures", payload: envelope });
    assert.equal(first.statusCode, 201);
    const replay = await app.inject({ method: "POST", url: "/api/v1/captures", payload: envelope });
    assert.equal(replay.statusCode, 201);
    assert.equal(JSON.parse(replay.body).captureId, envelope.captureId);

    const update = await app.inject({ method: "PATCH", url: `/api/v1/captures/${envelope.captureId}/note`, payload: { operationId: "operation-e2e-note-1", revision: 1, text: "The figure waits outside in the rain.", updatedAt: "2026-10-08T07:01:00Z" } });
    assert.equal(update.statusCode, 200);
    const stale = await app.inject({ method: "PATCH", url: `/api/v1/captures/${envelope.captureId}/note`, payload: { operationId: "operation-e2e-note-stale", revision: 1, text: "stale", updatedAt: "2026-10-08T07:02:00Z" } });
    assert.equal(JSON.parse(stale.body).accepted, false);

    const list = await app.inject({ method: "GET", url: "/api/v1/captures?q=figure" });
    assert.equal(JSON.parse(list.body).items.length, 1);
    assert.equal(JSON.parse(list.body).items[0].id, envelope.captureId);

    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x66, 0x69, 0x6c, 0x6d]);
    const asset = await app.inject({ method: "POST", url: "/api/v1/assets/import", payload: { dataBase64: pngHeader.toString("base64"), captureId: envelope.captureId } });
    assert.equal(asset.statusCode, 201);
    const assetId = JSON.parse(asset.body).asset.id;
    const preview = await app.inject({ method: "GET", url: `/api/v1/assets/${assetId}/preview` });
    assert.equal(preview.statusCode, 200);
    assert.equal(preview.headers["content-type"].startsWith("image/png"), true);
    const createdBoard = await app.inject({ method: "POST", url: "/api/v1/boards", payload: { boardTitle: "Export board" } });
    const createdBoardBody = JSON.parse(createdBoard.body);
    await app.inject({ method: "POST", url: `/api/v1/captures/${envelope.captureId}/place`, payload: { boardId: createdBoardBody.id } });
    const boardList = await app.inject({ method: "GET", url: "/api/v1/boards" });
    const boardId = JSON.parse(boardList.body).items[0].id;
    const boardGraph = await app.inject({ method: "GET", url: `/api/v1/boards/${boardId}` });
    const movedNode = JSON.parse(boardGraph.body).nodes[0];
    const snapshot = await app.inject({ method: "PUT", url: `/api/v1/boards/${boardId}/snapshot`, payload: { viewportJson: JSON.stringify({ x: 4, y: 8, zoom: 1.2 }), nodes: [{ ...movedNode, x: 160, y: 90 }] } });
    assert.equal(snapshot.statusCode, 200);
    const exported = await app.inject({ method: "POST", url: `/api/v1/exports/projects/${JSON.parse(boardList.body).items[0].projectId}` });
    assert.equal(exported.statusCode, 200);
    assert.equal(JSON.parse(exported.body).boards[0].id, boardId);
    const imported = await app.inject({ method: "POST", url: "/api/v1/exports/import", payload: JSON.parse(exported.body) });
    assert.equal(imported.statusCode, 201);
    const detail = await app.inject({ method: "GET", url: `/api/v1/captures/${envelope.captureId}` });
    assert.equal(JSON.parse(detail.body).capture.importStatus, "local");
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
