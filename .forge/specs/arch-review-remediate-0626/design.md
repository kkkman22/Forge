---
feature: arch-review-remediate-0626
layout: design
created: 2026-06-26
revised: 2026-06-26
approved: 2026-06-26
tier: full
work_nature: refactor
brownfield: true
decide_rounds: 7
---

# Design — Arch Review Remediate 0626

## Overview

本设计针对 requirements.md 的 6 个 REQ 提供架构级方案。核心原则（Round 3 后）：**5 项对外行为不变，REQ-04 为有意的安全收紧（闭合既有 P0 漏洞）**。设计区分三类工作：

- **纯结构 refactor**（REQ-01/02/03/06）：删孤岛、拆文件、局部常量、加巡检——无对外语义变化。
- **安全收紧 / P0 修复**（REQ-04）：闭合 `ship-gates.ts:114` 的 severity 解析 P0 漏洞（嵌套 blocked 报告现能正确阻断 ship），抽共享 `extractSeverity` 统一 pipeline 格式漂移。
- **流程优化**（REQ-05）：dist sync 触发策略——属工程流程，不改代码契约。

设计对齐 `code-slim-0612` 的"等价 refactor + 不变式守护"模式。

---

## Current State（brownfield）

| 区域 | 现状 | 问题 |
|------|------|------|
| `src/state-machine/` | 5 文件（index/loader/property-derivation/types/validator），src/ 0 引用，仅 test/ 自测 | 孤岛，认知误导 |
| `src/plan.ts` | 1127 行 / 46 导出，混合 4 类职责 | 上帝文件 |
| `.forge/` 路径 | 103 个 ts 文件硬编码字面量 | 状态契约脆弱根源 |
| `src/review/fallback.ts:289` `tryParseCiEvidence` | 只校验路径无穿越 + 取 p0/p1 count，不校验 diff 对应 | 过期报告可误放行 ship |
| dist sync | 每次改动可能独立提交，157 次 sync commit | commit log 噪音 |
| `.forge/specs/` | 457 .md，无 status 一致性巡检 | status 漂移不可见 |

---

## Proposed Change

### REQ-01 删除 `src/state-machine/`

**变更**：`git rm -r src/state-machine/` 及其专属测试目录。
**保留验证**：删除后跑全量 vitest，若全绿则证明无生产消费者（RED 期望：若有隐藏引用会编译失败/测试失败）。
**无 Component Interface 变化**（无消费者）。

### REQ-02 拆分 `src/plan.ts` → `src/plan/`

按导出的内聚类（已核实 46 个导出的职责分布）拆为 4 子模块 + barrel：

```
src/plan/
├── index.ts            # barrel: re-export 全部 46 个导出，保持 `from "./plan.js"` 可用
├── types.ts            # 类型定义：TDDSteps/AtomicTask/TaskWeight/WeightedPlanTask/
│                       #   ExecutionPackage/PlanFormat/LightweightTask 等 (~15 导出)
├── validate.ts         # 验证逻辑：validateAtomicTask/validateSpecLocked/
│                       #   validateDependencies/validatePlanTasks/validateLightweightPlan/
│                       #   validatePlan/validateDesignReferences/validateOverweightTaskSplits 等
├── task-graph.ts       # 任务图：toTaskGraph/detectCycleInTasks/validateTopologicalOrder/
│                       #   generateExecutionPackages/classifyTaskWeight/checkPlanStructure
└── format.ts           # 格式/规范化：detectPlanFormat/scanForPlaceholders/
                        #   normalizeTaskTerms/normalizeAtomicTask/extractHeadingAnchors/
                        #   checkExpectedOutput/lockPlan/escapeForRegExp
```

**Barrel 策略**（保 INV-3，scripts/ 的 dist import 不变）：
- `src/plan/index.ts` re-export 全部，外部 `import { validatePlan } from "./plan.js"` 解析到 `plan/index.js`。
- **已核实（2026-06-26 + decide 复核）**：`scripts/` 中所有 `plan` 引用均为 `active-plan.json` 数据文件，**无任何 script import `dist/src/plan.js`**，故路径变化不破坏 INV-3。

**循环依赖预防（decide P0 要求前置）**：4 子模块依赖方向须为 DAG。**在 RED 阶段就用静态分析确认**，不能只靠 GREEN 后 madge：
- 预期方向：`types.ts`（被依赖）← `format.ts` ← `validate.ts` ← `task-graph.ts`。
- **风险点**：`plan.ts:28` 现 `import { ... } from "./task-graph.js"`，而 `toTaskGraph`/`detectCycleInTasks`/`validateTopologicalOrder`（行 343/544/597）共享图类型。若 task-graph 子模块又依赖 validate，则成环。
- **验证**：拆分前先 `npx madge --circular src/plan.ts` 建立基线（单文件无环）；拆分后 `npx madge --circular src/plan/index.ts` 须仍无环；若成环，调整类型归属（把共享的 `TaskGraph` 类型下沉到 `types.ts`）。

### REQ-03 `.forge/` 路径常量化（降级版：局部常量，不建集中模块）

> **decide 重判**：不新建 `forge-paths.ts` + `resolveForgePath()`，服从 ADR-0008 #3"不新增 adapter 层"。

**方案**：在含 `path.join(..., ".forge", ...)` 的模块顶部加**局部常量** `const FORGE_DIR = ".forge"`，39 处 path.join 场景渐进替换。
**白名单（不替换）**：6+ 处 `.includes(".forge/...")` / regex（子字符串语义，替换破坏行为）。
**sandbox deny 特例**：`sandbox-policy.ts` 的 `.forge/sandbox.json` / `.sandbox-active.json` 若替换，**须加值等价单测**（断言字符串完全一致），防 deny 漂移→绕过。建议 sandbox-policy 这几处**不替换**（风险 > 收益），仅加注释。
**不引入**：跨模块集中常量文件、`resolveForgePath` helper。

### REQ-04 修复 review severity 解析 + 闭合 ship-gate P0 漏洞（Round 6 根治版：YAML parser + 异常兜底）

> **decide Round 6 重判**：Round 5 YAML parser 路线正确，但 extractSeverity 缺 try/catch 兜底（parseYaml 异常逃逸 = availability P0）。本版补异常兜底 + 工具选型修正。

**真实 P0 漏洞（原）**：`ship-gates.ts:114` 正则 `^p0_count:\s*(\d+)` 只读扁平；`:259` 基于 `p0Count>0` 阻断 ship。嵌套 blocked 报告 → 读 0 → 错误放行。

**Round 6 新 P0（异常逃逸）**：`ship-gates.ts:238` 调用无 try/catch；Round 5 方案 `parseYaml(raw) ?? {}` 只兜空值不兜 `YAMLParseError`。畸形 frontmatter → 异常逃逸 → **ship 崩溃**（availability 故障）。正确 fail = 结构化 fail-closed（返回 blocking GateResult，复用 `:239-244` "Failed to parse" 早返路径阻断 ship），非崩溃。

**方案（Round 7 根治：splitFrontmatterAndBody 外层 try/catch + extractSeverity 去 null + fallback 谓词 + log）**：
1. **用 `splitFrontmatterAndBody`（`review/frontmatter.ts:19`，已 parseYaml 返回 fm 对象）** 取 frontmatter（消除二次 parseYaml）。
2. **try/catch 包在 `splitFrontmatterAndBody` 调用外层**（Round 7 P0 修正——parseYaml 异常在 frontmatter.ts:28 内抛，**不在 extractSeverity 内**）：在 `parseReviewReportFrontmatter` / `fallback` 调用 `splitFrontmatterAndBody` 处外包 try/catch——异常 `console.error` log（可观测性，防调试黑洞）后返回 null → `parseReviewReportFrontmatter` 返回 null → `checkShipGate:239-244` "Failed to parse" 早返 → `passed:false` 阻断 ship。**绝不崩溃**。
3. **extractSeverity(fm) 签名去 `| null`**（Round 7 修正）：返回 `{p0,p1,p2,p3}`，首行 `if (!fm) return {0,0,0,0}` 自防 null。合法 fm 无 severity → {0,0,0,0}（**不**返回 null，避免误阻断合法 pass 报告）。null 仅属 parseReviewReportFrontmatter。
4. **safeNum + max 聚合**（对象上做）：
   ```ts
   const safeNum = (v) => Number.isFinite(v) && v >= 0 ? v : 0;
   const sc = (fm.severity_counts ?? {}) as Record<string, unknown>;
   const p0 = Math.max(safeNum(fm.p0_count), safeNum(sc.p0), safeNum(sc.new_p0), safeNum(sc.P0));
   ```
5. **修 ship-gates.ts:114**：纯正则 → [try/catch 包 splitFrontmatterAndBody 调用 + console.error] + `extractSeverity(fm)`（P0 闭合 + 异常兜底 + 可观测）；`:119` 早返基于 fm 对象判定"有内容"。
6. **修 fallback.ts:304**：复用 `extractSeverity`，**但保留 `hasAnySeverityField(fm)` 谓词**判定"无证据→降级 L3"（保护 fallback 现有 null 双义语义，防反转）。
7. **范围（product）**：ship-gates + fallback 优先；state/quality-gate follow-up。
8. **schema 文档化**：`review-report.ts` 注释 canonical = 扁平。

**此方案一次消解**：原 P0（嵌套漏读）+ Round 4 `??` 链 + 大写格式 + Round 5 NaN/ReDoS + **Round 6 异常逃逸**。alias bomb 因 `yaml@2.8.4` 自带 `Excessive alias count` 防护 + try/catch → 普通解析失败 → fail-closed 阻断，可接受。

**职责分工（不变）**：新鲜度归 `ship.ts:168 checkReviewFreshness`；severity 解析归 `extractSeverity`（splitFrontmatterAndBody fm + try/catch + max + safeNum）。

### REQ-05 dist sync 触发优化

**候选机制**（design 阶段选一，依赖团队 git 工作流确认）：
- **A. PR 合并前单次 sync**：feature 分支内不自动 sync，仅在 PR 创建/合并前跑一次 `dist:resync` + 单条 commit。
- **B. squash on merge**：PR squash merge 自动合并分支内多次 sync commit。
- **C. 检测无 src 变化则跳过**：CI 步骤前置 `git diff --name-only origin/main | grep -q '^src/'` 才触发 sync。

**不变式守护**：无论选哪个，合并到 main 前必须保证 `check-dist-sync.mjs` 通过（保 dist-sync-guard R1）。

### REQ-06 spec status 巡检脚本

**新增** `scripts/check-spec-status.mjs`：
- 扫描 `.forge/specs/**/{requirements,design,tasks}.md` + 单文件 spec 的 frontmatter。
- 输出 status 分布表 + warning（缺失/矛盾）。
- `--fix` 仅补全**缺失**字段为 `status: draft`，不覆盖已有。
- 复用现有 `splitFrontmatterAndBody`（从 src/frontmatter 或 dist）。

---

## Component Interfaces

| 组件 | 对外接口 | 变化 |
|------|---------|------|
| `src/plan.js`（barrel） | 46 个导出 | **不变**（re-export 保持签名） |
| `extractSeverity(fm)`（新增共享函数） | 输入 parseYaml 后的 fm 对象 → `{p0,p1,p2,p3}`（**无 null**），首行自防 null + max 聚合 + safeNum 钳制 | **新增**（ship-gates/fallback 共享） |
| `hasAnySeverityField(fm)`（新增谓词） | 判断 fm 是否含任何 severity 字段——**专供 fallback 判定 L2→L3 降级**，防降级语义反转 | **新增**（fallback 专用） |
| `splitFrontmatterAndBody`（既有，`review/frontmatter.ts:19`） | 已 parseYaml 返回 fm 对象——extractSeverity 数据源 | **复用**（消除二次 parseYaml） |
| `ship-gates.ts:114` `parseReviewReportFrontmatter` | 纯正则 → [try/catch 包 splitFrontmatterAndBody 调用 + console.error] + `extractSeverity` | **修 P0 漏洞 + 异常兜底（不崩溃）+ 可观测 + 消除异类** |
| `ship-gates.ts:119` 早返逻辑 | 基于 fm 对象判定"有内容" | **修 P1**（避免嵌套报告误判 null） |
| `fallback.ts:304` `tryParseCiEvidence` | 复用 `extractSeverity` + **`hasAnySeverityField` 守护降级语义**（已有 try/catch :314） | **同步修复 + 保护 L2→L3 降级不变式** |
| 各模块局部 `FORGE_DIR` 常量 | 模块内 `const` | 新增（不跨模块） |
| `scripts/check-spec-status.mjs` | CLI: `--fix` | 新增 |

---

## Reversibility

### 回滚检查清单（每 REQ 独立可逆）

| REQ | 回滚动作 | 风险 |
|-----|---------|------|
| 01 | `git revert` 删除 commit，恢复 state-machine/ | 极低（无消费者） |
| 02 | 恢复单文件 `plan.ts`，删 `plan/` 目录 | 低（barrel 保证接口未变） |
| 03 | 还原常量替换（常量模块可留可删） | 低（纯字面量替换） |
| 04 | 移除 `currentDiff` 参数及 SHA 比对，恢复旧行为 | 中（需同时回滚调用点） |
| 05 | 关闭新触发机制，恢复每次 sync | 低（流程可逆） |
| 06 | 删除巡检脚本 | 极低 |

### Mount Points / 对外语义变化（Round 3 后）

> **Round 3 重判**：REQ-04 从"修解析 bug"升级为"闭合 ship-gate P0 安全漏洞"。这是**有意的安全收紧**——之前 `severity_counts:{p0:1}` 的 blocked 报告被错误放行，修复后会正确阻断。

| REQ | 对外语义 | 回滚含义 |
|-----|---------|---------|
| REQ-04 | **安全收紧**（修 P0 漏洞） | 回滚 = 重新引入漏洞（P0 漏洞报告被放行）。回滚须谨慎，仅当证明收紧误伤时才做 |
| 其余 01/02/03/05/06 | 行为不变 | 常规回滚 |

**REQ-04 无 mount point / 紧急开关**（Round 2 已移除开关防攻击面；安全收紧不应可被一键关闭）。若需紧急绕过，走既有的 `[dist-sync-skip]` 式人工 commit 标签惯例，不新增 env 开关。

---

## Testing Strategy

- **REQ-01**：删除后全量 `vitest run` 全绿即证明（无新测试，靠现有测试覆盖）。
- **REQ-02**：现有 `test/plan*.test.ts` 全绿（迁移不改逻辑）+ 新增 `test/plan-barrel.test.ts` 断言所有导出可达 + `madge --circular` 无环。
- **REQ-03**：现有测试全绿 + grep 白名单核对（39 处 path.join 替换、6+ 处 includes/regex 列白名单）+ sandbox deny 值等价单测（若触及）。
- **REQ-04**：新增 `test/ship-gates-severity-formats.test.ts`（RED 先行，**P0 回归矩阵**）：
  - **块式 + 流式两种 YAML 结构**各自 → 正确 P0/P1（扁平 `p0_count` / 嵌套小写 `p0` / `new_p0` / 大写 `P0`）；
  - **`severity_counts:{p0:1}` → 阻断**（闭合原 P0）；
  - **`p0_count:0` + `severity_counts:{p0:5}` 混合 → p0=5 阻断**（闭合 Round 4 `??` 链 P0）；
  - **大写 `severity_counts:{P0:2}`（块式+流式）→ 阻断**（闭合 Round 4 大写 P0）；
  - **`severity_counts:{p0:abc}` / `p0:-1` / `p0:1e999` / `p0:true` → safeNum 钳制为 0，不放行提升**（闭合 Round 5 NaN/负数 P0）；
  - **畸形 YAML（`p0: [unclosed`、tab 缩进错乱、alias bomb `&a [*a]`）→ 阻断 ship 不崩溃**（闭合 Round 6 异常逃逸 P0）；
  - **"双零"（仅 `p0_count:0`）→ 放行**（钉死契约，防 max 误放大）；
  - **只有嵌套字段无扁平字段 → 不早返 null**（覆盖 `:119`）。
  新增 `test/review-severity-parser.test.ts`：`extractSeverity(fm)` 纯函数单测（块式+流式 + 四格式 + safeNum + **入参自防 null** + 缺失返回 0 不崩；**无 `| null` 返回**）。
  新增 `test/review-fallback-severity-regression.test.ts`（Round 7）：验证 fallback 复用 extractSeverity 后**降级语义不反转**——"无 severity 字段报告"仍触发 L2→L3 降级（via `hasAnySeverityField(fm)`），而非当 0 finding 放行 L2。
  ship-gates 测试补：畸形 YAML 异常时 **console.error 被调用**（可观测性）。
- **REQ-05**：示例分支 sync 提交数对比 + `check-dist-sync.mjs` 仍通过。
- **REQ-06**：脚本 snapshot 测试 + `--help` 输出。

所有 REQ 遵循 RED→GREEN→REFACTOR（Forge §2.1 TDD 铁律）。

---

## Open Questions（decide 后状态）

1. **REQ-02 barrel 与 dist 路径** —— ✅ **已解**：scripts 不 import `plan.js`（仅 `active-plan.json`），拆分不破坏 INV-3。
2. **REQ-04 severity 格式漂移 + 异常鲁棒性** —— ✅ **Round 7 根治（实现细节修正）**：两种 YAML 结构（块式+流式）× 四字段名。P0 漏洞点 = `ship-gates.ts:114`。方案演进：Round 5 放弃正则改 parseYaml；Round 6 补异常兜底；**Round 7 修正实现细节**（统一 try/catch 在 splitFrontmatterAndBody 外层 + extractSeverity 去 null + fallback `hasAnySeverityField` 谓词保护降级语义 + try/catch 加 log 可观测 + 入参自防 null）。范围：ship-gates+fallback 优先（hotfix）。**product 声明：方向无争议，剩余风险交 TDD 回归矩阵实测（PoC），不再开 Round 8。**
3. **REQ-05 git 工作流** —— ⏳ **未解**：团队 PR merge 用 squash 还是 merge-commit？决定 T-08 机制 A/B/C。须在执行 T-08 前确认。
4. **REQ-03 范围** —— ✅ **已解**：降级为仅 39 处 path.join（局部常量），6+ 处 includes/regex 列白名单，不建集中模块。
