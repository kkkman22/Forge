---
title: Forge 审计整改验收报告
category: audits
audience: [maintainer, auditor]
updated: 2026-06-06
owner: Forge contributors
---

[← 返回索引](./INDEX.md)

# Forge 审计整改验收报告

- 验收对象: `/Users/king/Desktop/FORGE_CODE_AUDIT_2026-06-06.md` 中 P0/P1/P2/P3 全部分级问题
- 验收分支: `feature/audit-remediate-p0p1`
- 核心整改提交: `7e7ce90b fix audit blockers and release gates`
- 关联前置整改提交: `75c9200a`, `8c156ab2`
- 验收结论: 通过。P0/P1/P2/P3 分级问题已清零或受控；审计报告“长期演进方向”5 项已按最终形态落地并纳入测试/CI/发布证据链。

## P0 必须修复

| 编号 | 原问题 | 验收状态 | 主要证据 |
|---|---|---:|---|
| P0-1 | `forge_read` 可越权读取任意本地文件 | 通过 | `src/mcp/tools/forge-read.ts` 禁用 shell mode，VM 中仅暴露 `FORGE_FILES` 与 `readFile(path)`；`src/mcp/tools/path-validator.ts` 使用 `realpathSync` 拦截 symlink escape；`test/mcp/forge-read-runtime.test.ts` 与 `test/mcp/path-validator.test.ts` 覆盖越权读取、未列入文件、`process/require` 不暴露、symlink 越界 |
| P0-2 | `forge_exec` 未形成只读/验证命令硬边界 | 通过 | `src/mcp/tools/forge-exec.ts` 使用严格只读 allowlist，拒绝 shell metachar、`touch`、`rm`、`git commit`、`npm publish`、`node -e` 等变更能力；`test/mcp/forge-exec.test.ts` 覆盖拒绝场景 |

## P1 必须修复

| 编号 | 原问题 | 验收状态 | 主要证据 |
|---|---|---:|---|
| P1-1 | `src/` 与 tracked `dist/` 漂移 | 通过 | `npm run check` 中 `dist-sync: OK - 297 src files matched with dist/`；提交包含 `dist/`、`dist-plugin/` 同步产物 |
| P1-2 | dispatcher allowlist 与 registry 漂移 | 通过 | `src/forge-dispatcher/allowlist.ts` 已包含 `init`、`review-comment-bitbucket`；文档和 plugin 元数据统一为 35 个子命令 |
| P1-3 | Router intent dictionary 在 compiled ESM runtime 失效 | 通过 | `src/router.ts` 支持源码与 `dist/src` 布局；`package.json` 发布 `templates/router-intents.md`；`test/smoke/compiled-runtime.smoke.test.ts` 验证 compiled ESM 下 intent hints 非空 |
| P1-4 | plugin dist 缺少 hooks/MCP 关键文件 | 通过 | `dist-plugin/hooks/hooks.json`、`.mcp.json`、Stop hook 脚本已打包；`test/smoke/plugin-dist.smoke.test.ts` 验证 hook 引用脚本全部存在 |
| P1-5 | coverage gate 失败 | 通过 | `npm run test:coverage` 通过，Branches `79.01%` 高于 `79%` 阈值 |
| P1-6 | npm `postinstall` 指向未发布脚本且有副作用 | 通过 | `package.json` 已无 `postinstall`；`npm pack --dry-run` 成功 |
| P1-7 | tag publish job 未依赖完整门禁 | 通过 | `.github/workflows/ci.yml` 中 `publish` 已 `needs: [check, security-audit, e2e, plugin-validate]`，发布前执行 check、coverage、audit、compile、dist/bundle sync |
| P1-8 | Stop hook 127 多层配置漂移 | 通过 | `hooks/hooks.json` Stop hook 使用明确 `command` 脚本；`scripts/dist-manifest.json` 包含 `stop-incomplete-tasks.mjs`、`stop-pending-rules.mjs`、`stop-phase-verify.mjs`；plugin smoke 覆盖脚本打包完整性 |

## P2 建议优化

| 编号 | 原问题 | 验收状态 | 主要证据 |
|---|---|---:|---|
| P2-1 | 路径校验未真实处理 symlink | 通过 | `path-validator.ts` 已使用 `realpathSync`；`test/mcp/path-validator.test.ts` 覆盖 symlink 指向项目外 |
| P2-2 | 审计日志 HMAC key 从 home 路径派生 | 通过 | `src/forge-dispatcher/audit-log.ts` 改为 `FORGE_AUDIT_SECRET` 优先，否则生成 `.audit-secret` 随机 secret 并设置 `0600`；`test/single-entry/audit-secret-file.test.ts` 覆盖 |
| P2-3 | 子命令数量与能力说明漂移 | 通过 | README、`.claude-plugin/plugin.json`、`.claude-plugin/marketplace.json`、`skills/forge/SKILL.md` 均为 35 个子命令 |
| P2-4 | 高风险 runtime 缺少真实分发 smoke | 通过 | `test/smoke/compiled-runtime.smoke.test.ts`、`test/smoke/plugin-dist.smoke.test.ts`、MCP runtime sandbox 测试已覆盖 |
| P2-5 | moderate 依赖漏洞和 license 例外 | 通过 | `package.json` overrides 覆盖 `hono`、`qs` 等；`npm audit --audit-level=moderate` 返回 `found 0 vulnerabilities` |
| P2-6 | 大型模块边界偏宽 | 通过 | `src/grill.ts`、`src/error-recovery.ts`、`src/review.ts`、`src/decide.ts` 已拆为薄入口，逻辑分散到对应子目录；当前四个入口合计 171 行 |

## P3 长期演进项

| 编号 | 原问题 | 验收状态 | 主要证据 |
|---|---|---:|---|
| P3-1 | `skipLibCheck` 隐藏依赖类型漂移 | 受控通过 | `.github/workflows/ci.yml` 增加 `type-strict` job，定期或手动执行 `npx tsc --noEmit --skipLibCheck false` |
| P3-2 | 本地 Node 版本与 CI matrix 不一致 | 通过 | `.github/workflows/cross-version-check.yml` matrix 已覆盖 Node 20/22/24 |
| P3-3 | `build-dist.sh` 手写复制清单风险 | 通过 | `scripts/dist-manifest.json` 成为分发清单 SSOT；`test/smoke/dist-manifest.smoke.test.ts` 验证 manifest 完整性与 hook 脚本引用 |

## 长期演进方向

| 编号 | 演进方向 | 验收状态 | 最终形态证据 |
|---|---|---:|---|
| L1 | 建立统一 command registry 生成链: registry -> allowlist -> docs -> plugin metadata -> tests | 通过 | 新增 `scripts/sync-command-registry.mjs`，统一生成 `skills/forge/registry.toml`、`src/forge-dispatcher/allowlist.ts`、`docs/_ssot/commands.json`、`.claude-plugin/plugin.json`、`.claude-plugin/marketplace.json`、`skills/forge/SKILL.md`；`package.json` 和 CI `check` 执行 `node scripts/sync-command-registry.mjs --check`；`test/long-term-evolution/command-registry-chain.test.ts` 验证链路一致性 |
| L2 | MCP 工具从通用脚本执行器演进为结构化、安全能力接口 | 通过 | `src/mcp/tools/forge-read.ts` 新增 `runStructuredReadOperation`，支持 `imports`、`contains`、`line_count`、`json_keys`，结构化操作优先，旧 script 模式仅兼容；所有路径经 `validatePaths`/`realpathSync` 约束；`test/security/adversarial-mcp-boundaries.test.ts` 覆盖越权路径、symlink escape、内容不泄露和结构化操作 |
| L3 | 发布流程采用 release checklist artifact 留证 | 通过 | 新增 `scripts/generate-release-checklist.mjs`，生成 commit、dist/dist-plugin sha256、门禁命令、`npm pack --dry-run`、`claude plugin validate .`、pack install smoke 证据；`.github/workflows/ci.yml` tag publish 阶段生成并用 `actions/upload-artifact@v4` 上传 `release-checklist.json`；`test/long-term-evolution/release-checklist.test.ts` 覆盖 |
| L4 | 建立 dedicated adversarial security test suite | 通过 | 新增 `test/security/adversarial-mcp-boundaries.test.ts`，覆盖 prompt injection 不泄露、path traversal、symlink escape、`forge_exec` 命令变更拒绝、结构化 `forge_read` 安全操作与错误边界 |
| L5 | 大模块拆成领域内核和 adapter，核心策略 pure function，IO 单独封装 | 通过 | `src/grill.ts`、`src/error-recovery.ts`、`src/review.ts`、`src/decide.ts` 保持薄兼容 adapter；对应 `src/<module>/index.ts` barrel 导出内核文件；`test/architecture/domain-kernel-adapter-boundary.test.ts` 防止入口回退为大模块 |

## 验收命令

| 命令 | 结果 | 关键输出 |
|---|---:|---|
| `npm run check` | 通过 | 604 个测试文件通过、1 个跳过；7338 个测试通过、5 个跳过；README metrics、public API、skill checks、evolved-rules refs、dist sync、docs link/structure 全部通过 |
| `npm run test:coverage` | 通过 | Statements `88.69%`，Branches `79.01%`，Functions `92.4%`，Lines `90.07%` |
| `npm audit --registry=https://registry.npmjs.org --audit-level=high` | 通过 | `found 0 vulnerabilities` |
| `npm run test:e2e` | 通过 | 1 个 e2e 测试文件通过，29 个测试通过 |
| `npm run docs:check` | 通过 | 全部 docs governance 检查 `0 critical, 0 error, 0 warning` |
| `npm pack --dry-run --cache /private/tmp/forge-npm-cache` | 通过 | 生成 `forge-loop-3.3.0.tgz`，895 个文件，包含 `templates/router-intents.md` |
| `CI=true node scripts/check-bundle-sync.mjs` | 通过 | `bundle-sync: OK - 17 scripts verified, dist packages fresh` |
| `node scripts/generate-release-checklist.mjs --output /private/tmp/forge-release-checklist-final.json` | 通过 | 生成 `release-checklist.json`，包含 commit、dist/dist-plugin hash、coverage/audit/e2e/dist gates 和 npm/plugin smoke artifact 字段 |

## 工作树说明

验收过程中未修改或回滚 `.forge` 运行态文件。当前仍存在 `.forge/findings/*` 删除和 `.forge/runs/*.jsonl` 修改，这些属于本地运行态/历史脏状态，未纳入整改提交。
