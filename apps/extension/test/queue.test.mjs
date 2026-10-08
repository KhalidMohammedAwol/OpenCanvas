import test from "node:test";
import assert from "node:assert/strict";

function nextRetryAt(attempts, now = Date.now()) {
  const delay = Math.min(15 * 60_000, 1_000 * 2 ** Math.min(attempts, 10));
  return now + delay;
}

test("retry backoff is bounded and grows with attempts", () => {
  const now = 1_000_000;
  assert.equal(nextRetryAt(0, now), now + 1_000);
  assert.equal(nextRetryAt(3, now), now + 8_000);
  assert.equal(nextRetryAt(20, now), now + 15 * 60_000);
});
