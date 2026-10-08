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
- [ ] Journal every note input locally; batch network delivery only after local durability.
- [ ] Implement note icon and Option/Alt-click as mandatory reliable triggers.
- [ ] Implement best-effort Control-click interception only on FilmBoard controls; preserve ordinary Pinterest right-click behavior.
- [ ] Add deterministic DOM fixtures before relying on live Pinterest selectors.
- [ ] Test 200+ dynamic tiles, detail-page navigation, overlay persistence, keyboard navigation, reduced motion, and screen-reader labels.

## Exit criteria

Acceptance tests AC-CAP-01 through AC-CAP-07 pass against fixtures, and the live-site spike documents supported Chrome/Edge/macOS behavior and any selector/gesture limitations.

## Resume here

The first content-script capture path is bundled; next add fixture tests, durable text journaling, and gesture fallbacks before calling this phase complete.

## Verification log

- Commands: `npm run build --workspace @filmboard/extension`.
- Result: content controls and Quick Note overlay are bundled; fixture and live Pinterest acceptance coverage remains.
- Notes: The current first slice intentionally uses a resilient image scan while the Pinterest-specific fixture adapter is hardened.
