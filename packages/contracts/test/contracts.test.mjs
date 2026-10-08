import test from "node:test";
import assert from "node:assert/strict";
import { validateCaptureEnvelope, validateNoteUpdateRequest } from "../dist/index.js";

const envelope = {
  schemaVersion: 1,
  captureId: "capture-1",
  operationId: "operation-1",
  source: {
    site: "pinterest",
    pageUrl: "https://www.pinterest.com/pin/example/",
    imageCandidateUrl: "https://i.pinimg.com/example.jpg"
  },
  capture: {
    capturedAt: "2026-10-07T19:50:00Z",
    noteText: "A quiet shot idea.",
    noteRevision: 0
  },
  intent: "quick-note"
};

test("validates a capture envelope", () => {
  assert.deepEqual(validateCaptureEnvelope(envelope), envelope);
});

test("rejects non-HTTP source URLs", () => {
  assert.throws(() => validateCaptureEnvelope({
    ...envelope,
    source: { ...envelope.source, pageUrl: "file:///private/reference.jpg" }
  }), /pageUrl must be HTTP/);
});

test("rejects unsupported capture intents", () => {
  assert.throws(() => validateCaptureEnvelope({
    ...envelope,
    intent: "bulk-import"
  }), /unknown intent/);
});

test("rejects stale or missing note revisions", () => {
  assert.throws(() => validateNoteUpdateRequest({
    operationId: "operation-1",
    revision: 0,
    text: "A note",
    updatedAt: "2026-10-07T19:50:00Z"
  }), /revision/);
});

test("rejects notes over the contract limit", () => {
  assert.throws(() => validateNoteUpdateRequest({
    operationId: "operation-1",
    revision: 1,
    text: "x".repeat(20_001),
    updatedAt: "2026-10-07T19:50:00Z"
  }), /NOTE_TOO_LONG/);
});
