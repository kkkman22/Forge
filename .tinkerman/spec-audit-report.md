# Spec 核对报告

> 生成时间: 2026-06-03
> 核对范围: .kiro/specs/ + .tinkerman/specs/（104 个唯一 spec）
> 方法: 13+1 并行只读 auditor agent 对照当前真实文件验证

## 总览

| 结果 | 数量 | 含义 |
|------|------|------|
| ✅ 满足 | 70 | 核心交付物在当前代码/文档中可验证存在 |
| 🟡 部分满足 | 20 | 主体已实现，但有具体、可修补的缺口 |
| ⚠️ 架构重构废弃 | 14 | spec 标记 completed，但交付物已被后续 loop/SDK 重构有意删除 |

**结论**: 大部分确实开发完了，但"全部完成"不成立。两类问题——(1) 一次大重构使 14 个"已完成"spec 的交付物不复存在；(2) 约 20 个 spec 有真实的接线/文档缺口。

---

## 一、架构重构废弃的 14 个"已完成" Spec

提交 d73f51f2 / ddf6d4d1 / b4f377dc 用原生调度替换了整个 SDK driver + forge-loop CLI 架构。

| Spec | 现状 |
|------|------|
| multi-platform-support | AgentRegistry/MockAgentAdapter/--agent 全删，多平台抽象不存在 |
| sdk-driver-decomposition | sdk-driver.ts 已删，8 模块仅存 3 |
| audit-remediation-v221 | 25 项中约 16 项目标模块已删 |
| branch-lifecycle-enforcement | recordPendingDelivery/detectStaleBranches/checkCommitTopicMatch 丢失（topic gate 幸存于 branch-gate.ts） |
| ship-delivery-unification | git-transaction.ts + ship_merge/ship_push_pr/ship_discard effect 已删 |
| loop-skills-fusion | SdkDriver/persistent-loop.sh 已删，纯函数幸存 |
| build-goal-replace-loop | SdkDriver 已删，自动推进改由 phase-transition-guard.sh 承担 |
| phase-advance-hardening | 同上 |
| observability-enhancements | logger/perf 库已建并测试，但驱动集成层随 SdkDriver 删除 |
| structured-observability | 同上 |
| v2.4-review-followups | validateHooksPresence 成为孤儿（无调用者）；5 个必需 E2E 测试不存在 |
| branch-isolation-recommendation | recommendIsolationStrategy 已删 + 文档漂移 |
| skill-document-optimization | 旧 skills/<cmd>/SKILL.md 布局已被统一重构取代 |
| token-budget-compression | 同上 |

**残留问题**:
- 文档漂移: branch-gate.md:20,40 仍引用 recommendIsolationStrategy from src/branch-lifecycle.ts
- 文档漂移: build/instructions.md:133 仍提 persistent-loop.sh
- 死代码: validateHooksPresence、recordIterationTiming/computeBaseline 无调用者
- INDEX 失真: 标 completed 实为 superseded

**需要决策**: multi-platform-support 和 ship delivery effects 是否仍需要？

---

## 二、P1 — 功能未生效 / 会误导

| Spec | 缺口 |
|------|------|
| configchange-hook | 脚本存在但 ConfigChange 在 plugin.json/hooks.json/settings.json 注册数=0 → hook 永不触发。Req 2 完全未做 |
| hook-system-enhancement | 5 个新 hook 脚本（worktree×2/stop-failure/permission-denied/task-created）已在磁盘但未接入 hooks.json（注册数=0）。且 R1"全部用 args 数组"为假：hooks.json 有 62 个 command 字符串、0 个 args、0 个 mcp_tool |
| structured-observability | 纯函数库齐全且有测试，但零调用者：无 CLI 解析 --log-format/--log-level，无驱动实例化 sink |

**已修复（2026-06-03）**:
- ~~forge-loop-native-fusion: allowed_tools 缺 Agent/Skill/Glob/Grep~~ → commit 1ca9c7e5 已修复
- ~~forge-init-env-optimization: alwaysLoad 未写入~~ → commit 08212287 已修复

---

## 三、P2/P3 — 文档/测试/命名缺口

| Spec | 缺口 |
|------|------|
| archive-transcript-purge | README 小节 + skill 文档缺失（Req 5.1/5.4） |
| ultrareview-ci-integration | README "CI AI 评审"小节缺失（Req 6.1） |
| misc-forge-optimization | README 缺 ! <command> 说明（R8）；run-ci-ultrareview.sh 缺 --bare 决策注释 |
| output-bloat-control | §2.6 缺 Caveman 式散文压缩词法规则（Req 2.AC1） |
| conflict-resolver-hook | 4 个触发点只接了 2 个，ship.ts 集成缺失 |
| engineering-governance-hardening | Event Sourcing 欠交付（无 EventLogEntry/replay()/stateHash） |
| failure-sink-trigger-expansion | loop_circuit_broken 无 emit 点；1 个命名测试缺失 |
| process-lifecycle-management | cleanup-chain.ts:42 的 git execFileSync 缺 30s 超时（Req 6） |
| sandbox-phased-implementation | --sandbox <profile> CLI flag 未接线 |
| resume-phase-coverage | Req 4.2/4.3 要求的回归测试不存在 |
| ccbp-inspired-hardening | ccbp-patterns-p2.md 缺；per-agent memory 目录未建 |
| forge-slimming-plan | 两个评估报告（R14/R16）未产出 |
| pms-pack-v1 | glossary 用扁平文件而非 spec 要求的 per-context 子目录 |
| token-language-optimization | P2 中→英转换在重构后无法逐条确认 |
| token-layered-defense | draft，hooks 未确认 |
| cmux-integration | loop 事件 producer（loop_started 等）未接线 |

---

## 四、完全满足的 70 个 Spec

agent-frontmatter-hardening, agent-team-migration, archive-transcript-purge(主体), audit-remediation-v221(主体), build-discipline-enhancement, ccbp-hardening-phase2, ccbp-inspired-hardening(主体), ci-check-integration, claude-md-self-evolution, cmux-integration(主体), cmux-skills-collapse, community-ecosystem, context-explosion-defense, context-optimization, cursor-team-kit-integration, ddd-tactical-bdd-collaboration, dist-sync-guard, docs-governance-system, documentation-onboarding, engineering-governance-hardening(主体), error-recovery-strategy, feature-dossier-index, forge-decide-agent-teams, forge-init-env-optimization(已修), forge-loop-native-fusion(已修), forge-resume-from-pr, forge-review-fix-optimization, forge-slimming-followups, forge-slimming-plan(主体), forge-single-entry-skills-collapse, frozen-zone-structured-feedback, glossary-consistency-hook, grill-auto-trigger-and-inline, hook-system-enhancement(脚本存在), i18n-support, knowledge-hooks-auto-rebuild, local-ci-parity, loop-skills-fusion(纯函数部分), missions-inspired-rigor, observability-enhancements(库部分), output-bloat-control(主体), output-conciseness, oz-skills-inspiration, pack-system, parallel-status-tracking, phase-advance-hardening(部分), plan-document-streamlining, plugin-distribution, plugin-init-experience, pms-pack-v1(语义达成), process-lifecycle-management(主体), remaining-backlog, review-no-mainagent-fallback, review-report-methodology-field, review-subagent-concurrency, review-pipeline-enhancement, review-subagent-truncation-fix, routing-assumptions, sandbox-phased-implementation(主体), ship-delivery-unification(部分), ship-gate-commit-verification, ship-gate-hardening, skill-behavioral-guardrails, skill-composability, skill-document-optimization(部分), skill-function-integration-audit, skills-cross-pollination, spec-lifecycle-management, spec-health-hook, state-resilience, structured-observability(库部分), subagent-truncation-fix, token-budget-compression(部分), token-language-optimization(主体), typedoc-api-docs, ultrareview-ci-integration(主体), v2.4-review-followups(部分), workflows-integration

---

## 方法与可信度

- 13+1 个只读 auditor agent 并行核对，对照当前真实文件（非复选框/INDEX 标记）
- 亲自复核所有高影响结论：SDK 重构删除（ls+git+测试）、configchange 零注册、hook 未接线（grep 计数）、branch-gate 文档漂移、孤儿函数、alwaysLoad 写入
- ✅ 70 个 SATISFIED 基于 agent 引用的 file:line 证据，抽样核实非全量复核
- 过程中发现 5 个 spec 曾被超出 turn 预算的 agent 漏报，已补审补全
