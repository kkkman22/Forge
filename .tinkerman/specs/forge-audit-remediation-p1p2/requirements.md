---
status: locked
feature: forge-audit-remediation-p1p2
layout: requirements
created: 2026-07-15
tier: full
audit_basis:
  - "Forge 项目审核报告-codex.md (C+ rating)"
  - "Forge 项目审核报告-claude code.md (B+ rating)"
commit_at_lock: "6aa033b1"
import_source: ".tinkerman/decisions/2026-07-15-audit-remediation-p1p2.md"
health:
  score: 0
  verdict: "pending"
---

# Requirements — Audit Remediation P1+P2 (v3.9.0)

## 目标

修复 Forge v3.9.0 审核报告中 18 项 fix-groups(原 22 项 raw findings 经耦合合并),涵盖 5 P1 fix-groups + 13 P2。

**核心修复**:
- forge_exec denylist 升级为 allowlist (治本:关闭整类 denylist 漏项)
- shell 脚本补 `set -euo pipefail` + 移除 `eval` (建立 CI 门禁可靠性)
- state migration 事务化 (消除 ghost-task / 重复迁移风险)
- redaction 补 vendor prefix + DSN + URL-with-creds + write-path 自动 redact
- 11 处 barrel 循环通过 spec/types.ts leaf module 一次性清除 7 条
- 测试环境解耦 + e2e theater 修复 + Stryker nightly + 弱断言重写
- §2.8 self-fix: 49 个 user-facing mjs 补 `--help`(宪法自身违例)

**P1-B1 VETO**:claude-code 审计报告 P1-B1(`scripts/bump-version.mjs:694` 拼写错误)系伪造。主线程亲验 `:692` 和 `:694` 变量名一致。L713-714 注释为 stale 历史 breadcrumb。已从本计划移除。

## 非目标

- 不建立 SSOT 生成链 (registry→allowlist→docs) — 延后到独立工作
- 不修改 accept-driver 模块 (P3-1 已拆,本轮不进一步)
- 不升级 @modelcontextprotocol/sdk / claude-agent-sdk (依赖侧 0 CVE,本轮无变更)
- 不重做 Vite/Vitest 配置 (本轮仅改 `vitest.config.ts` 的 env gate 段)
- 不动 `.tinkerman/audit-keep.md` / `.tinkerman/audit-hmac*` (审计日志模块独立,本轮不触)
- 不删 `check-iron-laws.sh` (veto,留作未来如改宪法铁律时再处理)

---

## REQ-01: Tool Surface Hardening (forge_exec + redaction)

### REQ-01.1: forge_exec flag allowlist (治本关闭 denylist 漏项)

**当** runner 二进制 (vitest / biome / jest / tsc / node --check) 的 flag 不在 per-binary allowlist 中 **则** 工具拒绝执行并返回 "Flag not in allowlist: <flag>"。

**当** 用户提交 `npx vitest --reporter=/tmp/evil.mjs` **则** 工具拒绝(reporter custom import 风险关闭)。

**当** 用户提交 `npx vitest --coverage.customProviderModule=/tmp/evil.mjs` **则** 工具拒绝。

**当** 用户提交 `npx vitest --environment=/tmp/evil.cjs` **则** 工具拒绝(custom env imports 风险关闭)。

**当** 用户提交 `git --no-index <path1> <path2>` **则** 工具拒绝(任意文件读路径关闭)。

**当** 用户提交 `git --ext-diff=<cmd>` 或 `git -c <key>=<value>` 或 `git -O <file>` **则** 工具拒绝(sibling flag class 关闭)。

**Verify-By**: vitest:unit
**Evidence**: `test/mcp/tools/forge-exec-allowlist.test.ts` 覆盖 vitest/biome/jest/tsc/node 每个 binary 的 allowlist 命中 + 拒绝;adversarial test 覆盖 `--reporter`/`--no-index`/`--ext-diff`/`-c`/`-O`

**Current State**: `src/mcp/tools/forge-exec.ts:138-144` BLOCKED_RUNNER_FLAGS denylist 漏 `--reporter`/`--coverage.customProviderModule`/`--environment`。`:206-211` git 分支仅 block `--output`,未调 `validateGitArgs` (`:212-219` 仅 forge_git 使用)。

**Proposed Change**:
- 新增 `ALLOWED_RUNNER_FLAGS_VITEST`, `ALLOWED_RUNNER_FLAGS_BIOME`, `ALLOWED_RUNNER_FLAGS_JEST`, `ALLOWED_RUNNER_FLAGS_NODE` per-binary allowlist (默认 ~10 flag per binary)
- 新增 `ALLOWED_RUNNER_FLAGS_TSC` (空,严格 0 flag)
- forge_exec git 分支复用 `validateGitArgs` (one-line wire)
- 保留 `BLOCKED_RUNNER_FLAGS` 作为 defense-in-depth 兜底 (双层防护)

**明确不改变**: `EXACT_ALLOWED_COMMANDS` 和 `ALLOWED_GIT_SUBCOMMANDS` 维持现有 allowlist (commands 层已正确);`isCommandAllowed` 函数签名不变;`execFile` 执行逻辑不变。

### REQ-01.2: Redaction 补全 + write-path 自动 redact

**当** `.tinkerman/**/*.md` 文件被 `writeFileSync` 写入 **则** 内容经 `redactSecrets()` 处理后才落盘。

**当** secret 匹配 vendor prefix pattern (`sk-`, `ghp_`, `AKIA`, `glpat-`, `xoxb-`, `xoxp-` ≥16 字符) **则** 替换为 `[REDACTED:vendor-prefix]`。

**当** URL 含 credentials (`postgres://`, `mysql://`, `mongodb://`, `redis://`, `postgres+srv://`, 等) **则** 替换为 `***://user:***@host`。

**当** URL 匹配 Sentry DSN pattern (`https://<hex>@<host>.ingest.sentry.io/<int>`) **则** 替换为 `https://***@<host>.ingest.sentry.io/<int>`。

**当** `.tinkerman/reviews/.diff-context.md` 被生成 **则** 同时 (a) `git rm --cached` + `.gitignore` 增加 `.tinkerman/reviews/`; (b) 已有 reviews 重新 redact; (c) review 流程改用 tmp + symlink 或 export-only 模式。

**Verify-By**: vitest:unit
**Evidence**: `test/secret-redactor.test.ts` 新增 4 类 pattern 正向/反向测试;`test/fs-write-redact.test.ts` 验证 `.tinkerman/**/*.md` write 路径自动 redact;`test/forge/reviews-gitignore.test.ts` 验证 `.gitignore` 增量与已有文件 untrack

**Current State**: `src/secret-redactor.ts:22-72` 6 类 pattern 均上下文绑定(JSON field name / env 赋值 / Bearer 前缀),自由文本里的裸 vendor token 和裸 DSN 不脱敏。`.gitignore` 排除 `.tinkerman/{debug,archive,cache,specs,...}` 但不排除 `.tinkerman/reviews/`。

**Proposed Change**:
- `redactSecrets()` 增加 3 个新 pattern:vendor prefix、URL-with-creds、Sentry DSN
- 新增 `redactOnWrite(filePath, content)` 包装器,在 `fs.writeFileSync` 调用 site 拦截 `.tinkerman/**/*.md`
- `.gitignore` 增加 `.tinkerman/reviews/`(或更精细:.tinkerman/reviews/*.diff-context.md 排除但保留 review-summary.md)
- `git rm --cached` 已有 `.tinkerman/reviews/*.diff-context.md` 跟踪文件

**明确不改变**: `redactSecrets()` 函数签名可保持;既有的 6 类 pattern 不删(向后兼容);`.tinkerman/reviews/*.md` 之外的 review artifact 不动。

---

## REQ-02: Shell Script Discipline

### REQ-02.1: 全量 `set -euo pipefail` blanket header

**当** `scripts/*.sh` 文件顶部 (shebang 后) **则** 必须包含 `set -euo pipefail`(允许 `.help-exempt` 文件例外)。

**当** CI 跑 `bash scripts/check-shell-strictness.sh` **则** exit 0(所有 user-facing `.sh` 通过)。

**Verify-By**: bash:contract
**Evidence**: 新增 `scripts/check-shell-strictness.sh` 脚本遍历 `scripts/*.sh` 检查头部含 `set -euo pipefail`;输出违规文件清单

**Current State**: 52 个 `.sh` 中约 45 个缺完整 `set -euo pipefail`(39 个连 `set -e` 都无);典型 `scripts/check-doc-links.sh`、`scripts/aggregate-metrics.sh:1-10`、`scripts/bump-version.sh`。`scripts/validate-scripts-help.mjs` 已存在(验 `--help`)但未验 strictness。

**Proposed Change**:
- 新增 `scripts/check-shell-strictness.sh`(内部,不入 `.help-exempt`)
- 修所有 user-facing `.sh` 头部(约 13 个,非全 45 个;internal-only 保留豁免)
- CI `npm run check` 增加 strictness 检查步骤

**明确不改变**: internal-only `.sh` (记录在 `scripts/.help-exempt` 旁或新 `scripts/.strict-exempt`)豁免;脚本逻辑不变;`.help-exempt` 机制不变。

### REQ-02.2: scripts/build-dist.sh + scripts/init.sh 移除 `eval`

**当** `scripts/build-dist.sh` 调用 `manifest_each` **则** 通过 node 子进程传值,不通过 eval 执行 callback 字符串。

**当** `scripts/init.sh` 调用 `install_companion` **则** 接受 executable + 参数数组,不接受任意命令字符串。

**Verify-By**: bash:contract
**Evidence**: shellcheck 无 `eval` 警告(`scripts/build-dist.sh` `scripts/init.sh` clean);新增 `test/scripts/no-eval-lint.test.ts` 通过 `eslint-plugin-security` / `grep -nE '\beval\b' scripts/{build-dist,init}.sh` 断言 0 命中

**Current State**: `scripts/build-dist.sh:48-56` `manifest_each` 将 callback 作为字符串传入再 eval;`scripts/init.sh:1195-1217` `install_companion` `eval "${install_cmd}"`。

**Proposed Change**:
- `build-dist.sh`:`manifest_each` 改为 `node -` 子进程传 manifest 路径 + key,callback 用 JS 实现
- `init.sh`:`install_companion` 签名改为 `install_companion <name> <desc> <executable> [args...]`,内部用 `$executable "$@"` 调用
- shellcheck CI 步骤加 `eval` 禁令(white-list `scripts/.help-exempt`)

**明确不改变**: 其他 `*.sh` 文件不动(本轮只动 build-dist + init);manifest JSON schema 不变;init 流程的 companion 配置不变。

---

## REQ-03: State Migration Atomicity

### REQ-03.1: state migration 目录级锁 + 失败可观测

**当** `status-manager` 执行 migration(write 新 task status + 清空 legacy status)**则** 在 `acquireLockSync(<statusDir>.lock)` 内完成 read-merge-write 全部步骤。

**当** lock 获取超时 (>5s) **则** 抛出 `ToolHealthLockTimeoutError` 阻断 migration,不写半状态。

**当** migration 失败(any I/O error)**则** 返回 `ArchiveResult` 判别联合 (`{ ok: false, code: "io-error" | "invalid-date", error }`),通过结构化日志记录 error。

**Verify-By**: vitest:unit
**Evidence**: `test/status-manager-migration.test.ts` 覆盖 (a) 并发 migration 只一个成功; (b) lock 超时抛错; (c) 失败返回 ArchiveResult 而非吞掉; (d) 幂等性(重复 migration no-op)

**Current State**: `src/status-manager.ts:218-235` 两个独立 `writeStatusAtomic` 调用(写新 + 清旧)无锁包裹;`:246-266` `archiveTaskStatus` `catch (_err) {}` 吞所有异常。

**Proposed Change**:
- 新增 `withForgeLock(forgeRoot, "status-migration", () => ...)` 包裹 migration 全部步骤
- migration 内重新读 legacy + 解析 frontmatter + 检查目标已存在(幂等)
- `archiveTaskStatus` 返回判别联合,改 4 处 call site 处理失败
- 复用 `src/status-atomic.ts` 的 `acquireLockSync` / `releaseLockSync`

**明确不改变**: `writeStatusAtomic` 函数不变;legacy status 文件 schema 不变;frontmatter parser 不变。

---

## REQ-04: Test Honesty (Real coverage + Real e2e)

### REQ-04.1: 测试环境 capability detection + vitest env gate

**当** vitest 跑 `test/cmux-mirror/mock-socket.ts` 或 `test/status-atomic.test.ts` **则** 在 describe site 通过 `canListenUnixSocket()` / `canListenTcp()` 探测 capability;失败时 `describe.skip`。

**当** `process.env.FORGE_TEST_NET === "absent"` **则** vitest 跳过所有需 socket / IPC / TCP 的 test files(快速路径)。

**当** sandbox 禁止 `EPERM: operation not permitted` **则** 至少 unit 层和 property-based test 跑通,失败测试明确标注 skip reason。

**Verify-By**: vitest:unit
**Evidence**: `test/setup-capability.ts` 新增探测 helper;`vitest.config.ts` 新增 `env.FORGE_TEST_NET` gate;`npm test` 在沙箱 + CI capability 环境都 exit 0(或明确 skip 计数)

**Current State**: 14 test files / 37 tests fail 原因包括 `EPERM`、tsx IPC pipe 超时、外部 `claude` 命令依赖。`test/cmux-mirror/mock-socket.ts:98` 等无 capability detection。

**Proposed Change**:
- 新增 `src/test-utils/capability.ts` (含 `canListenUnixSocket`, `canListenTcp`, `canSpawnProcess`)
- 所有需 socket/IPC/TCP/external-CLI 的 test 文件头部 `const describeSocket = canListen ? describe : describe.skip`
- `vitest.config.ts` `test.env.FORGE_TEST_NET` 默认 `"allow"`,env=absent 时整文件跳过

**明确不改变**: unit test 逻辑不变;property-based test 不动;现有 mock 实现保留(只是选择性 skip)。

### REQ-04.2: e2e theater 修复(wire temp-repo 到真 spawn)

**当** `test/e2e/spec-kiro-style.test.ts` 跑 `describe("E2E")` block **则** 必须用 `createTempRepo()` 创建真实 git harness,通过 `child_process.spawn` 跑 `/forge` 命令二进制,断言 `.tinkerman/status.md` 文件内容。

**当** 现有 e2e test 仍进程内 import 纯函数 **则** 删除或改为 unit test(`test/unit/spec-*.test.ts`)。

**Verify-By**: bash:contract + forge_exec:e2e
**Evidence**: `test/e2e/helpers/temp-repo.ts` (已存在)被至少 1 个真实 spawn test 引用;`npm run test:e2e` 至少 1 条测试启动 `/forge plan` 验证 `.tinkerman/specs/` 创建

**Current State**: `test/e2e/spec-kiro-style.test.ts` 唯一 e2e 文件每个 describe 进程内 import 纯函数手构对象,从没启动 `/forge` 命令。`test/e2e/helpers/temp-repo.ts` 死代码(0 引用)。

**Proposed Change**:
- 重写 `test/e2e/spec-kiro-style.test.ts` 为至少 3 个真链路 spawn test:`/forge init`、`/forge spec`、`/forge ship --dry-run`
- 用 `createTempRepo()` 建真实 harness,断言产物
- 已有纯函数 test 移至 `test/unit/spec-*.test.ts`

**明确不改变**: `createTempRepo()` helper 实现不变;纯函数 test 行为不变(仅迁移目录)。

### REQ-04.3: Stryker config + nightly CI mutation baseline

**当** 仓库根有 `stryker.conf.json` **则** 配置覆盖 `src/router.ts`, `src/status-atomic.ts`, `src/forge-ship/`, `src/mcp/tools/forge-exec.ts` 核心模块。

**当** GitHub Actions nightly job 跑 `npm run mutate` **则** mutation score ≥ 60% baseline。

**当** mutation score 跌破 baseline **则** 阻断下一个 minor release。

**Verify-By**: manual (Stryker nightly job)
**Evidence**: `stryker.conf.json` 存在 + `.github/workflows/mutation-nightly.yml` 存在 + 首次 nightly 跑通

**Current State**: `@stryker-mutator/core@9.6.1` 在 devDeps 但全仓无 `stryker.conf.*`、`.github/workflows/` 无引用。

**Proposed Change**:
- 新增 `stryker.conf.json` (mutate 4 个核心模块 + `checkers: ["typescript"]`)
- 新增 `.github/workflows/mutation-nightly.yml` (cron `0 3 * * *`)
- `package.json` `scripts.mutate = "stryker run"`

**明确不改变**: devDeps `@stryker-mutator/core` 保留;其他测试框架不变。

### REQ-04.4: weak coverage assertion 替换

**当** `coverage-batch{2..8}-branches.test.ts` 等测试使用 `expect(x.length).toBeGreaterThan(0)` 或 `toBeTruthy()` 等弱断言 **则** 替换为 `.toEqual([...])` 精确值或 `.toMatchObject({ key: value })`。

**当** 单测通过率 ≥ 99.5% 且 mutation 拒绝率 ≥ 60% **则** coverage 重写任务完成。

**Verify-By**: vitest:unit
**Evidence**: `coverage-batch*.test.ts` 等 32 文件中至少 80% 弱断言被替换;`npm test` 全绿;`npm run mutate` 分数不倒退

**Current State**: 32 文件 / 495 `it()` 用弱断言拉高 branches 数字,mutation 0 抵抗。

**Proposed Change**:
- 32 个 coverage-batch test 文件逐个审计弱断言
- 替换为精确期望值
- 加 mutation 拒绝率检查(在 nightly job)

**明确不改变**: test 覆盖范围不变(只改断言强度);test 文件名不变。

### REQ-04.5: docs:check 进入 npm run check 主链 + English coverage 提升

**当** `npm run check` 跑 `bash scripts/check-readme-metrics.sh` 之后 **则** 自动跑 `node scripts/check-docs-embeds.ts` + `node scripts/check-docs-bilingual.ts`。

**当** `docs/**/*.md` 缺英文版本(bilingual check)**则** 输出 WARN(非阻断)列出待补文档;覆盖率 < 60% 时 WARN 升级为 ERROR 阻断。

**当** 增量 PR 加新 `docs/zh/*.md` 无对应 `docs/en/*.md` **则** check 阻断 PR。

**Verify-By**: bash:contract
**Evidence**: `package.json` `check` script 含 docs 验证;`scripts/check-docs-embeds.ts` 在主链调用;`scripts/check-docs-bilingual.ts` 60% threshold 生效

**Current State**: `docs:check`(9 子检查)完全不在 `npm run check` 主链,仅 `docs-governance.yml` 带 paths 过滤触发,过滤器不含 `skills/forge/lib/**`。English coverage 24%(25 中文仅 6 英文)。

**Proposed Change**:
- `package.json` `check` script 增加 `&& node scripts/check-docs-embeds.ts && node scripts/check-docs-bilingual.ts`
- `check-docs-bilingual.ts` 增加 60% threshold(可配置 `docs.min_bilingual_pct`)
- 增量 bilingual check:PR 含新 `docs/zh/*.md` 必带 `docs/en/*.md`

**明确不改变**: 既有 docs 内容不变;中文为主语言原则(`.tinkerman/decisions/2026-06-23-i18n-source-language-chinese.md`)不变。

---

## REQ-05: Architectural Quality (耦合 + 边界 + 宪法合规)

### REQ-05.1: 11 处 barrel 循环依赖通过 leaf extraction 清除

**当** `npx madge --circular src/` 跑 **则** 0 circular pairs 报告(从 11 → 0)。

**当** `src/spec/types.ts` (新 leaf module) 导出共享类型 `SpecBundle`, `SpecDocument`, `SpecFrontmatter` **则** `src/spec/spec.ts`, `src/spec/spec-import.ts`, `src/spec/spec-render.ts`, `src/spec/spec-validation.ts` 全部 import 此 leaf,打破 `spec-bundle↔spec↔spec-import↔spec-render↔spec-validation` 环。

**Verify-By**: vitest:unit + bash:contract
**Evidence**: `npx madge --circular src/` exit 0;`test/spec/types-leaf.test.ts` 验证 leaf module 0 反向依赖;既有 spec-* 测试全绿

**Current State**: 11 处 barrel 循环依赖残留,7 条穿过 `src/spec/spec.ts`。`d2246b25 P3-2 break barrel cycles` 声称已修但未清零。`madge --circular` 实跑确认。

**Proposed Change**:
- 新增 `src/spec/types.ts` (导出 `SpecBundle`, `SpecDocument`, `SpecFrontmatter` 等)
- 修改 `src/spec/spec.ts` 等 7 个文件 import types from `./types` 而非循环互引
- 新增 `package.json` `scripts.check-circular = "madge --circular src/"`,加入 `npm run check`
- CI 缓存 madge JSON output keyed on src mtime hash(perf)

**明确不改变**: spec 模块公共 API 不变;`loadSpecBundle()` 等函数签名不变。

### REQ-05.2: destructive-guard 挂载 `.claude/settings.json` PreToolUse

**当** 仓库 `.claude/settings.json` 含 `hooks.PreToolUse` 配置 **则** `Bash` matcher 触发 `checkDestructive` hook (`src/check-sandbox.ts:181`)。

**当** 用户执行 `git reset --hard` / `git push --force` / `rm -rf` 等 **则** hook exit 2 阻断。

**当** `.tinkerman/.sandbox-active.json` 不存在 **则** hook 仍挂载并工作(无条件激活,非 sandbox-only)。

**Verify-By**: vitest:unit
**Evidence**: `test/hooks/destructive-guard.test.ts` 覆盖 `git reset --hard`、`git push --force`、`rm -rf /` 必须被阻断;`.claude/settings.json` 含 `hooks.PreToolUse.Bash` matcher

**Current State**: `src/check-sandbox.ts:181` `checkDestructive` 仅在 `.tinkerman/.sandbox-active.json` 存在时经 Bash 路径触发;repo 内 `.claude/settings.json` PreToolUse Bash 未挂载它。

**Proposed Change**:
- `.claude/settings.json` 增加 `hooks.PreToolUse.Bash` matcher 调 `checkDestructive`
- `checkDestructive` 移除 `.sandbox-active.json` 条件(无条件检测)
- 新增 test 覆盖各 destructive command 模式

**明确不改变**: `checkDestructive` 函数签名不变(仅去掉条件);`.tinkerman/.sandbox-active.json` 行为不变(sandbox 模式仍可激活);其他 hook 配置不变。

### REQ-05.3: command→skill 1:1 映射显式 skillDir 字段

**当** `command-registry.generated.ts` 导出 `COMMAND_REGISTRY` **则** 每条 entry 含 `skillDir: "skills/forge/lib/<subdir>" | "inline"` 字段。

**当** 用户 `grep -r "resume"` 在 `skills/forge/lib/` **则** 命中至少 1 个文件(resume 不再是 invisible inline command)。

**Verify-By**: vitest:unit
**Evidence**: `command-registry.generated.ts` 每条 entry 含 `skillDir`;`scripts/sync-command-registry.mjs` 生成时填此字段;`test/forge-dispatcher/command-registry.test.ts` 验证 38 subcommand 全部含 skillDir

**Current State**: 38 subcommand 映射 14 skill 目录非 1:1(`resume`/`status`/`route` 内联无独立 skill,`verify`/`accept` 归 build)。新贡献者 grep skill 找不到目录。

**Proposed Change**:
- `scripts/sync-command-registry.mjs` 生成 schema 增加 `skillDir` 字段
- 每个 subcommand 显式声明 skillDir(inline 的标 `"inline"`)
- command-registry.generated.ts 重新生成
- 新增 test 校验全 38 条

**明确不改变**: 14 个 skill 目录结构不变;command 调度逻辑不变;subcommand 名称不变。

### REQ-05.4: CLAUDE.md §2.8 self-fix — 49 user-facing mjs 补 `--help`

**当** `scripts/*.mjs` 是 user-facing(在 `package.json:scripts` 调用或文档提及)**则** 顶部必须实现 `--help` flag 打印用法后 exit 0。

**当** internal-only mjs(记录在 `scripts/.help-exempt`)**则** 跳过。

**当** `npm run help-audit` 跑 `node scripts/validate-scripts-help.mjs` **则** exit 0(49 个 user-facing mjs 全部含 --help)。

**Verify-By**: bash:contract
**Evidence**: `scripts/validate-scripts-help.mjs` 列出 49 缺失文件,本轮全部补齐;CI `npm run check` 增加 help-audit 步骤

**Current State**: 49/128 mjs 脚本无 `--help`,违反 CLAUDE.md §2.8 自身。

**Proposed Change**:
- 49 个 mjs 脚本逐个加 `--help` 处理(早期用 template 批量,后期审计)
- 维护 `scripts/.help-exempt` 列表(internal-only 声明)
- CI 加 `npm run help-audit`

**明确不改变**: 已有 `--help` 的 79 个 mjs 不动;脚本核心逻辑不变。

---

## REQ-06: Release Integrity (Build + Ship + Counts)

### REQ-06.1: `[dist-sync-skip]` 标签在 release job 拒绝

**当** release job 检测到 commit message 含 `[dist-sync-skip]` **则** 阻断 release,exit 1,提示"移除 skip 信号后重试"。

**当** 常规 commit(不含 skip 信号)**则** release job 正常通过。

**Verify-By**: bash:contract
**Evidence**: `scripts/check-dist-sync.mjs` 在 release job 前置 skip-detector 步骤;新增 `test/scripts/dist-sync-skip-reject.test.ts` 覆盖 skip commit → 阻断

**Current State**: `scripts/check-dist-sync.mjs:80-96` `[dist-sync-skip]` 提交标签让 dist-sync 在 CI 内被绕过。一次带标签 commit 让发布产物一致性守卫静默关闭。

**Proposed Change**:
- `scripts/check-dist-sync.mjs` 起始增加 `detectSkipTag(commitsSinceLastTag)` → 若存在 throw "Release blocked: skip tag found"
- release job 脚本调用 `check-dist-sync.mjs` 改 throw-on-skip(默认 throw,可配 warn)
- 历史带 skip commit retro-fix:本轮只对未来 commit 生效,不修复历史

**明确不改变**: `dist-sync` 核心逻辑不变;`npm run dist:resync` 行为不变;非 release 流程不受影响。

### REQ-06.2: MCP bundle freshness CI gate

**当** 仓库根 `dist/forge-context.mjs` 存在 **则** `bundle-mcp.mjs --check` 跑通(mtime 检查),CI 在 main commit 时跑。

**当** `src/server.ts` 修改且 `dist/forge-context.mjs` 未重新生成 **则** CI 阻断并提示 `npm run bundle:mcp`。

**Verify-By**: bash:contract
**Evidence**: `.github/workflows/ci.yml` 增加 bundle-freshness step;`scripts/bundle-mcp.mjs --check` 现在被 CI 调用(从死代码变活);`test/scripts/bundle-freshness.test.ts` 覆盖 mtime 偏离场景

**Current State**: `bundle-mcp.mjs --check` 是死代码(仅 docstring 提及,无调用)。改 `server.ts` 忘 rebuild → 用户装到旧 MCP,CI 不拦。

**Proposed Change**:
- `bundle-mcp.mjs --check` 实现真正的 mtime 对比(src/server.ts mtime > dist/forge-context.mjs mtime → exit 1)
- `.github/workflows/ci.yml` `lint-build` job 增加 step
- `package.json` `scripts.bundle:check = "node scripts/bundle-mcp.mjs --check"`,加入 `npm run check`

**明确不改变**: `bundle-mcp.mjs` build 逻辑不变;dist 生成流程不变。

### REQ-06.3: INSTALL.md counts 动态生成

**当** `scripts/build-dist.sh` 打包 **则** INSTALL.md 中 "13 个 SKILL.md" / "7 个 Subagent" 等计数通过 `find` 动态生成。

**当** 仓库实际 SKILL.md = 1,agents = 25 时 **则** INSTALL.md 显示正确数字。

**Verify-By**: bash:contract
**Evidence**: `scripts/build-dist.sh` heredoc 段使用 `find skills -name SKILL.md | wc -l` + `find .claude/agents -name '*.md' | wc -l`;重建 dist 后 INSTALL.md 显示 1 / 25(而非 13 / 7);`test/build-dist/install-counts.test.ts` 验证

**Current State**: `scripts/build-dist.sh:328,330` heredoc 硬编码"13 个 SKILL.md""7 个 Subagent",实际 SKILL.md=1、agents=25。每个 bundle 携错误计数发用户。

**Proposed Change**:
- `scripts/build-dist.sh` INSTALL.md 生成段改为 heredoc 嵌入 `$(find ... | wc -l)` 动态值
- 加 test 验证构建产物 INSTALL.md 计数与实际一致

**明确不改变**: INSTALL.md 章节结构不变;build-dist.sh 其他段不变;分发包 schema 不变。

---

## Cross-Reference

- `.tinkerman/decisions/2026-07-15-audit-remediation-p1p2.md` (full decision context)
- `Forge 项目审核报告-codex.md` (audit basis 1)
- `Forge 项目审核报告-claude code.md` (audit basis 2)
- `.tinkerman/specs/audit-remediate-p0p1/` (prior remediation pattern)
- ADR-0004 (skills collapse), ADR-0007 (agent teams), ADR-0008 (code-slim)