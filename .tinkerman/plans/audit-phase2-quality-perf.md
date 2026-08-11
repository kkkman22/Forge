# Plan: audit-phase2-quality-perf

> Status: approved | Tier: standard | Branch: forge/audit-phase2-quality-perf

## Scope

4 items from PROJECT_AUDIT_REPORT.md Phase 2/3 (P2-3 fetch timeout already done — only fetch call in harness-cdp.ts:26 has AbortSignal.timeout):

1. **T1 — Sync I/O migration** (knowledge-hooks.ts 33 ops + spec-bundle-io.ts 15 ops)
2. **T2 — Path traversal hardening** (forge-read-cached.ts prefix attack + audit other MCP tools)
3. **T3 — Config validation unification** (make Zod schema default, remove env-var gate)
4. **T4 — Algorithm optimization** (detectDrifts O(n²)→O(n), checkContradictions O(n²)→O(n), findMentionedTerms)

All tasks are independent — no cross-dependencies.

---

## T1: Sync I/O Migration

### Files
- `src/knowledge-hooks.ts` — 33 sync ops across 10 functions
- `src/spec-bundle-io.ts` — 15 sync ops in loadSpecBundle + writeSpecBundle

### Approach
Convert all sync `fs` calls to `fs.promises` equivalents. Functions become async; callers already in async context.

**knowledge-hooks.ts** changes:
- `computeInputFilePaths` → async (4 ops: existsSync×2, readdirSync×2)
- `dispatchCatalogRebuild` → async (3 ops: mkdirSync, writeFileSync + calls to readPatterns etc.)
- `dispatchIntegrityLint` → async (3 ops: mkdirSync, writeFileSync + buildIntegrityInput)
- `dispatchCatalogFreshnessCheck` → async (5 ops: existsSync×2, statSync×2 + recursive calls)
- `readPatterns`, `readSolutions`, `readFailures`, `readRules` → async (each has existsSync + readFileSync)
- `buildIntegrityInput` → async (8 ops: existsSync×3, readdirSync×3, readFileSync×3)
- `tryRead` → async (existsSync + readFileSync)
- Fix `(e as Error).message` → `e instanceof Error ? e.message : String(e)` (3 occurrences: lines 182, 203, 216)

**spec-bundle-io.ts** changes:
- `loadSpecBundle` → async (11 ops: existsSync×5, readFileSync×5)
- `writeSpecBundle` → async (4 ops: mkdirSync, writeFileSync×3)

**Import changes:**
- `import { existsSync, ... } from "node:fs"` → `import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"`
- `existsSync(path)` → `access(path).then(() => true, () => false)` or try/catch pattern
- `readFileSync` → `readFile`, `writeFileSync` → `writeFile`, etc.

### Tests
- Existing tests in `test/knowledge-hooks.test.ts` and `test/spec-bundle-io.test.ts` should pass after migration
- TDD: Write one failing test that calls the async version, then migrate

---

## T2: Path Traversal Hardening

### Files
- `src/mcp/tools/forge-read-cached.ts` — line 127 has prefix attack vulnerability
- `src/mcp/tools/forge-read.ts` — already hardened in Phase 1, verify shared utility extraction

### Issue
`forge-read-cached.ts:127`: `!resolvedPath.startsWith(root.path)` is vulnerable to prefix collision.
Example: root=`/home/user/proj`, path=`../proj2/file` → resolved=`/home/user/proj2/file` → passes check.

### Approach
1. Extract `validatePaths()` from forge-read.ts into a shared utility (e.g., `src/mcp/tools/path-validator.ts`)
2. Replace both forge-read.ts and forge-read-cached.ts with shared utility
3. Add tests for the prefix attack case

### Tests
- Test prefix collision: `validatePaths(["../proj2/file"], "/home/user/proj")` → rejects
- Test symlink escape (document as known limitation)
- Test normal paths still pass

---

## T3: Config Validation Unification

### Files
- `src/schemas/config-file.ts` — Zod schema (already exists)
- `src/config-store.ts` — imports safeParseConfigFile but gates behind env var

### Approach
1. Find all usages of `FORGE_USE_ZOD_PARSER` env var gate
2. Make Zod validation the default path (remove env var gate)
3. Keep legacy path as fallback only when Zod throws unexpectedly
4. Ensure `safeParseConfigFile` is called at all config read sites

### Tests
- Verify config parsing still works with and without Zod
- Test invalid config fields are properly reported

---

## T4: Algorithm Optimization

### Files
- `src/feature-dossier.ts` — `detectDrifts` (lines 428-443)
- `src/knowledge-integrity.ts` — `checkContradictions` (lines 196-224)
- `src/grill.ts` — `findMentionedTerms` (lines 196-226)

### Approach

**detectDrifts** — O(n²) → O(n):
- Current: pairwise compare all topics
- Optimized: Group by `stripTrailing(topic)` and `stripPlural(topic)` using Map. Only compare within same group.
- Result: O(n) for grouping + O(k²) within groups where k << n

**checkContradictions** — O(n²) → O(n×m):
- Current: pairwise compare all patterns
- Optimized: Pre-build inverted index from tag → patterns. Only compare patterns sharing ≥1 tag.
- Result: Dramatic reduction in comparisons for sparse tag spaces

**findMentionedTerms** — Already well-optimized:
- Uses `indexOf` and `Set` for dedup
- Minor: pre-compute lowercase aliases once (currently lowercased per comparison)
- Result: Small constant-factor improvement, not algorithmic change

### Tests
- Existing tests in feature-dossier.test.ts, knowledge-integrity.test.ts, grill.test.ts
- Add performance test with large input to verify O(n) scaling

---

## Execution Order

| Task | Depends on | Risk | Est. files |
|------|-----------|------|-----------|
| T2 (path traversal) | None | Low | 3 |
| T4 (algorithm opt) | None | Low | 3 |
| T3 (config unification) | None | Low | 2-3 |
| T1 (sync I/O) | None | Medium | 2+callers |

T1 last because it has the widest blast radius (caller chain updates). T2 and T4 are safest — go first.
