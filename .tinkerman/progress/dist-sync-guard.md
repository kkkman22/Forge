# Build Progress: dist-sync-guard

## Plan
`.tinkerman/plans/dist-sync-guard.md` (approved)

## Tasks

- [x] Task 1: 类型定义与路径映射函数
- [x] Task 2: detectDrift 纯函数
- [x] Task 3: 路径映射单元测试
- [x] Task 4: detectDrift 单元测试 (merged into Task 3)
- [x] Task 5: Property test（round-trip）
- [x] Task 6: CLI 驱动 — check-dist-sync.mjs
- [x] Task 7: package.json check 脚本集成
- [x] Task 8: dist-resync.sh
- [x] Task 9: package.json dist:resync script
- [x] Task 10: CONTRIBUTING.md 章节
- [x] Task 11: evolved-rules R6
- [x] Task 12: CI workflow 验证
- [x] Task 13: 全量回归验证
- [x] Task 14: Smoke test

## Commits

1. `1e7c492` feat(dist-sync): add path mapping, DriftReport types, and unit tests
2. `9b96d64` test(dist-sync): add round-trip property tests with fast-check
3. `03158f4` feat(dist-sync): add check-dist-sync CLI with drift detection
4. `e753746` feat(dist-sync): integrate check-dist-sync into npm run check
5. `1af524e` feat(dist-sync): add dist-resync convenience script
6. `6ec4641` docs(contributing): add dist/ Sync Requirement section
7. `6a96cac` feat(evolved-rules): add R6 src/dist sync guard rule
8. `5ca8200` ci: add Verify dist sync step to CI workflow
9. `eb9639d` style: fix biome formatting in dist-sync tests
10. `ccc874c` style: fix import ordering in property test
11. `7766fd5` style: fix biome formatting in dist-sync.ts
12. `ec31643` fix(dist-sync): handle non-interactive no-arg invocation in dist-resync
13. `327b7ee` fix(dist-sync): remove --sourceMap false from check to avoid false mismatches

## Summary

- 21 unit/property tests (18 unit + 3 property), all green
- 3 pre-existing test failures unrelated to this change
- dist-sync check: OK — 31 src files matched with dist/
