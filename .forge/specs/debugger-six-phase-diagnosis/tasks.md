---
feature: debugger-six-phase-diagnosis
layout: tasks
created: 2026-06-03
spec_ref: ".forge/specs/debugger-six-phase-diagnosis/requirements.md"
---

# Tasks

## Task 1: 重写 debugger.md Investigation Protocol

- [x] 1.1 在 `.claude/agents/debugger.md` 中，将现有 `## Investigation Protocol` 部分（含 `### Runtime Bugs` 和 `### Build Errors` 两个子段）替换为新的 6 阶段循环。保留 Build Errors 子段不变（移到 Phase 5 之后作为"Build Error 快速路径"）。新 Protocol 包含 6 个 Phase，每个 Phase 有明确的铁门/终止条件。
- [x] 1.2 Phase 1 内容：核心原则声明（"这是核心能力"）、10 种 feedback loop 构建方式表格、Loop 优化迭代（3 问）、非确定性 bug 处理、铁门（建不出 loop 不进入 Phase 2）。
- [x] 1.3 Phase 2 内容：运行 loop 观察 bug 出现、3 项确认 checklist（用户描述的失败/多次复现/捕获症状）、铁门（Phase 2 未通过不进入 Phase 3）。
- [x] 1.4 Phase 3 内容：生成 3-5 个可证伪假设（含格式模板）、展示给用户排序后再测试、无法表述预测 = 丢弃假设。
- [x] 1.5 Phase 4 内容：每个探针对应一个假设、一次只变一个变量、`[DEBUG-xxxx]` 前缀标记规则、性能回归分支（基线测量 + 二分而非 log）。
- [x] 1.6 Phase 5 内容：修复前写回归测试（仅当存在正确 seam）、正确 seam 定义、无 seam = 架构发现（记录标记给 Phase 6）。
- [x] 1.7 Phase 6 内容：5 项 cleanup checklist、post-mortem 问题（"什么能防止这个 bug？"）、架构改进 handoff 输出模板。
- [x] 1.8 在 6 阶段循环后追加"与现有 3 次熔断的集成"段（Phase 3-4 循环内 3 次失败 → 重新生成假设 → 全穷尽 → 建议 `/forge decide`）。

## Task 2: 更新 Output Format 映射

- [x] 2.1 在 `## Output Format` 部分，为每个 Bug Report 字段添加来源映射注释（Symptom ← Phase 2、Root Cause ← Phase 4/5 等），不改变输出格式本身。

## Task 3: 交叉验证

- [x] 3.1 验证新的 Investigation Protocol 不与 `Prohibited Actions` 表冲突（"最小改动"在 Phase 5、不重构在 Prohibited Actions——两者一致）。验证 Phase 6 handoff 输出模板不与 `Behavioral Rules` 的"不要猜测"冲突。验证 Build Errors 快速路径与 Phase 5 Fix 的关系（Build Error 走快速路径，跳过 Phase 1-4）。
