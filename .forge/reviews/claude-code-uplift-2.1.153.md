---
topic: "claude-code-uplift-2.1.153"
date: "2026-05-28"
result: "blocked"
reviewed_at_commit: "84fa43ed1f73e17fd737bc0ab9ca2ac2d78c1ff4"
p0_count: 3
p1_count: 7
p2_count: 10
p3_count: 4
methodology: "subagent-parallel"
layers:
  - spec-check
  - quality-check
  - security-check
---

# Review Report: claude-code-uplift-2.1.153

## Summary

3-layer review via parallel subagents. **Ship blocked** — 3 P0 + 7 P1 findings require fix before ship.

## Severity Distribution

| Severity | Count | Ship Impact |
|----------|-------|-------------|
| **P0** | 3 | **BLOCKS SHIP** |
| **P1** | 7 | **BLOCKS SHIP** |
| P2 | 10 | Advisory |
| P3 | 4 | Informational |

---

## Layer 1 — Spec Alignment (spec-check)

### P0 Findings

**S-1 | P0 | hooks-created-but-not-registered**
5 new hook scripts created but **not registered in `plugin.json`** — they will never execute at runtime:
- `scripts/message-display-hook.mjs` (MessageDisplay)
- `scripts/pre-compact-hook.mjs` (PreCompact)
- `scripts/cwd-changed-hook.mjs` (CwdChanged)
- `scripts/file-changed-hook.mjs` (FileChanged)
- `scripts/postooluse-inject-warnings.mjs` (PostToolUse)

Covering requirements: R2, R13, R16, R15. Without plugin.json registration, these hooks are inert.

**S-2 | P0 | exec-form-and-if-conditions-unimplemented**
Task 14 (R8) requires >=80% hooks converted from `command` string to exec form `args[]` + `if` conditions. Only 1 of 20+ hooks uses exec form. Zero `if` conditions anywhere. Test file `test/contract/hook-exec-form.test.ts` does not exist.

**S-3 | P0 | mcp-tool-hooks-unimplemented**
Task 16 (R14) requires converting forge-context-calling hooks to `type: "mcp_tool"`. Zero `"type": "mcp_tool"` entries in plugin.json. Test file `test/contract/mcp-tool-hook.test.ts` does not exist.

### P1 Findings

**S-4 | P1 | bin-scripts-incomplete**
Task 12 (R12) lists 3 bin scripts: forge-doctor, forge-status, forge-restate. Only forge-doctor exists. Missing: `forge-status`, `forge-restate`.

**S-5 | P1 | compatibility-doc-missing**
`docs/claude-code-compatibility.md` (Task 18 CREATE) does not exist.

**S-6 | P1 | hook-design-principles-not-updated**
`.claude/rules/hook-design-principles.md` (Task 18 MODIFY) not changed in diff.

**S-7 | P1 | readme-not-updated**
`README.md` (Task 19 MODIFY) not changed in diff — missing compatibility section + bin command list.

### P2 Findings

**S-8 | P2 | hook-exec-form-test-missing** — `test/contract/hook-exec-form.test.ts` not created.
**S-9 | P2 | mcp-tool-hook-test-missing** — `test/contract/mcp-tool-hook.test.ts` not created.

---

## Layer 2 — Code Quality (quality-check)

### P1 Findings

**Q-1 | P1 | readstdin-duplicated**
`readStdin()` function (~30 lines) duplicated verbatim across 4+ hook scripts (message-display-hook, postooluse-inject-warnings, cwd-changed-hook, file-changed-hook). Extract to `scripts/lib/hook-stdin-reader.mjs`.

**Q-2 | P1 | nesting-depth-gte-4**
`checkContextBoundary()` in `postooluse-inject-warnings.mjs` reaches 5+ nesting levels. Flatten with early returns.

**Q-3 | P1 | pathmatchesrule-semantic-bug**
`pathMatchesRule()` in `postooluse-inject-warnings.mjs:260-287` uses naive `glob.split("*")[0]` that fails for multi-level wildcards. Should delegate to the existing `globMatches()` function in the same file.

### P2 Findings

**Q-4 | P2 | frontmatter-parser-duplicated** — YAML frontmatter parsing reimplemented 5+ times. Extract to `scripts/lib/frontmatter-parser.mjs`.
**Q-5 | P2 | normalisepath-reimplementation** — `normalisePath()` reimplements `node:path.normalize()`.
**Q-6 | P2 | unsafe-type-cast** — `as DispatchMode` cast before validation in `agents-dispatcher.ts:67-69`.
**Q-7 | P2 | dead-verbosity-patterns** — `VERBOSITY_PATTERNS` in message-display-hook.mjs logged but never affects behavior.
**Q-8 | P2 | double-config-read** — `parseFrozenPaths` reads config.md twice per invocation.
**Q-9 | P2 | inconsistent-config-reading** — Different config reading patterns across hooks.

### P3 Findings

**Q-10 | P3 | unnecessary-async** — `setGoal()`/`clearGoal()` are async but do nothing async.
**Q-11 | P3 | magic-string** — `"release-"` branch prefix hardcoded in cwd-changed-hook.
**Q-12 | P3 | marketplace-install-type** — `install.type: "git"` may not be recognized by Claude Code marketplace.

---

## Layer 3 — Security (security-check)

### P2 Findings

**X-1 | P2 | incomplete-path-normalization**
`checkFrozenZone()` in `postooluse-inject-warnings.mjs:232` does not resolve `..` or symlinks. `normalisePath()` exists but is only used in `resolveImportContext`, not in frozen-zone check.

**X-2 | P2 | path-traversal-readfilestatus**
`readFileStatus()` reads arbitrary paths from `tool_input.file_path` without validating they fall within `projectRoot`.

### P3 Findings

**X-3 | P3 | agent-args-sanitization** — `buildAgentArgs` passes values unsanitized (mitigated by `execFile`).
**X-4 | P3 | redos-risk-globmatches** — `globMatches()` builds regex from user-defined patterns (low risk: developer-controlled input).

### Positive Security Controls

- All child process calls use `execFile`/`execFileSync` (no shell injection)
- stdin size limits enforced (256KB)
- stdin timeouts enforced (100ms)
- Hooks fail open (exit 0 on error)
- No hardcoded secrets
- `disallowedTools` frontmatter correctly restricts agents

---

## Known-Failures Append

```yaml known-failure
pattern_id: hooks-created-but-not-registered
severity: P0
first_seen_commit: 84fa43ed
signature: "5 hook scripts created without corresponding plugin.json entries — hooks are inert at runtime"
fix_required: "Add hook entries to plugin.json for MessageDisplay, PreCompact, CwdChanged, FileChanged, PostToolUse"
```

```yaml known-failure
pattern_id: exec-form-and-mcptool-requirements-unimplemented
severity: P0
first_seen_commit: 84fa43ed
signature: "Tasks 14 (R8) and 16 (R14) have zero implementation — no exec form, no if conditions, no mcp_tool type"
fix_required: "Implement exec form for >=80% hooks with if conditions, implement mcp_tool type for forge-context hooks"
```
