import test from "node:test";
import assert from "node:assert/strict";
import { PairingManager } from "../dist/pairing.js";

test("pairing issues scoped tokens and supports revocation", () => {
  const manager = new PairingManager();
  const started = manager.start();
  const confirmed = manager.confirm(started.code, "filmboard-test-extension");
  assert.equal(manager.authorize(confirmed.token, "capture:create"), true);
  manager.revoke(confirmed.token);
  assert.equal(manager.authorize(confirmed.token, "capture:create"), false);
});

test("pairing rejects invalid codes", () => {
  const manager = new PairingManager();
  manager.start();
  assert.throws(() => manager.confirm("000000", "extension"), /PAIRING_INVALID/);
});
