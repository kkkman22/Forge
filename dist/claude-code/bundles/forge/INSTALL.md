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
