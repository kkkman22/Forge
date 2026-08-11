---
feature: forge-audit-remediation-p1p2
layout: tasks
created: 2026-07-15
total_tasks: 18
total_fix_groups: 18
wave_count: 4
status: locked
plan_locked_at: "2026-07-15"
prereq: "forge/zcode-p1-base-integration must ship to main first"
branch: "forge/audit-remediation-p1p2"
instincts_applied:
  - "instinct-1 (regex .test() inline): T07 redaction patterns"
  - "instinct-2 (execFileSync pure builder): T02 forge_exec + T04 eval removal"
  - "instinct-3 (multi-char sequence check): T02 flag validation"
  - "instinct-4 (shell hook 3-piece): T05 destructive-guard"
waves:
  - id: W1
    tasks: [T01, T02, T03, T04, T05, T06]
    deps: []
    parallelizable: true
  - id: W2
    tasks: [T07, T08, T09, T10, T11, T12]
    deps: [W1]
    parallelizable: true
    notes: "T08 unlock T09 (status-manager split before barrel refactor)"
  - id: W3
    tasks: [T13, T14, T15, T16]
    deps: [W2]
    parallelizable: true
  - id: W4
    tasks: [T17, T18]
    deps: [W3]
    parallelizable: true
---

# Tasks — Audit Remediation P1+P2 (v3.9.0)

# Tasks — Audit Remediation P1+P2 (v3.9.0)

## Wave 分配

- **Wave 1 (no deps)**: T01-T06 (§2.8 self-fix, forge_exec, pipefail, eval, destructive-guard, INSTALL.md)
- **Wave 2 (deps on W1)**: T07-T12 (redaction, state mig + archive, barrel, env capability, dist-sync-skip, MCP bundle)
- **Wave 3 (deps on W2)**: T13-T16 (e2e real, Stryker, weak assertions, command→skill)
- **Wave 4 (deps on W3)**: T17-T18 (docs:check chain + bilingual, disclosure commit)

## T01 — §2.8 self-fix: 49 user-facing mjs 补 `--help` [Wave 1]

**REQ**: R5.4
**Files**:
- scripts/*.mjs (49 files)
- scripts/.help-exempt (new)
- package.json (`scripts.help-audit = "node scripts/validate-scripts-help.mjs"`)

**DoD**:
- [ ] Audit 49 user-facing mjs(查 `package.json:scripts` + `docs/`)
- [ ] 每个补 `--help` 标准模板(usage, args, exit codes, examples)
- [ ] 维护 `.help-exempt` 列表(internal-only)
- [ ] `npm run help-audit` exit 0
- [ ] CI `npm run check` 增加 help-audit step

**Test**: bash:contract via `validate-scripts-help.mjs`
**Risk**: 49 files 量大,用 template + sed 批处理,后期 audit

## T02 — forge_exec flag allowlist + validateGitArgs wire [Wave 1]

**REQ**: R1.1
**Files**:
- src/mcp/tools/forge-exec.ts (修改)
- test/mcp/tools/forge-exec-allowlist.test.ts (new)

**DoD**:
- [ ] 新增 5 个 per-binary allowlist 常量(VITEST/BIOME/JEST/NODE/TSC)
- [ ] forge_exec git 分支调 `validateGitArgs`
- [ ] 保留 BLOCKED_RUNNER_FLAGS 作为 defense-in-depth
- [ ] test 覆盖每个 binary allowlist 命中 + 拒绝
- [ ] adversarial test: `--reporter`/`--no-index`/`--ext-diff`/`-c`/`-O` 全部拒绝
- [ ] 既有 `forge-exec.test.ts` 全绿

**Test**: vitest:unit
**Risk**: 用户脚本用 blocked flag 会 break — 硬切(用户决策接受)
**Hard switch**: 文档化 CHANGELOG.md

## T03 — Shell `set -euo pipefail` blanket header [Wave 1]

**REQ**: R2.1
**Files**:
- scripts/*.sh (~13 user-facing)
- scripts/check-shell-strictness.sh (new)
- package.json (`check` script + step)
- .github/workflows/ci.yml (strictness step)

**DoD**:
- [ ] 13 user-facing `.sh` 头部加 `set -euo pipefail`(shebang 后第二行)
- [ ] 新增 `check-shell-strictness.sh` 扫描 scripts/*.sh
- [ ] CI strictness step exit 0
- [ ] 不动 internal-only `.sh`(`.strict-exempt` 列表维护)

**Test**: bash:contract
**Risk**: 已有脚本依赖 fail-open 行为可能假红 — 逐个 audit

## T04 — scripts/build-dist.sh + scripts/init.sh 移除 `eval` [Wave 1]

**REQ**: R2.2
**Files**:
- scripts/build-dist.sh (改 `manifest_each`)
- scripts/init.sh (改 `install_companion` 签名)
- test/scripts/no-eval-lint.test.ts (new)

**DoD**:
- [ ] build-dist.sh `manifest_each` 改 node `-` 子进程传 manifest path + key
- [ ] init.sh `install_companion` 改 executable + args 数组调用
- [ ] shellcheck 两条 clean
- [ ] `grep -nE '\beval\b' scripts/{build-dist,init}.sh` 0 命中
- [ ] 既有 build-dist / init 集成测试全绿

**Test**: bash:contract + vitest:unit
**Risk**: 改动 init.sh 影响用户安装流程 — 小心验证

## T05 — destructive-guard 挂载 `.claude/settings.json` PreToolUse [Wave 1]

**REQ**: R5.2
**Files**:
- .claude/settings.json (改 hooks)
- src/check-sandbox.ts (去 .sandbox-active 条件)
- test/hooks/destructive-guard.test.ts (new)

**DoD**:
- [ ] `.claude/settings.json` 增加 `hooks.PreToolUse.Bash` matcher → `checkDestructive`
- [ ] `checkDestructive` 无条件检测(移除 `.tinkerman/.sandbox-active.json` 条件)
- [ ] test 覆盖 `git reset --hard` / `git push --force` / `rm -rf` 阻断
- [ ] sandbox 模式行为不变

**Test**: vitest:unit
**Risk**: hook 误触发可能 block dev flow — 加 dry-run 模式 for debug

## T06 — INSTALL.md counts 动态生成 [Wave 1]

**REQ**: R6.3
**Files**:
- scripts/build-dist.sh (改 heredoc 段)
- test/build-dist/install-counts.test.ts (new)

**DoD**:
- [ ] build-dist.sh INSTALL.md heredoc 用 `find ... | wc -l` 动态值
- [ ] SKILL.md 数显示实际值(1 而非 13)
- [ ] agents 数显示实际值(25 而非 7)
- [ ] rebuild dist 后 test 验证计数与实际一致

**Test**: bash:contract
**Risk**: low — heredoc 内嵌命令在 zsh/bash 都兼容

## T07 — Redaction 4 patterns + write-path 自动 redact [Wave 2]

**REQ**: R1.2
**Files**:
- src/secret-redactor.ts (新增 3 pattern)
- src/fs-write-redact.ts (new wrapper)
- .gitignore (+ `.tinkerman/reviews/`)
- git rm --cached existing tracked diff-context.md files
- test/secret-redactor.test.ts (扩展)
- test/fs-write-redact.test.ts (new)
- test/forge/reviews-gitignore.test.ts (new)

**DoD**:
- [ ] vendor prefix pattern `/\b(?:sk-|ghp_|AKIA|glpat-|xoxb-|xoxp-)[A-Za-z0-9_-]{16,}\b/g`
- [ ] URL-with-creds pattern `/\b(?:postgres|mysql|mongodb|redis)(\+srv)?:\/\/[^\s:@]+:[^\s@]+@\S+/g`
- [ ] Sentry DSN pattern `/\bhttps:\/\/[a-f0-9]+@[a-z0-9.-]+\.ingest\.sentry\.io\/\d+/g`
- [ ] `redactOnWrite(filePath, content)` 拦截 `.tinkerman/**/*.md` write
- [ ] `.gitignore` 增加 `.tinkerman/reviews/`
- [ ] 已有 tracked `.tinkerman/reviews/*.diff-context.md` `git rm --cached`
- [ ] test 覆盖 4 类 pattern 正向/反向 + write-path 自动 redact

**Test**: vitest:unit
**Risk**: 误 redact 合法文本 — pattern 用 `\b` 边界 + 最小长度 16 字符

## T08 — state migration 目录锁 + archive ArchiveResult [Wave 2]

**REQ**: R3.1
**Files**:
- src/status-manager.ts (lock wrap)
- src/status-mig.ts (new pure helper)
- test/status-manager-migration.test.ts (new)
- test/status-manager-archive.test.ts (改 shape)

**DoD**:
- [ ] 新增 `withForgeLock(forgeRoot, "status-migration", () => ...)` 包裹 migration
- [ ] migration 内重新 read legacy + parse frontmatter + 幂等检查
- [ ] lock 超时 (>5s) 抛 `ToolHealthLockTimeoutError`
- [ ] `archiveTaskStatus` 返回判别联合 `{ok:true, path}` | `{ok:false, code, error}`
- [ ] 改 4 处 call site 处理失败
- [ ] test 覆盖并发 / 超时 / 失败 / 幂等

**Test**: vitest:unit
**Risk**: status-manager.ts 拆分改变调用图 — refactor 分两 commit(extract → rewire)

## T09 — barrel cycles via spec/types.ts leaf [Wave 2]

**REQ**: R5.1
**Files**:
- src/spec/types.ts (new leaf)
- src/spec/spec.ts, spec-bundle.ts, spec-import.ts, spec-render.ts, spec-validation.ts, spec-mutate.ts, spec-package.ts (改 import)
- package.json (`scripts.check-circular = "madge --circular src/"`)
- .github/workflows/ci.yml (madge step)

**DoD**:
- [ ] 新增 `src/spec/types.ts` 导出 `SpecBundle`, `SpecDocument`, `SpecFrontmatter`
- [ ] 7 个 spec-* 文件改 import types from `./types`
- [ ] `npx madge --circular src/` exit 0(11 → 0 cycles)
- [ ] 既有 spec-* test 全绿
- [ ] CI madge step 加 cache(perf)

**Test**: vitest:unit + bash:contract
**Risk**: 共享类型改动可能 breaking — re-export 旧 path 保证 backward-compat

## T10 — test env capability detection + vitest env gate [Wave 2]

**REQ**: R4.1
**Files**:
- src/test-utils/capability.ts (new)
- vitest.config.ts (env gate)
- test/setup-capability.ts (new)
- test/cmux-mirror/mock-socket.test.ts (改 describeSocket)
- test/status-atomic.test.ts (改 describeSocket)
- test/smoke/accept-login.smoke.test.ts (改 describeSocket)
- test/docs-governance/cli/*.test.ts (改 capability checks)

**DoD**:
- [ ] `src/test-utils/capability.ts` 导出 `canListenUnixSocket`, `canListenTcp`, `canSpawnProcess`
- [ ] `vitest.config.ts` `test.env.FORGE_TEST_NET = "allow"`(默认)
- [ ] env=absent 时整文件 skip
- [ ] 4 个 test 文件改 `describeSocket = canListen ? describe : describe.skip`
- [ ] sandbox 跑 `npm test` exit 0(或明确 skip 计数)
- [ ] CI capability 环境全跑

**Test**: vitest:unit
**Risk**: capability probe 本身可能慢 — 加 memoization

## T11 — dist-sync-skip reject in release job [Wave 2]

**REQ**: R6.1
**Files**:
- scripts/check-dist-sync.mjs (skip-detector)
- test/scripts/dist-sync-skip-reject.test.ts (new)

**DoD**:
- [ ] `check-dist-sync.mjs` 起始 `detectSkipTag(commitsSinceLastTag)` → skip 检出 throw
- [ ] throw-on-skip 默认,可通过 config 改 warn-only
- [ ] test 覆盖 skip commit → exit 1 + skip-less commit → exit 0
- [ ] release job 引用 check-dist-sync.mjs(已有)
- [ ] 不修复历史带 skip commit

**Test**: bash:contract
**Risk**: 历史 skip commit 在 retro-fix 前若 release 会 panic — 文档化 CHANGELOG

## T12 — MCP bundle freshness CI gate [Wave 2]

**REQ**: R6.2
**Files**:
- scripts/bundle-mcp.mjs (改 --check 真实实现)
- .github/workflows/ci.yml (bundle-freshness step)
- package.json (`scripts.bundle:check`)
- test/scripts/bundle-freshness.test.ts (new)

**DoD**:
- [ ] `bundle-mcp.mjs --check` 实现 mtime 对比
- [ ] src/server.ts mtime > dist/forge-context.mjs mtime → exit 1
- [ ] CI `lint-build` job 增加 step
- [ ] test 覆盖 src 修改未 rebuild 场景
- [ ] 既有 bundle 流程不变

**Test**: bash:contract
**Risk**: mtime 在某些 FS 上不精确 — 备选用 src hash 比较

## T13 — e2e theater: 真实 spawn [Wave 3]

**REQ**: R4.2
**Files**:
- test/e2e/spec-kiro-style.test.ts (重写)
- test/e2e/helpers/temp-repo.ts (引用激活)
- test/unit/spec-*.test.ts (新建,迁纯函数 test)

**DoD**:
- [ ] 重写 e2e 文件为至少 3 个真链路 spawn test
- [ ] 用 `createTempRepo()` 建真实 git harness
- [ ] 通过 `child_process.spawn` 跑 `/forge init` / `/forge spec` / `/forge ship --dry-run`
- [ ] 断言产物文件(`.tinkerman/status.md`, `.tinkerman/specs/`)
- [ ] 纯函数 test 迁 `test/unit/spec-*.test.ts`
- [ ] `npm run test:e2e` exit 0

**Test**: forge_exec:e2e
**Risk**: e2e 慢 → 用 `--dry-run` + 并行

## T14 — Stryker config + nightly CI [Wave 3]

**REQ**: R4.3
**Files**:
- stryker.conf.json (new)
- .github/workflows/mutation-nightly.yml (new, cron `0 3 * * *`)
- package.json (`scripts.mutate = "stryker run"`)

**DoD**:
- [ ] `stryker.conf.json` 配 4 modules (`router.ts`, `status-atomic.ts`, `forge-ship/`, `mcp/tools/forge-exec.ts`)
- [ ] `checkers: ["typescript"]`
- [ ] nightly workflow 跑通,mutation score 记录 artifact
- [ ] `npm run mutate` 本地可跑
- [ ] mutation < baseline → release job 阻断(用 artifact threshold check)

**Test**: manual (nightly job)
**Risk**: Stryker 慢(~4min for 4 modules),nightly 失败需人工 triage

## T15 — weak coverage assertions 替换 [Wave 3]

**REQ**: R4.4
**Files**:
- coverage-batch{2..8}-branches.test.ts (~32 files)
- ~ 其他发现弱断言的文件

**DoD**:
- [ ] Audit 32+ 文件找 `expect(x.length).toBeGreaterThan(0)` / `toBeTruthy()` 等弱断言
- [ ] 替换为 `.toEqual([...])` 精确值或 `.toMatchObject({ key: value })`
- [ ] 至少 80% 弱断言被替换(目标)
- [ ] `npm test` 全绿
- [ ] mutation 拒绝率不倒退(对比 T14 nightly)

**Test**: vitest:unit
**Risk**: 替换断言可能暴露 latent bugs — 准备好 fix 路径

## T16 — command→skill skillDir field [Wave 3]

**REQ**: R5.3
**Files**:
- scripts/sync-command-registry.mjs (改 schema)
- command-registry.generated.ts (重生成)
- test/forge-dispatcher/command-registry.test.ts (new)

**DoD**:
- [ ] sync-command-registry.mjs 生成 schema 加 `skillDir` 字段
- [ ] 38 subcommand 全部填值(inline 的标 `"inline"`)
- [ ] command-registry.generated.ts 重生成
- [ ] test 校验全 38 条含 skillDir
- [ ] `grep -r "resume" skills/forge/lib/` 命中至少 1 文件

**Test**: vitest:unit
**Risk**: 字段加在 type schema 上可能 break downstream — 加 backward-compat layer

## T17 — docs:check chain + bilingual 60% [Wave 4]

**REQ**: R4.5
**Files**:
- package.json (`check` script + `docs.min_bilingual_pct` config)
- scripts/check-docs-embeds.ts (主链调用)
- scripts/check-docs-bilingual.ts (60% threshold)
- .tinkerman/config.md (新增 config field)

**DoD**:
- [ ] `npm run check` 增加 `node scripts/check-docs-embeds.ts && node scripts/check-docs-bilingual.ts`
- [ ] bilingual check 加 60% threshold(可配)
- [ ] 增量 PR 检查:新 `docs/zh/*.md` 必带 `docs/en/*.md`,否则阻断
- [ ] coverage < 60% 时 WARN 升级 ERROR
- [ ] 既有 docs 内容不变

**Test**: bash:contract
**Risk**: 中文为主语言(ADR-0009 历史)— bilingual 是新增需求,需文档化

## T18 — Disclosure commit (audit + CHANGELOG + ADR) [Wave 4]

**REQ**: (Cross-cutting, no REQ ID)
**Files**:
- docs/audit/2026-07-15-v3.9.0/codex-report.md (commit 现状 untracked 文件)
- docs/audit/2026-07-15-v3.9.0/claude-code-report.md
- docs/audit/2026-07-15-v3.9.0/README.md (审计基线说明)
- CHANGELOG.md (v3.10.0 摘要:评级 + 18 项)
- .tinkerman/decisions/ADR-0009-audit-remediation-scope.md (new)

**DoD**:
- [ ] `docs/audit/2026-07-15-v3.9.0/` 创建,放入两份审计原报告 + README
- [ ] CHANGELOG.md v3.10.0 顶部摘要"C+ → B+ 收口 / 18 项 / P1-B1 VETOED"
- [ ] ADR-0009 finalize(基于 decision doc)
- [ ] .tinkerman/knowledge/adr-index.md 更新(自动 hook)
- [ ] 一次 ship commit 含全部 disclosure

**Test**: manual (CHANGELOG 格式 review)
**Risk**: disclosure 时机 — 在所有 fix commit 后,ship 前最后一次 commit

---

## Execution Strategy

- Branch: `forge/audit-remediation-p1p2`
- Worktree: clean(merge zcode 完成后开)
- Per-task: TDD vertical slice(1 test → 1 impl → refactor)
- Per-task: atomic commit(`<REQ> <id>: <subject>` 格式)
- Per-Wave: optional squash per wave for review readability
- Cross-Wave: T08 → T09 (state mig 解锁 barrel refactor)

## Risk Register

| Task | Risk | Mitigation |
|---|---|---|
| T01 | 49 file 量大 | template + sed + audit |
| T02 | allowlist break user scripts | 硬切(用户决策接受),CHANGELOG 文档 |
| T04 | init.sh 影响用户安装 | 验证 install 全流程 |
| T08 | status-manager 拆分改变调用图 | 两 commit(extract → rewire) |
| T10 | capability probe 慢 | memoize |
| T13 | e2e 慢 | dry-run + 并行 |
| T14 | Stryker nightly 失败需 triage | artifact threshold + release gate |
| T15 | 弱断言替换暴露 latent bugs | 准备 fix 路径 |

## Definition of Done (全局)

- [ ] 18 任务全部完成 + 各自 atomic commit
- [ ] `npm run check` exit 0(包括新增的 strictness / madge / help-audit / docs / bundle-freshness)
- [ ] `npm test` exit 0(或明确 skip 计数)
- [ ] `npm run check-dist-sync` exit 0
- [ ] `npx madge --circular src/` exit 0
- [ ] Stryker nightly 首次跑通(分数记录)
- [ ] T18 disclosure commit 完成
- [ ] PR 3-layer review 全 pass
- [ ] ADR-0009 finalized