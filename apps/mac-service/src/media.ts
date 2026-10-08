import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type MediaImport = {
  sha256: string;
  relativePath: string;
  mimeType: string;
  byteLength: number;
};

export class MediaStore {
  constructor(private readonly rootDirectory: string) {}

  async importBuffer(buffer: Buffer, declaredMimeType?: string): Promise<MediaImport> {
    if (buffer.length === 0) throw new Error("ASSET_EMPTY");
    const mimeType = detectMime(buffer) ?? declaredMimeType;
    if (!mimeType || !SUPPORTED_MIME_TYPES.has(mimeType)) throw new Error("ASSET_UNSUPPORTED_TYPE");
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const relativePath = join("originals", sha256.slice(0, 2), sha256);
    const absolutePath = join(this.rootDirectory, relativePath);
    await mkdir(join(this.rootDirectory, "originals", sha256.slice(0, 2)), { recursive: true });
    try {
      await writeFile(absolutePath, buffer, { flag: "wx" });
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    }
    return { sha256, relativePath, mimeType, byteLength: buffer.byteLength };
  }

  async read(relativePath: string): Promise<Buffer> {
    const absolutePath = join(this.rootDirectory, relativePath);
    if (!absolutePath.startsWith(`${this.rootDirectory}/`) || relativePath.includes("..")) throw new Error("ASSET_PATH_INVALID");
    return readFile(absolutePath);
  }
}

const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "audio/mpeg", "video/mp4"]);

function detectMime(buffer: Buffer): string | undefined {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a") return "image/gif";
  if (buffer.subarray(0, 3).toString("ascii") === "ID3" || (buffer[0] === 0xff && (buffer[1] ?? 0) >= 0xe0)) return "audio/mpeg";
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") return "video/mp4";
  return undefined;
}
