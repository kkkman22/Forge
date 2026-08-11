---
feature: remaining-backlog
layout: design
created: 2026-05-01
---

# Design: Remaining Backlog

## Overview

本设计将未完成的 4 个方向整合为 6 个工作组，按依赖关系和优先级排序。Group A/B 为纯文档优化（零代码风险），Group C/D 为社区文档，Group E/F 为代码变更。

---

## Group A: SKILL 文档二次压缩（R1）

### 策略

在 skill-document-optimization 已完成的第一轮压缩基础上，执行第二轮精细压缩。每个文件应用以下策略的适用子集：

1. **Reference_Directive**：将与 CLAUDE.md 或其他 SKILL 重复的规则替换为 `→ 遵循 X §Y`
2. **Canonical_Example**：每种输出格式只保留一个完整示例，变体用一行差异描述
3. **Table Compression**：多行描述合并为紧凑表格
4. **Flow Simplification**：冗长流程图替换为 ≤6 行编号步骤
5. **Example Pruning**：保留一个完整示例，删除重复场景

### 目标文件和压缩量

| File | Current | Target | Reduction |
|------|---------|--------|-----------|
| forge-spec | 17,880 | ≤12,000 | -33% |
| forge-loop | 15,353 | ≤10,000 | -35% |
| forge-router | 11,752 | ≤8,500 | -28% |
| forge-refactor | 8,559 | ≤6,500 | -24% |
| forge-test | 8,080 | ≤6,500 | -20% |
| forge-debug | 6,825 | ≤5,500 | -19% |
| forge-fix | 6,362 | ≤5,500 | -13% |

### 验证

- 每个文件压缩后运行 `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
- 最终验证总字符数 ≤145,000

---

## Group B: Agent 文件语言转换（R2）

### 策略

将 10 个 agent 定义文件的结构性文本转为英文，保留行为指令的中文。转换规则：

- Section headings（`## 身份` → `## Identity`）
- Table headers（`| 维度 | 检查内容 |` → `| Dimension | Check Content |`）
- Enumeration structural items（`1. 技术选型` → `1. Tech Stack`）
- 保留：YAML frontmatter values、行为指令正文、角色特定原则

### 文件列表

architect.md, critic.md, debugger.md, designer.md, explore.md, product.md, quality-check.md, security-check.md, security.md, spec-check.md

### 同步

每个文件修改后同步到 `.claude/agents/` 目录。

---

## Group C: 社区基础设施（R3）

### 组件

1. **CONTRIBUTING.md 增强**：架构概览、开发环境、代码风格、提交规范、测试要求
2. **GitHub Issue 模板**：bug_report.md、feature_request.md、skill_plugin_proposal.md
3. **GitHub PR 模板**：PULL_REQUEST_TEMPLATE.md
4. **最佳实践文档**：SKILL 编写、Router 选择、Review 配置、Worktree 使用

---

## Group D: SKILL 插件机制（R4）

### 架构

```
src/skill-loader.ts    — SkillManifest 类型 + loadSkillsFromDir()
src/skill-validator.ts — validateManifest() + checkVersionCompatibility()
```

### 核心纯函数

- `validateManifest(json): ValidationResult` — 验证 skill.json 结构
- `checkVersionCompatibility(manifest, currentVersion): boolean` — semver 范围匹配
- `loadSkillsFromDir(dirEntries): SkillManifest[]` — 扫描目录加载 manifest
- `mergeSkillLists(builtin, external): SkillManifest[]` — 内置优先合并

### 属性

- Property 1: 内置 SKILL 始终优先于同名外部 SKILL
- Property 2: 合并列表包含两个来源的所有唯一 SKILL 名称

---

## Group E: 示例项目（R5）

### 结构

```
examples/
  react-todo/     — 前端示例（React + TypeScript）
    .tinkerman/       — status.md, config.md, specs/, plans/, reviews/
    README.md     — 中文使用指南
    README.en.md  — 英文使用指南
  node-api/       — 后端示例（Node.js + Express）
    .tinkerman/       — 完整配置
    README.md
    README.en.md
```


