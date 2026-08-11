---
feature: forge-audit-remediation-p1p2
layout: design
created: 2026-07-15
---

# Design — Audit Remediation P1+P2 (v3.9.0)

## 架构概述

18 项 fix-groups 分为 6 个执行域,按依赖关系排序(security-first + §2.8-first + state-mig-前于-barrel 因 refactor 解锁)。

```
Domain A (Tool Surface)       Domain B (Shell)         Domain C (State)
R1.1 forge_exec allowlist     R2.1 pipefail header     R3.1 state mig lock
R1.2 redaction+write-path     R2.2 eval removal        (archive collateral)

Domain D (Test Honesty)       Domain E (Arch Quality)  Domain F (Release Integrity)
R4.1 env capability           R5.1 barrel cycles       R6.1 dist-sync-skip reject
R4.2 e2e real spawn           R5.2 destructive-guard   R6.2 MCP bundle freshness
R4.3 Stryker nightly          R5.3 command→skill map   R6.3 INSTALL.md dynamic
R4.4 weak assertions          R5.4 §2.8 --help (49)
R4.5 docs:check chain
```

**Phase 1 (no deps)**: R5.4 (§2.8 self-fix,宪法先), R1.1 (forge_exec allowlist 独立), R2.1 (pipefail 独立), R2.2 (eval 依赖 pipefail), R5.2 (destructive-guard 独立), R6.3 (INSTALL.md 独立)

**Phase 2 (deps on Phase 1)**: R1.2 (write-path redact 独立), R3.1 (state mig 解锁 barrel), R5.1 (barrel cycles 依赖 R3.1 status-manager split), R4.1 (env capability 独立), R6.1 (dist-sync-skip 独立), R6.2 (MCP bundle 独立)

**Phase 3 (deps on Phase 2)**: R4.2 (e2e real spawn 需 R4.1 capability stable), R4.3 (Stryker 需 R4.4 baseline), R4.4 (weak assertions 需 R4.1 stable green), R5.3 (command→skill map 依赖 R5.1 barrel clean)

**Phase 4 (deps on Phase 3)**: R4.5 (docs:check chain 需 R4.4 coverage solid)

## 设计决策

### D1: forge_exec flag 治理 — Allowlist (治本) + Denylist (兜底)

**Hybrid 策略**:
- 主防线:per-binary allowlist(`ALLOWED_RUNNER_FLAGS_VITEST`, `_BIOME`, `_JEST`, `_NODE`, `_TSC`)
- 兜防线:`BLOCKED_RUNNER_FLAGS` 保留(denylist 已知危险 flag)
- git 分支:复用 `validateGitArgs` (`:212-219`) 一次性关 `--no-index`/`--ext-diff`/`-c`/`-O` 全 flag class

**为什么不纯 allowlist**:
- git flags 丰富(200+),allowlist 工作量大
- 现有 `ALLOWED_GIT_SUBCOMMANDS` 已对 subcommand 层 allowlist
- 仅需对 flag 层补 `validateGitArgs` 即可

### D2: Redaction 在 write-path 而非 read-path

**决策**:`redactSecrets()` 调用从 read-time 移到 write-time,wrap `fs.writeFileSync` target `.forge/**/*.md`。

**为什么**:
- 任何下游消费者读 `.forge/*.md` 都已脱敏(无需每处单独调)
- 未来新 `.forge/**` 产物自动脱敏(无需 per-call wiring)
- 配合 `.gitignore` `.forge/reviews/` 关闭 exfil pipeline

### D3: State Migration 复用 status-atomic 锁原语

**决策**:直接复用 `acquireLockSync` / `releaseLockSync` (来自 `src/status-atomic.ts`),在 `status-manager.ts` 的 migration 入口包裹。

**为什么**:
- 锁原语已有,零新基础设施
- 5s 超时阈值与 status-atomic 一致
- `ToolHealthLockTimeoutError` 已定义

**为什么不用版本化 JSON**:
- status.md 已有 frontmatter 承载 schemaVersion
- 引入新 JSON layer 是 overkill

### D4: Shell `set -euo pipefail` + eval removal 联动

**决策**:
- Phase 1.1: 所有 user-facing `.sh` 加 strictness header
- Phase 1.2: `build-dist.sh` + `init.sh` 移除 `eval`
- 顺序关键:pipefail 先于 eval removal(让 eval 漏洞在 strict mode 下自我暴露)

### D5: Barrel cycle 通过 leaf extraction 治本

**决策**:新增 `src/spec/types.ts` 导出共享类型,7 个 spec-* 文件改 import 此 leaf。

**为什么不用 inline 修复**:
- 11 个 cycle,7 个穿 `spec.ts`,inline 修复复杂度 O(n²)
- leaf extraction 一次性 kill 7 个 cycle + 治本

### D6: Test Environment Capability Detection (双层)

**Layer 1 (vitest config)**:env gate `FORGE_TEST_NET=absent` → 整文件跳过
**Layer 2 (describe site)**:`canListenUnixSocket()` / `canListenTcp()` → 局部 skip

**为什么双层**:
- env gate 快速全 skip,适合 CI capability 缺失环境
- describe site 精细控制,同进程内某些文件可跑

### D7: e2e Theater — 真实 spawn 不是进程内 import

**决策**:`test/e2e/*.test.ts` 必须用 `child_process.spawn` 跑 `/forge` 二进制 + `createTempRepo()` 建真实 git harness。

**为什么**:
- 进程内 import 纯函数测不到 routing/dispatch/MCP/socket 集成
- 真实 spawn 是 e2e 唯一可信证据

### D8: Stryker Nightly 而非 CI-on-PR

**决策**:Stryker 跑 nightly(cron `0 3 * * *`),不进 PR CI。

**为什么**:
- Stryker 慢(典型 30-60 min for core modules)
- 阻断 PR 严重影响 dev velocity
- Nightly 分数 < baseline 时阻断下一 release

### D9: §2.8 Self-Fix — 宪法先于代码

**决策**:`§2.8 49 --help` 修复是第 1 序(Phase 1.0)。

**为什么**:
- 宪法自身违例 → 修复代码前先修宪法
- 否则审计者会问"§2.8 豁免 §2.8?"
- 增量小,zero-risk,先做建立信心

### D10: Disclosure — Public docs/audit/

**决策**:
- 审计报告原文件 commit 在 `docs/audit/2026-07-15-v3.9.0/`(公开)
- CHANGELOG.md v3.10.0 顶部摘要(评级 + 18 项)
- ADR-0009 锁定范围(单一入口)

**为什么不只 ADR**:
- 透明度建立贡献者信任
- 审计 trail 永久可追溯

## 错误处理策略

| 位置 | 错误场景 | 处理 |
|------|---------|------|
| forge_exec allowlist | flag 不在白名单 | 返回 isError: true + "Flag not in allowlist: <flag>" |
| forge_exec validateGitArgs | git flag 危险 | 返回 isError: true + 危险类型 |
| redaction | pattern match fail | 跳过 (fail-open at read, fail-closed at write) |
| state mig lock | 5s 超时 | throw ToolHealthLockTimeoutError |
| state mig archive | I/O error | 返回 ArchiveResult `{ok:false, code:"io-error", error}` |
| barrel leaf extraction | 类型循环 | TypeScript 编译错误,阻断 build |
| Stryker nightly | mutation < baseline | release job 阻断 |
| dist-sync-skip | skip tag 检出 | release job exit 1 |
| MCP bundle freshness | mtime 偏离 | CI exit 1 |
| e2e spawn | 进程 exit != 0 | test 失败 + 错误输出 dump |

## 变更文件清单 (按 REQ)

### REQ-01 Tool Surface
| 文件 | 变更类型 |
|------|---------|
| src/mcp/tools/forge-exec.ts | 修改 (allowlist per-binary + validateGitArgs wire) |
| src/secret-redactor.ts | 修改 (3 新 pattern) |
| src/fs-write-redact.ts | 新增 (write-path wrapper) |
| test/mcp/tools/forge-exec-allowlist.test.ts | 新增 |
| test/secret-redactor.test.ts | 修改 (3 新 case) |
| test/fs-write-redact.test.ts | 新增 |
| .gitignore | 修改 (+ .forge/reviews/) |
| (已有的 .forge/reviews/*.diff-context.md) | git rm --cached |

### REQ-02 Shell
| 文件 | 变更类型 |
|------|---------|
| scripts/build-dist.sh | 修改 (eval → node -) |
| scripts/init.sh | 修改 (install_companion 签名) |
| scripts/check-shell-strictness.sh | 新增 |
| scripts/check-*.sh (~13 个) | 修改 (+ set -euo pipefail) |
| test/scripts/no-eval-lint.test.ts | 新增 |
| package.json | 修改 (check script + help-audit) |

### REQ-03 State
| 文件 | 变更类型 |
|------|---------|
| src/status-manager.ts | 修改 (lock + archive ArchiveResult) |
| src/status-mig.ts | 新增 (extract pure migration helper) |
| test/status-manager-migration.test.ts | 新增 |
| test/status-manager-archive.test.ts | 修改 (ArchiveResult shape) |

### REQ-04 Test Honesty
| 文件 | 变更类型 |
|------|---------|
| src/test-utils/capability.ts | 新增 |
| vitest.config.ts | 修改 (env gate) |
| test/setup-capability.ts | 新增 |
| test/cmux-mirror/mock-socket.test.ts | 修改 (describeSocket pattern) |
| test/status-atomic.test.ts | 修改 (describeSocket pattern) |
| test/smoke/accept-login.smoke.test.ts | 修改 (describeSocket pattern) |
| test/docs-governance/cli/*.test.ts | 修改 (capability checks) |
| test/e2e/spec-kiro-style.test.ts | 重写 (真 spawn) |
| test/e2e/helpers/temp-repo.ts | 引用 (死代码变活) |
| stryker.conf.json | 新增 |
| .github/workflows/mutation-nightly.yml | 新增 |
| package.json | 修改 (mutate script) |
| coverage-batch*.test.ts (~32 文件) | 修改 (弱断言 → 精确) |
| scripts/check-docs-embeds.ts | 引用 (主链) |
| scripts/check-docs-bilingual.ts | 修改 (60% threshold) |
| package.json | 修改 (check script + docs 验证) |

### REQ-05 Architect Quality
| 文件 | 变更类型 |
|------|---------|
| src/spec/types.ts | 新增 (leaf module) |
| src/spec/spec.ts | 修改 (import types from ./types) |
| src/spec/spec-bundle.ts | 修改 |
| src/spec/spec-import.ts | 修改 |
| src/spec/spec-render.ts | 修改 |
| src/spec/spec-validation.ts | 修改 |
| src/spec/spec-mutate.ts | 修改 |
| src/spec/spec-package.ts | 修改 |
| .claude/settings.json | 修改 (hooks.PreToolUse.Bash matcher) |
| src/check-sandbox.ts | 修改 (remove .sandbox-active condition) |
| test/hooks/destructive-guard.test.ts | 新增 |
| scripts/sync-command-registry.mjs | 修改 (skillDir 字段) |
| command-registry.generated.ts | 重生成 |
| test/forge-dispatcher/command-registry.test.ts | 新增 |
| scripts/*.mjs (49 user-facing) | 修改 (+ --help) |
| scripts/.help-exempt | 新增/维护 |
| scripts/validate-scripts-help.mjs | 已有 (CI 引用) |
| package.json | 修改 (help-audit script) |
| package.json | 修改 (check-circular script) |
| .github/workflows/ci.yml | 修改 (madge check) |

### REQ-06 Release Integrity
| 文件 | 变更类型 |
|------|---------|
| scripts/check-dist-sync.mjs | 修改 (skip-detector) |
| test/scripts/dist-sync-skip-reject.test.ts | 新增 |
| scripts/bundle-mcp.mjs | 修改 (--check 真实实现) |
| test/scripts/bundle-freshness.test.ts | 新增 |
| .github/workflows/ci.yml | 修改 (bundle-freshness step) |
| scripts/build-dist.sh | 修改 (INSTALL.md heredoc 动态) |
| test/build-dist/install-counts.test.ts | 新增 |

### Cross-cutting
| 文件 | 变更类型 |
|------|---------|
| docs/audit/2026-07-15-v3.9.0/ | 新增 (审计报告公开入库) |
| CHANGELOG.md | 修改 (v3.10.0 摘要) |
| .forge/decisions/ADR-0009-audit-remediation-scope.md | 新增 |

## 性能预算

- `npm run check`:目标 + ≤15s (新增 madge + Stryker 不入主链)
- `madge --circular` JSON output 缓存:src mtime hash key
- Stryker nightly:4 modules × 60s = ~4min
- e2e 真 spawn 测试:+ ~30s/test × 3 tests = +90s

## 兼容性

- forge_exec allowlist 切换:硬切(用户接受 break user scripts 风险)
- redaction pattern 增加:backward-compatible(原 6 pattern 不删)
- barrel leaf extraction:`SpecBundle` 等 type re-export 保留 (旧 import path 工作)
- state migration lock:透明,调用方不感知
- pipefail + eval removal:`build-dist.sh`/`init.sh` 调用方不受影响(internal 脚本)

## 回滚清单

每 REQ 独立 revert:

- R1.1 revert: `git revert <commit>` → `BLOCKED_RUNNER_FLAGS` denylist-only
- R1.2 revert: revert secret-redactor.ts + remove .gitignore change + `git add` back removed tracked files
- R2 revert: revert scripts + remove check-shell-strictness.sh
- R3 revert: revert status-manager.ts + remove status-mig.ts (atomic lock 不留)
- R4 revert: revert per-fix (test 改动独立,revert 不影响 production code)
- R5 revert: revert per-fix (barrel extraction → 回循环;settings.json → 删 hooks 段)
- R6 revert: revert per-fix

## 挂载点清单

新增外部依赖 / 钩子:

- R1.1: 无新增依赖
- R1.2: 无新增依赖(redaction 逻辑 inline)
- R2.1: CI step `check-shell-strictness.sh` → `npm run check`
- R2.2: shellcheck `eval` 禁令 → `.github/workflows/ci.yml`
- R3: 无外部挂载(锁原语已有)
- R4.1: vitest config → `vitest.config.ts`
- R4.2: e2e runner → `package.json` `scripts.test:e2e`
- R4.3: nightly cron → `.github/workflows/mutation-nightly.yml`
- R4.4: 无
- R4.5: `npm run check` 主链
- R5.1: madge → `package.json` `scripts.check-circular`
- R5.2: `.claude/settings.json` PreToolUse Bash matcher
- R5.3: 无
- R5.4: `npm run help-audit` → `npm run check`
- R6.1: release job → `.github/workflows/release.yml` 前置 skip-detector
- R6.2: `.github/workflows/ci.yml` bundle-freshness step
- R6.3: 无 (build-dist.sh 内部)