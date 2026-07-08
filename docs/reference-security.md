---
title: 'Forge 安全与信任'
category: reference
audience:
- maintainer
updated: 2026-06-30
owner: forge-maintainers
---

[← 返回索引](./INDEX.md)

# Forge 安全与信任

Forge 从第一天起把安全视为工程纪律。防御分层落在工具调用、Shell 注入预防、输入威胁检测、依赖供应链、不变量验证五个面。

## 安全机制分层

| 层级 | 机制 | 实现位置 |
|---|---|---|
| 1. 工具调用层 | PreToolUse Hook 冻结区硬阻断 | `hooks/hooks.json` + `scripts/check-frozen.sh` |
| 2. Shell 注入预防 | Git transaction 白名单构造器 | `src/git-transaction.ts` |
| 3. 输入威胁检测 | Prompt injection `scanInput` | `src/prompt-defense.ts` |
| 4. 依赖供应链 | 精确版本锁定 + npm audit CI | `package.json` + `.github/workflows/` |
| 5. 不变量验证 | 147 property-based test 文件 | `test/*.property.test.ts` |

## 安全审计与 CVE 追溯

- [SECURITY.md](../SECURITY.md) — 漏洞报告渠道、SLA、支持版本列表
- [CHANGELOG.md](../CHANGELOG.md) — 所有安全修复以 `[SECURITY]` 前缀标注，每条关联至少一个 ADR
- `.forge/decisions/ADR-*.md` + `.forge/knowledge/adr-index.md` — 架构决策（含安全决策）可检索追溯

## CI AI 评审

- 每个 PR 自动触发 `claude ultrareview`，产出 AI 评审报告（`.forge/reviews/<PR>-ci.md`）
- P0 finding 阻断合并，P1-P3 记录但不阻断
- 需配置 GitHub Secret `ANTHROPIC_API_KEY`，未配置时自动跳过
- 详见 [CI UltraReview 操作手册](ci-ultrareview-usage.md)

## 最小权限默认

`/forge` 使用 Claude Code `acceptEdits` 权限模式，命令执行可被 Hook 拦截，敏感区域（specs/plans/ADR）按"冻结"或"受保护"分级保护，详见 `.forge/config.md`。

## 结构化冻结区反馈

Forge 的冻结区保护已升级为结构化 JSON 反馈 middleware。当 AI 尝试修改锁定的 spec 或已批准的 plan 时，不再只是粗暴阻断——hook 返回精确诊断信息（哪个文件、为什么冻结、替代路径、解锁方式），帮助模型自我修正。PostToolUse hook 作为 defence-in-depth 兜底，即使 PreToolUse 被绕过也能检测并上报违规。所有命中事件记录到 `.forge/runs/` 供审计。
