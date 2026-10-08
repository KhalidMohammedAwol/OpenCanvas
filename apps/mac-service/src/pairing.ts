import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const SCOPES = ["capture:create", "capture:update", "inbox:read"] as const;
export type PairingScope = (typeof SCOPES)[number];

type PairingCode = { hash: string; expiresAt: number };
type TokenRecord = { hash: string; extensionId: string; scopes: Set<PairingScope>; revoked: boolean };

export class PairingManager {
  private pending: PairingCode | undefined;
  private readonly tokens = new Map<string, TokenRecord>();

  start(): { code: string; expiresAt: string } {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 5 * 60_000;
    this.pending = { hash: digest(code), expiresAt };
    return { code, expiresAt: new Date(expiresAt).toISOString() };
  }

  confirm(code: string, extensionId: string): { token: string; scopes: PairingScope[] } {
    if (!this.pending || this.pending.expiresAt < Date.now() || !safeEqual(this.pending.hash, digest(code))) throw new Error("PAIRING_INVALID");
    const token = randomBytes(32).toString("base64url");
    this.tokens.set(digest(token), { hash: digest(token), extensionId, scopes: new Set(SCOPES), revoked: false });
    this.pending = undefined;
    return { token, scopes: [...SCOPES] };
  }

  revoke(token: string): void {
    const record = this.tokens.get(digest(token));
    if (record) record.revoked = true;
  }

  authorize(token: string | undefined, scope: PairingScope): boolean {
    if (!token) return false;
    const record = this.tokens.get(digest(token));
    return Boolean(record && !record.revoked && record.scopes.has(scope));
  }
}

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function safeEqual(left: string, right: string): boolean { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
