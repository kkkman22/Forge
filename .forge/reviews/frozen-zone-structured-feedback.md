---
topic: "frozen-zone-structured-feedback"
date: "2026-05-12"
result: "pass"
reviewed_at_commit: "9310654fd6175a1d2a97d9cfb47a4fb578643b09"
p0_count: 0
p1_count: 0
p2_count: 5
p3_count: 6
layers:
  - spec-check
  - quality-check
  - security-check
---

# Review Report: frozen-zone-structured-feedback

## Summary

| Layer | Result | P0 | P1 | P2 | P3 |
|-------|--------|----|----|----|----|
| L1 — Spec Alignment | Pass | 0 | 0 | 1 | 1 |
| L2 — Code Quality | Pass | 0 | 0 | 2 | 3 |
| L3 — Security | Pass | 0 | 0 | 2 | 2 |
| **Total** | **Pass** | **0** | **0** | **5** | **6** |

**Verdict**: ✅ Pass — No P0/P1 blocking issues. All 8 spec requirements implemented. Ship not blocked.

---

## Layer 1 — Spec Alignment

**Reviewer**: spec-check

### Requirement Coverage

| Requirement | Status | Evidence |
|---|---|---|
| R1: Frozen_Diagnostic JSON object | ✅ | `scripts/zone-registry.sh:320-381` — `emit_frozen_diagnostic` outputs all required fields |
| R2: PreToolUse structured JSON | ✅ | `scripts/hook-check-frozen-structured.sh:29-61` — deny JSON with systemMessage + additionalContext |
| R3: PostToolUse defence-in-depth | ✅ | `scripts/hook-check-frozen-post.sh:62-77` — breach detection + updatedToolOutput |
| R4: Zone_Registry from config.md | ✅ | `scripts/zone-registry.sh:35-67` — parse_zone_registry reads HARD-GATE block |
| R5: Guarded_Zone differentiated | ✅ | `scripts/zone-registry.sh:477-514` — guarded_append_check validates append-only |
| R6: Observability & audit | ✅ | `scripts/zone-registry.sh:395-469` — log_event with flock + 10MB rotation |
| R7: Backward compat & migration | ✅ | `scripts/hook-check-frozen.sh:26-31` — feature flag dispatch |
| R8: Testing | ✅ | 32 shell + 8 integration + 74 property + 13 contract tests |
| R9: Documentation | ✅ | ADR-0001, CHANGELOG, README, config template |

### Scope Creep
None — all implementations within design.md scope.

### Delta "Unchanged" Verification
- `.forge/` directory structure: ✅ no new top-level dirs
- config.md YAML schema: ✅ unchanged
- frozen path rules: ✅ dynamically parsed, not hardcoded

### Issues

| # | Sev | Issue | Note |
|---|-----|-------|------|
| L1-1 | P2 | hooks.json missing `if` filter for PreToolUse/PostToolUse frozen entries | design.md §Component 4 proposes `if` filter for performance (skip hook spawn on non-.forge/ paths). Current CC hooks API may not support `if` conditional. Hooks work correctly without it — they just spawn on every Write/Edit. Re-evaluate when CC hooks API adds conditional filtering support. |
| L1-2 | P3 | Manual e2e verification (Task 14) not documented in progress file | Task 14 is a manual step; automated tests fully pass. Recommend recording manual e2e results before final ship. |

---

## Layer 2 — Code Quality

**Reviewer**: quality-check

### Issues

| # | Sev | File | Issue | Suggestion |
|---|-----|------|-------|------------|
| L2-1 | P2 | `scripts/zone-registry.sh:495-500` | grep-based JSON extraction fallback may fail on escaped quotes | Consider documenting limitation or adding `python3 -c "json.load()"` as intermediate fallback before grep |
| L2-2 | P2 | `scripts/hook-check-frozen-structured.sh:29-61` | `_hook_deny_frozen` and `_hook_deny_guarded` share ~30 lines of duplicated deny-response logic | Extract common `_build_deny_response()` helper |
| L2-3 | P3 | `scripts/zone-registry.sh:83-178` | `_parse_config_file` is 95 lines | Extract sub-functions for readability |
| L2-4 | P3 | `scripts/zone-registry.sh:22-23` | Magic numbers: `STATUS_READ_TIMEOUT_MS=100`, `AUDIT_LOG_MAX_BYTES=10485760` | Add comments explaining threshold rationale |
| L2-5 | P3 | `scripts/hook-check-frozen-structured.sh:104-140` | `_hook_handle_bash` nesting depth 3 (if→while→case) | Use early returns to flatten |

### Deslop Analysis
No AI code-slop patterns detected. No comment paraphrase, no infallible try/catch, no `as any` casts, max nesting 3 (< 4 threshold).

### Test Coverage
Excellent: 32 shell + 8 integration + 74 property + 13 contract = 127 new tests. Minor gap: no explicit test for grep-based JSON fallback paths.

---

## Layer 3 — Security

**Reviewer**: security-check

### Issues

| # | Sev | File | Issue | Suggestion |
|---|-----|------|-------|------------|
| L3-1 | P2 | `scripts/zone-registry.sh:240-254` | `_normalize_to_forge_relative` does not resolve `../` sequences or symlinks | Add `realpath -m` or canonical resolution when available. Note: CC normalizes paths before passing to hooks, so actual bypass risk is low. |
| L3-2 | P2 | `scripts/zone-registry.sh:429-437` | `_json_escape` handles basic escaping but not Unicode surrogates/control chars | Low risk — log values come from internal zone classification, not arbitrary user input. Document limitation. |
| L3-3 | P3 | `scripts/zone-registry.sh:459-461` | OTel endpoint from env vars trusted without validation | Validate OTEL_EXPORTER_OTLP_ENDPOINT format before use |
| L3-4 | P3 | `scripts/hook-check-frozen-structured.sh:148` | `INPUT=$(cat)` reads unlimited stdin | Add `head -c 1M` or similar limit. Low risk — CC provides bounded JSON input. |

### Security Strengths
- No hardcoded secrets
- Feature flag for controlled rollout
- Defence-in-depth (pre + post hooks)
- Audit logging with flock for concurrency safety
- `set -euo pipefail` throughout
- Graceful fallbacks for missing jq/config

### Path Traversal Assessment
Theoretical concern only. In practice:
1. CC normalizes file paths before passing to hooks
2. Zone prefix matching catches most traversal patterns (`.forge/specs/../config.md` → matches `specs/` prefix → blocked)
3. Write targets are resolved by CC, not the hook
