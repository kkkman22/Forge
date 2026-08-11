---
status: approved
feature: audit-remediate-0619
layout: requirements
created: 2026-06-19
tier: full
work_nature: bugfix
brownfield: true
import_source: "PROJECT-AUDIT-REPORT.md"
decision_ref: ".tinkerman/specs/audit-remediate-0619/requirements.md"
health:
  score: 0
  verdict: "pending"
---

# Requirements — Audit Remediate 0619

## 目标

修复 PROJECT-AUDIT-REPORT.md（经 spec 复核修订后）确认的功能性缺陷，覆盖 workNature 路由一致性裂缝、RED gate 死代码残留、ESM require 潜伏 bug、spec-bundle-io 漂移副本。所有修复须对外行为保持不变（除明确指出的 bug 行为修正），并以 TDD（RED→GREEN→REFACTOR）执行。

## 非目标

- **不**修 P0-3 acceptance gate（已被 `agentic-acceptance` locked spec 跟踪，重复立项会冲突）
- **不**修 P0-5 PUA（需架构决策：接线 or 退役，超出 bugfix 范围）
- **不**清理 P1-1 中 3 套退役 sandbox 模块（属 housekeeping，另立 spec）
- **不**合并 P2-M 的 7 处 parseFrontmatter / 2 套 semver（`code-slim-0612` 已明确为非目标，签名/语义不同）
- 不改动 P0/P1 审计范围外的代码

---

## REQ-01: router commandSequence 与 workNature 关系 —— 经核实为**设计契约，非 bug**（原 P0-1 重新判定）

**初版审计 P0-1 判断**：`classifyTask`（`src/router.ts:738`）调用 `getRouterSequence(tier)` 省略 workNature，导致 router/scheduler 对同一任务给出不同命令序列。

**实现期复核结论（2026-06-19）**：经核对 `src/workflow-graph.ts:232-269` 的 profile 定义，**该判断不成立**：
- `getRouterSequence(tier, workNature)` 返回的是 **routerPhases**（路由阶段）。
- workflow-graph 中，**同 tier 下 feature/refactor/bugfix 的 routerPhases 完全相同**（light tier 三者均为 `['build','review']`；standard 三者均为 `['plan','build','review','test','ship']`）。
- workNature 的差异只体现在 **schedulerPhases**（调度 skill 序列：`refactor-apply` vs `fix-apply`），由 `skill-scheduler.getCommandSequence` + `sdk-status-helpers.initializeLoopFields` 使用。
- 因此 router 用 `getRouterSequence(tier)` 不传 workNature **是符合设计的**——routerPhases 本就不依赖 workNature；scheduler 用 workNature 选 schedulerPhases 也是其职责。两者并非"不一致裂缝"，而是**职责分离**。

**Requirement（修订）**：将此设计契约固化为回归测试，防止未来误"修复"引入真实 bug。
- WHEN `classifyTask` 以任意 `(tier, workNature)` 调用 THEN `commandSequence` SHALL 等于 `getRouterSequence(tier)`（routerPhases 在同 tier 跨 workNature 恒等）。
- 已删除旧 property test 中"不同 workNature 应产生不同 commandSequence"的错误断言（该断言编码了对 P0-1 的误判）。

**Verify-By**: vitest
**Evidence**：`test/router-worknature.property.test.ts` 新增契约测试（routerPhases workNature-agnostic）。
**代码改动**：无（`router.ts:738` 保持 `getRouterSequence(tier)`，回退了尝试性修复）。

---

## REQ-02: 清理 validateRedGate 死代码并补全 SUCCESS 匹配（原 P0-2，降级 P2）

**背景**：`src/build.ts:415-423` 存在死变量 `_indicator`/`_outputLower`，`SUCCESS_INDICATORS` 数组定义了却未逐项匹配，循环体只用硬编码 `/passed/i`。核心 RED 拦截仍工作（含 passed 即判 invalid），但额外模式（`PASS` / `all tests passed` / `Tests:.*passed`）不触发。

**Current State**：
```ts
const _outputLower = evidence.actual_output.toLowerCase();   // 死变量
for (const _indicator of SUCCESS_INDICATORS) {               // _indicator 未用
  if (/passed/i.test(evidence.actual_output) && !/failed/i.test(evidence.actual_output)) {
    return { valid: false, reason: "RED test PASSED ..." };
  }
}
```

**Requirement**：
- WHEN `actual_output` 匹配任一 `SUCCESS_INDICATORS`（作为大小写不敏感正则）且不含 FAILURE_INDICATORS THEN `validateRedGate` SHALL 返回 `{ valid: false }`。
- 死变量 `_outputLower`、`_indicator` SHALL 被消除。
- 现有 `/passed/i` + `!/failed/i` 的拦截行为 SHALL 保留（向后兼容）。

**Verify-By**: vitest
**Evidence**：
- 新增测试：`actual_output` 仅含 `PASS`（不含 `passed` 字样）时返回 `{ valid: false }`（修复前会漏过到 failure indicator 检查）。
- 新增测试：`actual_output` 含 `passed` + `failed` 时仍返回 `{ valid: true }`（保留现有优先级语义）。
- 回归测试：现有 validateRedGate 用例全绿。

**明确不改变**：`RedGateEvidence` 接口、FAILURE_INDICATORS 列表、reason 文案。

---

## REQ-03: spec-migration.ts 用 await import 替换 require（原 P1-5）

**背景**：`src/spec-migration.ts:229` 在原生 ESM 项目中用 `require("./event-writer.js")`，运行时 ReferenceError。该分支触发即崩溃，且被外层 try 吞错。

**Current State**：
```ts
const { writeEvent } = require("./event-writer.js") as { writeEvent: (...) => void };
```

**Requirement**：
- WHEN 迁移失败分支触发 THEN `writeEvent` SHALL 通过 `await import("./event-writer.js")` 动态导入，不抛 ReferenceError。
- 包含该调用的函数 SHALL 已是 async（若否则改为 async）。
- 导入失败时 SHALL 由外层 catch 捕获并记录（保留现有错误处理语义）。

**Verify-By**: vitest
**Evidence**：
- 新增/更新测试：触发迁移失败分支，断言不抛 ReferenceError，且 writeEvent 被调用（或外层 catch 正确记录）。
- `npx tsc --noEmit` 通过（无 require 类型推断错误）。

**明确不改变**：writeEvent 的调用参数、迁移回滚逻辑顺序。

---

## REQ-04: spec-bundle-io.ts 委托 spec-render.ts（原 P0-6）

**背景**：`src/spec-bundle-io.ts`（426 行）在 src 内零生产消费者（仅测试），与 `spec-render.ts` 大面积重复且已漂移（缺 `enforceEarsSyntax`、open questions 编号 bug `1. ${q}`、缺 execution_packages 渲染）。生产路径走 spec-render.ts，bundle-io 副本只让测试在错误行为上变绿。

**Requirement**：
- WHEN `spec-bundle-io.ts` 的渲染函数被调用 THEN 它们 SHALL 委托 `spec-render.ts` 的对应函数（单一真相源）。
- 渲染输出 SHALL 与 spec-render.ts 完全一致（消除漂移）。
- open questions 编号 bug SHALL 通过委托自动消除。
- IF 委托导致测试失败（因测试依赖 bundle-io 的错误行为）THEN 测试 SHALL 被更新为验证正确行为（spec-render.ts 的输出）。

**Verify-By**: vitest + tsc
**Evidence**：
- 回归测试：spec-render 的现有测试全绿。
- 更新后的 spec-bundle-io 测试断言其输出 == spec-render.ts 的输出（等价性）。
- `npx tsc --noEmit` 通过。

**明确不改变**：spec-render.ts 的实现（本轮不动 SSOT）、spec-bundle-io 的导出函数名（保持调用方兼容）。

---

## 全局不变式

| ID | 不变式 | 验证 |
|----|--------|------|
| INV-1 | 公开 API / CLI 退出码 / MCP tool 契约行为不变 | vitest 全绿 |
| INV-2 | 安全控制不删除（path normalization / allowlist / audit） | diff 审查 |
| INV-3 | 每个改动 `npx tsc --noEmit && npx vitest run` 全绿 | bash exit 0 |
| INV-4 | 每个子任务结束 `dist/src/**` 与 src 同步 | `bash scripts/check-dist-sync.mjs` 通过 |

## 反漂移信号

- **主目标**：4 项缺陷修复 + 相关测试红→绿，`npm run typecheck` 通过。
- **验证材料角色**：审核报告（已修订）→ 本规格 → plan → build（TDD）→ review → ship
