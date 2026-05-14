# Refactor Mode

> forge-build 内部分支模式。`work_nature=refactor` 时由 build SKILL 读取本文件。

## Pre-flight Checks

重构启动前必须逐条验证。**任一命中不得继续**。

| # | Check Item | Route on Hit |
|---|------------|-------------|
| 1 | **Behavioral change mixed in** | → Router re-classify as feature or bugfix |
| 2 | **Target lacks test coverage** | → Add tests first (`/forge build` to add test tasks) |
| 3 | **Cross-module** (3+ independent modules) | → Run `/forge spec` for design first |
| 4 | **Purely stylistic** | → Configure lint/formatter rules |
| 5 | **Generated artifacts / third-party code** | → Fix source (generator config or upstream) |
| 6 | **Scope too large** (files > 15) | → Narrow scope, batch |
| 7 | **Nothing to refactor after scan** | → "Zero output is valid", structural exit |

**Rejection**: `🚫 命中检查：<条目> 证据：<路径/分析> 建议：<路由> 重入：<条件>`

## Phases

### Scan (tier=standard/full)

扫描代码库，按方法库分类识别候选。产出 `.forge/findings/refactor-scan.md`。

流程：读任务描述 → 扫描目标 → 按方法库（→ refactor-method-library.md）L1-L4 分类 → 标注位置/问题/方法/影响/推荐 → 输出候选清单。

### Design (tier=standard/full)

为每个候选制定方案（方法名、步骤、验证、回滚），产出 `.forge/plans/refactor-<topic>.md`。

### Apply

逐步执行，每步验证行为等价：操作 → 验证 → 通过继续/失败回滚 → 全量测试 → commit。

Commit 策略：scan 不 commit；apply commit。

## Light Tier Fast-Track

**条件**：单文件、改动点 ≤ 3、目标有测试覆盖。

**流程**：跳过 scan/design，直接 apply。每步仍需运行验证。

## Phase Transitions

| 当前阶段完成 | phase 更新为 |
|-------------|-------------|
| refactor-scan | refactor-apply |
| refactor-apply | review |

## Behavioral Equivalence Principle

重构 = 改变结构，不改变行为。每一步都必须通过测试验证。如果测试不存在，先补测试再重构。

## Escape Hatch

- `--nature=feature` 显式覆盖 router 判定
- `/forge refactor` 子命令直接进入 refactor mode
- 预检不通过 → 结构化拒绝 → 回路由器
