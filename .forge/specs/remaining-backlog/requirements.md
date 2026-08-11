---
status: completed
feature: remaining-backlog
layout: requirements
created: 2026-05-01
tier: standard
---
# Requirements: Remaining Backlog

## Overview

本 spec 整合了所有未完成的需求，涵盖 4 个方向：SKILL 文档二次压缩、Agent 文件语言转换、社区生态基础设施、多 AI 平台支持。按优先级排序：P1 为低成本高收益的文档优化，P2 为生态扩展。

---

## R1: SKILL 文档二次压缩（来源：token-budget-compression）

- R1.1: `skills/forge-spec/SKILL.md` 压缩至 ≤12,000 字符（当前 17,880）
- R1.2: `skills/forge-loop/SKILL.md` 压缩至 ≤10,000 字符（当前 15,353）
- R1.3: `skills/forge-router/SKILL.md` 压缩至 ≤8,500 字符（当前 11,752）
- R1.4: `skills/forge-refactor/SKILL.md` 压缩至 ≤6,500 字符（当前 8,559）
- R1.5: `skills/forge-test/SKILL.md` 压缩至 ≤6,500 字符（当前 8,080）
- R1.6: `skills/forge-debug/SKILL.md` 压缩至 ≤5,500 字符（当前 6,825）
- R1.7: `skills/forge-fix/SKILL.md` 压缩至 ≤5,500 字符（当前 6,362）
- R1.8: 所有 SKILL 文件总字符数 ≤145,000（当前 193,250）
- R1.9: 压缩不得改变行为语义，只改变表达方式（引用化、表格化、去冗余）
- R1.10: 不得修改 YAML frontmatter（name、description、disable-model-invocation）
- R1.11: 压缩后所有 contract test 必须通过

## R2: Agent 文件语言转换（来源：token-language-optimization）

- R2.1: 10 个 agent 定义文件（`agents/*.md`）的 table headers、section headings、enumeration structural items 转为英文
- R2.2: 保留 YAML frontmatter、行为指令、角色特定原则的中文内容
- R2.3: 同步更新 `.claude/agents/` 目录下的对应文件
- R2.4: 转换后所有 contract test 必须通过
- R2.5: 整体 BPE token 节省 ≥10%

## R3: 社区基础设施（来源：community-ecosystem）

- R3.1: 增强 CONTRIBUTING.md，包含架构概览、开发环境搭建、代码风格指南、提交规范、测试要求
- R3.2: 创建 GitHub Issue 模板（bug_report、feature_request、skill_plugin_proposal）
- R3.3: 创建 GitHub PR 模板
- R3.4: 创建最佳实践文档（SKILL 编写指南、Router 选择指南、Review 配置指南、Worktree 使用指南）
- R3.5: 文档提供中英双语版本

## R4: SKILL 插件机制（来源：community-ecosystem）

- R4.1: 定义 `SkillManifest` 类型和 `skill.json` schema
- R4.2: 实现 `validateManifest()` 纯函数，验证 manifest 结构和 semver 兼容性
- R4.3: 实现 `loadSkillsFromDir()` 和 `mergeSkillLists()` 纯函数，内置 SKILL 优先
- R4.4: 添加 `--skills-dir <path>` CLI 选项
- R4.5: 编写属性测试和单元测试

## R5: 示例项目（来源：community-ecosystem）

- R5.1: 创建前端示例项目 `examples/react-todo/`
- R5.2: 创建后端示例项目 `examples/node-api/`
- R5.3: 示例项目包含完整的 `.forge/` 配置和使用指南


