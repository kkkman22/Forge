---
id: "ADR-0011"
title: "Subtraction Execution — Dependency-Verified Cut List & Batched Removal"
status: accepted
date: "2026-08-11"
deciders:
  - "@maintainer"
related_adrs:
  - "ADR-0009"
  - "ADR-0010"
---

# ADR-0011: Subtraction Execution — Dependency-Verified Cut List & Batched Removal

> ADR-0009 定方向，两份审计定清单，**本 ADR 定执行**——经依赖验证的砍除批次 + 砍后功能完整性结论。

## Context

ADR-0009（减法战略）+ ADR-0010（改名 Tinkerman）已落档。两份审计（`hook-audit-2026-08-11.md` / `ci-script-audit-2026-08-11.md`）共标记砍/退化 ~45 个机制（占 runtime + CI 拦截面 63%）。

**但"砍清单"≠"可执行"**——必须先回答：砍了之后，整个项目的功能逻辑是否正常？哪些被砍项被其他保留机制硬引用？

本 ADR 基于一次全仓库依赖扫描（20 个立即砍项 × 仓库所有 `.mjs/.js/.sh/.ts/.json/.md/.yml`）得出结论，并把砍除组织成**依赖安全的批次**。

## Dependency Verification（核心）

### 关键发现 1：hooks.json 是 fail-open 设计

`hooks/hooks.json` 每个 hook 注册条目都带 `|| true` 兜底：

```jsonc
"command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/inject-plan-context.mjs\" 2>/dev/null || ... || true"
```

**含义**：即使删掉脚本文件，hook 命令执行失败（node 找不到文件），`|| true` 让它静默通过——**不报错、不阻断 Claude Code 运行、不阻断 `/forge` 命令**。

这使 11 个注册在 hooks.json 的 runtime hook（stop/inject/record/worktree/permission/task 类）**在运行时层面可安全删除**。

### 关键发现 2：硬依赖仅 2 处（构建链，非运行时）

| 被砍项 | 硬依赖 | 性质 |
|--------|--------|------|
| `check-readme-metrics` | `package.json` + `.github/workflows/ci.yml` + `sync-readme-metrics.sh` | CI 构建链（非 fail-open，会断） |
| `check-unused-module` | `package.json` | npm scripts（非 fail-open，会断） |

其余 18 个立即砍项：7 个纯 SOFT（仅 docs/scripts 文本引用），11 个 HARD-failopen（hooks.json 注册但 fail-open 保护）。

### 砍后功能完整性结论

| 层 | 砍后状态 | 条件 |
|----|----------|------|
| Claude Code 运行时 | ✅ 正常 | hooks.json fail-open 兜底 |
| `/forge` 命令链（路由→build→review→ship） | ✅ 正常 | 被砍的是 lifecycle hook + CI 校验，**非命令实现** |
| 核心保留功能（冻结保护 / prompt-guard / read-injection-scanner / check-destructive / stop-phase-verify / review / ship-gate / Verification 铁律） | ✅ 全保留 | 不在砍清单 |
| MCP `forge-context`（review diff 截断） | ✅ 正常 | 不在砍清单 |
| CI 构建（`npm run check` / GitHub Actions） | ⚠️ **需配套** | 批次 3 改 `ci.yml` + `package.json`，否则 CI 红 |
| dist 同步（`check-dist-sync`） | ⚠️ **需配套** | 更新 `dist-manifest.json`，否则报警 |
| 文档（docs/AGENTS/CLAUDE） | ⚠️ 需清理 | 7-45 处"参见 X hook"类失效引用，机械工作 |

**总判定：砍除在运行时安全；CI/构建链必须成组配套修改。执行不可只删脚本。**

## Decision：分批执行（按依赖安全度）

### 批次 1 — SOFT 零配套（7 个，最低风险）

删脚本 + 清 docs 文本引用。无 hooks.json / package.json / ci 依赖。

| 脚本 | 引用 |
|------|------|
| `message-display-hook.mjs` | 仅自身 + docs(7) |
| `posttooluse-status-reminder.mjs` | 自身 + docs(4) |
| `phase-transition-guard.sh` | docs(9) |
| `check-iron-law-name-uniqueness.sh` | docs(1) |
| `check-purity.ts` | docs(1) |
| `check-spec-close-coverage.mjs` | docs(2) |
| `lint-pack-rules.mjs` | 自身 + docs(11) |

### 批次 2 — HARD fail-open（11 个，运行时安全）

删脚本 + **同步删 hooks.json 对应注册条目** + 更新 dist-manifest。运行时 fail-open 兜底（即使漏改也不崩，但不干净）。

| 脚本 | lifecycle | 备注 |
|------|-----------|------|
| `stop-additional-context.mjs` | Stop | |
| `stop-failure-hook.mjs` | StopFailure | |
| `stop-incomplete-tasks.mjs` | Stop | ⚠️ 被 `inject-plan-context`/`set-active-plan.mjs` 引用，核数据流后删 |
| `inject-plan-context.mjs` | UserPromptSubmit | ⚠️ 同上（脚本间） |
| `permission-denied-hook.mjs` | PermissionDenied | |
| `task-created-hook.mjs` | TaskCreated | |
| `worktree-create-hook.mjs` | WorktreeCreate | |
| `worktree-remove-hook.mjs` | WorktreeRemove | |
| `hook-task-completed.sh` | TaskCompleted | ⚫ 死代码（ADR-0007 不走 Agent Teams） |
| `record-evolved-rule-violation.mjs` | — | 被 dispatcher.sh 引用 |
| `record-prompt-metrics.mjs` | UserPromptSubmit | |

### 批次 3 — HARD 构建链（2 个，必须配套）

**不可单独删**——会断 CI。必须成组：删脚本 + 改 `package.json` scripts + 改 `.github/workflows/ci.yml` + 删连带脚本。

| 脚本 | 连带 |
|------|------|
| `check-unused-module.mjs` | 从 `package.json` scripts 摘除 |
| `check-readme-metrics.sh` | 改 `ci.yml`（删 step）+ 删 `sync-readme-metrics.sh` + 从 `package.json` 摘除 |

### 退化（4 个，改机制不删文件）

| 脚本 | 退化动作 |
|------|----------|
| `inject-evolved-rules.mjs` | 砍 4KB byte-limit / spec-title 复杂逻辑，退化为 SessionStart 直读文件头 |
| `stop-pending-rules.mjs` | 内容留 evolved-rules，砍"拦截会话结束"机制 |
| `hook-precompact.sh` / `hook-postcompact.sh` | 简化 snapshot 逻辑，只保留跨会话必须状态 |

### 随减法失效（~17 类，挂 TODO，不立即动）

router×3 / skill×4 / docs×6 / agent×3 / dispatcher+registry——**不立即删**（删了现 Forge CI 红）。在 ADR-0009 各刀（路由退化 / skill 简化 / docs 瘦身 / agents 收缩 / 命令收敛）的 spec 里挂「同步清理这些脚本」TODO。

## Execution Protocol

每个批次独立 feature 分支，按 Forge 宪法 §2.3（Verification 铁律）执行：

1. **删**：脚本文件
2. **改注册**：hooks.json（批次2）/ package.json（批次3）/ ci.yml（批次3）/ dist-manifest（批次2/3）
3. **清引用**：docs 失效引用（机械）
4. **验证**（必须基于刚跑的命令输出）：
   ```
   tsc --noEmit && biome check src/ test/ && vitest run && \
   node scripts/check-dist-sync.mjs && node scripts/check-public-api.mjs && \
   node scripts/check-domain-safety.mjs
   ```
5. **原子提交**：每批一个 commit
6. **三击熔断**（§2.4）：同批验证连续失败 3 次 → 停，进 `/forge debug`

**推荐顺序：批次 1（验证流程跑通）→ 批次 2（runtime hook）→ 批次 3（构建链）→ 退化 → 随 ADR-0009 各刀清理失效项**。

## Consequences

### Positive

- 砍除有据可依：依赖验证证明运行时安全，CI/构建链风险已识别且成组处理
- 分批降低风险：批次 1 零配套可立即执行，验证执行流程；批次 2/3 有明确配套清单
- 砍后核心功能完整：冻结 / prompt-guard / review / ship-gate / Verification 铁律全保留
- 给 ADR-0009 减法提供可执行落脚点——从"方向"变成"可跑的批次"
- 与 ADR-0010 改名解耦：砍完用旧名验证减法正确，再改名

### Negative

- 3 个脚本间依赖需核（stop-incomplete-tasks ↔ inject-plan-context / record-evolved-rule-violation ← dispatcher.sh）——核数据流可能发现不能简单删，需先迁移引用
- 批次 3 改 ci.yml + package.json 是构建链硬改，回归面大，需完整跑 CI 验证
- dist-manifest 更新若遗漏，check-dist-sync 会误报（非致命但有噪音）
- docs 清理工作量大（部分项 23-45 处引用），机械但繁重
- 随减法失效的 17 类未立即处理——减法推进期间，这些"僵尸脚本"仍存在并消耗 CI 时间
