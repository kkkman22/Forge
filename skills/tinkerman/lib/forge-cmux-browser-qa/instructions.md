---
description: "Use when running /tinkerman test with browser-based QA via cmux (requires cmux installed)"
dispatch_mode: inline
updated: 2026-08-11
allowed_tools:
  - Read
  - Bash
---

# Forge Browser QA

Provides browser-based quality assurance during the `/tinkerman test` phase using cmux browser commands.

## 1. Overview

This skill provides browser-based quality assurance during `/tinkerman test` using cmux browser commands.

## Usage

Activated automatically during `/tinkerman test` when cmux browser capabilities are available.

## Verdict States

| Verdict | Meaning |
|---------|---------|
| pass | All browser checks completed |
| fail | One or more checks failed |
| inconclusive | cmux browser unavailable or error |

## Artifact

Results written to `.forge/.cmux-browser-qa.json`.

## Diagnostics Collection (cmux 0.64.8–0.64.15)

`collectBrowserDiagnostics()` (in `scripts/cmux-mirror/browser-qa.mjs`) captures
**read-only** QA artifacts, independent of the pass/fail verdict above. Call it
after `runBrowserQa` to preserve evidence on failure:

| Capture | cmux CLI | Version | Artifact |
|---------|----------|---------|----------|
| Screenshot | `cmux browser screenshot --out <path>` | 0.64.8 | `screenshot.png` (cmux writes via `--out`) |
| Console log | `cmux browser console list` | 0.64.15 view-action | `console.txt` (from stdout) |
| JS errors | `cmux browser errors list` | 0.64.15 view-action | `errors.txt` (from stdout) |

Artifacts land under `.forge/findings/<topic>/browser-qa/`. Each step degrades
independently — a missing view-action (older cmux) is recorded as `skipped`
without aborting the others. Pass `surface` to target a specific browser surface
(most subcommands require one per `cmux browser --help`).

> Not modeled: the 0.64.15 UI view-actions (react-grab / devtools / zoom /
> history) are not CLI-exposed; only `console`/`errors` reached the CLI surface.

## Zero-Impact

Without cmux, standard test verification proceeds normally. Browser QA is purely additive.
