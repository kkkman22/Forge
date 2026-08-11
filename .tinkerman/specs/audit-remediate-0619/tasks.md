---
feature: audit-remediate-0619
layout: tasks
created: 2026-06-19
tier: full
work_nature: bugfix
---

# Tasks — Audit Remediate 0619

> TDD 顺序：每个 task 先写/改测试（RED）→ 实现（GREEN）→ 清理（REFACTOR）。逐任务原子提交。

## T1: REQ-01 — router commandSequence × workNature（原 P0-1，复核后为非 bug）

- [x] T1.1 复核：核对 `workflow-graph.ts:232-269` profile 定义，确认 routerPhases 在同 tier 跨 workNature 恒等 → P0-1 判断不成立。
- [x] T1.2 回退尝试性代码改动（`router.ts:738` 保持 `getRouterSequence(tier)`）。
- [x] T1.3 固化契约测试：新增"commandSequence 等于 getRouterSequence(tier)"property test；删除旧"不同 workNature 不同 sequence"错误断言。
- [x] T1.4 验证：`npx vitest run test/router-worknature.property.test.ts` 全绿。

## T2: REQ-02 — validateRedGate 死代码清理（P2）

- [x] T2.1 RED：新增用例 —— `actual_output: "PASS"`（无 `passed`/无 failure indicator）应返回 `{ valid: false }`。当前实现会让它漏到 failure indicator 检查 → 断言失败。
- [x] T2.2 GREEN：重写为 `SUCCESS_INDICATORS.some(ind => new RegExp(ind, "i").test(actual_output))`，消除 `_indicator`/`_outputLower` 死变量。保留 failure indicator 优先级语义（含 failure 时不判 success）。
- [x] T2.3 验证：现有 validateRedGate 测试 + RED gate 测试套件全绿。

## T3: REQ-03 — spec-migration require → await import（P1-5）

- [x] T3.1 RED：新增测试 —— 触发迁移失败分支并传 eventsPath，断言 event 文件被写入（当前 require 抛 ReferenceError 被吞 → event 不写入）。
- [x] T3.2 GREEN：`src/spec-migration.ts:229` 改为顶部静态 `import { writeEvent }`（无循环依赖，ESM 标准做法）。
- [x] T3.3 验证：`npx vitest run test/spec-migration.test.ts`。

## T4: REQ-04 — spec-bundle-io 委托 spec-render（P0-6）

- [x] T4.1 调研：grep spec-bundle-io 测试消费者，确认用松断言（contains），委托后大概率兼容。
- [x] T4.2 GREEN：将 spec-bundle-io 的 `renderRequirementsMarkdown`/`renderDesignMarkdown`/`renderTasksMarkdown` 改为委托 spec-render 对应函数（import alias 避免同名冲突）。
- [x] T4.3 新增等价性测试 `test/spec-bundle-io-delegation.test.ts`：bundle-io 输出 == spec-render 输出；并固化 open questions 编号 bug 修复（1./2./3. 正确编号）。
- [x] T4.4 验证：全部 spec-bundle-io 测试（35）+ 等价性测试（3）全绿。

## T5: 全局验证 + dist 同步

- [ ] T5.1 `npx tsc --noEmit` 通过（INV-3）。
- [ ] T5.2 `npx vitest run` 全绿（INV-1/3）。
- [ ] T5.3 `bash scripts/check-dist-sync.mjs` 通过（INV-4）；若失败跑 `npm run dist:resync`。
- [ ] T5.4 每个任务原子提交。
