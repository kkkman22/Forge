# Forge for Claude Code — 安装指南

## 快速安装

```bash
git clone https://github.com/kkkman22/Forge.git ~/.claude/skills/forge
```

## 初始化项目

```bash
# 在项目根目录运行
~/.claude/skills/forge/scripts/init.sh
```

## 使用

在 Claude Code 中输入 `/forge` 并描述任务即可。

## 前置条件

- Claude Code 环境
- Claude Code 支持 Subagent（用于 /forge build、/forge decide 和 /forge review）

## 推荐配置

### 上下文自动压缩阈值

Forge 的 build 阶段可能产生大量上下文。建议降低 Claude Code 的自动压缩触发阈值，在上下文尚充裕时提前压缩，避免撞到硬性限制。

在 `~/.claude/settings.json` 的 `env` 中添加：

```json
{
  "env": {
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "60"
  }
}
```

- 默认值：~83.5%（过高，长 build 会话容易撞到上限）
- 推荐值：`60`（在 60% 上下文使用率时触发压缩）
- Forge 已内置 PreCompact/PostCompact hooks，压缩时自动保存和恢复任务状态

### 使用非 Claude 模型（如 GLM 5.1）

通过 `ANTHROPIC_BASE_URL` 代理使用非 Claude 模型时，压缩摘要质量可能下降。Forge 的 PreCompact hook 会在压缩前保存完整进度快照，确保压缩后状态不丢失。

## 文件结构

```
~/.claude/skills/forge/
├── skills/          # 13 个 SKILL.md
├── agents/          # 7 个 Subagent 角色
├── commands/        # Forge Command 入口
├── hooks/           # Claude Code Hooks
├── templates/       # 文件模板
├── scripts/
│   ├── init.sh                # 项目初始化脚本
│   └── validate-knowledge.sh  # 知识库健康检查
```
