# Phase 07 — Hardening, security, QA, and release

Status: not started  
Depends on: [01-foundation-contracts.md](./01-foundation-contracts.md) through [06-canvas-media-export.md](./06-canvas-media-export.md)

## Goal

Prove the V1 release gates, document limitations, and package a safe Mac-local developer/release experience.

## Tasks

- [ ] Automate AC-CAP-01 through AC-CAP-14 with Playwright, API tests, and failure injection where appropriate.
- [ ] Test service stopped, browser restart, disk full, queue full, blocked image, expired URL, duplicate image, and concurrent board tabs.
- [x] Verify loopback-only binding, Host/Origin checks, pairing scopes, token revocation, and private-host rejection for local API requests.
- [ ] Run dependency/security review; verify no telemetry, cookies, browsing history, or arbitrary host permissions.
- [ ] Run accessibility checks for keyboard flow, focus return, live save states, contrast, reduced motion, and screen readers.
- [ ] Benchmark 500 canvas cards, 100 Inbox captures, queue transfer latency, and documented target hardware.
- [ ] Decide and document LaunchAgent versus packaged desktop helper (ADR-05).
- [ ] Add startup, diagnostics, update, uninstall, backup, restore, and extension installation instructions.
- [ ] Confirm all P0 release gates and record known limitations, especially Control-click variability and remote image availability.

## Exit criteria

All P0 acceptance tests pass, no silent note loss or misleading save state remains, export/import works, critical security findings are absent, and a new user can install, back up, recover, and uninstall the local product from documentation.

## Resume here

Do not start release packaging until the vertical slice is stable. Turn every production bug found during hardening into a regression test before fixing it.

## Verification log

- Commands:
- Result:
- Notes:
