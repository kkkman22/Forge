---
feature: plan-global-constraints-and-interfaces
status: locked
date: 2026-06-21
layout: requirements
created: 2026-06-21
tier: standard
workflow_variant: requirements-first
kind: feature
brownfield: true
---

# Requirements Document

## Purpose

obra/superpowers v6.0.0 在 writing-plans 给 plan 文档引入两个结构化块:Global Constraints 块(所有任务都受约束的规则逐字抄进 plan)和 per-task Interfaces 块(每个任务精确列出消费/产出契约)。实测用这种方式写的 plan 1 轮修复完成,对照组需 2-4 轮且 ship 了一个真 bug——根因是 implementer 不知道邻居任务的接口假设,各自实现后契约不匹配。

当前 Forge 的 plan 格式有 Task Breakdown/File Mapping/Spec Coverage,但没有跨任务约束的集中块,也没有 per-task 的接口契约描述。跨任务约束散落在 spec/design/charter,implementer 执行单 task 时未必读到;Task 间契约依赖仅靠 Depends On 编号表达,不描述契约内容。本 spec 让 plan 自包含约束与契约。

## Glossary

| Term | Definition |
|------|-----------|
| Global Constraints | plan 文档中所有任务都必须遵守的约束集中块 |
| Interfaces | plan 中每个 task 的 Consumes(消费接口)/Produces(产出接口)子块 |
| plan 即合同 | build/instructions.md:38 既有铁律,本 spec 的延伸:约束与契约写进 plan 让其自包含 |

## Requirements

### Requirement 1: plan 格式新增 Global Constraints 块

plan 文档开头有本次所有任务都必须遵守的约束集中块,implementer 不必在每个 task 里重复推导或遗漏。

#### Acceptance Criteria

- 当 plan 文档生成时 系统应当 在 Objective 之后、File Mapping 之前包含 Global Constraints 块。
- 当 Global Constraints 块被渲染时 系统应当 以表格组织,列含约束名/约束值/来源/适用范围。
- 当 Global Constraints 块的内容被填充时 系统应当 至少能覆盖依赖版本上下限、命名约定、文案/错误消息、精确取值、Charter invariant 引用五类约束。
- 当 plan 无跨任务约束时 系统应当 保留 Global Constraints 块并填 None(显式声明而非省略)。
- 当 Global Constraints 块描述约束来源时 系统应当 要求约束逐字抄录原值,不引用外部链接。

### Requirement 2: plan 格式新增 per-task Interfaces 块

plan 每个 task 的结构含其接口契约,implementer 依赖其他 task 产出时可直接看到邻居契约而不必读其代码。

#### Acceptance Criteria

- 当 plan 的 Task 结构被定义时 系统应当 在现有 Goal/File/Depends On/Verify/Commit 字段之外包含可选 Interfaces 子块。
- 当 Interfaces 子块被渲染时 系统应当 含 Consumes(本 task 依赖的接口)与 Produces(本 task 产出的接口)两个子段。
- 当 Interfaces 条目被填充时 系统应当 含接口名/签名/提供者(哪个 task 或 existing)/所在文件四个字段。
- 当某 task 无接口依赖也无产出时 系统应当 显式声明 Consumes: None / Produces: None。
- 当 plan 使用 Lightweight Format 时 系统应当 同样支持 Task 的 Interfaces 子块。

### Requirement 3: plan 阶段产出指导

/forge plan 执行者被明确指导何时产出这两个块、从哪里提取内容,产出质量稳定。

#### Acceptance Criteria

- 当 /forge plan 生成 plan 草稿时 系统应当 主动产出 Global Constraints 与 Interfaces 两个块。
- 当 Global Constraints 内容被提取时 系统应当 从 spec 的 Non-Functional Requirements、design 的技术选型、charter 的 invariant、config 的版本与命名配置中提取。
- 当 Interfaces 内容被提取时 系统应当 从 design 的 Components and Interfaces 段、现有代码的类型定义、File Mapping 的跨 task 依赖中提取。
- 当增量 replan 新增 task 涉及新接口时 系统应当 必须更新 Interfaces 块。
- 当这两个块缺失时 系统应当 不阻断 plan 批准,但允许 reviewer 将缺失标为低优先级建议。

### Requirement 4: 与 plan-pre-flight-check 协同

Global Constraints 块成为可机械校验的约束源,plan 预检优先从该块读约束。

#### Acceptance Criteria

- 当 plan-pre-flight-check 的检测项执行时 系统应当 优先读取 plan 的 Global Constraints 块作为约束源。
- 当 Global Constraints 块声明某约束适用于所有任务时 系统应当 用它校验每个 task 是否声明遵守。
- 当 Task A 的 Interfaces 声明消费某接口时 系统应当 校验其提供者 task 在 plan 中存在且产出该接口。
- 当 plan 无这两个块(历史 plan)时 系统应当 跳过相关校验并输出提示,不阻断。

## Non-Functional Requirements

- **文档紧凑**:Global Constraints 用表格紧凑形式;Interfaces 仅跨 task 有依赖时才非 None;简单 plan 的块应保持小体积。
- **向后兼容**:历史 plan(无这两个块)解析不报错,预检跳过协同校验并提示。
- **可维护**:块内容 Source 列标注来源,增量 replan 时强制重提取,避免与 spec/design 漂移。

## Out of Scope

- 不改 plan 生成的主流程逻辑(仅加模板块 + 产出指导)。
- 不强制历史 plan 补块(向后兼容)。
- 不把 Global Constraints 等同于 charter(charter 是项目级不变量,本块是本次 plan 范围内的约束)。
- 不引入 plan 生成的新变体。

## Delta

### Added
- plan-document-format 的 Global Constraints 块(Lightweight + Full)。
- plan-document-format Task 结构的 Interfaces 子块(Lightweight + Full)。
- plan/instructions.md 的产出指导章节。

### Modified
- `skills/forge/lib/plan/references/plan-document-format.md` body 结构加块。
- `skills/forge/lib/plan/instructions.md` 加产出指导。

### Unchanged
- plan 现有 Objective/File Mapping/Task Breakdown/Spec Coverage 章节语义不变(仅在它们之间插入新块)。
- plan frontmatter 字段不变。
- plan 的 lightweight/full 两种 format 切换逻辑不变。
- review 阶段 spec-check 的核心职责不变(可将缺失块标 P3 advisory)。
- plan-pre-flight-check 的现有 R2/R3 检测项不变(仅新增以 Global Constraints 为源的协同校验)。

## 反漂移声明

- **主目标**:让 plan 自包含跨任务约束与 per-task 接口契约,implementer/reviewer 不必跨文档推导。
- **非目标代理信号**:不重新设计 plan 格式(仅加块);不强制历史 plan 补块(向后兼容);不把 Global Constraints 升格为 charter(它是本次 plan 范围的约束);不为 Interfaces 引入完整 IDL(仅 name/signature/provider/file 四字段够用)。
- **验证材料角色**:需求满足的证据是——新 plan 含这两个块;implementer 能从块读到约束与邻居契约;预检能机械校验;历史 plan 不报错。

## Validation Contract

### VAL-R1-001: Global Constraints 块在模板中

**Verify-By**: `bash:contract`
**Evidence**: `grep '## Global Constraints' skills/forge/lib/plan/references/plan-document-format.md` 非空,且在 Lightweight 和 Full 两个 format 段都出现
**Covers**: R1.AC1

### VAL-R1-002: 表格列结构

**Verify-By**: `bash:contract`
**Evidence**: Global Constraints 块示例含 Constraint/Value/Source/Applies To 表头
**Covers**: R1.AC2

### VAL-R1-003: 五类约束示例

**Verify-By**: `bash:contract`
**Evidence**: Global Constraints 示例覆盖依赖版本、命名、文案、取值、charter invariant 五类
**Covers**: R1.AC3

### VAL-R1-004: 无约束填 None

**Verify-By**: `bash:contract`
**Evidence**: 模板含"无跨任务约束时填 None"说明
**Covers**: R1.AC4

### VAL-R2-001: Task Interfaces 子块

**Verify-By**: `bash:contract`
**Evidence**: plan-document-format 的 Task 结构含 Interfaces 子块,下含 Consumes 与 Produces
**Covers**: R2.AC1, R2.AC2

### VAL-R2-002: Interface 条目字段

**Verify-By**: `bash:contract`
**Evidence**: Interface 示例条目含 name/signature/provider/file 四字段
**Covers**: R2.AC3

### VAL-R2-003: Lightweight 支持 Interfaces

**Verify-By**: `bash:contract`
**Evidence**: Lightweight Format 的 Task 结构同样含 Interfaces 子块
**Covers**: R2.AC5

### VAL-R3-001: plan instructions 产出章节

**Verify-By**: `bash:contract`
**Evidence**: `grep '## Producing Global Constraints' skills/forge/lib/plan/instructions.md` 非空
**Covers**: R3.AC1

### VAL-R3-002: 内容来源指导

**Verify-By**: `bash:contract`
**Evidence**: 产出章节含 Global Constraints 来源(spec/design/charter/config)与 Interfaces 来源(design/现有代码/File Mapping)
**Covers**: R3.AC2, R3.AC3

### VAL-R4-001: 预检协同(依赖 plan-pre-flight-check 落地)

**Verify-By**: `vitest:unit`
**Evidence**: `test/build/plan-preflight.test.ts`(属 plan-pre-flight-check spec)新增测试 `preflight reads Global Constraints block as constraint source` 通过
**Covers**: R4.AC1, R4.AC2

### VAL-R4-002: Consumes/Produces 一致性校验

**Verify-By**: `vitest:unit`
**Evidence**: `test/build/plan-preflight.test.ts` 测试 `Task A Consumes interface X requires Task B Produces X` 通过
**Covers**: R4.AC3

### VAL-R4-003: 历史兼容

**Verify-By**: `vitest:unit`
**Evidence**: `test/build/plan-preflight.test.ts` 测试 `plan without blocks skips R4 checks with advisory` 通过
**Covers**: R4.AC4
