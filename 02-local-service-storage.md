# Phase 02 — Local service and storage

Status: complete  
Depends on: [01-foundation-contracts.md](./01-foundation-contracts.md)  
Next: [03-extension-queue-pairing.md](./03-extension-queue-pairing.md)

## Goal

Provide the canonical local persistence layer for captures, notes, assets, projects, and boards.

## Tasks

- [x] Implement Fastify service bound to `127.0.0.1` on a configurable local port.
- [x] Add `/health` and versioned `/api/v1` routes with structured errors.
- [x] Create SQLite database with WAL and foreign-key enforcement using Node's built-in SQLite.
- [x] Add serialized migration for captures, notes, operations, assets, projects, boards, nodes, edges, placements, indexes, and FTS5.
- [x] Implement idempotent capture create and monotonic note update endpoints.
- [x] Implement paginated Inbox list/search, detail, archive, board creation, and placement endpoints.
- [x] Implement content-addressed media import, safe paths, MIME/magic-byte validation, and local asset registration.
- [x] Add service integration tests for retries, duplicate create, reordered note updates, and FTS search.

## Exit criteria

An API test can create a capture, update its note repeatedly, replay requests without duplicates, read it from Inbox queries, and distinguish local media from link-only state. The service does not listen beyond loopback.

## Resume here

Phase 02 is complete. Continue with the user-visible vertical slice and extension queue; the service is ready for web and extension clients.

## Verification log

- Commands: `npm run build --workspace @filmboard/mac-service`; `npm run typecheck --workspace @filmboard/mac-service`; `OPENSSL_CONF=/dev/null npm run test --workspace @filmboard/mac-service`.
- Result: build passed, typecheck passed, service integration test passed including idempotent capture replay, monotonic notes, FTS search, asset import, and preview.
- Notes: Node 24's built-in SQLite is used to avoid a native driver dependency; the database adapter remains isolated in `src/db.ts`.
