---
date: "2026-05-12"
type: "adr"
status: "accepted"
source: ".kiro/specs/forge-resume-from-pr/"
---

# ADR: 引入 --from-pr 作为跨会话恢复入口

## 背景

Claude Code 2.1.29 起提供 `--from-pr` 标志恢复 PR 关联会话。Forge 的 `/forge resume` 通过 `.tinkerman/status.md` 恢复上下文，但无法跨机器/跨人恢复。典型场景：同事接手未完成 PR，或在新机器上继续 review。

## 决策

在 `/forge resume` 上新增 `--from-pr <url-or-number>` 标志，封装 CC 的 `--from-pr` 能力 + Forge 状态解析。核心脚本 `scripts/resume-from-pr.mjs` 零第三方依赖。

## 理由

1. **零依赖**：纯 Node 脚本，不需要额外 npm 包
2. **分层降级**：CC session 恢复失败 → Forge-only 恢复 → slug 推断失败 → 交互提示
3. **幂等**：重复运行同一 PR 不产生额外副作用
4. **多 host**：GitHub (`gh`)、GitLab (`glab`)、Bitbucket (API) 三路适配

## 权衡

- 脚本调用 `gh`/`glab` 等外部 CLI → 增加环境依赖，但符合 Forge "scripts as black box" 原则
- 缓存 `.tinkerman/.pr-slug-cache.json` → 增加一个 git-ignored 文件，但避免重复远程调用
- OTel emit 仅输出到 stderr → 未来需集成真正 SDK

## 替代方案

- **在 SKILL.md 中纯 AI 实现**：无脚本、无 CLI 验证 → 不可靠，无法 CI 测试
- **Forge TypeScript 模块**：增加 src/ 代码 → 过重，resume 是独立操作不应影响核心运行时
