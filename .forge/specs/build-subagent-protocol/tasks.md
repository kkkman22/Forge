---
feature: build-subagent-protocol
layout: tasks
created: 2026-06-04
spec_ref: ".forge/specs/build-subagent-protocol/requirements.md"
---

# Tasks

## Task 1: CLAUDE.md 追加 TDD 合理化预防表

- [ ] 1.1 在 CLAUDE.md §2.1 现有 `tdd-delete-and-restart` 铁律之后插入 §2.1.2 "TDD 合理化预防表"
- [ ] 1.2 确认表格包含 ≥10 行"想法 vs 事实"对照
- [ ] 1.3 确认覆盖所有 12 种指定逃避模式
- [ ] 1.4 确认使用中文

## Task 2: CLAUDE.md 追加验证合理化预防表

- [ ] 2.1 在 CLAUDE.md §2.3 现有 `verification-run-command` 铁律之后插入 §2.3.1 "验证合理化预防表"
- [ ] 2.2 确认表格包含 ≥8 行"想法 vs 事实"对照
- [ ] 2.3 确认覆盖所有 8 种指定逃避模式

## Task 3: forge-build.md 新增 Report Format

- [ ] 3.1 在 `.claude/agents/forge-build.md` 新增 `## Report Format` 章节
- [ ] 3.2 定义四个标准状态码（DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT）
- [ ] 3.3 为每个状态码写明定义、后续处理、禁止行为

## Task 4: forge-build.md 新增升级安全阀

- [ ] 4.1 在 `.claude/agents/forge-build.md` 新增 `## 升级安全阀` 章节
- [ ] 4.2 写入"糟糕的工作比没有工作更差"声明
- [ ] 4.3 列出 ≥4 种应升级的具体场景

## Task 5: forge-build.md 新增 Self-Review

- [ ] 5.1 在 `.claude/agents/forge-build.md` 新增 `## Self-Review（报告前必做）` 章节
- [ ] 5.2 覆盖完整性、质量、纪律、测试四个维度
- [ ] 5.3 声明"自审发现问题 → 先修复再报告"

## Task 6: build/instructions.md 新增 Subagent Status Handling

- [ ] 6.1 在 `skills/forge/lib/build/instructions.md` 新增 `## Subagent Status Handling` 章节
- [ ] 6.2 为 DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT 各写处理流程
- [ ] 6.3 BLOCKED 处理集成 Three-Strike Reroute
- [ ] 6.4 NEEDS_CONTEXT 连续 2 次升级为 BLOCKED

## Task 7: build/instructions.md 新增 TDD Red Flags

- [ ] 7.1 在 `skills/forge/lib/build/instructions.md` 新增 `## TDD Red Flags` 章节
- [ ] 7.2 列出 ≥10 种应立即停止的信号
- [ ] 7.3 以铁律声明结尾

## Task 8: forge-build.md 新增 Anti-Performative Agreement

- [ ] 8.1 在 `.claude/agents/forge-build.md` 新增 `## Anti-Performative Agreement` 章节
- [ ] 8.2 禁止"你说得对"等 ≥4 种纯情感表达
- [ ] 8.3 定义正确格式 `Fixed. [技术描述]` + ≥2 个正反示例对

## Task 9: review/instructions.md 新增 Sycophancy Detection

- [ ] 9.1 在 `skills/forge/lib/review/instructions.md` 新增 `## Sycophancy Detection` 检查项
- [ ] 9.2 定义四种模式及其 P 级判定

## Task 10: CLAUDE.md §2.6 追加反讨好条款

- [ ] 10.1 在 CLAUDE.md §2.6 Output Conciseness 末尾追加"反讨好纪律"条款

## Task 11: 验证

- [ ] 11.1 确认 CLAUDE.md 新增表格格式正确且不与现有内容重复
- [ ] 11.2 确认 forge-build.md 新增章节不与现有 TDD Iron Law / Verification 章节重复
- [ ] 11.3 运行 `npm run check` 全量测试通过
