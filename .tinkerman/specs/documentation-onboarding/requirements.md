---
status: completed
feature: documentation-onboarding
layout: requirements
created: 2026-05-12
tier: standard
---
# 需求文档：新用户引导文档与 README 优化

## 简介

Forge 项目已开发 2 周，核心功能（18+ 命令、三维路由、TDD 强制、并行执行、知识系统等）已基本完成，但面向新用户的引导文档严重不足。现有 README 虽然内容全面但过于密集，缺乏分层引导路径。本需求旨在创建新用户快速入门指南、按用户类型分层的引导路径，并优化 README 结构以提升可访问性。

## 术语表

- **Documentation_System**：Forge 项目的文档体系，包括 README、快速入门指南、用户引导文档等
- **Quick_Start_Guide**：面向新用户的快速入门文档，提供从安装到首次使用的最短路径
- **Onboarding_Path**：按用户类型设计的分层引导路径，引导不同背景的用户找到适合自己的学习路线
- **README_Optimizer**：README 文档的结构优化模块，负责重组内容层次和导航结构
- **User_Type**：Forge 的目标用户分类，包括：初次接触者、日常开发者、高级用户/贡献者
- **Workflow_Example**：展示 Forge 常见使用场景的实操示例文档
- **Navigation_Index**：文档导航索引，帮助用户快速定位所需内容

## 需求

### 需求 1：新用户快速入门指南

**用户故事：** 作为一个首次接触 Forge 的开发者，我希望有一份简洁的快速入门指南，以便我能在 5 分钟内完成安装并成功执行第一个命令。

#### 验收标准

1. THE Quick_Start_Guide SHALL 提供从零开始到成功执行第一个 Forge 命令（`/forge status`）的完整步骤，总步骤数不超过 5 步，且每步包含单一操作
2. WHEN 用户按照 Quick_Start_Guide 的步骤操作时，THE Documentation_System SHALL 确保每一步都包含可直接复制执行的命令示例，并在命令下方注明该命令的预期输出摘要（不超过 2 行描述）
3. THE Quick_Start_Guide SHALL 在文档前 10 行内明确列出前置条件（Claude Code 版本要求、Node.js 版本要求），并为每项前置条件提供版本检查命令
4. WHEN 用户完成快速入门流程后，THE Quick_Start_Guide SHALL 提供"下一步"链接，引导用户根据其使用意图进入对应的 Onboarding_Path（初次接触者、日常开发者、高级用户）
5. THE Quick_Start_Guide SHALL 包含至少 2 个端到端的使用示例：一个轻量路径示例（从描述 bug 到 `forge review` 完成）和一个标准路径示例（从描述需求到 `forge ship` 完成），每个示例包含完整命令序列和各步骤的预期输出摘要
6. IF 用户在安装过程中遇到常见错误，THEN THE Quick_Start_Guide SHALL 提供至少 3 个常见错误场景的故障排除指引，每个场景包含错误现象描述、原因说明和解决步骤
7. THE Quick_Start_Guide SHALL 为三种安装方式（插件安装、直接克隆、分发包）各提供独立的安装步骤段落，并在段落开头标注推荐程度（推荐/可选）
8. WHEN 用户完成安装步骤后，THE Quick_Start_Guide SHALL 提供一条验证命令（`/forge status`）及其成功时的预期输出特征描述，使用户能明确判断安装是否成功

### 需求 2：分层用户引导路径

**用户故事：** 作为不同经验水平的开发者，我希望有针对我背景的引导路径，以便我能高效地学习 Forge 中与我相关的功能。

#### 验收标准

1. THE Onboarding_Path SHALL 为以下三类用户提供独立的引导路线文档：初次接触者、日常开发者、高级用户/贡献者，每条路线为单独的文档文件
2. IF 用户为初次接触者，THEN THE Onboarding_Path SHALL 对基础概念（三维路由、TDD 流程）提供定义说明和使用示例，并对最常用的 3 个命令（forge、forge build、forge review）逐一提供语法说明、参数列表和执行示例
3. IF 用户为日常开发者，THEN THE Onboarding_Path SHALL 对标准路径工作流的每个阶段（plan → build → review → test → ship）逐一提供目的说明、关键命令和阶段间状态流转的描述
4. IF 用户为高级用户，THEN THE Onboarding_Path SHALL 对全量路径、知识系统、Forge Loop、Domain Pack 和贡献指南逐一提供功能说明、配置方式和至少一个使用示例
5. THE Onboarding_Path SHALL 在每个路线的开头提供预计学习时间（以分钟为单位）和前置知识要求（列出具体技能或概念名称）
6. THE Onboarding_Path SHALL 在每个路线中包含至少 1 个实操练习场景，每个场景须包含：目标描述、起始状态、操作步骤序列、预期结果
7. THE Onboarding_Path SHALL 在路线选择入口处提供用户类型自评描述，使用户能根据自身经验对号入座选择对应路线

### 需求 3：README 结构优化

**用户故事：** 作为一个浏览 Forge 仓库的开发者，我希望 README 能快速告诉我这个项目是什么、能做什么、如何开始，以便我能在 30 秒内决定是否要深入了解。

#### 验收标准

1. THE README_Optimizer SHALL 将 README 重组为以下固定层次结构，各层级按此顺序排列：项目简介（一句话描述 + 徽章）→ 核心价值（3-5 个要点列表）→ 快速开始（最简安装命令 + 首次使用示例，末尾链接到独立的快速开始文档）→ 详细文档索引（表格形式）
2. THE README_Optimizer SHALL 确保 README 的前 20 行包含：不超过 100 个字符的项目一句话描述、3-5 个核心卖点要点（每条不超过 50 个字符）、推荐安装方式的单条命令
3. WHEN README 内容超过 200 行时，THE README_Optimizer SHALL 将非核心内容（安全细节、架构说明、高级功能、目录结构等）拆分到独立文档，README 中每个被拆分主题仅保留不超过 5 行的摘要和指向对应文档的相对路径链接
4. THE README_Optimizer SHALL 在 README 中添加文档导航索引表，采用 Markdown 表格格式，包含三列：文档名称、文档路径（相对链接）、适用场景（一句话说明该文档面向的读者或用途），列出所有拆分出的独立文档
5. THE README_Optimizer SHALL 确保 README 中保留的代码示例在用户完成安装步骤后可在终端中直接复制粘贴执行，不依赖未在 README 中说明的前置条件或环境变量
6. THE README_Optimizer SHALL 保留现有 README 中的安全信息（安全机制表、审计说明、CI 评审）和技术细节（目录结构、并行执行、Token 效率等），将其移至 `docs/` 目录下的独立参考文档中，README 中以摘要和链接替代
7. IF README 中存在指向独立文档的链接，THEN THE README_Optimizer SHALL 验证链接目标文件存在，不存在时在该链接旁标注"待创建"
8. WHEN 拆分内容到独立文档时，THE README_Optimizer SHALL 在每个独立文档的开头添加返回 README 的导航链接

### 需求 4：常见工作流示例文档

**用户故事：** 作为一个已安装 Forge 的开发者，我希望有实际的工作流示例，以便我能理解 Forge 在真实开发场景中如何使用。

#### 验收标准

1. THE Workflow_Example SHALL 覆盖以下 4 个核心场景：Bug 修复（轻量路径：build → review）、新功能开发（标准路径：plan → build → review → test → ship）、复杂需求（全量路径：decide → spec → plan → build → review → test → ship → learn）、会话恢复与团队协作（使用 forge resume 从中断点继续）
2. THE Workflow_Example SHALL 对每个场景中的每个阶段命令包含以下三部分：用户输入的完整命令文本、该命令产生的预期输出摘要（不超过 3 行描述）、以及该步骤在工作流中的目的说明
3. THE Workflow_Example SHALL 对每个场景提供"做什么"和"为什么这样做"的双重解释
4. IF 工作流中某阶段执行失败（review 未通过或 test 未通过），THEN THE Workflow_Example SHALL 展示失败时的系统提示内容、用户修复操作、以及重新执行该阶段直至通过的完整恢复流程
5. THE Workflow_Example SHALL 为每个场景设定具体的示例背景，包含：项目类型（如 Web API、CLI 工具）、具体任务描述（如"修复用户登录超时 bug"）、以及涉及的文件范围（1-3 个文件）
6. THE Workflow_Example SHALL 在每个场景中标注 Forge 自动推进行为（阶段成功后自动进入下一阶段）与需要用户介入的停止点（阶段失败时）

### 需求 5：文档导航与发现性

**用户故事：** 作为一个 Forge 用户，我希望能快速找到我需要的文档，以便我不必在多个文件中搜索信息。

#### 验收标准

1. THE Navigation_Index SHALL 在 docs/ 目录下提供一个统一的文档索引文件（docs/INDEX.md），列出所有纳入文档体系的文档条目，每个条目包含：文档标题、一句话简介（不超过 120 个字符）、以及适用场景描述
2. THE Navigation_Index SHALL 按以下用户意图分类组织文档，每个分类作为索引中的独立章节：入门、日常使用、高级配置、故障排除、贡献开发
3. WHEN 用户从 README 进入文档体系时，THE Navigation_Index SHALL 确保任何目标文档的到达路径不超过 2 次点击（即 README → INDEX.md → 目标文档，或 README → 目标文档）
4. THE Navigation_Index SHALL 在每个纳入文档体系的 Markdown 文档开头第一行提供返回索引的相对链接（格式为指向 docs/INDEX.md 的 Markdown 链接）
5. THE Documentation_System SHALL 确保所有文档间的交叉引用链接为可解析的相对路径，且指向的目标文件在仓库中实际存在
6. IF 文档体系中存在交叉引用链接指向不存在的文件或错误的锚点，THEN THE Documentation_System SHALL 在链接检查时报告该失效链接的源文件位置和目标路径
7. THE Navigation_Index SHALL 将以下范围的文件纳入文档体系：docs/ 目录下所有 .md 文件（不含 docs/api/ 子目录）以及仓库根目录的 README.md、CONTRIBUTING.md、CHANGELOG.md、SECURITY.md、ROADMAP.md

### 需求 6：文档国际化基础结构

**用户故事：** 作为一个中文/英文开发者，我希望文档同时提供中英文版本，以便不同语言背景的用户都能顺畅阅读。

#### 验收标准

1. THE Documentation_System SHALL 以中文作为主要语言编写所有新文档（与项目现有文档语言一致）
2. THE Documentation_System SHALL 为核心文档（Quick_Start_Guide、Onboarding_Path）提供英文版本，英文版本文件与中文版本位于同一目录下，文件命名采用 `<name>.en.md` 后缀
3. WHEN 中文版本更新且英文版本尚未同步更新时，THE Documentation_System SHALL 在英文版本文件的第一行标注翻译滞后提示，包含对应中文版本的最后更新日期
4. THE Documentation_System SHALL 在文档索引中同时列出中英文版本的链接，每个条目明确标注语言标识（中文/English）
5. THE Documentation_System SHALL 在每个英文版本文件头部提供指向对应中文版本的链接，在每个有英文版本的中文文档头部提供指向英文版本的链接
