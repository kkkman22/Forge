---
name: forge
description: Forge 统一入口 — 路由到 skills/forge/SKILL.md
argument-hint: "[子命令|任务描述] [--tier=light|standard|full]"
model: inherit
allowed-tools: Skill
---

# /forge

调用 `Skill(forge)` 并把所有参数透传。完整 dispatcher 逻辑见 `skills/forge/SKILL.md`。

> Plugin manifest 注册路径：本文件保留作为 `commands/` 字段的占位，实际逻辑由 skill `forge` 承载。详见 ADR-0004。
