# 验收报告：forge-router-intent-signals

**评审对象**: `.forge/specs/forge-router-intent-signals/`
**评审者**: spec-check (Layer 1 acceptance review, delegated subagent — §3.1 separation)
**评审日期**: 2026-05-23
**实施分支**: main (合并自 `worktree-forge-router-intent-signals`，merge commit `04e12cb4`)
**对照 ADR**: ADR-0006-router-intent-signals (accepted)

---

## 总体判定

- [ ] PASS
- [x] **CONDITIONAL PASS** — 主体实现完整，存在 2 个 P1 + 5 个 P2，无 P0
- [ ] FAIL

---

## 数字一览

| 指标 | 值 |
|---|---|
| Requirement 数 | 7 |
| Acceptance Criteria 总数 | 38 |
| 测试文件 | 10 |
| 测试用例通过 | 70 / 70 ✅ |
| CI 守门脚本 | 4（3 个 exit 0，1 个 P1 运行时崩溃） |
| 实施 commit 链 | 8（覆盖 tasks.md 12 任务） |
| ADR 拒绝方案的回避 | 3 / 3 ✅（mode 系统、`--mode=` flag、`UserPromptSubmit` 钩子） |

---

## Requirement 覆盖矩阵

### R1：数据形态扩展

| AC | 状态 | 实施位置 |
|---|---|---|
| R1.1 RouteHint 加 source 可选字段 | ✅ | `src/router.ts:90-95` |
| R1.2 序列化默认 + 读取容错 | ✅ | `src/router-intents.ts` 内部 + 测试 `route-hint-source.test.ts` |
| R1.3 intent 命中时 source = 'intent' | ✅ | `src/router-intents.ts intentsToHints()` |
| R1.4 CI 守门阻断新增类型 | ✅ | `check-router-no-new-types.mjs` (exit 0, "9 types match baseline") |
| R1.5 老 SKILL 不区分 source 遍历 | ✅ | 类型层 optional 字段 + 测试覆盖 |
| R1.6 golden snapshot zero-regression | ⚠️ **P1** | 脚本存在但 Node 24 运行时 SyntaxError |

### R2：触发位置（不动 dispatcher）

| AC | 状态 | 实施位置 |
|---|---|---|
| R2.1 9 步骨架不变 | ✅ | dispatcher 未改 |
| R2.2 intent 识别合并到 router Step 1 | ✅ | `skills/forge/lib/router/instructions.md:46` |
| R2.3 dispatcher skeleton CI 阻断 | ✅ | `check-dispatcher-skeleton.mjs` (exit 0, "9 steps match baseline") |
| R2.4 词典加载失败回退 + 告警 | ⚠️ **P2** | catch 块存在但未写 `intent_dictionary_load_failed` 告警事件 |

### R3：词典与正向命中

| AC | 状态 | 实施位置 |
|---|---|---|
| R3.1 词典 schema 三字段 | ✅ | `templates/router-intents.md` (3 intent: ultrathink/tdd-strict/security-deep) |
| R3.2 NFC + case-insensitive 全词匹配 | ✅ | `src/router-intents.ts matchIntents()` + 11 个 PBT 测试通过 |
| R3.3 反向去噪 AST 守门 | ✅ | `check-router-no-anti-noise.mjs` (exit 0, "No anti-noise patterns") |
| R3.4-3.6 词典数据校验（CI lint） | ⚠️ **P2** | vitest 覆盖（parse-intent-dictionary.test.ts 8 测试），但**未独立 CI lint 化**——schema 失效仅在 vitest 兜底；无独立 build-time 守门 |

### R4：SKILL 消费契约

| AC | 状态 | 实施位置 |
|---|---|---|
| R4.1 SKILL 自决消费 | ✅ | 类型层 optional + 测试覆盖 |
| R4.2 新增 intent 不需要老 SKILL 改动 | ✅ | tag-based dispatch 即天然兼容 |
| R4.3 SKILL "Intent Hints" 小节（建议） | ✅ | router instructions.md 已含此段；其他 SKILL 自决决定 |
| R4.4 wrapWorkspaceContext 保留 source 字段 | ⚠️ **P3** | 实现层无破坏（hint 序列化未被 strip），但**无显式回归测试** |

### R5：透明性与用户控制

| AC | 状态 | 实施位置 |
|---|---|---|
| R5.1 Step 3 独立分组显示 intent | ✅ | router instructions.md:70-77 含模板示例 |
| R5.2 命中"取消语义关键词集"剔除 intent hints | ✅ | `detectIntentCancellation()` + 17 个测试通过 |
| R5.3 未命中保留 intent hints | ✅ | 同上测试覆盖 |
| R5.4 audit log 复用现有 hints 字段 | ✅ | audit-log-schema.test.ts 3 测试通过 |
| R5.5 30 天退役评估脚本 | 🟡 **deferred** | tasks.md Out-of-tasks 明示延后到首批 intent 落地 30 天后 |
| R5.6 `/forge --help` 列 intent | ⚠️ **P2** | 词典已落地但 `--help` 输出未对接 |

### R6：词典扩张治理

| AC | 状态 | 实施位置 |
|---|---|---|
| R6.1 MAX_DICT_INTENTS=8 软警告 | ✅ | router.ts:139 + 集成处 |
| R6.2 单 intent triggers > 20 软警告 | ✅ | 阈值检查（同上常量族） |
| R6.3 lint-evolved-rules 接纳 router-intents.md diff | ⚠️ **P2** | `templates/router-intents.md` 修改未挂入 evolved-rules diff 渲染输入 |
| R6.4 MAX_RUNTIME_INTENT_HINTS=5 → intent_overload | ⚠️ **P2** | 当前是 `console.warn` 而非 audit log 事件写入；可观测性弱 |

### R7：与现有维度优先级与冲突处理

| AC | 状态 | 实施位置 |
|---|---|---|
| R7.1 intent vs tier：保 tier 不变 | ✅ | router.ts intent 处理在 tier 决策之后 |
| R7.2 不可达 hint 丢弃 + intent_hint_unreachable | ⚠️ **P1** | filter 回调静默 `return false`，**告警事件未发出** |
| R7.3 多 intent 同 (command, tag) 去重 | ✅ | router.ts:781-797 existingKeys Set |
| R7.4 用户 tier 覆盖 + intent 仍处理 | ✅ | 处理顺序正确 |
| R7.5 reason 末尾追加 intent 简介 | ✅ | router.ts:799 `intent: <names> (命中)` |
| R7.6 prompt-defense critical/high 抑制 intent | ✅ | router.ts:715-724 + intent-prompt-defense.test.ts 5 测试通过 |
| R7.7 medium 双信号共存 | ✅ | 同上测试覆盖 |
| R7.8 low/none 正常匹配 | ✅ | 同上 |

---

## P0/P1/P2/P3 必修清单

### P1（lock 前必修）

| # | Severity | 维度 | 位置 | Issue | 修复建议 |
|---|----------|------|------|-------|----------|
| 1 | **P1** | CI 守门崩溃 | `scripts/check-router-zero-regression.mjs:48` | `function main()` 含 `await import(...)` 但未声明为 `async`，Node 24 ESM 加载直接 `SyntaxError: Unexpected reserved word`。R1.6 zero-regression 守门完全无运行时验证 | 把 `function main()` 改为 `async function main()`；或将 `await import` 改为顶层 `import`（mjs 文件天然支持） |
| 2 | **P1** | 告警事件缺失 | `src/router.ts:783-787` | `intent_hint_unreachable` 告警事件未发出。filter 回调内静默 `return false`，违反 R7.2 acceptance；可观测性损失（无法分析"用户期望但 tier 不允许"的命中模式） | 加 `console.warn('[intent_hint_unreachable] ...')` 或写入 audit log 事件，与 `intent_overload` 模式一致 |

### P2（建议修）

| # | 维度 | 位置 | Issue | 修复建议 |
|---|------|------|-------|----------|
| 3 | 告警写法 | `src/router.ts:806-808` | `intent_overload` 当前是 `console.warn`，应当写入 audit log 事件（R6.4 acceptance 用词为"运行时告警事件"） | 引入统一 `emitAuditEvent()` helper，或定义事件 schema |
| 4 | 告警事件缺失 | `src/router.ts catch` 块 | `intent_dictionary_load_failed` 未发出（R2.4 acceptance） | 在 `loadIntentDictionary` catch 路径加事件写入 |
| 5 | CI 守门缺失 | `scripts/lint-evolved-rules.mjs` | 未接纳 `templates/router-intents.md` diff 输入（R6.3） | 扩展输入路径列表 |
| 6 | UI 接入缺失 | `commands/forge.md` 或 `--help` 输出 | 词典已落地但 `--help` 未列 intent（R5.6 acceptance） | 在 `--help` 路径中读取 `templates/router-intents.md` 并渲染 intent 名 + description |
| 7 | CI lint 化 | 词典 schema 校验（R3.4-3.6） | 仅靠 vitest 兜底，无 build-time 独立 CI lint | 加 `scripts/lint-router-intents.mjs` 在 `npm run check` 串联中验证（关键词去重、非空数组等） |

### P3 / Deferred

| # | 维度 | 位置 | 说明 |
|---|------|------|------|
| 8 | 测试覆盖 | wrap-workspace-context | R4.4 实现未破坏但缺显式回归测试 |
| 9 | 退役脚本 | scripts/check-intent-retirement.mjs | tasks.md Out-of-tasks 显式 deferred 到首批 intent 上线 30 天后，**不阻断本次验收** |

---

## 关键观察

### 实施完整度高 ✅

7 个 Requirement 38 条 acceptance 中：

- **完全实现**：30 / 38（79%）
- **部分实现 / 弱实现**：6 / 38（16%，全部为 P2 级别）
- **运行时崩溃**：1 / 38（R1.6，P1）
- **告警事件遗漏**：1 / 38（R7.2，P1）
- **延迟到 30 天后**：1 / 38（R5.5，spec 自身明示 deferred）

实施 commit 链清晰（8 个 commit 一对一映射 tasks.md 4 wave 12 task），ADR-0006 §Rejected Alternatives 三条全部回避（无 mode 概念、无新 CLI flag、无 `UserPromptSubmit` 钩子），核心数据流（intent 识别 → 可达性过滤 → 去重 → 注入）一一可追溯。

### §2.3 验证铁律情况

- **测试**：70 / 70 通过 ✅
- **CI 守门**：4 个中 3 个 exit 0；1 个运行时崩溃（P1）

满足"运行了验证命令并基于实测输出宣称通过"，但 R1.6 守门崩溃这一项构成 §2.3 灰区：**zero-regression 不变量没有真实运行时校验**。修复 P1-1 后即可解除。

### ADR 哲学一致性

ADR-0006 §Decision 6 节决策点全部覆盖：

- §1 RouteHint.source 扩展 ✅
- §2 词典白名单 + SKILL 自决 ✅
- §3 触发位置在 router Step 1 ✅
- §4 透明性 + audit log 复用 ✅
- §5 SKILL 消费契约（建议非强制）✅
- §6 词典上限 + 退役机制（除运行时告警写法 P2）

### 与 §3.1 execution-assessment separation

本验收由独立 subagent 执行（与实施代码作者隔离），符合纪律。

---

## 下一步

按优先级处理：

1. **修 P1-1（5 分钟）**：`scripts/check-router-zero-regression.mjs` 改 `async function main()`；运行验证 exit 0
2. **修 P1-2（10 分钟）**：在 router.ts:783-787 filter 回调内加 `console.warn('[intent_hint_unreachable] ...')`，与 `intent_overload` 写法保持一致
3. **重跑本评审**（独立 subagent，按 §3.1 separation）→ 转 PASS
4. **P2 5 项打包成 follow-up issue**（约 1-2 小时一并修），不阻断 ship
5. **P3 / Deferred 项进入 v2.7 ROADMAP**

修复 2 个 P1 后，本特性即满足 ship 门槛（按 §3.3 P0/P1 必修原则）。
