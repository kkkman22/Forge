## Layer 3 — Security & Risk

| # | Severity | File:Line | Issue | Suggestion |
|---|----------|-----------|-------|------------|
| 1 | P2 | `scripts/knowledge-hook-dispatch.mjs:134` | Cache write without restrictive file mode (`writeFileSync` missing `mode: 0o600`). | Add `{ mode: 0o600 }` to `writeFileSync` calls in `writeEventCache()` and `persistViolations()`. |
| 2 | P2 | `scripts/knowledge-hook-dispatch.mjs:77` | `JSON.parse(json)` on raw `--event` CLI argument without size limit. | Add a max byte-length check on `json` before parsing. |
| 3 | P2 | `scripts/inject-evolved-rules.mjs:150` | Cache JSON parsed without schema validation. Potential prompt injection via tampered cache. | Validate `cached.rules` is a string and `cached.sourceMtimeMs` is a number before using. |
| 4 | P2 | `scripts/knowledge-hook-dispatch.mjs:113-121` | `readKnowledgeCache()` returns parsed JSON without schema validation. | Validate returned structure is a plain object before assigning properties. |
| 5 | P3 | `scripts/record-evolved-rule-violation.mjs:84-101` | Violation cache accumulates without bound. No TTL or max entry count. | Add max entry count with FIFO eviction. |
| 6 | P3 | `scripts/knowledge-hook-dispatch.mjs:123-138` | Knowledge cache grows per event key with no eviction. | Add max key count with LRU-style eviction. |

<!-- REPORT_START -->
## Layer 3: security-check Review

### P0 Issues
None

### P1 Issues
None — previous P1 issues (path traversal in `getCachePath()` and unsanitized `CLAUDE_PLUGIN_DATA` env var) are **adequately fixed**.

### P2 Issues
- **P2-1**: `knowledge-cache.json` written without `mode: 0o600` — inconsistent with `evolved-rules-cache.json` which correctly uses restrictive mode.
- **P2-2**: `JSON.parse(json)` on `--event` CLI argument without size limit.
- **P2-3**: Cache JSON in `inject-evolved-rules.mjs:150` parsed without schema validation — prompt injection risk.
- **P2-4**: `readKnowledgeCache()` returns unvalidated JSON structure.

### P3 Issues
- **P3-1**: Violation cache grows without bound.
- **P3-2**: Knowledge cache grows per unique event key without eviction.

### Summary
Previous P1 path traversal and env var injection issues are adequately fixed. Remaining issues are P2 (missing file modes, no JSON validation, potential prompt injection) and P3 (unbounded cache growth). No hardcoded secrets, no SQL/command injection, no unsafe dependencies.
<!-- REPORT_END -->

<!-- review-final -->
