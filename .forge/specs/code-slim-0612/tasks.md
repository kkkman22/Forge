---
feature: code-slim-0612
title: 全项目代码精简与重构 — Tasks
tier: full
work_nature: refactor
adr: ADR-0008
spec_ref: .forge/specs/code-slim-0612/
format: lightweight
date: 2026-06-12
monolith_acknowledged: false
execution_packages:
  - package: P1-Wave1
    scope: "低风险：deprecated.ts 删除 + barrel re-export 清理"
    tasks: [T1, T2]
    branch: forge/code-slim-deprecated, forge/code-slim-barrel
    status: ready
  - package: P2-Wave2
    scope: "中风险：error-recovery / docs-governance / review-comment-bitbucket"
    tasks: [T3, T4, T5]
    status: deferred-to-resume
  - package: P3-Wave3
    scope: "高风险：mcp 内部函数合并"
    tasks: [T6]
    status: deferred-to-resume
---

# Tasks — 精简执行计划

> 三文件单源（plan 就地升级本 tasks.md）。跨 6 模块/6 分支 → 拆 3 个 Execution Package，每 Package 一次完整 build→review→test→ship。**本 plan 详细规划 Package 1（Wave 1）**，P2/P3 高层待各自 `/forge resume` 规划。
> refactor TDD 语义：RED=现有测试覆盖行为；GREEN=删除后测试仍绿（行为等价）；REFACTOR=清理。

---

## 📦 Package 1 — Wave 1（低风险，本 plan 详细范围）

### T1：删除 deprecated.ts（REQ-1）· AFK · dependsOn: []

**File Mapping**：
- DELETE `src/deprecated.ts`（152 行 v2.4→v2.5 shim，契约已到期 v3.4.0）
- DELETE `dist/src/deprecated.js` + `dist/src/deprecated.d.ts`（R6 dist 同步）
- MODIFY `test/barrel-file.test.ts`（移除 `:13` import + `:335-366` deprecated re-export 断言区段；若影响 export 总数则同步 `:185`）

**步骤**：
1. **RED-确认覆盖**：`grep -rn "from.*deprecated" src/ test/` → 确认仅 `src/index.ts:10`（注释，非 import）+ `test/barrel-file.test.ts:13`（类型断言）。预期：src/ 无业务 import。
2. **修改测试**：移除 `test/barrel-file.test.ts:13` 的 `import * as deprecated` 及 `:335-366` 区段对 deprecated re-exports 的断言。
3. **GREEN-删除**：删除 `src/deprecated.ts`。
4. **验证**：`npx tsc --noEmit && npx vitest run test/barrel-file.test.ts` → exit 0。
5. **dist 同步（R6）**：`npm run dist:resync` → 删除 dist/src/deprecated.* 。
6. **全量门禁**：`npm run check` → exit 0。

**验证命令**：`grep -rn "from.*deprecated" src/` ; `npx tsc --noEmit` ; `npx vitest run test/barrel-file.test.ts` ; `npm run dist:resync` ; `npm run check`
**AC 对应**：AC-1.1 / AC-1.2 / AC-1.3 / AC-1.4
**提交信息**：`refactor: remove deprecated.ts v2.4→v2.5 migration shim (contract expired at v3.4.0)`

### T2：barrel re-export 冗余清理（REQ-2）· AFK · dependsOn: [T1]

> dependsOn T1：T1 删 deprecated 已改变 export 基线，T2 须在 T1 后更新 export 总数断言，避免基线漂移冲突。

**File Mapping**：
- MODIFY `src/error-recovery/index.ts`（删 `:12` 幂等显式 re-export `export { PHASE_SEQUENCES, TEST_FILE_PATTERNS }`，已由 `:5-11 export *` 覆盖）
- MODIFY `src/decide/index.ts` / `src/schemas/index.ts` / `src/review/index.ts`（逐一核验同模式）
- MODIFY `test/barrel-file.test.ts:185`（`toHaveLength(140)` → 实际新值）
- DELETE/MODIFY 对应 `dist/src/**/index.*`（R6）

**步骤**：
1. **RED-扫描冲突**：`grep -rn "^export \*" src/ --include="*.ts" -l` 找所有 barrel；对每个核验是否存在 `export *` 已覆盖的显式 re-export。重点：`src/error-recovery/index.ts`、`decide/`、`schemas/`、`review/`。
2. **GREEN-删除幂等 re-export**：仅删 `export *` 已覆盖的显式 re-export。删除前确认该符号在 barrel 对外仍可达（`export *` 路径）。
3. **更新 export 数断言**：运行 `npx vitest run test/barrel-file.test.ts` → 读失败信息中的实际 export 数 → 更新 `:185 toHaveLength(<新值>)`。
4. **验证**：`npx tsc --noEmit && npx vitest run test/barrel-file.test.ts` → exit 0。
5. **dist 同步（R6）**：`npm run dist:resync`。
6. **全量门禁**：`npm run check` → exit 0。

**验证命令**：`grep -rn "^export \*" src/ --include="*.ts" -l` ; `npx tsc --noEmit` ; `npx vitest run test/barrel-file.test.ts` ; `npm run dist:resync` ; `npm run check`
**AC 对应**：AC-2.1 / AC-2.2 / AC-2.3 / AC-2.4
**提交信息**：`refactor: remove idempotent barrel re-exports covered by export *`

---

## 📦 Package 2 — Wave 2（中风险，deferred-to-resume）

> 新会话 `/forge resume` 后各自 plan 细化。共享全局不变式 INV-1~6 + ADR-0008 边界。

### T3：error-recovery 精简（REQ-3）· AFK · dependsOn: []
- types.ts 25 export 逐个 `grep -RIn 'import.*<sym>' src/` + 核 entry 核 caller（R10）
- 合并同构纯函数（R12 真删一边）
- 分支：`forge/code-slim-error-recovery`

### T4：docs-governance 精简（REQ-4）· AFK · dependsOn: []
- `root-whitelist.ts` 经 ts-prune/grep 终验后删/留
- staleness/link-checker/quota 子主题内删死代码
- 分支：`forge/code-slim-docs-governance`

### T5：review-comment-bitbucket 精简（REQ-5）· AFK · dependsOn: []
- **仅删死代码**，不动 reconcile 主流程 / finding-hash / marker 正则
- 分支：`forge/code-slim-review-comment-bitbucket`

---

## 📦 Package 3 — Wave 3（高风险，deferred-to-resume）

### T6：mcp 内部函数合并（REQ-6）· HITL · dependsOn: []
- 仅合并 forge-exec.ts 内部小函数；**不动** register* 入口 / tool 名称 / 参数（ADR-0002）
- HITL：mcp 是 runtime 热路径 + ADR 锁定，合并方案需人工确认
- 分支：`forge/code-slim-mcp`

---

## DoD（Package 1）

- [ ] T1 完成：deprecated.ts 删除，src/ 无业务引用，barrel-file.test.ts 全绿
- [ ] T2 完成：幂等 barrel re-export 清理，export 数断言更新，全绿
- [ ] INV-5：每步 `tsc --noEmit && vitest run` 全绿
- [ ] INV-6：每任务 `npm run dist:resync` + `npm run check` 通过
- [ ] INV-1~4 抽检：无公开契约/安全控制/scripts dist 路径/安全测试被破坏
- [ ] ADR-0008 边界未违反

## Self-Check

- **Spec Coverage**：REQ-1→T1，REQ-2→T2（P1 范围）；REQ-3~6→P2/P3（deferred，已声明）✓
- **Placeholder Scan**：零 TBD/TODO/待确认/适当/参考 Task ✓
- **Dependencies**：T2 dependsOn T1（共享 barrel-file.test.ts export 基线），无循环 ✓
- **Plan Structure**：跨模块已拆 3 Execution Package，每 Package 独立管线 ✓
- **Atomic Task Gate**：T1/T2 均 ≤2 文件 + 单一关注点，未超重 ✓
