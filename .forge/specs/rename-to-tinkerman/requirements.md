---
spec: rename-to-tinkerman
status: pending
basis: ADR-0010
created: 2026-08-11
owner: forge-maintainers
---

# Rename Forge → Tinkerman — Requirements

## Goal
全量改名 `Forge` → `Tinkerman`，覆盖包名 / plugin / CLI / slash 命令 / 状态目录 / MCP / 环境变量 / repo / 文档，**行为不变（仅改名）**。

## Requirements（验收项）
1. npm 包名 `forge-loop` → `tinkerman`
2. plugin name `forge` → `tinkerman`（`.claude-plugin/plugin.json` + marketplace）
3. slash 命令 `/forge` → `/tinkerman`（`/forge` alias 兼容期 ≥1 版本，触发时 echo deprecation）
4. 状态目录 `.forge/` → `.tinkerman/`（迁移脚本 + 双路径读取兼容期）
5. `scripts/forge-*` → `scripts/tinkerman-*`（5 文件：hook-dispatch / phase-worker / prompt-guard / read-injection-scanner / sync-runtime；hooks.json×4 路径同步）
6. MCP `forge-context` → `tinkerman-context`（bundle 重命名 + .mcp.json）
7. 环境变量 `FORGE_*` → `TINKERMAN_*`
8. GitHub repo `kkkman22/Forge` → `kkkman22/Tinkerman`（rename，旧 URL 自动重定向）
9. 文档全文：`README.md` / `AGENTS.md` / `CLAUDE.md` / `CONTRIBUTING.md` / `docs/**/*.md`（~1329 处 forge/Forge 引用）
10. **行为等价**：CLI 输出语义 / hook 行为 / 状态目录语义（`.tinkerman/` 与原 `.forge/` 等价）完全不变

## Constraints
- **行为等价**（ADR-0008 原则）：改名不改逻辑，公开契约（CLI / MCP / frozen marker）语义不变
- **组织记忆连续性**（ADR-0009 保留项 #4）：`.forge/` → `.tinkerman/` 迁移不得丢失 specs / progress / decisions / knowledge——迁移脚本必须校验文件数 + 内容哈希
- **已安装用户**：marketplace 旧名 `forge` 标 deprecated 指向 `tinkerman`，至少 1 版本迁移期
- **dist/ tracked**：每批重建 dist + check-dist-sync

## Out of scope
- 功能增减（纯改名，不顺手改逻辑——那是 ADR-0009 其他刀）
- ADR-0009 后续刀（路由退化 / skill 简化 / 17 类清理）—— 见 `route-degradation-and-cleanup` spec

## 依据
- ADR-0010（命名映射表 + 迁移原则）
- ADR-0009 §分发形态归宿（plugin 保留，瘦身为刹车包）
