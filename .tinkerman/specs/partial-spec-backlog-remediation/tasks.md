---
feature: partial-spec-backlog-remediation
layout: tasks
created: 2026-06-07
spec_ref: ".tinkerman/specs/partial-spec-backlog-remediation/requirements.md"
format: lightweight
---

# Plan — Partial Spec Backlog Remediation

## File Mapping

| File | Action | Tasks |
|------|--------|-------|
| hooks/hooks.json | MODIFY | T1 |
| dist-plugin/hooks/hooks.json | MODIFY | T1 |
| test/contract.test.ts | MODIFY | T1 |
| src/cleanup-chain.ts | MODIFY | T2 |
| test/cleanup-chain.test.ts | MODIFY | T2 |
| test/forge-resume/resume-phase-coverage.test.ts | CREATE | T3 |
| .tinkerman/docs/partial-spec-satisfaction.md | MODIFY | T4 |
| .tinkerman/specs/INDEX.md | REGENERATE | T5 |

## Dependency Graph

```text
T4 ──────────────┐
T1 ─┐            │
T2 ─┼── T5 ──────┼── final check
T3 ─┘            │
```

---

## T1: Hook manifest registrations

- **REQ**: REQ-01, REQ-02, REQ-03
- **HITL/AFK**: AFK
- **dependsOn**: []

### RED

1. Extend `test/contract.test.ts` with a manifest helper that reads both `hooks/hooks.json` and `dist-plugin/hooks/hooks.json`.
2. Add failing assertions:
   - `ConfigChange` exists and points to `scripts/config-changed-hook.mjs`.
   - `PermissionDenied` exists and points to `scripts/permission-denied-hook.mjs`.
   - `WorktreeRemove` exists and points to `scripts/worktree-remove-hook.mjs`.
   - `TaskCreated`, `WorktreeCreate`, `StopFailure` remain present.

Run:

```bash
npx vitest run test/contract.test.ts
```

Expected: fails on missing events.

### GREEN

1. Add `ConfigChange`, `PermissionDenied`, `WorktreeRemove` event blocks to `hooks/hooks.json`.
2. Mirror the same blocks to `dist-plugin/hooks/hooks.json`.
3. Use only `args` arrays for new entries.

Run:

```bash
npx vitest run test/contract.test.ts test/config-changed-hook.test.ts test/hooks/permission-denied-hook.test.mjs test/hooks/worktree-hooks.test.mjs
```

### REFACTOR

1. Optionally migrate `TaskCompleted` to `args` if fallback paths are unnecessary.
2. Count manifest `command` / `args` entries and update `.tinkerman/docs/partial-spec-satisfaction.md` metric if changed.

---

## T2: cleanup-chain git timeout

- **REQ**: REQ-04
- **HITL/AFK**: AFK
- **dependsOn**: []

### RED

Add or extend a test in `test/cleanup-chain.test.ts` that fails unless `src/cleanup-chain.ts` calls git worktree remove with:

- `timeout: 30000`
- `killSignal: "SIGTERM"`

Run:

```bash
npx vitest run test/cleanup-chain.test.ts
```

Expected: fails before implementation.

### GREEN

Modify `src/cleanup-chain.ts` git call options:

```ts
{
  stdio: "pipe",
  timeout: 30000,
  killSignal: "SIGTERM",
}
```

Run:

```bash
npx vitest run test/cleanup-chain.test.ts
```

### REFACTOR

Keep existing error capture behavior unchanged. Do not introduce async process management in this task.

---

## T3: resume phase coverage test

- **REQ**: REQ-05
- **HITL/AFK**: AFK
- **dependsOn**: []

### RED

Create `test/forge-resume/resume-phase-coverage.test.ts` with assertions that `skills/forge/lib/resume/instructions.md` includes:

- `.tinkerman/status.md` or `.tinkerman/status/`
- `.tinkerman/progress/`
- phase-specific resume behavior for `review`, `test`, and `ship`
- no instruction that resets active work to `plan` unconditionally

Run:

```bash
npx vitest run test/forge-resume/resume-phase-coverage.test.ts
```

Expected: fail if current instructions lack explicit coverage.

### GREEN

If needed, update `skills/forge/lib/resume/instructions.md` with concise phase coverage text.

Run:

```bash
npx vitest run test/forge-resume/resume-phase-coverage.test.ts
```

### REFACTOR

Keep test resilient: assert contracts and paths, not full paragraphs.

---

## T4: partial-spec satisfaction document update

- **REQ**: REQ-06
- **HITL/AFK**: AFK
- **dependsOn**: []

### RED

Use grep checks that fail against the old document:

```bash
rg "Superseded|不恢复|pms-pack-v1" .tinkerman/docs/partial-spec-satisfaction.md
```

### GREEN

Update `.tinkerman/docs/partial-spec-satisfaction.md` to:

- split items into A/B/C/D categories
- mark obsolete findings
- preserve evidence for actionable items
- link this spec as the execution follow-up

### REFACTOR

Keep the document as an assessment, not an implementation plan. Implementation detail belongs in this spec.

---

## T5: spec index and final verification

- **REQ**: all
- **HITL/AFK**: AFK
- **dependsOn**: [T1, T2, T3, T4]

### Steps

1. Run `node scripts/rebuild-spec-index.mjs --help`.
2. Run `node scripts/rebuild-spec-index.mjs`.
3. Run `node scripts/rebuild-spec-index.mjs --check`.
4. Run focused tests from T1-T3.
5. Run `npx tsc --noEmit`.
6. Run `npm run check` before ship.

### Commit

Make an atomic commit after verification:

```bash
git add .tinkerman/docs/partial-spec-satisfaction.md .tinkerman/specs/partial-spec-backlog-remediation .tinkerman/specs/INDEX.md
git commit -m "docs: add partial spec remediation plan"
```
