---
updated: 2026-08-11
---
# Refactor Mode — forge-build 内部分支

> 当 `work_nature=refactor` 时，build 进入 refactor mode。
> 行为等价原则：重构 = 改变结构，不改变行为。

## 1. Pre-flight Checks（7 项闸门）

任一命中 → 不得继续重构 → 结构化拒绝 → 回路由器。

| # | Check Item | Route on Hit |
|---|------------|-------------|
| 1 | **Behavioral change mixed in** | → Router re-classifies as feature or bugfix |
| 2 | **Target lacks test coverage** | → Add tests first (`/tinkerman build` to add test tasks) |
| 3 | **Cross-module** (3+ independent modules) | → Run `/tinkerman spec` for design first |
| 4 | **Purely stylistic** | → Configure lint/formatter rules |
| 5 | **Generated artifacts / third-party code** | → Fix the source (generator config or upstream dependency) |
| 6 | **Scope too large** (files affected > 15) | → Narrow scope, refactor in batches |
| 7 | **Nothing to change after scan** | → "Zero output is valid", `should_fully_stop: true` |

**Rejection**: `🚫 命中检查：<条目> 证据：<路径/分析> 建议：<路由> 重入：<条件>`

## 2. Scan Phase (refactor-scan)

**职责**：扫描代码库，识别优化点，按方法库分类，输出候选清单。

**产出**：`.tinkerman/findings/refactor-scan.md`

**流程**：
1. 读取任务描述，确定重构范围
2. 扫描目标代码，按方法库（→ references/refactor-method-library.md）L1-L4 分类识别候选
3. 为每个候选标注：位置（file:line）、当前问题、建议方法、预估影响、推荐等级（★/☆）
4. 输出候选清单

**Skip condition**: Tier=light 时跳过 scan，直接 apply。

## 3. Design Phase

为每个候选制定方案（方法名、步骤、验证、回滚），产出 refactor plan。Interactive 等批准；autonomous 自动批准。

**Skip condition**: Tier=light 时跳过 design，直接 apply。

## 4. Apply Phase (refactor-apply)

逐步执行，每步验证行为等价：
1. 操作 → 运行验证命令 → 通过继续 / 失败回滚
2. 全量测试 → 原子提交

每步一个方法库方法。Interactive 每步确认；autonomous 自动继续。

## 5. Tier=light 快速通道

**入场条件**：单文件重构、改动点 ≤ 3 处、目标文件有测试覆盖。

**流程**：跳过 scan/design，直接 apply → review。apply 根据任务描述执行，每步仍运行验证。

## 6. Phase 更新 + Commit 策略

| 当前阶段完成 | phase 更新为 |
|-------------|-------------|
| refactor-scan | refactor-apply |
| refactor-apply | review |

refactor-scan 不 commit（仅产出分析文档）；refactor-apply commit（产出代码变更）。

## 7. Edge Cases

- Scan 无候选 → `should_fully_stop: true`
- Apply 验证失败 → 回滚 + 记录 + 下一个
- 连续 3 步失败 → 停止，进入 three-strike

## Known AI Failure Modes

| Failure | Correct |
|---------|---------|
| 夹带行为改动 | 行为等价原则；需改行为的记入 findings/ |
| 不跑测试 | 每步操作后都运行验证命令 |
| 一次改太多 | 每步一个方法库方法 |
| 不用方法库命名 | 候选和方案必须标注方法名 |
