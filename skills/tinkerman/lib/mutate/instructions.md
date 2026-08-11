---
updated: 2026-08-11
description: "Use when running `/tinkerman mutate`, verifying test quality after a build, or checking mutation score against threshold"
context: fork
pack_conditional:
  required_flag: mutation_critical_modules
  rationale: "Stryker mutation testing only has ROI against pack-declared critical modules"
  fallback_message: "forge-mutate requires a pack declaring mutation_critical_modules. Enable a pack (e.g. pms) that declares this feature flag."
dispatch_mode: fork
allowed_tools:
  - Read
  - Bash
---

# /tinkerman mutate — Mutation Testing Engine

> **触发方式**：`/tinkerman mutate run [<target-glob>]` / `/tinkerman mutate kill-survivors` / `/tinkerman mutate report`
> **职责**：评估测试套件捕获 bug 变异的能力，而非仅看覆盖率

---

## 1. Overview

Mutation testing 通过故意引入语法变异（如 `>=` → `>`、`true` → `false`），观察测试套件能否捕获这些 bug，评估测试有效性。三层验证模型：

| 层级 | 问题 | 覆盖工具 |
|------|------|---------|
| WHAT | 代码存在吗？ | Coverage |
| HOW | 代码正确吗？ | Unit/Integration Tests |
| REAL? | 测试真的能抓 bug 吗？ | **Mutation Testing** |

**Not For**：无 enabled pack 声明 mutation_critical_modules 的项目 / 测试套件未 green 的项目

## 2. Prerequisites

- 至少一个 enabled pack 声明 `feature_flags.mutation_critical_modules`
- 测试套件已通过（green state）
- `@stryker-mutator/core` 和 `@stryker-mutator/vitest-runner` 已安装

## 3. Subcommands

### `/tinkerman mutate run [<target-glob>]`

执行 mutation testing。流程：
1. Union 所有 enabled packs 的 `mutation_critical_modules`（dedupe）
2. 可选 `--threshold <N>` 覆盖默认阈值
3. 生成临时 `stryker.conf.json`
4. Spawn Stryker，捕获 JSON 输出
5. 计算 mutation_score = killed / (killed + survived) × 100
6. 判定 verdict（Sprint 2: pass/warn, 不 fail）
7. 写 artifact 到 `.tinkerman/mutation/<timestamp>.md`

### `/tinkerman mutate kill-survivors`

分析上一次运行中 survived 的 mutants，输出建议修复清单。

### `/tinkerman mutate report`

读最新 mutation artifact，输出摘要。

## 4. The 8 Core Mutation Categories

| Category | Example Mutant | What It Tests |
|----------|---------------|---------------|
| Arithmetic | `+` → `-`, `*` → `/` | 算术边界条件 |
| Comparison | `>=` → `>`, `==` → `!=` | 不等式判断 |
| Equality | `===` → `!==` | 相等性断言 |
| Boolean | `true` → `false` | 布尔逻辑分支 |
| Conditional | `if` → `else` | 条件分支覆盖 |
| Constant | 常量替换 | 魔法数字检测 |
| Return Value | 返回值变异 | 调用者断言 |
| Void Method | 删除方法体 | 副作用验证 |

## 5. Integration with /tinkerman ship

ship 门禁读最新 mutation artifact：
- `verdict: fail`（Sprint 3+）→ 阻断 ship
- `verdict: warn`（Sprint 2）→ notice，不阻断
- 无 artifact → 跳过（mutation testing 是 opt-in）

## 6. Examples

```bash
# 对所有声明的关键模块运行
/tinkerman mutate run

# 指定额外 glob
/tinkerman mutate run "src/domain/folio/**/*.ts"

# 覆盖阈值
/tinkerman mutate run --threshold 90

# 查看 survived mutants 建议
/tinkerman mutate kill-survivors
```

→ Stryker 配置细节和备选框架详见 references/frameworks.md

## Gotchas
- **Mutation score illusion**: Score high because mutants are trivial (change true→false) → real bugs still escape → use meaningful mutation operators
- **Slow mutation run**: Full suite with mutations → 10x runtime → run against critical modules only, not full codebase
- **False positives**: Mutant killed by unrelated test → score inflated → ensure each test targets specific behavior
