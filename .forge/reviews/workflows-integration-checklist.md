---
topic: workflows-integration
review_commit: c5ad6505bb2037031239bdde00f6bee04ff7ee73
total_p0: 0
total_p1: 15
status: open
---

# P0/P1 Fix Checklist — workflows-integration

| ID | Severity | File:Line | Issue | Status |
|----|----------|-----------|-------|--------|
| F1 | P1 | `src/forge-loop-cli.ts:30,504` | Drop runtime `import { startup }` + `await startup(...)`; replace with `runWarmUp` (R5.5) | unfixed |
| F2 | P1 | `src/forge-loop-cli.ts` | Replace `agentRegistry.resolve('claude')` with `ClaudeCliAgentAdapter` (R5.1–5.9) | unfixed |
| F3 | P1 | `src/forge-loop-cli.ts` (commander block) | Register `--no-warmup` flag; call `runWarmUp({skip:opts.noWarmup})` (R9) | unfixed |
| F4 | P1 | main loop | Wrap iteration with `runIterationWithErrorControl` (R10.1–10.4) | unfixed |
| F5 | P1 | (cleanup hook) | Implement `.forge/runs/<runId>/cleanup-errors.jsonl` + worktree/PID/sleep-prevent cleanup (R10.5) | unfixed |
| F6 | P1 | `.github/workflows/cross-version-regression.yml` | Add cross-version regression workflow (R13.5) | unfixed |
| F7 | P1 | `src/workflow-dispatcher.ts` | 429 listener → dynamic degradation 6→3→2→1 → env injection (R12.5) | unfixed |
| F8 | P1 | `tool-health.md` writer | flock advisory lock + 5-process concurrent append safety test (R12.7) | unfixed |
| F9 | P1 | `src/cli-agent-adapter.ts:71-78` | Iterate `msg.content` as array of blocks (text). Add real-fixture test | fixed |
| F10 | P1 | `cli-agent-adapter.ts:64-118` + `warm-up-runner.ts:75-130` + `loop-error-controller.ts:128-155` | Attach `child.on("error", reject)` on every spawn; ENOENT injection test | fixed |
| F11 | P1 | `workflow-audit-writer.ts:89-99` vs `workflow-dispatcher.ts:54-71,172-178` | Single source of truth for `dispatch.jsonl` schema; contract test on every line | fixed |
| F12 | P1 | `loop-error-controller.ts:96-108` | Track stuck-timer firing in `runOnce`; introduce `retry_exhausted` signature; correct `l0_failure_signature` mapping | fixed |
| F13 | P1 | `workflow-audit-writer.ts:53-65` | Validate/slugify `ctx.topic`/`ctx.runId` against `/^[a-zA-Z0-9._-]{1,64}$/`; assert `dest.startsWith(forgeRoot)` | fixed |
| F14 | P1 | `workflow-dispatcher.ts:215-222,173` | Validate `runId` at dispatcher boundary; resolve absolute path, assert containment under `forgeRoot/runs/` | fixed |
| F15 | P1 | `cli-subprocess-driver.ts:99-113` | Implement true env allowlist (start `{}`; copy `FORWARDED_ENV` + `PATH`/`HOME`/`USER`); negative test for non-whitelisted var | fixed |

## Status flow

`unfixed` → `in-progress` → `fixed` → `verified`

`/forge ship` blocks until **all** entries reach `verified`.
