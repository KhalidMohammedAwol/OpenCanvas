# Phase 01 — Foundation and shared contracts

Status: complete  
Depends on: none  
Next: [02-local-service-storage.md](./02-local-service-storage.md)

## Goal

Turn the empty repository into a testable monorepo skeleton and define the browser/server-safe contracts that every later package uses.

## Tasks

- [x] Create the initial workspace layout and package manifests.
- [x] Pin the intended Node LTS floor and package-manager version; add workspace scripts.
- [x] Add the shared TypeScript compiler baseline.
- [x] Define capture, source, note, operation, and API response contracts.
- [x] Define HTTP(S) source URL and 20,000-character note validation.
- [x] Add entity contracts for asset, project, board, node, edge, and placement.
- [x] Add runtime tests for valid payloads, invalid URLs, and note length.
- [x] Add a real TypeScript toolchain and npm workspace scripts.
- [x] Add remaining contract edge-case tests for unsupported intents and invalid revisions.

## Exit criteria

The contracts package builds in both browser and server targets. A fixture capture can be serialized, validated, and rejected consistently by both consumers. No server-only module is imported by extension code.

## Resume here

Phase 01 is complete. Continue with [02-local-service-storage.md](./02-local-service-storage.md), where duplicate-operation idempotency and persistence behavior belong.

## Verification log

- Commands: `npm run build --workspace @filmboard/contracts`; `npm run typecheck --workspace @filmboard/contracts`; `OPENSSL_CONF=/dev/null npm run test --workspace @filmboard/contracts`.
- Result: build passed, typecheck passed, 5 contract tests passed.
- Notes: npm is available through the elevated environment; the regular sandbox cannot execute the nvm binary directly. Duplicate-operation behavior is deferred to Phase 02 persistence tests.
