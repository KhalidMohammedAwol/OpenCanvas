import test from "node:test";
import assert from "node:assert/strict";
import { PairingManager } from "../dist/pairing.js";

test("pairing issues scoped tokens and supports revocation", () => {
  const manager = new PairingManager();
  const started = manager.start();
  const confirmed = manager.confirm(started.code, "filmboard-test-extension");
  assert.equal(manager.authorize(confirmed.token, "capture:create", "filmboard-test-extension"), true);
  manager.revoke(confirmed.token);
  assert.equal(manager.authorize(confirmed.token, "capture:create", "filmboard-test-extension"), false);
});

test("pairing tokens are bound to the originating extension", () => {
  const manager = new PairingManager();
  const started = manager.start();
  const confirmed = manager.confirm(started.code, "filmboard-test-extension");
  assert.equal(manager.authorize(confirmed.token, "capture:create", "filmboard-other-extension"), false);
  assert.equal(manager.authorize(confirmed.token, "inbox:read", "filmboard-test-extension"), true);
});

test("pairing rejects invalid codes and missing extension ids", () => {
  const manager = new PairingManager();
  manager.start();
  assert.throws(() => manager.confirm("000000", "extension"), /PAIRING_INVALID/);
  assert.throws(() => manager.confirm("000000", ""), /PAIRING_INVALID/);
});
