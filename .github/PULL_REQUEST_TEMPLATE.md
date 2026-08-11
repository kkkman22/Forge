## Summary

<!-- Brief description of changes (1-3 sentences) -->

## Related Issues

<!-- Link to related issues: Closes #123, Refs #456 -->

## Changes

<!-- List key changes -->

-

## Test Coverage

- [ ] `npm run check` passes
- [ ] New `src/` functions have property tests (`*.property.test.ts`)
- [ ] Contract tests pass (`test/contract.test.ts`)

## Breaking Changes

<!-- If yes, describe migration path -->

- [ ] No breaking changes

## Checklist

- [ ] Commit messages follow Conventional Commits
- [ ] No modifications to frozen files (`.tinkerman/specs/*/spec.md`, `.tinkerman/plans/*.md`) without unlock
- [ ] New SKILL or agent files are synced to `.claude/` directory

## Skill Changes (if applicable)

- [ ] New or modified SKILL.md 包含 `## 2. Prerequisites` / `## 3. Workflow` / `## 4. Deliverable` 三段骨架
- [ ] 若不适用，已在 frontmatter 声明 `deliverable_exempt: true` 或 `skeleton_exempt_legacy: true` 并在描述中解释理由
- [ ] `bash scripts/validate-skill-skeleton.sh` 通过
- [ ] `node scripts/validate-skill-descriptions.mjs` 通过
