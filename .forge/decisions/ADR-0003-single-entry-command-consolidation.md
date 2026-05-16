---
id: "ADR-0003"
title: "单入口命令收敛：从 28 个 slash command 收敛为 /forge 单入口"
status: accepted
date: "2026-05-16"
deciders:
  - "@maintainer"
related_adrs:
  - "(historical) 2026-05-12-plugin-distribution"
supersedes_partial: "2026-05-12-plugin-distribution.md §Phase B Component 3"
---

# ADR-0003: Single-Entry Command Consolidation

## Context

### 历史决策回顾

ADR `2026-05-12-plugin-distribution` 在接入 Claude Code 2.0.12+ 原生 plugin 系统时，决定让 plugin 同时分发：

- 1 个主命令 `commands/forge.md`
- 27 个子命令 wrapper `commands/forge-<sub>.md`，由 `scripts/gen-plugin-commands.mjs` 从每个 SKILL.md frontmatter 自动生成

当时取向是「plugin completeness」（feasibility.md §Commands：「Need 18+ additional commands for plugin completeness」），让用户敲 `/` 立刻看到完整工具菜单。

### 实战 6 个月后浮现的问题

**问题 1**：入口模型与 SKILL 编排约定相互拆台。

`commands/forge.md` 内部明确写：「`forge` 是唯一注册的统一入口 skill...所有子命令必须通过 `/forge <子命令>` 路由分发」。但实际上：

- 没有任何 SKILL.md 名为 `forge`（只有 `forge-router` / `forge-plan` / `forge-build` 等 28 个）
- `commands/forge.md` 内编排逻辑用 `Skill(skill="forge", args="build")` 形式调用——永远 `Unknown skill: forge`
- 25 个子 skill 设了 `disable-model-invocation: true`（模型 A：必须经过路由器）
- 但 27 个 wrapper command 又允许用户绕过路由器直接 `/forge-build` 调起 skill（模型 B：扁平命令面）
- 两种模型并存，从未被显式取舍

**问题 2**：路由 + 自动推进语义被稀释。

`shared/next-step-protocol.md` 规定每个阶段完成后必须自动推进到下一阶段（plan → build → review → ...）。当用户从 `/forge-build` 直接进入时：

- 缺少前置 status.md / plan.md 上下文
- 自动推进逻辑试图调用 `Skill(skill="forge", args="review")` → Unknown
- 结果：build 完成后静默 idle 或推进失败，触发 `next-step-protocol` 中明令禁止的「隐式 idle」违规形态

**问题 3**：用户敲 `/` 看到 28 个命令，命令面板淹没。

用户实际只需要记住一个 `/forge`，子命令列表可以通过 `/forge --help` 或敲 `/forge ` 后的 argument-hint 暴露。28 个命令是 over-engineering 的产物。

## Decision

把 user-facing slash command 收敛为单入口 `/forge`：

1. **删除** `commands/forge-<sub>.md` 全部 27 个 wrapper 文件
2. **保留** `commands/forge.md` 单文件，内部承担所有子命令分发与任务路由
3. **改写** `commands/forge.md` 的 SKILL 调用语法：所有 `Skill(skill="forge", args="<phase>")` 改为真实存在的 `Skill(forge-<phase>)`；新增明确的「✅ 正确 / ❌ 错误」示例段
4. **保留** 25 个子 skill 的 `disable-model-invocation: true`（模型 A 保持）
5. **保留** `forge-router` 不设此 flag（路由器是唯一允许 AI 在编排上下文内自主调用的子 skill）
6. **改写** `scripts/gen-plugin-commands.mjs`：不再写出 wrapper；保留 SST 校验；`--stamp-count` 改为 opt-in
7. **同步** README / CHANGELOG / plugin.json / marketplace.json / docs / ROADMAP 中的所有命令计数声明
8. **追加** ADR `2026-05-12-plugin-distribution.md` 的 Update 章节，记录 §Phase B Component 3 被本 ADR 部分替代

实施 spec 路径：`.kiro/specs/single-entry-command-consolidation/`。

## Alternatives Considered

### 备选 A：保留全部 28 wrapper + 删除子 skill 的 disable-model-invocation

让 wrapper 名副其实，AI 也可以在任意上下文内 `Skill(forge-build)` 自主调用。

**拒绝原因**：
- AI 失去「必须走路由器」的约束，自动推进逻辑可能被任意打断
- 用户敲 `/` 仍看到 28 项，命令面板拥挤问题未解
- 与 `shared/next-step-protocol.md`「成功完成时必须立即调用下一阶段」的铁律冲突

### 备选 B：保留高频 wrapper（plan / build / review / ship）

折中方案：保留 4-6 个高频子命令的 wrapper，删除其余低频项。

**拒绝原因**：
- 用户仍要在两种入口模型间切换（`/forge-build` vs `/forge build`）
- 哪些算「高频」需要持续维护，引入不必要的判断点
- 未根本解决「Skill(skill="forge", args=...)」永远 Unknown 的 bug
- 命令计数语义不清晰：是 1 还是 5？

### 备选 C：当前选择（单入口）

**接受原因**：
- 用户面唯一入口，敲 `/forge ` 后由 argument-hint 暴露子命令
- 路由 + 自动推进逻辑必经 `commands/forge.md`，语义一致
- SKILL 调用语法与现实对齐，不再有 Unknown skill bug
- ADR 与代码、文档、计数声明全部一致

## Consequences

### Positive

- **入口一致性**：单一 slash command，单一编排文件，单一 SST
- **自动推进语义保真**：每个阶段完成后必经 `commands/forge.md`，能可靠拿到 status.md 上下文
- **维护面收窄**：从 28 文件降到 1 文件；`gen-plugin-commands.mjs` 写入面缩小
- **新用户上手成本降低**：不用记 28 个命令名，敲 `/forge ` 即可探索

### Negative

- **Breaking change**：已有用户脚本中的 `/forge-build` 等调用全部失效
  - 缓解：CHANGELOG v2.5.0 提供完整迁移表 `/forge-<sub>` → `/forge <sub>`
  - 缓解：本 spec 在 SemVer pre-1.0 阶段（v2.x）允许 minor bump 引入 break；v2.5.0 是 minor bump 节点
- **命令面板首次发现性下降**：用户必须先知道 `/forge` 才能探索子命令
  - 缓解：README 首屏列出 13 个核心子命令；`commands/forge.md` argument-hint 字段保留 `[子命令|任务描述]` 提示

### Neutral

- 子 skill 文件结构、SKILL.md 内容、hooks / agents / MCP servers 完全不变
- 三种分发路径（clone / dist / plugin）继续并存

## Rollback

如本 ADR 决策被回滚：

1. `git revert <single-entry-merge-commit>`（恢复 27 个 wrapper + 旧 forge.md + 旧脚本）
2. 运行 `node scripts/gen-plugin-commands.mjs`（回滚后版本会重新生成 27 个 wrapper）
3. 验证 `ls commands/ | wc -l` 输出 28
4. 把 `commands/forge.md` 内 `Skill(forge-<sub>)` 调用语法改回 `Skill(skill="forge", args="<sub>")` —— **强烈不推荐**，因为该语法本就是 bug
5. 把本 ADR 状态改为 `superseded`，新建 ADR-0004 记录回滚原因
6. 同步 CHANGELOG v2.5.1（reverted）
7. 在 `.forge/decisions/2026-05-12-plugin-distribution.md` 删除其末尾的 `## Update 2026-05-16` 章节

## Timeline

- **决策日期**: 2026-05-16
- **实施 spec**: `.kiro/specs/single-entry-command-consolidation/` 同日生成
- **预计 build 完成**: 决策后 1-2 个工作日（约 6.5 小时实际编码）
- **release**: v2.5.0（plugin marketplace 更新后用户运行 `claude plugin update forge` 生效）
- **复盘点**: 上线后第 7 天检查 `forge-router` 是否需要也加 `disable-model-invocation: true`（design.md §Open Questions）

## Notes

- 本 ADR 不影响 Forge Loop（src/）的任何能力
- 本 ADR 不影响 `.forge/` 项目状态目录的任何 schema
- 本 ADR 不引入新外部依赖
