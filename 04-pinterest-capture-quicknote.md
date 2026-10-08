# Phase 04 — Pinterest capture and Quick Note

Status: in progress  
Depends on: [03-extension-queue-pairing.md](./03-extension-queue-pairing.md)  
Next: [05-inbox-web-app.md](./05-inbox-web-app.md)

## Goal

Validate FilmBoard's highest-risk differentiator: capture a reference and the first thought without leaving Pinterest.

## Tasks

- [x] Build a first Pinterest-compatible image adapter that extracts visible image candidates and source URLs.
- [x] Add MutationObserver handling for dynamic image additions.
- [x] Inject FilmBoard-owned Save and note controls with duplicate protection and hover visibility.
- [x] Implement plain Save: UUID, durable queue write, transfer status, and link-only fallback.
- [x] Implement Quick Note overlay with image preview, multiline editor, and close controls.
- [x] Journal every note input locally; batch network delivery only after local durability.
- [x] Implement note icon and Option/Alt-click as mandatory reliable triggers.
- [x] Implement best-effort Control-click interception only on FilmBoard controls; preserve ordinary Pinterest right-click behavior.
- [ ] Add deterministic DOM fixtures before relying on live Pinterest selectors.
- [ ] Test 200+ dynamic tiles, detail-page navigation, overlay persistence, keyboard navigation, reduced motion, and screen-reader labels.

## Exit criteria

Acceptance tests AC-CAP-01 through AC-CAP-07 pass against fixtures, and the live-site spike documents supported Chrome/Edge/macOS behavior and any selector/gesture limitations.

## Resume here

Plain Save and Quick Note share the same queue/API path. An empty note was rejected by contract validation, which made unannotated captures stay out of the Inbox; empty note strings are now valid and the extension reports whether a capture reached the service or is only queued. The content script no longer treats image alt text as a title. Deterministic Pinterest fixtures and live acceptance coverage remain before calling this phase complete.

## Verification log

- Commands: `npm run build --workspace @filmboard/extension`.
- Result: plain-save empty-note validation regression is covered by contract and service tests; rebuilt extension controls report delivery status. Alt text is no longer used as the capture title to avoid copying Pinterest descriptions into FilmBoard cards. Fixture and live Pinterest acceptance coverage remains.
- Notes: The current first slice intentionally uses a resilient image scan while the Pinterest-specific fixture adapter is hardened. After source changes, rebuild via `npm run build --workspace @filmboard/extension`, then reload the unpacked extension at `apps/extension/dist` and refresh Pinterest tabs.
