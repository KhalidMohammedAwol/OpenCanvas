# Phase 05 — Inbox and web application

Status: in progress  
Depends on: [02-local-service-storage.md](./02-local-service-storage.md), [04-pinterest-capture-quicknote.md](./04-pinterest-capture-quicknote.md)  
Next: [06-canvas-media-export.md](./06-canvas-media-export.md)

## Goal

Give the filmmaker a dependable local place to review, edit, search, tag, archive, and place captured references.

## Tasks

- [x] Create React/Vite app shell with dark-neutral default theme, responsive layout, and accessible navigation.
- [x] Implement Inbox newest-first card grid.
- [x] Show thumbnail/placeholder, note editor, source/domain, captured time, and import state.
- [x] Add instant search and filters for All, Noted, Link only, and Archived.
- [x] Implement transactional note editing with revision handling.
- [ ] Add source opening, tags, restore/delete, and manual local media import.
- [x] Add board creation, placement, board listing, and persisted node rendering without copying underlying asset bytes.
- [x] Handle link-only captures with a clear placeholder.
- [ ] Add component and API integration tests for note consistency between Inbox and capture records.

## Exit criteria

Captured records are discoverable, editable, searchable, and placeable. Editing a note in Inbox updates the same capture later shown on a board; link-only items remain honest and usable.

## Resume here

The first Inbox slice is running against the live local service. Next add media import/source actions and then move into the canvas phase.

## Verification log

- Commands: `npm run build --workspace @filmboard/web`; browser verification at `http://127.0.0.1:5173/`.
- Result: React/Vite Inbox built; real capture, note display/edit, search, board placement, and board navigation were exercised against SQLite.
- Notes: Remaining work is source actions, tags, restore/delete, media import UI, and automated browser coverage.
