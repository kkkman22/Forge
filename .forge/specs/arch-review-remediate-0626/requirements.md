---
status: approved
feature: arch-review-remediate-0626
layout: requirements
created: 2026-06-26
revised: 2026-06-26
approved: 2026-06-26
tier: full
work_nature: refactor
brownfield: true
import_source: "Forge-架构审核报告.md"
decision_ref: ".forge/decisions/2026-06-26-arch-review-remediate-0626.md"
upstream_review: "Forge-架构审核报告.md（已据 复核情况说明.md 修订）"
decide_rounds: 7
decide_final_verdict: "approved (REQ-04 经 7 轮收敛，方向无争议，剩余风险交 TDD PoC)"
related_adrs:
  - "ADR-0008"
health:
  score: 0
  verdict: "pending"
deferred_tasks:
  - task: "T-02"
    title: "拆分 plan.ts 为 plan/ 子目录"
    reason: "纯整洁性收益（plan.ts 1127 行是上帝文件但无 bug）。T-01 反转证明 refactor 类任务的 spec 依赖判断不可靠，需 build 阶段实证；ROI 低于已交付的 P0 hotfix。"
  - task: "T-03"
    title: ".forge/ path.join 局部常量（降级版）"
    reason: "product Round 1 判定'重命名 .forge 几无发生概率，价值偏防御性'；降级版（39 处局部常量）ROI 更低。无真实危害驱动。"
  - task: "T-08"
    title: "dist sync 触发优化"
    reason: "依赖未决的 git 工作流（Open Question #3）；dist 是 gitignore 本地产物（已修正原报告'dist 入库 3555 文件'误判），commit log 噪音影响有限。"
---

> **✅ APPROVED 2026-06-26**（经 7 轮 decide 收敛）。REQ-04（P0 安全收紧）方向无争议，实现细节已修正（splitFrontmatterAndBody 外层 try/catch + extractSeverity 去 null + fallback hasAnySeverityField 谓词 + log 可观测）。按 product 建议，剩余风险交 TDD 回归矩阵实测（PoC），不再纸审。

# Requirements — Arch Review Remediate 0626

## 目标

执行《Forge 项目架构审核报告》中经实测复核确认有效的架构精简项，降低项目"概念膨胀"与状态契约脆弱度。所有改动须**对外行为完全不变**（除 REQ-04 明确的安全语义增强），并以 TDD（RED→GREEN→REFACTOR）执行。

本 spec 仅收录报告行动项中**实现期复核后仍成立**的条目。原报告 6 项行动建议中，3 项经复核为误判或与现有 locked spec 冲突，已在「非目标」中明确排除并记录原因（对齐 `audit-remediate-0619` 的审计痕迹惯例）。

## 非目标

为避免与现有 spec 冲突或基于误判立项，以下原报告条目**明确排除**：

- **不删 `skill-scheduler` 13 状态机**（原报告 P0-1）—— 经核实为误判：`src/sdk-status-helpers.ts:17` `import { getCommandSequence } from "./skill-scheduler.js"`，它是**生产路径**，且被 `audit-remediate-0619` 的契约测试依赖。删除会引入真实回归。
- **不拆 `accept-driver.ts`**（原报告 P0-2 / 行动项 #2）—— 被 `agentic-acceptance`（status: locked, 2026-06-17）占用，该 spec 全部围绕在 `accept-driver.ts` 内新增 `agentBrowserRunner`。拆分直接冲突。如需拆分须先重新开启/修订 agentic-acceptance。
- **不处理 frontmatter "各写一遍"**（原报告 P1-1）—— 经核实为误判：存在集中模块 `src/frontmatter.ts`（`parseFrontmatter`/`extractStringField`/`extractListField`/`extractNumericField`），`decide/adr.ts`、`status-manager.ts` 均通过 import 复用，未重复实现。该条仅 .forge 路径常量部分有效，归入 REQ-03。
- **不把 `cursor-team-kit-integration` 当作 spec 漂移修复**（原报告 §三.2）—— 经核实 status: completed，核心已交付（`src/verify.ts`、`src/verdict-parser.ts`、`rules/` 三条原子规则）。仅 HTML 深色画布评审有缺口，属狭窄后续问题，不在本架构清理 spec 范围。
- **不重做 code-slim-0612 已验证范围**——该 spec status: completed，已验证 6 模块无死代码；本 spec 的 REQ-01 针对的是它**未覆盖**的 `state-machine/`。
- **不修 dist-sync-guard R1 完整性契约**——REQ-05 只优化触发频率，必须保住"src 改则 dist 必同步"。

## Deferred 任务（build 阶段 2026-06-26 判定）

build 阶段实证后，以下任务**降级为 deferred**（暂不执行，待明确诉求 + build 实证再重启）：

- **REQ-01 / T-01（删 state-machine）— 判断反转，撤销**：build 阶段发现 state-machine **不是零引用孤岛**，而是 pms pack 系统的核心引擎。`packs/pms/` 有 5 个真实状态机 yaml，`test/pms-pack/integration.test.ts` + `test/pack/zero-pack-invariant.test.ts`（32 测试）通过 `loadStateMachineDefinition`/`validateDefinition` 公开 API 使用它。7 轮 decide + 架构报告的盲区：只 grep `src/` import，忽略 `packs/` 数据 + 测试公开 API 使用链。**不删；若退役须先迁移 pms pack 验证路径。**
- **REQ-02 / T-02（拆 plan.ts）— deferred**：纯整洁性收益（1127 行上帝文件但无 bug）。T-01 反转证明 refactor 类任务的 spec 依赖判断不可靠，需 build 实证；ROI 低于已交付的 P0 hotfix（PR #139）。
- **REQ-03 / T-03（.forge path 常量）— deferred**：product Round 1 判定"重命名 .forge 几无发生概率，价值偏防御性"；降级版 ROI 更低，无真实危害驱动。
- **REQ-05 / T-08（dist sync 触发优化）— deferred**：依赖未决 git 工作流（Open Question #3）；dist 是 gitignore 本地产物，commit log 噪音影响有限。

> **已交付**：REQ-04 / T-05（P0 hotfix，PR #139）、REQ-06 / T-06（spec 巡检脚本 + status 清理，PR #140）。

## 全局不变式（所有 REQ 必须满足，任一违反 = 阻断 ship）

| ID | 不变式 | 验证 |
|----|--------|------|
| INV-1 | 公开 API / CLI 退出码与 stdout / MCP tool 名称与参数 / `forge init` 产物——行为不变 | `npx vitest run` 全绿 + 对外契约测试 |
| INV-2 | 安全控制不弱化：路径 normalization、allowlist、deny、元字符检测、audit+HMAC、execFile 构造 | grep diff 无 `throw/reject/deny/normalize/allowlist/metachar` 删除行未配等价替换 |
| INV-3 | 被 scripts/ import 的 `dist/src/*.js` 路径不移动/不重命名（REQ-02 拆分 plan.ts 时尤其注意） | grep scripts/ 的 dist import 路径在 src 侧仍存在 |
| INV-4 | 安全/降级测试不删除：`test/review*`、`test/security/*`、adversarial corpus 相关 | git diff 无这些文件删除 |
| INV-5 | 每个改动验证：`npx tsc --noEmit && npx vitest run` 全绿 | bash exit 0 |
| INV-6 | 每个子任务结束 `dist/src/**` 与 src 同步 | `node scripts/check-dist-sync.mjs` 通过 |

---

## REQ-01: 删除 `src/state-machine/` 孤岛目录

**复核结论（实现期核实 2026-06-26）**：原报告 P0-1 称 `state-machine/` "全代码库零引用"。经核实**成立**：
- `grep -rln "state-machine" src --include='*.ts'`（排除自身目录）返回 **0**。
- 仅 `test/` 下有引用（property/validator/loader/pack/pms-pack 测试），即该引擎只为自己的测试而存在，无任何生产消费者。
- 与 `workflow-graph.ts`（生产阶段图）、`loop/phase-transitions.ts`（生产推进器）职责重叠但互不依赖——名字最像核心调度器，实为孤岛，造成认知误导。

**Current State**：`src/state-machine/` 5 文件（index/loader/property-derivation/types/validator）+ 对应测试。无 src/scripts 消费者。

**Requirement**：
- WHEN `src/` 目录中移除 `state-machine/` THEN 全部 `npx vitest run` 测试 SHALL 仍全绿（证明无生产依赖）。
- WHEN 移除后执行 `grep -rn "state-machine" src --include='*.ts'` THEN 返回 0 行。
- WHEN 移除后执行 `npx tsc --noEmit` THEN 编译 SHALL 通过。

**Verify-By**: vitest + tsc
**Evidence**：删除前后 `vitest run` 均全绿的输出对比；`grep state-machine src/` 空结果。

---

## REQ-02: 拆分 `src/plan.ts`（1127 行 / 46 导出）为 `src/plan/` 子目录

**复核结论**：原报告 P0-2 列 `plan.ts` 为上帝文件。经核实**成立**：1127 行、46 个导出，混合验证 + 格式检测 + 轻量验证 + 任务图升级多职责。无现有 spec 占用（与 `accept-driver.ts` 被 locked spec 占用不同）。

**Current State**：单文件 `src/plan.ts`，职责混杂：
- 格式/结构检测（plan 文件合法性）
- 完整性验证（plan 字段校验）
- 轻量验证路径
- 任务图升级逻辑

**Requirement**：
- WHEN 拆分为 `src/plan/`（如 `format.ts`/`validate.ts`/`task-graph.ts` + `index.ts` barrel）THEN 所有现有 import 路径 `from "./plan.js"` SHALL 保持可用（通过 barrel re-export，INV-3）。
- WHEN 拆分后执行 `npx vitest run` THEN 所有 `test/plan*.test.ts` SHALL 全绿且无新增失败。
- WHEN 拆分后执行 `node scripts/check-dist-sync.mjs` THEN SHALL 通过（dist/src 路径对外不变）。
- 单个拆分子文件行数 SHALL ≤ 400 行（可维护性目标）。
- **barrel 循环依赖预防（decide P0 补充）**：拆分前 SHALL 在 design 阶段预先验证 4 子模块的 DAG 依赖方向（预计 `types ← format ← validate ← task-graph`），因为 `plan.ts:28` 现 import `./task-graph.js` 而 `toTaskGraph`/`detectCycleInTasks`/`validateTopologicalOrder` 共享图类型——不能只靠 GREEN 后 `madge --circular`，须在 RED 阶段就用静态分析确认无环。

**Verify-By**: vitest + tsc + check-dist-sync
**Evidence**：拆分前后测试全绿对比；各子文件 `wc -l` ≤ 400；`git mv` 历史。
**Open Question**：barrel 是否引入循环依赖？需在 design 阶段验证依赖方向。

---

## REQ-03: `.forge/` 路径常量化（降级版：仅 path.join 场景 + 新代码渐进迁移）

> **decide 重判（2026-06-26）**：原 REQ-03 是"新建 forge-paths.ts + 替换 103 处全量硬编码"。Round 2 Critic 指出两点：(1) 与 ADR-0008 Decision #3"不新增 adapter 层"**直接冲突**；(2) 数量口径错——实测 93 文件 / 351 命中行，其中 6+ 处在 `.includes(".forge/...")` / regex 里，**不可安全替换**（会破坏子字符串语义）。故 REQ-03 **降级**：不建集中模块，只做渐进迁移。

**复核结论（重判后）**：
- 不新建 `forge-paths.ts` + `resolveForgePath()`（避免新增抽象层，服从 ADR-0008 #3）。
- 真正可安全替换的是 **39 处 `path.join(..., ".forge", ...)`** 模式（纯路径构造，行为严格等价）。
- `.includes(".forge/...")` / regex 中的 6+ 处**列入白名单不替换**（子字符串语义，替换即破坏）。
- sandbox deny 项（`sandbox-policy.ts` 的 `.forge/sandbox.json` 等）**单独处理**，须加值等价断言（防 deny 漂移→绕过，P1 安全要求）。

**Current State**：39 处 `path.join` 含 `.forge` 字面量；6+ 处 `.includes`/regex 依赖子字符串语义；sandbox deny 硬编码。

**Requirement**：
- WHEN 替换 39 处 `path.join(..., ".forge", ...)` 为局部常量（如模块顶部 `const FORGE_DIR = ".forge"`）THEN `npx tsc --noEmit && npx vitest run` SHALL 全绿（行为严格等价，纯字符串提取）。
- THE 替换 SHALL NOT 引入跨模块集中常量文件（服从 ADR-0008 #3）；常量作用域限于使用它的模块。
- WHEN 替换 sandbox-policy 的 deny 项 THEN SHALL 新增值等价单测，断言常量值与原字面量字符串完全一致。
- THE `.includes(".forge/...")` / regex 处 SHALL 列入白名单，在 PR 说明不替换原因。
- 新增的 src 代码若需 `.forge` 路径 SHALL 使用所在模块的局部常量（防新增散布）。

**Verify-By**: vitest + tsc + grep 白名单
**Evidence**：39 处 path.join 替换前后测试全绿；sandbox deny 值等价单测；白名单文档（6+ 处不可替换项）。
**ADR-0008 amendment（隐含）**：本 REQ 不新建 adapter 层，通过"局部常量 + 渐进迁移"实现魔字符串治理，不违背 #3。

---

## REQ-04: 修复 review 报告 severity 解析的 pipeline 级数据漂移（含 ship-gate P0 漏洞）

> **decide Round 3 重判（2026-06-26）**：Round 2 把 REQ-04 定为"修 fallback.ts 读 `new_p0` 的 bug"，但 Round 3 三视角实测发现该修订本身有误，且揭示了**当前代码已存在的 P0 安全漏洞**：
> - **字段名又错**：Round 2 写 `severity_counts.new_p0`，但实测 9 份报告主流嵌套字段是 `p0`（无 `new_`），`new_p` 仅 1 例特例。
> - **范围漏了 ship gate**：`ship-gates.ts:114` 用正则 `^p0_count:` 只读扁平，是 ship 放行真正执行点（`:259 if(p0Count>0) block`）。一份 `severity_counts:{p0:1}` 的 blocked 报告被读成 `p0Count=0` → **错误放行 P0 阻断的 ship**。
> - **根因是 pipeline 级 schema/数据漂移**：schema + 4 reader 全认扁平 `p0_count`，但实际报告（人工/外部 Agent 写）用嵌套（两种变体）。
>
> **decide Round 7 重判（2026-06-26）**：Round 6 方案方向正确，但用怀疑视角审出 3 处实现细节问题（均为方向不变级）：
> - **try/catch 放置点 spec 自相矛盾（architect P0）**：tasks 曾写"extractSeverity 内部 try/catch 包 parseYaml"，但 extractSeverity 接收 fm 对象不做 parseYaml，异常实际在 splitFrontmatterAndBody(frontmatter.ts:28) 内抛。照错处写则 P0 不闭合。统一为"try/catch 包 splitFrontmatterAndBody 调用外层"。
> - **extractSeverity `| null` 是死代码 + 误阻断陷阱（architect）**：去 null，无 severity 合法报告→{0,0,0,0}（放行），null 仅属 parseReviewReportFrontmatter。
> - **fallback 降级语义漂移（architect 新缺口）**：fallback 现有 null 双义触发 L2→L3 降级，复用 extractSeverity 会把"无证据→降级 L3"反转为"无证据→0 finding 放行 L2"。须保留 `hasAnySeverityField(fm)` 谓词保护降级语义。
> - **try/catch 过宽反模式（security）**：须加 console.error log 防调试黑洞。
> - **product 元判断**：虚假收敛已 4 次，AI-审-AI 回音壁。本轮修订后**停 decide 转 PoC**（TDD 回归矩阵实测），设 decide 预算，下次 P0 spec 引入人类 sanity check。
>
> 故 REQ-04 第七次修订（实现细节修正，方向不变）：**统一 try/catch 放置点（外层）+ extractSeverity 去 null + fallback 降级谓词 + try/catch 可观测性 log + 入参自防 null**。

**复核结论（Round 3 根治版）**：
- **Canonical 格式**：扁平 `p0_count/p1_count/p2_count/p3_count`（schema `review-report.ts:52` 已表态，src/ 无 writer 写嵌套 → 嵌套报告来自外部，扁平是标准）。
- **Legacy 容错**：实际存在两种嵌套变体须兼容——`severity_counts:{p0,p1,p2,p3}`（主流）和 `severity_counts:{new_p0,...}`（特例）。
- **P0 漏洞点**：`ship-gates.ts:114`（ship 放行执行点）只读扁平，对嵌套报告失效。
- **新鲜度职责**：归 `ship.ts:168 checkReviewFreshness`，本 REQ 不碰（Round 2 已厘清）。

**Current State**：
- `ship-gates.ts:114`：正则 `^p0_count:` 只读扁平 → **P0 漏洞**（嵌套 blocked 报告被放行）。
- `fallback.ts:304` / `state.ts:216` / `quality-gate.ts:84`：读扁平 `p0_count`，对嵌套报告取 0/null。
- `schemas/review-report.ts:52`：schema 定义扁平（canonical）。

**Requirement**：
- THE severity 解析 SHALL 放弃正则，**改用 YAML parser**（复用项目既有惯例：`yaml@2.8.4` + `parseYaml`，见 `src/review/frontmatter.ts`、`src/spec-leak-detector.ts` 等 10+ 处先例）。理由：`severity_counts` 有块式（多行）和流式（inline map `{...}`）两种 YAML 结构，正则需 4 格式 × 2 结构 = 8 分支且流式匹配有 ReDoS/子串边界风险；YAML parser 天然统一处理。
- THE 修复 SHALL 用 `splitFrontmatterAndBody`（`src/review/frontmatter.ts:19`，**已 parseYaml 返回 fm 对象**）取 frontmatter 对象，`extractSeverity(fm: Record<string, unknown>): {p0,p1,p2,p3}` 接收**对象而非 raw 文本**（Round 6 工具选型修正，消除二次 parseYaml）。供 ship-gates/fallback 复用。
- **extractSeverity 签名 SHALL 不含 `| null`**（Round 7 修正）：它接收已 parse 成功的 fm 对象，内部无 parseYaml 调用，故不产生 null。合法 fm 无 severity 字段 → safeNum/max 聚合得 `{0,0,0,0}`（不返回 null）。`null` 语义**只属 `parseReviewReportFrontmatter`**（表示 frontmatter 整体解析失败）。这避免"无 severity 合法报告"被误判 null → ship-gates 误阻断（违反"双零放行"契约）。
- **try/catch 放置点 SHALL 在 `splitFrontmatterAndBody` 调用外层**（Round 7 P0 修正，消除 spec 自相矛盾）：parseYaml 异常实际在 `splitFrontmatterAndBody`（frontmatter.ts:28）内部抛出，**不在 extractSeverity 内**（它不做 parseYaml）。故 try/catch 须包在调用 `splitFrontmatterAndBody` 的外层（即 `parseReviewReportFrontmatter` / `fallback` 调用处），**不是 extractSeverity 内部**。畸形 YAML 抛 `YAMLParseError` 时，外层 catch → `parseReviewReportFrontmatter` 返回 null → `ship-gates.ts:239-244` "Failed to parse" 早返 → `passed:false` 阻断 ship（**绝不崩溃**）。
- **try/catch SHALL 加可观测性**（Round 7 security 修正）：宽捕获但 `console.error("[ship-gates] severity parse failed:", e)` log 后再返回 null（防调试黑洞，对齐 fallback.ts:314 的 catch 模式 + 可观测）。或收窄到 `YAMLParseError` 重抛其余。
- **extractSeverity SHALL 入参自防 null**（Round 7 security）：首行 `if (!fm) return {p0:0,p1:0,p2:0,p3:0}`，防未来调用方绕过 splitFrontmatterAndBody 直传 null。
- **聚合语义 SHALL 为 `Math.max`（fail-closed）+ `safeNum` 钳制**：
  ```ts
  const safeNum = (v) => Number.isFinite(v) && v >= 0 ? v : 0;
  const sc = (fm.severity_counts ?? {}) as Record<string, unknown>;
  const p0 = Math.max(safeNum(fm.p0_count), safeNum(sc.p0), safeNum(sc.new_p0), safeNum(sc.P0));
  ```
  任一格式（扁平 canonical / 嵌套小写 p0 / new_p0 / 大写 P0，YAML parser 自动覆盖块式+流式）>0 即视为该 severity 存在。
- **safeNum 语义**：`Number.isFinite(v) && v >= 0 ? v : 0`。堵 `p0:abc`(NaN)、`p0:-1`(负数)、`p0:1e999`(parseYaml→null→0)、`p0:true`、`severity_counts:[1,2,3]`(数组→sc.p0=undefined→0)、`severity_counts: scalar` 等非数值类型。安全等价（正常报告无这些值）。
- THE `ship-gates.ts:114` `parseReviewReportFrontmatter` SHALL 从纯正则改为 [try/catch 包 splitFrontmatterAndBody 调用] + `extractSeverity(fm)`（**P0 漏洞闭合点 + 异常兜底点**）；`:119` 早返逻辑同步基于 fm 对象判定"有内容"。
- **fallback 降级语义 SHALL 不被反转**（Round 7 architect 缺口-3，新）：fallback.ts 现有 null 双义（无 severity 字段 / 异常）触发 L2→L3 降级。复用 extractSeverity 后，"无 severity 字段"从 null（→降级 L3 更保守）变成 {0,0,0,0}。**为保护降级语义**，fallback 须保留"无证据"判定谓词 `hasAnySeverityField(fm)`（检查 fm 是否含任何 severity 字段），确保"L2 无证据→降级 L3"不变式不被反转为"无证据→当 0 finding 放行 L2"。补对应回归测试。
- **范围（product 建议，采纳）**：本 REQ 优先修 **ship-gates（唯一 ship 放行执行点）**+ fallback（ship 相关）。state/quality-gate 的 severity 误读若无 ship 放行语义，降级为 follow-up。
- THE `schemas/review-report.ts` SHALL 加注释文档化 canonical = 扁平 `p0_count`。长期 follow-up：schema 层考虑拒绝嵌套 severity_counts。

**Verify-By**: vitest
**Evidence**：
- `test/ship-gates-severity-formats.test.ts`（RED→GREEN，**P0 回归矩阵**）：
  - 块式 + 流式两种 YAML 结构各自 → 正确 P0/P1（扁平 `p0_count` / 嵌套小写 `p0` / `new_p0` / 大写 `P0`）；
  - **`severity_counts:{p0:1}` → 阻断 ship**（闭合原 P0）；
  - **`p0_count:0` + `severity_counts:{p0:5}` 混合 → p0=5 阻断**（闭合 Round 4 ?? 链 P0）；
  - **大写 `severity_counts:{P0:2}`（块式+流式）→ 阻断**（闭合 Round 4 大写 P0）；
  - **`severity_counts:{p0:abc}` / `p0:-1` / `p0:1e999` / `p0:true` → safeNum 钳制为 0，不放行提升**（闭合 Round 5 NaN/负数 P0）；
  - **畸形 YAML（`p0: [unclosed`、tab 缩进错乱、alias bomb）→ 阻断 ship 不崩溃**（闭合 Round 6 异常逃逸 P0）；
  - **"双零"（仅 `p0_count:0`）→ 放行**（钉死契约，防 max 误放大）；
  - 只有嵌套字段无扁平字段 → 不早返 null（覆盖 :119）。
- `test/review-severity-parser.test.ts`：`extractSeverity(fm)` 纯函数单测（块式+流式 + 四格式 + safeNum + **入参自防 null** + 缺失返回 0 不崩；**无 `| null` 返回**）。
- `test/review-fallback-severity-regression.test.ts`（Round 7 新增）：验证 fallback 复用 extractSeverity 后**降级语义不反转**——"无 severity 字段报告"仍触发 L2→L3 降级（via `hasAnySeverityField(fm)` 谓词），而非当 0 finding 放行 L2。
- `test/ship-gates-severity-formats.test.ts` 补：畸形 YAML 触发异常时 **console.error 被调用**（可观测性验证）+ 返回 null → passed:false。
**对外行为变化**：修 P0 安全漏洞（嵌套/混合/大写/NaN/畸形 blocked 报告现能正确阻断 ship，不崩溃）——**安全收紧**，符合 INV-2。
**P0 级**：此项是本 spec 唯一的真 P0。**T-05 作为 hotfix 优先 ship（product 建议）**，范围 ship-gates + fallback，其余 reader follow-up。

---

## REQ-05: dist sync 触发策略优化（减 commit log 噪音）

**复核结论**：原报告第四节。经核实**问题成立但归因修正**：
- 原报告称"dist/ 入库 3555 文件导致噪音"**不成立**：`git ls-files dist` 仅 4 文件入库，其余全在 `.gitignore`。
- 真实问题是 sync **频率**：全历史 157 次 "sync derived data" 提交。
- `dist-sync-guard`（status: completed）只管完整性（src 改则 dist 必同步），不管触发频率/去重——此维度未被覆盖。

**Current State**：每次 src 改动可能触发独立 sync 提交；commit log 满屏 `[skip ci]` sync 噪音。

**Requirement**：
- WHEN 一个 feature 分支内有多轮 src 改动 THEN dist sync SHALL 尽量合并为单次提交（而非每改一次一条 sync commit），机制可为：分支内 squash / 仅在 PR 合并前 sync / 检测无 src 变化时跳过。
- THE 优化 SHALL NOT 破坏 dist-sync-guard R1（PR 合并时 src 与 dist 必须同步）—— 即合并到 main 前必须有一次完整 sync。
- THE 优化 SHALL NOT 弱化 `[dist-sync-skip]` 紧急绕过语义。
- WHEN 无 src 变化（纯 docs/测试）THEN SHALL 不产生 sync 提交。

**Verify-By**: git log 计数 + check-dist-sync
**Evidence**：机制说明 + 示例分支的 sync 提交数对比；`check-dist-sync.mjs` 仍通过。
**Open Question**：squash 在 rebase 工作流下是否可行？需在 design 阶段确认团队 git 工作流（PR merge strategy）。

---

## REQ-06: spec 库盘点脚本（轻量，不改已完成 spec）

**复核结论**：原报告 §三.2 称"457 spec 需要'实现验证'清理"，并误把 `cursor-team-kit-integration` 当漂移。经核实：
- `.forge/specs/` 共 **457 个 .md**（含 147 个 design.md）。
- `cursor-team-kit-integration` 实为 completed，非漂移。
- 真实需求是：建立**轻量的 status 标注一致性巡检**，而非逐个改写已完成 spec。

**Current State**：spec 目录无统一 status 巡检；哪些是 draft/locked/completed 依赖人工。

**Requirement**：
- WHEN 运行 `node scripts/check-spec-status.mjs`（新增）THEN 它 SHALL 扫描 `.forge/specs/**/requirements.md`（及单文件 spec）的 frontmatter status 字段，输出 status 分布（draft/locked/approved/completed/缺失）清单。
- THE 脚本 SHALL 对缺失 status 或 status 与目录状态明显矛盾的 spec 给出 warning（非 error，不阻断 CI）。
- THE 脚本 SHALL NOT 修改任何 spec 内容（只读巡检）。
- THE 脚本 SHALL 可选地接受 `--fix` 标志仅补全**缺失**的 status（默认 draft），但 SHALL NOT 覆盖已存在的 status。

**Verify-By**: node 脚本运行 + snapshot
**Evidence**：脚本 `--help` 输出；一次全量巡检的 status 分布报告。
**Note**：本项偏 housekeeping，可独立于前 5 项先行或后行，无依赖。

---

## 验收标准（spec 级）

- [ ] 6 个 REQ 全部实现，各自 Evidence 齐全
- [ ] 全局不变式 INV-1 ~ INV-6 在最终 PR 全部满足
- [ ] `npx tsc --noEmit && npx vitest run` 全绿
- [ ] `node scripts/check-dist-sync.mjs` 通过
- [ ] 非目标中的 4 项排除项在实现期未被违反（无 skill-scheduler 删除、无 accept-driver 拆分、无 frontmatter 重写、无 cursor-team-kit 改写）
- [ ] 原报告 3 处误判（skill-scheduler/frontmatter/cursor-team-kit）在本 spec 的实现期复核章节留痕，防止未来重提

## 依赖

- 无外部 spec 依赖。
- REQ-02（拆 plan.ts）在 REQ-03（路径常量）**之前**执行（见 tasks.md Wave 2→3）；REQ-03 的硬编码替换（T-04）在 plan/ 子目录就位后再做，避免新拆出的子模块引入新的 .forge 硬编码漏扫。
- REQ-05 依赖确认团队 git 工作流（见 Open Question）。
