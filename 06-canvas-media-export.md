# Phase 06 — Canvas, media, and portable projects

Status: in progress  
Depends on: [02-local-service-storage.md](./02-local-service-storage.md), [05-inbox-web-app.md](./05-inbox-web-app.md)  
Next: [07-hardening-release.md](./07-hardening-release.md)

## Goal

Turn Inbox references into a recoverable visual workspace while preserving local ownership and stable IDs.

## Tasks

- [x] Implement the first persisted board view with world-positioned reference nodes and a visual grid.
- [x] Show Inbox references beside a board and support drag-and-drop placement at the dropped canvas position.
- [x] Implement unbounded pan and cursor-centered zoom from 0.1x–4x with a world-positioned grid.
- [ ] Add grid toggle, selection, and resize.
- [ ] Add image/link/text/audio/video card types and custom card detail/caption behavior.
- [ ] Keep image cards linked to capture/asset IDs; support detach note as editable connected text card.
- [ ] Add connector arrows with stable endpoints and labels.
- [ ] Add undo/redo and multi-selection without stealing focus from text editors.
- [x] Add board snapshot persistence for moved nodes.
- [ ] Implement safe image/audio/video import, previews, FFmpeg derivative path where available, and configurable limits.
- [x] Implement project JSON export/import containing metadata, notes, and board graph.
- [ ] Test 500 mixed cards, 30-capture export/import, duplicate asset hashing, and clean-profile restore.

## Exit criteria

A user can place and arrange captures, edit their notes, add media, close/reopen the app, and export/re-import a project with equivalent notes, sources, assets, and graph relationships.

## Resume here

The board now renders capture image/title/note cards on a pan-and-zoom world plane, shows a draggable Inbox tray, persists viewport and freely positioned nodes, and lays out new placements without stacking them. Inbox drops call the placement API with world coordinates; an existing capture placement on that board is repositioned rather than duplicated. Remaining board work includes a grid toggle, selection/resize, richer card types, and larger acceptance/load tests. Keep media import behind an interface so missing FFmpeg degrades to a clear supported-state message.

## Verification log

- Commands: `npm run build --workspaces --if-present`; `npm test --workspaces --if-present`; final follow-up `npm run build --workspace @filmboard/web && npm run typecheck --workspace @filmboard/mac-service && npm run test --workspace @filmboard/mac-service`.
- Result: board list/detail, persisted reference nodes and viewport, image/title/note rendering, pan/zoom, Inbox drag-and-drop at world coordinates, and project JSON export are implemented; service and workspace builds/tests pass. Browser drag/drop was exercised and the dropped node's persisted coordinates were read back from the service.
- Notes: Grid controls, selection/resize, media card types, snapshot conflict handling, and large-scale import/restore tests remain. Current test services respond at `http://127.0.0.1:5173/` (web) and `http://127.0.0.1:43117/health` (API); the default SQLite file is `apps/mac-service/.filmboard/filmboard.sqlite`. Restart the extension from Chrome's extensions page after rebuilding it; active/pairing state lives in that browser profile.
