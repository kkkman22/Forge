---
name: forge-test
description: "测试引擎。三层验证（单元测试、浏览器 QA、7 项完成前验证清单）。"
disable-model-invocation: true
---

# /forge test — Test Engine

> **Trigger**: Step 4 of Standard path, Step 6 of Full path, or user input `/forge test`
> **Responsibility**: Systematic three-layer verification ensuring code passes at unit test, browser QA, and pre-completion checklist levels
> **Output Path**: `.forge/progress/<topic>.md`（update verification status）

---

## 1. Overview

`/forge test` 通过三层验证（单元测试 → 浏览器级 QA → 完成前验证清单）对 build 和 review 阶段的产出进行系统化验证。每一层都有明确的通过标准，最终以 7 项完成前验证清单作为交付门禁。

**验证铁律**：没有运行验证命令 = 不能声明通过。→ 遵循 CLAUDE.md §2.3 验证铁律。拒绝"应该可以了"、"看起来没问题"、"和之前一样的逻辑"等非验证声明。唯一接受的完成证据是验证命令的实际输出。

---

**Not For**：
- 纯文档更新
- 无行为影响的静态内容变更

## 2. Three-Layer Verification

### Layer 1 — Unit Tests

**职责**：运行项目测试套件，确认所有测试通过且输出干净。

**执行步骤**：

1. Detect project test framework and run command (from `package.json`, `Makefile`, `Cargo.toml` etc.)
2. Run full test suite using `forge_exec` for server-side output trimming. When MCP is unavailable, fall back to direct execution or `scripts/run-with-trim.sh`.
3. Check test output: all tests pass (zero failures), no warnings (or only known ignorable warnings), no errors.

**通过标准**：

```
✅ Layer 1 — 单元测试通过
  运行命令：npx vitest run
  结果：42 tests passed, 0 failed, 0 skipped
```

**未通过时**：报告失败的测试详情，请修复后重新运行 `/forge test`。

### Layer 2 — Browser-Level QA (Conditional)

**触发条件**：仅当项目为 Web 项目时执行。判定信号：`package.json` 含前端框架依赖、项目中存在 `.html`/`.tsx`/`.jsx`/`.vue`/`.svelte` 文件、`config.md` 的 `stack` 含前端技术。

**执行步骤**：读取 Spec 场景汇总表 → 对每个涉及用户交互的场景模拟操作 → 截图记录 → 对比实际行为与预期。

```
✅ Layer 2 — 浏览器级 QA 通过
  场景 S1：选择"最近 7 天"并导出 — ✅ 文件下载成功
  场景 S2：筛选结果为空 — ✅ 显示"没有符合条件的订单"
```

**非 Web 项目**：`ℹ️ Layer 2 — 浏览器级 QA 跳过（非 Web 项目）`

### Layer 3 — Pre-Completion Checklist

**职责**：逐项检查 7 项完成前验证清单，确保所有交付条件满足。

**CI 检查命令优先级**：

执行 Layer 3 清单前，读取 `.forge/config.md` YAML frontmatter 的 `ci_check_command` 字段：
- **如果非空**：使用 `forge_exec` 执行该命令（server-side trimming）。当 MCP 不可用时，回退到 `scripts/run-with-trim.sh` 或直接执行。覆盖清单项 1-4。从合并输出中提取各项通过/失败状态。
- **如果为空或缺失**：为每个清单项分别运行对应命令（优先使用 `forge_exec`）。

**7 项清单**：

| # | Check Item | Verification Method |
|---|-----------|-------------------|
| 1 | **Tests just ran** | Covered by CI command if ci_check_command exists; otherwise run test command separately |
| 2 | **All tests pass** | Extract from CI output or check test output for zero failures |
| 3 | **Type check passes** | Extract from CI output or run `tsc --noEmit` or equivalent |
| 4 | **Lint passes** | Extract from CI output or run eslint/biome or equivalent |
| 5 | **Acceptance criteria confirmed item by item** | Compare against Spec scenario summary table, each scenario has corresponding pass evidence |
| 6 | **No leftover TODO/FIXME** | Scan changed files, no new TODO/FIXME/HACK/XXX |
| 7 | **Progress updated** | All tasks in `.forge/progress/<topic>.md` marked as completed |

**清单输出格式**：

```
📋 完成前验证清单

ℹ️ 使用 ci_check_command: npm run check

✅ 1. 测试刚运行过（CI 命令在本次会话 14:35 运行）
✅ 2. 所有测试通过（42/42）
✅ 3. 类型检查通过（tsc --noEmit：0 errors）
✅ 4. Lint 通过（biome check：0 errors, 0 warnings）
✅ 5. 验收标准逐条确认（5/5 场景通过）
✅ 6. 无遗留 TODO/FIXME（扫描 6 个变更文件：0 个遗留项）
✅ 7. Progress 已更新（5/5 任务完成）

✅ 验证通过。下一步：/forge ship
```

**任一项未通过**时，报告具体未通过项和错误详情，阻断 ship。

---

## 3. Verification Iron Rule

→ 遵循 CLAUDE.md §2.3 验证铁律。声称工作完成却没有验证，不是效率，是不诚实。

### 3.1 Verification Gate Function

```
1. 识别：什么命令能证明这个声明？
2. 运行：执行完整命令（新鲜的、完整的）
3. 阅读：完整输出，检查退出码，计数失败项
4. 验证：输出是否确认了声明？否 → 陈述实际状态；是 → 带证据陈述
5. 然后才能：做出声明

跳过任何一步 = 在撒谎，不是在验证
```

### 3.2 Common False Claims Reference

| Claim | Required Evidence | Not Evidence |
|-------|------------------|-------------|
| "Tests pass" | Test command output: 0 failures | Previous run results |
| "Lint is clean" | Lint output: 0 errors | Partial checks, inference |
| "Build succeeds" | Build command: exit 0 | Lint passes, logs look normal |
| "Bug is fixed" | Test the original symptom: passes | Code was changed |
| "Requirements met" | Item-by-item checklist comparison | Tests pass ≠ requirements met |

### 3.3 Red Flags — Stop Immediately

出现以下任何信号时**停下来先运行验证**：使用"应该"、"大概"、"看起来"；验证前表达满意；准备提交但没跑验证；信任 Subagent 成功报告；依赖部分验证；疲劳了想赶紧结束。

### 3.4 Rationalization Excuses Rebuttal

| Excuse | Reality |
|--------|---------|
| "Should be fine" | Run the verification command |
| "I'm confident" | Confidence ≠ evidence |
| "Just this once" | No exceptions |
| "Lint passed" | Lint ≠ compiler ≠ tests |
| "Tests passed last time" | Last time doesn't count, code may have changed |

### 3.5 Reject Citing Previous Test Results

即使上一步刚运行过测试，如果之后有任何代码变更，测试结果已过期。必须重新运行。

### 3.6 Verification Commands Must Exist

如果项目没有配置测试命令、类型检查命令或 Lint 命令，不能跳过对应清单项，而是提示配置。

---

## 4. Gate: Tests Not Passed → Block `/forge ship`

**阻断条件**：Layer 1 未通过 或 Layer 3 任一项未通过。

**放行条件**：Layer 1 通过 + Layer 3 所有 7 项通过。Layer 2（浏览器级 QA）为辅助验证，不阻断 ship。

---

## 5. Execution Flow

1. **前置检查**：`.forge/` 目录存在？有代码变更？有测试配置？
2. **Layer 1**：运行项目测试套件。失败 → 停止
3. **Layer 2**：Web 项目执行浏览器级 QA，否则跳过
4. **Layer 3**：逐项检查 7 项清单
5. **输出结果**：汇总三层验证结果，更新 Progress

---

## 6. Edge Cases

| Condition | Handling |
|-----------|----------|
| No test framework | ⚠️ 未检测到测试框架。Layer 1 无法执行 |
| Test timeout (>5 min) | ⚠️ 可能原因：未关闭的异步操作、数据量过大、死循环 |
| Some checklist items unverifiable | Mark as "unverifiable" not "passed", suggest configuring the corresponding tool |
| No `.forge/` directory | ⚠️ 请先运行 forge init |

---

## 7. Examples

### Example: All Passed

```
$ /forge test

━━━ Layer 1 — 单元测试 ━━━
运行：npx vitest run
结果：42 tests passed, 0 failed ✅

━━━ Layer 2 — 浏览器级 QA ━━━
ℹ️ 非 Web 项目，跳过

━━━ Layer 3 — 完成前验证清单 ━━━
✅ 1-7 全部通过

✅ 验证通过。下一步：/forge ship
```

### Example: Layer 1 Failed

```
$ /forge test

━━━ Layer 1 — 单元测试 ━━━
运行：npx vitest run
结果：40 tests passed, 2 failed ❌

失败的测试：
1. ExportService > should handle async export
2. ExportRoute > should return 400 for invalid date

❌ Layer 1 未通过。请修复后重新运行 /forge test。
```
