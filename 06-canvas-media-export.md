# Phase 06 — Canvas, media, and portable projects

Status: in progress  
Depends on: [02-local-service-storage.md](./02-local-service-storage.md), [05-inbox-web-app.md](./05-inbox-web-app.md)  
Next: [07-hardening-release.md](./07-hardening-release.md)

## Goal

Turn Inbox references into a recoverable visual workspace while preserving local ownership and stable IDs.

## Tasks

- [x] Implement the first persisted board view with world-positioned reference nodes and a visual grid.
- [ ] Implement full infinite pan/zoom with grid toggle, 0.1x–4x zoom, selection, move, and resize.
- [ ] Add image/link/text/audio/video card types and custom card detail/caption behavior.
- [ ] Keep image cards linked to capture/asset IDs; support detach note as editable connected text card.
- [ ] Add connector arrows with stable endpoints and labels.
- [ ] Add undo/redo and multi-selection without stealing focus from text editors.
- [ ] Add debounced board snapshots, flush on visibility/pagehide, crash-recovery journal, and single-writer conflict/takeover behavior.
- [ ] Implement safe image/audio/video import, previews, FFmpeg derivative path where available, and configurable limits.
- [ ] Implement project export/import containing metadata, notes, media, board graph, and link-only records.
- [ ] Test 500 mixed cards, 30-capture export/import, duplicate asset hashing, and clean-profile restore.

## Exit criteria

A user can place and arrange captures, edit their notes, add media, close/reopen the app, and export/re-import a project with equivalent notes, sources, assets, and graph relationships.

## Resume here

Deliver image/text cards and snapshot persistence before audio/video derivatives. Keep media import behind an interface so missing FFmpeg degrades to a clear supported-state message.

## Verification log

- Commands: `npm run build --workspace @filmboard/mac-service`; `OPENSSL_CONF=/dev/null npm run test --workspace @filmboard/mac-service`; `npm run build --workspace @filmboard/web`.
- Result: board list/detail, persisted reference nodes, and project JSON export are implemented and service-tested.
- Notes: Full pan/zoom editing, media card types, snapshot conflict handling, and import/restore remain.
