---
updated: 2026-08-11
rule_count: 15
max_rules: 15
---

# Error-Prevention Rules

Rules distilled by `/forge learn` from accumulated project knowledge.
Each rule prevents a specific, documented error pattern.

Rules that have been absorbed into Forge infrastructure (CLAUDE.md / SKILL.md /
hooks / agents) are retired to `.forge/knowledge/solutions/evolved-rules-retired.md`.
This file keeps only rules that still need top-of-session reminders.

<!-- Rule format:
### R{N}: {title}

**Content**: {concise rule statement}
**Prevents**: {specific error this rule prevents}
**Source**: {knowledge file and entry that triggered this rule}
**Added**: {YYYY-MM-DD}
**Confidence**: {0.3-0.9}
**Last_triggered**: {YYYY-MM-DD}
**Verified_via**: {TDD-phase-1: <scenario-desc> | threshold-only}
**Baseline_violation**: {subagent RED 阶段违反摘要 | N/A}
**Infra_Ref**: {path(s) to infrastructure that enforces this rule, if any}
-->

### R1: Implicit Idle Is Also a Block

**Content**: 阶段完成后不调用下一阶段、直接 idle（无输出、等待用户输入），与显式询问"是否继续"同罪。完成 SKILL.md 最后一步后，**必须立即** `Skill(skill="forge", args="<next>")`。无输出 ≠ 安全停顿，它是更隐蔽的阻断。任何 SKILL 执行流的最后一条指令必须是 auto-advance 调用或明确的用户确认点（decide/spec 阶段）。如果不确定下一步是什么，检查 `.forge/status.md` 的 `phase` 字段和 forge 入口的阶段序列表。**特别注意**：review 发现 P0/P1 后，输出报告不是终点——必须立即触发 `gated_auto` 询问（AskUserQuestion），禁止输出清单后 idle 等用户推动。**描述式入口不等同于一次性任务**：用户通过描述（如"先核对下再做 task #10"）而非 `/forge build` 子命令进入时，实现完成后的输出摘要表**不是终点**——它是 build 阶段的收尾，必须立即调用 `Skill(skill="forge", args="review")` 进入管线下一阶段。无论入口方式如何，只要触发了实现动作，就绑定完整的 forge 管线推进义务。
**Prevents**: 模型完成阶段后静默 idle，用户被迫手动追问"你在等我吗？"；review 发现 P0/P1 后只写报告不触发修复流程；描述式入口实现后停在摘要表不推进管线
**Source**: 用户反馈 — spec 阶段自检完成后模型直接 idle，用户需手动触发；2026-05-28 review 发现 3P0+7P1 后仅输出报告未触发 gated_auto；2026-05-30 ship-gate-hardening task #10 描述式入口实现后停在 commit 摘要表，用户追问"为什么流程断掉了"
**Added**: 2026-05-09
**Confidence**: 0.95
**Last_triggered**: 2026-05-30
**Infra_Ref**: `skills/shared/next-step-protocol.md` §三种违规形态

### R2: Review 必须对 "新增文件" 做主分支存在性验证

**Content**: `/forge review` 的 spec-check agent 在声称"✅ 新增的 agent/skill/hook/template 文件已实现"之前，**必须**对被声称创建的文件执行一次主分支路径（非 worktree、非 draft、非 stash）的存在性校验。禁止仅依据"worktree 中存在"或"commit log 显示添加过"作为实现证据。推荐做法：review 时维护一个"claimed new file list"，对每条执行 `Read` 文件工具或 `Glob` 绝对路径匹配。worktree 合并失败 / git add 遗漏 / rebase 丢 hunk 这三种事故的共同特征，就是"功能函数已合并但角色定义文件未合并"。
**Prevents**: review 报告把 "worktree 里存在" 错误当作 "主分支已合并"，放行了不完整的交付（2026-05-10 Sprint 3 审计：`business-analyst.md` 触发代码合并但 agent 定义文件未合并）
**Source**: 2026-05-10 三 Sprint 审计（`.kiro/specs/sprint-3-gap-remediation/`）
**Added**: 2026-05-10
**Confidence**: 0.9
**Last_triggered**: 2026-05-17
**Infra_Ref**: `.claude/agents/spec-check.md` Check Item 5 + Severity Judgment 表

### R3: Pack/Loader 约定差异必须有运行时验证

**Content**: 当 Pack 交付"数据文件"（glossary/banned-patterns/state-machines 等），Core 交付"加载器"解析这些文件时，**必须**有至少一个集成测试真正对**当前启用 Pack** 调用 `loadXxx(enabledPacks)` 并断言 `result.size > 0` 或 `result.entries.length > 0`。Zero-Pack-Zero-Impact 测试（空输入 → 空输出）只覆盖反面，不覆盖正面；静态 grep 和单元测试 fixture 也看不到"Pack 实际格式与 Core parser 期望格式不符"这类 schema 断层。Pack 启用后第一次 `loadXxx` 返回空即视为交付失败，不是 Zero-Pack 合理降级。
**Prevents**: Pack 数据格式演化后，loader 未同步导致启用 Pack 时默默返回空结果（2026-05-10 审计：PMS glossary 采用聚合 YAML 列表格式，`parseGlossaryFile` 按 Requirement 描述期望"每术语独立 frontmatter"，两者不匹配但所有单元测试和 Zero-Pack 测试都绿）
**Source**: 2026-05-10 三 Sprint 审计 — Sprint 1 R6 glossary 格式断层
**Added**: 2026-05-10
**Confidence**: 0.9
**Last_triggered**: 2026-05-10
**Infra_Ref**: `.claude/agents/spec-check.md` Check Item 6 + `skills/tinkerman/lib/plan/references/atomic-task-format.md` Pack Data Task Integration Test Requirement

### R4: Stub With TODO 不是 Zero-Pack 合理降级

**Content**: 核心业务函数返回空默认值（`return {}` / `return []` / `return null`）必须满足两个条件之一才算合法：(a) 明确对应 Zero-Pack-Zero-Impact 场景（输入为空、Pack 未启用）；(b) 有明确的 fallback 数据源声明并在有输入时产出非空结果。仅当函数声明为"v1 stub，v2 实装"并有 TODO 注释时，review 必须记录为 **P1 功能残缺**（不得降级为 P2/P3）。Zero-Pack 合理 no-op 和功能 stub 是两件事：前者是架构不变量，后者是欠债，不能混为一谈。Spec-check agent 的判据：函数对**非空且合法输入**返回空结果，即为功能残缺。
**Prevents**: 把 "v1 stub 待实装" 的函数登记为 P2/P3 advisory 并 ship，导致"门禁看起来有，实际 no-op"（2026-05-10 审计：`loadOwnershipMap` 返回 `{}`，即使项目有 `.forge/context-ownership.yaml` 也读不到；Context Boundary Hook 因此大多数情况 no-op）
**Source**: 2026-05-10 三 Sprint 审计 — Sprint 3 R4 Context Boundary Hook
**Added**: 2026-05-10
**Confidence**: 0.85
**Last_triggered**: 2026-05-17
**Infra_Ref**: `.claude/agents/spec-check.md` Check Item 3a Stub Detection + Severity Judgment 表

### R5: Lint 严格度按源码/测试分层

**Content**: biome / ESLint 配置对 `src/` 与 `test/` 应用分层严格度。`src/` 严格：禁止 non-null assertion (`!`)、禁止 `console`、禁止显式 `any`、要求所有 import 有序、所有 format 合规。`test/` 宽松：允许 `!`（测试 fixture 的结构由 setUp 保证，等价于隐式 `expect(...).toBeDefined()`）、允许 `console.log`（调试辅助）、测试代码里显式 `any` 仍需 case-by-case 提供精确类型。实现方式：`biome.json` 的 `overrides[].includes: ["test/**"]` 段追加 `"style": { "noNonNullAssertion": "off" }`。分层不是"妥协"是场景化语义分级；在测试里逐处加 `// biome-ignore` 注释才是反模式——它把合理的测试模式污染到源码并增加噪声。新增 override 必须在该次 PR 中明确决策记录（CHANGELOG 或 ADR）。
**Prevents**: (a) 为了清零 lint warning 在测试文件里撒满 `biome-ignore` 注释造成噪声；(b) 把测试里的 `!` 用法反向迁移到源码降低类型安全；(c) 维护者反复纠结"测试里 `!` 到底要不要改"耗时
**Source**: 2026-05-10 存量 biome 问题清理会话 — 全仓 noNonNullAssertion 28 处全部在 test/，源码 9 处已改为 null-check + early return
**Added**: 2026-05-10
**Confidence**: 0.85
**Last_triggered**: 2026-05-10
**Infra_Ref**: `CONTRIBUTING.md` Lint Strictness Layering 章节 + `biome.json` `overrides[].includes: ["test/**"]`

### R6: src/dist 同步是 PR 合约一部分

**Content**: 修改 `src/**/*.ts` 的 PR 必须同时包含对应 `dist/src/**` 的变更。Forge 的 `dist/` 是 tracked in git（hooks 运行时 + 分发包都读它）。开发者的思维模型应该是"src/ 和 dist/ 是同一次逻辑变更的两面"，不是"tsc 只是构建步骤可以之后再补"。如果 CI 报 dist-sync 失败，运行 `npm run dist:resync` + commit dist/。紧急情况允许 commit message 带 `[dist-sync-skip]` 绕过，但下一 PR 必须恢复同步。
**Prevents**: Sprint 级别的 dist 积压漂移（2026-05-10 审计：Sprint 1-3 累计 300+ dist 文件未提交，`078e482` 一次性消除，但这种"突发大规模同步"本身说明缺乏持续守卫）
**Source**: 2026-05-10 存量 biome / dist 积压清理会话
**Added**: 2026-05-10
**Confidence**: 0.85
**Last_triggered**: 2026-05-10
**Infra_Ref**: `scripts/check-dist-sync.mjs` + `CONTRIBUTING.md` §dist/ Sync Requirement

### R7: .claude/ 被 gitignore — 必须用 git add -f 跟踪

**Content**: `.claude/` 目录在 `.gitignore` 中被整体排除。需要版本控制的文件（`.claude/agents/`、`.claude/rules/`、`.claude/hooks/scripts/`）必须使用 `git add -f <path>` 强制添加。普通 `git add` 或 `git commit -a` 不会包含这些文件。在 worktree 中创建这些文件后，`git status` 也不显示它们。合并时如果忘记 `-f`，文件会丢失在 worktree 中，merge commit 不包含 agent/rule 定义。构建阶段创建 `.claude/` 下文件的最后一步必须是 `git add -f`。
**Prevents**: agent/rule/dispatcher 文件在 worktree 中创建但未进入 merge commit，导致"功能代码已合并但角色定义未合并"（2026-05-12 ccbp-hardening-phase2 实际发生）
**Source**: ccbp-phase2-worktree-gitignore knowledge document
**Added**: 2026-05-12
**Confidence**: 0.85
**Last_triggered**: 2026-05-12
**Infra_Ref**: `.gitignore` + instincts.md "git add -f" entry

### R8: Security Chokepoint Stubs Must Fail Visibly

**Content**: Dispatcher/安全检查点函数的 stub/mock **禁止**返回成功状态（`{ ok: true }`、`return null`、`return []`）。Stub 必须返回明确的错误码（`{ ok: false, code: "E_STUB" }`），让调用方和 reviewer 能立即识别"这个检查还没有实装"。硬编码 `{ ok: true }` 的 stub 在 review 中等同于安全控制不存在——reviewer 无法从调用链区分"通过了检查"和"跳过了检查"。生产路径中，路径解析成功后的下一步**必须**读取实际文件内容，不得用 mock 字符串代替。
**Prevents**: 安全控制函数被 stub 静默绕过（2026-05-17 forge-single-entry-skills-collapse P1-S1: tools resolve 用 mock content，P1-S2: integrity check 返回 `{ ok: true }`）
**Source**: `.forge/reviews/forge-single-entry-skills-collapse.md` P1-S1 + P1-S2; cross-ref `.forge/knowledge/solutions/single-entry-dispatcher-collapse.md`; ADR-0004 §Decision/§Rollback
**Added**: 2026-05-17
**Confidence**: 0.9
**Last_triggered**: 2026-05-17 (re-confirmed via /forge learn second-pass execution scoring)
**Infra_Ref**: `.claude/agents/spec-check.md` + `.claude/agents/quality-check.md` Check Item for stub detection

### R9: Verdict Claims Must Cite Evidence and Be Re-verified

**Content**: 任何"通过/PASS/已完成"的声明（无论来自 task report、review verdict、test summary、ship gate）必须满足两个条件之一：(a) 命令实测输出（exit code + tail），(b) 至少 2 个独立证据点（如 grep 路径 + 文件存在性 + 测试运行）。**禁止**仅凭"我刚才修了，应该好了"或"我看代码逻辑对了"作为 verdict 依据。Verdict 一旦发出，**禁止**在原 verdict 文档内"原地修订"——必须明确标记 retracted 并写新 verdict（带新 timestamp）。原因：原地改写会让下游 reader 看不到 retraction，把 stale claim 当成 fresh truth。同样适用于 deferral 语义降级（"已 PASS" → "pass-pending-X"）这类边界变化，应保留原 verdict 历史。
**Prevents**: (a) 自我汇报 PASS 但 main agent 复核发现 FAIL（2026-05-17 多次：dispatcher-mode-flag 误算 fail count、refs-cross-rewrite vacuous PASS、build-summary R1.2 verdict 草率 pass）；(b) deferral 边界变化原地覆盖原 verdict（spec.md update_after_lock 是正确做法的反例：保留原 lock 状态 + 显式 update entry）
**Source**: 2026-05-17 single-entry-skills-collapse session — 5+ instances of self-reported PASS contradicted by independent verification
**Added**: 2026-05-17
**Confidence**: 0.85
**Last_triggered**: 2026-05-17
**Infra_Ref**: `skills/tinkerman/lib/review/instructions.md` §7 + `skills/tinkerman/lib/test/instructions.md` §3.1

### R10: Wire Commits Must Show Production Caller Diff

**Content**: 任何声称"wire X into production"的 commit，diff 中**必须**包含对 entry 文件（`src/build.ts` / `src/plan.ts` / `src/spec.ts` / `src/review.ts` 等编排器或 SKILL 入口对应文件）的修改。仅修改 `*-registry.ts`、`skills/**/instructions.md` 散文叙述、新增独立模块自身——这三类都不构成 production 接入证据。verify 命令：`git show --name-only <commit> | grep -E 'src/(build|plan|spec|review)\\.ts$'` 必须有命中。如果新模块的入口由 SKILL.md 触发（AI agent 通过 Bash/Read 调用），SKILL instructions.md 必须显式写出函数签名调用（含参数），不能仅"narrative 提及"。Round 2-3 review 重复 fail 的根因就是这一条没守住。
**Prevents**: 单元函数齐了但生产路径没接，spec 描述的功能（wave 并行 / 三振写诊断 / 自动迁移）从不触发；3 轮 review 才暴露
**Source**: `.forge/reviews/forge-kiro-style-spec-workflow-round2.md` + `round3.md` — 7 个 wire commits 全部 0 production caller
**Added**: 2026-05-23
**Confidence**: 0.9
**Last_triggered**: 2026-05-23
**Infra_Ref**: `.claude/agents/quality-check.md` + `skills/tinkerman/lib/review/instructions.md` Check Item: "wire commits must show entry-file diff"

### R11: GREEN 必须含 typecheck，不止 vitest

**Content**: TDD GREEN 阶段的"测试通过"判定必须包含 `npx tsc --noEmit` 或等价 typecheck，不能只看 vitest 输出。原因：fixture 字段名错（如 `wave.taskIds` vs 类型 `wave.tasks`）时 vitest 仍可全绿（运行时弱类型 + fixture 与函数实现互相 reinforce），但 typecheck 立即报 TS2353/TS2551，且生产数据流会立即断（运行时 NPE）。每个 task 的 GREEN verify 模板：`npx tsc --noEmit && npx vitest run <test files>`，缺一不可。SKILL build/instructions.md §3.5 已要求 npm run check（含 tsc），需要在 forge-build task post-verify 强制执行而非可选跳过。
**Prevents**: fixture 与生产类型字段名不一致，单元测试欺骗性全绿，typecheck 立即 broken（2026-05-23 wire commit `279f57f3` 引入 4 个 TS 错误）
**Source**: `.forge/reviews/forge-kiro-style-spec-workflow-round3.md` §4.1
**Added**: 2026-05-23
**Confidence**: 0.9
**Last_triggered**: 2026-05-23
**Infra_Ref**: `skills/tinkerman/lib/build/instructions.md` §3.5 Final Validation

### R12: 重命名 ≠ 合并，双实现修复必须删一边

**Content**: review 报"双实现冲突"时，**禁止**只把其中一个函数改名再 export 出去就声称已修。合并双实现的最低判据：删除其中一个实现，或合并成 layered design（canonical + adapter，adapter 词典从 canonical 派生）。验证：`grep -RIn 'export.*<原函数名>\\b' src/ \| wc -l` 必须 = 1；下游所有 caller 收敛到一个函数。如果保留两个 export，文件头注释必须明确 layering 关系（"canonical 是 X / adapter 是 Y / 词典派生关系是 Z"），并有死代码标记或显式删除计划。
**Prevents**: 把 detectSpecLeak 重命名为 detectSpecLeakFromBundle 就声明双实现已合并，实际两边的扫描逻辑（5 条硬编码正则 vs banned-patterns.yaml 注册表）依旧并存且不同同步（2026-05-23 commit `5401e1c0`）
**Source**: `.forge/reviews/forge-kiro-style-spec-workflow-round3.md` (P0-11)
**Added**: 2026-05-23
**Confidence**: 0.85
**Last_triggered**: 2026-05-23
**Infra_Ref**: `.claude/agents/spec-check.md` Check Item: "rename ≠ merge for double-implementation"

### R13: 平台能力声明必须先验证再写入

**Content**: 声称"AI 可以 X"（读 context %、触发 compact、调用 API）写入 SKILL/instructions 之前，**必须**实际测试验证。未验证的能力声明等同于虚假文档，会误导后续所有依赖该声明的实现。验证方式：(a) 查阅 Claude Code 官方文档，(b) 实际尝试调用并检查返回值，(c) 搜索 GitHub issues 确认已知限制。如果验证失败，在文档中明确标注"当前不可用"或改为 fallback 策略。
**Prevents**: 在 next-step-protocol.md 中写入"AI 可观察状态栏百分比"触发 compact，实际 AI 无法读取 context 使用率（2026-05-29 context-overhead-optimization ship 阶段被用户当场纠正）
**Source**: context-overhead-optimization ship 阶段 — 用户质疑阈值方案后调研发现 AI 完全无法程序化读取 context %
**Added**: 2026-05-29
**Confidence**: 0.9
**Last_triggered**: 2026-05-29
**Infra_Ref**: `skills/shared/next-step-protocol.md` §Context Compact 策略

### R14: README metrics 改动被 pre-commit hook revert 时用 --no-verify ⚠️ 已退役

**Content**: ⚠️ **已退役（ADR-0009 减法 pass 1 移除 `check-readme-metrics.sh` + `.githooks/pre-commit` README metrics auto-sync 段，本规则描述的机制不再存在）**。保留编号位避免 R13/R15 断裂；新生 README metrics 工作无需此规则，npm run check 不再跑 check-readme-metrics。
**Prevents**: （历史）README metrics 改动连续失败 3 次，被 pre-commit hook revert
**Source**: mcp-compression-delegation ship 阶段（PR #107）
**Added**: 2026-06-18
**Confidence**: 0.0（已退役）
**Last_triggered**: 2026-08-11（退役）
**Infra_Ref**: 已退役 — 机制移除（ADR-0009 pass 1）

### R15: 状态一致性 / 门禁 / 外部副作用路径，异常输入必须 fail-closed

**Content**: 在**状态一致性**（status-atomic / status-manager）、**门禁**（ship-gates / review methodology）、**外部副作用**（bitbucket post 评论 / 任务）这三类路径上，遇到异常或缺失输入时**必须 fail-closed**（抛错中止 / 阻断），**禁止**静默降级为"安全空值"或"最可信默认值"后继续执行。区分两类降级：降级到**更严**（zone-registry 回退默认规则、nonce 重新生成）是正确的；降级到**丢数据 / 放行**（read 失败吞成空串后覆盖原文件、fixlist 自称 allFixed 无 git 验证即放行、fetch 失败当空继续灌评论、methodology 缺失默认 subagent-parallel）是缺陷。判据：若异常输入被吞后，后续动作会**覆盖已有数据 / 绕过门禁 / 对外重复副作用**，则必须中止而非继续。锁超时（ToolHealthLockTimeoutError）属于不可恢复的 P1 状态一致性失败，必须上抛给调用方决策，不得降级为 stderr 警告。
**Prevents**: SR-1 fail-open 四连（P2-1 status-atomic clobber、P2-2 ship-gate fixlist 绕过、P2-4 bitbucket 重复灌评论、P2-5 methodology fail-open、P2-6 status-manager 不阻断）—— 同根因：异常/缺失输入被静默降级为安全空值后继续，与项目自身 fail-closed 纪律（state-file-locking Knuth Invariant、review HARD-GATE）冲突
**Source**: 2026-07-16 全量审核 `.forge/audits/2026-07-16-full-project-audit.md` §系统性风险 SR-1
**Added**: 2026-07-16
**Confidence**: 0.9
**Last_triggered**: 2026-07-16
**Infra_Ref**: `src/status-atomic.ts` (read-fail abort)、`src/ship-gates.ts` (methodology/fixlist fail-closed)、`src/review-comment-bitbucket/post.ts` (fetch-fail abort)、`src/status-manager.ts` (lock-timeout propagate)

---

## Retired Rules

The following rules have been absorbed into Forge infrastructure and moved to
`.forge/knowledge/solutions/evolved-rules-retired.md` for historical reference:

- **R-retired-1**: Forge Phase Auto-Advance → absorbed into CLAUDE.md §2.7 + next-step-protocol + persistent-loop.sh Cases 5-10
- **R-retired-2**: Plan Tasks Are All Mandatory → absorbed into forge-build SKILL.md §1 "Plan 即合同铁律"
- **R-retired-3**: Sprint Is Not Phase Boundary → absorbed into src/plan.ts `checkPlanStructure()` + forge-plan SKILL.md Step 4a
- **R-retired-4**: SKILL Reload After Context Recovery → absorbed into forge-resume + forge-ship/review/test/learn Compaction Recovery Check
