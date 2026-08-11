## Overview

为 dispatch 拼装管线补结构快照测试。纯新增，无生产路径改动。一个抽取纯函数 + 一组契约测试 + 一份 golden fixture。按 TDD：先写会失败的指纹抽取测试（RED），再实现函数（GREEN）。

## Task Dependency Graph

```json
{
  "waves": [
    ["T-01"],
    ["T-02"],
    ["T-03"],
    ["T-04", "T-05"],
    ["T-06"]
  ]
}
```

## Task Definitions

### T-01 指纹抽取纯函数（RED → GREEN）
- **Goal**: 实现 `extractFingerprint(DispatchResult, opts) => AssemblyFingerprint`，从拼装结果抽取与文案无关的结构指纹
- **TDD Steps**:
  - RED: 写 `test/assemble-fingerprint.test.ts`，断言给定一个手构的 `DispatchResult`，`extractFingerprint` 返回预期指纹（含 `hasUntrustedPreamble`、排序的 `allowedTools`、`hintTags`）——因函数不存在，测试失败
  - GREEN: 实现 `src/forge-dispatcher/assemble-fingerprint.ts` 使测试通过
  - REFACTOR: 抽取字段缺失检测为独立分支，错误信息带字段名
- **Verify Command**: `npx vitest run test/assemble-fingerprint.test.ts`
- **Definition of Done**: 纯函数单测全绿；指纹中不含任何 markdown 正文；字段缺失时抛带字段名的错误
- **Depends On**: —

### T-02 选定代表性组合并锁定清单
- **Goal**: 选定 ~12 个 `(tier × taskType × phase × command)` 代表性组合，写成测试常量并文档化选择理由
- **TDD Steps**:
  - 调研 `router.ts` 的 TaskType / ProjectPhase 全集，确认覆盖三类 tier 与关键 phase
  - 在 `assembly-snapshot.test.ts` 顶部定义 `COMBOS` 常量，每个组合附注释说明为何选它
- **Verify Command**: `npx vitest run test/forge-dispatcher/assembly-snapshot.test.ts`（此时应因无 golden 而产生首版 fixture）
- **Definition of Done**: COMBOS 覆盖 light/standard/full 三档；至少包含 backend + docs + fullstack 三类 taskType
- **Depends On**: T-01

### T-03 生成首版 golden fixture
- **Goal**: 对每个 COMBO 调用真实 `dispatchForgeSubcommand`（带 mock 阻断 agent/read），抽取指纹写入 `test/__fixtures__/assembly-golden.json`
- **TDD Steps**:
  - 编写快照测试骨架，首次运行以 `expect(fp).toMatchSnapshot()` 或手动写入生成 golden
  - 人工核对每条 golden：`hasUntrustedPreamble` 必须为 true、`allowedTools` 非空
- **Verify Command**: `npx vitest run test/forge-dispatcher/assembly-snapshot.test.ts`
- **Definition of Done**: golden 文件存在；所有组合指纹测试绿；`hasUntrustedPreamble` 全为 true
- **Depends On**: T-02

### T-04 additive hints 不变量断言
- **Goal**: 在 `router-hint-rules-externalized.test.ts` 补一个显式 additive 断言（命令序列扩展 → hint tag 集合是超集）
- **TDD Steps**:
  - RED: 断言"全命令序列的 hint tag 集合 ⊇ 单命令序列的 hint tag 集合"——若实现已满足则标记为 characterization test
  - 确认断言失败信息清晰
- **Verify Command**: `npx vitest run test/router-hint-rules-externalized.test.ts`
- **Definition of Done**: additive 不变量有具名断言；破坏性注入（临时改 hints 为 override 语义）能使其失败
- **Depends On**: T-03

### T-05 破坏性回归注入验证（手动，验证后还原）
- **Goal**: 证明快照层能拦截真实灾难性回归
- **TDD Steps**:
  - 临时把 `untrusted-fence.ts` 的 `wrapWorkspaceContext` 改成空函数 → 跑快照测试 → 确认 `hasUntrustedPreamble` 标红 → 还原
  - 临时把 hints 逻辑改成会删除命令 → 跑 additive 断言 → 确认失败 → 还原
  - 记录两次注入的失败截图/输出到 design.md Open Questions 解答区
- **Verify Command**: `git diff --stat`（确认已还原）+ `npx vitest run test/forge-dispatcher/`
- **Definition of Done**: 两类破坏性回归均被拦截；代码已完全还原；验证记录入档
- **Depends On**: T-03

### T-06 全量回归并入 npm test
- **Goal**: 确认新测试在 `npm test` 全量运行中绿，且未拖慢 CI
- **TDD Steps**:
  - 跑 `npm test` 全量，记录新增测试的耗时增量
  - 确认无 flaky（连跑 3 次）
- **Verify Command**: `npm test`
- **Definition of Done**: 全量绿；新增耗时 < 2s；连跑 3 次无 flaky
- **Depends On**: T-04, T-05
