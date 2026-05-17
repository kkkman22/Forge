---
title: "纯文档/配置 PR 的评审模式与双目录同步陷阱"
tags: ["review", "documentation", "agent-sync", "token-optimization"]
date: "2026-04-30"
confidence: 0.65
---

## 问题模式

纯文档/配置 PR（无代码变更）容易产生两类遗漏：(1) 格式/引用变更后步骤描述中的旧引用未同步（如 "5-block" → "3-block" 只改了格式定义但步骤描述仍写 "5-block"）；(2) 双目录同步（agents/ 与 .claude/agents/）只同步 frontmatter 字段而忽略正文内容一致性。

## 解决方案

评审纯文档 PR 时增加两项专项检查：
1. **过时引用扫描**：grep 所有变更的关键词旧值（如 "5-block"、"1500"），确认无残留
2. **双目录完整 diff**：不仅对比 frontmatter，还 `diff agents/X.md .claude/agents/X.md` 确认正文一致

修复时直接 `cp .claude/agents/X.md agents/X.md`（运行时版本覆盖源版本），效率最高。

## 踩坑记录

- `skills/forge/lib/build/instructions.md:171` 的 "Append 5-block summary" 在格式定义行 175 已改为 3-block 后仍残留旧值。步骤描述和格式定义在不同行，容易漏改。
- `agents/` 和 `.claude/agents/` 的 3 个 review agent 正文存在英文/中文标题不一致（spec-check、quality-check、security-check），frontmatter 的 model 字段虽然正确同步，但正文语言版本不同。根因：PR 只同步了 frontmatter 变更，未执行完整文件同步。

## 决策理由

- Agent 模型路由选择 explore→haiku、review→sonnet、其他→inherit，基于任务复杂度分层。haiku 用于只读搜索足够；sonnet 用于中等推理的评审；架构决策保留 inherit 以获取强推理。
- 散文压缩规则通过 Structured_Output 豁免清单 + 安全阀双重保护，避免压缩安全关键信息。
- opusplan 模式仅推荐不强制，避免影响非 opus/sonnet 用户（如 GLM 5.1）。

## 可复用模式

- **过时引用防御**：当文档中的数值/格式发生变更时，在 commit 前执行 `grep -n "旧值" <变更文件>` 确认无残留。
- **双目录同步检查**：涉及 agents/ 和 .claude/agents/ 的变更，CI 或评审必须执行完整 diff，不能只检查 frontmatter。
- **纯文档 PR 评审清单**：YAML frontmatter 有效性 + 交叉引用完整性 + 双目录一致性 + 过时引用扫描。
