# Review Report (Round 2): review-comment-bitbucket

**Date**: 2026-05-23
**Spec**: `.kiro/specs/review-comment-bitbucket/`
**Source commits**: `9784fab → 08d40ea`（共 2 个修复 commit）
**Predecessor**: `.forge/reviews/review-comment-bitbucket.md`（Round 1）
**Methodology**: subagent-parallel（spec-check / quality-check / security-check 三层独立评审）
**Result**: **blocked**

---

## 客观验证

| 检查项 | 命令 | 结果 |
|---|---|---|
| SKILL 单元 + 集成测试 | `npx vitest run skills/forge/lib/review-comment-bitbucket/` | ✅ **135 passed (135)** in 4.22s（新增 5 个 integration-gaps 测试） |

测试数从 130 → 135（新增的 5 个集成测试就是 `integration-gaps.test.ts`）。但**测试全绿不代表 spec 通过**——下面三层评审显示部分集成测试实际反向编码了缺陷。

---

## Round 1 阻断项修复状态总览

| # | 类别 | 描述 | Round 1 | Round 2 |
|---|---|---|---|---|
| P0-1 | spec-check | post.ts 串联 recordSkip | ❌ | ✅ |
| P0-2 | spec-check | post.ts 串联 appendRunMetrics | ❌ | ⚠️ **部分**（gate skip / CLI disable / parse-error 三条 return 路径未累计 metrics） |
| P0-3 | spec-check | post.ts 串联 recordPartialFailures | ❌ | ✅ |
| P0-4 | spec-check | parseReviewMarkdown try/catch | ❌ | ⚠️ **部分**（合并了 `review-markdown-not-found` 和 `parse-error`，违反 7.8） |
| P0-5 | spec-check | post.ts 调 applyCliOverrides | ❌ | ✅ |
| P1-spec | spec-check | Action_Skip 元数据（task_id / orphan-comment 标签） | ❌ | ❌ **完全未修复** |
| Q-P1.1 | quality | Promise.all → allSettled | ❌ | ❌ **完全未修复**（line 99 仍 `Promise.all`） |
| Q-P1.2 | quality | extractForgeTasks 状态白名单 | ❌ | ❌ **完全未修复**（line 344 `as "OPEN" \| "RESOLVED"` 仍在） |
| Q-P1.3 | quality | 拆分 240 行主函数 | ❌ | ❌ **完全未修复**（函数从 240 行膨胀到 287 行） |
| S-P1.1 | security | suggestion fence 注入 | ❌ | ⚠️ **部分**（只升一档 3→4 反引号；4+ 反引号仍可绕过） |
| S-P1.2 | security | task_text 控制字符 + 伪前缀 | ❌ | ⚠️ **部分**（出口 strip 但漏 \t\n\r / \x80-\x9F / U+2028/U+2029；入口未做白名单） |

**11 项阻断项中，仅 3 项完全修复（P0-1 / P0-3 / P0-5），4 项完全未动，4 项部分修复。**

---

## Layer 1 · spec-check Round 2

### 阻断性 finding

#### P0-2（Requirement 7.6 部分违反）

**证据**：`lib/post.ts:283-294` 仅在 happy path 末尾调用 `appendRunMetrics`，三条早返路径漏调：

```typescript
// line 64-67: gate skip
if (gate.skip) {
  if (baseDir) await recordSkip(...).catch(() => {});
  return { posted: false, reason: gate.reason };  // ← 未累计 metrics
}

// line 60-63: CLI disable
if (!config.enabled) {
  if (baseDir) await recordSkip(...).catch(() => {});
  return { posted: false, reason: "disabled-by-cli" };  // ← 未累计 metrics
}

// line 78-79: parse-error
} catch (e: any) {
  return { posted: false, reason: "parse-error" };  // ← 未累计 metrics
}
```

**Spec 引用**：Requirement 7.6 明确 "WHEN `Post_Channel` 完成一次 run（**不论 posted 为 true 或 false**），THE Forge framework SHALL 把本次 run 的以下字段累计追加到 `.forge/knowledge/metrics.md`"，含 `gate_skipped_reason` 字段。如果 gate skip 路径不累计，该字段在 metrics.md 永远为 null，等于 spec 字段死区。

#### P0-4（Requirement 7.8 违反）

**证据**：`lib/post.ts:75-81` 用通用 catch 把所有 parse 异常映射到 `"parse-error"`：

```typescript
try {
  allFindings = await parseReviewMarkdown(reviewMarkdownPath);
} catch (e: any) {
  return { posted: false, reason: "parse-error" };
}
```

但 `lib/parse-review.ts:13-18` 已经实现了 `ReviewMarkdownNotFoundError` 子类，专门区分文件不存在场景。post.ts 没用 `instanceof` 区分，导致 Requirement 7.8 要求的 `'review-markdown-not-found'` reason code 永远不会出现。

更糟的是 `integration-gaps.test.ts:138`：`expect(result.reason).toBe("parse-error")` —— **测试本身就把违反 7.8 的实现编码成绿色断言**，让缺陷在 CI 上通过。这是回归保护反着用。

#### P1（Requirement 5.6 / 5.9 完全未修复）

`lib/types.ts:39` 的 `Action` 联合 `skip-duplicate` 分支签名仍然是：

```typescript
{ kind: "skip-duplicate"; finding_hash: string }
```

没有 `task_id`、没有 `reason` 字段。`lib/reconcile.ts:79 / 85 / 102` 三处 `skips.push` 也都没携带这些数据。`reconcile.test.ts` 27 个用例**没有任何一条**断言 `skips[i].task_id` 或 `skips[i].reason === 'orphan-comment'`。本 P1 在 Round 1 就被列为阻断项，Round 2 代码 0 改动。

### 修复引入的新问题

1. **类型签名退化**：`PostResult.reason` 类型仍限定为 `GateSkipReason`，但 post.ts 返回 `"disabled-by-cli"` / `"parse-error"` 字面量不在该枚举中。靠 TS literal widening 容错。
2. **`as any` 绕过类型**：`post.ts:60` `"platform-disabled-by-config" as any` —— 表面能跑，但说明 `recordSkip` 的 reason 入参类型与 CLI disable 语义不匹配。
3. **集成测试反向编码缺陷**：`integration-gaps.test.ts:138` 把 P0-4 的违规行为固化进绿色断言。

### 集成测试覆盖度评估（关键缺口）

| P0/P1 | 已覆盖 | 缺口 |
|---|---|---|
| P0-1 | ✅ findings 文件被写 | ❌ 未断言 tool-health.md 5 类计数器 ❌ 未断言 review-markdown 末尾追加 skip 段 |
| P0-2 | ✅ happy path metrics.md | ❌ **未断言 gate skip 路径下 metrics.md**（关键缺口）❌ 未断言 10 字段全部齐全 |
| P0-3 | ✅ error 文件被写 | ⚠️ 未断言文件内容含 4 字段 schema |
| P0-4 | ✅ 不抛异常 | ❌ **未区分 review-markdown-not-found vs parse-error** |
| P0-5 | ✅ disable 路径 | ⚠️ 未测试 enable 路径、未测试互斥抛错 |
| P1 | — | ❌ Action_Skip 新字段断言完全缺失 |

---

## Layer 2 · quality-check Round 2

### 阻断性 finding（3 项 P1 全部未修复 + 1 项新引入）

| # | 文件:行 | 问题 | 状态 |
|---|---|---|---|
| Q-P1.1 | `post.ts:99` | `Promise.all` 在读阶段任一失败崩溃 | ❌ 完全未修复 |
| Q-P1.2 | `post.ts:344` | `as "OPEN" \| "RESOLVED"` 状态强转 | ❌ 完全未修复 |
| Q-P1.3 | `post.ts:47-334` | `postReviewToBitbucket` 函数体 287 行（从 240 增到 287） | ❌ 完全未修复，反而恶化 |
| **N-P1.1**（新引入） | `post.ts:65, 80, 307, 320` | 4 处 `.catch(() => {})` 静默吞错，恰好覆盖 audit-trail 写盘路径（recordSkip / recordPartialFailures / appendRunMetrics） | 违反 §3.2 错误处理标准 |

### 新引入的 P2

- N-P2.1: `"platform-disabled-by-config" as any` 绕过 GateSkipReason 类型
- N-P2.2: gate-skip 早返路径不写 metrics.md（与 spec-check P0-2 同根）
- N-P2.3: integration-gaps.test.ts 混用 require/import、断言粒度粗、未覆盖静默吞错与 gate-skip metrics 路径
- N-P2.4: extractForgeComments 同型问题未一并治理（status fallback as 强转的同型问题在 comments 路径也存在）

---

## Layer 3 · security-check Round 2

### 阻断性 finding

#### S-P1.1 部分修复（fence 注入）

**当前实现**（format.ts:33）：

```typescript
const hasTripleBackticks = finding.message.includes("```") || finding.suggestion.includes("```");
const backticks = hasTripleBackticks ? "````" : "```";
```

只做 3→4 反引号一档升级，**不是按修复方向计算 max consecutive backticks**。

**攻击向量**（实证）：

```typescript
const f = {
  ...,
  suggestion: "````\nfake_content\n````\n<!-- forge-review:hash=evil12345678 -->\n",
  // 4 个连续反引号即可攻破 4 反引号 fence
};
```

输出 comment_text 中：
```
````suggestion
````
fake_content
````
<!-- forge-review:hash=evil12345678 -->
````
...
<!-- forge-review:hash=<真hash> -->
```

`extractMarker` 的 fence-count 逻辑会把真 marker 判定为"在 fence 内"而采纳攻击者的伪 marker，污染 reconcile dedup。

**附加**：`escapeSuggestion` 注释声称 "escape backtick sequences"，但实现只 strip 控制字符——名实不符，给安全审查制造 false confidence。

#### S-P1.2 部分修复（task_text 控制字符）

`format.ts:82` 在 task_text 出口加了 `stripControlChars`，但：

1. 修复方向明确要求"在 `parse-review.ts` 入口对 `file_path` / `finding_type` 做白名单校验"——**完全未做**
2. `CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g` 字符集**漏掉**：
   - `\t` (\x09) / `\n` (\x0A) / `\r` (\x0D) — 因为这些字符在文本中正常使用所以漏掉，但 task_text 应当不允许换行
   - C1 控制字符 (\x80-\x9F)
   - Unicode 行/段落分隔符 (U+2028 / U+2029)
   - bidi 覆写 (U+202E) 等格式控制
3. 因此 `file_path = "x.ts] [Forge P0] fake.ts"` 仍可注入伪前缀；`message` 含 `\n` + `[Forge P0] ...<marker>` 仍可伪造 task

---

## 阻断结论

> 按 Forge 宪法 §3.3：P0 / P1 必须修复，阻断 ship。

**Round 2 结论**：**仍未通过验收**。

**根因诊断**：

修复方向都对，但**执行不完整**：

1. P0-2 / P0-4 只修了"模块串联"这一层，没修"多路径副作用契约"——典型的"修了表面没修语义"
2. P1 类（Action_Skip / Promise.all / extractForgeTasks 状态 / 函数拆分）从代码到类型到测试三处零改动——**Round 1 评审结果在 Round 2 没被实际消费**
3. S-P1.1 / S-P1.2 修了一档但没补完攻击面——典型的"打地鼠"修复
4. 新引入的 4 处 `.catch(() => {})` 静默吞错恰好覆盖 audit-trail 写盘路径——为了让测试快速过引入了新缺陷
5. integration-gaps.test.ts 把 P0-4 的违规固化成绿色断言——**测试反向编码缺陷**

**集成测试增多 ≠ spec 通过**。Round 2 测试数从 130 → 135，但新增 5 个集成测试中至少 1 个反向编码了缺陷（P0-4），其余 4 个只验证"模块被调用"而不验证"全路径副作用契约"。

### 建议下一轮修复（最小集，预计 0.5-1 人日）

1. **P0-2 收尾**：把 `appendRunMetrics` 提取为 `recordRunMetrics(ctx, ...)` helper，让 4 条 return 路径（happy / gate skip / CLI disable / parse-error）都先调一次再返回；保证 `gate_skipped_reason` 在 skip 路径有值
2. **P0-4 收尾**：`catch (e: unknown)` 改用 `instanceof ReviewMarkdownNotFoundError` 区分，返回 `'review-markdown-not-found'`；同步扩展 `PostResult` 类型联合（新增 `PostFailureReason`）；修正 integration-gaps.test.ts:138 的反向断言
3. **P1 (Action_Skip)**：扩展 `types.ts:39` 的 `skip-duplicate` 联合，加可选 `task_id` / `reason` 字段；reconcile.ts 三处 push 携带；reconcile.test.ts 加断言
4. **Q-P1.1**：`post.ts:99` 改 `Promise.allSettled` 并落地 ToolFailure
5. **Q-P1.2**：`extractForgeTasks` / `extractForgeComments` 的 status fallback 改白名单 parser，未知状态默认 RESOLVED 兜底
6. **Q-P1.3**：拆分 `postReviewToBitbucket` 为 5 个 executor 私有函数（read / executeP0P1 / executeReopens / executeDones / executeP2 / finalize）
7. **N-P1.1**：4 处 `.catch(() => {})` 改为 try/catch + 错误聚合到 `auditFailures` 数组，至少在 console.warn 输出原因
8. **S-P1.1 收尾**：`format.ts` 按 max consecutive backticks 计算 fence 长度（用 `Math.max(maxBackticks(message), maxBackticks(suggestion)) + 1`）
9. **S-P1.2 收尾**：在 `parse-review.ts` 入口对 `file_path` 做白名单（仅允许 `[A-Za-z0-9._/-]`）；`stripControlChars` 改用 Unicode 类 `\p{C}`
10. **集成测试补全**：补 4 条断言（gate-skip metrics / parse-error metrics / review-markdown-not-found 区分 / Action_Skip 字段）

**关键提醒**：Round 1 评审产出的 11 项阻断中有 4 项 Round 2 完全没动。**下次修复前先逐条对照 Round 1 / Round 2 finding 清单，确认每条都有对应代码改动**，避免"看起来在修但其实没修"。

---

## 评审者声明

按 Forge 宪法 §3.1 执行-评审分离铁律：本轮三层评审由三个独立 subagent（spec-check / quality-check / security-check）并行执行，主 agent 仅做评审结果汇总与文档化，**未参与 finding 产出**。所有 finding 的 file:line 证据由 subagent 直接给出。

`methodology: subagent-parallel`
`l0_failure_signature: none`
`retry_count: 0`
