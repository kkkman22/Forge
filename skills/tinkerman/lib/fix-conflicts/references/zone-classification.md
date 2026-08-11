---
updated: 2026-08-11
---
# Zone Classification Reference

## Priority Chain (first match wins)

1. **Frozen**: `.forge/config.md`, `.forge/specs/*/spec.md` (status=locked), `.forge/plans/*.md` (status=approved)
2. **Guarded**: `.forge/progress/**`, `.forge/reviews/**`, `.forge/knowledge/instincts.md`, `.forge/knowledge/known-failures.md`, `.forge/knowledge/solutions/**`, `.forge/decisions/ADR-*.md`
3. **Open**: Other `.forge/**` files
4. **Source**: Non-`.forge/` paths

Implementation: `src/conflict-classifier.ts`
