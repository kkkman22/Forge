---
title: Docs Governance System Rollout
date: "2026-05-25"
deciders: [forge-maintainers]
status: accepted
---

# Docs Governance System Rollout

## Context

Forge 的文档缺乏系统化治理：无 frontmatter 验证、手动维护 INDEX、无过时检测、无数量控制、硬编码数值散布在多个文档中。随着文档量增长，手动维护变得不可持续。

## Decision

实施五层文档治理系统：

1. **Frontmatter 验证** — 所有 `docs/` 下的 .md 文件必须包含规范 frontmatter
2. **自动索引** — `build-docs-index` 从 frontmatter 自动生成 INDEX.md
3. **过时检测** — `check-docs-staleness` 按 `updated` 字段检测 90d/180d 过时文档
4. **配额纪律** — `check-docs-quota` 强制 `docs.max_count` 上限
5. **SSOT 嵌入** — 数据源 JSON → 渲染器 → Markdown 嵌入指令，消除硬编码

### Before/After

| 维度 | Before | After |
|------|--------|-------|
| Frontmatter | 无验证 | 9 项必填/可选字段验证 |
| INDEX | 手动维护 | 自动生成 |
| 过时检测 | 无 | 90d warning / 180d critical |
| 配额 | 无限制 | 可配置上限 (默认 30) |
| 硬编码数值 | 手动同步 | SSOT 嵌入自动渲染 |
| Pre-commit | 无文档检查 | 决策树自动选择检查器 |
| CI | 无 | docs-governance.yml 自动运行 |

### Execution Review

| Phase | Deliverable | Status |
|-------|-------------|--------|
| Phase 1 | Core engine (types, config, frontmatter, index-generator) | Done |
| Phase 2 | SSOT embedding (parser, sync, renderers, registry) | Done |
| Phase 3 | Checkers (frontmatter, bilingual, staleness, updated, links, quota, index, embeds, root-whitelist) | Done |
| Phase 4 | Infrastructure (pre-commit hook, CI workflow, shared CLI runtime) | Done |
| Phase 5 | Learn integration, reference docs, CHANGELOG, ADR | Done |

### Alternatives Considered

1. **Astro/VitePress 等文档站点工具** — 引入构建依赖，与 Forge 的纯 Markdown 方案冲突。SSOT 嵌入在 Markdown 层面解决，不依赖静态站点生成器。
2. **ESLint markdown 插件** — 规则集不够灵活，无法支持自定义 frontmatter schema 和 SSOT 嵌入。
3. **纯 shell 脚本** — 不可测试、不可组合、无类型安全。TypeScript 提供更好的可维护性。

### Reuse Rules

当 `docs.max_count` 增加时：
1. 在 `.tinkerman/config.md` 更新 `docs.max_count` 值
2. 运行 `npm run docs:check` 验证新配额
3. 使用 `--allow-grow` 标志临时允许超出（用于一次性大量新增）

`--allow-grow` ADR 参考模板：记录增长原因、预期稳定数量、回顾日期。

## Consequences

- 所有文档变更必须通过 pre-commit hook 的 9 个检查器
- 新文档必须包含规范 frontmatter
- CI 自动运行文档检查，阻断不合规的 PR
- 宽限期（`docs.grace_period_until`）允许渐进式采纳
- SSOT 嵌入确保数据源变更自动反映到引用文档
