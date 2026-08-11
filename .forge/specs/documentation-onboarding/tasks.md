---
feature: documentation-onboarding
layout: tasks
created: 2026-05-12
spec_ref: ".forge/specs/documentation-onboarding/requirements.md"
---

# Implementation Plan: 新用户引导文档与 README 优化

## Overview

将 Forge 项目的文档体系从单一密集 README 重构为分层、可扫描的文档结构。按依赖顺序实施：基础设施（索引、验证脚本）→ 参考文档（从 README 拆分）→ 内容创建（快速入门、引导路径、工作流示例）→ README 重组 → 国际化。

## Tasks

- [x] 1. 基础设施：文档索引与验证脚本
  - [x] 1.1 创建 docs/INDEX.md 文档导航索引
    - 按 5 个用户意图分类（入门、日常使用、高级配置、故障排除、贡献开发）创建章节
    - 每个条目包含：文档标题、路径（相对链接）、简介（≤120 字符）、适用场景
    - 纳入范围：docs/ 下所有 .md（不含 docs/api/）、根目录 README.md、CONTRIBUTING.md、CHANGELOG.md、SECURITY.md、ROADMAP.md
    - 暂时将尚未创建的文档标注为"待创建"，后续任务创建后更新
    - _Requirements: 5.1, 5.2, 5.7_

  - [x] 1.2 创建 scripts/check-doc-links.sh 链接检查脚本
    - 扫描 docs/ 和根目录 .md 文件中的 Markdown 相对链接 `[text](path)`
    - 验证链接目标文件在仓库中实际存在
    - 报告格式：`[ERROR] <源文件>:<行号> → <目标路径> (文件不存在)`
    - 脚本以非零状态退出当存在失效链接时
    - 脚本头部添加 `# category: internal-only` 注释
    - _Requirements: 5.5, 5.6, 3.7_

  - [x] 1.3 创建 scripts/check-doc-structure.sh 文档结构验证脚本
    - 验证每个 docs/*.md 文件第一行包含返回索引的链接
    - 验证英文版文件（*.en.md）包含对应中文版链接
    - 验证有英文版的中文文档包含英文版链接
    - 验证 INDEX.md 包含所有纳入体系的文档条目
    - 脚本头部添加 `# category: internal-only` 注释
    - _Requirements: 5.4, 6.3, 6.5_

  - [x] 1.4 将验证脚本集成到 npm run check
    - 在 package.json 的 scripts.check 末尾追加 `&& bash scripts/check-doc-links.sh && bash scripts/check-doc-structure.sh`
    - 确保脚本有执行权限（chmod +x）
    - _Requirements: 5.5, 5.6_

- [x] 2. Checkpoint - 确保验证脚本可执行
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. 参考文档：从 README 拆分内容
  - [x] 3.1 创建 docs/reference-security.md
    - 从 README 的"安全与信任"章节提取完整内容
    - 包含：安全机制表、审计说明、CI AI 评审、最小权限默认、结构化冻结区反馈
    - 文件第一行添加返回索引链接 `[← 返回索引](./INDEX.md)`
    - _Requirements: 3.6, 3.8, 5.4_

  - [x] 3.2 创建 docs/reference-architecture.md
    - 从 README 提取：`.forge/` 目录结构、状态文件保护、并行执行、Hook 行为说明
    - 文件第一行添加返回索引链接
    - _Requirements: 3.6, 3.8, 5.4_

  - [x] 3.3 创建 docs/reference-advanced.md
    - 从 README 提取：Forge Loop 自主执行引擎、cmux 集成、Domain Pack、Token 效率
    - 文件第一行添加返回索引链接
    - _Requirements: 3.6, 3.8, 5.4_

  - [x] 3.4 创建 docs/reference-commands.md
    - 从 README 提取：18 命令速查表、三维路由详解（含轻量/标准/全量路径说明）
    - 文件第一行添加返回索引链接
    - _Requirements: 3.6, 3.8, 5.4_

- [x] 4. 内容创建：快速入门指南
  - [x] 4.1 创建 docs/quick-start.md
    - 5 步快速入门：前置条件检查 → 安装 → 初始化 → 首次执行 → 验证成功
    - 前 10 行列出前置条件（Claude Code ≥ 2.1.121、Node.js ≥ 20）及版本检查命令
    - 每步包含可直接复制的命令示例 + 预期输出摘要（≤ 2 行）
    - 三种安装方式各提供独立段落，标注推荐程度
    - 包含 2 个端到端示例：轻量路径（bug 修复）和标准路径（新功能）
    - 包含至少 3 个常见错误故障排除（版本过低、权限问题、命令未识别）
    - 末尾提供"下一步"链接到三条 Onboarding Path
    - 验证命令：`/forge status` 及成功输出特征描述
    - 文件第一行添加返回索引链接
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 5.4_

- [x] 5. 内容创建：分层引导路径
  - [x] 5.1 创建 docs/onboarding-beginner.md（初次接触者）
    - 开头标注预计学习时间（~15 分钟）和前置知识要求
    - 提供用户类型自评描述
    - 对基础概念（三维路由、TDD 流程）提供定义说明和使用示例
    - 对最常用 3 个命令（forge、forge build、forge review）逐一提供语法、参数、执行示例
    - 包含至少 1 个实操练习场景（目标、起始状态、操作步骤、预期结果）
    - 文件第一行添加返回索引链接
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 2.7, 5.4_

  - [x] 5.2 创建 docs/onboarding-daily.md（日常开发者）
    - 开头标注预计学习时间（~20 分钟）和前置知识要求
    - 对标准路径每个阶段（plan → build → review → test → ship）逐一提供目的说明、关键命令、状态流转描述
    - 包含至少 1 个实操练习场景
    - 文件第一行添加返回索引链接
    - _Requirements: 2.1, 2.3, 2.5, 2.6, 5.4_

  - [x] 5.3 创建 docs/onboarding-advanced.md（高级用户/贡献者）
    - 开头标注预计学习时间（~30 分钟）和前置知识要求
    - 对全量路径、知识系统、Forge Loop、Domain Pack、贡献指南逐一提供功能说明、配置方式和使用示例
    - 包含至少 1 个实操练习场景
    - 文件第一行添加返回索引链接
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 5.4_

- [x] 6. 内容创建：工作流示例文档
  - [x] 6.1 创建 docs/workflow-bugfix.md（Bug 修复 - 轻量路径）
    - 设定具体示例背景（项目类型、任务描述、涉及文件）
    - 覆盖 build → review 完整流程
    - 每个阶段包含：用户输入命令、预期输出摘要（≤3 行）、目的说明
    - 提供"做什么"和"为什么这样做"双重解释
    - 展示 review 未通过时的失败恢复流程
    - 标注自动推进行为与用户介入停止点
    - 文件第一行添加返回索引链接
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.4_

  - [x] 6.2 创建 docs/workflow-feature.md（新功能 - 标准路径）
    - 设定具体示例背景
    - 覆盖 plan → build → review → test → ship 完整流程
    - 每个阶段包含命令、输出摘要、目的说明
    - 展示 test 未通过时的失败恢复流程
    - 文件第一行添加返回索引链接
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.4_

  - [x] 6.3 创建 docs/workflow-complex.md（复杂需求 - 全量路径）
    - 设定具体示例背景
    - 覆盖 decide → spec → plan → build → review → test → ship → learn 完整流程
    - 每个阶段包含命令、输出摘要、目的说明
    - 文件第一行添加返回索引链接
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 5.4_

  - [x] 6.4 创建 docs/workflow-resume.md（会话恢复与团队协作）
    - 设定具体示例背景
    - 覆盖 forge resume 和 --from-pr 使用场景
    - 展示从中断点恢复的完整流程
    - 文件第一行添加返回索引链接
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 5.4_

- [x] 7. Checkpoint - 确保所有内容文档已创建
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. README 重组
  - [x] 8.1 重组 README.md 结构
    - 将 README 从 ~500 行精简到 ~150 行
    - 按设计文档定义的层次重组：项目简介 → 核心价值（3-5 要点）→ 快速开始（~20 行摘要 + 链接）→ 文档导航表 → 安装方式（摘要）→ 命令概览（精简表格）→ 安全（摘要）→ 开发 → 许可证
    - 前 20 行包含：≤100 字符项目描述、3-5 核心卖点（每条 ≤50 字符）、推荐安装命令
    - 非核心内容每个主题仅保留 ≤5 行摘要 + 链接到对应参考文档
    - 添加文档导航索引表（Markdown 表格：文档名 | 路径 | 适用场景）
    - 保留的代码示例确保可直接复制执行
    - 验证所有链接目标文件存在
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 9. 国际化：英文版本
  - [x] 9.1 创建 docs/quick-start.en.md
    - 翻译 quick-start.md 为英文
    - 头部添加翻译状态标记和中文版链接
    - 第一行添加返回英文索引链接 `[← Back to Index](./INDEX.en.md)`
    - _Requirements: 6.2, 6.3, 6.5_

  - [x] 9.2 创建 docs/onboarding-beginner.en.md
    - 翻译 onboarding-beginner.md 为英文
    - 头部添加翻译状态标记和中文版链接
    - _Requirements: 6.2, 6.3, 6.5_

  - [x] 9.3 创建 docs/onboarding-daily.en.md
    - 翻译 onboarding-daily.md 为英文
    - 头部添加翻译状态标记和中文版链接
    - _Requirements: 6.2, 6.3, 6.5_

  - [x] 9.4 创建 docs/onboarding-advanced.en.md
    - 翻译 onboarding-advanced.md 为英文
    - 头部添加翻译状态标记和中文版链接
    - _Requirements: 6.2, 6.3, 6.5_

  - [x] 9.5 创建 docs/INDEX.en.md
    - 翻译 INDEX.md 为英文
    - 列出所有英文版文档链接
    - 头部添加中文版链接
    - _Requirements: 6.4, 6.5_

  - [x] 9.6 更新中文文档添加英文版链接
    - 在 quick-start.md、onboarding-beginner.md、onboarding-daily.md、onboarding-advanced.md、INDEX.md 头部添加英文版链接
    - 格式：`[English Version](./xxx.en.md)`
    - _Requirements: 6.5_

- [x] 10. 最终更新与验证
  - [x] 10.1 更新 docs/INDEX.md 移除"待创建"标注
    - 所有文档已创建，更新索引中的条目状态
    - 确保所有链接指向实际存在的文件
    - 在索引中同时列出中英文版本链接，标注语言标识
    - _Requirements: 5.1, 5.3, 6.4_

- [x] 11. Final checkpoint - 运行完整验证
  - Ensure all tests pass, ask the user if questions arise.
  - 运行 `bash scripts/check-doc-links.sh` 确认无失效链接
  - 运行 `bash scripts/check-doc-structure.sh` 确认文档结构合规
  - 运行 `npm run check` 确认 CI 集成正常

## Notes

- 本项目为文档/信息架构项目，不涉及属性测试（设计文档无 Correctness Properties 章节）
- 验证通过 shell 脚本（链接检查 + 结构验证）实现自动化
- README 重组（任务 8）依赖参考文档（任务 3）先创建完成，否则链接会失效
- 国际化（任务 9）依赖中文内容文档（任务 4-6）先完成
- 每个文档第一行必须包含返回索引的导航链接（需求 5.4）
- Checkpoints 确保增量验证，避免后期大量返工

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4"] },
    { "id": 3, "tasks": ["4.1", "5.1", "5.2", "5.3"] },
    { "id": 4, "tasks": ["6.1", "6.2", "6.3", "6.4"] },
    { "id": 5, "tasks": ["8.1"] },
    { "id": 6, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5"] },
    { "id": 7, "tasks": ["9.6", "10.1"] }
  ]
}
```
