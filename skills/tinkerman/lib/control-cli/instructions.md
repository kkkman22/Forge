---
updated: 2026-08-11
description: "Use when running /tinkerman test --cli or when forge-test detects a CLI target"

dispatch_mode: inline
allowed_tools:
  - Read
  - Bash
---

# /tinkerman test --cli — CLI Harness

> **Trigger**: `/tinkerman test --cli` or forge-test auto-detects CLI target
> **Output**: `.forge/findings/<topic>/cli-harness/`

## 1. Overview

4-tier CLI harness for verifying CLI/TUI applications through external control. Each tier provides send-text, send-key, and capture-pane capabilities with increasing fidelity.

**Not For**: Web UI testing (use `/tinkerman test --ui`), non-interactive scripts.

## 2. Tier Selection [R5.2]

Priority order — first available wins:

| Priority | Tier | Detection | Capabilities |
|----------|------|-----------|-------------|
| 1 | project | `test/e2e/*.spec.ts` exists | Full test framework |
| 2 | cmux | `$CMUX_WORKSPACE_ID` + socket | send-text/key, capture, progress |
| 3 | tmux | `which tmux` | send-keys, capture-pane |
| 4 | node-pty | `child_process.spawn` + pipe | stdin/stdout only |

→ Details: references/tmux-harness.md, references/cmux-harness.md, references/node-pty-fallback.md

## 3. Orchestrator Flow

1. Detect tier via `harness-detector.ts`
2. Execute target command in selected harness
3. Optionally feed input script line-by-line
4. Capture stdout/stderr + exit code
5. Write artifacts to `.forge/findings/<topic>/cli-harness/`
6. Return `HarnessVerdict` (VERIFIED / NOT_VERIFIED / INCONCLUSIVE)

## 4. Artifacts [R5.3]

| File | Content |
|------|---------|
| `output.log` | Captured stdout+stderr |
| `exit-code.txt` | Process exit code |
| `verdict.md` | Three-State Verdict |
| `controllers-attempted.json` | Tier attempts + reasons [R5.8] |

## 5. Progress Reporting [R5.4]

When `controllerUsed === "cmux"` and verification > 5s: call `set-progress` / `log` / `notify` every 5s. Other tiers skip this.

## 6. Graceful Degradation [R5.8]

All tiers fail → `verdict: INCONCLUSIVE` + record `controllersAttempted` array. Never throws.

## 7. Command Registration

Registered in `commands/tinkerman.md` as `--cli` flag for `forge-test`.

## Constraints

- **No new dependencies** [R5.9]: tmux via `child_process.spawn`; node-pty via optional `require()`
- `package.json` must not gain new entries

## Gotchas
- **Terminal escape codes**: CLI output contains ANSI codes → output comparison fails → strip escape codes before assertion
- **Timing sensitivity**: CLI takes time to start → assertion runs before output ready → use timeout-based polling, not fixed sleep
- **Process cleanup**: CLI process not killed after test → port/resource leak → always clean up in teardown
