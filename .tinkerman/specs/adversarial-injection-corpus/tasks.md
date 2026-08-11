## Overview

对抗注入语料库 + 确定性 bypass 评估器 + 单调收紧门禁。先建语料，再写判定函数，最后做门禁。按 TDD：判定函数先写失败测试。

## Task Dependency Graph

```json
{
  "waves": [
    ["T-01"],
    ["T-02"],
    ["T-03"],
    ["T-04"],
    ["T-05"],
    ["T-06"]
  ]
}
```

## Task Definitions

### T-01 建立四分类初始语料库
- **Goal**: 在 `security/adversarial-corpus/injections/` 下建 4 个分类目录，每类 5-8 条语料，总量 ≥ 30
- **TDD Steps**:
  - 调研公开 prompt injection 案例（OWASP、学术 red-team 集），改写为不涉及真实凭据的测试语料
  - 写入 `basic-override/`（"忽略前述指令"系列）、`role-jailbreak/`（角色扮演）、`fence-escape/`（尝试闭合 UNTRUSTED_PREAMBLE）、`known-bypasses/`（初始留占位 + README）
  - 每个 `known-bypasses/` 的 README 说明此分类的扩充规则
- **Verify Command**: `find security/adversarial-corpus/injections -name '*.txt' | wc -l`（应 ≥ 30）
- **Definition of Done**: 4 分类各 ≥ 5 条；总量 ≥ 30；命名 `NNN-slug.txt`；无真实凭据
- **Depends On**: —

### T-02 bypass 判定纯函数（RED → GREEN）
- **Goal**: 实现 `judgeBypass(rawInjection, wrappedResult) => {bypassed, note}`，结构层判定注入是否逃逸 fence
- **TDD Steps**:
  - RED: 写 `test/adversarial-corpus.test.ts`，构造一条"指令覆盖"语料 + 正确 fence 包装结果，断言 `bypassed: false`；再构造未包装结果，断言 `bypassed: true`——函数不存在，失败
  - GREEN: 实现判定（检测 fence 标记是否完整、注入是否篡改了结构指纹）
  - 用真实 `wrapWorkspaceContext` 校准判定口径（呼应 Open Question 1）
- **Verify Command**: `npx vitest run test/adversarial-corpus.test.ts -t judgeBypass`
- **Definition of Done**: 正确区分被拦 vs 逃逸；判定口径文档化在函数注释
- **Depends On**: T-01

### T-03 评估器编排 + 语料完整性契约测试
- **Goal**: 实现 `evaluate.mjs` 遍历语料、逐条判定、汇总结果
- **TDD Steps**:
  - RED: 断言语料完整性（每分类 ≥ 5 条、总量 ≥ 30、命名规范）——若不满足失败
  - GREEN: 实现遍历与汇总
- **Verify Command**: `node security/adversarial-corpus/evaluate.mjs`
- **Definition of Done**: 评估器跑完全部语料，输出 per-category 与汇总 bypass-rate
- **Depends On**: T-02

### T-04 生成首版 baseline-results.json
- **Goal**: 跑评估器，把结果写入 `baseline-results.json`，人工核对
- **TDD Steps**:
  - 运行评估器，首次写入 baseline
  - 人工核对：basic-override 应 bypassed: 0（fence 设计就为拦这类）；fence-escape 可能有少量 bypassed（记录为已知边界）
- **Verify Command**: `cat security/adversarial-corpus/baseline-results.json`
- **Definition of Done**: baseline 存在；数字合理；已知 bypass 在 note 中记录原因
- **Depends On**: T-03

### T-05 单调收紧门禁
- **Goal**: 评估器对比 baseline，bypass-rate 回升则退出码 1
- **TDD Steps**:
  - RED: 断言"当模拟 bypass-rate 高于 baseline 时退出码为 1；≤ baseline 时为 0"——失败
  - GREEN: 实现对比逻辑 + 退出码
  - 支持 `--update-baseline` 显式更新
- **Verify Command**: `node security/adversarial-corpus/evaluate.mjs; echo $?`（应 0）
- **Definition of Done**: 回升阻断、持平/下降通过；`--update-baseline` 可用
- **Depends On**: T-04

### T-06 破坏性回归注入验证（手动，还原）
- **Goal**: 证明门禁能拦住 fence 被改坏
- **TDD Steps**:
  - 临时把 `untrusted-fence.ts` 的 `wrapWorkspaceContext` 改成直接返回原文
  - 跑评估器 → 确认 bypass-rate 飙升、退出码 1
  - 还原代码
  - 记录验证结果到 design.md
- **Verify Command**: `git diff --stat`（确认还原）+ `node security/adversarial-corpus/evaluate.mjs; echo $?`（应恢复 0）
- **Definition of Done**: 改坏 fence 被门禁拦截；代码完全还原
- **Depends On**: T-05
