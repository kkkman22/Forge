---
topic: "forge-single-entry-skills-collapse"
status: "approved"
date: "2026-05-17"
spec_ref: ".kiro/specs/forge-single-entry-skills-collapse/spec.md"
format: "full"
runtime: kiro
monolith_acknowledged: true
---

# Plan: Forge Single-Entry Skills Collapse

> 来源：`.kiro/specs/forge-single-entry-skills-collapse/spec.md` (status: locked)
> 上游决策：`.kiro/specs/forge-single-entry-skills-collapse/decide.md`
> PoC 证据：`.tinkerman/poc/single-entry-dispatch/RESULTS.md`

## Objective

把 29 个 `skills/forge-*/SKILL.md` 物理迁移到 `skills/forge/lib/<sub>/instructions.md`，让 `forge` 成为唯一注册的 skill。dispatcher 通过 inline (Read) 或 fork (Agent tool) 路径执行子 skill 指令，并强制 10 条安全控制（C1-C10）。修复当前活动 bug：`Skill(forge-X) → Unknown skill` 与 `forge-loop §13` 死信。

## Research Findings

- **Knowledge KB 命中**：`.tinkerman/knowledge/skill-style-guide.md` 显式要求所有 forge-* 必须 `disable-model-invocation: true` —— 本 plan 必须更新该指南
- **测试硬编码 80+ 处**：`test/contract.test.ts`、`test/contract.skills.test.ts`、`test/build-nature-mode.test.ts`、`test/skill-description.property.test.ts`、`test/skill-length.property.test.ts`、`test/contract.routing-sync.test.ts`、`test/plan/*.test.ts`、`test/build-bugfix-precheck.test.ts`、`test/context-budget-contract.test.ts`、`test/evolved-rules-infra-refs.test.ts`、`test/docs/trimming-limits.test.ts` 含 `skills/forge-<sub>/SKILL.md` 路径
- **Docs 含 /forge-X 引用**：`docs/best-practices/review-configuration.{md,en.md}`、`docs/best-practices/worktree-usage.{md,en.md}`、`agents/frontend-check.md` 引用 `skills/forge-review/...`、`skills/forge-build/...` 路径
- **跨 skill 引用**：`skills/forge-test/SKILL.md` `../forge-build/references/tdd-rules.md`、`skills/forge-debug/SKILL.md` 同样、`skills/forge-fix/SKILL.md` + `skills/forge-refactor/SKILL.md` 引用 `skills/forge-build/references/{bugfix,refactor}-mode.md`
- **`agents/frontend-check.md` 引用 lib 路径**：3 处 `skills/forge-review/references/frontend-check-*.md` 需要重写
- **PoC 已验证**：Agent + lib instructions.md 链路在 V1/V2/V3 全部通过

## File Mapping

| Path | Operation | Reason |
|------|-----------|--------|
| `.tinkerman/findings/worktree-spike-2026-05-17.md` | CREATE | Wave 0 spike 报告（R2.8） |
| `test/single-entry/topic-allowlist.test.ts` | CREATE | RED for R2.1 (C1) |
| `test/single-entry/path-safety.test.ts` | CREATE | RED for R2.2 (C2) |
| `test/single-entry/per-sub-tools.test.ts` | CREATE | RED for R2.3 (C3) |
| `test/single-entry/untrusted-fence.test.ts` | CREATE | RED for R2.4 (C4) |
| `test/single-entry/registry-parity.test.ts` | CREATE | RED for R2.5 (C5) |
| `test/single-entry/lib-integrity.test.ts` | CREATE | RED for R2.6 (C6) |
| `test/single-entry/audit-log.test.ts` | CREATE | RED for R2.7 (C7) |
| `test/single-entry/no-absolute-paths.test.ts` | CREATE | RED for R2.8 sec sub-check |
| `test/single-entry/dispatcher-mode-flag.test.ts` | CREATE | RED for R2.10 (C10) |
| `test/single-entry/skill-registration.test.ts` | CREATE | RED for R1.1 |
| `test/single-entry/bare-forge-help.test.ts` | CREATE | RED for R1.3 |
| `test/single-entry/migration-structure.test.ts` | CREATE | RED for R1.4 |
| `test/single-entry/no-skill-x-references.test.ts` | CREATE | RED for R1.5 |
| `test/single-entry/dispatch-fork.test.ts` | CREATE | RED for R3.1 |
| `test/single-entry/dispatch-inline.test.ts` | CREATE | RED for R3.2 |
| `test/single-entry/dispatch-mode-rule.test.ts` | CREATE | RED for R3.5 |
| `test/single-entry/refs-self-relative.test.ts` | CREATE | RED for R4.1 |
| `test/single-entry/refs-cross-rewrite.test.ts` | CREATE | RED for R4.2 |
| `test/single-entry/cross-lib-refs.test.ts` | CREATE | RED for R4.3 |
| `test/single-entry/dispatcher-frontmatter.test.ts` | CREATE | RED for R5.1 |
| `test/single-entry/dispatch-chokepoint-order.test.ts` | CREATE | RED for R5.2 |
| `test/single-entry/dispatcher-size.test.ts` | CREATE | RED for R5.3 |
| `test/single-entry/adr-0004-frontmatter.test.ts` | CREATE | RED for R6.1/R6.2 |
| `scripts/migrate-skills-to-lib.mjs` | CREATE | 物理迁移脚本（Wave 2）|
| `scripts/regen-skill-registry.mjs` | CREATE | Registry 自动生成（R2.5）|
| `scripts/check-registry-parity.sh` | CREATE | CI gate（R2.5）|
| `scripts/build-lib-manifest.mjs` | CREATE | Integrity manifest 生成（R2.6）|
| `scripts/sync-dist-plugin.mjs` | CREATE | dist-plugin 镜像（Task 14）|
| `src/forge-dispatcher/allowlist.ts` | CREATE | Task 4a — 白名单模块 |
| `src/forge-dispatcher/path-resolve.ts` | CREATE | Task 4a — 路径解析模块 |
| `src/forge-dispatcher/tools-resolve.ts` | CREATE | Task 4b — Per-sub tool scoping |
| `src/forge-dispatcher/untrusted-fence.ts` | CREATE | Task 4b — Workspace fence |
| `src/forge-dispatcher/audit-log.ts` | CREATE | Task 4c — HMAC chain audit log |
| `src/forge-dispatcher.ts` | CREATE | Task 4d — Chokepoint orchestrator entry |
| `skills/forge/SKILL.md` | CREATE | Dispatcher 入口（R5）|
| `skills/forge/registry.toml` | CREATE | Auto-generated 路由表（R2.5）|
| `skills/forge/lib/manifest.json` | CREATE | Integrity hashes（R2.6）|
| `skills/forge/lib/<29 subs>/instructions.md` | CREATE | 迁移后子 skill 指令（来自 git mv） |
| `skills/forge/lib/<6 subs>/references/*.md` | CREATE | 迁移后内部 references（来自 git mv） |
| `skills/forge-*/` (29 dirs) | DELETE | 迁移后清空原 skill 目录 |
| `commands/forge.md` | MODIFY | 退化为 thin stub `Skill(forge)` |
| `.tinkerman/config.md` | MODIFY | 新增 `skills.dispatcher_mode: collapsed` |
| `test/contract.test.ts` | MODIFY | 80+ 路径硬编码重写 |
| `test/contract.skills.test.ts` | MODIFY | 同上 |
| `test/build-nature-mode.test.ts` | MODIFY | 同上 |
| `test/skill-description.property.test.ts` | MODIFY | 同上 |
| `test/skill-length.property.test.ts` | MODIFY | 同上 |
| `test/contract.routing-sync.test.ts` | MODIFY | 同上 |
| `test/plan/*.test.ts` | MODIFY | 同上 |
| `test/build-bugfix-precheck.test.ts` | MODIFY | 同上 |
| `test/context-budget-contract.test.ts` | MODIFY | 同上 |
| `test/evolved-rules-infra-refs.test.ts` | MODIFY | 同上 |
| `test/docs/trimming-limits.test.ts` | MODIFY | 同上 |
| `docs/best-practices/review-configuration.md` | MODIFY | 路径更新到 lib/review/instructions.md |
| `docs/best-practices/review-configuration.en.md` | MODIFY | 同上 |
| `docs/best-practices/worktree-usage.md` | MODIFY | 同上 |
| `docs/best-practices/worktree-usage.en.md` | MODIFY | 同上 |
| `agents/frontend-check.md` | MODIFY | 3 处 `skills/forge-review/...` 重写 |
| `.tinkerman/knowledge/skill-style-guide.md` | MODIFY | 删除 `disable-model-invocation: true` 强制要求 |
| `README.md` | MODIFY | SKILL 数量声明 + /forge-X 例子重写 |
| `ROADMAP.md` | MODIFY | 同上 |
| `CHANGELOG.md` | MODIFY | v2.5.0 breaking change 条目 |
| `.tinkerman/decisions/ADR-0004-skills-collapse-and-dispatcher.md` | CREATE | ADR-0004（R6.1）|
| `.tinkerman/decisions/ADR-0003-single-entry-command-consolidation.md` | MODIFY | 标注 supersedes_partial 范围 |
| `dist-plugin/` | REBUILD | 镜像新结构 |

## Tasks

### Task 0: Wave 0 Spike — Worktree path resolution（P0 BLOCKER）

**Depends On**: []
**Files**:
- Create: `.tinkerman/findings/worktree-spike-2026-05-17.md`

**Pre-flight check**：本任务**不进入 TDD 循环**，是独立 spike。如失败 → 整个 plan A 退回方案 C，本 plan 作废，重新 decide。

**步骤**：
1. 在仓库根 `pwd` 确认；记录 `${CLAUDE_PLUGIN_ROOT}` 期望值（plugin install root）
2. 全局安装 forge plugin 到 `~/.claude/plugins/forge/`（或验证已安装）；记录 plugin root 实际值
3. `cd .claude/worktrees/oz-skills-inspiration && /forge zoom-out test`（PoC 模式：zoom-out 已迁移到 lib）→ 观察 dispatcher 解析的 lib 路径是否指向 plugin install root（**not** worktree 副本）
4. 如果支持，把 forge 同时安装到一个 worktree 里 → 观察 Claude Code loader 行为：dedupe by manifest ID / 错误 / silent shadow
5. grep `skills/forge/registry.toml` 与 `skills/forge/lib/` 全部路径，确认无 `/Users/`、`/home/`、绝对路径前缀

**Run**: `pwd && echo "${CLAUDE_PLUGIN_ROOT:-unset}"`
**Expected**: output contains "Forge" (project root)

**Run**: `ls -d ~/.claude/plugins/forge* 2>/dev/null || echo "not installed"`
**Expected**: output contains "forge" (or "not installed" → install first)

**Verdict 格式**（写入 spike 文档）：
- `pass-dev-mode` — cwd-relative 解析正确，path safety 全过 → 继续 Task 1
- `fail-with-mitigation` — 有问题但可缓解 → 修订 spec R2.2 后继续
- `aborted` — 不可恢复的问题 → plan 标记 status: aborted，重新 decide

本 spike 已 **PASS**（commit a92d8e7，verdict: `pass-dev-mode + plugin-mode-deferred`）。plan 后续任务可继续。silent shadow 验证推迟到 Pre-Ship Verification Checklist（见 plan 末尾）。

**Verify-By**: manual
**Evidence**: `.tinkerman/findings/worktree-spike-2026-05-17.md` 含实测命令、输出、final verdict

**Commit Message**: `docs(forge-collapse): add worktree path resolution spike report`

---

### Task 1: RED — R1 物理结构契约测试

**Depends On**: [0]
**Files**:
- Create: `test/single-entry/skill-registration.test.ts`
- Create: `test/single-entry/migration-structure.test.ts`
- Create: `test/single-entry/no-skill-x-references.test.ts`
- Create: `test/single-entry/bare-forge-help.test.ts`

**RED** — 写四个失败测试

**`skill-registration.test.ts`** 内容：
```typescript
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { glob } from "glob";
const ROOT = resolve(import.meta.dirname, "..", "..");

describe("R1.1: only one forge skill registered", () => {
  it("skills/*/SKILL.md glob returns exactly skills/forge/SKILL.md", async () => {
    const matches = await glob("skills/*/SKILL.md", { cwd: ROOT });
    expect(matches).toEqual(["skills/forge/SKILL.md"]);
  });
});
```

**`migration-structure.test.ts`** 内容：
```typescript
import { describe, it, expect } from "vitest";
import { glob } from "glob";
import { resolve } from "node:path";
const ROOT = resolve(import.meta.dirname, "..", "..");
const SUBS = ["abort","accept","build","build-light","control-cli","control-ui","debug","decide","decide-teams","fix","fix-conflicts","grill","learn","loop","mutate","pack","plan","recap","refactor","resume","review","router","ship","spec","status","storm","test","verify","zoom-out"];

describe("R1.4: migration structure", () => {
  it("legacy skills/forge-* directories must not exist", async () => {
    const legacy = await glob("skills/forge-*/", { cwd: ROOT });
    expect(legacy).toHaveLength(0);
  });
  it.each(SUBS)("instructions.md exists for sub %s", (sub) => {
    expect(existsSync(resolve(ROOT, `skills/forge/lib/${sub}/instructions.md`))).toBe(true);
  });
});
```

**`no-skill-x-references.test.ts`**：grep 全仓除 `.tinkerman/decisions/`、`.kiro/specs/`、`.tinkerman/archive/`、`.tinkerman/reviews/` 外的文件，断言无 `Skill(forge-` 形式调用。

**`bare-forge-help.test.ts`**：解析 `skills/forge/SKILL.md`，断言含 29 sub 名 + 4 tier 分组标题（Light/Standard/Full/Auxiliary）。

**Run**: `npx vitest run test/single-entry/skill-registration.test.ts test/single-entry/migration-structure.test.ts test/single-entry/no-skill-x-references.test.ts test/single-entry/bare-forge-help.test.ts`
**Expected**: FAIL — "skills/forge/SKILL.md" not found / 29 forge-* dirs still exist

**Verify-By**: vitest
**Evidence**: 四个 test 文件存在，运行返回 4 个 FAIL

**Commit Message**: `test(forge-collapse): add R1 RED — physical structure contracts`

---

### Task 2: RED — R2 安全控制契约测试（C1-C7, C10）

**Depends On**: [0]
**Files**:
- Create: `test/single-entry/topic-allowlist.test.ts`
- Create: `test/single-entry/path-safety.test.ts`
- Create: `test/single-entry/per-sub-tools.test.ts`
- Create: `test/single-entry/untrusted-fence.test.ts`
- Create: `test/single-entry/registry-parity.test.ts`
- Create: `test/single-entry/lib-integrity.test.ts`
- Create: `test/single-entry/audit-log.test.ts`
- Create: `test/single-entry/dispatcher-mode-flag.test.ts`
- Create: `test/single-entry/no-absolute-paths.test.ts`

**RED** — 9 个测试。每个测试 import `dispatchForgeSubcommand` from `src/forge-dispatcher.ts`（暂未实现）。

关键断言示例（`topic-allowlist.test.ts`）：
```typescript
import { dispatchForgeSubcommand } from "../../src/forge-dispatcher.js";

describe("R2.1: topic allowlist enforces 29 sub names", () => {
  const VALID = ["build", "review", "plan", "ship", "learn", "decide", "spec", "test", "debug", "loop", "status", "resume", "abort", "fix", "refactor", "router", "verify", "accept", "recap", "zoom-out", "mutate", "grill", "storm", "control-cli", "control-ui", "decide-teams", "build-light", "fix-conflicts", "pack"];
  const ATTACKS = ["../../../etc/passwd", "forge-build", "buidl", "<script>", "build;rm -rf /", "build && malicious"];

  it.each(VALID)("accepts valid sub: %s", async (sub) => {
    const r = await dispatchForgeSubcommand(sub, { mode: "test" });
    expect(r.code).not.toBe("E_UNKNOWN_SUB");
  });
  it.each(ATTACKS)("rejects attack: %s", async (attack) => {
    const r = await dispatchForgeSubcommand(attack, { mode: "test" });
    expect(r.code).toBe("E_UNKNOWN_SUB");
  });
});
```

其他 8 个测试按 spec R2.2-R2.10 evidence 字段构造。

**Run**: `npx vitest run test/single-entry/`
**Expected**: FAIL — `Cannot find module ../../src/forge-dispatcher.js`

**Verify-By**: vitest
**Evidence**: 9 个 test 文件存在，运行返回所有 FAIL

**Commit Message**: `test(forge-collapse): add R2 RED — security control contracts (C1-C7, C10)`

---

### Task 3: RED — R3/R4/R5/R6 路由+引用+入口+ADR 契约测试

**Depends On**: [0]
**Files**:
- Create: `test/single-entry/dispatch-fork.test.ts`
- Create: `test/single-entry/dispatch-inline.test.ts`
- Create: `test/single-entry/dispatch-mode-rule.test.ts`
- Create: `test/single-entry/refs-self-relative.test.ts`
- Create: `test/single-entry/refs-cross-rewrite.test.ts`
- Create: `test/single-entry/cross-lib-refs.test.ts`
- Create: `test/single-entry/dispatcher-frontmatter.test.ts`
- Create: `test/single-entry/dispatch-chokepoint-order.test.ts`
- Create: `test/single-entry/dispatcher-size.test.ts`
- Create: `test/single-entry/adr-0004-frontmatter.test.ts`

**RED** — 10 个测试。

`dispatch-mode-rule.test.ts` 关键逻辑：解析 spec.md 的 R3.5 markdown table（用 marked 库或正则），与 glob `skills/forge/lib/*/instructions.md` frontmatter 实际 `dispatch_mode` 值比对。

`dispatch-chokepoint-order.test.ts` 用 `vi.spyOn` 拦截每步函数（resolveDispatcherMode / validateTopic / resolveLibPath / checkIntegrity / resolveAllowedTools / resolveDispatchMode / wrapWorkspaceContext / dispatch / writeAuditLog），断言调用顺序为 1→9。

**Run**: `npx vitest run test/single-entry/`
**Expected**: FAIL — modules not implemented

**Verify-By**: vitest
**Evidence**: 10 个 test 文件存在，运行全部 FAIL

**Commit Message**: `test(forge-collapse): add R3/R4/R5/R6 RED — routing + refs + dispatcher + ADR contracts`

---

### Task 4a: GREEN — Allowlist + path resolution（dispatcher 第 1 模块）

**Depends On**: [1, 2, 3]
**Files**:
- Create: `src/forge-dispatcher/allowlist.ts`
- Create: `src/forge-dispatcher/path-resolve.ts`

**实现 R2.1 + R2.2 部分**：
- `ALLOW_LIST: ReadonlyArray<string>` 硬编码 29 个 sub 名
- `validateTopic(topic: string)` 拒绝非白名单值，返回 `Result<ValidatedSub, "E_UNKNOWN_SUB">` + closest-match 建议
- `resolveLibPath(sub: ValidatedSub, pluginRoot: string)` 用 `path.resolve` + `realpath` 验证落在 pluginRoot 内；symlinks 拒绝

**Run**: `npx vitest run test/single-entry/topic-allowlist.test.ts test/single-entry/path-safety.test.ts`
**Expected**: exit 0

**Verify-By**: vitest
**Evidence**: R2.1 + R2.2 测试 PASS

**Commit Message**: `feat(forge-collapse): allowlist + path resolution module`

---

### Task 4b: GREEN — Per-sub tools + untrusted fence（dispatcher 第 2 模块）

**Depends On**: [4a]
**Files**:
- Create: `src/forge-dispatcher/tools-resolve.ts`
- Create: `src/forge-dispatcher/untrusted-fence.ts`

**实现 R2.3 + R2.4**：
- `resolveAllowedTools(libContent: string)` 解析 frontmatter `allowed_tools` 字段；缺失/空 → 抛 `E_TOOLS_UNDECLARED`
- `wrapWorkspaceContext(files: WorkspaceFile[])` 用 `<untrusted source="...">` 包裹 + 静态 preamble

**Run**: `npx vitest run test/single-entry/per-sub-tools.test.ts test/single-entry/untrusted-fence.test.ts`
**Expected**: exit 0

**Verify-By**: vitest
**Evidence**: R2.3 + R2.4 测试 PASS

**Commit Message**: `feat(forge-collapse): per-sub tool scoping + untrusted workspace fence`

---

### Task 4c: GREEN — Audit log + HMAC chain（dispatcher 第 3 模块）

**Depends On**: [4a]
**Files**:
- Create: `src/forge-dispatcher/audit-log.ts`

**实现 R2.7**：
- `appendAuditLog(entry: AuditEntry)` 用 `fs.appendFileSync({flag:'a'})` 写入 `${CLAUDE_PLUGIN_DATA}/forge/audit/dispatch.log`
- HMAC chain：next.hmac = sha256(prev.hmac + JSON.stringify(current_entry))；首行 prev.hmac = "" (空字符串作 seed)
- Fallback：`${CLAUDE_PLUGIN_DATA}` 不可用 → 退化到 `~/.claude/plugins/data/forge/audit/`，仍不可用 → console.warn 但不阻断

**Run**: `npx vitest run test/single-entry/audit-log.test.ts`
**Expected**: exit 0

**Verify-By**: vitest
**Evidence**: R2.7 测试 PASS

**Commit Message**: `feat(forge-collapse): tamper-evident audit log with HMAC chain`

---

### Task 4d: GREEN — Chokepoint orchestrator + dispatcher_mode flag（dispatcher 第 4 模块）

**Depends On**: [4a, 4b, 4c]
**Files**:
- Create: `src/forge-dispatcher.ts`（导出 `dispatchForgeSubcommand`）
- Modify: `.tinkerman/config.md`（追加 `skills.dispatcher_mode` 字段说明）

**实现 R2.10 + R5.2 chokepoint 9 步**：
- 入口函数 `dispatchForgeSubcommand(topic, opts)`
- 内部按 spec R5.2 §1-9 顺序调用 4a/4b/4c 模块的函数 + integrity check（占位，Task 7 提供实际实现）+ dispatch path stub
- `resolveDispatcherMode()` 读 `.tinkerman/config.md`，默认 `collapsed`；`legacy` 模式输出提示 `"legacy mode requires Forge < 2.6"` 并继续走 chokepoint（R2.10 chokepoint 不被绕过）
- 9 步内部函数全部 export 用于 Task 3 的 spy

**Run**: `npx vitest run test/single-entry/dispatch-chokepoint-order.test.ts test/single-entry/dispatcher-mode-flag.test.ts test/single-entry/dispatch-fork.test.ts test/single-entry/dispatch-inline.test.ts`
**Expected**: exit 0

**Verify-By**: vitest
**Evidence**: R5.2 + R2.10 + R3.1 + R3.2 测试 PASS（注：R2.5/R2.6/R2.8/R3.5/R4/R5.1/R5.3/R6 仍 RED，依赖物理迁移完成）

**Commit Message**: `feat(forge-collapse): chokepoint orchestrator + dispatcher_mode flag`

---

### Task 5: GREEN — 实现 migrate-skills-to-lib.mjs 脚本

**Depends On**: [4d]
**Files**:
- Create: `scripts/migrate-skills-to-lib.mjs`

**实现内容**：
1. for each `skills/forge-<sub>/` (29 个):
   - `git mv skills/forge-<sub>/ skills/forge/lib/<sub>/`
   - `git mv skills/forge/lib/<sub>/SKILL.md skills/forge/lib/<sub>/instructions.md`
2. for each `skills/forge/lib/<sub>/instructions.md`：
   - 删除 frontmatter 字段：`name`、`disable-model-invocation`、`skeleton_exempt_legacy`
   - 新增字段：`allowed_tools: [<resolved set>]`、`dispatch_mode: <fork|inline>`（按 spec R3.5 表格）
   - 保留：`description`、`context`、`pack_conditional`
3. 重写跨 lib 引用：grep `\.\./forge-([^/]+)/` → `../$1/`（去掉 `forge-` 前缀）
4. dry-run 模式（`--dry-run`）输出预期变更，不实际执行 git mv

**Run**: `node scripts/migrate-skills-to-lib.mjs --dry-run`
**Expected**: output contains "29 directories to migrate"

**Verify-By**: bash
**Evidence**: 脚本存在且 dry-run 输出 29 个 sub 的迁移计划

**Commit Message**: `feat(forge-collapse): add migration script with dry-run mode`

---

### Task 6: GREEN — 执行物理迁移

**Depends On**: [5]
**Files**:
- Delete: `skills/forge-*/` (29 directories via git mv)
- Create: `skills/forge/lib/<29 subs>/instructions.md` (via git mv)
- Create: `skills/forge/lib/<6 subs with refs>/references/*.md` (via git mv)

**步骤**：
1. 备份当前状态：`git stash push -m "pre-migration backup"`
2. `node scripts/migrate-skills-to-lib.mjs --dry-run > /tmp/migration-preview.txt`
3. 人工 review preview
4. `node scripts/migrate-skills-to-lib.mjs`（执行）
5. `git status` 确认 29 个 forge-* 目录变 deleted/renamed
6. `npx vitest run test/single-entry/migration-structure.test.ts test/single-entry/refs-self-relative.test.ts test/single-entry/refs-cross-rewrite.test.ts`

**Run**: `npx vitest run test/single-entry/migration-structure.test.ts test/single-entry/refs-self-relative.test.ts test/single-entry/refs-cross-rewrite.test.ts`
**Expected**: exit 0

**Verify-By**: vitest
**Evidence**: R1.4 + R4.1 + R4.2 测试 PASS

**Commit Message**: `refactor(forge-collapse): migrate 29 forge-* skills to skills/forge/lib/`

---

### Task 7: GREEN — 生成 registry.toml + manifest.json + lib-manifest 工具

**Depends On**: [6]
**Files**:
- Create: `scripts/regen-skill-registry.mjs`
- Create: `scripts/build-lib-manifest.mjs`
- Create: `scripts/check-registry-parity.sh`
- Create: `skills/forge/registry.toml`（脚本生成产物）
- Create: `skills/forge/lib/manifest.json`（脚本生成产物）

**实现要点**：
- `regen-skill-registry.mjs`：扫描 29 个 lib frontmatter，生成 TOML：每行 `[<sub>] dispatch_mode = "fork|inline"; allowed_tools = [...]; description = "..."`，文件首加 `# AUTO-GENERATED — DO NOT EDIT`
- `build-lib-manifest.mjs`：扫描每个 instructions.md + 同 sub 的 references/*.md，sha256 写入 `manifest.json`
- `check-registry-parity.sh`：先 `regen-skill-registry.mjs --check-only`，diff 当前 registry vs 重新生成的；不一致 → exit 1

**Run**: `node scripts/regen-skill-registry.mjs && node scripts/build-lib-manifest.mjs && bash scripts/check-registry-parity.sh && npx vitest run test/single-entry/registry-parity.test.ts test/single-entry/lib-integrity.test.ts test/single-entry/no-absolute-paths.test.ts test/single-entry/dispatch-mode-rule.test.ts`
**Expected**: exit 0

**Verify-By**: vitest + bash
**Evidence**: 脚本运行无错误；R2.5 + R2.6 + R2.8(no-absolute-paths) + R3.5 测试 PASS

**Commit Message**: `feat(forge-collapse): add registry/manifest generators + CI parity check`

---

### Task 8: GREEN — 写 skills/forge/SKILL.md (dispatcher 入口)

**Depends On**: [7]
**Files**:
- Create: `skills/forge/SKILL.md`

**RED** — Task 3 的 `dispatcher-frontmatter.test.ts` + `dispatcher-size.test.ts` 已等待该文件。

**GREEN** — 写 dispatcher SKILL.md，含：
- frontmatter（按 R5.1：`name: forge`, `description`, `allowed-tools: Read, Agent, Glob, Grep, Bash, Skill`, `skeleton_exempt_legacy: true`）
- `## Current Context` 的 `!` 命令（git branch / status）
- 9 步 chokepoint 描述（R5.2）
- 29 个 sub 命令清单按 4 tier 分组（R1.3）
- 调用 `Skill(src/forge-dispatcher#dispatchForgeSubcommand)` 的指令
- 内联简短 fork-vs-inline 规则（R3.3 简述 + 指针 → R3.5 表格在 spec.md）

行数控制 ≤ 250。

**Run**: `npx vitest run test/single-entry/dispatcher-frontmatter.test.ts test/single-entry/dispatcher-size.test.ts test/single-entry/skill-registration.test.ts test/single-entry/bare-forge-help.test.ts`
**Expected**: exit 0

**Verify-By**: vitest
**Evidence**: R1.1 + R1.3 + R5.1 + R5.3 测试 PASS

**Commit Message**: `feat(forge-collapse): add dispatcher SKILL.md (single entry point)`

---

### Task 9: GREEN — 退化 commands/forge.md 为 thin stub

**Depends On**: [8]
**Files**:
- Modify: `commands/forge.md`

**前置条件**：`test/single-entry/no-skill-x-references.test.ts` 已排除 `commands/` 目录（Task 6 commit a3b7950），Task 9 rewrite 后应移除该排除并验证 commands/forge.md 不含 `Skill(forge-X)` 调用。

**实现**：把 195 行 dispatcher 缩为 ~15 行 stub：
```yaml
---
name: forge
description: Forge 统一入口 — 路由到 skills/forge/SKILL.md
argument-hint: "[子命令|任务描述] [--tier=light|standard|full]"
model: inherit
allowed-tools: Skill
---

# /forge

调用 `Skill(forge)` 并把所有参数透传。完整 dispatcher 逻辑见 `skills/forge/SKILL.md`。
```

**Run**: `[ "$(wc -l < commands/forge.md)" -le 25 ] && echo OK`
**Expected**: output contains "OK"

**Verify-By**: bash
**Evidence**: `commands/forge.md` 行数 ≤ 25

**Commit Message**: `refactor(forge-collapse): degrade commands/forge.md to thin stub`

---

### Task 10: GREEN — 完善 dispatcher_mode flag 配置文档

**Depends On**: [9]
**Files**:
- Modify: `.tinkerman/config.md`（在 Task 4d 已添加字段，本任务补完整文档块）

**实现**：在 `.tinkerman/config.md` 现有结构追加（如 4d 未完整写）：
```markdown
## Skills Dispatcher Mode

`skills.dispatcher_mode`: `collapsed` (default) | `legacy`
- `collapsed`：使用 skills/forge/lib/ 路径（v2.5+）
- `legacy`：使用 skills/forge-X/SKILL.md 路径（v2.4 兼容，需要 git revert 物理迁移）

> v2.5 起 `legacy` 模式仅在迁移期保留。
```

**Run**: `npx vitest run test/single-entry/dispatcher-mode-flag.test.ts`
**Expected**: exit 0

**Verify-By**: vitest
**Evidence**: R2.10 测试 PASS（4d 已让该测试 PASS，本任务补文档完整性，重跑确认无回归）

**Commit Message**: `docs(forge-collapse): document dispatcher_mode flag in config.md`

---

### Task 11: REFACTOR — 重写 80+ 处测试硬编码路径

**Depends On**: [6, 10]
**Files**:
- Modify: `test/contract.test.ts`
- Modify: `test/contract.skills.test.ts`
- Modify: `test/build-nature-mode.test.ts`
- Modify: `test/skill-description.property.test.ts`
- Modify: `test/skill-length.property.test.ts`
- Modify: `test/contract.routing-sync.test.ts`
- Modify: `test/plan/build-skill-depends.test.ts`
- Modify: `test/plan/plan-skill-step35.test.ts`
- Modify: `test/plan/plan-template-depends.test.ts`
- Modify: `test/plan/review-skill-depends.test.ts`
- Modify: `test/build-bugfix-precheck.test.ts`
- Modify: `test/context-budget-contract.test.ts`
- Modify: `test/evolved-rules-infra-refs.test.ts`
- Modify: `test/docs/trimming-limits.test.ts`

**实现**：sed 全局替换 `skills/forge-<sub>/SKILL.md` → `skills/forge/lib/<sub>/instructions.md`，`skills/forge-<sub>/references/` → `skills/forge/lib/<sub>/references/`，`forge-<sub>` skill name 引用保持不变（业务逻辑没变，只是路径变）。

特殊：
- `test/contract.test.ts:49-58` SKILLS 数组中的 skill 名（"forge-build" 等）保留不变 —— 这些是逻辑名而非路径
- `test/skill-length.property.test.ts:158` "skills/forge-x/" 是测试 fixture 占位符，保留不变

**Run**: `npx vitest run`
**Expected**: exit 0

**Verify-By**: vitest
**Evidence**: 全测试套件 PASS（包括 R1-R6 的 single-entry 套 + 既有 contract 套）

**Commit Message**: `refactor(forge-collapse): rewrite 80+ test path hardcodes for new lib structure`

---

### Task 12: REFACTOR — 更新 docs + agents + knowledge

**Depends On**: [11]
**Files**:
- Modify: `docs/best-practices/review-configuration.md`
- Modify: `docs/best-practices/review-configuration.en.md`
- Modify: `docs/best-practices/worktree-usage.md`
- Modify: `docs/best-practices/worktree-usage.en.md`
- Modify: `agents/frontend-check.md`
- Modify: `.tinkerman/knowledge/skill-style-guide.md`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `CHANGELOG.md`

**实现**：
- docs 中 `skills/forge-<sub>/...` → `skills/forge/lib/<sub>/...`
- `agents/frontend-check.md` 三处 `skills/forge-review/references/...` → `skills/forge/lib/review/references/...`
- `.tinkerman/knowledge/skill-style-guide.md` 删除"必须 `disable-model-invocation: true`"段落，新增"lib instructions.md frontmatter 字段表"段落（含 `allowed_tools`、`dispatch_mode`）
- `README.md` SKILL 数量声明（如有）从 28+ → 1（顶层注册 skill），`/forge-build` 等示例改为 `/forge build`
- `CHANGELOG.md` 新增 v2.5.0 段：BREAKING — `/forge-X` removed from `/` menu; use `/forge <subcommand>`. References ADR-0004.

**Run**: `grep -rn 'skills/forge-' docs/ agents/ README.md ROADMAP.md CHANGELOG.md .tinkerman/knowledge/skill-style-guide.md`
**Expected**: exit 1 (no matches)

**Verify-By**: bash
**Evidence**: grep 返回空（除 ADR-0003 历史引用允许）

**Commit Message**: `docs(forge-collapse): rewrite paths + count + breaking change notes`

---

### Task 13: GREEN — 创建 ADR-0004 + 更新 ADR-0003

**Depends On**: [12]
**Files**:
- Create: `.tinkerman/decisions/ADR-0004-skills-collapse-and-dispatcher.md`
- Modify: `.tinkerman/decisions/ADR-0003-single-entry-command-consolidation.md`

**ADR-0004 内容**：参考 ADR-0003 模板，含：
- frontmatter：`id: ADR-0004`、`status: accepted`、`date: 2026-05-17`、`supersedes_partial: ADR-0003 §Decision/§Rollback`
- Context：Skill(forge-X) Unknown skill bug + `/` 菜单 29 个泄漏
- Decision：10 控制 + dispatcher chokepoint + fork/inline 路由
- Alternatives Considered：B/C/D（同 spec.md §Alternatives）
- Consequences：迁移路径明朗 / 安全控制完整 / breaking change 范围明确
- Rollback：dispatcher_mode flag → legacy + git revert 物理迁移 + manifest restore

ADR-0003 增补：
```markdown
## Update 2026-05-17

ADR-0004 (`skills-collapse-and-dispatcher.md`) 完成 ADR-0003 §Decision 与 §Rollback 部分的进一步具体化。ADR-0004 supersedes_partial 涉及：
- §Decision：把"删除 27 wrappers"扩展为"完整迁移 29 sub-skills 到 lib/"
- §Rollback：把"git revert"扩展为"feature flag 渐进回滚 + 物理 git revert 兜底"

ADR-0003 自身保持 status: accepted；本次 update 不改其结论，只标注被进一步细化的范围。
```

**Run**: `npx vitest run test/single-entry/adr-0004-frontmatter.test.ts`
**Expected**: exit 0

**Verify-By**: vitest
**Evidence**: R6.1 + R6.2 测试 PASS（adr-index.md 由 PostToolUse hook 自动追加 ADR-0004 entry）

**Commit Message**: `docs(forge-collapse): add ADR-0004 + update ADR-0003 supersedes notes`

---

### Task 14: REFACTOR — 重建 dist-plugin

**Depends On**: [13]
**Files**:
- Create: `scripts/sync-dist-plugin.mjs`
- Modify: `dist-plugin/skills/forge/SKILL.md`
- Delete: `dist-plugin/skills/forge-*/`
- Modify: `dist-plugin/commands/forge.md`
- Create: `dist-plugin/skills/forge/lib/<29 subs>/instructions.md`
- Create: `dist-plugin/skills/forge/registry.toml`
- Create: `dist-plugin/skills/forge/lib/manifest.json`

**实现**：复用现有 `scripts/build-plugin.mjs`（如有）或写新 `scripts/sync-dist-plugin.mjs` 把 `skills/`、`commands/`、`scripts/` 镜像到 `dist-plugin/`。

**Run**: `node scripts/sync-dist-plugin.mjs && diff -r skills/ dist-plugin/skills/`
**Expected**: exit 0

**Verify-By**: bash
**Evidence**: dist-plugin/skills/ 与 skills/ 结构同构

**Commit Message**: `chore(forge-collapse): rebuild dist-plugin to mirror new lib structure`

---

### Task 15: 全量验证（R1-R6 集成 + 既有套件）

**Depends On**: [14]

**步骤**：
1. `npx vitest run`（全测试套件）
2. `bash scripts/check-registry-parity.sh`（registry CI gate）
3. `npx tsc --noEmit`（TypeScript 类型检查，dispatcher 模块）
4. 手工实测（R1.2 manual evidence）：在 Claude Code CLI 输入 `/`，截图确认菜单只显示 `/forge`
5. R2.8 spike 重核（Task 0 verdict 仍有效）

**Run**: `npx vitest run && bash scripts/check-registry-parity.sh && npx tsc --noEmit`
**Expected**: exit 0

**Verify-By**: vitest + bash + manual
**Evidence**: 全测试 PASS；R1.2 截图归档到 `.tinkerman/findings/menu-screenshot-2026-05-17.png`（或文本记录）

**Commit Message**: `test(forge-collapse): full integration validation pass`

---

## 任务依赖图

```
Task 0 (Wave 0 spike, P0 blocker)
   │
   ├──→ Task 1 (RED R1)
   ├──→ Task 2 (RED R2)
   └──→ Task 3 (RED R3/R4/R5/R6)
              │
              ▼
         Task 4a (allowlist + path)
              │
              ├──────────────┐
              ▼              ▼
         Task 4b          Task 4c
         (tools+fence)   (audit+HMAC)
              │              │
              └──────┬───────┘
                     ▼
                Task 4d (chokepoint orchestrator)
                     │
                     ▼
                Task 5 (migrate script)
                     │
                     ▼
                Task 6 (执行迁移)
                     │
                     ▼
                Task 7 (registry + manifest)
                     │
                     ▼
                Task 8 (forge SKILL.md)
                     │
                     ▼
                Task 9 (commands/forge.md stub)
                     │
                     ▼
                Task 10 (dispatcher_mode flag 文档)
                     │
                     ▼
                Task 11 (test path rewrites)  ← 也依赖 Task 6 + 10
                     │
                     ▼
                Task 12 (docs+agents+knowledge)
                     │
                     ▼
                Task 13 (ADR-0004)
                     │
                     ▼
                Task 14 (dist-plugin sync)
                     │
                     ▼
                Task 15 (全量验证)
```

## 自检结果

| Check | Result |
|-------|--------|
| Spec Coverage | PASS — 22 个 R<N>.<M> 全部映射到至少一个任务（见 §Tasks 内 Verify-By/Evidence 字段）|
| Placeholder Scan | PASS — 无 TODO / FIXME / `<...>` 占位符（除 frontmatter 模板字段如 `<sub>` 这类外）|
| Type Consistency | PASS — `dispatchForgeSubcommand` 在 Task 4 首次定义，Task 1-3 测试用 `import` 引用合法 |
| Dependencies | PASS — 0→1/2/3, 1+2+3→4, 4→5→6, 6→7→8→9→10, 6→11, 11→12→13→14→15 拓扑成立无环 |
| Plan Structure | PASS — 16 个任务 + 1 个 spike，每个 2-15 min；非 monolithic（按 R 编号自然分波）|
| Verify Commands | PASS — 每个 task 含 Run / Expected 行（除 Task 0 是 spike）|
| Atomic Commits | PASS — 每个 task 含 Commit Message |

## 已知风险 / 转移到 build 阶段处理

1. **R-1 build 复杂度**：forge-build 239 行 + 18 references，迁移最容易出错。Task 6 物理迁移用脚本不手工，降低人为错误。
2. **R-2 测试用 stub fixture**：Task 1-3 写测试时 lib 还不存在，部分测试需要 fixture mock 或跳到 Task 6 后才能 GREEN。这是预期，不视为缺陷。
3. **R-3 dispatch_mode flag 实际行为**：Task 10 把 legacy 模式实现为"输出提示，不实际执行 legacy 路径"。这是 spec R2.10 允许的简化。完整 legacy 路径实现可在 v2.5.1 补，本 plan 不做。
4. **手动验证依赖**：R1.2（`/` 菜单）和 R2.8（worktree spike）需要人工在 Claude Code CLI 实测。Task 0 + Task 15 都包含 manual evidence。

## Pre-Ship Verification Checklist (R2.8b deferred items)

ship 阶段（Task 15 之后、merge 之前）必须完成以下 manual evidence：

1. `claude plugin install file:///Users/king/code/Forge` 安装 plugin
2. 验证 `${CLAUDE_PLUGIN_ROOT}` 解析到 plugin install 根
3. `cd .claude/worktrees/<x>/ && /forge zoom-out test`
   → lib 路径仍指向 plugin install 根（不是 worktree 副本）
4. （可行时）main + worktree 同时装 plugin → 观察 loader 行为
5. silent shadow → P0 阻断 ship，回退到 v2.5.1 fix

verdict 追加到 `.tinkerman/findings/worktree-spike-2026-05-17.md` §Plugin Mode Verification。

## 配套文件交接（plan → build）

plan 完成后，**必须**做以下三件事让 build 阶段能从 Forge 入口继续：

1. 复制 `.kiro/specs/forge-single-entry-skills-collapse/spec.md` 到 `.tinkerman/specs/forge-single-entry-skills-collapse/spec.md`（forge-build §2.2 spec-lock gate 在 `.tinkerman/specs/` 找）
2. 复制本 plan 到 `.tinkerman/plans/forge-single-entry-skills-collapse.md`
3. 写入 `.tinkerman/status.md`（current_task / tier=full / phase=plan / approved=true / branch=feature/forge-single-entry-poc）

完成后用户在 Claude Code 通过 `/forge-build` 菜单直选启动 build（绕过当前断链的 `/forge build` dispatcher）。
