---
feature: "dogfooding-dashboard"
status: "draft"
date: "2026-06-24"
workflow_variant: "requirements-first"
kind: "feature"
brownfield: true
---

## Purpose

Forge 把自己定位为"用工程纪律约束 AI 编码得到更好结果"的框架，并在 `.forge/` 目录积累了完整的自举运行数据（specs / findings / decisions / review / episodes）。但目前没有一个对外可见的数字回答"用了 Forge 之后结果真的更好吗"。这是 Forge 最大的可信度盲区——对一个"纪律框架"而言，自举数据是最强的证据，远胜任何 README 描述。

本特性从 `.forge/` 现有数据中聚合出行为 KPI，生成一个静态仪表盘，把"纪律有效性"从口号变成可查证的数字。

## Glossary

| Term | Definition |
|------|-----------|
| Dogfooding | Forge 用自己的工作流开发自己的代码 |
| 行为 KPI | 从运行痕迹计算的、反映纪律是否被执行的指标 |
| spec→ship 完整链路 | decide→spec→plan→build→review→test→ship 全走完的提交 |

## Requirements

### Requirement 1: 从 .forge/ 聚合三类核心行为 KPI

仪表盘必须从现有 `.forge/` 文件中聚合出反映纪律执行率的三类指标，**不要求新增任何埋点**。

#### Acceptance Criteria
- 当 仪表盘生成时 系统应当 统计走完完整 spec→ship 链路的提交占同期提交的比例
- 当 仪表盘生成时 系统应当 统计三层评审（spec-check / quality-check / security-check）拦下的缺陷数，按 P0/P1/P2 分级
- 当 仪表盘生成时 系统应当 统计有 replay 证据链的提交占比

### Requirement 2: 仪表盘为静态产物，可低成本再生成

数据已存在，聚合逻辑必须保持廉价、确定性、可重复运行。

#### Acceptance Criteria
- 当 运行生成命令时 系统应当 产出一份纯静态的 Markdown 或 HTML 报告（无运行时依赖）
- 当 同一 .forge/ 快照下连续两次生成时 系统应当 产出字节一致的结果（确定性）
- 当 .forge/ 缺失某类数据时 系统应当 在对应 KPI 处显示"无数据"而非崩溃

### Requirement 3: 指标定义透明可审计

每个数字必须能追溯到源文件，避免"自报数字"的不可信感。

#### Acceptance Criteria
- 当 仪表盘展示某个 KPI 数值时 系统应当 附带该数值的统计口径（分子/分母定义）与抽样源文件路径

## Non-Functional Requirements

- **零新依赖**：聚合脚本用 Node 内置 fs + 现有项目依赖，不引入图表库
- **成本**：生成耗时 < 5s（`.forge/` 文件量在千级）
- **隐私**：仪表盘默认不展示文件内容，只展示聚合计数；任何对外发布前由人工 review

## Out of Scope

- 不做实时仪表盘 / Web Dashboard（那是 Phase 2 Events_NDJSON 多消费者的射程）
- 不接入外部基准（SWE-bench 等）——那是另一个特性
- 不自动发布到公网，产出物落在仓库内由人工决定是否公开
- 不采集 token 成本（那是"成本作为一等公民"特性的射程）

## Delta

### Added
- `scripts/build-dogfooding-dashboard.mjs`：聚合脚本
- `.forge/dashboards/dogfooding.md`：生成的仪表盘产物（gitignore 或纳入版本由后续决定）

### Modified
- 无（只读 `.forge/`，不改任何现有状态文件）

### Unchanged
- `.forge/` 下所有现有文件的内容与格式
