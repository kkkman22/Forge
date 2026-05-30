## Layer 2: quality-check Review

### Summary
No P0/P1 issues. One P2 concern around dotted-key compatibility in `read_field`. Three P3 cosmetic/style observations. The diff is primarily a docs/config change with a clean shell script guard pattern.

### Findings
| # | Severity | Category | File:Line | Description |
|---|----------|----------|-----------|-------------|
| 1 | P2 | correctness | scripts/persistent-loop.sh:378 | `read_field` called with dotted key `build.use_goal`. Function may not natively support dot-delimited keys if it parses via grep/awk. Commit 6d044908 fixed key name but parsing concern remains unverified. |
| 2 | P3 | naming | .forge/config.md:32 | Config key `build.use_goal` uses dot notation, inconsistent with project's `snake_case` convention (e.g., `ci_check_command`, `postooluse_inject_warnings`). |
| 3 | P3 | readability | skills/forge/lib/build/instructions.md:115 | Mixed language in same paragraph: English routing sentence followed by Chinese topology description. |
| 4 | P3 | clarity | skills/forge/lib/build/instructions.md:129-130 | References to `TaskGet`/`TaskUpdate` as bare identifiers without clarifying origin (MCP tool? CLI? internal function?). |

### Severity Counts
p0: 0, p1: 0, p2: 1, p3: 3

<!-- review-final -->
