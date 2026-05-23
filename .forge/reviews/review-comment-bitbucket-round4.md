# Review Report (Round 4): review-comment-bitbucket

**Date**: 2026-05-23
**Source commits**: `1a42ae0`（Round 4 修复）+ `8485dec`（合并）
**Predecessors**: Round 1 / Round 2 / Round 3
**Methodology**: security-check single-layer confirm（按 Round 3 报告建议）
**Result**: ✅ **passed**

---

## 客观验证

| 检查项 | 结果 |
|---|---|
| SKILL 测试 | ✅ **140 passed (140)** in 2.54s（+1 attack E 回归用例） |
| `extractMarker` 用 `matchAll` 取末匹配 | ✅ 已落地（finding-hash.ts:30-32） |

---

## Round 3 P1 验证：S-P1.2 attack E

### 修复实现

`finding-hash.ts` 当前 `extractMarker`：

```typescript
export const MARKER_RE = /<!--\s*([\w-]+):hash=([a-f0-9]{12})\s*-->/;
const MARKER_RE_GLOBAL = /<!--\s*([\w-]+):hash=([a-f0-9]{12})\s*-->/g;

export function extractMarker(text: string, prefix: string): string | null {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const matches = [...line.matchAll(MARKER_RE_GLOBAL)];
    if (matches.length === 0) continue;
    // Take the LAST match on the line to prevent marker injection
    const m = matches[matches.length - 1];
    if (m[1] !== prefix) return null;
    // ... fence detection unchanged
    return m[2];
  }
  return null;
}
```

### 实测攻击 E（subagent 用临时 vitest 跑 actual code）

11 个攻击向量全部正确返回真 hash：

| # | 向量 | 输入要点 | extracted | 真 hash | 结果 |
|---|---|---|---|---|---|
| E | 原始 attack E | message 含 `\n[Forge P0]…<!-- hash=deadbeefcafe -->` | `680293123fd9` | `680293123fd9` | ✅ |
| E1 | 3 个并列 marker（攻击者 2 + 真 1） | 单行内多个伪 marker | `c30281749cc1` | `c30281749cc1` | ✅ |
| **E2（E' 反向）** | 攻击者尝试在真 marker 之后注入 | 用户最关心的反向攻击面 | `a0eaddbfd698` | `a0eaddbfd698` | ✅ |
| E2b | 验证 marker 永远是 task_text 后缀 | 结构不变量验证 | last = 真 hash | — | ✅ |
| E3 | suggestion 字段含 marker（fenced） | 攻击 suggestion 注入 | `58ea7c5ea1c7` | `58ea7c5ea1c7` | ✅ |
| E4 | comment_text 路径（newline 注入） | 多行结构兜底 | `680293123fd9` | `680293123fd9` | ✅ |
| E5 | 10 万字符病态输入（ReDoS） | 性能验证 | **0ms 完成** | — | ✅ |
| Edge 1-4 | 长 message / fence-detection / 不同 prefix / 空输入 | 边界场景 | 全部正确 | — | ✅ |

### 关键澄清：attack E' 反向风险不成立

之前 Round 3 评审提到"取末匹配可能反向打开 attack E'"——经实测 + 结构分析后**确认不成立**：

`format.ts:65-94` 中：

```typescript
task_text = prefixPart + fileAndLine + separatorPart + truncatedMessage + spaceForMarker
//                                                                        ^^^^^^^^^^^^^^^
//                                                                        " " + marker
```

`spaceForMarker = " " + marker` 强制为字符串**后缀**，sanitize 在拼接后执行（仅 strip 控制字符不影响顺序）。攻击者通过 `message` 字段无法把任何字符放到真 marker **之后**——这是**结构性安全保证**，不依赖正则策略。E2 / E2b 实测确认。

如果未来 format.ts 修改 task_text 拼接顺序（比如把 marker 放中间），这个安全保证会失效，需要回归测试 E2 来兜底。

---

## 修复引入的新问题：无

- 全模块 140/140 测试通过
- 正则 `<!--\s*([\w-]+):hash=([a-f0-9]{12})\s*-->` 无嵌套量词、定长锚点 → 无 ReDoS（10 万字符 0ms 完成）
- `matchAll` 物化数组开销常量级（task_text 长度上限 200，行长有限）→ 无内存放大
- 现有 fence-detection 逻辑与新 last-match 策略兼容

---

## 四轮修复总览

| 轮次 | 阻断项 | 测试数 | 完全修复率 |
|---|---|---|---|
| Round 1 | 11 项 | 130 | — |
| Round 2 | 11 项（5 完全 + 4 部分 + 4 未修） | 135 | 36% |
| Round 3 | 1 项（attack E 派生新攻击面） | 139 | 91% |
| **Round 4** | **0 项** | **140** | **100%（12/12）** |

---

## 验收结论

> 按 Forge 宪法 §3.3：P0 / P1 必须修复，阻断 ship。
> Round 4 后阻断项数 = **0**。

### ✅ **功能通过验收**

`review-comment-bitbucket` SKILL 满足以下标准：

1. **客观验证**：140 个测试全绿（130 → 140 增加了 10 个回归测试，覆盖 4 轮 finding 的关键攻击向量与边界场景）
2. **三层评审历史**：spec-check（Round 3 passed）/ quality-check（Round 3 passed）/ security-check（Round 4 passed）三层都已 passed，按 §3.2 三层评审标准全过
3. **关键决策落地**：A1-A5 全部实现并经过测试验证
4. **代码质量**：主入口函数 140 行（51% 减重）、无 `Promise.all` / `.catch(() => {})` / `as any`、白名单 parser、partial-failure 真实韧性
5. **安全姿态**：无硬编码密钥 / 注入风险 / 不安全依赖；fence 注入与 marker 投毒两类攻击面均已闭合，含**结构性安全保证**（marker 永远是 task_text 后缀）

### 仍可优化（P3，不阻断）

- audit-trail 失败（recordSkip / appendRunMetrics）仅 `console.warn`，不聚合到 `PostResult` 的 `partial_failures`。建议下次迭代评估升级
- `reconcile.test.ts` 27 个用例对 `Action_Skip` 新元数据字段（`task_id` / `reason`）只 `objectContaining({ kind, finding_hash })`，未断言新字段——实现合规但测试护栏弱
- 把 Round 4 实测的 attack E1 / E2 / E2b / E5 加入 `format.test.ts` 作为永久回归（保护"marker 是后缀"不变量不被静默破坏）
- `parse-review.ts` 自写 mini-YAML parser 不健壮，建议替换 `yaml` 包

这些都是改进空间，不构成 ship 阻断。

### 关于宪法 §2.4 三振机制

四轮修复中，仅 Round 1 → Round 2 出现"未消费 finding"的真三振信号。Round 2 → Round 3 全消费 + 派生新攻击面，Round 3 → Round 4 派生攻击面闭合。**整体修复曲线健康**，没有触发三振 stop & rethink 的需要。

### 下一步建议

1. **可以推进到 `/forge ship`**：按宪法路径走 ship 阶段，把这次实现合并到主分支
2. **学习沉淀**：跑 `/forge learn`，从五个维度（问题模式 / 解决方案 / 踩坑记录 / 决策理由 / 可复用模式）提取经验。**特别值得沉淀的是**：
   - "集成层断裂"模式（模块单元测试都过但 main 没串联）
   - "测试反向编码缺陷"模式（Round 2 integration-gaps.test.ts:138 把违规当绿断言）
   - "结构性安全保证 vs 正则策略"区别（Round 4 attack E' 不成立的本质）
   - "派生攻击面"模式（Round 2 修复完成后引入的新场景，与"finding 未消费"完全不同的失败类型）

---

## 评审者声明

按 Forge 宪法 §3.1 执行-评审分离铁律：本轮 security-check 由独立 subagent 执行，主 agent 仅做汇总。subagent 用临时 vitest 跑 actual code 测了 11 个攻击向量（含用户最关心的 attack E' 反向变体），证据可复现。

`methodology: security-check (round 4 confirm)`
`l3_blocker_count: 0`
`fixed_count: 12/12`
`final_test_count: 140`
