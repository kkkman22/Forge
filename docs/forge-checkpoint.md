---
title: 'Forge 再生式 Checkpoint'
category: reference
audience:
- daily-developer
- maintainer
updated: 2026-06-16
owner: forge-maintainers
---

[← 返回索引](./INDEX.md)

# 再生式 Checkpoint — 长会话状态保全

> **Spec: regenerative-checkpoint**
> 解决长会话"越用越偏"——compact 后关键状态不丢、不漂。

---

## 为什么需要再生式

长会话遇到 compact（上下文压缩）时，传统做法是**一次性 LLM 总结整个历史**。问题是：每次总结都会 paraphrase 掉一层信息——用户给的精确端口、命令行、版本号被总结成模糊描述，决策理由丢失，最终 agent "越用越偏"。

**再生式**换了个思路：compact 时不依赖那一刻的总结，而是从一个**提前维护好的结构化 checkpoint 文件**重建上下文。状态在 compact 之前就持久化了，compact 时只是把它读出来"再生"。

```
传统（总结式）：compact 时一次性总结历史 → 每次丢一层 → 越用越偏
再生式：       提前写 checkpoint → compact 时从 checkpoint 重建 → 状态不丢
```

---

## 机制：三层闭环

### 1. checkpoint.md（结构化载体）

`.forge/checkpoint.md` 是会话状态的结构化快照，11 个固定 section，每个有 token 预算：

| Section | 写什么 |
|---------|--------|
| §1 当前阶段与意图 | 当前 phase + 用户原话 block-quote（逐字） |
| §2 下一步具体动作 | 单一下一步 |
| §3 本会话指令 | session-specific 工作风格 |
| §4 当前工作 | 正在做什么，文件路径 + 代码位置 |
| §5 文件与代码区段 | 活跃读写的文件 |
| §6 已发现问题与修复 | 错误 + 解决方案 |
| §7 活跃资源 | branch / 进程 / temp |
| §8 设计决策与讨论结果 | 讨论达成的决策（含 why） |
| §9 待迁移知识 | 候选提升进 knowledge 的事实 |
| §10 开放笔记 | 兜底区 |
| §11 EXACT-FORM 值 | **所有精确值逐字节集中保留** |

### 2. checkpoint-writer（自动维护）

主 agent 干活时，checkpoint-writer subagent 在阶段边界（wave 间 / 跨阶段切换）后台并行更新 checkpoint.md。主 agent 不分心于记录。

### 3. PreCompact/PostCompact hook（再生）

- **compact 前**：PreCompact hook 读 checkpoint.md（若新鲜）作为快照源。
- **compact 后**：PostCompact hook 把 checkpoint 预算化注入回上下文 + seam framing（"下面是真实历史，直接继续，不要复述"）。
- **兜底**：checkpoint.md 不存在或过旧时，降级到现有的 grep 拼 progress 机制（粗糙但不阻断 compact）。

---

## EXACT-FORM 规则（防漂移核心）

checkpoint.md 的 §11 集中存放用户给的所有**精确值**，规则是**逐字节复制，禁止 paraphrase**：

| 类型 | 例子 | 错误做法 |
|------|------|---------|
| 连接串/DSN | `MC_DB_DSN=postgres://mc_ro@host:5433/exp_2026` | "用户给了一个 DB 配置" |
| 命令行+flags | `--seed 2718281 --shard 1/3` | "用户指定了 seed 和分片" |
| 端口 | `5433`（注意不是 5432） | "一个常见的 PG 端口" |
| 版本 pin | `mcp-atlassian==0.21.0` | "用户指定了某个版本" |
| 文件路径 | `/data/runs/2026-06-09/output.tsv` | "用户提到了一个输出路径" |
| API token | `HF_TOKEN=hf_xxx` | "用户提供了认证" |

**原则**：拿不准某个值是不是 exact-form 时，**当 exact-form 处理并复制**。丢失一个精确值的代价远大于多记一条。

---

## GLM-5.2 / 1M 上下文的 compact 配置

> Forge 主力用户用 GLM coding plan（GLM-5.2，1M 上下文）。1M 窗口下 compact 配置直接影响 checkpoint 再生质量。

### 推荐配置（`forge init` 已自动写入）

`forge init` 会自动把以下配置写入 `.claude/settings.json` 的 `env` 块：

```json
{
  "env": {
    "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "1000000",
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "60"
  }
}
```

含义：在 1M 窗口的 60%（600K tokens）时触发 auto-compact。这是**省额优先**取向——充分利用 1M 窗口，减少 compact 频率，节省 coding plan 额度（周限/5h）。

### ⚠️ 两个变量必须配合使用

**单独设 `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` 对默认本地会话无效**（[官方 env-vars 文档](https://code.claude.com/docs/en/env-vars)原文限定）。必须同时设 `CLAUDE_CODE_AUTO_COMPACT_WINDOW` 才能进入 proactive compact 模式。

> 已设过不同值的用户：`forge init` 不会覆盖你的配置（idempotent，按 key 存在判断）。

### 三档权衡

| 档位 | 配置 | compact 触发点 | 适合 |
|------|------|--------------|------|
| **省额（默认）** | window=1000000 + pct=60 | 600K | coding plan 额度紧张；接受漂移风险靠 checkpoint 兜底 |
| **平衡** | window=200000 + pct=80 | 160K | 大多数场景；checkpoint 命中率高，token 消耗适中 |
| **激进** | window=500000 + pct=60 | 300K | 重度长会话；checkpoint 几乎总新鲜，额度消耗大 |

要切换档位，修改 `.claude/settings.json` 的 `env` 块即可。

### 省额档的已知风险

600K 才 compact 意味着两个 checkpoint-writer 触发点（阶段边界）之间会攒下大量历史。如果 compact 恰好发生在边界中间，checkpoint.md 可能过时。此时 PostCompact hook 会：
1. 检测 checkpoint.md 的 mtime（修改时间）；
2. 过旧则降级到 grep 拼 progress 的 fallback 快照；
3. 输出警示：`⚠️ checkpoint 过旧，使用 fallback，建议检查 checkpoint-writer 触发`。

这是缓解不是消除。如果你频繁看到这条警示，考虑切到平衡档。

---

## compact 的触发时机

CC 的 auto-compact 在 **turn（轮次）边界**发生，**不打断正在进行的工具调用**。流程：

```
模型完成一个 turn（可能含多次工具调用）
  → turn 结束，模型停止输出
  → CC 检查 context 是否超阈值（window × pct）
  → 超了 → 执行 compact
  → 下一 turn 开始，上下文已是压缩后的
```

所以不会出现"改代码改到一半被掐断去压缩"。checkpoint-writer 的角色是**预持久化**——提前在阶段边界把状态写好，compact 发生时（无论 CC 自动还是用户手动 `/compact`）从文件再生。

---

## 手动触发

```bash
/compact    # 手动压缩（CC 原生，Forge 不拦截，PostCompact hook 会介入再生）
```

Forge **不主动触发 compact**（技术上不可行——hook/subagent 无法调用 `/compact`，这是 CC 平台限制）。Forge 的策略是：在所有交接点提前把 checkpoint 写好，compact 发生时兜底。

---

## 相关

- Spec: `.forge/specs/regenerative-checkpoint/`
- 现有 compact 机制：`scripts/hook-precompact.sh` / `scripts/hook-postcompact.sh`（本 spec 升级其内容）
- 工具输出瘦身（互补，非重叠）：`context-explosion-defense` / `context-optimization`（forge_exec/git/read MCP）
- [Claude Code 环境变量参考](https://code.claude.com/docs/en/env-vars)
