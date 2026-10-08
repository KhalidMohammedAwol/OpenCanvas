# FilmBoard V1 implementation index

Status: planning complete; implementation has not started.

This repository currently contains only the README and license. The source specification is the Capture-First V1 document prepared 7 October 2026. These checkpoint files split the work into small resumable units.

## Delivery strategy

Build and validate the smallest differentiating slice first:

1. Shared contracts and repository bootstrap.
2. Local SQLite service and capture API.
3. Extension queue and pairing.
4. Pinterest capture controls and Quick Note.
5. Inbox review/edit/search.
6. Canvas, media cards, and persistence.
7. Export, recovery, security, performance, and release packaging.

Each phase should leave the project runnable and should end with its own verification. Do not begin the next phase with unresolved release-blocking failures in the current phase.

## Work packages

| File | Work package | Depends on | Exit result |
|---|---|---|---|
| [01-foundation-contracts.md](./01-foundation-contracts.md) | Repo bootstrap, shared DTOs, schema, validation, test harness | None | A typed capture contract can be validated in browser and server builds |
| [02-local-service-storage.md](./02-local-service-storage.md) | Fastify loopback service, SQLite, migrations, media store | 01 | A capture can be persisted and read back locally |
| [03-extension-queue-pairing.md](./03-extension-queue-pairing.md) | MV3 service worker, IndexedDB queue, pairing, retries | 01, 02 | Extension operations survive service restarts and transfer idempotently |
| [04-pinterest-capture-quicknote.md](./04-pinterest-capture-quicknote.md) | Pinterest adapter, hover controls, Quick Note overlay | 03 | One-click and noted captures work on deterministic fixtures and live test pages |
| [05-inbox-web-app.md](./05-inbox-web-app.md) | Inbox, note editing, search, filters, board placement | 02, 04 | Captures are usable end-to-end from Inbox |
| [06-canvas-media-export.md](./06-canvas-media-export.md) | Canvas, cards, media import, autosave, export/import | 02, 05 | Captures can be organized and restored on a board |
| [07-hardening-release.md](./07-hardening-release.md) | E2E, security, failure injection, performance, packaging | 01–06 | V1 release gates and acceptance tests are evidenced |

## Checkpoint protocol

At the end of every work session:

- Update the relevant phase file's checklist and `Resume here` section.
- Record commands run and their result.
- Keep changes small enough to review independently.
- Do not mark a phase complete unless its exit criteria are verified.

At the start of the next session, read this file and the first phase file whose status is not `complete`.

## Global constraints

- V1 is Mac-local: React/TypeScript/Vite, MV3 extension, Node/Fastify, SQLite, local media.
- Bind the service to `127.0.0.1`; never expose it on the LAN.
- No cloud sync, authentication across devices, Yjs, WebSockets, PostgreSQL, Docker, or Safari packaging in V1.
- Never claim an image is locally saved when only a source URL was retained.
- Capture and note writes must be durable and idempotent before success is shown.
