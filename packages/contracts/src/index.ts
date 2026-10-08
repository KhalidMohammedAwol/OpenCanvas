/** Shared, browser/server-safe contracts for FilmBoard V1. */

export const CONTRACTS_VERSION = 1 as const;

export type UUID = string;
export type ISODateTime = string;

export type CaptureIntent = "save" | "quick-note" | "context-menu";
export type CaptureStatus = "inbox" | "archived";
export type ImportStatus = "pending" | "local" | "preview" | "link-only" | "failed";
export type BoardNodeType = "image" | "link" | "text" | "audio" | "video";

export interface CaptureSource {
  site: string;
  pageUrl: string;
  imageCandidateUrl?: string;
  title?: string;
  description?: string;
  displayWidth?: number;
  displayHeight?: number;
}

export interface CaptureEnvelope {
  schemaVersion: 1;
  captureId: UUID;
  operationId: UUID;
  source: CaptureSource;
  capture: {
    capturedAt: ISODateTime;
    noteText: string;
    noteRevision: number;
  };
  intent: CaptureIntent;
}

export interface CaptureRecord {
  id: UUID;
  sourceUrl: string;
  pageUrl: string;
  sourceSite: string;
  title: string | null;
  description: string | null;
  imageCandidateUrl: string | null;
  capturedAt: ISODateTime;
  status: CaptureStatus;
  importStatus: ImportStatus;
  assetId: UUID | null;
  archivedAt: ISODateTime | null;
}

export interface CaptureNote {
  id: UUID;
  captureId: UUID;
  text: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  revision: number;
}

export interface CaptureOperation {
  operationId: UUID;
  captureId: UUID;
  revision: number;
  type: "capture.create" | "capture.note.update";
  payload: unknown;
  createdAt: ISODateTime;
  appliedAt?: ISODateTime;
}

export interface AssetRecord {
  id: UUID;
  sha256: string;
  relativePath: string;
  mimeType: string;
  byteLength: number;
  width: number | null;
  height: number | null;
  state: ImportStatus;
  createdAt: ISODateTime;
}

export interface ProjectRecord {
  id: UUID;
  title: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface BoardRecord {
  id: UUID;
  projectId: UUID;
  title: string;
  viewportJson: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface BoardNodeRecord {
  id: UUID;
  boardId: UUID;
  type: BoardNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  zRank: number;
  propsJson: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface BoardEdgeRecord {
  id: UUID;
  boardId: UUID;
  sourceNodeId: UUID;
  targetNodeId: UUID;
  styleJson: string;
  label: string | null;
}

export interface CapturePlacementRecord {
  captureId: UUID;
  boardId: UUID;
  nodeId: UUID;
  placedAt: ISODateTime;
}

export interface CreateCaptureResponse {
  captureId: UUID;
  noteRevision: number;
  assetState: ImportStatus;
  status: "inbox";
  persistedAt: ISODateTime;
}

export interface NoteUpdateRequest {
  operationId: UUID;
  revision: number;
  text: string;
  updatedAt: ISODateTime;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    requestId: UUID;
  };
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateCaptureEnvelope(value: unknown): CaptureEnvelope {
  if (!isRecord(value)) throw new Error("CAPTURE_INVALID: envelope must be an object");
  if (value.schemaVersion !== 1) throw new Error("CAPTURE_INVALID: unsupported schema version");
  requireString(value.captureId, "captureId");
  requireString(value.operationId, "operationId");
  requireRecord(value.source, "source");
  requireRecord(value.capture, "capture");
  requireString(value.source.pageUrl, "source.pageUrl");
  if (!isHttpUrl(value.source.pageUrl)) throw new Error("CAPTURE_INVALID: pageUrl must be HTTP(S)");
  if (value.source.imageCandidateUrl !== undefined) {
    requireString(value.source.imageCandidateUrl, "source.imageCandidateUrl");
    if (!isHttpUrl(value.source.imageCandidateUrl)) {
      throw new Error("CAPTURE_INVALID: imageCandidateUrl must be HTTP(S)");
    }
  }
  requireString(value.capture.capturedAt, "capture.capturedAt");
  requireString(value.capture.noteText, "capture.noteText");
  if (value.capture.noteText.length > 20_000) throw new Error("NOTE_TOO_LONG");
  requireIntegerAtLeast(value.capture.noteRevision, 0, "capture.noteRevision");
  if (value.intent !== "save" && value.intent !== "quick-note" && value.intent !== "context-menu") {
    throw new Error("CAPTURE_INVALID: unknown intent");
  }
  return value as unknown as CaptureEnvelope;
}

export function validateNoteUpdateRequest(value: unknown): NoteUpdateRequest {
  if (!isRecord(value)) throw new Error("NOTE_INVALID: request must be an object");
  requireString(value.operationId, "operationId");
  requireString(value.text, "text");
  requireString(value.updatedAt, "updatedAt");
  requireIntegerAtLeast(value.revision, 1, "revision");
  if (value.text.length > 20_000) throw new Error("NOTE_TOO_LONG");
  return value as unknown as NoteUpdateRequest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`CAPTURE_INVALID: ${name} must be an object`);
}

function requireString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`CAPTURE_INVALID: ${name} is required`);
}

function requireIntegerAtLeast(value: unknown, minimum: number, name: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`CAPTURE_INVALID: ${name} must be an integer >= ${minimum}`);
  }
}
