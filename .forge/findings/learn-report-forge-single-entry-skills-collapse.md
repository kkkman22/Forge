---
topic: forge-single-entry-skills-collapse
date: 2026-05-17
session_type: full-tier (decide → spec → plan → build → review → test → ship → learn)
runtime: kiro (decide/spec/plan/learn) + claude-code (build/review/test/ship)
verdict: needs-improvement
---

# Learn Report — forge-single-entry-skills-collapse

## G1: Execution Quality Scores

| Dimension | Score | Evidence |
|-----------|-------|----------|
| First-pass Rate | 65/100 | 12 fixup commits across Tasks 6/7/12 — migration scope creep dominant |
| Plan Accuracy | 75/100 | Plan covered 15 tasks + Wave 0 spike; Task 4 split into 4a/b/c/d during plan self-check (forecast); R2.8b condition reframed mid-spike (acceptable adaptation) |
| Review Interception | 80/100 | 2 P1 caught (P1-S1 mockLibContent, P1-S2 checkIntegrity stub) before ship; but 13 contract.test.ts dist-bundle assertions leaked to post-push verify |
| Debug Trigger Rate | 90/100 | 0 three-strike triggers; 0 architectural rollbacks; minor scope creep absorbed without spec rewrite |

**Overall verdict**: needs-improvement. Security-critical stubs (P1-S1, P1-S2) reached review unaddressed. 13 stale tests escaped pre-ship checks.

## G2.1: Problem Patterns

1. **Migration Scope Creep (recurring)** — Task 6 needed 5 fixup commits, Task 7 needed 3, Task 12 needed several. Pattern: large structural migrations surface integration issues that pure unit tests miss. Mitigation: integration tests gated before completion claim.

2. **Self-reported PASS without independent verification** — At least 5 instances (dispatcher-mode-flag fail count error, refs-cross-rewrite vacuous PASS, build-summary R1.2 premature pass, spec.md drift between .kiro/.forge copies, etc.). Mitigation: R9 (new evolved rule) + main agent re-runs commands.

3. **Stale assertions outside primary feature scope** — `test/contract.test.ts` dist-bundle assertions weren't in Task 11 file mapping but failed after migration. Mitigation: pre-ship `npx vitest run` covers entire suite; Task 11 should have grep-scanned all `forge-` references in test/ not just listed files.

## G2.2: Solutions (existing primary)

Refer to `.forge/knowledge/solutions/single-entry-dispatcher-collapse.md` for the full Dispatcher Chokepoint Pattern. **No new solution dimensions emerged from learn pass** — the existing solution doc captures the pattern adequately.

**Cross-reference added** (this learn pass): R8 ↔ solutions/single-entry-dispatcher-collapse.md ↔ ADR-0004.

## G2.3: Pitfall Records

1. **Stub returning success** (`{ ok: true }`) — reviewer cannot distinguish "passed check" from "skipped check" → R8 reinforced (confidence 0.85 → 0.9)

2. **Verdict claim without re-verification** — multiple instances of CC reporting completion contradicted by Kiro's spot checks → new R9 added

3. **In-place verdict amendment** — R1.2 build summary verdict went `pass` → `pass-pending-ship-cache-refresh` via in-place edit. Downstream reader (e.g., release notes generator) may miss the qualifier → R9 covers this

4. **Plugin cache staleness** (R1.2 manifestation) — v2.4.0 plugin cache showed 29 forge:forge-X long after structural migration → architecture-level pitfall, not coding bug; deferred to ship-time `claude plugin update`

## G2.4: Decision Rationale

- **Why PoC before plan A** — `Agent + Read("lib/instructions.md")` semantic equivalence to `context: fork` was unverified; running 3 V-tests on zoom-out (smallest fork skill) before committing to migration of 29 skills paid off — saved at least 1 day of wasted migration work if the pattern had failed.

- **Why dual-mode path resolution after spike** — `CLAUDE_PLUGIN_ROOT` is unset in dev mode; spec v1 assumed plugin install was default. Spike reframed R2.8 from blocker to dev-mode-only verification; R2.8b (plugin mode + silent shadow) deferred to ship phase. This was correct adaptation, not scope drift.

- **Why kiro+claude-code split** — dispatcher is broken for Skill(forge-X) routing, so /forge build self-host was impossible. Kiro for spec/plan/learn (no skill orchestration), Claude Code for build/review/test/ship (uses installed plugin v2.4.0). Pragmatic dogfood given the bug being fixed.

## G2.5: Reusable Patterns

1. **PoC-Before-Plan for unverified architectural assumptions** — 30-minute PoC validated Agent-as-fork before 60-90 minute migration. Rule of thumb: when plan depends on undocumented platform behavior, allocate 10% of plan budget to PoC.

2. **Dispatcher Chokepoint Pattern** — formalized in solutions doc. Applies to any N-to-1 entry point consolidation (not just skills).

3. **`update_after_lock` frontmatter for spec evolution** — preserves history of locked spec changes without "in-place amendment" anti-pattern. Reusable for any spec-locked workflow that needs post-lock corrections.

## G4: Pattern Lifecycle Recommendations

| Pattern | Frequency | Recommendation |
|---------|-----------|----------------|
| Stub-success-bypasses-control | 1 task, 2 instances | R8 already exists, bumped confidence to 0.9 |
| Self-PASS-without-verify | This task, 5+ instances | NEW R9 added (this commit) |
| Migration scope creep | 3 tasks affected | Watch list — promote to evolved rule if recurs in next 2 sessions |
| In-place verdict amendment | 1 instance | Covered by R9 |

## G5: Knowledge Base Health

| Check | Status |
|-------|--------|
| Rule count | 9/15 (room for ~6 more) |
| Stale entries (>5 sessions ago not triggered) | None — all rules have recent triggers |
| Cross-references missing | Added: R8 → solutions doc → ADR-0004 |
| Duplicate entries | None |
| Solutions doc coverage | single-entry-dispatcher-collapse.md captures full pattern; confidence raised to 0.9 |

## Action Items

| Priority | Action | Owner |
|----------|--------|-------|
| P0 | Bump R8 confidence 0.85→0.9, update Source field with cross-refs | (this commit) |
| P0 | Add R9 evolved rule for verdict-evidence discipline | (this commit) |
| P1 | Update solutions/single-entry-dispatcher-collapse.md confidence 0.85→0.9 | (next commit) |
| P2 | Watch for migration scope creep in next 2 task sessions; if recurs, promote to evolved rule | future |
| P3 | Consider adding `pre-ship full-suite scan` discipline to forge-ship SKILL (catch what Task 11 missed) | future |

## Connection to Forge Constitution

- §2.3 Verification Iron Law — R9 is direct enforcement
- §2.4 Three-Strike Reroute — not triggered this session (good signal)
- §3.1 Execution-Assessment Separation — confirmed working: review subagents caught what build agent missed
- §4.1 Capture on Completion — this learn report fulfills the obligation
