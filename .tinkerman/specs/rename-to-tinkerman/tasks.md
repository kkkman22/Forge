---
spec: rename-to-tinkerman
status: pending
---

# Tasks — 5 批执行清单

## 批次 1：元数据（`feature/rename-meta`）— 低风险
- [ ] `package.json`：`name` forge-loop → tinkerman
- [ ] `.claude-plugin/plugin.json`：`name` forge → tinkerman（保留 38-subcommand SSOT 计数）；author/homepage URL
- [ ] `.claude-plugin/marketplace.json`：同步 name
- [ ] `bump-version` 三位同步验证
- [ ] 验证：`tsc && biome && vitest && check-dist-sync && sync-command-registry --check`
- [ ] commit

## 批次 2：命令 + scripts（`feature/rename-cmd`）— 中风险
- [ ] `src/`：dispatcher 注册 `/tinkerman`（主）+ `/forge`（alias），alias echo deprecation
- [ ] `scripts/forge-{hook-dispatch,phase-worker,prompt-guard,read-injection-scanner,sync-runtime}.*` → `scripts/tinkerman-*`
- [ ] `hooks/hooks.json` + `dist-plugin/hooks/hooks.json` + `dist/claude-code/bundles/forge/hooks/hooks.json` + `.codex/hooks.json`：更新 tinkerman-* 路径
- [ ] `scripts/dist-manifest.json`：同步
- [ ] `scripts/.help-exempt`：forge-* → tinkerman-*
- [ ] `test/`：hooks-plugin-path-resolution / hook-path-safety 等断言路径更新
- [ ] 验证：基线 + hook-path-safety + hooks-plugin-path-resolution
- [ ] commit

## 批次 3：`.tinkerman/` → `.tinkerman/`（`feature/rename-dir`）⚠️ 最大风险
- [ ] 写 `scripts/migrate-forge-to-tinkerman.mjs`（递归复制 + 文件数校验 + SHA256 + dry-run + 失败不删原）
- [ ] `src/` + `scripts/` 160 处 `.tinkerman/` 引用 → `.tinkerman/` + fallback 读取函数
- [ ] `scripts/init.sh`：创建 `.tinkerman/`（新装）；检测旧 `.tinkerman/` 提示迁移
- [ ] `AGENTS.md` / `CLAUDE.md`：引用 `.tinkerman/`
- [ ] 写 `test/migrate-forge-to-tinkerman.test.ts`：dry-run 校验 + 哈希一致
- [ ] 验证：迁移 dry-run + 文件数/哈希 + 全量 vitest + check-dist-sync
- [ ] commit

## 批次 4：文档全文（`feature/rename-docs`）— 量大机械
- [ ] `README.md` / `AGENTS.md` / `CLAUDE.md` / `CONTRIBUTING.md` / `SECURITY.md`：Forge → Tinkerman（人工核关键定位句）
- [ ] `docs/**/*.md`（~1329 引用）：`git grep -l -i forge` → 批量替换 + 人工核歧义（forge 动词 vs 名词）
- [ ] `docs/hooks-inventory.md` / `docs/forge-constitution-detail.md` 等 forge- 前缀文件名 → tinkerman-（或保留历史名 + 重定向）
- [ ] 验证：`npm run docs:check` + 全量 vitest
- [ ] commit

## 批次 5：marketplace + repo（`feature/rename-release`）
- [ ] `npm run dist:resync` + `bundle-mcp`（tinkerman-context）重建 dist-plugin
- [ ] GitHub repo rename：`kkkman22/Forge` → `kkkman22/Tinkerman`（Settings → rename，旧 URL 重定向）
- [ ] marketplace 上架 `tinkerman`，`forge` 标 deprecated 指向新名
- [ ] `scripts/smoke-install.sh` 端到端
- [ ] `bump-version` 全位同步（package / plugin / dist-plugin）
- [ ] 验证：smoke-install + plugin install test + check-dist-sync
- [ ] commit + tag v(major).0.0（改名属 breaking，主版本 bump）

## 兼容期结束（N 版本后，单独 spec）
- [ ] 移除 `.tinkerman/` fallback 读取
- [ ] 移除 `/forge` alias
- [ ] 提示用户删本地 `.tinkerman/`
