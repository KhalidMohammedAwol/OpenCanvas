# Phase 03 — Extension queue and local pairing

Status: in progress  
Depends on: [01-foundation-contracts.md](./01-foundation-contracts.md), [02-local-service-storage.md](./02-local-service-storage.md)  
Next: [04-pinterest-capture-quicknote.md](./04-pinterest-capture-quicknote.md)

## Goal

Make capture reliable when the local service is stopped, the tab closes, or the MV3 service worker is restarted.

## Tasks

- [x] Create MV3 manifest with narrow Pinterest and localhost permissions, `storage`, `contextMenus`, and alarms.
- [x] Implement typed-enough messaging between content script and service worker.
- [x] Store queued operations in extension-owned IndexedDB.
- [x] Persist `{operationId, captureId, payload, status, attempts, nextAttemptAt, lastError}`.
- [x] Ensure queue writes resolve only after the IndexedDB transaction completes.
- [x] Add bounded exponential retry calculation.
- [x] Implement bounded two-at-a-time delivery, event/startup flush, exponential retry, and periodic alarms.
- [x] Implement one-time pairing, scoped bearer token issuance, revocation, and no token logging/DOM exposure in the local service.
- [x] Add pending queue/recovery popup with Retry, Copy note/source fallback, and Open Inbox actions.
- [ ] Add tests for browser restart, service unavailability, duplicate replay, out-of-order revisions, and permanent validation failures.

## Exit criteria

A queued capture and 250-character note survive tab closure and service-worker restart, transfer exactly once after service recovery, and never display `Saved to Inbox` before local API acknowledgment.

## Resume here

Queue transaction completion was corrected: put now resolves after commit, and updates/read results also wait for transaction completion. Production storage tests cover reopen, retry state, delivery, and write rejection. Pairing tokens are bound to the confirmed extension ID; extension-origin capture, note, inbox-list/detail, and archive requests are scope checked. Browser restart/failure-injection acceptance and deeper queue tests remain. A new store instance test is not a browser-restart acceptance test.

## Verification log

- Commands: `npm run build --workspaces --if-present`; `npm test --workspaces --if-present`; `npm run typecheck --workspace @filmboard/mac-service`; `npm run test --workspace @filmboard/mac-service`.
- Result: extension, service, web, and contracts build; queue storage tests, pairing tests, service integration tests, and contract tests pass. The content script now reports delivered vs queued/error state from the background worker.
- Notes: Browser restart/failure-injection coverage and storage-pressure warning remain.
