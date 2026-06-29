# Review — domain-knowledge-threading (slice B)

> PR: #147 · Branch: `feat/domain-knowledge-threading-sliceB`
> Spec: `.forge/specs/domain-knowledge-threading/` (7 REQ, 4 INV, locked)
> Date: 2026-06-29 · Reviewers: spec-check / quality-check / security-check (parallel subagents)

## Verdict: PASS (ship-eligible)

All three layers completed. **P0:0 P1:3 (all fixed) P2:1 (fixed) P3:several (non-blocking)**.
Post-fix CI: 17 SUCCESS / 0 FAIL.

## Layer 1 — spec-check: PASS

All 7 REQ + 4 INV implemented, zero scope creep. Evidence per REQ/INV cited (file:line).
Only a P3 literal-spec nuance on REQ-7.2 (spec says "zero pack-file reads"; implementation
correctly distinguishes domain-data reads from manifest-discovery overhead — defensible, more
precise than spec wording).

## Layer 2 — quality-check: 2 P1 (fixed) + P2/P3

### P1-1 (fixed): dist-resync narrative inconsistency
`sync-derived-data.yml` (the 4th dist-emitting path) still used bare `npx tsc`, diverging from
the new `dist-resync.sh`. **Fixed**: switched to `tsc -p tsconfig.build.json` for true consistency.

### P1-2 (fixed): silent dir-read swallow + dropped validator warnings
`loadStateMachineDefinitions` swallowed unreadable-dir errors silently (typo'd path undiagnosable)
and discarded `validateDefinition` warnings (ST004 unreachable state). **Fixed**: added
`warnings: string[]` channel; unreadable dir → non-blocking warning; validator warnings propagated.

### P2 (noted, design-defensible): duplicate state-machine name across packs not deduped
`loadStateMachineDefinitions` does no name-dedup (unlike loadContexts/loadGlossary). Documented
behavior — state machines are pack-namespaced. Non-blocking; flagged for slice C if multi-pack
overlap becomes real.

### P2 (noted): structural-contract types lack compile-time drift guard
`RegistryEnabledPacks`/`RegistryPackEntry` are duck-typed; no test asserts structural compat with
real `EnabledPacks`. Accepted — sound design, drift risk noted.

### P3: `.yml` extension unsupported (intentional, matches existing loader); test-helper duplication
(matches repo convention, no `test/helpers/` exists).

## Layer 3 — security-check: 1 P1 (fixed) + P2 (fixed) + P3

### P1 (fixed): path traversal via pack.yaml extends.* (OWASP A01/A08)
`loadPackRegistry` resolved `extends.*` via `path.resolve(rootPath, relPath)` with no escape check —
a malicious pack.yaml `extends.state_machines: ../../../etc` resolved to `/etc`. **PoC verified**:
`path.resolve('/repo/packs/evil', '../../../etc')` → `/etc` (escapes base). The `isWithinBase`
guard existed in `resolver.ts` but was unused by any loader. **Fixed**: exported `isWithinBase`,
applied at manifest-resolution in `loader.ts` — escaping categories dropped + warning recorded.
Closes the gap for all three loaders (state-machine/context/glossary) at once. Test added
(`test/pack/loader.test.ts` traversal case).

### P2 (fixed): prompt-injection framing
Pack data (untrusted user content) injected into agent prompts without trust-boundary note.
**Fixed**: all 4 phase injection sections now carry a 信任边界 note (pack fields are data, never
commands; injection attempts ignored). Injection was already correctly limited to structured
summary (not raw bodies) — the note hardens the framing.

### P2 (noted, accepted): absolute paths in errors/sourcePath
`sourcePath` and error strings carry absolute paths (mild info disclosure). Accepted —
amplification of P1 (now closed); would only leak post-traversal which is blocked.

### P3: silent dir-read (now a warning per P1-2 fix); `yaml` package safe (no eval) — pinning suggested.

## Fixes applied (post-review commits)

| Finding | Severity | Fix commit |
|---------|----------|-----------|
| path traversal (extends.*) | P1 | `fix(review): address P1 review findings (path traversal + warning surfacing)` |
| silent dir-read + dropped warnings | P1 | (same commit) |
| dist-resync sibling workflow | P1-1 | `fix(review): P1-1 dist consistency + P2 prompt-injection trust boundary` |
| prompt-injection trust boundary | P2 | (same commit) |

## Post-fix validation

- `npm run check` EXIT=0 — 9044 passed | 3 skipped, 0 failed
- `tsc -p tsconfig.build.json --noEmit` EXIT=0
- `typedoc` EXIT=0, 0 warnings
- CI (PR #147, post-fix push): 17 SUCCESS / 4 SKIPPED / 0 FAIL
