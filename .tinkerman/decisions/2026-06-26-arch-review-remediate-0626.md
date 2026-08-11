---
topic: "arch-review-remediate-0626"
date: "2026-06-26"
status: "confirmed"
spec: ".tinkerman/specs/arch-review-remediate-0626/"
related_adrs:
  - "ADR-0008"
upstream_review: "Forge-架构审核报告.md"
round1_verdict: "needs_revision"
round2_revisions_applied: "2026-06-26"
round3_verdict: "needs_revision (仅 REQ-04)"
round3_revisions_applied: "2026-06-26"
round4_verdict: "needs_revision (仅 REQ-04)"
round4_revisions_applied: "2026-06-26"
round5_verdict: "needs_revision (REQ-04 换 YAML parser)"
round5_revisions_applied: "2026-06-26"
round6_verdict: "needs_revision (REQ-04 异常兜底)"
round6_revisions_applied: "2026-06-26"
round7_verdict: "needs_revision (REQ-04 实现细节矛盾 + fallback 语义)"
round7_revisions_applied: "2026-06-26"
final_verdict: "confirmed (7 轮收敛后 approve)"
---

# Decision — arch-review-remediate-0626

> Spec 审批决策。Round 1→2→3→4→5→6→7 逐轮深化。
> **当前状态：CONFIRMED ✅** —— 经 7 轮 decide 收敛，spec 三件套 status: approved，进入 plan → build。

---

## Product Definition

**结论：推荐有修改**。6 项价值排序：REQ-04（真痛点，唯一对外价值）> REQ-02（中）> REQ-01/06（低但近乎免费）> REQ-03（理论痛点，防御性）> REQ-05（未就绪）。

关键质疑：
1. **REQ-03 vs ADR-0008 #3 冲突未正面回应**——ADR 明文"新增抽象层违反精简目标"。区别在于 ADR 针对"签名不同的同名函数合并"，REQ-03 是"魔字符串提取"（行为严格等价），性质不同**有理由保留**，但必须先出 ADR-0008 amendment 澄清边界。务实做法：**砍 T-04（103 处全量替换），只保留 T-03（建模块 + `FORGE_DIR` 常量）**，让新代码用常量、旧代码渐进迁移。
2. **优先级倒置**：唯一真价值项 REQ-04 被排到 Wave 4。安全增强应**前置独立先行**。
3. **scope creep**：一份 spec 混 refactor(01/02/03) + 安全(04) + 流程(05) + 工具(06) 四种性质。建议拆 2 个 spec：(A) REQ-04 单独走安全 spec 优先交付；(B) 其余 hygiene 合并。
4. **REQ-05 未就绪**：机制 A/B/C 依赖未决的 git 工作流 Open Question，应移出待澄清后再立。

---

## Technical Solution

**结论：推荐有修改** —— 6 REQ 中 4 个稳健（01/05/06），REQ-02/04 有阻断性契约/字段错误。

| REQ | 裁定 | 证据 |
|-----|------|------|
| 01 删 state-machine | ✅ 成立 | src/ 0 引用确认 |
| 02 拆 plan.ts | ⚠️ 有风险 | Open Question #1 核实正确（scripts 仅引用 active-plan.json）；**但 barrel 循环风险未闭环**——`plan.ts:28` import `./task-graph.js`，而建议的 task-graph 子模块含 `toTaskGraph`/`detectCycleInTasks`，须在 design **预先**验证 DAG，不能只靠 GREEN 后 madge |
| 03 forge-paths.ts | ❌ 与 ADR-0008 #3 **直接冲突** | 新建 `forge-paths.ts` + `resolveForgePath()` 即"新增 adapter 层去重"。且数量口径错：实测 93 文件 / 351 命中行（非 spec 说的 103 文件全量）；其中 39 处 `path.join` 可安全替换，6+ 处 `.includes()`/regex **不可安全替换**（破坏子字符串语义）。建议豁免或降级为仅 39 处 path.join |
| 04 L2 新鲜度 | ❌ 设计契约错误 | `tryParseCiEvidence` 确实不校验 diff（动机有效）；**但** Open Question #2 未解即推进：真实报告 frontmatter 用 `base:`/`head:` 或 `reviewed_at_commit`（单 SHA），**无 `base_sha`/`head_sha` 双字段**；`severity_counts` 是嵌套 `new_p0/new_p1/...` 非 spec 说的扁平 `p0_count`。`fallback.ts:304` 读 `fm.p0_count` 可能已与真实报告对不上 |
| 05 dist sync | ✅ 成立 | Open Question #3（git 工作流）须在 T-08 前关闭 |
| 06 spec 巡检 | ✅ 成立 | 无依赖，低风险 |

**ADR-0008 一致性**：Decision #3（无新 adapter 层）→ REQ-03 **冲突**；Decision #4（无 script 路径漂移）→ REQ-02 **不冲突**（已核实 scripts 不 import plan.js）。

---

## Security Assessment

**结论：推荐有修改**。REQ-04 有 P0 风险（方向正确但实现前须解字段问题）。

威胁建模（L2 是 ship 放行降级路径，`ship-gates.ts:723` L3 hard-gate）：

- **REQ-04 [P0，方向正确但未就绪]**：
  - 生成端 frontmatter 用 `reviewed_at_commit`（单 SHA），无 `base_sha/head_sha`。Open Question #2 未解即推进 → REQ-04 退化为"无 SHA 则放行"，**安全增强实际失效，等于空改**。须改为两步走：先在 review 生成端埋 SHA 字段。
  - **availability 威胁**：`FORGE_L2_FRESHNESS_CHECK=0` 紧急开关本身是新攻击面——若 CI 配置/PR 可注入环境变量，可一键关闭校验让过期证据通过。须收紧为仅本地 shell 来源或 unblock token。
  - **integrity 威胁**：ancestor 容忍逻辑若无深度上限，攻击者可提交基于极老共同祖先的"合法"报告通过 L2。须设祖先深度阈值（如 ≤5 commit）+ 单测。
- **REQ-03 [P1，需缓解]**：`sandbox-policy.ts:293-294` 的 `.tinkerman/sandbox.json`/`.sandbox-active.json` 是 **deny 名单硬编码**。若常量化须保证值严格等价（字符串完全一致，不做 resolve 化），否则 deny 漂移→绕过。须加值等价单测。
- **REQ-01/02/05/06：安全**。不触及 INV-2 任何控制项（path normalization / deny / HMAC / execFile 构造均不在改动文件内或被等价保留）。

---

## ADR Criteria Check

<!-- Critic (Round 2) 交叉审查结果 -->

| 维度 | Verdict |
|------|---------|
| 与 ADR-0008 一致性 | **部分冲突** —— REQ-03 违背 #3（新增 adapter 层），须 amendment 或降级 |
| 证据充分性 | **不足** —— REQ-03 数量口径错（103→93文件/351行）、REQ-04 字段名错（base_sha→reviewed_at_commit） |
| 可逆性 | ✅ 良好 —— 每 REQ 独立可回滚，REQ-04 有 mount point（但须收紧） |
| 安全回归风险 | **REQ-04 有 P0**（开关攻击面 + ancestor 无上限 + 字段缺失致空改） |
| Scope 合理性 | **偏大** —— product 建议拆 2 spec，REQ-04 独立优先 |

**Verdict：NEEDS_REVISION**（非 DISCARD——核心方向成立，3 项 P0/P1 可通过修订解决）

---

## Veto Record

- **不否决**任何 REQ 的方向。所有问题均为"实现前须澄清"，非方向错误。
- **暂时移出**（待条件满足再立项）：REQ-05（git 工作流未决）、REQ-04 若字段问题无法解（退化为"先生成端埋字段"前置任务）。

---

## Critic 修订指令（spec 须据此改，改后重审）

**P0（阻断，必须改）**：
1. **REQ-04 方向性重判（Critic 补充核验 2026-06-26）**：原指令是"修字段名"，但 Critic 深挖发现 `src/ship.ts:168` `checkReviewFreshness()` **已在 ship gate 层实现了更完整的新鲜度校验**（`ship.ts:382` 调用，含 `reviewed_at_commit === currentHead` 比对、`.tinkerman/` 文件豁免、project code 改动检测，4 种 case）。这意味着：
   - 原报告 P1-2"fallback L2 不校验 diff"在 fallback.ts 层面成立，但**风险已被 ship 层覆盖**。
   - REQ-04 若在 fallback 再加 SHA 比对，会与 ship 层重复或语义冲突（违反 ADR-0008"不新增抽象"精神）。
   - **新指令**：REQ-04 重新定义为「**评估 fallback L2 是否需要冗余新鲜度校验，还是依赖 ship 层 `checkReviewFreshness`**」——大概率结论是**删除 REQ-04**，改为在 fallback.ts 加注释文档化"新鲜度职责归 ship 层（`checkReviewFreshness`），L2 只做证据存在性/severity 解析"。同时修复 `fallback.ts:304` 读 `fm.p0_count` 与真实字段 `new_p0`（嵌套 severity_counts）**对不上**的既有 bug（这才是 fallback 层真问题）。
2. **REQ-04 残留安全项（若保留任何 L2 校验）**：紧急开关限定本地 shell 来源；ancestor 容忍设深度上限（≤5 commit）+ 单测。若 REQ-04 删除则本条作废。
3. **REQ-02 barrel 循环预防前置**：design 阶段预先画 DAG（types ← format ← validate ← task-graph），不能只靠 GREEN 后 madge。

**P1（须改）**：
4. **REQ-03 口径与范围修正**：数量改为实测值（93 文件 / 351 行命中）；明确"不可安全替换白名单"（`.includes(".tinkerman/...")`、regex）；与 ADR-0008 #3 冲突——要么出 amendment，要么降级为仅 39 处 `path.join` 替换（建议后者，ROI 最高风险最低）。
5. **REQ-03 sandbox deny 等价性**：`sandbox-policy.ts` 的 deny 项常量化须加字符串等价单测。

**Scope 调整（product 建议，待用户定）**：
6. 考虑将 REQ-04 拆为独立安全 spec 优先交付；REQ-05 移出待 git 工作流澄清。

---

## 复核痕迹

本次 decide 在生成 spec 后做审批，发现 spec 生成阶段（即便是"实现期复核"后）仍有 2 处事实错误：
- REQ-03 的"103 文件"为口径误统计（应为 93 文件 / 351 行）。
- REQ-04 的 SHA 字段名臆测（应为 `reviewed_at_commit`）。

印证 Forge §3.1 Execution-Assessment Separation 的价值：spec 作者（我）不审自己的 spec，独立视角才能抓出这类硬伤。

---

## 修订落实证据（Round 2 后，2026-06-26）

spec 三件套已按 Critic 指令全部修订，重审核对：

| Critic 指令 | 落实位置 | 验证 |
|---|---|---|
| P0-1 REQ-04 字段名 + 方向重判（ship 层已有 `checkReviewFreshness`） | requirements REQ-04 / design REQ-04 + Reversibility + Open Q#2 | ✅ 旧 `base_sha/head_sha`/SHA 比对仅在重判说明中作对照 |
| P0-2 REQ-04 安全收紧（开关/ancestor） | 全部移除（REQ-04 不再做新鲜度校验，自动消解） | ✅ `FORGE_L2_FRESHNESS_CHECK`/ancestor 仅作对照 |
| P0-3 REQ-02 barrel 循环预防前置 | REQ-02 加"DAG 预验证" + tasks T-02 RED 步骤 | ✅ 拆分前后 madge 双门控 |
| P1-4 REQ-03 口径修正 + ADR-0008 冲突 | REQ-03 降级为 39 处 path.join 局部常量 | ✅ 不建集中模块，服从 ADR-0008 #3 |
| P1-5 REQ-03 sandbox deny 等价性 | tasks T-03 明确 sandbox-policy deny 不替换仅加注释 | ✅ 规避 deny 漂移 |

**重审结论：所有阻断项已解除，spec 内部一致，可进入 approve。**

---

## Round 3 重审（用户选择再走一轮，2026-06-26）

三视角（product/architect/security）对修订版 spec 重审，结论一致：**needs_revision，仅 REQ-04 需再改**，其余 5 REQ（01/02/03/05/06）全部可放行。

### Round 3 核心发现：REQ-04 Round 2 修订本身有误，且揭示真实 P0 安全漏洞

准备本轮时实测发现 review 报告存在**三种格式漂移**，Round 2 只假设了一种：

| 报告样本 | 格式 |
|---|---|
| `code-slim-0612.md` 等 | 扁平 `p0_count`（符合 schema） |
| `security-check-20260618.md`、`planning-with-files-borrow-impl-review.md` | 嵌套 `severity_counts: { p0, p1, p2, p3 }`（**主流，无 new_ 前缀**） |
| `planning-with-files-borrow-impl-rereview.md` | 嵌套 `severity_counts: { new_p0, new_p1 }`（单一特例） |

**三视角一致指出的两个错误**：

1. **Round 2 字段名又错了**：spec 写 `severity_counts.new_p0`，但 security 实测 9 份报告，**真实主流嵌套字段是 `p0`（无 `new_`）**，`new_p` 仅 1 例。按 Round 2 方案实现会读 undefined → bug 没修好。

2. **修复范围漏了真正的 ship gate（P0 安全漏洞）**：
   - `ship-gates.ts:114` `parseReviewReportFrontmatter` 用正则 `^p0_count:` **只读扁平**。
   - `ship-gates.ts:259` `if (report.p0Count > 0) block` —— ship 放行真正执行点。
   - **一份 `severity_counts: {p0:1}` 的 blocked 报告，ship-gates 读出 `p0Count=0` → 错误放行 P0 阻断的 ship。这是当前代码已存在的 P0 漏洞。**
   - Round 2 只修 `fallback.ts:304`，完全不碰 `ship-gates.ts:114`，落地后漏洞仍在。

3. **根因是 pipeline 级 schema/数据漂移**（architect）：schema + 4 reader（state/quality-gate/ship-gates/fallback）全部认扁平 `p0_count`，但实际报告写嵌套。src/ 无任何代码"写"嵌套格式 → 嵌套报告来自人工/外部 Agent。单修 fallback 是 band-aid，还会制造 L2 与 ship gate 对同一报告解读不一致的新裂缝。

### Critic 核验（2026-06-26）

- `ship-gates.ts:114` `p0Match = fmText.match(/^p0_count:\s*(\d+)/m)` + `:259 if(report.p0Count>0)` —— **P0 漏洞确认无疑**。
- `grep severity_counts src/` —— src/ 无 writer 写嵌套格式，确认嵌套报告来自外部，**扁平 `p0_count` 是 canonical（schema 表态）**。

### Round 3 修订指令（REQ-04 第三次重定义，这次根治）

1. **定 canonical 格式**：扁平 `p0_count/p1_count/p2_count/p3_count` 为标准（schema `review-report.ts:52` 已表态），嵌套为 legacy。在 REQ-04 显式声明并记入决策。
2. **修复范围扩展到所有 severity 消费者**（不只 fallback）：
   - `ship-gates.ts:114`（**P0 漏洞点，必须修**）—— 正则改为同时匹配扁平 `p0_count` 和嵌套 `severity_counts.p0`。
   - `fallback.ts:304` —— 同步。
   - `state.ts:216` / `quality-gate.ts:84` —— 核验是否消费嵌套报告，若是同步修。
   - `schemas/review-report.ts` —— schema 文档化 canonical = 扁平，嵌套为 legacy 容错。
3. **字段名改正**：`severity_counts.p0`（删 `new_` 前缀），用实测样本校验；保留对 `new_p0` 特例的容错。
4. **补 P0 漏洞回归测试**：用真实 `severity_counts: {p0:1}` 报告断言 `ship-gates` 读出 `p0Count=1` 并阻断 ship（RED 先行）。

### Round 3 放行项

REQ-01（删 state-machine）/ REQ-02（拆 plan + DAG 预验证）/ REQ-03（path 常量降级版，不碰 sandbox deny）/ REQ-05（dist sync，Open Q#3 执行前闭环）/ REQ-06（spec 巡检）—— **全部可放行**，无需再改。

### Round 3 修订落实（2026-06-26）

spec 三件套已按 Round 3 指令修订 REQ-04（根治版），重审核对：

| Round 3 指令 | 落实位置 | 状态 |
|---|---|---|
| 定 canonical = 扁平 `p0_count` | requirements REQ-04 + design | ✅ |
| 字段名改正（`p0` 主流，`new_p0` 特例） | 三格式兼容方案 | ✅ |
| 修复范围扩到 ship-gates.ts:114（P0 漏洞点） | requirements/design/tasks 一致 | ✅ |
| 抽共享 extractSeverity，4 reader 复用 | design 方案 + Component Interfaces + T-05 | ✅ |
| P0 漏洞回归测试 | T-05 RED + design Testing | ✅ |
| 核验 state.ts/quality-gate.ts | T-05 GREEN 步骤 4 | ✅ |
| T-05 前置 Wave 1 | tasks 依赖图 + 执行顺序 | ✅ |

**重审结论：REQ-04 P0 漏洞已根治，spec 内部一致，可进入 approve。**

---

## Round 4 重审（用户选择再走一轮，2026-06-26）

三视角重审 Round 3 根治方案本身。product approve（附 hotfix 独立化建议）；architect + security **needs_revision**——Round 3 方案有 2 个新 P0 + 2 个实现缺口。

### Round 4 核心发现：Round 3 修复方案本身引入新漏洞

**新 P0-1（security）：`??` 链 fail-open，制造与原漏洞等价的新漏洞**
Round 3 定义的聚合语义是"取首个非空值"：
```ts
const p0 = flat("p0_count") ?? nested("severity_counts.p0") ?? nested("severity_counts.new_p0") ?? 0;
```
`??` 取首个非 null/undefined。攻击者构造 `p0_count: 0`（扁平，非 null）+ `severity_counts: {p0: 5}`（嵌套真实值）→ `p0 = 0`（扁平零值压过嵌套非零）→ ship-gates `:259 if(p0Count>0)` 不成立 → **P0 被隐藏、ship 放行**。
**这正是 Round 3 想闭合的漏洞的等价复刻**，只是换了个形态（漏读嵌套 → 扁平零值压过嵌套）。

**新 P0-2（architect）：漏第 4 种格式——大写 `P0:/P1:/P2:/P3:`**
Critic 核验确认：`.tinkerman/reviews/632cfcb5/summary.md`、`3e25e83b/combined.md` 用 `severity_counts: { P0, P1, P2, P3 }`（大写）。Round 3 的"三格式"（扁平/小写 p0/new_p0）覆盖不到 → 这些报告 severity 仍读 0 → 漏洞不闭合。**实际是四种格式。**

**实现缺口-3（architect）：ship-gates.ts:119 早返逻辑遗漏**
`if (!p0Match && !p1Match && !methodMatch && !resultMatch) return null`。一份只有嵌套 severity_counts、无扁平字段的报告 → 四 match 全空 → 返回 null。security 核验：null 在 `:238-245` 是 fail-closed（阻断），方向安全——但会**误伤合法嵌套报告**（误阻断 ship）。改嵌套读取时早返判定必须同步纳入嵌套检测。

**实现缺口-4（architect）：extractSeverity 接口形态错**
4 reader 输入各异：ship-gates 用 fmText 字符串（自包含正则）、fallback 用 fm 对象、quality-gate/state 用 raw+fieldName。design 的 `extractSeverity(fmText | fm)` 联合签名是错抽象。可救：统一为 `extractSeverity(rawText: string)` 单入口（3/4 reader 已持 raw，fallback 返回值含 raw）。

### Round 4 修订指令（REQ-04 第四次修订）

**P0 必改**：
1. **聚合语义从"取首个非空"改为 `Math.max`**（security P0）：
   ```ts
   const p0 = Math.max(flatP0 ?? 0, nestedP0 ?? 0, nestedNewP0 ?? 0, nestedUpperP0 ?? 0);
   ```
   任一格式 >0 即阻断（fail-closed）。堵住 `??` 链漏洞。
2. **补第 4 种格式：大写 `P0/P1/P2/P3`**（architect P0）：regex 大小写不敏感或显式加大写分支。

**P1 必改**：
3. **ship-gates.ts:119 早返逻辑同步纳入嵌套检测**（architect 缺口-3）：嵌套 severity 字段存在时不早返 null；RED 测试钉死（含"双零放行"防 max 误放大）。
4. **extractSeverity 改 rawText 单入口**（architect 缺口-4）：去掉对象联合签名。

**product 建议（非阻断）**：
5. T-05 考虑抽独立 hotfix spec 先行 ship，避免和 refactor 混 PR（回滚耦合：若 T-02/T-08 回滚会连带回滚已修 P0）。

### Round 4 放行项
REQ-01/02/03/05/06 全部放行（Round 3 已稳，本轮无新风险）。

### Round 4 修订落实（2026-06-26）

spec 三件套已按 Round 4 四项指令修订 REQ-04（第四次），重审核对：

| Round 4 指令 | 落实 | 状态 |
|---|---|---|
| P0-1 聚合语义改 `Math.max`（fail-closed，堵 `??` 链漏洞） | requirements/design/tasks + 代码示例 | ✅ |
| P0-2 补第 4 种大写格式 `severity_counts.P0` | 四格式方案贯穿 | ✅ |
| P1-3 ship-gates.ts:119 早返逻辑同步纳入嵌套检测 | requirements/design/tasks + RED 钉死 | ✅ |
| P1-4 extractSeverity 改 rawText 单入口 | design + Component Interfaces | ✅ |
| 完整 P0 回归矩阵（混合/双零/大写/早返） | design Testing + tasks T-05 | ✅ |

**重审结论：Round 4 两个新 P0（`??` 链 fail-open + 大写格式）已根治，聚合语义改为 fail-closed（max），spec 内部一致，可进入 approve。**

---

## Round 5 重审（用户选择再走一轮，2026-06-26）

三视角重审 Round 4 的 `Math.max` 正则方案。product 建议"换策略"；architect + security **needs_revision**——**正则方案是工具错配，应改用项目已有的 YAML parser 根本根治**。

### Round 5 核心发现：正则路线的根本缺陷

**architect 根本问题（正则选错工具）**：实测 `severity_counts` 有**两种 YAML 结构**：
- 块式多行：`severity_counts:\n  P0: 0`（632cfcb5/summary.md 等）
- 流式 inline map：`severity_counts: { p0: 0, p1: 0 }`（security/quality/spec-check 等，**多数**）

Round 4 的 `matchNested` 正则需同时匹配两种结构 → 实际是 4 格式 × 2 结构 = 8 分支组合爆炸，且 design/tasks **从未展示 matchNested 实现**。现有 `frontmatter.ts:171` 的 `extractNumericField`（`^fieldName:`）对两种嵌套结构都匹配不到 → 流式报告（多数）仍读不到 → **P0 漏洞不闭合**。

**security 新 P0（NaN 传染）**：`Math.max` 对 NaN 传染——`p0:abc` → `Number("abc")=NaN` → `Math.max(NaN,0,0,0)=NaN` → `NaN>0` false → **P0 静默隐藏**。另有 ReDoS P1（流式正则回溯陷阱，无界输入卡死 ship-gate）。

**Critic 决定性核验（2026-06-26）**：architect 建议的 YAML parser 路线**已有完备基础设施**：
- `package.json` 已有 `yaml@2.8.4` 依赖。
- `parseYaml` 在全项目 **10+ 处**使用（context/map、docs-governance/frontmatter、pack、spec-leak-detector…），是**既有惯例**。
- **关键**：`src/review/frontmatter.ts:8,28` 已经 `parseYaml(match[1])` 返回对象——review 模块自己的 frontmatter parser 就是 YAML parse。ship-gates.ts:114 的纯正则是**异类**，与 review/frontmatter.ts 不一致。
- `frontmatter.ts:72` `parseFrontmatter` 返回 `{raw, body}`，raw 可直接喂 `parseYaml`。

### Round 5 修订指令（REQ-04 第五次修订，换根本路线）

**放弃正则，改用 YAML parser + 对象聚合**（一次性根治，不再逐格式枚举）：

```ts
// 复用项目既有惯例（review/frontmatter.ts 已如此）
import { parse as parseYaml } from "yaml";
const { raw } = parseFrontmatter(content);          // 已有
const fm = (parseYaml(raw) ?? {}) as Record<string, any>;
const sc = fm.severity_counts ?? {};
// max 聚合 + Number.isFinite 钳制（堵 NaN/负数 fail-open）
const p0 = Math.max(safeNum(fm.p0_count), safeNum(sc.p0), safeNum(sc.new_p0), safeNum(sc.P0));
// safeNum = (v) => Number.isFinite(v) && v >= 0 ? v : 0
```

**此方案同时消解**：
1. ✅ 8 分支正则组合爆炸（YAML parser 天然统一块式/流式/大小写）—— architect 根本问题
2. ✅ NaN/负数 fail-open（对象上 `Number.isFinite` 钳制容易）—— security P0
3. ✅ ReDoS（不再自写正则）—— security P1
4. ✅ 与 review/frontmatter.ts 既有实现对齐（一致性，消除 ship-gates 异类）

**P0/P1 缓解**：
- security P0：`safeNum` 钳制非有限/负数为 0（RED 测试 `p0:abc`/`p0:-1` 不放行）。
- security P1：YAML parser 本身处理输入；frontmatter 段体积可控（`---...---` 内），无需额外截断。
- architect：extractSeverity 接口改为 `(rawFmText) => {p0,p1,p2,p3}`，内部 parseYaml。

**product 策略建议（采纳）**：
- T-05 切成"ship-gates 单点 hotfix 立即 ship"（ship 放行执行点是唯一真 P0 漏洞点）。
- fallback/state/quality-gate 的 severity 误读若无 ship 放行语义，降级为 follow-up（spec 未论证它们也导致 P0 放行）。
- 长期：schema 层（review-report.ts）考虑去掉 `.passthrough()` 对 severity_counts 的容忍，writer 侧 normalization，彻底消除格式漂移。

### Round 5 放行项
REQ-01/02/03/05/06 全部放行（多轮稳定，无新风险）。

### Round 5 修订落实（2026-06-26）

spec 三件套已按 Round 5 换路线（YAML parser）修订 REQ-04（第五次），重审核对：

| Round 5 指令 | 落实 | 状态 |
|---|---|---|
| 放弃正则，改用项目已有 `parseYaml`（`yaml@2.8.4`，10+ 先例） | requirements/design/tasks + parseYaml 代码 | ✅ |
| safeNum 钳制（`Number.isFinite && >=0`，堵 NaN/负数/Infinity fail-open） | safeNum 定义 + 回归测试 | ✅ |
| 覆盖块式 + 流式两种 YAML 结构（YAML parser 天然统一） | 回归矩阵含两种结构 | ✅ |
| 范围收窄：ship-gates 优先 hotfix，fallback/state/quality-gate follow-up | requirements/design/tasks 范围说明 | ✅ |
| ReDoS 消除（不自写正则） | YAML parser 路线天然消除 | ✅ |

**重审结论：Round 5 三视角的根本问题（正则工具错配）已通过换用 YAML parser 一次性根治，同时消解 NaN/ReDoS/8 分支爆炸，spec 内部一致，可进入 approve。**

> **收敛观察**：5 轮 decide 在 REQ-04 上的迭代，前 4 轮都在"格式枚举"维度打转（每轮发现一个新格式/语义变体），Round 5 architect 指出这是"用正则做经验事实枚举"的根本工具错配，改用 YAML parser 后该维度一次性收敛——印证 product"换策略"的判断。

---

## Round 6 重审（用户选择再走一轮，2026-06-26）

三视角重审 Round 5 YAML parser 方案。product **approve（附 caveat）**；architect + security **needs_revision**——extractSeverity 必须补 try/catch 兜底 parseYaml 异常（availability P0）。三视角一致认为这是**收尾轮**。

### Round 6 核心发现：parseYaml 异常逃逸 = availability DoS（新 P0）

**Critic + 三视角独立核验确认**：
- `ship-gates.ts:238` 调用 `parseReviewReportFrontmatter(content)` **无 try/catch**。
- Round 5 方案 `extractSeverity` 内部 `parseYaml(rawFmText) ?? {}`——`?? {}` **只兜空值，不兜 `YAMLParseError`**。
- `yaml` 包对畸形 frontmatter（未闭合 `{p0:1`、tab 缩进错乱、未闭合引号）抛 `YAMLParseError`。
- 异常沿 `extractSeverity → parseReviewReportFrontmatter → checkShipGate(:238 无 catch) → forge ship` 逃逸 → **ship 命令崩溃**。
- 攻击者（能写 `.tinkerman/reviews/*.md` 的 Agent/人）构造畸形 YAML 即可 DoS 发布流程。

**这是把 Round 3-5 修的"错误放行 P0"换成了"ship 崩溃"的 availability 故障**——security 指出正确的 fail 语义是**结构化 fail-closed**（返回 blocking GateResult，复用 `:239-244` "Failed to parse" 早返路径阻断 ship），而非通过崩溃实现。

**对比既有代码**：`fallback.ts:314` `tryParseCiEvidence` 有 `try { ... } catch { return null }` 兜底（fail-closed 降级）。连 `review/frontmatter.ts:28` 的 `parseYaml(match[1]) ?? {}` 也没 try/catch，但它的调用方都包在更大 try 块内——extractSeverity 若无兜底则 ship-gates 路径裸奔。

**附带降级**：alias bomb（YAML 别名爆炸）原为 P1，因 `yaml@2.8.4` 自带 `Excessive alias count` 防护 + 第 1 点 try/catch 到位后，变为普通解析失败 → fail-closed 阻断，可接受。

**工具选型（architect 次优点）**：项目有两个 frontmatter 工具——`src/frontmatter.ts:72` `parseFrontmatter`（返回 {raw,body}，不 parseYaml）vs `src/review/frontmatter.ts:19` `splitFrontmatterAndBody`（返回 {fmText,body,fm}，已 parseYaml）。Round 5 选前者+二次 parseYaml 重复解析；应改用后者直接拿 fm 对象，extractSeverity 签名改为接收对象。

**safeNum 语义修正（architect 中点）**：`safeNum` 对非法值返回 0，但"非法 severity → 0 → 放行"是 fail-open。security 核验 safeNum 对 parseYaml 输出空间（NaN/Infinity/null/true/对象/标量）实际都钳为 0，**安全上可接受**（因为正常报告不会有这些），但 spec 的"fail-closed"措辞不准确——应区分"字段缺失→0（放行，合理）"与"字段非法→也应阻断"。

### Round 6 修订指令（REQ-04 第六次修订，异常兜底）

**P0 必改**：
1. **extractSeverity 内部 parseYaml 必须 try/catch 兜底**：异常时返回 fail-closed 信号（如 `null` 或 `{p0:Infinity}` 哨兵），让 `parseReviewReportFrontmatter` 映射为 `passed:false` 阻断 ship（复用 `:239-244` 早返路径），**绝不崩溃**。对齐 `tryParseCiEvidence:314` 的 try/catch 模式。
2. **RED 矩阵补畸形输入**：`p0: [unclosed`（畸形 YAML）、alias bomb → 均产生阻断 gate 不崩溃；`p0: true`、`severity_counts: scalar` → safeNum 钳制为 0 不放行提升。

**中改**：
3. **工具选型**：改用 `splitFrontmatterAndBody`（review/frontmatter.ts:19）取 fm 对象，`extractSeverity(fm)` 接收对象而非 raw 文本，消除二次 parseYaml。
4. **safeNum 语义措辞修正**：明确"字段缺失→0（放行）"vs"字段非法→0（因正常报告无此情况，安全等价）"；不强求 raise（避免过度工程）。

**product 元判断**：三视角一致认为这是**收尾轮**——格式维度已结构性收敛（Round 5），本轮补的异常兜底是落地必经细节，不再有"未知格式变体"维度。修订后即可 approve，不再开 Round 7。

### Round 6 放行项
REQ-01/02/03/05/06 全部放行（多轮稳定）。

### Round 6 修订落实（2026-06-26）

spec 三件套已按 Round 6 指令修订 REQ-04（第六次），重审核对：

| Round 6 指令 | 落实 | 状态 |
|---|---|---|
| P0-1 extractSeverity try/catch 兜底（parseYaml 异常→null→结构化 `passed:false` 阻断，不崩溃） | requirements/design/tasks + try/catch 路径 | ✅ |
| P0-2 RED 矩阵补畸形输入（未闭合/tab/alias bomb→阻断不崩溃） | 三文件回归矩阵 | ✅ |
| 中-3 工具选型改 splitFrontmatterAndBody（extractSeverity(fm) 接收对象，消除二次 parseYaml） | 签名 + Component Interfaces | ✅ |
| 中-4 safeNum 措辞修正（非法→0 安全等价，真实防护由异常兜底） | requirements safeNum 语义段 | ✅ |
| alias bomb 降级（yaml@2.8.4 自带防护 + try/catch） | design + tasks 风险说明 | ✅ |

**重审结论：Round 6 的 parseYaml 异常逃逸 availability P0 已通过 try/catch 结构化 fail-closed 闭合，工具选型统一为 splitFrontmatterAndBody，spec 内部一致。三视角一致认定本轮为收尾轮，可进入 approve。**

> **最终收敛声明**：经 6 轮 decide，REQ-04 从"补一个 SHA 校验"演进出完整的安全修复方案。各轮发现的 P0 已全部闭合：
> - 原 P0（嵌套漏读）+ Round 4（`??` 链 + 大写格式）+ Round 5（NaN/ReDoS）+ Round 6（异常逃逸）。
> - 方案最终形态：`splitFrontmatterAndBody`（复用既有 parseYaml）→ `extractSeverity(fm)` try/catch 兜底 + max 聚合 + safeNum 钳制 → 结构化 fail-closed（阻断不崩溃）。
> - product/architect/security 三视角在 Round 6 一致认为格式维度已结构性收敛，不再有"未知变体"维度，建议 approve 并交实现。

---

## Round 7 重审（用户选择再走一轮，2026-06-26）

三视角用怀疑视角审 Round 6 方案。product **approve（强烈建议停 decide 转 PoC）**；architect + security **needs_revision**——发现 spec 自相矛盾（实现正确性）+ fallback 语义漂移（新缺口）+ try/catch 过宽反模式。均为实现细节级，方向不变。

### Round 7 核心发现

**architect 缺口-1（spec 自相矛盾，实现正确性 P0）**：try/catch 放置点描述打架：
- `tasks.md:103` 写"extractSeverity 内部 try/catch 包 parseYaml 调用路径"。
- 但 extractSeverity 接收**已 parse 成功的 fm 对象**，其函数体内**无 parseYaml 调用**——parseYaml 异常实际在 `splitFrontmatterAndBody`（frontmatter.ts:28）内部抛出。
- `tasks.md:108/:110` 又说"外包 try/catch / splitFrontmatterAndBody 外层"——这才是正确的。
- **若实现者照 :103 写**，try/catch 会包在一个不存在的 parseYaml 调用上，异常仍从 splitFrontmatterAndBody 逃逸 → **Round 6 P0 实际未闭合**。

**architect 缺口-2（extractSeverity `| null` 死代码 + 误阻断）**：extractSeverity 不做 parseYaml，其 `null` 返回值无合法产生路径（合法 fm 无 severity → safeNum/max 得 {0,0,0,0}）。`| null` 是死分支。真正的"parse 失败→null"只由外层 try/catch 产生并直接让 parseReviewReportFrontmatter 返回 null，不经 extractSeverity。若实现者把"无 severity 合法报告"误映射到 extractSeverity→null，`ship-gates.ts:239-244` 会误阻断干净 pass 报告（违反"双零放行"契约）。

**architect 缺口-3（fallback 降级语义漂移，新缺口）**：fallback.ts:303-316 现有 null 语义双义——(a) 无 severity 字段（:309-311）(b) 异常（:314-316），null 触发 L2→L3 降级。复用 extractSeverity 后，"无 severity 字段"从 null（→降级 L3 更保守）变成 {0,0,0,0}（→当 0 finding 放行 L2），**反转了 fallback 的 L2/L3 决策**。ship-gates 的 null=阻断 ship，fallback 的 null=降级 L3，两者语义本就不同，强行共享 extractSeverity 让 fallback 失去"无证据"判定。

**security 必修（try/catch 过宽反模式）**：spec 的 try/catch 捕获所有异常且静默（design.md:93），会把未来编程 bug（TypeError 等）也吞成"阻断 ship"——安全 fail-closed 对，但工程上是调试黑洞。须二选一：(a) 收窄到 YAMLParseError 重抛其余，或 (b) 宽捕获但加 `console.error` log。推荐 (b)。

**security 残留（文档化即可）**：extractSeverity 入参需自防 null（防未来调用方直传 null）；超大 frontmatter OOM / 深嵌套栈溢出在"攻击者写报告"模型下弱、自产报告模型下成立——spec 须显式记录此前提。

**product 元判断（重要）**：虚假收敛已 4 次（Round 3/4/5/6 都说"根治"下一轮又翻车），是"AI 审 AI"回音壁的系统性局限。方案本身可行（实测 ship-gates.ts:238-244 fail-closed 路径真实存在）。**强烈建议：本轮修订后停 decide，转 PoC（TDD 回归矩阵实测），设 decide 预算（单 REQ ≤4 轮），下次 P0 spec 引入人类 sanity check。**

### Round 7 修订指令（REQ-04 第七次修订，实现细节修正，方向不变）

**P0 必改**：
1. **统一 try/catch 放置点**：删"extractSeverity 内部 try/catch 包 parseYaml"表述，统一为"try/catch 包在 `splitFrontmatterAndBody` 调用外层"（在 parseReviewReportFrontmatter / fallback 调用处）。消除 tasks.md:103 vs :108/:110 矛盾。
2. **extractSeverity 签名去 `| null`**：收窄为 `{p0,p1,p2,p3}`（无 severity 合法报告→{0,0,0,0}，不返回 null）。null 仅属 parseReviewReportFrontmatter（表示 frontmatter 整体解析失败）。消除误阻断陷阱。

**P1 必改**：
3. **fallback 降级语义保护**：复用 extractSeverity 时，fallback 须保留"无证据"判定（如 `hasAnySeverityField(fm)` 谓词），确保"L2 无证据→降级 L3"不变式不被反转。补对应回归测试。
4. **try/catch 可观测性**：宽捕获但加 `console.error("[ship-gates] severity parse failed:", e)` log（或收窄到 YAMLParseError 重抛其余）。防调试黑洞。
5. **extractSeverity 入参自防 null**：首行 `if (!fm) return {p0:0,p1:0,p2:0,p3:0}`。

**文档化（不硬修）**：
6. 记录"frontmatter 体积可控"前提：仅在自产报告模型下成立；攻击者写报告模型下 OOM/栈溢出为残留风险（威胁现实性低，需 repo 写权限）。

### Round 7 放行项
REQ-01/02/03/05/06 全部放行（多轮稳定）。

### product 收尾声明
三视角在 Round 7 的发现均为**实现细节级**（try/catch 放置点、签名、fallback 谓词、log），**不涉及方向变更**。本轮修订后，REQ-04 的方案方向（splitFrontmatterAndBody + extractSeverity + max + safeNum + 结构化 fail-closed）已无方向性争议，剩余风险应交 TDD 回归矩阵实测（PoC），不再开 Round 8 纸审。

### Round 7 修订落实（2026-06-26）

spec 三件套已按 Round 7 指令修订 REQ-04（第七次），重审核对——**spec 自相矛盾已消除**：

| Round 7 指令 | 落实 | 状态 |
|---|---|---|
| P0-1 统一 try/catch 在 splitFrontmatterAndBody 调用外层（消除 tasks:103 vs :108 矛盾） | requirements/design/tasks 一致，明确"不是 extractSeverity 内" | ✅ |
| P0-2 extractSeverity 去 `\| null` 签名 | 三文件签名统一为 `{p0,p1,p2,p3}` | ✅ |
| P1-3 fallback `hasAnySeverityField(fm)` 谓词保护 L2→L3 降级语义 | 谓词 + 回归测试 + DoD | ✅ |
| P1-4 try/catch 加 console.error log（可观测，防调试黑洞） | 三文件 + 测试验证 | ✅ |
| P1-5 extractSeverity 入参自防 null | 首行 if(!fm) + 测试 | ✅ |
| 文档化 frontmatter 体积前提 | 决策文档记录（spec 内避免膨胀） | ✅ |

**重审结论：Round 7 的 spec 自相矛盾（try/catch 放置点）、null 签名陷阱、fallback 降级语义漂移、try/catch 过宽反模式均已修正，方向无变更，spec 内部一致。**

---

## ✅ 最终确认（2026-06-26）

**Spec 已 approved，进入 plan → build。**

- requirements.md / design.md / tasks.md frontmatter `status: approved`、`approved: 2026-06-26`。
- 决策文档 `status: confirmed`。

### 进入 build 的执行顺序（hotfix 优先）

1. **T-05（P0 hotfix，最优先）**：闭合 ship-gate severity P0 漏洞。**按 product 建议走 TDD PoC**——先写回归矩阵（块式/流式 + 四格式 + NaN/负数 + 畸形/alias bomb + 双零 + 早返 + fallback 降级），跑 RED，再实现 extractSeverity + hasAnySeverityField + 外层 try/catch + log，跑 GREEN。**PoC 绿即 ship，失败再回炉**（不再开纸审）。
2. **Wave 1 并行**：T-01（删 state-machine）+ T-06（spec 巡检脚本）—— 与 T-05 独立。
3. **Wave 2-4**：T-02（拆 plan.ts，DAG 预验证）→ T-03（path.join 局部常量）→ T-07（巡检 --fix）+ T-08（dist sync，须先解 Open Question #3）。
4. **收尾**：T-09（不变式终验）→ spec status: completed。

### 流程改进记录（product 建议，供未来 spec 参考）

本轮 decide 暴露"AI 生成 spec → AI 审 spec"回音壁（虚假收敛 4 次）。记录三条改进供项目演进：
1. **设 decide 预算**：单 REQ decide 轮数硬上限（建议 ≤4 轮），超限强制转 PoC（TDD 实测）。
2. **P0 安全收紧类 spec 引入人类 sanity check**：打破 AI-审-AI 共享盲区。
3. **格式枚举类问题优先 spike corpus**：不要用推理解决经验事实问题（Round 5 的教训）。

---

## Build 阶段执行记录（2026-06-26）

### T-05（P0 hotfix）— ✅ 已交付

`fix(ship-gates): close severity parsing P0`（commit bceaa7a5）。
- RED：3 测试文件 8 fail（P0 真实复现：嵌套报告被读成 0 放行）。
- GREEN：`src/review/severity-parser.ts`（extractSeverity + hasAnySeverityField）+ ship-gates.ts/fallback.ts 改造。
- 验证：新测试 34 pass + 既有回归 122 pass；tsc/biome/dist-sync（316 matched）全过。
- 与 7 轮 decide 收敛的 spec 完全一致。

### T-01（删 state-machine）— ⚠️ 判断反转，撤销执行

**build 实证推翻了 spec 的 T-01 前提**：state-machine **不是零引用孤岛死代码**。

原判断链（架构报告 P0-1 + Round 1-7 + spec）的盲区：判定"孤岛"时只 grep 了 `src/` 内部 `import`，忽略了 `packs/`（数据目录）+ 测试通过 `src/state-machine/index.js` 公开 API 的使用链。

build 阶段实证：
- `grep -rln "from.*state-machine" src/ scripts/` 确实 0 import（这是原判断依据）。
- 但 `test/pms-pack/integration.test.ts` 和 `test/pack/zero-pack-invariant.test.ts` 通过 `loadStateMachineDefinition`/`validateDefinition`/`deriveStatePropertyTests` 使用 state-machine 引擎。
- `packs/pms/` 下有 **5 个真实状态机 yaml**（folio/room-status/housekeeping-task/reservation 等），pms-pack 集成测试加载验证它们。
- `src/pack/types.ts:22` 的 `"state_machines"` 字符串是 pack 类型系统的 category，是被忽略的线索。
- 实测：`vitest run test/pms-pack/integration.test.ts test/pack/zero-pack-invariant.test.ts` → **32 pass**，证明 state-machine 是 pms pack 系统的活依赖。

**结论**：state-machine 是 pms pack 系统的核心引擎，删除会破坏 pack 运行时验证。**T-01 撤销，不执行删除。** 若未来要退役 state-machine，须先迁移 pms pack 的状态机验证路径。

**教训**：判定死代码不能只看 `src/` 内 import，必须扫 `packs/`/`rules/` 等数据目录 + 测试通过公开 API 的使用链。`code-slim-0612` 当初也声明"无死代码"，与此结论一致（它检查过 pack 维度）。

### T-06（spec status 巡检脚本）— ✅ 已交付

`feat(scripts): spec status inventory linter`（commit）。
- `scripts/check-spec-status.mjs` + 5 测试（RED→GREEN 全绿）。
- 真实巡检立即暴露 spec 库漂移：447 spec 文件、25 缺失 status、71 warning（quoted 变体如 `"draft"`、unrecognized 值如 `obsolete`/`retired-partial`/`in_progress`）——证明本工具有现实价值。

### 实现期额外发现（脚本开发）

Node ESM parser 在 shebang + 注释含 `` ` `` 反引号包 `{...}` 花括号时会抛 `SyntaxError: Unexpected token '.'`（位置追踪 bug）。规避：注释中不要用反引号包裹花括号字面量。已记录在脚本注释规范。

---

## Deferred 任务重启结果（2026-06-26 第二轮 build）

T-02/T-03/T-08 经首次 build 标记 deferred 后重启，**逐个做 build 阶段实证**（沿用 T-01 教训：refactor 类 spec 判断不可全信）。结论分化：

### T-02（拆 plan.ts）— ✅ 交付（PR #141）

实证修正了 spec 的 3 处错误：
1. **5 模块而非 4**：execution-package 与 task-graph-bridge 零内部耦合，独立成模块。
2. **TaskGraph 不下沉**：`src/task-graph.ts:36` 已定义 TaskGraph（零依赖），下沉到 types.ts 会让 task-graph.ts 反向依赖 plan → 成环。
3. **madge 未安装**：循环检测改用 `tsc --noEmit`（已能报 import cycle）。

**项目惯例发现**：`moduleResolution: bundler` + 显式 `.js` 需保留 `plan.ts` re-export shim（对齐 decide 模式），非裸目录 barrel。

拆成 types(150)/format(213)/task-graph-bridge(112)/execution-package(344)/validate(344) + plan.ts shim(80)，均 ≤400 行。**验证**：tsc 无环 / 全量 8901 测试零回归 / check-public-api OK / dist-sync 321 matched。

### T-03（.forge 路径常量）— ⚠️ 实证后撤销，保持 deferred

实证推翻 spec 价值假设（与 T-01 同款"spec 计数高估价值"）：
- 93 文件 / 351 命中，但**真实形态是点状用法**：80+ 文件仅 1-2 处 `path.join(root, ".tinkerman", ...)`，抽局部常量是**负收益**（一处用一次，常量化反成噪音）。
- 唯一重度重复的 doctor.ts（28 处）**已有 `forgeRoot` 局部常量**，且 28 处里大量是 `source: ".tinkerman/status.md"` 这种**给用户看的展示字符串**（非路径构造，不能常量化）。
- 真正值得动的仅 doctor.ts ~5 处路径构造——投入产出比极低。

**结论**：spec 基于表面计数（39/103/351）高估价值，实证发现真实收益点极少。**撤销，保持 deferred。**

### T-08（dist sync 减噪）— ⚠️ spec 诊断部分不成立，撤销

实证发现 sync 机制**已是 spec 想要的合并式**：
- `.github/workflows/sync-derived-data.yml` 配置 `on: push: branches: [main]`——每次 PR merge 后跑**一次合并的 sync commit**（非 spec 说的"每改一次一条"）。
- 159 次 sync 是"每 PR merge 一次"的自然累积（近 50 提交 11 次），噪音真实但**机制本身已合并式**。
- 进一步降频（每 N PR 才 sync）会让 README/dist 短暂漂移，与 dist-sync-guard R1 冲突。

**结论**：spec 想优化的"每改一次一条"前提不存在，**实质已达成，撤销。**

### 重启的元结论

T-01（撤销）/T-03（撤销）/T-08（撤销）/T-02（交付但修正 3 处）——**4 个 refactor 任务里 3 个实证后不该做或前提不成立**。这再次验证 `dead-code-assertion-gate` spec 的核心论点：**refactor 类任务的 spec 判断必须 build 阶段实证，AI 生成的 spec（含计数/价值评估）系统性偏乐观**。这也印证 product 在 Round 7 对"AI-审-AI 回音壁"的判断——价值评估同属共享盲区。

### T-01 文档数字修正

前文 T-01 段记"packs/pms 5 个 yaml"是事实漂移，实测为 **4 个**（folio/room-status/housekeeping-task/reservation）。已在此修正，dead-code-assertion-gate spec 用正确数字。
