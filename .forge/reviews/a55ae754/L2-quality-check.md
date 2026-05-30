## Layer 2 — Code Quality

| # | Severity | File:Line | Issue | Suggestion |
|---|----------|-----------|-------|------------|
| 1 | P1 | `scripts/knowledge-hook-dispatch.mjs:77` | `JSON.parse(json)` on raw CLI arg with no try-catch — crash on malformed input | Wrap in try-catch |
| 2 | P2 | `scripts/knowledge-hook-dispatch.mjs:123-138` | `writeEventCache` grows unbounded on every PostToolUse event | Add eviction/size limit |
| 3 | P2 | `scripts/record-evolved-rule-violation.mjs:108` | `writeFileSync` missing `mode: 0o600` — inconsistent with other cache writes | Add `{ mode: 0o600 }` |
| 4 | P2 | `test/scripts/knowledge-cache.test.ts` + `rule-violations-cache.test.ts` | Tests only verify path resolution, not actual cache write/read behavior | Add integration tests |
| 5 | P2 | `scripts/knowledge-hook-dispatch.mjs:109-111` | Unnecessary single-use wrapper `getKnowledgeCachePath()` | Inline or remove |
| 6 | P3 | `scripts/knowledge-hook-dispatch.mjs:11` | Unused import `statSync` | Remove |
| 7 | P3 | `scripts/inject-evolved-rules.mjs:148,161` | Duplicated `if (cacheFilePath)` guard | Consolidate |
| 8 | P3 | `scripts/lib/plugin-data-path.mjs:1` | Misleading shebang on library module | Remove shebang |

<!-- REPORT_START -->
## Layer 2: quality-check Review

### P0 Issues
None

### P1 Issues
- **P1-1**: Unhandled `JSON.parse(json)` on raw `--event` CLI argument in `knowledge-hook-dispatch.mjs:77`. Malformed JSON causes unhandled SyntaxError crash, inconsistent with fail-silent design in `--from-path` branch.

### P2 Issues
- **P2-1**: Unbounded cache growth in `writeEventCache` — every PostToolUse appends with no eviction.
- **P2-2**: Missing `mode: 0o600` on `writeFileSync` in `record-evolved-rule-violation.mjs:108`.
- **P2-3**: Shallow integration tests for knowledge-cache and rule-violations-cache (path-only, no runtime behavior).
- **P2-4**: Unnecessary single-use wrapper `getKnowledgeCachePath()` in knowledge-hook-dispatch.mjs.

### P3 Issues
- **P3-1**: Unused import `statSync` in knowledge-hook-dispatch.mjs.
- **P3-2**: Duplicated `if (cacheFilePath)` guard in inject-evolved-rules.mjs.
- **P3-3**: Misleading shebang on library module plugin-data-path.mjs.

### Summary
One P1 (unhandled JSON.parse crash), four P2 (unbounded cache, missing file permissions, shallow tests, unnecessary wrapper), three P3 (unused import, duplicated guard, misleading shebang).
<!-- REPORT_END -->

<!-- review-final -->
