---
updated: 2026-08-11
---
# Zone Classification Reference

## Priority Chain (first match wins)

1. **Frozen**: `.tinkerman/config.md`, `.tinkerman/specs/*/spec.md` (status=locked), `.tinkerman/plans/*.md` (status=approved)
2. **Guarded**: `.tinkerman/progress/**`, `.tinkerman/reviews/**`, `.tinkerman/knowledge/instincts.md`, `.tinkerman/knowledge/known-failures.md`, `.tinkerman/knowledge/solutions/**`, `.tinkerman/decisions/ADR-*.md`
3. **Open**: Other `.tinkerman/**` files
4. **Source**: Non-`.tinkerman/` paths

Implementation: `src/conflict-classifier.ts`
