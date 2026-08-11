---
feature: subagent-truncation-fix
layout: tasks
created: 2026-05-29
spec_ref: ".forge/specs/subagent-truncation-fix/requirements.md"
---

# Subagent 结果截断修复 — 任务清单

- [x] 1. 定义截断检测类型和纯函数（RED）
  - 在 `src/` 中创建或扩展截断检测逻辑
  - 定义 `LayerResult` 类型：`{ layer, raw, report, truncated }`
  - 实现 `detectTruncation(raw: string): LayerResult` 纯函数
  - 检测 `<!-- REPORT_START -->` 和 `<!-- REPORT_END -->` 标记
  - 检查报告是否包含必要段落（P0 Issues、Summary）
  - 编写单元测试：完整报告 → truncated=false；无标记 → truncated=true；不完整 → truncated=true
  - 测试先于实现（TDD RED）
  - _Requirements: 3.1, 3.2_

- [x] 2. 定义结构化报告模板
  - 在 SKILL 文档模板中定义 `<!-- REPORT_START -->` ... `<!-- REPORT_END -->` 包裹的报告格式
  - 模板包含：P0/P1/P2/P3 Issues 段落 + Summary
  - 模板 token 消耗预估 < 500 tokens
  - _Requirements: 1.1, 1.2_

- [x] 3. 更新 spec-check SKILL 文档
  - 添加结构化报告模板
  - 添加两阶段执行指令（先收集后报告）
  - 添加 `maxTurns: 15` 建议
  - 添加"报告阶段禁止调用工具"指令
  - 添加"优先高优先级检查"指令
  - _Requirements: 1.1, 1.3, 4.1, 4.2, 4.3_

- [x] 4. 更新 quality-check SKILL 文档
  - 同 task 3，`maxTurns: 12`
  - _Requirements: 1.1, 1.3, 4.1, 4.2, 4.3_

- [x] 5. 更新 security-check SKILL 文档
  - 同 task 3，`maxTurns: 10`
  - _Requirements: 1.1, 1.3, 4.1, 4.2, 4.3_

- [x] 6. 实现截断检测逻辑（GREEN）
  - 实现 task 1 中定义的 `detectTruncation` 函数
  - 确保所有 task 1 的测试通过
  - _Requirements: 3.1, 3.2_

- [x] 7. 集成到 /forge review 结果处理流程
  - 更新 `skills/forge/lib/review/instructions.md`（或对应 SKILL 文件）
  - 收到 subagent 结果后调用 `detectTruncation`
  - 1 层 truncated：正常输出 + `[数据不完整]` 标注
  - 2 层 truncated：输出警告 + 建议重跑
  - 3 层 truncated：触发 L2 降级（串行单 agent 重试）
  - 将 methodology 级别写入 review report
  - _Requirements: 3.1, 3.3, 3.4_

- [x] 8. 实现降级策略
  - 3 层全 truncated 时，按 Fallback Ladder L2 执行串行重试
  - 串行重试使用简化的评审指令（减少工具调用）
  - 重试结果仍经过截断检测
  - 重试仍全部 truncated 时，标记为 L3（阻断 ship）
  - _Requirements: 3.4_

- [x] 9. 编写 E2E 测试
  - 模拟高 tool_uses 场景（通过 mock subagent 返回截断结果）
  - 验证截断检测正确触发
  - 验证降级策略正确执行
  - 验证 3 层全 truncated 时 L3 阻断
  - _Requirements: 验收标准 E2E 测试_
