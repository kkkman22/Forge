---
feature: arch-review-remediate-0626
layout: tasks
created: 2026-06-26
revised: 2026-06-26
approved: 2026-06-26
tier: full
work_nature: refactor
brownfield: true
decide_rounds: 7
next_step: "plan → build（T-05 作 hotfix 走 TDD PoC 实测）"
status_note: "T-01 撤销(state-machine 非孤岛,前提证伪);T-03/T-08 转 deferred(见 gap-remediate-0630 T-02);实际交付 T-05(P0,DONE)/T-06/T-07(DONE)/T-02(PARTIAL)"
---

# Tasks — Arch Review Remediate 0626（修订版）

## Overview

> **修订说明（2026-06-26 decide needs_revision 后）**：原 10 任务调整为 9 任务。主要变更：
> - 原 T-03（建 forge-paths.ts 集中模块）+ T-04（103 处全量替换）→ **合并为 T-03**（仅 39 处 path.join 局部常量，服从 ADR-0008 #3 不建集中模块）。
> - 原 T-05（L2 加 SHA 新鲜度校验）→ **Round 2 重定义为修 severity bug** → **Round 3 再次重定义为根治 P0 漏洞**（抽共享 `extractSeverity` + 修 ship-gates + 修 fallback，闭合 `ship-gates.ts:114` 的 P0 安全漏洞）。
> - T-02 补 DAG 预验证步骤。
> - **T-05 前置到 Wave 1**（product 建议：唯一真 P0 安全项应最优先交付，不被 refactor 阻塞）。

6 个 REQ 拆为 9 个任务，分 4 波。核心约束：5 项对外行为不变、REQ-04 为安全收紧（闭合 P0 漏洞）、全程 TDD、每任务结束 `tsc --noEmit && vitest run` + `check-dist-sync.mjs`（INV-5/6）。

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["T-05", "T-01", "T-06"], "parallel": true, "note": "P0 漏洞修复优先 + 删孤岛 + spec 巡检（三者独立）" },
    { "wave": 2, "tasks": ["T-02"], "parallel": false, "note": "plan.ts 拆分（含 DAG 预验证）" },
    { "wave": 3, "tasks": ["T-03"], "parallel": false, "note": ".forge path.join 局部常量（39 处，含 plan/ 子目录）" },
    { "wave": 4, "tasks": ["T-07", "T-08"], "parallel": true, "note": "巡检 --fix + dist 触发" }
  ]
}
```

---

## Task Definitions

### T-01 删除 `src/state-machine/` 孤岛目录

> **裁决(2026-06-30):撤销**。前提"零引用孤岛"被证伪(由 `gap-remediate-0630` decide 阶段复核)。证据:`src/domain/reservations/reservation.ts:18`、`reservation-machine.ts:14`、`src/pack/domain-bundle.ts:15`、`src/index.ts:132` 均为活跃 import;`domain-example-reference-impl` REQ-07 明确 consumes state-machine。依据 ADR-0008 #4(精简禁止移动被 scripts/src import 的路径)。**本任务作废,禁止 `git rm src/state-machine/`**。反向回归由 `gap-remediate-0630` T-04 的 state-machine fixture 永久锚定(判定其非死代码)。

- **Goal**: 移除零引用的 state-machine 引擎及其专属测试，证明无生产消费者。
- **REQ**: REQ-01
- **TDD Steps**:
  - RED: 临时 `git rm -r src/state-machine/ test/state-machine*`，跑 `npx tsc --noEmit`——若全绿则坐实"无消费者"（若有隐藏引用会编译失败）。
  - GREEN: 删除完成，`npx tsc --noEmit && npx vitest run` 全绿。
  - REFACTOR: 检查 tsconfig/barrel 残留 re-export，清理。
- **Verify Command**: `npx tsc --noEmit && npx vitest run && ! grep -rn "state-machine" src --include='*.ts'`
- **Definition of Done**: state-machine 目录与测试删除；src/ 0 引用；全量测试全绿；dist 同步通过。
- **Depends On**: 无
- **风险**: 极低

### T-02 拆分 `src/plan.ts` → `src/plan/` 子目录（含 DAG 预验证）

- **Goal**: 将 1127 行/46 导出的上帝文件拆为 types/validate/task-graph/format 四模块 + barrel，对外导出不变。
- **REQ**: REQ-02
- **TDD Steps**:
  - RED: **先建基线** `npx madge --circular src/plan.ts`（单文件无环）。新增 `test/plan-barrel.test.ts` 断言 46 导出从 `"./plan.js"` 可达。
  - **DAG 预验证（decide P0）**：拆分前静态分析 4 子模块依赖方向（types ← format ← validate ← task-graph）；若 `task-graph` 需 `validate` 的类型，把共享 `TaskGraph` 类型下沉到 `types.ts` 断环——**在写代码前确认无环**。
  - GREEN: 执行拆分（`git mv` + 编辑），`plan/index.ts` barrel re-export；`tsc --noEmit && vitest run` 全绿；`madge --circular src/plan/index.ts` 无环；各子文件 ≤ 400 行。
  - REFACTOR: 调整依赖方向消除任何反向依赖。
- **Verify Command**: `npx tsc --noEmit && npx vitest run && npx madge --circular src/plan/index.ts && node scripts/check-dist-sync.mjs`
- **Definition of Done**: `src/plan/{index,types,validate,task-graph,format}.ts` 存在；`from "./plan.js"` 现有 import 可用；测试全绿；**拆分前后 madge 均无环**；子文件 ≤ 400 行；dist 同步。
- **Depends On**: 无（scripts 不 import plan.js，已核实，INV-3 安全）
- **风险**: 中（barrel 循环——靠 DAG 预验证 + madge 双重门控）

### T-03 `.forge/` path.join 局部常量化（39 处，降级版）

> **重评(2026-06-30):deferred**。复核实测仍 40 处原始 `path.join ... ".forge"`、0 个 `FORGE_DIR` 常量。40 处魔字符串改局部常量属纯卫生改动,无行为/契约收益;ADR-0008 的精神是"精简有收益的才做"(且 ADR-0008 #3 不建集中模块,T-03 局部常量虽不冲突但同属低 ROI 卫生项)。建议:下次 touch 这些模块时顺手做,不单独立项。裁决依据:`gap-remediate-0630` T-02。

> **decide 重判**：原 T-03（建 forge-paths.ts）+ T-04（103 处全量替换）合并。服从 ADR-0008 #3 不建集中模块。

- **Goal**: 在含 `path.join(..., ".forge", ...)` 的模块顶部加局部常量 `const FORGE_DIR = ".forge"`，39 处渐进替换；6+ 处 includes/regex 列白名单。
- **REQ**: REQ-03
- **TDD Steps**:
  - RED: 编写断言"6+ 处 includes/regex 白名单项未被改动"的快照测试（防误替换破坏子字符串语义）；此时未动，测试通过（基线）。
  - GREEN: 逐模块替换 39 处 path.join 为局部常量；每批 `tsc --noEmit && vitest run` 全绿。
  - REFACTOR: 合并同模块重复的 `const FORGE_DIR`。
- **Verify Command**: `npx tsc --noEmit && npx vitest run && grep -rn 'path\.join.*\.forge\|"\.forge"' src --include='*.ts' | wc -l`（核对 path.join 命中 ≤ 白名单）
- **Definition of Done**: 39 处 path.join 替换为局部常量；includes/regex 白名单（6+ 处）未动并文档化；sandbox-policy 的 deny 项**不替换**（仅加注释，规避 deny 漂移风险）；全量测试全绿；dist 同步。
- **Depends On**: T-02（plan/ 子目录一并处理）
- **风险**: 低（局部常量，行为严格等价；不碰 sandbox deny）

### T-05 闭合 ship-gate severity P0 漏洞 + 抽 extractSeverity（Round 7 根治版：实现细节修正）

> **decide Round 7 重判**：Round 6 方向正确，但实现细节有问题——统一 try/catch 放置点（包 splitFrontmatterAndBody 外层，非 extractSeverity 内）+ extractSeverity 去 null + fallback `hasAnySeverityField` 谓词保护降级语义 + try/catch 加 log 可观测。范围收窄：ship-gates + fallback 优先（hotfix）。

- **Goal**: 抽共享 `extractSeverity(fm)`（接收 fm 对象，去 null，自防 null）+ `hasAnySeverityField(fm)` 谓词，修 ship-gates:114 + :119（+ fallback 守护降级），闭合原 P0 + Round 4/5/6/7 全部问题。
- **REQ**: REQ-04（P0）
- **TDD Steps**:
  - RED: `test/ship-gates-severity-formats.test.ts`（**P0 回归矩阵**）：
    - **块式 + 流式两种 YAML 结构**各自正确（扁平 `p0_count:2`；块式 `severity_counts:\n  p0:1`；流式 `severity_counts: { p0: 1 }`；`new_p0:3`；大写块式/流式 `P0:2`）；
    - **`severity_counts:{p0:1}`（块式+流式）→ 阻断**（闭合原 P0）；
    - **`p0_count:0` + `severity_counts:{p0:5}` 混合 → p0=5 阻断**（闭合 Round 4 `??` 链 P0）；
    - **大写 `severity_counts:{P0:2}` → 阻断**（闭合 Round 4 大写 P0）；
    - **`severity_counts:{p0:abc}` / `p0:-1` / `p0:1e999` / `p0:true` → safeNum 钳制为 0，不放行提升**（闭合 Round 5 NaN/负数 P0）；
    - **畸形 YAML（`p0: [unclosed`、tab 缩进错乱、alias bomb `&a [*a]`）→ 阻断 ship 不崩溃**（闭合 Round 6 异常逃逸 P0）；
    - **"双零"（仅 `p0_count:0`）→ 放行**（钉死契约）；
    - **只有嵌套字段无扁平字段 → 不早返 null**（覆盖 `:119`）。
    `test/review-severity-parser.test.ts`：`extractSeverity(fm)` 块式+流式 + 四格式 + safeNum + **try/catch 异常返回 null** + 缺失返回 0。
  - GREEN:
    1. 新增 `extractSeverity(fm: Record<string, unknown>): {p0,p1,p2,p3}`（**接收 fm 对象，无 `| null`**，首行 `if (!fm) return {0,0,0,0}` 自防 null）：
       ```ts
       if (!fm) return {p0:0,p1:0,p2:0,p3:0};  // 入参自防 null
       const safeNum = (v) => Number.isFinite(v) && v >= 0 ? v : 0;
       const sc = (fm.severity_counts ?? {}) as Record<string, unknown>;
       const p0 = Math.max(safeNum(fm.p0_count), safeNum(sc.p0), safeNum(sc.new_p0), safeNum(sc.P0));
       // 注意：extractSeverity 不做 parseYaml，异常不在它内部
       ```
    2. 新增 `hasAnySeverityField(fm): boolean` 谓词（检查 fm 是否含 p0_count/severity_counts 等任一 severity 字段），**专供 fallback 判定 L2→L3 降级**。
    3. 修 `ship-gates.ts:114`：纯正则 → **try/catch 包 `splitFrontmatterAndBody` 调用**（**不是包 extractSeverity**——parseYaml 异常在 splitFrontmatterAndBody 内 frontmatter.ts:28 抛）+ `console.error("[ship-gates] severity parse failed:", e)` log + `extractSeverity(fm)`；异常时返回 null → `parseReviewReportFrontmatter` 返回 null → `:239-244` "Failed to parse" 早返 → `passed:false` 阻断（**fail-closed 不崩溃 + 可观测**）。
    4. 修 `ship-gates.ts:119` 早返：基于 fm 对象判定"有内容"（含 severity_counts）。
    5. 修 `fallback.ts:304`：复用 `extractSeverity` + **`hasAnySeverityField(fm)` 守护降级**（无 severity 字段 → 仍返回 null 触发 L2→L3 降级，**不**当 0 finding 放行 L2）；fallback 已有 try/catch :314 保留。
    6. `schemas/review-report.ts` 加注释：canonical = 扁平。
    全绿。
  - REFACTOR: extractSeverity 放 `src/review/severity-parser.ts`，ship-gates/fallback 共享。
- **范围说明（product）**：本任务**优先修 ship-gates + fallback**（ship 放行相关）。state/quality-gate 的 severity 误读若无 ship 放行语义 → follow-up，不阻塞 hotfix。
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/ship-gates-severity-formats.test.ts test/review-severity-parser.test.ts && npx vitest run test/ship-gates test/review`
- **Definition of Done**: P0 回归矩阵全绿（块式/流式 + 四格式 + NaN/负数 + **畸形/alias bomb 不崩溃 + console.error 被调用** + 双零 + 早返）；ship-gates/fallback 共享 `extractSeverity`（**无 null 返回**）；**fallback 降级语义不反转**（无 severity→L3，有 hasAnySeverityField 谓词 + 测试）；异常时结构化阻断（passed:false）非崩溃；现有测试无回归。
- **Depends On**: 无（P0，最优先，hotfix）
- **风险**: 低（复用成熟 parseYaml + splitFrontmatterAndBody，try/catch 在外层 + log + 回归矩阵保障；alias bomb 由 yaml@2.8.4 自带防护）。
- **回滚注意**: 回滚 = 重新引入 P0，须谨慎。
- **作为 hotfix**：本任务可独立先行 ship，不必等 refactor（T-01/02/03）。
- **product 收尾声明**：方向无争议，实现细节已修正，剩余风险交 TDD 回归矩阵实测（PoC），不再开 Round 8。

### T-06 spec status 巡检脚本（只读）

- **Goal**: 新增 `scripts/check-spec-status.mjs`，扫描 spec 库 status 分布，输出 warning。
- **REQ**: REQ-06
- **TDD Steps**:
  - RED: snapshot 测试断言脚本输出预期 status 分布 + 缺失 warning——脚本未建，失败。
  - GREEN: 实现脚本（复用 `splitFrontmatterAndBody`），`--help` 可用，snapshot 通过。
  - REFACTOR: 抽 frontmatter 扫描为可复用函数。
- **Verify Command**: `node scripts/check-spec-status.mjs --help && node scripts/check-spec-status.mjs`
- **Definition of Done**: 脚本存在；`--help` 规范；全量巡检产出 status 分布报告；只读。
- **Depends On**: 无
- **风险**: 极低

### T-07 spec status 巡检 `--fix`（仅补缺失）

- **Goal**: 扩展巡检脚本支持 `--fix`，仅补全缺失 status 为 draft，不覆盖已有。
- **REQ**: REQ-06
- **TDD Steps**:
  - RED: 测试断言 `--fix` 对缺失 status 写入 draft，对已有 status 不改——未实现，失败。
  - GREEN: 实现 `--fix`，测试通过。
  - REFACTOR: 复用 T-06 扫描函数。
- **Verify Command**: `node scripts/check-spec-status.mjs --fix --dry-run`
- **Definition of Done**: `--fix` 仅补缺失；已有不变；dry-run 可用。
- **Depends On**: T-06
- **风险**: 低

### T-08 dist sync 触发策略优化

> **重评(2026-06-30):deferred**。前提(dist 大量入库导致 PR 噪音/冲突)经复核不成立:`git ls-files dist` 仅 4 个文件(其余在 `.gitignore`),原"3555 文件入库"是工作树文件数非跟踪数。因此 sync 提交频率问题的根因不在触发策略,而在流程/CI。原 Open Question #3(团队工作流)亦未解,机制设计无依据。建议:并入后续"CI 产 dist"讨论,不单独立项。裁决依据:`gap-remediate-0630` T-02。

- **Goal**: 减少分支内 sync 提交频率，保 dist-sync-guard R1 完整性不变。
- **REQ**: REQ-05
- **TDD Steps**:
  - RED: 设计验证用例——含多轮 src 改动的示例分支，断言 sync 提交数 ≤ 阈值 + 合并前 `check-dist-sync.mjs` 通过。未实现时失败。
  - GREEN: 实现选定机制（A/B/C，依赖 Open Question #3 团队工作流确认）；示例分支验证通过。
  - REFACTOR: 与现有 `dist-resync.sh`/`check-dist-sync.mjs` 协同。
- **Verify Command**: `node scripts/check-dist-sync.mjs` + 示例分支 sync 提交数对比
- **Definition of Done**: 机制落地；R1 完整性不破；`[dist-sync-skip]` 语义保留；无 src 变化不产 sync commit。
- **Depends On**: 无（须先解 Open Question #3）
- **风险**: 中（流程改动，须不破 R1）

### T-09 全局不变式终验

- **Goal**: 最终 PR 前验证 INV-1 ~ INV-6 全部满足。
- **REQ**: 全部
- **TDD Steps**: 非 TDD（验证门禁）。
- **Verify Command**:
  ```bash
  npx tsc --noEmit && \
  npx vitest run && \
  node scripts/check-dist-sync.mjs && \
  git diff origin/main -- src | grep -E 'throw|reject|deny|normalize|allowlist|metachar' | wc -l
  ```
- **Definition of Done**: INV-1~6 全满足；非目标 4 项排除项未被违反（无 skill-scheduler 删除、无 accept-driver 拆分、无 frontmatter 重写、无 cursor-team-kit 改写）；**decide 修订项全部落实**（REQ-03 无集中模块、REQ-04 无 SHA 校验/紧急开关、REQ-02 有 DAG 验证记录）。
- **裁决影响(2026-06-30)**:T-01 已撤销(state-machine 非孤岛),故"INV 中涉及 state-machine 删除"的断言不再适用;T-01 的 Verify Command(`! grep state-machine src`)相应作废。T-03/T-08 已转 deferred(见 T-02 重评)。本 spec 实际交付:T-02(拆 plan.ts,已 PARTIAL)、T-05(P0 修复,已 DONE)、T-06/T-07(巡检脚本,已 DONE)。
- **Depends On**: T-01 ~ T-08

---

## 执行顺序建议

1. **Wave 1**：T-05（**闭合 P0 漏洞，最高优先**）+ T-01（删 state-machine）+ T-06（巡检脚本）—— 三者独立可并行
2. **Wave 2**：T-02（拆 plan.ts，含 DAG 预验证）—— 结构重构
3. **Wave 3**：T-03（path.join 局部常量，含 plan/ 子目录）—— 降级版魔字符串治理
4. **Wave 4**：T-07（巡检 --fix）+ T-08（dist 触发）—— 可并行
5. **收尾**：T-09（不变式终验）→ spec status 标 completed + 实现期复核留痕

> **优先级说明**：T-05 是本 spec 唯一真 P0（安全漏洞），前置 Wave 1 独立交付，不被 refactor/hygiene 阻塞（对齐 product 视角 Round 3 建议）。
