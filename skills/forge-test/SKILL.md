---
name: forge-test
description: "Test behavior against the locked spec through property tests, unit tests, and integration smoke tests. Use when user runs `/forge test`, after build completes, or needs verification that behavior matches the locked spec."
skeleton_exempt_legacy: true
disable-model-invocation: true
---

# /forge test — Test Engine

> **Trigger**: Step 4 of Standard path, Step 6 of Full path, or user input `/forge test`
> **Responsibility**: Systematic three-layer verification ensuring code passes at unit test, browser QA, and pre-completion checklist levels
> **Output Path**: `.forge/progress/<topic>.md`（update verification status）

---

## 1. Overview

`/forge test` 通过三层验证（单元测试 → 浏览器级 QA → 完成前验证清单）对 build 和 review 阶段的产出进行系统化验证。每一层都有明确的通过标准，最终以 7 项完成前验证清单作为交付门禁。

**验证铁律**：没有运行验证命令 = 不能声明通过。→ 遵循 CLAUDE.md §2.3 验证铁律。拒绝"应该可以了"、"看起来没问题"、"和之前一样的逻辑"等非验证声明。唯一接受的完成证据是验证命令的实际输出。TDD 验证规则详见 ../forge-build/references/tdd-rules.md。

---

**Not For**：
- 纯文档更新
- 无行为影响的静态内容变更

## 2. Three-Layer Verification

### Layer 1 — Unit Tests

运行项目测试套件（`forge_exec` + trim fallback），确认 0 failures。未通过 → 报告详情，修复后重跑 `/forge test`。

### Layer 2 — Browser-Level QA (Conditional)

仅 Web 项目（检测前端框架/`.html`/`.tsx`/`.vue` 等）。读取 Spec 场景 → 模拟操作 → 截图 → 对比预期。非 Web → 跳过。

### Layer 3 — Pre-Completion Checklist

**职责**：逐项检查 7 项完成前验证清单，确保所有交付条件满足。

**CI 检查命令优先级**：

执行 Layer 3 清单前，读取 `.forge/config.md` YAML frontmatter 的 `ci_check_command` 字段：
- **如果非空**：使用 `forge_exec` 执行该命令（server-side trimming）。当 MCP 不可用时，回退到 `scripts/run-with-trim.sh` 或直接执行。覆盖清单项 1-4。从合并输出中提取各项通过/失败状态。
- **如果为空或缺失**：为每个清单项分别运行对应命令（优先使用 `forge_exec`）。

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

## 6. CLI Harness (`--cli`) [R5.1]

**Flag**: `/forge test --cli`

Triggers CLI/TUI external verification harness. Automatically triggered when:

- `package.json` has non-empty `bin` field, OR
- `--cli` flag is explicitly passed, OR
- `.forge/config.md` has `cli_harness: true`

Execution: delegates to `skills/forge-control-cli/` which selects the best available tier (project > cmux > tmux > node-pty). Output written to `.forge/findings/<topic>/cli-harness/`.

**UI variant**: `/forge test --ui` delegates to `skills/forge-control-ui/` for web/Electron testing.

## 7. Edge Cases

| Condition | Handling |
|-----------|----------|
| No test framework | ⚠️ 未检测到测试框架。Layer 1 无法执行 |
| Test timeout (>5 min) | ⚠️ 可能原因：未关闭的异步操作、数据量过大、死循环 |
| Some checklist items unverifiable | Mark as "unverifiable" not "passed", suggest configuring the corresponding tool |
| No `.forge/` directory | ⚠️ 请先运行 forge init |

---

## 8. Examples

```
$ /forge test
━━━ Layer 1 — 单元测试 ━━━  npx vitest run → 42/42 ✅
━━━ Layer 2 — 浏览器级 QA ━━━  非 Web 项目，跳过
━━━ Layer 3 — 完成前验证清单 ━━━  ✅ 1-7 全部通过
✅ 验证通过 → /forge ship
```

**Failing variant**: Layer 1 → 2 failed · 列出失败测试名 · ❌ 修复后重跑 /forge test。

## Common Rationalizations

| 合理化 | 反驳 |
|---|---|
| "测试通过了就不测了" | 通过不代表覆盖所有场景，边界条件和集成路径常被遗漏 |
| "这个改动很小，不需要测试" | 小改更容易引入意外副作用，轻量路径也要求验证 |
| "CI 会帮我测" | CI 是最终验证不是开发反馈，本地快速验证能节省大量时间 |
