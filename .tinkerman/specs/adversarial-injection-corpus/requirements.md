---
feature: "adversarial-injection-corpus"
status: "draft"
date: "2026-06-24"
workflow_variant: "design-first"
kind: "feature"
brownfield: true
---

## Purpose

Forge 的 `untrusted-fence`（`UNTRUSTED_PREAMBLE`）与 prompt-defense 是纯提示词层防御，`SECURITY.md` 已将对抗性注入列为 Out of Scope。正确做法不是声称"绝对安全"，而是**持续度量并单调收紧 bypass 率**。当前没有任何对抗性语料或 bypass 度量——`security/adversarial-corpus/` 目录不存在，防御层的有效性无法被量化或回归。

本特性建立一套对抗注入语料基准与 bypass-rate 门禁，延续项目 `known-failures.md` 的文化（每次发现绕过即扩充语料），把"防御有效性"从不可证变为"有界、被监控的置信度"。

## Glossary

| Term | Definition |
|------|-----------|
| untrusted-fence | `UNTRUSTED_PREAMBLE` 包装，把外部内容标记为不可信指令 |
| bypass | 注入语料成功逃逸 fence、改变了模型本应执行的行为 |
| bypass-rate | 语料集中成功 bypass 的比例 |
| 单调收紧门禁 | 新跑的 bypass-rate 必须 ≤ 历史基线，回升即 CI 阻断 |

## Requirements

### Requirement 1: 建立分类对抗注入语料库

语料必须覆盖主流注入手法分类，并支持持续扩充。

#### Acceptance Criteria
- 当 语料库初始化完成时 系统应当 包含至少 4 个分类目录（指令覆盖 / 角色越狱 / fence 逃逸 / 已知绕过），每类至少 5 条语料，初始总量 ≥ 30 条
- 当 发现新的真实绕过时 系统应当 支持把绕过 case 追加进 `known-bypasses` 分类而无需改测试代码

### Requirement 2: bypass-rate 可度量且有基线

对语料逐条评估 fence 是否拦住，产出结构化结果。

#### Acceptance Criteria
- 当 运行评估时 系统应当 对每条语料输出 `{id, category, bypassed: boolean, note}` 结构化结果
- 当 评估完成时 系统应当 汇总出当前 bypass-rate 并与 `baseline-results.json` 对比

### Requirement 3: bypass-rate 单调收紧门禁

bypass 率只能下降或持平，回升即判定为防御回归。

#### Acceptance Criteria
- 当 新跑的 bypass-rate > baseline 时 系统应当 以非零退出码阻断（CI 门禁语义）
- 当 新跑的 bypass-rate ≤ baseline 时 系统应当 通过并可选地更新 baseline
- 当 语料扩充导致基线变化时 系统应当 要求显式更新 `baseline-results.json` 并记录变更原因

## Non-Functional Requirements

- **成本**：评估必须是确定性的——fence 包装是纯字符串处理，bypass 判定基于结构断言（fence 是否仍在、命令是否被篡改），不调用真实 LLM
- **可维护**：新增语料 = 新增 `.txt` 文件，零代码改动
- **诚实**：语料只覆盖已知模式，bypass-rate 不等于"对所有注入安全"——README/报告必须如实标注射程

## Out of Scope

- 不追求"证明绝对安全"（与 SECURITY.md 的 Out of Scope 声明一致）
- 不接入 LLM-as-Judge 评估绕过的语义影响（那是 L6 的射程，本特性只做结构层 bypass 判定）
- 不做 red-team 自动化生成新注入（语料为人工 + 已知案例）
- 不纳入 `check` 硬阻断链（先作为独立评估脚本存在，稳定后再考虑门禁化）

## Delta

### Added
- `security/adversarial-corpus/injections/{basic-override,role-jailbreak,fence-escape,known-bypasses}/`：分类语料
- `security/adversarial-corpus/evaluate.mjs`：确定性评估脚本
- `security/adversarial-corpus/baseline-results.json`：基线 bypass-rate

### Modified
- 无（纯新增，不改 `untrusted-fence.ts` 行为）

### Unchanged
- `src/forge-dispatcher/untrusted-fence.ts` 的 fence 逻辑
- `SECURITY.md` 的 Out of Scope 声明
