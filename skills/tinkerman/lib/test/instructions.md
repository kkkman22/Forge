---
description: "Use when user runs `/tinkerman test`, after build completes, or needs verification that behavior matches the locked spec"
updated: 2026-08-11

dispatch_mode: fork
allowed_tools:
  - Read
  - Bash
  - Write
---

# /tinkerman test — Test Engine

> **Trigger**: Step 4 of Standard path, Step 6 of Full path, or user input `/tinkerman test`
> **Responsibility**: Systematic three-layer verification ensuring code passes at unit test, browser QA, and pre-completion checklist levels
> **Output Path**: `.tinkerman/progress/<topic>.md`（update verification status）and `.tinkerman/artifacts/<run-id>/<artifact-id>.json`（immutable `test` evidence）

---

## 1. Overview

`/tinkerman test` 通过三层验证（单元测试 → 浏览器级 QA → 完成前验证清单）对 build 和 review 阶段的产出进行系统化验证。每一层都有明确的通过标准，最终以 7 项完成前验证清单作为交付门禁。

**验证铁律**：没有运行验证命令 = 不能声明通过。→ 遵循 CLAUDE.md §2.3 验证铁律。拒绝"应该可以了"、"看起来没问题"、"和之前一样的逻辑"等非验证声明。唯一接受的完成证据是验证命令的实际输出。TDD 验证规则详见 ../build/references/tdd-rules.md。

---

**Not For**：
- 纯文档更新
- 无行为影响的静态内容变更

### §1.5 Pre-flight: Branch Gate

调用 `runBranchGate({ skill: "test", mode, currentBranch, currentTask, pendingDeliveries, alreadyCheckedThisPhase, isCleanTree })`：
- `passed` / `skipped` → 继续后续 §
- `auto_fixed` → 输出 `✅ 已自动切换到 <newBranch>` 后继续
- `blocked` → 中止 skill，按 mode 输出对应提示
- `warned` → 输出警告但继续

默认严重度：block。可通过 `severityOverride` 覆盖。

## 2. Three-Layer Verification

### Layer 1 — Unit Tests

运行项目测试套件（`Bash` + trim fallback），确认 0 failures。未通过 → 报告详情，修复后重跑 `/tinkerman test`。

> **ADR-0006 layered routing**: 当 spec AC 声明 `Verify-By: vitest:unit` /
> `vitest:component` / `bash:contract` 时，对应的测试由 delegate runner 路由到项目的
> `test:unit` / `test:component` / `test:contract` 命令（Layer 1 即覆盖三层）。
> 项目无对应套件时 delegate 返回 `INCONCLUSIVE` + `/tinkerman init --recipe` 指引，
> 而非静默跳过。组件层脚手架（MSW/vitest）由 recipe 生成到用户项目，Forge 包零依赖（R6.5）。

### Layer 2 — Browser-Level QA (Conditional)

仅 Web 项目（检测前端框架/`.html`/`.tsx`/`.vue` 等）。读取 Spec 场景 → 模拟操作 → 截图 → 对比预期。非 Web → 跳过。

### Layer 3 — Pre-Completion Checklist

**职责**：逐项检查 7 项完成前验证清单，确保所有交付条件满足。

**CI 检查命令优先级**：

执行 Layer 3 清单前，读取 `.tinkerman/config.md` YAML frontmatter 的 `ci_check_command` 字段：
- **如果非空**：使用 `Bash` 执行该命令（server-side trimming）。当 MCP 不可用时，回退到 `scripts/run-with-trim.sh` 或直接执行。覆盖清单项 1-4。从合并输出中提取各项通过/失败状态。
- **如果为空或缺失**：为每个清单项分别运行对应命令（优先使用 `Bash`）。

**漂移检测**：

在读取 `ci_check_command` 之前，先调用 `detectCiCommandDrift(frontmatter, packageJsonRaw)` 判断漂移状态，按 `kind` 分支：

| `kind` | 处理 |
|--------|------|
| `has_ci_command` | 正常路径：使用 `ci_check_command` 值 |
| `drift_with_npm_check` | 输出 `warning` 文本 → 使用 `Bash` 执行 `npm run check` → 在 `.tinkerman/findings/<topic>-ci-drift.md` 记录漂移（仅首次） |
| `no_check_no_field` | 走原有逐项回退（清单项 1-4 分别执行） |
| `malformed_package_json` | 输出 `reason` 警告 → 走逐项回退 |

所有分支均不阻断 ship。漂移仅是质量信号。

**7 项清单**：

| # | Item | Method |
|---|------|--------|
| 1 | Tests just ran | CI command or separate run |
| 2 | All tests pass | CI output or test output: 0 failures |
| 3 | Type check passes | CI output or `tsc --noEmit` |
| 4 | Lint passes | CI output or eslint/biome |
| 5 | Acceptance criteria confirmed | Item-by-item vs Spec scenario table |
| 6 | No leftover TODO/FIXME | Scan changed files |
| 7 | Progress updated | All tasks in progress file completed |

任一项未通过 → 报告详情，阻断 ship。

---

## 3. Verification Iron Rule

→ 遵循 CLAUDE.md §2.3。核心逻辑：识别命令 → 运行 → 阅读输出 → 验证声明 → 然后才能声明。

### 3.1 Verification Gate

1. 识别：什么命令能证明声明？ 2. 运行完整命令 3. 阅读完整输出+退出码 4. 输出确认声明？否→陈述实际；是→带证据声明 5. 然后才能声明

### 3.2 Common False Claims

| Claim | Required | Not Evidence |
|-------|----------|-------------|
| "Tests pass" | Test output: 0 failures | Previous results |
| "Lint clean" | Lint output: 0 errors | Inference |
| "Build succeeds" | Build: exit 0 | Logs look normal |
| "Bug fixed" | Symptom test passes | Code was changed |
| "Requirements met" | Item-by-item comparison | Tests ≠ requirements |

---

### 3.5 Compaction Recovery Check

IF 本次执行是从 conversation summary 恢复（上下文压缩后继续），THEN：
1. 重新读取本 SKILL.md 完整内容
2. 确认 §2 Three-Layer Verification 的测试执行命令与 SKILL 定义一致
3. 确认 §3 Verification Iron Rule 检查已执行
4. 从中断点继续执行

正常流程（无 compaction）忽略此段落。

---

## 4. Gate: Tests Not Passed → Block `/tinkerman ship`

**阻断条件**：Layer 1 未通过 或 Layer 3 任一项未通过。

**放行条件**：Layer 1 通过 + Layer 3 所有 7 项通过。Layer 2（浏览器级 QA）为辅助验证，不阻断 ship。

---

## 5. Execution Flow

1. **前置检查**：`.tinkerman/` 目录存在？有代码变更？有测试配置？
2. **Layer 1**：运行项目测试套件。失败 → 停止
3. **Layer 2**：Web 项目执行浏览器级 QA，否则跳过
4. **Layer 3**：逐项检查 7 项清单
5. **输出结果**：调用 `persistTestEvidenceArtifact()` 写入 immutable `test` artifact；汇总三层验证结果，更新 Progress，并在最终输出中引用 artifact id
6. **自动推进（铁律）**：通过后**立即调用** `Skill(skill="forge", args="ship")`，不输出确认提示。仅输出 `✅ test 完成 → 自动进入 ship`，然后直接调用 Skill（→ 详见 shared/next-step-protocol.md）。未通过 → 停止，输出失败详情。

---

## 6. CLI Harness (`--cli`) [R5.1]

**Flag**: `/tinkerman test --cli`

Triggers CLI/TUI external verification harness. Automatically triggered when:

- `package.json` has non-empty `bin` field, OR
- `--cli` flag is explicitly passed, OR
- `.tinkerman/config.md` has `cli_harness: true`

Execution: delegates to `../control-cli/` which selects the best available tier (project > cmux > tmux > node-pty). Output written to `.tinkerman/findings/<topic>/cli-harness/`.

**UI variant**: `/tinkerman test --ui` delegates to `../control-ui/` for web/Electron testing.

## 7. Edge Cases

| Condition | Handling |
|-----------|----------|
| No test framework | ⚠️ 未检测到测试框架。Layer 1 无法执行 |
| Test timeout (>5 min) | ⚠️ 可能原因：未关闭的异步操作、数据量过大、死循环 |
| Some checklist items unverifiable | Mark as "unverifiable" not "passed", suggest configuring the corresponding tool |
| No `.tinkerman/` directory | ⚠️ 请先运行 /tinkerman init |

---

## 8. Examples

```
$ /tinkerman test
━━━ Layer 1 — 单元测试 ━━━  npx vitest run → 42/42 ✅
━━━ Layer 2 — 浏览器级 QA ━━━  非 Web 项目，跳过
━━━ Layer 3 — 完成前验证清单 ━━━  ✅ 1-7 全部通过
✅ 验证通过 | evidence_artifact_id: <artifact-id> → /tinkerman ship
```

**Failing variant**: Layer 1 → 2 failed · 列出失败测试名 · ❌ 修复后重跑 /tinkerman test。

## Common Rationalizations

| 合理化 | 反驳 |
|---|---|
| "测试通过了就不测了" | 通过不代表覆盖所有场景，边界条件和集成路径常被遗漏 |
| "这个改动很小，不需要测试" | 小改更容易引入意外副作用，轻量路径也要求验证 |
| "CI 会帮我测" | CI 是最终验证不是开发反馈，本地快速验证能节省大量时间 |

## Read Dedup Iron Law

<IRON-LAW name="read-dedup">

在同一个 session 中对同一文件的 Read 调用**不得超过 2 次**。

- **第 2 次起**：必须使用 `Grep`（定向搜索）或 `Grep`（结构化分析，文件原文不进上下文）替代完整 Read。
- **回顾已读文件**：使用 Grep 搜索特定片段而非全量重读。

> 注：历史上的 `Grep_cached`（Read 去重缓存）已移除——其职责由 Headroom 的对话压缩间接覆盖。本 Iron Law 的"Read ≤2 次"纪律仍然有效：减少源头输入比压缩更省 token。

</IRON-LAW>

### Test 后 Context Budget 检查

Test 完成后，如果后续还有 ship 阶段且 Read 预算 >50KB（`${TMPDIR}/tinkerman-read-budget-<session>.json`），输出：

`⚠️ Read budget >50KB after test. Suggest /clear + /tinkerman resume before ship phase.`

## Gotchas
- **Test tests nothing**: Test asserts trivial condition (always true) → passes but verifies nothing → each test must assert meaningful behavior
- **Mock overuse**: Every dependency mocked → test passes but production fails → prefer real dependencies, mock only external services
- **Flaky by design**: Test depends on timing or order → intermittent failures → tests must be deterministic
- **Rationalization excuses**: Agent skips test with "this is trivial" → untested code → follow anti-rationalization table strictly

## Package Verification Evidence

When execution packages exist, `/tinkerman test` MUST include package verification evidence in its input summary and final report. Independent verification checks may use a saved workflow backend, but the final Layer 1 and Layer 3 gate verdict remains owned by Forge test.
