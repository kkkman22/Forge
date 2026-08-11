## Overview

只读聚合脚本 + 静态 Markdown 仪表盘。核心是三个聚合纯函数 + 一个渲染器。按 TDD：先写 fixture 与聚合函数的失败测试，再实现。

## Task Dependency Graph

```json
{
  "waves": [
    ["T-01"],
    ["T-02", "T-03", "T-04"],
    ["T-05"],
    ["T-06"],
    ["T-07"]
  ]
}
```

## Task Definitions

### T-01 调研口径并锁定 fixture
- **Goal**: 确定 spec→ship 完整链路率、replay 证据链占比的判定口径，建立最小化影子 fixture 目录
- **TDD Steps**:
  - 调研真实 `.tinkerman/`：spec 如何标记 ship 痕迹、episode 如何标记证据链
  - 在 `test/__fixtures__/dogfooding-sample/` 建一个含 3 feature（1 完整链路 / 1 半截 / 1 仅 spec）、5 条 findings（P0×1 P1×2 P2×2）、4 episode（2 有证据链）的最小样本
  - 把调研结论写入 design.md Open Questions 解答区
- **Verify Command**: `ls test/__fixtures__/dogfooding-sample/` + 人工核对 fixture 内容
- **Definition of Done**: fixture 存在且口径定义明确（分子/分母写清）
- **Depends On**: —

### T-02 scanSpecs 聚合纯函数（RED → GREEN）
- **Goal**: 给定目录，统计 feature 完整链路率
- **TDD Steps**:
  - RED: 写 `test/build-dogfooding-dashboard.test.ts`，断言对 fixture 调用 `scanSpecs` 返回 `{complete: 1, total: 3, rate: 0.33}`——函数不存在，失败
  - GREEN: 实现 `scanSpecs` 使通过
- **Verify Command**: `npx vitest run test/build-dogfooding-dashboard.test.ts -t scanSpecs`
- **Definition of Done**: fixture 计数正确；返回结构含 complete/total/rate
- **Depends On**: T-01

### T-03 scanFindings 聚合纯函数（RED → GREEN）
- **Goal**: 给定目录，统计评审拦截数按 P0/P1/P2 分级
- **TDD Steps**:
  - RED: 断言对 fixture 调用 `scanFindings` 返回 `{P0:1, P1:2, P2:2}`——失败
  - GREEN: 实现，复用 `parseReviewFindings`（`guarded-merger.ts:272`）的格式解析
- **Verify Command**: `npx vitest run test/build-dogfooding-dashboard.test.ts -t scanFindings`
- **Definition of Done**: 按 severity 正确分级；复用现有解析器
- **Depends On**: T-01

### T-04 scanEpisodes 聚合纯函数（RED → GREEN）
- **Goal**: 给定目录，统计有证据链的 episode 占比
- **TDD Steps**:
  - RED: 断言对 fixture 调用 `scanEpisodes` 返回 `{withEvidence: 2, total: 4, rate: 0.5}`——失败
  - GREEN: 实现，复用 `episode.ts` 的 schema_version 解析
- **Verify Command**: `npx vitest run test/build-dogfooding-dashboard.test.ts -t scanEpisodes`
- **Definition of Done**: 证据链判定口径与 T-01 锁定一致；计数正确
- **Depends On**: T-01

### T-05 renderMarkdown + 确定性测试
- **Goal**: 把三个聚合结果渲染成静态 Markdown，并验证确定性
- **TDD Steps**:
  - RED: 断言 `renderMarkdown({...})` 返回的字符串包含三类 KPI 表头与数值——失败
  - GREEN: 实现渲染
  - 加确定性测试：同一输入两次渲染字节相等
- **Verify Command**: `npx vitest run test/build-dogfooding-dashboard.test.ts -t renderMarkdown`
- **Definition of Done**: 产物含口径脚注；确定性测试绿
- **Depends On**: T-02, T-03, T-04

### T-06 韧性测试 + CLI main 编排
- **Goal**: 实现 `main()` 编排，补缺数据韧性测试
- **TDD Steps**:
  - RED: 断言对空 `.tinkerman/` 调用 main 退出码 1 且报错友好；对缺子目录的 fixture 不崩溃且显示"无数据"——失败
  - GREEN: 实现错误处理与编排
  - 加 `--help` 输出（遵循 AGENTS §2.8）
- **Verify Command**: `node scripts/build-dogfooding-dashboard.mjs --help` + `npx vitest run test/build-dogfooding-dashboard.test.ts -t "empty"`
- **Definition of Done**: `--help` 可用；空目录退出码 1；缺子目录显示"无数据"
- **Depends On**: T-05

### T-07 真实仓库试跑 + 数字核对
- **Goal**: 在真实 `.tinkerman/` 上跑一次，人工核对数字合理性
- **TDD Steps**:
  - 运行 `node scripts/build-dogfooding-dashboard.mjs`
  - 人工核对：完整链路率是否合理、评审拦截总数与 `.tinkerman/findings/` 文件数是否同数量级
  - 把首版产物附到 design.md 作为验证记录
- **Verify Command**: `node scripts/build-dogfooding-dashboard.mjs && cat .tinkerman/dashboards/dogfooding.md`
- **Definition of Done**: 真实数字合理；产物格式无误；决定 gitignore 策略
- **Depends On**: T-06
