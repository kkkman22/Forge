# Changelog

All notable changes to Forge will be documented in this file.

## Format Conventions

Entries follow [Keep a Changelog](https://keepachangelog.com/) with Forge-specific additions:

- **`[SECURITY]` prefix**: security fixes (including CVE / GHSA remediations) are tagged `[SECURITY]` in the `Fixed` section. Each `[SECURITY]` entry **must link at least one ADR** (`ADR-NNNN`) describing the root-cause analysis and remediation decision. See [SECURITY.md](SECURITY.md) for the record format.
- **ADR references**: architectural changes reference the driving ADR when one exists (`ADR-NNNN: <title>`).

## [Unreleased]

### Fixed

- **hooks**: resolve script paths under plugin install (#125)
  - **hooks/hooks.json**: every hook command referenced project-relative paths (`scripts/X.mjs`, `forge/scripts/X.mjs`, `~/.claude/skills/forge/scripts/X.mjs`), but plugin install places scripts at `${CLAUDE_PLUGIN_ROOT}/scripts/` — none of the three fallback paths resolved. The 7 `Stop` hooks had no `|| true` and threw a visible `MODULE_NOT_FOUND` on every Claude turn; other hooks silently no-op'd behind `|| true`.
  - All script-referencing hooks now lead with `node "${CLAUDE_PLUGIN_ROOT:-}/scripts/X.mjs"` (the plugin path, expanded by Claude Code at hook runtime), then keep the existing 3-path fallback chain, then `|| true`. Mirrors the already-correct `forge-sync-runtime.mjs` SessionStart hook. Protection hooks (frozen-zone `check-frozen.sh`, `check-sandbox.js`, `hook-task-completed.sh`) intentionally keep their non-zero exit-code propagation and are exempt from `|| true`.
  - Empirically verified: simulating a plugin install (CWD = bare project, `CLAUDE_PLUGIN_ROOT` = plugin cache) reproduces the original `Cannot find module '<project>/scripts/stop-incomplete-tasks.mjs'` under the old command and resolves cleanly (exit 0) under the new command.
  - **⚠️ Migration for existing plugin installs**: the fix lands in `hooks/hooks.json` inside the plugin package, so reinstalling/updating the Forge plugin picks it up automatically — no project-side action required. Projects that copied `hooks.json` into `.claude/settings.json` via `forge init` (v3.4.0–v3.6.0 path) still carry the old project-relative paths; re-running `forge init` after deleting the `"hooks"` key refreshes them (same migration channel as #122).

## [3.6.1] - 2026-06-22

### Added

- **skill-craft**: adopt mattpocock/skills 9-point skill-craft improvements (#121) (#121)
- adopt 4 superpowers v6.0.0 SDD lessons (unverifiable verdict / plan pre-flight / model tier / plan constraints) (#119)

### Changed

- **specs**: add mattpocock-skill-craft-borrow spec (9-point skill-craft adoption) (#120)

### Fixed

- **init/hooks**: repair Claude Code hooks schema + init.sh resilience (#122)
  - **hooks/hooks.json**: 15 of 41 hook entries used the unsupported `{"args":[...]}` form, which `/doctor` rejects with `type: Invalid input` and the hooks silently never fired. Converted all 15 to the schema-valid `{"type":"command","command":"..."}` form (matching the 26 already-valid hooks).
  - **scripts/init.sh**: `install_companion()` returns 1 on failure; under `set -euo pipefail` the first failed `pip`/`npm` install aborted the whole script before the completion banner. All 4 call sites now guarded with `|| true` (companion installs are best-effort; Forge falls back to built-in trimmer/grep).
  - **scripts/init.sh**: `headroom-ai[all]` pulled ~2.5 GB (torch/transformers/onnxruntime/scipy). Forge only uses `headroom wrap` (API-level compression), so the `[all]` extra is unnecessary. Now installs bare `headroom-ai`.
  - **runtime-sync**: `forge-sync-runtime.mjs` (runs on every SessionStart) now scans for `args`-form hooks in `.claude/settings.json` and prints a targeted migration warning — the only channel that reaches already-polluted projects automatically.
  - **⚠️ Migration for existing projects**: upgrading the Forge plugin alone does NOT fix `.claude/settings.json` in projects already initialized by v3.4.0–v3.6.0, because `init.sh` skips hooks sync when a `"hooks"` key already exists (init.sh:728) and the broken entries are a snapshot copy. **Affected users must either (a) delete the `"hooks"` key from `.claude/settings.json` and re-run `forge init`, or (b) manually convert the 15 `args`-form entries to `{type:"command", command:"..."}`.** New projects get the fix automatically. If you see the `⚠️ Forge detected N hook(s)...` warning on session start, follow its numbered steps.
- **bump-version**: report true GitHub Release outcome in summary (#118)

### Added

- **skill-craft**: adopt mattpocock/skills skill-craft improvements (9-point spec `mattpocock-skill-craft-borrow`) (#121)
  - User-invoked vs model-invoked skill split + skill invocation inventory (R1)
  - Session topology (main-flow/on-ramp/cross-session) + smart zone (100K conservative / ~120K SOTA) + handoff(fork) vs compact(continue) (R2)
  - Domain document three-way split: glossary / ADR / rejected-requests (out-of-scope) library (R3)
  - `/forge debug` Phase 1→2 tight red-capable loop gate (R4, no new phase number; three-strike context satisfies the gate)
  - Completion Criterion two-attribute model (clarity + demand) for premature-completion defense (R5)
  - Skill Failure Modes self-audit vocabulary (premature completion / duplication / sediment / sprawl / no-op) (R6)
  - Leading Words vocabulary (tight / red-capable) for token-efficient behavior anchoring (R9)
- **review**: extract `shared-vocabulary.md` SSOT (Two-Phase / JSON schema / Known-failures YAML / Return Protocol / Findings-Only / Confidence_Anchor); 3 checkers load via Step 0.1 Read (R8)

### Changed

- **debug**: tighten existing Phase 1 (Symptom Gathering) completion criteria — red-capable loop now a hard exit gate before Phase 2 (R4)
- **review**: 3 checkers' Read budget raised 3→4 (1 shared-vocab Read + 3 deep-checks) to absorb the shared vocabulary load (R8)
- **decide / triage**: query rejected-requests library before evaluation; rejected requests written to `.forge/knowledge/out-of-scope/` (R3)

### Added (中文)

- **skill-craft**: 借鉴 mattpocock/skills 的 skill 工艺改进(9 点 spec `mattpocock-skill-craft-borrow`)(#121)
  - User-invoked vs model-invoked skill 二分 + skill 调用盘点(R1)
  - 会话拓扑(主流程/on-ramp/跨会话桥)+ smart zone(100K 保守 / ~120K SOTA 参考)+ handoff(fork) vs compact(continue)(R2)
  - 领域文档三分:glossary / ADR / 被拒需求库(out-of-scope)(R3)
  - `/forge debug` Phase 1→2 tight red-capable 回路门禁(R4,不新增 Phase 编号;三连失败上下文满足门禁)
  - Completion Criterion 两属性模型(clarity + demand)治"过早完成"(R5)
  - Skill Failure Modes 自审词汇表(premature completion / duplication / sediment / sprawl / no-op)(R6)
  - Leading Words 词汇表(tight / red-capable)省 token 锚定行为(R9)
- **review**: 抽取 `shared-vocabulary.md` 单源(Two-Phase / JSON schema / Known-failures YAML / Return Protocol / Findings-Only / Confidence_Anchor);3 checker 通过 Step 0.1 Read 加载(R8)

### Changed (中文)

- **debug**: 收紧现有 Phase 1(Symptom Gathering)完成判定——red-capable 回路成为 Phase 2 前置硬门禁(R4)
- **review**: 3 checker Read 预算从 3 提升至 4(1 次 shared-vocab Read + 3 次深查)吸收共享词汇加载(R8)
- **decide / triage**: 评估前查被拒需求库;被拒需求写入 `.forge/knowledge/out-of-scope/`(R3)

### Added

- **skill-craft**: adopt mattpocock/skills skill-craft improvements (9-point spec `mattpocock-skill-craft-borrow`) (#121)
  - User-invoked vs model-invoked skill split + skill invocation inventory (R1)
  - Session topology (main-flow/on-ramp/cross-session) + smart zone (100K conservative / ~120K SOTA) + handoff(fork) vs compact(continue) (R2)
  - Domain document three-way split: glossary / ADR / rejected-requests (out-of-scope) library (R3)
  - `/forge debug` Phase 1→2 tight red-capable loop gate (R4, no new phase number; three-strike context satisfies the gate)
  - Completion Criterion two-attribute model (clarity + demand) for premature-completion defense (R5)
  - Skill Failure Modes self-audit vocabulary (premature completion / duplication / sediment / sprawl / no-op) (R6)
  - Leading Words vocabulary (tight / red-capable) for token-efficient behavior anchoring (R9)
- **review**: extract `shared-vocabulary.md` SSOT (Two-Phase / JSON schema / Known-failures YAML / Return Protocol / Findings-Only / Confidence_Anchor); 3 checkers load via Step 0.1 Read (R8)

### Changed

- **debug**: tighten existing Phase 1 (Symptom Gathering) completion criteria — red-capable loop now a hard exit gate before Phase 2 (R4)
- **review**: 3 checkers' Read budget raised 3→4 (1 shared-vocab Read + 3 deep-checks) to absorb the shared vocabulary load (R8)
- **decide / triage**: query rejected-requests library before evaluation; rejected requests written to `.forge/knowledge/out-of-scope/` (R3)

### Added (中文)

- **skill-craft**: 借鉴 mattpocock/skills 的 skill 工艺改进(9 点 spec `mattpocock-skill-craft-borrow`)(#121)
  - User-invoked vs model-invoked skill 二分 + skill 调用盘点(R1)
  - 会话拓扑(主流程/on-ramp/跨会话桥)+ smart zone(100K 保守 / ~120K SOTA 参考)+ handoff(fork) vs compact(continue)(R2)
  - 领域文档三分:glossary / ADR / 被拒需求库(out-of-scope)(R3)
  - `/forge debug` Phase 1→2 tight red-capable 回路门禁(R4,不新增 Phase 编号;三连失败上下文满足门禁)
  - Completion Criterion 两属性模型(clarity + demand)治"过早完成"(R5)
  - Skill Failure Modes 自审词汇表(premature completion / duplication / sediment / sprawl / no-op)(R6)
  - Leading Words 词汇表(tight / red-capable)省 token 锚定行为(R9)
- **review**: 抽取 `shared-vocabulary.md` 单源(Two-Phase / JSON schema / Known-failures YAML / Return Protocol / Findings-Only / Confidence_Anchor);3 checker 通过 Step 0.1 Read 加载(R8)

### Changed (中文)

- **debug**: 收紧现有 Phase 1(Symptom Gathering)完成判定——red-capable 回路成为 Phase 2 前置硬门禁(R4)
- **review**: 3 checker Read 预算从 3 提升至 4(1 次 shared-vocab Read + 3 次深查)吸收共享词汇加载(R8)
- **decide / triage**: 评估前查被拒需求库;被拒需求写入 `.forge/knowledge/out-of-scope/`(R3)

### Fixed (中文)

- **init/hooks**: 修复 Claude Code hooks schema + init.sh 韧性 (#122)
  - **hooks/hooks.json**: 41 条 hook 中有 15 条用了不支持的 `{"args":[...]}` 写法,被 `/doctor` 报 `type: Invalid input` 且永不触发。已全部转为合法的 `{"type":"command","command":"..."}`(与另外 26 条有效 hook 一致)。
  - **scripts/init.sh**: `install_companion()` 失败时返回 1,在 `set -euo pipefail` 下第一个 `pip`/`npm` 安装失败就会中止整个脚本,跑不到完成横幅。4 个调用点已全部加 `|| true`(companion 安装是 best-effort,Forge 会回退到内置 trimmer/grep)。
  - **scripts/init.sh**: `headroom-ai[all]` 会拉取 ~2.5GB(torch/transformers/onnxruntime/scipy)。Forge 只用 `headroom wrap`(API 级压缩),不需要 `[all]` 的本地模型依赖。现改为安装裸 `headroom-ai`。
  - **runtime-sync**: `forge-sync-runtime.mjs`(每次 SessionStart 运行)现在会扫描 `.claude/settings.json` 里的 `args` 写法 hook 并打印迁移警告——这是唯一能自动触达已污染项目的通道。
  - **⚠️ 老项目迁移说明**: 仅升级 Forge 插件**不能**修复 v3.4.0–v3.6.0 已初始化项目里的 `.claude/settings.json`,因为 `init.sh` 检测到已有 `"hooks"` 键就跳过同步(init.sh:728),坏 hook 是快照拷贝。**受影响用户必须 (a) 删除 `.claude/settings.json` 的 `"hooks"` 键后重跑 `forge init`,或 (b) 手动把 15 条 `args` 写法改成 `{type:"command", command:"..."}`。** 新项目自动拿到修复版。如果你在开新会话时看到 `⚠️ Forge detected N hook(s)...` 警告,按它给的编号步骤操作即可。

## [3.6.0] - 2026-06-21

### Added

- Layered Test Pyramid (ADR-0006) — four-layer verification model (#116)
- **continue**: add /forge continue interactive phase advancer (#115)
- **context**: activate context-injection scaffold + wire into review/decide (#114)
- **charter**: inject charter grounding into build phase (§2.5) (#113)
- **metrics**: wire UserPromptSubmit hook to usage metrics recorder (#112)
- **learn**: add §0.9 forge:defer sweep step
- **build**: add forge:defer marker spec + deferred.md ledger
- **review**: add Deletions dimension (Dim 8) to quality-check
- **build**: add hard-boundaries checklist to Self-Review
- **build**: add Pre-task YAGNI gate to forge-build agent

### Changed

- **knowledge**: distill worktree base = origin/main lesson
- **learn**: extract mcp-compression-delegation lessons to knowledge base
- **mcp**: delegate compression to Headroom, remove RTK + forge_read_cached (#107)

### Fixed

- **barrel**: consolidate context-injection exports under 20-statement budget
- **spec**: delegate spec-bundle-io render fns to spec-render SSOT (P0-6)
- **spec-migration**: use static import for writeEvent instead of require (P1-5)
- **build**: wire SUCCESS_INDICATORS in validateRedGate, drop dead vars (P0-2->P2)
- **review**: address remaining P2/P3 findings (non-blocking hardening)
- **review**: address P1/P2 findings from Layer 2 + Layer 3 review
- **review**: restore quality-check.md symlink, apply Dim 8 to source
- **test**: stop ui-harness tests from launching real browsers (#108)
- **test**: harden docs-governance CLI tests (dirty TMP_DIR + tight timeout)
- **hooks**: bound pre-push check with timeout + silence fallback-ladder test noise (#106)

### Added

- **continue**: `/forge continue` 交互式阶段推进器，跨会话推进当前任务的下一阶段 (#115)
- **context**: 激活 context-injection scaffold 并接入 `/forge review` 与 `/forge decide`，按 taskType 注入相关上下文 (#114)
- **charter**: 将 charter grounding 注入 build 阶段（§2.5），主 Agent 每个 restatement checkpoint 重读 charter invariants (#113)
- **metrics**: UserPromptSubmit hook 接入 usage metrics recorder，记录每次 prompt 的 token 消耗 (#112)
- **build**: `forge:defer` 延迟决策标记 + `deferred.md` 台账；learn §0.9 sweep 步骤在 learn 阶段回收这些决策
- **review**: quality-check 新增 Deletions 维度（Dim 8），扫描"本不该写"的代码并产出 delete-list
- **build**: forge-build agent 引入 Pre-task YAGNI gate + hard-boundaries 自检清单（Ponytail YAGNI 纪律采纳）
- **knowledge**: 提炼 worktree base = origin/main 教训与 mcp-compression-delegation 经验到 knowledge base

### Changed

- **mcp**: 将压缩委托给 Headroom，移除 RTK 压缩引擎 + `forge_read_cached` (#107)
- **spec**: spec-bundle-io 的渲染函数委托给 spec-render SSOT，消除重复实现 (P0-6)
- **review**: address P1/P2 findings from Layer 2 + Layer 3 review + 后续 P2/P3 非阻断加固
- **tool-health**: 将 tool-health event log 从 tracked summary 中拆分 (#109)

### Fixed

- **hooks**: 为 pre-push 检查加超时上限并静默 fallback-ladder 测试噪声 (#106)
- **mcp**: 消除 integration test 中的 SIGTERM 关闭竞态（已在 3.5.0，本次补登记）
- **build**: 在 `validateRedGate` 接入 SUCCESS_INDICATORS，移除死变量 (P0-2→P2)
- **spec-migration**: writeEvent 改用静态 import 而非 require (P1-5)
- **router**: 固定 workNature-agnostic routerPhases 契约测试 (P0-1，非 bug)
- **test**: ui-harness 测试不再启动真实浏览器 (#108)
- **test**: 加固 docs-governance CLI 测试（dirty TMP_DIR + tight timeout）

### Added

- **continue**: `/forge continue` 交互式阶段推进器，跨会话推进当前任务的下一阶段 (#115)
- **context**: 激活 context-injection scaffold 并接入 `/forge review` 与 `/forge decide`，按 taskType 注入相关上下文 (#114)
- **charter**: 将 charter grounding 注入 build 阶段（§2.5），主 Agent 每个 restatement checkpoint 重读 charter invariants (#113)
- **metrics**: UserPromptSubmit hook 接入 usage metrics recorder，记录每次 prompt 的 token 消耗 (#112)
- **build**: `forge:defer` 延迟决策标记 + `deferred.md` 台账；learn §0.9 sweep 步骤在 learn 阶段回收这些决策
- **review**: quality-check 新增 Deletions 维度（Dim 8），扫描"本不该写"的代码并产出 delete-list
- **build**: forge-build agent 引入 Pre-task YAGNI gate + hard-boundaries 自检清单（Ponytail YAGNI 纪律采纳）
- **knowledge**: 提炼 worktree base = origin/main 教训与 mcp-compression-delegation 经验到 knowledge base

### Changed

- **mcp**: 将压缩委托给 Headroom，移除 RTK 压缩引擎 + `forge_read_cached` (#107)
- **spec**: spec-bundle-io 的渲染函数委托给 spec-render SSOT，消除重复实现 (P0-6)
- **review**: address P1/P2 findings from Layer 2 + Layer 3 review + 后续 P2/P3 非阻断加固
- **tool-health**: 将 tool-health event log 从 tracked summary 中拆分 (#109)

### Fixed

- **hooks**: 为 pre-push 检查加超时上限并静默 fallback-ladder 测试噪声 (#106)
- **mcp**: 消除 integration test 中的 SIGTERM 关闭竞态（已在 3.5.0，本次补登记）
- **build**: 在 `validateRedGate` 接入 SUCCESS_INDICATORS，移除死变量 (P0-2→P2)
- **spec-migration**: writeEvent 改用静态 import 而非 require (P1-5)
- **router**: 固定 workNature-agnostic routerPhases 契约测试 (P0-1，非 bug)
- **test**: ui-harness 测试不再启动真实浏览器 (#108)
- **test**: 加固 docs-governance CLI 测试（dirty TMP_DIR + tight timeout）

## [3.5.0] - 2026-06-18

### Added

- 动态重规划闭环 (failure_class + scheduler debug 分支 + 增量 replan) (#103)
- **accept**: agentic UI acceptance via agent-browser (端到端功能验收) (#102)
- **knowledge**: session journal retention (#101)
- **review**: per-tier dynamic agent timeout (#100)
- regenerative checkpoint — 长会话状态保全（借鉴 MiMo-Code） (#99)
- Loop Engineering 橙皮书借鉴采纳 (行为验证 + triage + 理解腐烂对策) (#98)
- **specs**: forge-decide-agent-teams R6.3 README note + cmux-integration R14 loop event emission wiring
- **review**: Validation Pass downgrade logic + pipeline wiring (ce-inspired R5)
- **review**: stable R-NNN finding IDs (ce-inspired-review-enhancement R8)
- **review**: autofix route classifier + router (ce-inspired-review-enhancement R9)
- **review**: compact-safe mode for context-budget exhaustion (ce-inspired-review-enhancement R10)
- **zone-registry**: TS Zone_Registry loader for programmatic hooks (frozen-zone-structured-feedback R4)
- **frozen-zone**: PostToolUse defence-in-depth hook + breach audit (frozen-zone-structured-feedback R3)
- **hooks**: emit auto-resume as hookSpecificOutput JSON (session-resume-check R3)
- **plan,ship**: wire Backlog_Manager into /forge plan + ship (forge-review-fix-optimization R6)
- **cmux**: data-contract layer for diff-review + extension-sidebar drafts (R2)
- **frozen-zone**: structured FrozenDiagnostic in PreToolUse hook (frozen-zone-structured-feedback R1/R2)
- **specs**: honest-retire ce-inspired/loop-skills/cmux-integration + cmux config flags + decide-teams poc-topics
- **resume**: wire recovery engine into /forge resume via runRecoveryChain (error-recovery-strategy R7)
- **doctor**: add runtimeSync health check for worker runtime assets (runtime-worker-context-control R7.4)
- **review**: add Sycophancy Detection check for re-review (build-subagent-protocol R9)
- **agents**: add Execution Contract sections to 4 forge agents (ccbp R2/R3/R11)
- **cmux**: 0.64.x integration — compat fix, schema conformance, reorder-workspaces, browser QA (#95)

### Changed

- refresh README/ROADMAP/SECURITY/CONTRIBUTING to v3.4 + #100-#103 reality
- increase vitest maxWorkers 2→4 (test suite 8000+ tests runs in 38s vs 300s+ timeout)
- code-slim-0612 — behavior-preserving code slimming (P1+P2+P3) (#93)

### Fixed

- **mcp**: eliminate SIGTERM shutdown race in integration test (#104)
- **docs**: export SourceRef/ParsedLine/AllowedReadFile types for TypeDoc
- autofix-router noUselessSwitchCase lint + availability test CMUX_INTEGRATION isolation
- **doctor**: add 30s timeout + SIGTERM to git calls (process-lifecycle-management R5)
- **config**: align cmux_* flag defaults with templates/config.md canonical values
- **agents**: rewrite 3 review-agent descriptions in canonical source (agent-description-cso R2)
- **agents**: rewrite 3 review-agent descriptions to CSO 'Use in Layer N' form (agent-description-cso R2)
- **specs**: regenerate INDEX.md + support retired-partial status
- 6 audit bugs (2 critical cmd-injection + loader crash; 4 high) (#97)
- **hooks**: exclude _-prefixed dirs from sessionTitle spec detection (#96)
- resolve 4 session issues from code-slim-0612 (#94)
- **ci**: compile before check in publish job; fix release tooling

### Removed

- **refactor**: remove `forge-loop/deprecated` public subpath export (v2.4→v2.5 migration shim; `@deprecated` since v2.5.0, retired at v3.4.0). Package is unpublished with no consumers; completes the overdue deprecation. See ADR-0008.

### Removed

- **refactor**: remove `forge-loop/deprecated` public subpath export (v2.4→v2.5 migration shim; `@deprecated` since v2.5.0, retired at v3.4.0). Package is unpublished with no consumers; completes the overdue deprecation. See ADR-0008.

## [3.4.0] - 2026-06-12

### Fixed

- **[SECURITY]** **security**: audit remediate P0/P1 — allowlist hardening, MCP security, dist sync, CI gates (#76)
- **[SECURITY]** **security**: remediate 10 audit verification findings (#75)
- **[SECURITY]** **security**: execSync → execFileSync + token exposure fix (#67)

### Added

- **githooks**: auto-sync README metrics in pre-commit so origin self-corrects
- **check**: auto-sync README metrics locally instead of blocking push
- **githooks**: add progress heartbeat to pre-push check
- **spec-lifecycle**: auto-mark specs as completed post-merge
- add runtime phase worker context control
- harden claude agents compatibility
- require complete evidence artifact provenance
- close workflow ssot and replay evidence gaps
- expand doctor health snapshot
- validate typed MCP capability outputs
- wire status commands to health snapshot
- produce review and test evidence artifacts
- write mutation evidence artifacts
- persist evidence artifacts and replay command
- implement evolution spec foundations
- **sdk-status-helpers**: add workNature-aware sequence selection (T4)
- **status-file-ext**: add work_nature to Loop fields extract/write/clear (T3)
- **state**: add work_nature to StatusFields with 'feature' default (T2)
- **schema**: add work_nature field and extend PhaseSchema for WorkNature phases (T1)
- **mcp**: add deprecation warning to forge_read script mode (REQ-06)
- **spec**: enhance validateTestability with verifiable assertion check (REQ-05)
- **ship**: block ship on stale review for non-.forge/ changes (REQ-03)
- **ship**: bind recordForceSkip to checkShipGateWithForceSkip (REQ-02)
- **execution-package**: introduce execution package context control (#85)
- **hooks**: restore partial spec remediation (#84)
- partial spec backlog remediation
- complete long-term audit evolution targets
- Claude Code 2.1.163 infrastructure hardening (#65)
- project charter system — anchor engineering constraints across specs (#64)
- adopt 8 GSD Core patterns — injection defense, context trimming, scientific debugging (#63)
- **review**: CE-Inspired review enhancement (Phase 1/2/3) (#62)
- **decide,spec**: add Reframing Gate & Clarification Gate for divergent thinking (#61)
- adopt superpowers best practices — CSO, rationalization, adversarial stance, plan gate, session hook (#59)
- **charter**: project charter for cross-spec engineering consistency (#58)
- **review**: CE-Inspired Review Enhancement — confidence anchoring, adversarial-check, validation pass, autofix (#57)
- **learn**: integrate gate feedback log analysis into learn workflow (#55)
- **decide,spec**: add Reframing Gate and Clarification Gate for divergent thinking (#54)
- adopt 2.1.158-161 borrows (hooks lifecycle, OTEL dims, spec audit, dead code cleanup) (#52)
- **deps**: adopt Claude Code 2.1.162 fixes — bump decide-teams CLI floor + MCP timeout (#51)
- **mcp**: add graceful shutdown to prevent orphan processes (#50)
- integrate 6 Matt Pocock skills-inspired enhancements (#49)
- **security-check**: add executable config-file dimension to Layer 3

### Changed

- **readme**: bump test count 7423 -> 7430
- remove i18n/locale infrastructure
- remove dead workflows-integration skeleton code
- sync README metrics
- update README metrics (624 test files, 7451 tests)
- **router**: add work_nature to status update fields + contract test (T6)
- **scripts**: migrate hook scanners to ESM syntax (#82)
- add partial spec remediation plan
- add audit remediation acceptance report
- split 4 large modules (P2-6) + manifest-driven build-dist.sh (P3-3) (#78)
- Phase 3 infrastructure improvements — shadow cleanup, CJK tokens, parity check, metrics (#74)
- **learn**: extract validation and feedback-analysis sub-modules (#70)
- regex caching + O(n³) → O(n) glossary conflict detection (#71)
- extract shared gate protocol for decide & spec (#60)
- extract shared gate protocol for decide and spec (#56)
- update README metrics to current values
- remove dead observability code + hooks test cleanup (#53)
- remove dead observability code (logger + performance-tracker) (#46)
- **hooks**: convert 17 hooks to args[] exec form + register 6 lifecycle hooks (#45)
- **readme**: update module/test metrics (267 modules, 7130 tests)

### Fixed

- **build**: drop stale locales copy from plugin dist bundle
- **check**: avoid re-running vitest in readme-metrics (pre-push hang)
- format hook-validator and rebuild skill manifest SHAs
- spec audit verification — hooks validation, SKILL.md sync, lint config (#92)
- expose typedoc referenced types
- **ci**: track multi-agent-review.js in git
- lint imports + update property tests for enhanced testability (REQ-05)
- **test**: update workflow-naming assertion + stale review preservation test (REQ-04)
- **test**: isolate fallback-ladder test from real .forge/reviews/ (REQ-01)
- restore resume phase coverage test + sync hook comment improvements (#86)
- shellcheck SC2155 — separate declare and export
- pre-push hook PATH, README metrics sync, ignore runtime artifacts
- make trace ids deterministic under rapid generation
- **audit**: remediate P2/P3 findings — HMAC, command counts, smoke tests, deps, CI (#77)
- **error-handling**: eliminate 149 empty catch blocks (#68)
- **cli**: remove empty bin + correct Forge Loop docs (#69)
- audit PR1 — test stability (tsx pin + race condition fix) (#66)
- **ci**: use CI-matching INDEX.md with only git-tracked specs
- **handoff**: section regex over-match & sync-derived-data gitignore conflict (#44)
- **pre-push-ci-check**: add --help with "Usage:" for scripts-help gate
- **bump-version**: make --help exit 0 with "Usage:" for scripts-help gate
- **pre-commit**: stop grep -c doubling "0" on zero matches
- **dist-resync**: clean stale dist/{src,test,scripts} before tsc to avoid TS5055
- **ci**: resolve three CI failures on main (#41)

## [3.3.1] - 2026-06-05

### Added

- **compatibility**: Claude Code version gate with semver parsing (`src/compatibility.ts`)
- **compatibility**: SessionStart bootstrap version diagnostic in `scripts/bootstrap-check.mjs`
- **compatibility**: Managed version setting `requiredMinimumVersion: "2.1.163"` in plugin.json
- **doctor**: Expanded `forge-doctor` with plugin health, hooks, commands, bin, and MCP checks
- **doctor**: Structured `--json` output with per-check id/status/message/fixHint
- **hooks**: Stop/SubagentStop `additionalContext` feedback (`scripts/stop-additional-context.mjs`)
- **hooks**: Registered SubagentStop event in `hooks/hooks.json`
- **session**: Session ID resolver with consistency checking (`src/session-id.ts`)
- **security**: Path equivalence guard with canonicalization (`src/path-equivalence.ts`)
- **security**: Sandbox/frozen-zone integration blocking `~`/`$HOME`/`${HOME}` bypass
- **mcp**: Process group reaping in `forge_exec` via `execCommandTracked()`
- **mcp**: ProcessRegistry cleanup on MCP server shutdown
- **docs**: Updated `docs/claude-code-compatibility.md` with v2.1.163 capability matrix

## [3.3.0] - 2026-06-01

### Added

- **hooks**: register phase transition guard in settings.json
- **hooks**: add phase transition guard and next-step protocol
- **loop**: retire legacy loop/SDK system (Wave 3 - Tasks 3.1-3.5)
- **loop**: rewrite loop skill instructions with native scheduling (Task 2.6)
- **loop**: add stopWhen conditional termination (Task 2.5)
- **loop**: add scheduling strategy with cache-aware scheduler selection (Task 2.4)
- **loop**: add three-strike failure detection and git rollback (Task 2.3)
- **loop**: add phase transition table with 26 tests (Task 2.2)
- **loop**: add loop state JSON schema with validation tests (Task 2.1)

### Changed

- **loop**: complete loop-native-fusion spec — spike findings, smoke tests, tasks.md
- add spec and decision docs, fix executable bit and README metrics
- regenerate SSoT embeds after loop-native-fusion merge
- regenerate SSoT embeds after loop-native-fusion merge
- correct README test file count 581→580
- sync README metrics after loop-native-fusion cleanup
- **types**: extract core shared types from loop-types.ts to src/types.ts
- sync README, docs/ metrics and subcommand table to project reality

### Fixed

- **test**: remove persistent-loop.sh from hook preservation snapshot
- **ci**: remove stale persistent-loop.sh hook reference + rebuild dist bundles
- **ci**: resolve typedoc warnings and remove deleted cli-flag-compat step
- **docs**: add @file and @module to typedoc blockTags
- **loop**: address all review P2/P3 findings
- **loop**: correct stopWhen test file header (review P1 fix)

## [3.2.0] - 2026-05-31

### Added

- **Release Automation** — `bump-version.mjs` 完整自动化发版流程
  - 支持 `patch` / `minor` / `major` 自动计算版本号
  - `--commit --tag` 一键完成：版本更新 → dist 重建 → commit → tag → push → GitHub Release
  - 自动调用 `gh release create` 创建带 compare link 的 Release
- **RTK Compression Engine Integration** — `forge-exec` 集成 RTK 压缩引擎，含 fallback ladder
- **bash-ban-raw Hook** — PreToolUse hook 拦截原始文件读取，引导使用 MCP 工具
- **Companion Tool Detection** — `scripts/` 新增 companion tool 可用性检测脚本
- **init Step 7 扩展** — 安装所有 token optimization companions
- **AUTOCOMPACT 阈值** — 设为 60%，优化上下文压缩触发时机
- **CI Pipeline Reliability Overhaul** — CI 流水线可靠性全面优化

### Changed

- **Plugin Config to Project-Level** — 所有配置迁移到项目级别，零全局副作用（`42fce2bb`）
- **Release Workflow Guide** — README 新增发版工作流指南

### Deprecated

- `forge_read_cached` MCP 工具和 cache 模块标记为 deprecated（Context Explosion Defense Layer 1 由平台内置能力替代）

### Fixed

- **[SECURITY]** Canvas HTML `$'` / `` $` `` 注入防护 via `replace()`（`9c198973`）
- Three-layer review P2 findings 修复（`7228a043`）
- CI 合约测试对齐项目级配置重构（#39, #40）
- CI `build-dist.sh` 排序修复 — 移至所有 sync 步骤之后
- CI `bundle-sync` freshness check 在 CI 中跳过（dist 刚重建）
- biome-purity 测试清理 + dist bundle 缺失脚本补全
- `init.sh` SC1083 lint 修复
- import 排序和 README 测试计数同步

## [3.1.0] - 2026-05-30

### Added

- **Multi-Agent Workflow System** — 完整的多 Agent 编排基础设施
  - `WorkflowDispatcher`：L0/L1 状态机，自动降级到 subagent 串行模式
  - `StreamJsonAdapter`：stream-json 协议适配，含部分消息合并、反压监控、`LineTooLargeError`
  - `CliSubprocessDriver`：claude CLI 子进程驱动，`--resume` 支持、stuck 超时检测、signal chain 记录
  - `IpcEmitter`：stdout NDJSON 协议 + IPC schema diff 兼容性工具
  - `WorkflowAuditWriter`：双写审计到 Forge audit zones
  - 退出码分类、指数退避、重试逻辑（`classifyExitCode`）
  - 并发桥接 `chunkedParallel` + 插件级 `workflows/` 目录和 manifest 字段
  - `multi-agent-review.js` workflow body 实现

- **Resilience Layer** — 生产级弹性保障
  - `RateLimitDegrader` 状态机 + HTTP 429 检测
  - `CleanupChain` 5 步清理 + 错误日志
  - IPC record-replay baseline + diff schema 增强
  - 25 个属性测试（每次 1000 轮）覆盖 dispatcher/audit-writer/stream-adapter/frozen-zone
  - CI 跨版本 workflow + `scan-recent-ci-logs` 脚本（21 个测试）

- **Sandbox Policy System** — 沙箱策略引擎
  - `checkFilesystemPolicy`：deny-priority glob 匹配
  - `checkCommandPolicy` + `checkNetworkPolicy`
  - `loadSandboxConfig` + `resolveProfile`
  - `sandbox.json` 模板 + `forge init` 集成生成
  - `--sandbox=off` 禁用开关

- **Ship Gates** — 发布门禁系统
  - 门禁类型定义 + 纯函数签名（TDD RED 阶段）
  - `checkReviewGate`、`checkTestGate`、`checkProgressGate` 实现
  - Fallback ladder、持久化、skip-gate 编排
  - P1 Fix Checklist 集成
  - `pending-findings` gate：未解决 P0/P1 时阻断 ship
  - `runAllGates` 集成到 `/forge ship` 流程

- **Spec Lifecycle Management** — 规格生命周期管理
  - `SpecStatus`、`SpecFrontmatter`、解析和校验
  - `rebuild-spec-index.mjs` CLI + 测试
  - 批量为 72 个 spec 添加 frontmatter，标记 12 个 deferred
  - Spec 模板 + frontmatter 生成
  - `--root` 标志 + 全量 `INDEX.md` 生成
  - CI spec index 一致性检查

- **Context Explosion Defense** — 五层上下文爆炸防御
  - Layer 1：Read cache index + hash/diff 计算 + `forge_read_cached` MCP 工具
  - Layer 2：`track-read-budget` PostToolUse hook + SessionStart 重置
  - Layer 3：Phase Boundary Gate（build/review/test 指令）
  - Layer 4：`inject-plan-context` 支持 `--phase` 和 `--compact`
  - Layer 5：Review subagent 结果返回协议

- **Review Pipeline Enhancements** — 评审流水线增强
  - Post-review pipeline：auto-fix、simplify、from-pr 三种模式
  - 截断检测（`detectTruncation` 纯函数）+ 截断触发的串行重试
  - Per-agent `maxTurns` 匹配 agent 定义
  - 结构化报告模板（spec-check / quality-check / security-check）
  - Ultrareview per-file findings + `--strict` 模式

- **Hooks v2.1.153** — 全套生命周期 hook 支持
  - 新增生命周期事件：`SessionStart`、`MessageDisplay`、`PreCompact`、`CwdChanged`、`FileChanged`
  - `ConfigChange` hook：配置文件变更感知
  - `PermissionDenied`、`StopFailure` 生命周期 hook
  - `WorktreeCreate`/`WorktreeRemove` 生命周期 hook
  - `TaskCreated` 生命周期 hook
  - `terminalSequence` 桌面通知
  - 6 个命令 hook 迁移到 exec form（args[]）
  - `duration_ms` 追踪集成到 check-context-boundary

- **Observability** — 可观测性
  - OTEL 数据分析集成到 `/forge learn`
  - PostToolUse `duration_ms` 追踪 hook

- **Decide Auto Dispatch** — 基于 tier 的自动分发模式
  - `decide_dispatch_mode: auto` 根据 tier 自动选择执行策略
  - init 模板更新支持 auto dispatch

- **`/goal` Mode** — TDD 目标循环模式
  - `/forge build` 新增 `/goal` 模式，支持 TDD 循环
  - `build.use_goal` 配置选项

- **Compact Strategy** — 上下文压缩策略优化
  - Restate reminder：snapshot + 10k-char 上限
  - Inter-phase + intra-build wave-boundary auto-compact
  - `serializePendingFindings`：压缩前持久化 P0/P1

- **Context Optimization** — 上下文优化
  - Lean evolved-rules injection：~16KB → ~1.7KB（仅注入 Content 行）
  - Findings-only subagent output：review subagent 仅返回发现
  - Decide Round 1 perspective 输出到文件，上下文仅保留摘要

- **cmux Integration** — tmux 多窗口集成增强
  - `--window` 注入 + `hook-notify.sh` jump-to-unread
  - Config doctor 集成到 bootstrap-check
  - Conditional Availability Gate（cmux-gate 模块）
  - 3 个 skills 迁移到 collapsed path + dispatcher allowlist 扩展（29→32）

- **Plugin Marketplace Preparation** — 市场发布准备
  - `userConfig`、`marketplace.json`、exec form hooks
  - `forge-doctor` 健康检查脚本
  - MCP `maxResultSizeChars` 元数据
  - Persistence：plugin 缓存迁移到 `CLAUDE_PLUGIN_DATA`
  - Bundle sync guard：completeness + freshness 检查

- **Agent Hardening** — Subagent 安全加固
  - Frontmatter 新增 `disallowed-tools`、`memory`、`initialPrompt`、`effort`

- **CI Improvements** — CI 改进
  - `SANDBOX_FAIL_IF_UNAVAILABLE` 环境变量控制 plugin-validate
  - Node 18/22 跨版本兼容性修复
  - Workflow Dispatch sections 嵌入到 review/decide/learn/ship 指令

### Changed

- Constitution 新增 §2.7 No Confirmation Between Steps（铁律）、§2.8 Scripts as Black Box（铁律）
- Constitution §3.1 Execution-Assessment Separation 新增 L0→L1→L2→L3 fallback ladder + L3 阻断 ship
- Agent Teams 在 decide/review 中定位为可选 Tier-1 模式（非默认，非替换 Subagent）
- Hooks `if:` 条件过滤减少不必要进程启动
- Compact hook 语义从 blocking 改为 snapshot+restore+reminder
- 9 项 Claude Code 平台优化收集到 docs

### Fixed

- **[SECURITY]** `execSync` → `execFileSync` 防止命令注入（docs-governance、hooks）
- **[SECURITY]** MCP cache path traversal 漏洞修复
- Node 18/22 跨版本兼容性（contract scripts、tool-health tests、baseline fixtures）
- `/forge loop` 中 `build.use_goal` 配置键名修正
- `/goal` 模式在 persistent-loop 中正确跳过 TDD 注入
- 25 个失败测试 + 2 个 lint 错误修复
- 10 项 P0/P1 review 发现修复（3-layer review）
- `disallowed-tools` → `disallowedTools` camelCase 修正
- PreCompact hook 对齐 snapshot+restore 语义
- Spec index 重建 `--check` 模式缺失 INDEX.md 时自动生成

### Removed

- Project-level Status Line feature（§73，平台限制不可靠）

## [3.0.0] - 2026-05-26

### Changed

- Major version bump reflecting multi-agent workflow architecture and sandbox policy system introduction.

## [2.7.0] - 2026-05-25

### Added

- **Docs Governance System**: 五层文档治理系统（分类隔离、自动索引、过时检测、配额纪律、SSOT 嵌入）
- 13 个 CLI 脚本（9 个检查器 + 2 个构建器 + 2 个迁移工具）+ `npm run docs:check` 聚合命令
- Pre-commit hook 决策树：根据变更路径自动选择运行的检查器
- CI workflow (`.github/workflows/docs-governance.yml`)：push/PR 自动检查
- SSOT 嵌入机制：`docs/_ssot/` 数据源 + 5 个渲染器（commands-table、routing-table、security-tiers、json-list、count）
- 4 个初始 SSOT 数据源：commands、routing、security-tiers、gate-skills
- Biome `noRestrictedImports` 规则：禁止 generator/renderer 中导入 child_process
- `/forge learn` 文档治理预检：自动运行 quota/staleness/links 检查器
- `docs/reference-docs-governance.md` + EN mirror：完整参考手册
- `src/docs-governance/reporter/learn-docs-check.ts`：可编程的治理检查 wrapper

### Changed

- README.md / docs/INDEX.md 中的硬编码命令数量替换为 SSOT 嵌入指令
- `.forge/config.md` 新增 `docs.grace_period_until`、`docs.ssot_sources` 字段
- `src/docs-governance/ssot/embed-parser.ts` 支持单行嵌入指令（begin/end 同行）
- `src/docs-governance/ssot/ssot-loader.ts` 支持 JSON 自动解析
- `docs/forge-constitution-detail.md` 新增 §8 文档治理章节

## [2.6.0] - 2026-05-18

### Added

- `/forge init` 子命令：plugin 用户可像调用其他 SKILL 一样初始化项目，无需手动定位 init.sh
- `skills/forge/lib/init/instructions.md` — init 作为 inline sub-skill 通过 dispatcher 正常路由（方案 C，符合 ADR-0004）
- SessionStart bootstrap 引导：plugin 已激活但项目未初始化时，自动提示运行 `/forge init`
- `scripts/bootstrap-check.mjs` — 纯函数 `shouldShowBootstrap` + SessionStart hook
- `src/forge-root-resolver.ts` — 纯函数 `resolveForgeRoot`，plugin > script-relative > global 三阶优先级
- `init.sh` 检测 `${CLAUDE_PLUGIN_ROOT}` 环境变量，正确解析 plugin 模式资源根
- Dispatcher allowlist 扩展至 30 个子命令（新增 `init`）

### Changed

- 14 个 SKILL 的 Edge Cases 文案：`forge init` → `/forge init`，与新入口对齐
- `commands/forge.md` 恢复为 thin stub（≤13 行），符合 ADR-0004 约束
- `dist-plugin/` 构建脚本同步 `bootstrap-check.mjs`、`inject-evolved-rules.mjs`、`inject-plan-context.mjs`

### Fixed

- `dist/claude-code/bundles/forge/dist/src/check-frozen.js` 缺失导致 contract 测试失败
- `commands/forge.md` 子命令分发表违反 ADR-0004 thin stub 约束（8 个 single-entry 测试失败）
- `dist-plugin/scripts/bootstrap-check.mjs` 未同步导致 plugin 模式 bootstrap 引导不生效

## [2.5.0] - 2026-05-17

### Breaking Changes

- **Single-Entry Command Consolidation** — 28 个 `/forge-<sub>` slash command 收敛为 `/forge` 单入口 (ADR-0003)
  - 所有子命令改为 `/forge <subcommand>` 路由分发（如 `/forge build` 而非 `/forge-build`）
  - 删除 27 个 `commands/forge-*.md` wrapper 文件
  - 修复 `commands/forge.md` 内 `Skill(skill="forge", args="...")` 伪调用语法（调不到任何 skill）
  - `gen-plugin-commands.mjs` 改为 single-entry mode（不再生成 wrapper）
  - 迁移表：

    | 旧调用 | 新调用 |
    |--------|--------|
    | `/forge-plan` | `/forge plan` |
    | `/forge-build` | `/forge build` |
    | `/forge-review` | `/forge review` |
    | `/forge-test` | `/forge test` |
    | `/forge-ship` | `/forge ship` |
    | `/forge-learn` | `/forge learn` |
    | `/forge-decide` | `/forge decide` |
    | `/forge-spec` | `/forge spec` |
    | `/forge-debug` | `/forge debug` |
    | `/forge-loop` | `/forge loop` |
    | `/forge-status` | `/forge status` |
    | `/forge-resume` | `/forge resume` |
    | `/forge-abort` | `/forge abort` |

  - 升级 plugin 后请重启 Claude Code 让命令面板刷新
  - 参见 `.kiro/specs/single-entry-command-consolidation/`

- **Skills Collapse & Dispatcher** — 29 个 `skills/forge-*/SKILL.md` 迁移到 `skills/forge/lib/<sub>/instructions.md`，`forge` 成为唯一注册 skill (ADR-0004)
  - Plugin manifest 注册 1 个 skill (`forge`)，通过 9-step dispatcher 分发到 29 个 lib sub-skill
  - 新增 `src/forge-dispatcher.ts` (9-step chokepoint)、`scripts/regen-skill-registry.mjs` (TOML)、`scripts/build-lib-manifest.mjs` (SHA-256 manifest)
  - `commands/forge.md` 降级为 ≤25 行 thin stub，透传 `Skill(forge)`
  - Fork/inline dispatch: 18 fork (Agent tool) + 11 inline (Read + execute)
  - 迁移脚本 `scripts/migrate-skills-to-lib.mjs` 含 4-pattern cross-ref rewrite
  - 参见 ADR-0004、`.kiro/specs/forge-single-entry-skills-collapse/spec.md`

### Added

- **Forge Slimming Plan (T1/T2/T3)** — delegate overlapping capabilities to Claude Code native commands
  - T1: teams/ cleanup verified, command count aligned to SST=22, archive audit script, v2.3 observability sync
  - T2: `/forge recap` delegates to `/compact`+`/context`; `/forge resume` delegates to `/resume`; `/forge abort` narrowed to archive+reset; `/forge learn` deduplicates with Auto_Memory; `/forge review` adds `--delegate-quality`/`--delegate-security` flags
  - T3: `forge-mutate` pack-conditional registration (requires `mutation_critical_modules` flag); gate skill boundary clarification; usage metrics pipeline for R14/R16 evaluation
  - New scripts: `audit-archive-candidates.mjs`, `metrics-recorder.mjs`, `aggregate-metrics.mjs`, `validate-gate-boundary.mjs`
  - `gen-plugin-commands.mjs` now supports `--verify-count` (CI) and `--stamp-count`
  - Forge Loop repositioned as "autonomous execution with engineering discipline"
  - Deviation record: SST=22 within 18-22 target, R14/R16 evaluations pending 14-day metrics
- **`/forge resume --from-pr`** — one-command recovery from a Pull Request. Accepts GitHub/GitLab/Bitbucket URLs or bare PR numbers. Auto-resolves the associated Forge spec slug from PR metadata (title prefix, branch name, description link, or ADR), loads the full context bundle (spec/plan/progress/reviews), and updates `.forge/status.md`. Requires Claude Code 2.1.29+ for CC session recovery; falls back to Forge-only state recovery on older versions. See `scripts/resume-from-pr.mjs` and `skills/forge/lib/resume/instructions.md` §5.
- **CI UltraReview 集成** — 每个 PR 自动触发 `claude ultrareview` AI 评审
  - 新增 `scripts/run-ci-ultrareview.sh` 封装 CLI 调用、JSON 解析、artifact 生成
  - 新增 `.github/workflows/ultrareview.yml` CI workflow（PR 触发、artifact 上传、PR 评论）
  - 新增 `templates/review-ci.md.tmpl` 标准化评审产物模板
  - `skills/forge/lib/review/instructions.md` 新增 CI 证据接入步骤和 `[confirmed-by-ci]` 前缀规则
  - `scripts/init.sh` 新增 CI AI 评审启用交互提示
  - 详见 `docs/ci-ultrareview-usage.md`
- **Plugin Distribution** — Forge 可通过 `claude plugin install forge` 安装，支持自动更新和版本锁定
  - 新增 `.claude-plugin/plugin.json` 和 `.claude-plugin/marketplace.json`
  - 新增 22 个 slash command wrappers（`commands/*.md`） (historical: replaced by single-entry model in v2.5.0)
  - 新增 `scripts/gen-plugin-commands.mjs` 自动生成命令文件
  - 新增 `test/plugin-manifest.test.ts`（12 tests）
  - `scripts/build-dist.sh` 新增 `dist-plugin/` 输出
  - CI 新增 `plugin-validate` job
  - `/forge status` 新增 clone + plugin 冲突检测
  - README 新增方式三 Plugin 安装和迁移指南
  - 参见 `.kiro/specs/plugin-distribution/feasibility.md` Phase A 可行性报告
- **CCBP Hardening Phase 2** — compaction protection + agent frontmatter + dispatcher + rules + version gate
  - `[ADDED]` `scripts/hook-precompact.sh` + `scripts/hook-postcompact.sh` — compaction boundary state protection
  - `[ADDED]` `.claude/hooks/scripts/dispatcher.sh` — unified 6-event dispatcher
  - `[ADDED]` 3 lazy-loaded rules: `.claude/rules/forge-src.md`, `skill-editing.md`, `branch-protection.md`

### Changed

- **归档流程增加 CC transcripts 清理**（ADR: `.forge/decisions/2026-05-12-cc-purge-integration.md`）
  - 新增 `scripts/archive-spec.sh`：归档 spec/plan/progress 到 `.forge/archive/<date>-<slug>/` 并可选清理 Claude Code 项目状态
  - 支持 `--purge-cc=ask|skip|auto`（默认 ask，交互两次确认）
  - 生成 `purge-manifest.json` 记录 dry-run 预览、用户决策、执行结果
  - 安全保护：黑名单路径拒绝、worktree 路径解析、CC 版本检测降级
  - 需要 Claude Code >= 2.1.126（低版本自动跳过并 warning）
  - 47 项 bash 测试覆盖所有分支
- **CCBP Hardening Phase 2** — Hooks `if:` conditional filtering + agent frontmatter improvements
  - `[CHANGED]` hooks.json: added `if:` filters to 5 PreToolUse/PostToolUse entries to skip irrelevant tool calls
  - `[CHANGED]` agent frontmatter: forge-build gets `hooks: {Stop}` (CI allowlist) + `isolation: worktree`; forge-ship gets `hooks: {PreToolUse}` (branch protection); forge-plan gets `initialPrompt`
  - `[CHANGED]` CC minimum version bumped to 2.1.121 (recommended ≥2.1.138) — `scripts/init.sh` version gate
- **Structured Frozen-Zone Feedback** (ADR-0001: Frozen-Zone Protection — Migrate from Exit-Code Blocking to Structured JSON Feedback)
  - PreToolUse hook returns structured JSON diagnostic on frozen-zone violations
  - PostToolUse defence-in-depth hook detects breaches and emits warning
  - Zone_Registry reads from `.forge/config.md` at runtime
  - Audit logging to `.forge/runs/*-frozen-events.jsonl` with rotation
  - `/forge status` shows frozen-zone activity summary
  - Feature flag `FORGE_STRUCTURED_FROZEN=1` (default); set to `0` for legacy mode
  - Requires Claude Code 2.1.121+ for PostToolUse; PreToolUse works on 2.1.10+

### Fixed

- **Evolved Rules Integration & Retirement (2026-05-10 session)** — R1-R9 分类融入基础设施或留在 evolved-rules
  - R1-R4 退役到 `.forge/knowledge/solutions/evolved-rules-retired.md`（已永久融入 CLAUDE.md / SKILL.md / hooks）
  - R5 (Implicit Idle) 融入 `skills/shared/next-step-protocol.md` 新增"三种违规形态"表
  - R6 (Claimed New File Existence) + R7 (Pack/Loader Integration Evidence) + R8 (Stub Detection) 融入 `.claude/agents/spec-check.md` 新增 Check Items 3a/5/6 + 扩展 Severity Judgment 表
  - R7 对应的 Plan 任务模板融入 `skills/forge/lib/plan/references/atomic-task-format.md` 新增"Pack Data Task Integration Test Requirement"章节
  - R9 (Lint 严格度分层) 固化到 `CONTRIBUTING.md` 新增"Lint Strictness Layering"章节
  - `.forge/knowledge/evolved-rules.md` 活跃规则由 9 条精简至 5 条（R5/R6/R7/R8/R9 重编号为 R1-R5），每条新增 `Infra_Ref` 字段指向落地位置

- **Legacy biome 存量清理 (2026-05-10 session)** — 全仓零 lint 告警
  - 修复 4 errors（format + import 排序）+ 116 warnings + 13 infos
  - 手工修复源码 9 处 `!` non-null assertion → null-check + early return
  - 手工修复测试 12 处 `as any` → `MirrorDaemonStartResult` discriminated union（新增 `test/cmux-mirror/types.ts`）
  - 手工修复 4 处其他 `any` → 精确类型或 `unknown` + narrowing
  - 修复 `test/cmux-mirror/cmux-json-schema.test.ts` non-null-asserted-optional-chain
  - 清理未使用类型定义 `Action` in `test/cmux-mirror/session-totality.property.test.ts`
  - `biome.json` test override 追加 `noNonNullAssertion: "off"`（测试代码语义等价于 `expect(...).toBeDefined()`）
  - README.md 指标同步：模块 126→134、测试文件 257→267、属性测试 129→132、总测试 4184→4691
  - 6 个 skill 标记 `skeleton_exempt_legacy: true`（forge-pack + 5 个 utility skill）
  - 3 个 skill description 重写满足 2 句 + 祈使动词首句规则（forge-mutate、forge-pack、forge-storm）

- **Sprint 3 Gap Remediation** — Fixes from 2026-05-10 audit
  - Merged `business-analyst.md` agent definition to main branch (Three Amigos collaboration now works)
  - Glossary parser now supports aggregated YAML format (PMS Pack glossary loads 111 terms)
  - `loadOwnershipMap` no longer a stub — reads `.forge/context-ownership.yaml` for real boundary checks
  - 3 new Bonvoy loyalty scenarios in `pms-marriott-sample` (NoShow forfeit, tier amenity, points+cash)
  - Lint rule form clarified via requirements amendment (YAML declarative, not Biome plugin)
  - Audit findings archived (`.forge/findings/` + `.forge/decisions/`)
  - Evolved rules R6/R7/R8 added for review blind-spot prevention

### Added

- **Evolved Rules Automation Infrastructure (补强 1/2/3)** — 规则演化模型闭环自动化
  - **补强 1 (Staleness Auto-Detection)**: `src/evolved-rules-staleness.ts` 纯函数 + `scripts/flag-stale-evolved-rules.mjs` CLI。扫描 `.forge/runs/` session 目录 mtime，对 >= 5 sessions 未触发的规则自动标记 `stale_flags` frontmatter。通过 Stop hook 每会话执行。
  - **补强 2 (Rule Violation Counter)**: `src/evolved-rules-violations.ts` 纯函数 + `scripts/record-evolved-rule-violation.mjs` CLI。扫描最近 24 小时内的 `.forge/runs/`、`.forge/progress/`、`.forge/reviews/` 内容，匹配 R1-R5 的 violation/guard 模式，自动更新 `Last_triggered` 字段。通过 Stop hook 每会话执行。
  - **补强 3 (Infra_Ref Back-Validation)**: `src/evolved-rules-infra-refs.ts` 纯函数 + `scripts/verify-evolved-rule-infra-refs.mjs` CLI。解析每条规则的 `Infra_Ref` 字段，验证引用的文件与 section 在主分支仍存在。纳入 `npm run check` 和 CI，基础设施损坏立即 fail。Dogfooding 时抓到 1 个真实 Infra_Ref 漂移（R1 的 "§规则 3" 应为 "§三种违规形态"）。
  - 37 个新单元测试全绿（13 staleness + 11 violation + 13 infra-refs）
  - 规则演化模型现闭环：观察 → evolved-rules → 自动触发计数 → 自动 staleness 标记 → 人工决策融入/退役 → Infra_Ref 自动守护

- **PMS Domain Pack v1.0** — Hotel PMS domain knowledge pack
  - 8 Bounded Contexts with context map (10 edges)
  - Context-specific glossary (9 files, 12+ terms each, Chinese aliases)
  - 4 state machine YAML definitions (reservation, folio, room-status, housekeeping-task)
  - 20 Gherkin scenarios across 5 categories (check-in, check-out, night-audit, reservation, folio)
  - Banned patterns for PMS (4 categories: code/infrastructure/framework/technical)
  - BusinessDayClock utility with DST support (32 tests, 3 timezones)
- **State Machine Engine** (`src/state-machine/`) — YAML loader, ST001-ST005 validator, property test derivation
- **Forced Acceptance Gate** (`src/accept-gate.ts`) — Pack-driven ship blocking for critical contexts
- **Mutation Testing Engine** (`src/mutate.ts`) — Stryker.js integration with pack-driven module targeting
- **Micro-Review Engine** (`src/build-micro-review.ts`) — Task-level spec alignment check after each atomic task
- **IRON-LAW / HARD-GATE XML tags** — Semantic markers for AI agent compliance
- **`scripts/check-iron-laws.sh`** — Uniqueness validation for iron law and hard gate names
- **Rationalization Catalog expansion** — 15+ entries in 5 categories in `tdd-rules.md`
- **`scripts/init.sh --pack`** flag — Enable domain packs during project initialization
- Sprint 2 zero-pack regression tests and PMS integration tests (24 new tests)
- R4 rule in `evolved-rules.md`: "SKILL Reload After Context Recovery" — requires
  re-reading the current phase SKILL.md after context compaction or session resume.
- `forge-resume` SKILL Reload Step: mandatory SKILL.md re-read after recovery for
  all phases (not just build).
- Compaction Recovery Check paragraphs in forge-ship, forge-review, forge-test,
  forge-learn SKILLs: self-check points for post-compaction execution.
- Stop hook (`persistent-loop.sh`) now covers 6 auto-advance scenarios:
  plan→build (Case 5), build→review (Case 6), review→test (Case 7),
  test→ship (Case 8), ship→learn (Case 9), and loop iteration handoff (Case 10).
  These detect phase completion via `.forge/` state and inject command-style
  instructions to resume the pipeline.
- `checkPlanStructure()` in `src/plan.ts`: evaluates plan structure for split
  trigger conditions (task count > 15, multiple Sprint headings, delivery task
  names, chained Sprint dependencies).
- Plan Structure Check integrated into `forge-plan` Self-Check (Step 4a) with
  acknowledge/split user interaction.
- R3 rule in `evolved-rules.md`: "Sprint Is Not Phase Boundary" — injected at
  every session start via SessionStart hook.
- Stop hook dedupe mechanism: 60s TTL prevents repeated injection on same
  phase state; stale markers (>24h) auto-cleaned.
- `scripts/lint-evolved-rules.mjs`: validates `rule_count` frontmatter matches
  actual rule heading count.

- **ADR Registry** (Requirement 1): canonical `.forge/decisions/ADR-NNNN-*.md` records with `/forge decide` auto-numbering via `nextAdrId`, auto-updated `.forge/knowledge/adr-index.md`, supersession tracking, and related-ADR matching via Jaccard similarity. Template at `.forge/decisions/ADR-TEMPLATE.md`.
- **Security posture documentation** (Requirement 6):
  - README "🛡️ 安全与信任" section listing the 5-layer defense model.
  - `SECURITY.md` with private disclosure channels, SLA (≤3 days acknowledgement / ≤14 days critical fix), supported versions and `[SECURITY]` entry format.
  - CI `security-audit` job running `npm audit --audit-level=high` and `scripts/check-deps.mjs` on every PR, plus a nightly cron on `main`.
  - `scripts/check-deps.mjs` scanner: typosquatting allowlist, exact-version pin enforcement for runtime deps, license compatibility check.
  - `CONTRIBUTING.md` "安全贡献指南" section covering secret/PII handling, shell command construction, dependency review checklist, and ADR-required files.

### Changed

- **Runtime dependency pinning**: `minimatch` pinned to exact version (`10.2.5`) per supply-chain policy. Open ranges no longer allowed for any entry under `dependencies`.
- **Protected zone rules** (`.forge/config.md`): `.forge/decisions/ADR-*.md` moved to Guarded zone (append-only; supersession re-renders frontmatter). Non-ADR decision transcripts (`.forge/decisions/[0-9]*.md`) remain Open zone.

## [2.3.0] - 2026-04-28

### Added

- **Spec 导入模式**：`/forge spec <file-path>` 支持从外部规格文档导入并转化为 Forge 格式
  - 开发者可将产品经理交付的 spec 文档放入 `.forge/inbox/`，通过 `/forge spec .forge/inbox/xxx.md` 导入
  - 导入后自动执行转化 → Review（五项自检）→ Lock 流程，复用现有规格引擎的全部质量保障
  - 转化规则：提取目的/需求/场景/不做什么/Delta，将验收标准适配为"当...则..."格式，自动去除实现细节
  - `SpecFrontmatter` 新增 `importSource` 字段记录原始文件路径，便于追溯
  - 新增 4 个导入边界情况处理：文件不存在、无法提取需求、原文包含实现细节、与已有 spec 冲突
- **`.forge/inbox/` 目录**：外部规格暂存区，开发者放置 PM 交付的 spec 文档供导入使用
- **`createImportedSpec()` 纯函数**：`src/spec.ts` 新增导入模式创建函数，支持 forge-loop 自主执行引擎调用
- **Property 8 测试**：`test/spec.property.test.ts` 新增 5 个属性测试覆盖导入模式的 draft 状态、brownfield Delta 兼容性、confirm/reject 兼容性和 testability 兼容性

### Changed

- `templates/config.md` 开放区新增 `.forge/inbox/` 目录说明

## [2.2.0] - 2026-04-26

### Added

- **npm 公开发布支持**：`forge-loop` 现可通过 `npx forge-loop "目标"` 一行命令使用，无需克隆仓库手动编译
  - `package.json` 配置 `files: ["dist/src/"]`，仅发布编译后的运行时源码
  - 包名从 `forge` 改为 `forge-loop`，与 CLI 命令名一致
  - `private` 设为 `false`，允许 npm 公开发布
- **CI npm publish job**：`.github/workflows/ci.yml` 新增独立 `publish` job，Git tag `v*` push 时自动发布
  - 发布前执行完整的 typecheck → test → tsc 编译流水线
  - 使用 `NPM_TOKEN` secret 认证 npm registry
- **parseListSection 正则特殊字符 property-based 测试**：
  - Property 1：regex special character round-trip（`formatListSection` → `parseListSection` 往返一致性，200 次迭代）
  - Property 2：non-matching title with special characters returns empty array（200 次迭代）

### Fixed

- **`parseListSection` 正则转义替换字符串**：`String.prototype.replace` 的替换字符串从错误的 UUID 值修正为标准的 `"\\$&"` 反向引用模式，修复含正则特殊字符（`(`, `)`, `[`, `]`, `+`, `*` 等）的 section title 无法正确解析的问题

## [2.1.1] - 2026-04-26

### Changed

- **CI Actions 升级至 Node.js 24 运行时**：`actions/checkout` v4→v5、`actions/setup-node` v4→v6，消除 GitHub Actions Node.js 20 弃用警告
- **CI 构建 Node.js 版本升级**：20→22（当前 LTS）
- **README 新增 Forge Loop 章节**：完整介绍自主执行引擎的架构、工作流程、安全机制和 CLI 用法；更新 `src/` 目录结构，列出所有 Loop 相关模块
- **文档审计与修正**：
  - README：属性测试文件数 32→36、覆盖率数据更新为实际值（90.47% statements / 92.16% branches / 98.72% functions）
  - README：scripts/ 列表补全 `auto-resume.sh` 和 `persistent-loop.sh`；src/ 列表补全 `check-frozen.ts` 和 `loop-index.ts`
  - README：冻结文件保护说明修正为调用 `check-frozen.js`（非 `.sh`）
  - ROADMAP：v2.1 已完成列表补充 Forge Loop、回滚安全网、权限绕过文档化；v2.2 移除已完成项

### Fixed

- **Shellcheck 合规**：修复 4 个脚本共 7 处 shellcheck 警告
  - `auto-resume.sh` / `persistent-loop.sh`：`ls -t *.md` 替换为 `find + xargs ls -t`（SC2012）
  - `init.sh`：移除多余 `echo` 包裹（SC2005）；`A && B || C` 重写为 `if/then/else`（SC2015）
  - `install-dist.sh`：`${f#${BUNDLE_DIR}/}` 内层变量加引号（SC2295）

## [2.1.0] - 2026-04-26

### Added

- **Restatement Checkpoint 机制**：build 阶段新增周期性上下文刷新，对抗长任务中的注意力衰减
  - 可配置的 `restatement_interval`（默认 3，范围 2–10），每 N 个任务触发一次 Checkpoint
  - 异常触发：Subagent 返回 BLOCKED/NEEDS_CONTEXT/DONE_WITH_CONCERNS 时立即执行
  - 中间会话日志（`sessions/*-interim.md`）支持 `/forge resume` 精确恢复
  - 失败重试 Restatement：TDD GREEN 阶段失败时，重试前强制重申上下文，防止机械重复
  - 轻量路径完全排除 Restatement（改动足够小，无注意力衰减风险）
- **CI 验证范围扩展**：新增 shellcheck 静态分析、`hooks.json` JSON schema 验证、`SKILL.md` frontmatter 完整性检查
- **`install-dist.sh` 路径安全校验**：拒绝空路径和危险系统路径（`/`、`$HOME`、`/usr` 等），防止误操作
- **`init.sh` 增强**：新增 `handoffs/` 目录创建；从模板复制 `metrics.md` 和 `tool-health.md`；hooks 合并失败时提供详细的手动操作指引
- **`state.ts` 受保护区写入提示**：`checkWritePermission` 对 guarded zone 返回追加操作提示，而非静默放行
- **CLAUDE.md 模板新增 §2.5 上下文刷新纪律**：将 Restatement 规则写入项目宪法
- **`config.md` 模板新增 `restatement_interval` 配置项**

### Changed

- **`check-frozen.sh` 重写为 TypeScript 优先**：shell 脚本改为 thin wrapper，优先调用编译后的 `check-frozen.js`；fallback 保留原有 shell 解析逻辑
- **冻结文件保护改为硬阻断**：`check-frozen.sh` 对 locked/approved 文件以 `exit 1` 阻断写入（原先仅打印警告）
- **Hooks 升级**：Write/Edit hook 从 shell 脚本切换到 Node.js 调用；新增 Bash 工具的冻结文件保护 hook
- **CI `sync-dist` 改为 `verify-dist`**：不再自动提交 dist 变更，改为校验失败时报错，要求开发者本地构建后提交
- **`/forge resume` 增强**：优先读取 `*-interim.md` 中间日志恢复上下文；恢复后首次派发 Subagent 前立即执行 Restatement Checkpoint
- **`forge-build` 流程图更新**：标准路径和全量路径流程图增加 Restatement 循环和异常触发分支

### Fixed

- `install-dist.sh` 修复 `--target ""` 空路径导致的潜在危险操作

## [2.0.1] - 2026-04-24

### Changed

- **Agent frontmatter 全部使用 `model: inherit`**：移除硬编码的 `haiku`/`sonnet`，改为继承会话模型，兼容所有 coding plan（官方、Bedrock、Vertex、API key）
- **移除 Codex 平台支持**：Forge 专注于 Claude Code 单平台，移除 `dist/codex/`、install 脚本中的 codex 选项、README 中的 Codex 引用
- `install-dist.sh` 简化为无需 `--platform` 参数（保留向后兼容，传 `--platform claude-code` 仍可工作）

### Removed

- `dist/codex/` 目录及相关构建逻辑
- README 中所有 Codex 相关的安装说明和前置条件

## [2.0.0] - 2026-04-24

### Added

- **分发模型**：新增 `dist/` 目录结构，支持 Claude Code 分发包
  - `scripts/build-dist.sh`：从源定义构建平台适配的分发包
  - `scripts/install-dist.sh`：支持 `--platform`、`--dry-run`、`--backup` 的安装脚本
  - 每个分发包含平台特定的 `INSTALL.md`
- **已知失败模式**（`known-failures.md`）：记录反复出现的失败模式，供 `/forge debug` Phase 2 自动搜索和 `/forge build` 探针阶段回流
- **会话日志**（`sessions/`）：每次 `/forge learn` 写入简洁的会话摘要，供 `/forge resume` 恢复上下文
- **项目类型路由**：`classifyTask` 新增可选的 `ProjectContext` 参数，brownfield 项目触碰现有模块时 light 自动提升为 standard
- **知识库验证脚本**（`scripts/validate-knowledge.sh`）：5 项健康检查（文档数量、低置信度、frontmatter 完整性、known-failures 存在性、sessions 日志）
- **`/forge abort` 命令**：安全中止当前任务，归档状态到 `.forge/archive/`，重置 `status.md`

### Changed

- 前置条件从"仅 Claude Code"扩展为"Claude Code 或 Codex"
- 安装方式新增分发包安装路径（推荐），保留直接克隆方式（开发者）
- `.forge/knowledge/` 目录结构扩展：新增 `known-failures.md` 和 `sessions/` 子目录
- 状态文件保护分区：`known-failures.md` 加入受保护区（可追加，不可删除）
- `/forge debug` Phase 2 新增已知失败模式搜索步骤
- `/forge learn` 新增 §8.5（已知失败模式记录）和 §8.6（会话日志）

## [1.1.0] - 2026-04-24

### Added

- **`src/review.ts`**：评审引擎核心逻辑（置信度过滤、去重合并、跨评审者一致性提升、报告质量门 6 项检查）
- **`src/debug.ts`**：调试引擎核心逻辑（假设验证升级、假设完整性校验、四阶段状态机）
- **`test/review.property.test.ts`**：19 个 PBT 测试
- **`test/debug.property.test.ts`**：19 个 PBT 测试

### Fixed

- `generateKnowledgeDocument` 新增 `sanitizeDate` 日期 round-trip 验证，非法日期 fallback 到 `1970-01-01`
- `package.json` 依赖版本从 `^` 范围锁定为精确版本

## [1.0.0] - 2026-04-24

### Added

- 初始发布
- 13 个命令覆盖完整开发生命周期（router、decide、spec、plan、build、review、test、ship、learn、status、resume、debug、abort）
- 三级路由自动匹配任务复杂度（light / standard / full）
- 统一状态目录 `.forge/`，含文件保护分区（冻结 / 受保护 / 开放）
- 7 个 Subagent 角色 + 2 个 Agent Team 配置
- 4 个 Claude Code Hooks
- 交互式项目初始化脚本 `scripts/init.sh`
- 10 个 src/ 纯函数模块 + 133 个 PBT 测试
- CI：TypeCheck + Lint + Test 三重门禁
