# Review Report: review-comment-bitbucket

**Date**: 2026-05-23
**Spec**: `.kiro/specs/review-comment-bitbucket/`
**Source commits**: `4636d8b → fa5f748`（共 8 个 commit）
**Methodology**: subagent-parallel（spec-check / quality-check / security-check 三层独立评审）
**Result**: **blocked**

---

## 客观验证（Forge 宪法 §2.3 验证铁律）

| 检查项 | 命令 | 结果 |
|---|---|---|
| SKILL 单元 + 集成测试 | `npx vitest run skills/forge/lib/review-comment-bitbucket/` | ✅ **130 passed (130)** in 2.57s |
| 全仓测试 | `npm run check` | ⚠️ 8 failed / 6113 passed —— 全部失败位于 `test/contract.scripts.test.ts` / `test/frozen-hook-exit-code.property.test.ts` / `test/non-frozen-hook-preservation.property.test.ts` / `test/cmux-mirror/hook-notify.test.ts`，**与本特性无关**（在合并 commit `fa5f748` 上同样 8 个失败）|
| 27 条 correctness property 覆盖 | grep + 测试输出 | ✅ 全覆盖（finding-hash 5 + format 4 + platform-gate 10 + reconcile 8 = 27）|
| 8 行决策矩阵 Row 1-8 | grep | ✅ 全覆盖（platform-gate.test.ts: Row 1 ~ Row 8）|

**判定**：本特性的 130 个测试全绿；npm run check 的失败是仓库 baseline 问题，不是本次 spec 引入。

---

## Layer 1 · spec-check（需求覆盖 / scope creep）

### 总体

130 测试全绿，无 scope creep（仅 Bitbucket、不投 P3、无 platform abstraction），27 条 property 全覆盖。但 **`lib/post.ts` 主入口没有调用已实现的 `recordSkip` / `appendRunMetrics` / `recordPartialFailures` / `applyCliOverrides`，也没把 `parseReviewMarkdown` 包在 try/catch 中**。模块单元测试全过，但端到端 7 个 spec 要求的副作用（5 类 skip 留痕、metrics 累计、partial-failure 落盘、CLI 开关、parse 错误兜底）实际无效。

### 关键决策落地

| 决策 | 状态 | 证据 |
|---|---|---|
| A1（不依赖 merge check） | ✅ | 设计未引用 No-incomplete-tasks check |
| A2（双方都能关 + reopen 兜底） | ✅ | reconcile.ts 实现了 Latest_Task 选择 + auto_reopen_regressed |
| A3（仅 Bitbucket，无 platform layer） | ✅ | SKILL 命名锁定，类型 `platform: 'bitbucket'` 字面量 |
| A4（per-project + CLI 覆盖） | ⚠️ 部分 | `cli.ts` 实现了 `applyCliOverrides`，但 `post.ts` 主入口未调用 |
| A5（平台前置门禁 + 静默跳过） | ⚠️ 部分 | `platform-gate.ts` 完整实现 + 测试，但 skip 时未调 `recordSkip` 留痕 |

### 阻断性 finding（来自 spec-check）

- **post.ts** 未串联 `recordSkip`：违反 Requirement 7.2（5 类 Tool_Health_Counter / skip 段追加 / 同日 findings 文件追加全部失效）
- **post.ts** 未串联 `appendRunMetrics`：违反 Requirement 7.6（10 字段 metrics 累计完全没发生）
- **post.ts** 未串联 `recordPartialFailures`：违反 Requirement 7.3（partial_failures 仅在内存中返回，未写盘）
- **post.ts** `parseReviewMarkdown` 未 try/catch：违反 Requirement 7.5（parse 错误会向上抛而不是返回 `{ posted: false, reason }`）和 Requirement 7.8（review-markdown-not-found 路径未实现）
- **post.ts** 未调 `applyCliOverrides`：违反 Requirement 6.2 / 6.3 / 6.4（CLI flag 完全未生效）

### 非阻断 finding

- Action_Skip 缺失元数据字段：违反 Requirement 5.6（缺 task_id 记录）和 Requirement 5.9（缺 orphan-comment 原因标签的持久化）

---

## Layer 2 · quality-check（命名 / 错误处理 / 性能 / 测试 / 可维护性）

### 总体

无 P0；3 P1、11 P2、11 P3。代码整体能跑能测，但主入口可维护性偏弱、partial-failure 语义在读阶段被破坏、状态 fallback 不够保守。

### 阻断性 finding（来自 quality-check）

| # | 文件:行 | finding | 修复方向 |
|---|---|---|---|
| Q-P1.1 | `post.ts:66-69` | `Promise.all` 在读阶段任一失败崩溃，违反 partial-failure 语义 | 改用 `Promise.allSettled` 并落地 ToolFailure |
| Q-P1.2 | `post.ts:295-300` | `extractForgeTasks` 状态 fallback `as 'OPEN' \| 'RESOLVED'` 跳过校验，可能把 RESOLVED 错误识别为 OPEN 触发误删 task | 改为白名单 parser，未知状态默认 RESOLVED 兜底 |
| Q-P1.3 | `post.ts:48-285` | `postReviewToBitbucket` 主函数 ~240 行，远超建议的 50 行 | 拆为 5 个 executor 私有函数 |

### 非阻断 finding（节选）

- 8 处重复 `try/catch` 模板 → 应抽 `trackToolFailure(failures, finding_hash, tool_name, fn)` helper
- `catch (e: any)` × 8 → 改 `unknown` + 类型守卫
- `parse-review.ts` 自写 mini-YAML parser 不健壮 → 建议替换 `yaml` 包
- `_testFindings` 测试钩子在生产签名 → 应改 DI

---

## Layer 3 · security-check（安全风险）

### 总体

无硬编码密钥 / 内置 URL、无 child_process / eval / new Function、依赖仅 Node 内置、无第三方供应链风险。但 finding 字段 → comment_text / task_text → MCP 透传链路上，转义与边界校验不一致。

### 阻断性 finding（来自 security-check）

| # | 文件:行 | category | message | 修复方向 |
|---|---|---|---|---|
| S-P1.1 | `format.ts:18-30` | injection | fence 长度选择仅检查 `message.includes('``\u0060``')`，未检查 `suggestion`。suggestion 中的反引号可提前闭合 ```suggestion 块，注入伪造的 `<!-- forge-review:hash=... -->` marker，污染 reconcile 去重 | fence 长度计算同时考察 message 与 suggestion，输出 N+1 反引号或改 tilde fence |
| S-P1.2 | `format.ts:38-72` | injection | `task_text` 直拼 `finding.file_path` + `truncatedMessage` 进 `create_pr_task({text})`，未过滤 \r\n / 控制字符 / `[Forge P0]` 伪前缀 | 在 `parse-review.ts` 入口对 file_path 与 finding_type 做白名单校验 |

### 非阻断 finding（节选）

- `skip-trace.ts:60-103` toctou — tool-health.md read-modify-write 无锁
- `skip-trace.ts:54` sensitive-data — `mcp_base_url` / `remote_url` 含 userinfo（如 `user:token@host`）时 token 落盘
- `post.ts:103-251` + `observability.ts:21-24` sensitive-data — MCP `error.message` 原样落盘可能含 token
- `parse-review.ts:33-36` dos — `readFileSync` 无大小上限
- `post.ts` dos — findings 数量无 cap，串行 + rate_limit 可拖死 review run

---

## 阻断性问题汇总（按 P0/P1 优先级）

按 Forge 宪法 §3.3，存在 P0 / P1 时 **ship 阻断**。本次评审产出：

### P0（必须立即修复）

来自 spec-check：

1. **`post.ts` 未串联 `recordSkip`** → Requirement 7.2 失效（5 类 Tool_Health_Counter 全部不工作）
2. **`post.ts` 未串联 `appendRunMetrics`** → Requirement 7.6 失效（metrics.md 完全不写）
3. **`post.ts` 未串联 `recordPartialFailures`** → Requirement 7.3 失效（partial_failures 不落盘）
4. **`post.ts` `parseReviewMarkdown` 未 try/catch** → Requirement 7.5 / 7.8 失效（parse 失败会抛异常而不是返回 `posted: false`）
5. **`post.ts` 未调 `applyCliOverrides`** → Requirement 6.2 / 6.3 / 6.4 失效（CLI flag `--post-comments` / `--no-post-comments` 完全无效）

### P1（必须修复，阻断 ship）

来自 quality-check：

6. **`post.ts:66-69`** `Promise.all` 在读阶段任一失败崩溃 → 违反 partial-failure 语义
7. **`post.ts:295-300`** `extractForgeTasks` 状态 fallback 不安全 → 可能误删 RESOLVED task
8. **`post.ts:48-285`** 主函数 ~240 行 → 可维护性差，拆分需求

来自 security-check：

9. **`format.ts:18-30`** suggestion 注入风险 → 可伪造 marker 污染 reconcile
10. **`format.ts:38-72`** `task_text` 控制字符未过滤 → file_path / finding_type 可注入伪 `[Forge P0]` 前缀

来自 spec-check：

11. **Action_Skip 缺失元数据字段** → 违反 Requirement 5.6 / 5.9

---

## 验收结论

> 按 Forge 宪法 §3.3：**P0/P1 必须修复，阻断 ship**。

**结论**：**功能未通过验收**。

**根因诊断**：

整体架构合理，所有纯函数模块（finding-hash / platform-gate / format / reconcile / config / parse-review / skip-trace / observability / cli）单独单元测试全绿。

**问题集中在 `post.ts` 主入口**——它没有把已实现的 8 个模块完整串联起来：5 个 P0（来自 spec-check）全部指向"模块写好了但 main 没调"。这是典型的"集成层断裂"——模块测试都过，但端到端契约失效。

如果按 Phase 6（T18）的"全量验证"标准看，spec-check 的 P0 应该在 Task 18 阶段被发现：一个端到端集成测试（如 happy-path.test.ts）应当断言 `metrics.md` 文件被写入、断言 `tool-health.md` 计数器被增长——而当前的 happy-path 测试只断言 MCP 工具调用次数与顺序，没断言文件副作用。

### 建议的修复路径

走 `/forge fix` 或 `/forge build` 走一个修复迭代，TDD 顺序：

1. **先扩展现有集成测试**（特别是 `happy-path.test.ts` 与 `gate-skip.test.ts`）：增加文件副作用断言（metrics.md / tool-health.md / .forge/reviews/run-id.md / .forge/findings/comment-channel-skipped-*.md）—— 这些断言会**全部失败**（RED）
2. **修复 `post.ts`**：串联 `recordSkip` / `appendRunMetrics` / `recordPartialFailures` / `applyCliOverrides` / `parseReviewMarkdown` try/catch（GREEN）
3. **修复 P1 安全问题**：format.ts 转义、Promise.allSettled、状态 fallback 白名单（GREEN）
4. **重构 `post.ts`**：拆分 5 个 executor 私有函数（REFACTOR）
5. **重新评审**：再跑一次 `/forge review` 三层 subagent

预计工作量：1-2 人日。

---

## 评审者声明（执行-评审分离）

按 Forge 宪法 §3.1：本次评审由三个独立 subagent（spec-check / quality-check / security-check）并行执行，主 agent 仅做评审结果汇总与文档化，**未参与 finding 产出**。所有 finding 的 file:line 证据由 subagent 直接给出。

`methodology: subagent-parallel`
`l0_failure_signature: none`
`retry_count: 0`
