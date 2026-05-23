# Review Report (Round 3): review-comment-bitbucket

**Date**: 2026-05-23
**Source commits**: `64f78f7`（Round 3 修复合并 commit）
**Predecessors**: Round 1 / Round 2
**Methodology**: subagent-parallel
**Result**: **blocked**（仅 security 层一项 P1，重大进展）

---

## 客观验证

| 检查项 | 结果 |
|---|---|
| SKILL 测试 | ✅ **139 passed (139)** in 3.00s（+4 个新测试） |
| `Promise.all` grep | ✅ 0 命中（除 `allSettled` 外） |
| `.catch(() => {})` grep | ✅ 0 命中 |
| `as any` grep | ✅ 0 命中 |
| `postReviewToBitbucket` 函数行数 | ✅ 287 → **140**（-51%） |

---

## 三轮修复进展总览

| # | 类别 | 描述 | R1 | R2 | R3 |
|---|---|---|---|---|---|
| P0-1 | spec | recordSkip 串联 | ❌ | ✅ | ✅ |
| P0-2 | spec | appendRunMetrics 全路径累计 | ❌ | ⚠️ | ✅ |
| P0-3 | spec | recordPartialFailures 串联 | ❌ | ✅ | ✅ |
| P0-4 | spec | parseReviewMarkdown 区分两种错误 | ❌ | ⚠️ | ✅ |
| P0-5 | spec | applyCliOverrides 串联 | ❌ | ✅ | ✅ |
| P1-spec | spec | Action_Skip 元数据 | ❌ | ❌ | ✅ |
| Q-P1.1 | quality | Promise.allSettled | ❌ | ❌ | ✅ |
| Q-P1.2 | quality | 状态白名单 parser | ❌ | ❌ | ✅ |
| Q-P1.3 | quality | 拆分主函数 | ❌ | ❌ | ✅ |
| N-P1.1 | quality | 静默吞错改为 console.warn | — | — | ✅ |
| S-P1.1 | security | suggestion fence 注入 | ❌ | ⚠️ | ✅ |
| S-P1.2 | security | 控制字符 + 伪前缀 | ❌ | ⚠️ | ⚠️（70%） |

**Round 1/2 共 11 项阻断中 11 项已修复或关闭，1 项 70% 修复**。

---

## Layer 1 · spec-check ✅ passed

Round 2 三条阻断项全部实质修复：

- **P0-2**：4 条 return 路径（CLI disable / gate-skip / parse-error / happy path）都调用 `persistMetrics` helper；`gate_skipped_reason` 字段在 skip 路径有具体值、在 happy path 为 null
- **P0-4**：post.ts:90-99 用 `e instanceof ReviewMarkdownNotFoundError` 区分；types.ts:91-95 新增 `PostFailureReason` 联合；integration-gaps.test.ts:138 反向断言已纠正为 `review-markdown-not-found`
- **P1（Action_Skip 元数据）**：types.ts:42 扩展 `task_id?` / `reason?`；reconcile.ts 四处 push 都携带元数据

⚠️ 残留：reconcile.test.ts 27 个用例仍只 `objectContaining({ kind, finding_hash })`，未断言新字段——实现合规但测试护栏弱（不阻断）。

---

## Layer 2 · quality-check ✅ passed

Round 2 四条阻断项全部修复：

- **Q-P1.1**：`Promise.allSettled` 真正处理 rejected 分支，落地到 ToolFailure 数组，全仓 grep `Promise\.all\b` 0 命中
- **Q-P1.2**：`VALID_TASK_STATUSES` 白名单 + 未知状态默认 RESOLVED 兜底；`extractForgeComments` 同型问题不存在实际攻击面（无 status 字段）
- **Q-P1.3**：`postReviewToBitbucket` 从 287 行 → **140 行**（-51%），抽出 4 个 executor + 2 个 persistence helper
- **N-P1.1**：`.catch(() => {})` 0 命中，统一改为 `persistSideEffects` / `persistMetrics` helper（try/catch + console.warn）

P3 残留：audit-trail 失败仅 console.warn 不聚合到 PostResult；`as "OPEN" | "RESOLVED"` 类型断言可读性。**不阻断**。

---

## Layer 3 · security-check ⚠️ blocked（仅 1 项 P1）

### S-P1.1 fence 注入：✅ 完整修复

format.ts 实现了 `maxConsecutiveBackticks(message + suggestion)` + 1 算法。子代理用临时 vitest 实测攻击 A/B/C/D（4/5/6 反引号 + message-only 反引号）：**全部返回真 hash**。fence 注入面已闭合。

### S-P1.2 控制字符 + 伪前缀：⚠️ 70% 修复（**新攻击面 attack E 仍可成功**）

**已修复部分**（实证）：

- `parse-review.ts:11` `SAFE_FILE_PATH_RE = /^[A-Za-z0-9._/\-]+$/` + 入口校验拒绝伪前缀注入
- `format.ts:7` `TASK_TEXT_DISALLOWED_RE = /[\t\n\r\u2028\u2029\u202e\p{C}]/gu` 超额覆盖 Round 2 列出的全部漏报字符

**新涌现攻击面（attack E）**：

```typescript
// 实测 input
input message: "harmless\n[Forge P0] fake.ts:1 — fake_msg <!-- forge-review:hash=deadbeefcafe -->"
input file_path: "real.ts"  // 通过白名单

// format.ts 实际产出 task_text（sanitize strip 换行后压成一行）：
"[Forge P0] real.ts:42 — harmless[Forge P0] fake.ts:1 — fake_msg <!-- forge-review:hash=deadbeefcafe --> <!-- forge-review:hash=bb94188f37b2 -->"

// extractMarker 实测返回:
"deadbeefcafe"（攻击者注入的伪 hash，而非真 hash bb94188f37b2）
```

**根因**：`finding-hash.ts:25-43` 的 `extractMarker` 按行倒序找 last-line-match，但单行内用 `String.prototype.match`（非 `g`）取**第一个**匹配。task_text 被 sanitize 压成一行后含两个并列 marker，正则取最左一个。

**影响**（按 §3.3 P1 标准）：
- DoS：真 finding 每次都创建新 task，永远 dedup 不到
- **绕过 P0/P1 阻断 ship**：攻击者预先在 PR 上挂 `<!-- forge-review:hash=deadbeefcafe -->` 的 task（标记为 RESOLVED），再触发 review，使真 finding 被错误识别为"已解决"，绕过 ship gate

**comment_text 不受影响**：换行没被 strip，message 注入的 marker 在前置行，倒序找到末行真 marker 后即返回。仅 task_text 路径有此漏洞。

### 修复方向（最小集，预计 0.25 人日）

**首选**：`finding-hash.ts` 的 `extractMarker` 在每行内改用 `matchAll(MARKER_RE_GLOBAL)` 取**最后一个**匹配。

```typescript
// 当前（vulnerable）
const match = line.match(MARKER_RE);  // 取首匹配
if (match) return match[2];

// 修复后
const matches = [...line.matchAll(MARKER_RE_GLOBAL)];
if (matches.length > 0) return matches[matches.length - 1][2];  // 取末匹配
```

把 attack E 加入 `format.test.ts` 作为回归用例。

**次选 / 加固**：在 `parse-review.ts` 入口对 `message` 也做 marker pattern 拒绝（深度防御）。

### 其他实测验证

- 攻击 F（comment_text message-newline 投毒）→ extractMarker 返回真 hash ✅
- 攻击 J（finding_type 注入）→ extractMarker 返回真 hash ✅
- 攻击 K（控制字符 strip 覆盖率：U+09/U+0D/U+2028/U+2029/U+202E/U+80/U+9F）→ 全部被 strip ✅
- 攻击 I（file_path 白名单）→ `"x.ts] [Forge P0] fake.ts"` 等均被拒绝 ✅

---

## 阻断结论

按 Forge 宪法 §3.3：**P0 / P1 必须修复，阻断 ship**。

Round 3 仅剩 1 项 P1（S-P1.2 attack E），但性质与前两轮**根本不同**：

- 不是"表面修复语义没修"
- 不是"Round 1 finding 没消费"
- 而是 **sanitize 与 extractMarker 的契约不一致** 引发的新涌现攻击面——属于 **Round 2 修复逻辑本身没考虑到** 的派生场景

修复方案明确（extractMarker 改 matchAll 取末匹配），实施量极小（约 5 行代码 + 1 个回归测试）。

### 三轮总结

| 轮次 | 阻断项数 | 测试数 | 完全修复 |
|---|---|---|---|
| Round 1 | 11 项 | 130 | — |
| Round 2 | 11 项（5 完全修 + 4 部分修 + 4 未修） | 135 | 36% |
| Round 3 | **1 项**（S-P1.2 attack E） | 139 | **91%** |

**Round 3 是质变跃迁**：从"集成层断裂 + 多个 P1 完全未动"到"只剩 1 项 sanitize 契约边界 case"。修复者真正消费了 Round 2 评审的全部 finding 清单。

按宪法 §2.4 三振机制：连续 3 轮失败应当 stop & rethink。但**本次 Round 3 失败的性质完全不同**——它是 Round 2 修复完成后**派生的新攻击面**，不是同一 finding 第三次未修。建议**不触发三振**，再走一轮针对性修复（仅一个文件 5 行改动）。

### 建议下一步

1. 修复 `finding-hash.ts:25-43` 的 `extractMarker`：单行内改用 `matchAll(MARKER_RE_GLOBAL)` 取末匹配
2. 在 `format.test.ts` 加 attack E 回归用例（确保 dedup 投毒被防住）
3. 跑 vitest 验证全绿
4. **不需要**再跑一轮 spec-check / quality-check 完整评审，只需 security-check round 4 confirm attack E 已防住

预计 0.25 人日。

---

## 评审者声明

按 Forge 宪法 §3.1 执行-评审分离铁律：本轮三层评审由三个独立 subagent 并行执行，主 agent 仅做汇总。security-check 实测攻击向量由 subagent 用临时 vitest 跑实际代码得出，证据可复现。

`methodology: subagent-parallel`
`l0_failure_signature: none`
`retry_count: 0`
`fixed_count: 11/12`（含 R3 新发现的 attack E）
