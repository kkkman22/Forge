---
status: completed
feature: community-ecosystem
layout: requirements
created: 2026-04-29
tier: standard
---
# 需求文档：社区与生态建设（v3.0）

## 简介

面向社区开放 Forge 项目，构建可扩展的 AI 编码工作流生态。包含三个核心方向：社区基础设施建设、SKILL 插件机制、示例项目与最佳实践文档。

## 术语表

- **SKILL_Plugin**：第三方开发的 SKILL 模块，遵循标准接口和 frontmatter 规范，可独立发布和安装
- **SKILL_Registry**：SKILL 插件的注册和发现机制，支持搜索、安装、版本管理
- **SKILL_Manifest**：SKILL 插件的元数据描述文件，包含名称、版本、依赖、兼容性等信息
- **Contributor_Guide**：贡献者指南，描述代码规范、提交流程、审查标准

## 需求

### 需求 1：贡献者指南与 Issue 模板

**用户故事：** 作为社区贡献者，我希望有清晰的贡献指南和标准化的 Issue 模板，以便高效参与项目。

#### 验收标准

1. THE CONTRIBUTING.md SHALL 包含：开发环境搭建、代码规范（Biome 配置）、提交规范（commit message 格式）、PR 流程、测试要求（属性测试 + 单元测试）
2. THE Issue 模板 SHALL 包含至少三种类型：Bug Report、Feature Request、SKILL Plugin Proposal
3. THE PR 模板 SHALL 包含：变更描述、关联 Issue、测试覆盖、破坏性变更声明
4. THE CONTRIBUTING.md SHALL 包含项目架构概览，帮助新贡献者理解代码结构

### 需求 2：SKILL 插件机制

**用户故事：** 作为第三方开发者，我希望能开发、发布和安装自定义 SKILL，以扩展 Forge 的工作流能力。

#### 验收标准

1. THE SKILL_Manifest SHALL 定义标准的 `skill.json` 格式，包含：`name`、`version`、`description`、`author`、`forgeVersion`（兼容的 Forge 版本范围）、`phases`（支持的阶段列表）
2. THE SKILL_Plugin SHALL 遵循现有 SKILL.md frontmatter 规范，确保与内置 SKILL 的一致性
3. THE forge-loop CLI SHALL 支持 `--skills-dir <path>` 选项，允许指定额外的 SKILL 搜索目录
4. THE SKILL_Registry SHALL 支持从本地目录安装 SKILL 插件（`forge skill install <path>`）
5. WHEN 加载第三方 SKILL 时，THE SkillResolver SHALL 验证 `skill.json` 的 `forgeVersion` 字段与当前版本兼容
6. THE SKILL_Plugin 的 SKILL.md SHALL 支持 i18n（`SKILL.{locale}.md` 命名约定）

### 需求 3：示例项目与最佳实践

**用户故事：** 作为新用户，我希望有示例项目和最佳实践文档，以快速上手 Forge 工作流。

#### 验收标准

1. THE 示例项目 SHALL 包含至少两个完整的端到端示例：一个前端项目（React/Vue）、一个后端项目（Node.js API）
2. THE 最佳实践文档 SHALL 覆盖：SKILL 编写指南、Router 档位选择策略、Review 质量门禁配置、Worktree 使用场景
3. THE 示例项目 SHALL 包含 `.forge/` 目录的完整配置，可直接运行 `forge-loop`
4. THE 文档 SHALL 以中英双语提供
