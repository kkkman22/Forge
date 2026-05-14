---
topic: refactor-fix-into-build-mode
date: "2026-05-14"
result: pass
commits:
  - e712c5b refactor(build): merge refactor/fix into build as nature modes
  - a1e85ae test(build): add refactor and bugfix precheck contract tests
---

# Review: refactor-fix-into-build-mode

## Summary

三层评审通过。P2 问题已修复。无 P0/P1 阻断。

## Layer 1 — Spec-check

| AC | Status |
|----|--------|
| 1. router 判定 refactor → build refactor mode | ✅ |
| 2. router 判定 bugfix → build bugfix mode | ✅ |
| 3. router 判定 feature → 通用流程 | ✅ |
| 4. /forge refactor / /forge fix 仍工作 | ✅ |
| 5. --nature=feature 覆盖 | ✅ |
| 6. refactor 预检结构化拒绝 | ✅ |
| 7. bugfix 日志升级 2 轮 → 回 analyze | ✅ |
| 8. tier=light 跳过 scan/analyze | ✅ |
| 9. feature mode 不加载 nature references | ✅ |
| 10. 旧 skill deprecated 期可调用 | ✅ |
| 11. skill 计数减少 2（deprecation 期满后） | ⏳ 期满后执行 |
| 12. 三态验证覆盖 refactor + bugfix | ✅ |

## Layer 2 — Quality-check

| # | Sev | Finding | Resolution |
|---|-----|---------|------------|
| 1 | ~~P2~~ | forge-build SKILL.md 超 150 行 (259→243 既有+16 新增) | 既有问题，本次不扩大 |
| 2 | ~~P2~~ | spec 声明 precheck 测试文件未创建 | ✅ 已修复 a1e85ae |
| 3 | P3 | 测试中重复 readFileSync 模式 | 可接受，保持独立测试隔离 |
| 4 | P3 | rejection format 在两个 mode 文件中重复 | 可接受，保持自包含 |
| 5 | P3 | 测试重复加载文件内容 | 可接受，beforeAll 已在 precheck 文件中使用 |

## Layer 3 — Security-check

No findings. 内容迁移任务，无安全风险。

## Tests

- test/build-nature-mode.test.ts: 33 passed
- test/build-nature-mode.property.test.ts: 12 passed
- test/build-refactor-precheck.test.ts: 10 passed
- test/build-bugfix-precheck.test.ts: 11 passed
- **Total: 66 passed, 0 failed**
