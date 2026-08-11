---
status: draft
feature: agency-borrow-05-install-wizard
layout: requirements
created: 2026-06-23
tier: light
---

# Agent 安装向导 — 需求文档

## 背景

调研 [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) 后识别的第五个借鉴点(详见调研报告 §二.5)。

agency-agents 的 `lib.sh` 用纯 bash 3.2 实现了**无依赖的 TUI 向导**:alt-screen、raw mode 方向键、flicker-free 双缓冲、ANSI/Unicode 能力探测。配合 `install.sh --interactive`,让用户像 npm install 一样勾选要装哪些 division/agent。

**Forge 现状(已核实)**:`scripts/init.sh`(1333 行)**已有朴素交互**——用 `read -rp` 提示项目名/技术栈 1-7 菜单/安全级别,但**不是 alt-screen TUI**,且**无"选择性安装 agent"能力**(init 是全量装 Forge runtime,不涉及 agent 子集选择)。

**修正后的痛点**:Forge 当前不需要 agency-agents 那种重型 TUI(它的 init 交互够用);真正缺的是——若未来 Forge 做 **agent marketplace**(`.claude-plugin/marketplace.json` 已埋种子)或允许用户选择性启用 agent 子集,需要一个轻量的"勾选安装"体验。本 spec 为**前瞻性、低优先级**,待 marketplace 需求明确后再落地。

## 目标

1. 评估是否引入轻量 agent 选择性安装向导(非全量 init)。
2. 若引入,复用 agency-agents `lib.sh` 的 TUI 原语或 Forge 现有 `read` 交互,不引入新依赖。
3. 与 spec #1 的 convert 生成器协同——向导选定 agent 子集后,仅 convert 并安装这些。

## 术语

- **安装向导(install wizard)**:引导用户选择要启用的 agent 子集的交互流程。
- **alt-screen TUI**:终端备用屏幕 + raw mode 的高级交互(agency-agents 方案)。
- **marketplace**:Forge 未来的 agent/skill 分发市场(`.claude-plugin/marketplace.json` 是其雏形)。

## 需求

### Requirement 1: 选择性安装能力(前瞻,P3)

**User Story:** 作为 Forge 用户,我希望在引入 Forge 时能选择只启用我需要的 agent 子集(如仅 review 三层,不要 decide 团队),而非全量安装。

#### 验收标准

1. IF Forge 决定支持 agent 子集启用,THEN `init.sh` 或新脚本 SHALL 提供 `--agents <slug,slug>` 选项选择 agent。
2. THE 选定子集后,convert 生成器(spec #1)SHALL 仅生成并安装这些 agent 到 `.claude/agents/` 与 `.codex/agents/`。
3. THE 此需求标记 P3——仅当 marketplace 或子集需求明确时落地。

### Requirement 2: 交互形式决策(待评估)

**User Story:** 作为 Forge 维护者,我希望明确向导用哪种交互形式,避免过度工程。

#### 验收标准

1. THE Forge SHALL 评估两种交互形式并记录于 ADR:
   - **方案 A(朴素 read)**:扩展现有 `init.sh` 的 `read -rp` 模式,加多选提示(如 `[1]spec-check [2]quality-check... 输入编号逗号分隔`)。零新代码,够用。
   - **方案 B(alt-screen TUI)**:移植 agency-agents `lib.sh` 的方向键/勾选 UI。体验好但维护成本高。
2. THE 决策应倾向方案 A,除非有强体验需求(marketplace 规模大、需分组浏览)。
3. THE 现有 `init.sh` 的交互 SHALL 保持向后兼容(`--non-interactive` 仍可用)。

## 验收标准(整体)

- [ ] 一份评估记录/ADR 说明是否引入向导及交互形式选择。
- [ ] 若落地:R1 的 `--agents` 选项可用,且 convert 仅处理选定子集。

## 依赖

- spec `agency-borrow-01-unified-agent-source`:向导依赖 convert 生成器实现子集安装。
- marketplace 需求(未来,当前无对应 spec)。

## 非目标

- **不**在本 spec 落地重型 TUI(方案 B)——除非未来 marketplace 明确需要。
- **不**改变现有 `init.sh` 的核心交互(项目名/技术栈/安全级别)。
- **不**实现 agent 的在线下载/分发(marketplace 是独立大特性)。
- **不**移植 agency-agents 的 13 工具 install.sh 全套——Forge 只面向 `.claude`/`.codex`。
