---
updated: 2026-08-11
---
# Mutation Testing Frameworks Reference

## Stryker.js Configuration

Forge 使用 Stryker.js 作为 mutation testing 引擎。

### Generated Config Schema

```json
{
  "$schema": "https://raw.githubusercontent.com/stryker-mutator/stryker/master/packages/api/schema/stryker-core.json",
  "mutate": ["src/domain/folio/**/*.ts"],
  "testRunner": "vitest",
  "coverageAnalysis": "perTest",
  "reporters": ["json", "html", "clear-text", "progress"],
  "jsonReporter": { "fileName": "reports/mutation/stryker-report.json" },
  "htmlReporter": { "fileName": "reports/mutation/index.html" },
  "vitest": {}
}
```

### Key Stryker Options

| Option | Default | Description |
|--------|---------|-------------|
| `mutate` | From pack | Files to mutate |
| `testRunner` | `vitest` | Test runner integration |
| `coverageAnalysis` | `perTest` | Speed optimization |
| `thresholds.high` | 100 | Score above = clean exit |
| `thresholds.low` | 0 | Score below = error exit |
| `timeoutMS` | 5000 | Per test timeout |
| `maxConcurrentTestRunners` | auto | Parallelization |

### Score Calculation

```
mutation_score = killed / (killed + survived) × 100

Excluded from denominator:
- NoCoverage (not reached by tests)
- RuntimeError (invalid mutant)
- Timeout (infinite loop)
```

### Artifact Format

Written to `.forge/mutation/<timestamp>.md`:

```yaml
---
timestamp: "2026-05-10T00:00:00Z"
pack_source: "pms"
targeted_globs:
  - "src/domain/folio/**/*.ts"
total: 234
killed: 210
survived: 18
no_coverage: 3
runtime_errors: 3
mutation_score: 91.7
threshold: 85
verdict: "pass"
duration_ms: 28500
---
```

## Alternative Frameworks

If Stryker.js integration with vitest proves unstable, consider:

1. **Stryker custom mutator**: Implement domain-specific mutators (e.g., currency arithmetic, date boundary)
2. **Inverto**: Lightweight AST-level mutator for targeted mutation
3. **Gremlins.js**: For runtime-level chaos testing (complementary, not replacement)
