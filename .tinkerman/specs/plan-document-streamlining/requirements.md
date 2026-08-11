---
status: completed
feature: plan-document-streamlining
layout: requirements
created: 2026-04-29
tier: standard
---
# 需求文档：Plan 文档精简化

## 简介

当前 forge-plan SKILL 要求每个原子任务包含完整的 RED/GREEN/REFACTOR 代码。对于大型 feature（10+ 需求、12+ 属性测试、10+ 文件变更），按此格式编写 Plan 文档本身就是一项巨大的工程，且与 Spec 层（design.md、tasks.md）存在大量内容重叠。

本功能重新定义 Spec 与 Plan 的职责边界：Spec 负责"做什么"和"怎么验证"（含完整接口签名、数据模型、正确性属性），Plan 只补充"文件在哪"、"先后顺序"和"覆盖映射"，具体代码留给 build 阶段按 TDD 编写。Plan 中保留关键的接口契约和数据结构引用（指向 design.md 的具体章节），使 build 阶段无需重新理解整个 Spec 即可开始工作。

## 术语表

- **Plan_Generator**：forge-plan SKILL 中负责生成 Plan 文档的规划引擎
- **Plan_Document**：`.tinkerman/plans/<topic>.md` 文件，描述实现计划的文档
- **Spec_Document**：包含 requirements.md、design.md、tasks.md 的完整规格文档集
- **File_Mapping**：Plan 中的文件变更清单，列出所有需要创建或修改的文件及其操作类型
- **Task_Dependency_Graph**：任务之间的依赖关系图，定义执行顺序
- **Spec_Coverage_Matrix**：Plan 任务与 Spec 需求之间的覆盖映射表
- **Design_Reference**：Plan 中指向 design.md 具体章节的引用链接
- **Build_Phase**：forge-build SKILL 执行阶段，按 TDD 编写具体代码
- **Atomic_Task**：Plan 中的最小工作单元，当前要求包含完整 RED/GREEN/REFACTOR 代码
- **Lightweight_Task**：精简后的任务格式，包含目标描述、文件路径、Design_Reference 和验证命令，不包含完整代码

## 需求

### 需求 1：Plan 文档职责边界定义

**用户故事：** 作为开发者，我希望 Plan 文档与 Spec 文档有明确的职责分工，以避免内容重叠和维护负担。

#### 验收标准

1. THE Plan_Generator SHALL 将 Plan_Document 的职责限定为三个方面：File_Mapping、Task_Dependency_Graph、Spec_Coverage_Matrix
2. THE Plan_Generator SHALL 不在 Plan_Document 中重复 design.md 已定义的接口签名和数据模型的完整内容
3. THE Plan_Generator SHALL 在 Plan_Document 中通过 Design_Reference 引用 design.md 的具体章节，而非复制其内容
4. WHEN Spec_Document 包含 design.md 时，THE Plan_Generator SHALL 从 design.md 提取接口契约摘要作为 Plan_Document 的上下文索引

### 需求 2：精简任务格式

**用户故事：** 作为开发者，我希望 Plan 中的任务格式更轻量，以减少 Plan 编写的工作量，同时保留足够的信息指导 build 阶段。

#### 验收标准

1. THE Plan_Generator SHALL 生成 Lightweight_Task 格式，包含以下字段：任务编号、任务标题、目标文件路径、Design_Reference、验证命令、提交信息
2. THE Lightweight_Task SHALL 不包含完整的 RED/GREEN/REFACTOR 代码块
3. THE Lightweight_Task SHALL 包含一句话的任务目标描述，说明该任务要实现的行为变更
4. THE Lightweight_Task SHALL 包含指向 design.md 中相关接口或数据模型章节的 Design_Reference
5. WHEN 任务涉及属性测试时，THE Lightweight_Task SHALL 引用 design.md 中对应的 Correctness Property 编号

### 需求 3：File Mapping 生成

**用户故事：** 作为开发者，我希望 Plan 自动生成完整的文件变更清单，以便在 build 阶段快速定位工作范围。

#### 验收标准

1. THE Plan_Generator SHALL 为每个文件标注操作类型：`CREATE`（新建）或 `MODIFY`（修改）
2. THE Plan_Generator SHALL 为每个文件提供一句话说明，描述变更目的
3. THE Plan_Generator SHALL 确保测试文件与源文件成对出现
4. THE Plan_Generator SHALL 使用从项目根目录开始的完整相对路径
5. WHEN Spec_Document 包含 design.md 时，THE Plan_Generator SHALL 从 design.md 的 Components and Interfaces 章节提取文件路径信息

### 需求 4：任务依赖排序

**用户故事：** 作为开发者，我希望 Plan 中的任务按依赖关系排序，以确保 build 阶段按正确顺序执行。

#### 验收标准

1. THE Plan_Generator SHALL 为每个 Lightweight_Task 标注其依赖的前置任务编号（`dependsOn` 字段）
2. THE Plan_Generator SHALL 确保任务排序满足拓扑排序约束：所有前置任务排在依赖任务之前
3. IF Task_Dependency_Graph 中存在循环依赖，THEN THE Plan_Generator SHALL 报告错误并拒绝生成 Plan_Document
4. THE Plan_Generator SHALL 将无依赖关系的任务标记为可并行执行

### 需求 5：Spec Coverage 映射

**用户故事：** 作为开发者，我希望 Plan 中包含 Spec 需求与任务的覆盖映射，以确保所有需求都被实现。

#### 验收标准

1. THE Plan_Generator SHALL 生成 Spec_Coverage_Matrix，将每个 Spec 需求的验收标准映射到对应的 Lightweight_Task
2. THE Plan_Generator SHALL 确保 Spec_Document 中的每个验收标准至少被一个 Lightweight_Task 覆盖
3. IF 存在未被覆盖的验收标准，THEN THE Plan_Generator SHALL 报告缺失覆盖并自动补充任务
4. THE Spec_Coverage_Matrix SHALL 同时映射 design.md 中的 Correctness Property 到对应的测试任务

### 需求 6：Design Reference 格式

**用户故事：** 作为开发者，我希望 Plan 中的 Design Reference 格式统一且可追溯，以便 build 阶段快速定位设计细节。

#### 验收标准

1. THE Design_Reference SHALL 使用格式 `design.md#<章节锚点>` 指向 design.md 的具体章节
2. THE Design_Reference SHALL 包含被引用章节的一句话摘要，描述该章节定义的核心接口或数据模型
3. WHEN design.md 中的章节被重命名或删除时，THE Plan_Generator SHALL 在自检阶段检测到失效的 Design_Reference 并报告错误
4. THE Plan_Document SHALL 在文档头部包含一个 Design Reference 索引表，汇总所有被引用的 design.md 章节

### 需求 7：自检规则适配

**用户故事：** 作为开发者，我希望 Plan 的自检规则适配精简后的任务格式，以确保计划质量不降低。

#### 验收标准

1. THE Plan_Generator SHALL 保留 Spec 覆盖率自检：每个 Spec 需求的验收标准至少被一个任务覆盖
2. THE Plan_Generator SHALL 将占位符扫描的范围调整为任务描述和 Design_Reference 字段，而非完整代码块
3. THE Plan_Generator SHALL 新增 Design_Reference 有效性自检：验证所有 Design_Reference 指向的 design.md 章节确实存在
4. THE Plan_Generator SHALL 新增依赖关系自检：验证 Task_Dependency_Graph 无循环且满足拓扑排序
5. THE Plan_Generator SHALL 移除类型一致性自检（该职责已由 design.md 承担）

### 需求 8：Build 阶段信息传递

**用户故事：** 作为开发者，我希望 build 阶段能从精简的 Plan 中获取足够的上下文，无需重新阅读整个 Spec 即可开始 TDD 编码。

#### 验收标准

1. THE Lightweight_Task SHALL 包含足够的信息使 Build_Phase 能定位到 design.md 中的完整接口定义
2. THE Lightweight_Task SHALL 包含验证命令，使 Build_Phase 能验证任务完成
3. WHEN Build_Phase 开始执行某个 Lightweight_Task 时，THE Build_Phase SHALL 仅需读取该任务的 Design_Reference 指向的 design.md 章节，而非整个 design.md
4. THE Plan_Document SHALL 在文档头部包含 Spec_Document 的路径引用，使 Build_Phase 能按需查阅完整 Spec

### 需求 9：向后兼容性

**用户故事：** 作为现有用户，我希望精简后的 Plan 格式不破坏现有的 forge 工作流。

#### 验收标准

1. THE Plan_Document SHALL 保持现有的 YAML frontmatter 格式（topic、status、date、spec_ref 字段）
2. THE Plan_Document SHALL 保持与 forge-build SKILL 的门禁检查兼容（status 字段的 draft/approved 语义不变）
3. WHEN Spec_Document 不包含 design.md 时，THE Plan_Generator SHALL 回退到当前的 Atomic_Task 格式（包含完整 RED/GREEN/REFACTOR 代码）
4. THE Plan_Generator SHALL 在 Plan_Document 的 YAML frontmatter 中新增 `format` 字段，值为 `lightweight` 或 `full`，标识使用的任务格式

### 需求 10：Plan 文档结构定义

**用户故事：** 作为开发者，我希望精简后的 Plan 文档有清晰的结构模板，以保持团队一致性。

#### 验收标准

1. THE Plan_Document SHALL 包含以下顶层章节：Objective、Design Reference Index、File Mapping、Task Breakdown、Spec Coverage
2. THE Design Reference Index 章节 SHALL 列出所有被引用的 design.md 章节及其一句话摘要
3. THE Task Breakdown 章节 SHALL 使用 Lightweight_Task 格式列出所有任务
4. THE Spec Coverage 章节 SHALL 包含 Spec_Coverage_Matrix
5. THE Plan_Document SHALL 省略 Research Findings 章节中的代码库分析细节（该信息已在 design.md 中体现）
