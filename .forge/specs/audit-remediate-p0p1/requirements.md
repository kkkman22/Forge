---
status: completed
feature: audit-remediate-p0p1
layout: requirements
created: 2026-06-06
tier: full
import_source: "FORGE_CODE_AUDIT_2026-06-06.md"
health:
  score: 0
  verdict: "pending"
---

# Requirements — Audit Remediate P0/P1

## 目标

修复代码审核报告中 10 项 P0/P1 问题，使 `npm run check` exit 0，MCP 安全边界从 deny-list 升级为严格 allowlist，dist/plugin/registry 漂移归零。

## 非目标

- 不建立 SSOT 生成链（registry→allowlist→docs）— 延后到 follow-up
- 不处理 P2/P3 项目
- 不重新设计 MCP 工具接口（预定义操作为 future work）
- 不改动非审核范围内的代码

---

## REQ-01: forge_read 禁止越权读取（P0-1）

**当** JavaScript 脚本通过 `forge_read` 提交 **则** 含以下模式的脚本被拒绝：`require('fs')`、`import()`、`Buffer`、`WebAssembly`、`process.binding`、`process.env` 访问。

**当** 脚本尝试读取 FORGE_FILES 白名单外的路径 **则** 工具返回错误且不执行脚本。

**当** 项目内 symlink 指向项目外 **则** 路径校验拒绝该 symlink。

**Verify-By**: vitest
**Evidence**: adversarial test suite 覆盖 /etc/passwd、~/.ssh/id_rsa、../outside、symlink escape、process.env 泄露

**Current State**: `src/mcp/tools/forge-read.ts:36-58` DANGEROUS_SCRIPT_PATTERNS 不包含 require('fs')/import()/Buffer/WebAssembly/process.binding。`src/mcp/tools/path-validator.ts:30-48` 使用 resolve()+relative() 但无 realpath。测试 `test/mcp/forge-read.test.ts:400` 明确允许 require('fs').readFileSync。

**Proposed Change**:
- DANGEROUS_SCRIPT_PATTERNS 增加：require('fs')/import()/Buffer/WebAssembly/process.binding/process.env
- path-validator.ts 增加 realpathSync 校验 symlink
- 更新测试：原有允许 require('fs') 的测试改为预期拒绝

**明确不改变**: forge_read 的工具注册接口（inputSchema 不变）、shell language 模式（本轮不改动）

---

## REQ-02: forge_exec 硬编码只读命令 allowlist（P0-2）

**当** 命令不在 READONLY_COMMAND_ALLOWLIST 中 **则** 工具拒绝执行并返回 "Command not in allowlist: <command>"。

**当** 命令包含 shell 重定向（> < >>）、管道（|）、链式（; &&）、后台（&）**则** 工具拒绝执行（除非命令整体在 allowlist 中）。

**当** .claude/settings.json 缺失或解析失败 **则** 工具仍然正常工作（allowlist 为硬编码，不依赖外部配置）。

**Verify-By**: vitest
**Evidence**: adversarial test suite 覆盖 touch、rm -rf、git commit、git push、echo x > file、npm publish 必须被拒绝

**Current State**: `src/mcp/tools/forge-exec.ts:34-47` readDenyPatterns fail-open 返回空数组。`src/mcp/tools/forge-exec.ts:95-100` containsShellMetachars 只拒绝 $()、反引号、换行。`src/mcp/tools/forge-exec.ts:248` execCommandTracked 对所有命令使用 /bin/sh -c。

**Proposed Change**:
- 新增 READONLY_COMMAND_ALLOWLIST 常量：npm test/run/lint/typecheck、vitest、tsc、biome、node --check、git diff/status/log/show、echo（只读用途）、cat、ls、find、wc、head、tail、grep
- 新增 isCommandAllowed() 函数：解析命令首词匹配 allowlist
- settings.json deny 作为补充层（不作为主要防线）
- shell 元字符检测扩展：增加 > < >> | ; & 检测

**明确不改变**: execCommand 和 execCommandTracked 的底层执行逻辑（简单命令仍走 execFile，复杂命令走 /bin/sh -c）

---

## REQ-03: dist 与 src 同步（P1-1）

**当** 运行 `npm run dist:resync` **则** 所有 dist/src/ 文件与 src/ 编译输出一致。

**当** 运行 `node scripts/check-dist-sync.mjs` **则** exit 0（无漂移）。

**当** CI 运行 `npm run check` **则** dist-sync 检查通过。

**Verify-By**: bash
**Evidence**: `node scripts/check-dist-sync.mjs` exit 0

**Current State**: `scripts/check-dist-sync.mjs` 报告 7 个缺失 dist、100+ 内容不一致。

**Proposed Change**: 运行 `npm run dist:resync` 完全重生成 dist/，提交同步变更。

---

## REQ-04: dispatcher allowlist 与 registry 一致（P1-2）

**当** registry.toml 包含新子命令 **则** allowlist.ts 同步包含该子命令。

**当** dispatchForgeSubcommand('init') 被调用 **则** 返回 ok: true（不返回 E_UNKNOWN_SUB）。

**当** dispatchForgeSubcommand('review-comment-bitbucket') 被调用 **则** 返回 ok: true。

**当** parity test 运行 **则** registry section count == ALLOW_LIST length（断言一致）。

**Verify-By**: vitest
**Evidence**: parity test 读取 registry.toml sections 并与 ALLOW_LIST 比对

**Current State**: `src/forge-dispatcher/allowlist.ts:1-35` ALLOW_LIST 33 项，缺 init 和 review-comment-bitbucket。`skills/forge/registry.toml` 有 35 个 section。

**Proposed Change**: 补 init、review-comment-bitbucket 到 ALLOW_LIST。新增 parity test。

---

## REQ-05: router intent loader 修复 ESM runtime（P1-3）

**当** 在 Node ESM runtime 中导入 dist/src/router.js **则** loadIntentDictionary() 正确加载 intent hints（非空数组）。

**当** intent dictionary 文件缺失 **则** 记录结构化诊断日志（非静默吞错）。

**Verify-By**: vitest
**Evidence**: smoke test 直接导入 dist/src/router.js 并调用 classifyTask 验证返回非空 hints

**Current State**: `src/router.ts:146-153` 使用 require("node:fs") 和 __dirname，ESM runtime 中 catch 吞错退化为空数组。

**Proposed Change**: 使用 import { readFileSync } from "node:fs" 和 new URL('../templates/router-intents.md', import.meta.url)。catch 中写入结构化诊断。

---

## REQ-06: plugin dist 包含 hooks/ 和 MCP 配置（P1-4）

**当** 运行 bash scripts/build-dist.sh **则** dist-plugin/ 包含 hooks/ 目录和 .mcp.json。

**当** 解压 dist-plugin zip **则** hooks/hooks.json 存在且包含至少 1 个 hook。

**Verify-By**: vitest
**Evidence**: contract test 断言 dist-plugin/ 中 hooks/hooks.json 和 .mcp.json 存在

**Current State**: `scripts/build-dist.sh:208-214` 不复制 hooks/ 和 .mcp.json 到 dist-plugin/。

**Proposed Change**: build-dist.sh 的 PLUGIN_DIST 段增加 cp hooks/ 和 cp .mcp.json。新增 contract test。

---

## REQ-07: coverage branch 达标（P1-5）

**当** 运行 npm run test:coverage **则** exit 0（branches ≥ 79%）。

**Verify-By**: bash
**Evidence**: `npm run test:coverage` exit 0

**Current State**: branches 78.96%，差 0.04%。vitest.config.ts:16 阈值 79%。

**Proposed Change**: 补充 MCP 工具和 router loader 的边界测试用例。

---

## REQ-08: 移除 npm package postinstall 副作用（P1-6）

**当** npm pack 打包 **则** tarball 不含 postinstall 脚本。

**当** 用户 npm install forge-loop **则** 不触发 git config core.hooksPath。

**Verify-By**: bash
**Evidence**: `npm pack --dry-run 2>&1 | grep postinstall` 无输出；或 postinstall 已移除/替换

**Current State**: `package.json:9` postinstall: tsx scripts/install-hooks.ts。npm pack 不含该脚本文件。

**Proposed Change**: 移除 postinstall 字段。install-hooks 功能仅通过 forge init 显式调用。

---

## REQ-09: tag publish job 依赖完整 CI 门禁（P1-7）

**当** tag push 触发 publish job **则** 该 job 依赖 check、security-audit、plugin-validate job。

**当** npm run check 失败 **则** publish job 不执行。

**Verify-By**: manual（CI workflow 文件审查）
**Evidence**: .github/workflows/ci.yml publish job 的 needs 字段包含 check + security-audit + plugin-validate

**Current State**: `.github/workflows/ci.yml:160-182` publish job 只跑 typecheck + tsc + npm test，不依赖 check job。

**Proposed Change**: 增加 needs: [check, security-audit, plugin-validate]。publish 前执行 npm run check 和 npm audit。

---

## REQ-10: Stop hook 127 修复（P1-8）

**当** Claude Code 触发 Stop 事件 **则** hook exit 0（不返回 code 127）。

**当** hook 引用的脚本不存在 **则** 优雅降级（exit 0 + stderr 诊断），不阻断用户操作。

**Verify-By**: bash
**Evidence**: 验证所有 hooks/hooks.json 中 Stop 段引用的脚本文件都存在；hooks/scripts/ 中无 persistent-loop.sh 引用

**Current State**: hooks/hooks.json Stop 段仍引用 persistent-loop.sh（已不存在）。dispatcher.sh:101-102 尝试多个旧路径。

**Proposed Change**: hooks.json Stop 段移除 persistent-loop.sh 引用。dispatcher.sh 移除旧路径回退。验证所有 Stop hook 引用的脚本存在。

---

## 反漂移信号

- **主目标**: npm run check exit 0 + 0 P0/P1 残留
- **非目标代理**: 任何对 dist-sync、allowlist parity、plugin dist 的独立手动修改（应通过本轮修复统一处理）
- **验证材料角色**: 审核报告 → 决策文档 → 本规格 → plan → build → review

## 回滚清单

- 每个 REQ 独立提交，可 git revert 单个
- dist/ 变更可通过 `npm run dist:resync` 重做
- CI workflow 变更需 push 到 main 后生效
