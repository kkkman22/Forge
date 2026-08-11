---
id: "ADR-0010"
title: "Agent 统一架构:symlink 而非 convert,排除 .codex"
status: "accepted"
date: "2026-06-23"
deciders:
  - "@king (Gruby.Wang)"
related_adrs:
  - "ADR-0009"
---

# ADR-0010: Agent 统一架构 — symlink 而非 convert,排除 .codex

## Context

spec#1(`agency-borrow-01-unified-agent-source`)原方案假设 `agents/`、`.claude/agents/`、`.codex/agents/` 三目录都是需要同步的源,计划用 `convert-agents.mjs` 生成器派生。

实现前的代码核实颠覆了原前提,发现三个关键事实:

1. **`.codex/` 整个目录被 `.gitignore` 忽略**(L32)。磁盘有 20 个 `.toml`,git 仅跟踪 3 个历史遗留;`.codex/` 是本地工具配置,不进版本控制。原 spec 假设的".codex 漂移影响协作"不成立——它根本不协作。

2. **`.claude/agents/` 已有 symlink 范式**。`quality-check.md`/`security-check.md`/`spec-check.md` 已是 `→ ../../agents/*.md` 的 symlink(git mode 120000 跟踪),证明"agents/ 为唯一源 + .claude symlink"的架构**已有先例且正确工作**。

3. **`agents/` 对 4 个 agent(debugger/architect/explore/product)是过时子集**——`.claude/` 版含完整方法论(如 debugger 的 6-Phase Feedback Loop、architect 的 Design It Twice),`agents/` 版缺失。迁移前必须先反向补全。

4. **项目定位**:Forge 只服务 Claude Code CLI,不支持 codex 运行时(用户确认)。

## Decision

**统一架构改为 symlink 方案,排除 .codex:**

```
agents/              ← 唯一真相源(.md,全部实体)
.claude/agents/      ← 全部 symlink → ../../agents/*.md(沿用现有范式)
.codex/              ← 不再纳入统一(被 gitignore,本地生成物,项目不服务 codex)
```

具体:
1. **`agents/` 为唯一源**:补全 4 个过时子集的方法论内容(从 `.claude/` 反向合并)。
2. **11 个 forge-* agent 从 `.claude/agents/` 回流到 `agents/`** 作为源实体。
3. **`.claude/agents/` 全部改为 symlink** 指向 `agents/`(包括回流的 forge-*)。
4. **新增 `check-agent-links.mjs`**:校验 `.claude/agents/*.md` 都是有效 symlink 且指向存在的 `agents/` 文件;接入 `npm run check`。
5. **`convert-agents.mjs` 不再需要**:symlink 是 git 原生、零运行时、永不同步,无需生成器。

## Rationale

1. **极简**:symlink 是 git 一等公民,零运行时代码,永无漂移(链接即同步)。convert 生成器需解析 YAML、渲染、幂等保证、TOML 转义——全部可省。
2. **范式已验证**:现有 3 个 review agent symlink 已正确工作,扩展到全部 agent 风险极低。
3. **.codex 排除合理**:
   - 项目不服务 codex 运行时(用户确认);
   - `.codex/` 被 gitignore,本就不进协作;
   - 维护 .codex 的 .toml 需 effort→model_reasoning_effort 字段映射、正文三引号包裹等复杂转换,而项目不用,纯成本无收益。
4. **保留质量门禁**:原 spec#1 的门禁价值仍在——改为校验 symlink 完整性而非生成物一致性,职责等价但实现更简。

## Consequences

- **正向**:实现量从"convert 生成器 + 命名空间改造 + 三目录门禁"降为"补全内容 + 改 symlink + symlink 校验脚本";零运行时依赖;永无格式漂移。
- **负向**:若未来要支持 codex 运行时,需补 .toml 生成(届时再引入 convert);symlink 在 Windows(非 WSL)可能需特殊处理(但 Forge 目标平台含 Git Bash/WSL,可接受)。
- **对原 spec#1 的修订**:
  - R2(convert 生成器)→ 降级为非目标(symlink 取代)
  - R3(同步门禁)→ 改为 symlink 完整性门禁,实现工具从 `check-agent-sync.mjs` 改为 `check-agent-links.mjs`
  - 命名空间 frontmatter(D2)→ 不再需要(symlink 不需字段映射)
  - description 语言(ADR-0009 中文为源)→ 仍适用,symlink 直接传递源内容

## Backward Compatibility

- `.claude/agents/` 现有 3 个 symlink:无变化。
- `.claude/agents/` 现有 11 个 forge-* 实体:改为 symlink(内容先回流 agents/)。
- `.codex/agents/`:不变(继续被 ignore,本就不入库)。
- `init.sh` 的 7-agent 子集复制(L778-794):从 `agents/` 读取,无影响。

## 影响的 spec

- **spec#1**(`unified-agent-source`):核心实现方案修订(本 ADR 取代原 design D1-D5 的 convert 路径)。
- spec#2(`catalog-governance`):lint/originality 仍作用于 `agents/`,不受影响。
- spec#3(`agent-persona-template`):模板仍作用于 `agents/`,不受影响。
- spec#5(`install-wizard`):前瞻性,不受影响。

## 参考

- spec#1: `.tinkerman/specs/agency-borrow-01-unified-agent-source/`
- 三目录 diff 报告(Explore subagent 输出,会话历史)
- `.gitignore` L32(`.codex/` 忽略规则)
