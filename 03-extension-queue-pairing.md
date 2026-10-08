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
- [ ] Add pending queue/recovery UI with Copy note/source fallback and storage-pressure warning.
- [ ] Add tests for browser restart, service unavailability, duplicate replay, out-of-order revisions, and permanent validation failures.

## Exit criteria

A queued capture and 250-character note survive tab closure and service-worker restart, transfer exactly once after service recovery, and never display `Saved to Inbox` before local API acknowledgment.

## Resume here

The queue and first live transfer path are compiled into the MV3 bundle. Next add pairing and recovery UI, then validate against a packaged browser fixture.

## Verification log

- Commands: `npm run build --workspace @filmboard/contracts`; `npm run build --workspace @filmboard/extension`; `npm run test --workspace @filmboard/extension`.
- Result: MV3 manifest, background service worker, and content script bundle; queue backoff test passed.
- Notes: Pairing/token exchange is implemented in the local service and extension Options page; recovery UI and browser restart/failure-injection tests remain.
