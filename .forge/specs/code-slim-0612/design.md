---
feature: code-slim-0612
title: 全项目代码精简与重构 — Design
tier: full
work_nature: refactor
adr: ADR-0008
---

# Design — 精简策略与约束

> 本设计锚定 ADR-0008。spec 描述行为与策略，不描述具体实现细节（具体删哪个函数由 plan/build 阶段经 grep+entry 双向核验后决定）。

## 1. 精简策略（平衡档）

仅允许四类改动：
1. **删铁定死代码**（如 deprecated.ts，唯一 caller 是测试）
2. **删幂等 barrel re-export**（`export *` 已覆盖的显式 re-export）
3. **删经 grep + entry 双向核验的未引用 export**（R10）
4. **合并签名/语义完全同构的纯函数**（R12，真删一边；签名不同者剔除）

每类改动以 `tsc --noEmit && vitest run` 为安全网，子任务结束 `dist:resync`。

## 2. 关键约束（来自 decide Critic 修正）

| 约束 | 来源 | 含义 |
|------|------|------|
| scripts/ 是 dist 真实 consumer | Critic #1 | check-frozen/init/bump-version 等 10+ 脚本直 `import dist/src/*.js`；src 路径不得移动/重命名（INV-3） |
| 测试是重构对象 | Critic #2 | `barrel-file.test.ts:185` 的 export 数断言随精简更新；改前核公开 API 契约 ADR；非"测试绝对不动" |
| 去重仅限同构函数 | Critic #3 | 3 套 `parseGitLog` 签名/语义不同，剔除出范围；不新增 adapter 层 |
| deprecated.ts 是真死代码 | Critic #4 | 152 行 shim，契约到期，纳入 REQ-1 |

## 3. 安全边界（Security 视角）

精简 PR 必查：
- diff 中删除 `throw/reject/deny/normalize/allowlist/case` 的行 → 逐行确认等价替换存在，否则 P1
- diff 中新增 `exec(\`/execSync(string` → 禁止（命令注入）
- 安全测试不在删除范围（INV-4）

去重陷阱：两实现一严一松必须留严的（`*-parity.test.ts` 防的就是此漂移）。

## 4. 风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| 误删安全 chokepoint | 中 | INV-2 + review 差量扫描 |
| dist 同步遗漏 | 中 | 每子任务 `npm run dist:resync` + check-dist-sync（R6） |
| barrel 测试魔数遗忘 | 中 | REQ-2 AC-2.2 显式列为本任务改动项 |
| src 路径漂移破坏 scripts | 中 | INV-3，禁止跨模块移动文件 |
| 隐性行为回归 | 中 | 626 测试 + tsc 双重门禁（R11），不改测试断言的行为预期 |

## 5. 验证策略

每个子任务（feature 分支）：
1. `npx tsc --noEmit` — 类型回归
2. `npx vitest run` — 行为回归（626 测试）
3. `npm run dist:resync` — dist 同步（R6）
4. `npm run check` — 全量门禁（tsc+biome+vitest+readme-metrics）

## 6. 回滚策略（Reversibility）

- 每个子任务独立 feature 分支 → 可独立 revert，不影响其他
- 挂载点：无新增配置/迁移/数据，精简纯删除/合并 → 回滚=git revert 该分支
- deprecated.ts 删除若引发兼容投诉：可从 git 历史恢复（契约已到期，恢复属例外）
