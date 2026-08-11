---
status: retired-partial
status_note: "受 forge-loop-native-fusion 影响而关闭：persistent-loop.sh 已被删除（commit a77f8394），Layer 3（Cases 5-10 + dedupe + loop handoff）随之失效且不再适用。已交付：Layer 1 (checkPlanStructure) @ src/plan.ts:1014，Layer 2 (R3 rule) 合理退役。"
feature: phase-advance-hardening
layout: requirements
created: 2026-05-08
tier: standard
---
# Requirements Document

## Introduction

本特性系统性修复 Forge 在 SKILL 驱动模式下的阶段推进断点问题。根因由三层叠加构成：模型生成倾向（glm-5.1 等模型在"自然完成点"进入总结模式）、长上下文中 R1 规则被 prompt cache 压缩失效、plan 文件的 Sprint / 里程碑结构对模型构成"准阶段边界"诱导。症状是 `/forge build` 或 `/forge loop` 在 Sprint 完成、阶段完成后输出总结文字收尾，不再调用 `Skill(skill="forge", args="<next>")`，用户需手动 `/forge resume` 才能恢复。

问题陈述：现有缓解措施（CLAUDE.md §2.7 铁律、evolved-rules R1、next-step-protocol、各 SKILL 内部的"立即调用"条款）已经饱和——指令强度达到边际收益为零。知识库笔记 `.tinkerman/knowledge/glm-summary-ending.md` 明确记录："本现象本身就是硬指令也压不住的反例，问题不在指令不够多，而在它们在长上下文里掉出了活跃注意力窗。"继续在 SKILL 或宪法里加条款不会改善可靠性。

价值来源：三条路径协同解决——
1. **源头预防**：优化 plan 结构，避免产生模型能识别为里程碑的组织单元（Sprint ≥ 2、任务数 > 15、独立 ship 点等）。此路径一次性改造 `forge-plan` SKILL 后，所有新 plan 自动受益。
2. **兜底恢复**：扩展 `scripts/persistent-loop.sh` 的 Stop hook 覆盖面，从当前的"build 未完成 + review 有 P0/P1"两场景扩展到所有阶段间过渡（plan→build、build→review、review→test、test→ship、ship→learn、loop 迭代间）。此路径在模型已停下时通过 Stop hook 向下一轮响应注入命令式指令恢复推进。
3. **规则沉淀**：在 `evolved-rules.md` 新增 R3，把"Sprint 不等于阶段边界 + build 内连续推进 + 进入 build 前复核 plan 结构"作为一条显式规则由 SessionStart hook 每次注入。

业务价值：

1. 降低 Forge 标准路径在长任务中的断点频率，减少用户手动 `/forge resume` 介入次数。
2. 让 `/forge loop` 在 SKILL 驱动模式（分发包）下的每轮迭代可靠衔接，缩小与 SDK 驱动模式（`forge-loop` CLI）之间的可靠性差距。
3. 把"现在靠运气，模型决定继不继续"改为"现在靠基础设施，plan 结构对模型友好 + Stop hook 主动兜底"。
4. 不修改任何模型行为、不增加依赖、不改动 SKILL 外部契约，全部通过已有机制（evolved-rules、forge-plan Self-Check、Stop hook）扩展。

架构选择（分层兜底）：本特性采用**分层防御**而非单点强化。第一层 Plan 结构在 Self-Check 阶段阻止"大 plan"生成；第二层 R3 规则在每个新会话开始时通过 SessionStart hook 注入，针对模型看到 plan 时的认知偏差；第三层 Stop hook 在模型已经停下时通过 stdout 注入下一步动作。三层中任一层失效，后一层仍可生效。SDK 驱动模式的 `src/sdk-driver.ts` `run()` 是 JS while 循环，不依赖模型 tool call 续接，不受此问题影响，本 spec 不触及 SDK 层。

关键约束（贯穿所有需求）：

- **Zero-SKILL-contract-change**：本特性 SHALL NOT 修改既有 SKILL（`forge-build`、`forge-review`、`forge-test`、`forge-ship`、`forge-learn`、`forge-loop`、`forge-resume`）的外部契约、触发方式或输出格式。仅 `forge-plan` 的 Self-Check 环节扩展一项硬性检查。
- **Zero-runtime-dependency**：不新增任何运行时依赖。所有改动落在 `scripts/persistent-loop.sh`（shell）、`.tinkerman/knowledge/evolved-rules.md`（markdown）、`skills/forge-plan/SKILL.md`（markdown）、`skills/forge-plan/references/` 下新增/扩展 references（markdown）。
- **Zero-regression**：扩展后的 `persistent-loop.sh` 在所有原有场景（review P0/P1、build 未完成 + interim 文件、cleanup stale exhaustion flag）下行为 SHALL 保持字节级一致。新分支 SHALL 在原有分支之后、`exit 0` 之前插入，不打断既有 control flow。
- **Deterministic detection**：所有 Stop hook 分支的触发条件 SHALL 仅基于 `.tinkerman/status.md`、`.tinkerman/progress/*.md`、`.tinkerman/reviews/*.md` 的 frontmatter / 正文可观测字段。禁止依赖对话历史、模型输出内容、环境变量等不可观测状态。
- **Idempotent injection**：同一状态下 Stop hook 被重复触发时，注入文字 SHALL 相同；不引入计数器、随机性或基于历史的状态机（auto-fix 的 `fix_iteration` 计数器是既有行为，保留不扩展）。

## Glossary

- **SKILL_Driven_Mode**：分发包模式，用户通过 `/forge <subcommand>` 触发 SKILL，靠模型自行 `Skill(skill="forge", args="<next>")` 实现阶段推进。本 spec 专门修复此模式的断点。
- **SDK_Driven_Mode**：`forge-loop` CLI 模式，通过 `src/sdk-driver.ts` 的 JS while 循环驱动，每轮主动发 query，不依赖模型 tool call 续接。不在本 spec 修复范围。
- **Phase_Transition**：一次阶段间的推进动作，形如 `plan → build`、`build → review`、`review → test`、`test → ship`、`ship → learn`、`ship → (end)`。Forge 八阶段（decide / spec / plan / build / review / test / ship / learn）中的相邻有序对。
- **Auto_Advance_Break**：Phase_Transition 应发生但未发生的事件。具体表现：当前阶段已 success（progress 全完、review pass、test pass 等），但模型输出总结后停止，未调用 `Skill(skill="forge", args="<next>")`。
- **Sprint_Boundary_Confusion**：plan 文件中 `### Sprint N — <title>` 级分组被模型识别为"里程碑级断点"的现象，触发 Auto_Advance_Break。典型结构：6 Sprint × 5+ 任务、Sprint 末尾含"回归 / 交付 / ship"类任务、progress 表格按 Sprint 分节。
- **Stop_Hook_Injection**：`hooks/hooks.json` 注册的 Stop 事件回调（当前实现为 `scripts/persistent-loop.sh`）通过 stdout 输出的文字。该文字进入模型下一轮响应的系统输入，等价于"冷启动 + 热状态"——模型重新读 CLAUDE.md / R1 规则，同时 `.tinkerman/` 文件保留完整任务上下文。
- **Command_Style_Injection**：Stop_Hook_Injection 使用命令式语句形如 `请立即调用 Skill(skill="forge", args="<next>")`，给模型一个明确动作。与建议式语句（如`建议运行 /forge resume`）相对。
- **R3_Rule**：本 spec 新增的 evolved-rules 条目，编号 R3，规则要点："Sprint / 分组 / 里程碑是 build 内部分组，不是阶段边界；Plan 批准后 build 必须连续执行到最后一个任务完成才 exit 到 review；进入 build 前若发现 plan 含 ≥2 Sprint 或 ≥1 独立 ship 点，应提议拆 plan"。
- **Plan_Structure_Check**：`forge-plan` Self-Check 中新增的一项检查，在 Step 4 和 Step 5 (User Approval) 之间执行，评估当前 plan 是否触发拆分建议。
- **Split_Trigger_Condition**：Plan_Structure_Check 的触发条件，满足任一即命中：(a) task 数 > 15；(b) 含 ≥2 个 Sprint / Milestone / Phase 级分组标题；(c) 任一分组内含"回归 / 独立 ship / 交付 / merge / release"类任务名；(d) progress 模板预期会出现独立 done/pending 分界。
- **Phase_State_Tuple**：Stop_Hook_Injection 决策所需的可观测状态元组，形如 `(tier, phase, review_verdict, test_verdict, progress_completion, loop_active, skill_sequence_remaining)`，全部来自 `.tinkerman/status.md` frontmatter 和 `.tinkerman/progress/*.md`、`.tinkerman/reviews/*.md` 字段。
- **Transition_Readiness**：一个 Phase_Transition 可安全触发的判定。例如 `build → review` 的 Transition_Readiness = (phase=build ∧ progress 全 done ∧ review 文件不存在或时间戳早于 progress 最后更新)。
- **Loop_Iteration_Handoff**：`mode=autonomous` 下一轮迭代完成（本轮 ship）到下一轮开始（下一个未完成 Sprint 的 build）之间的切换。当 `skill_sequence` 还有未完成 phase 或 `.tinkerman/progress/` 仍有未完成 Sprint 时触发。
- **Dedupe_Key**：Stop hook 去重的文件系统标记，路径 `.tinkerman/.stop-hook-dedupe/<phase_state_hash>.ts`，TTL 60 秒。防止同一 phase_state 被连续触发多轮注入。
- **Non_Intrusive_Fallback**：当 Stop hook 检测到的状态不明确（如 status 文件过期 > 2 小时、phase 值为 `unknown`）时，不注入任何文字，exit 0。保持既有 silent 行为。
- **Evidence_Based_Decision**：所有 Stop hook 决策 SHALL 基于实际文件内容而非推断。例如"review 通过"的证据必须来自 `.tinkerman/reviews/<topic>.md` frontmatter 的 `result: pass` 且 `p0_count: 0` 且 `p1_count: 0`，不能仅凭 `status.md` 的 `phase: review`。

## Requirements

### Requirement 1: R3 规则加入 evolved-rules 并由 SessionStart hook 注入

**User Story:** As a Forge user writing a plan with multiple Sprints, I want the model to understand that Sprint boundaries are not phase boundaries before it starts build, so that build does not stop mid-way after the first Sprint completes.

#### Acceptance Criteria

1. WHEN `/forge learn` 被调用生成或更新 `.tinkerman/knowledge/evolved-rules.md`，THE R3 rule SHALL 以与 R1 / R2 相同的格式（`### R3: <title>` + Content / Prevents / Source / Added / Confidence / Last_triggered 字段）写入该文件。
2. THE R3 rule 的 Content 字段 SHALL 覆盖三个要点：(a) Sprint / 分组 / 里程碑标签是 build 阶段内部执行分组，不是阶段边界；(b) Plan 批准后 build 必须连续执行到最后一个任务完成才 exit 到 review，Sprint 完成 ≠ 阶段完成；(c) 进入 build 前若发现 plan 含 ≥2 个 Sprint 或 ≥1 个独立 ship 点，应停下来提议拆 plan（此条是弱条款，不阻断 build）。
3. THE R3 rule 的 Source 字段 SHALL 引用本 spec 的 ID 或 `.tinkerman/knowledge/glm-summary-ending.md` 的文件路径，确保可追溯性。
4. THE R3 rule 的 Confidence 字段 SHALL 初始设为 `0.85`；Last_triggered 初始设为创建日期。
5. WHEN Claude Code 启动新会话时，`hooks/hooks.json` 中 SessionStart 的第二个 hook (`cat .tinkerman/knowledge/evolved-rules.md`) SHALL 把含 R3 在内的全文注入到 context。本 spec 不修改 SessionStart hook 定义，仅依赖其既有行为。
6. IF `evolved-rules.md` 的 frontmatter `rule_count` 字段存在，THE 字段值 SHALL 从 `2` 更新为 `3` 以与实际规则数一致；`max_rules: 15` 保持不变。
7. WHEN `/forge learn` 检测到已有 R3 规则，THE SKILL SHALL NOT 重复添加；允许通过 Last_triggered 字段更新日期但规则内容保持原样。
8. THE R3 rule 文本 SHALL NOT 与 R1（Forge Phase Auto-Advance）重复表述；R1 聚焦"阶段间推进"，R3 聚焦"Sprint 不等于阶段 + plan 结构复核"。

### Requirement 2: forge-plan SKILL 新增 Plan_Structure_Check

**User Story:** As a plan author, I want the planning SKILL to flag plans that are structurally likely to cause auto-advance breaks before I approve them, so that I can choose to split the plan or explicitly acknowledge the risk.

#### Acceptance Criteria

1. THE `skills/forge-plan/SKILL.md` §2.4 (Self-Check) SHALL 新增一项检查条目，名为 `Plan Structure Check`，列在现有 `Spec Coverage` / `Placeholder Scan` / `Type Consistency` / `Dependencies` 四项之后。
2. THE Plan_Structure_Check SHALL 评估以下 Split_Trigger_Condition：(a) task 数 > 15；(b) plan 正文中含 ≥2 个匹配 `^###\s+(Sprint|Milestone|Phase|阶段)\s+\S` 的标题；(c) plan 正文中含 ≥1 个任务名匹配 `(?i)(regression|回归|独立\s*ship|交付|release|merge.*main)` 的任务；(d) plan 结尾的"Execution Strategy"或 Metrics 章节描述中出现 `Sprint\s+\d+\s+依赖\s+Sprint\s+\d+` 类链式 Sprint 依赖。
3. WHEN Plan_Structure_Check 的四条触发条件任一命中，THE `forge-plan` SKILL SHALL 在 Step 5 (User Approval) 前向用户输出一段结构化警告，格式：
   ```
   ⚠️ Plan Structure Warning
   本 plan 触发以下拆分建议条件：
   - [已命中的条件列表]
   
   建议将 plan 按 Sprint 拆成 N 个独立 plan，每个 plan 对应一次完整的 build → review → test → ship 周期。
   
   继续使用当前 plan 请输入 "acknowledge-monolith"；拆分请输入 "split"。
   ```
4. IF 用户输入 `acknowledge-monolith`，THE SKILL SHALL 在 plan frontmatter 追加字段 `monolith_acknowledged: true` 并继续到 Step 5 User Approval；此标记用于告知 Stop hook 本 plan 是用户主动承担断点风险。
5. IF 用户输入 `split`，THE SKILL SHALL 进入拆分向导（§11 新增章节），按 Sprint 把当前 plan 拆成多个 `.tinkerman/plans/<topic>-sprint-<n>.md` 文件。拆分细则由 references/plan-split-wizard.md 定义（本 spec 不在 requirements 级展开）。
6. IF 用户输入其他文字，THE SKILL SHALL 视为 acknowledge 的变体（非破坏性默认），以 `acknowledge-monolith` 语义继续，并在控制台提示可用选项。
7. THE Plan_Structure_Check SHALL NOT 阻断批准流程本身；它仅 inform 用户并追加 frontmatter 字段。与既有的 Placeholder Scan 等硬阻断检查形成职能分离。
8. THE `forge-plan` §9 Edge Case 中现存的"Task count > 20 | 提醒拆分"条款 SHALL 被本需求替换；新条款阈值降至 15 且由 Self-Check 阶段正式执行，不再是 Edge Case 级软提醒。
9. WHEN plan 已含 `monolith_acknowledged: true` frontmatter 字段且内容再次被 Self-Check 重新评估（如 draft 返工），THE SKILL SHALL 跳过 Plan_Structure_Check 警告输出，直接通过该检查。

### Requirement 3: persistent-loop.sh 扩展覆盖全部 Phase_Transition

**User Story:** As a Forge user whose model just summarized a phase completion and stopped, I want the Stop hook to detect the hanging transition and tell the model exactly which Skill call to make next, so that I do not need to type `/forge resume` manually.

#### Acceptance Criteria

1. THE `scripts/persistent-loop.sh` SHALL 在既有 Case 1 (review P0/P1 auto-fix)、Case 2 (cleanup after review pass)、Case 3 (build + exhaustion)、Case 4 (stale exhaustion flag cleanup) **之后、`exit 0` 之前**新增五个 case 分支 (Case 5 到 Case 9)，每个分支对应一种 Phase_Transition。
2. **Case 5 (plan → build)**：WHEN `current_phase == "plan"` AND `.tinkerman/plans/*.md` 中最新 plan 的 frontmatter `status: approved` AND `current_tier != "light"` AND `.tinkerman/progress/<topic>.md` 不存在或为空，THE hook SHALL 输出：
   ```
   🔄 [AUTO-ADVANCE] Plan 已批准，build 阶段未启动。
   请立即调用 Skill(skill="forge", args="build") 进入构建阶段。
   ```
3. **Case 6 (build → review)**：WHEN `current_phase == "build"` AND `.tinkerman/progress/<topic>.md` 中所有任务均为 `[x]` (完成) AND `.tinkerman/reviews/<topic>.md` 不存在或其 `mtime` 早于 progress 文件 `mtime`，THE hook SHALL 输出：
   ```
   🔄 [AUTO-ADVANCE] Build 阶段所有任务已完成，review 未执行或已过期。
   请立即调用 Skill(skill="forge", args="review") 进入评审阶段。
   ```
4. **Case 7 (review → test)**：WHEN `current_phase == "review"` AND 最新 review 文件 frontmatter 满足 `result: pass` AND `p0_count: 0` AND `p1_count: 0` AND `current_tier in ("standard", "full")` AND `.tinkerman/test-results/<topic>.md` 不存在或其 `mtime` 早于 review 文件 `mtime`，THE hook SHALL 输出：
   ```
   🔄 [AUTO-ADVANCE] Review 已通过（P0=0, P1=0），test 阶段未执行。
   请立即调用 Skill(skill="forge", args="test") 进入测试阶段。
   ```
5. **Case 8 (test → ship)**：WHEN `current_phase == "test"` AND 最新 test-result 文件 frontmatter 满足 `result: pass` 或等价的"全部通过"标记 AND `.tinkerman/ship/<topic>.md` 不存在，THE hook SHALL 输出：
   ```
   🔄 [AUTO-ADVANCE] Test 阶段全部通过，ship 阶段未执行。
   请立即调用 Skill(skill="forge", args="ship") 进入交付阶段。
   ```
6. **Case 9 (ship → learn)**：WHEN `current_phase == "ship"` AND `current_tier == "full"` AND 最新 `.tinkerman/ship/<topic>.md` 或等价 ship artifact 存在 AND `.tinkerman/knowledge/sessions/<topic>-learned.md` 或等价 learn artifact 不存在，THE hook SHALL 输出：
   ```
   🔄 [AUTO-ADVANCE] Ship 已完成（tier=full），learn 阶段未执行。
   请立即调用 Skill(skill="forge", args="learn") 沉淀本次开发经验。
   ```
7. WHEN 上述五个 case 中任一命中，THE hook SHALL 在输出后立即 `exit 0`，不继续评估后续 case（保持单次触发）。
8. WHEN 上述五个 case 全部未命中，THE hook SHALL 走到既有 Case 4 (stale exhaustion flag cleanup) 的同级下游并最终 `exit 0`，保持既有 silent 行为。
9. THE 每个新 case 的 phase 判定 SHALL 读取 `.tinkerman/status.md` 的 `phase` 字段；文件不存在或 `phase` 字段为空时 SHALL NOT 触发任何新 case。
10. THE 每个新 case 的 artifact 存在性检查 SHALL 通过 `find .tinkerman/<dir> -maxdepth 1 -name '<pattern>'` 或 `[ -f <path> ]` 完成，不使用 glob 展开（避免 no-match 时 `"$pattern"` 残留）。
11. THE 新 case 中的 `monolith_acknowledged` 字段 SHALL 被尊重：当 Case 5 对应的 plan frontmatter 含 `monolith_acknowledged: true`，Case 5 照常执行（此 flag 不改变 plan→build 推进，仅标记用户已知风险）。
12. THE 新 case 的 stdout 文本格式 SHALL 使用与既有 Case 1 一致的前缀 `🔄 [AUTO-ADVANCE]` 和尾部"请立即调用 Skill(...)"命令式指令，保持风格统一。
13. THE hook SHALL NOT 修改任何 `.tinkerman/` 文件；新 case 仅读 + 输出 stdout。Case 3 的 `remove_field "$STATUS_FILE" "exhaustion_pending"` 是既有行为，保留不扩展。

### Requirement 4: Stop hook 去重机制防止循环注入

**User Story:** As a Forge user whose task state remains in the same phase for several model responses, I want the Stop hook to emit the auto-advance injection once and then stay silent until the phase state changes, so that the model's context is not polluted by identical injections every turn.

#### Acceptance Criteria

1. THE `scripts/persistent-loop.sh` SHALL 在判定 Case 5 到 Case 9 命中后、输出 stdout 之前，计算 `phase_state_hash = sha1sum(current_phase || current_tier || current_topic || progress_total || progress_done || review_mtime || test_mtime)` 并追加 `.tinkerman/.stop-hook-dedupe/<phase_state_hash>.ts` 的存在性检查。
2. WHEN `.tinkerman/.stop-hook-dedupe/<phase_state_hash>.ts` 存在且其 mtime 距今 < 60 秒，THE hook SHALL 跳过当次注入（silent exit 0），避免在同一 phase state 下连续多轮响应都重复注入。
3. WHEN `.tinkerman/.stop-hook-dedupe/<phase_state_hash>.ts` 不存在或其 mtime 距今 ≥ 60 秒，THE hook SHALL 执行注入、然后以 `touch .tinkerman/.stop-hook-dedupe/<phase_state_hash>.ts` 更新时间戳。
4. THE `.tinkerman/.stop-hook-dedupe/` 目录 SHALL 在首次写入前通过 `mkdir -p` 创建；IF 创建失败（权限、磁盘等），THE hook SHALL 跳过去重检查并仍执行注入（fail-open 以确保主链路不被防御性代码阻断）。
5. THE hook SHALL 包含一个 cleanup 分支：当 `.tinkerman/.stop-hook-dedupe/` 中存在 mtime 距今 > 24 小时的文件，SHALL 在 hook 任何 case 命中前通过 `find .tinkerman/.stop-hook-dedupe -mtime +1 -delete 2>/dev/null || true` 清理，防止目录无限增长。
6. THE 去重机制 SHALL NOT 影响既有 Case 1/2/3/4 的行为；仅 Case 5–9 受去重约束。Case 1 的 auto-fix loop 使用独立 `fix_iteration` 计数器，已有自限行为。
7. WHEN `.tinkerman/.stop-hook-dedupe/` 被 `.gitignore` 条目覆盖（本 spec 建议新增 `.gitignore` 条目 `.tinkerman/.stop-hook-dedupe/` 和 `.tinkerman/.stop-hook-dedupe/*`），THE dedupe 文件 SHALL NOT 被提交到 git。`.gitignore` 更新是本需求的强制组成部分。
8. THE dedupe 文件的内容 SHALL 为空（仅 mtime 有意义）。hook SHALL NOT 向其写入内容。

### Requirement 5: Loop_Iteration_Handoff 兜底推进

**User Story:** As a Forge Loop user running a multi-Sprint plan in SKILL driven mode, I want the hook to detect when one loop iteration completes but the next should begin, so that the loop does not silently terminate mid-way through the objective.

#### Acceptance Criteria

1. THE `scripts/persistent-loop.sh` SHALL 新增 Case 10 (Loop_Iteration_Handoff)，排在 Case 9 之后、`exit 0` 之前。
2. **Case 10 (loop 迭代切换)**：WHEN `.tinkerman/status.md` frontmatter 含 `mode: "autonomous"` AND `current_phase in ("ship", "completed")` AND `.tinkerman/progress/<topic>.md` 中仍存在 `[ ]` (未完成) 任务，THE hook SHALL 输出：
   ```
   🔄 [LOOP HANDOFF] 当前 phase 已 ship，但 progress 中仍有未完成任务（进入下一 Sprint）。
   请立即调用 Skill(skill="forge", args="resume") 恢复上下文并推进下一轮迭代。
   ```
3. **Case 10 扩展 (skill_sequence 未完成)**：WHEN `.tinkerman/status.md` frontmatter 含 `mode: "autonomous"` AND `skill_sequence` 字段列出的命令序列中仍有未执行阶段（判断方式：比较 `loop_iteration` 字段值与 `skill_sequence` 长度），THE hook SHALL 输出同样的 `[LOOP HANDOFF]` 文本。两种命中条件任一满足即触发。
4. THE Case 10 SHALL 与 Case 5–9 共享同一 dedupe 机制（Requirement 4），`phase_state_hash` 计算追加 `mode || loop_iteration` 两个字段。
5. THE Case 10 的 `mode: "autonomous"` 检查 SHALL 优先于 Case 8/9 的触发判定；即同一次 hook 调用中若 `mode: autonomous` 且 Case 10 命中，SHALL 直接输出 Case 10 文本并 exit，不重复触发 Case 8/9。
6. WHEN `mode: "autonomous"` 缺失或值为其他字符串（如 `"interactive"`），THE Case 10 SHALL NOT 触发，Case 8/9 按既有顺序评估。
7. THE Case 10 SHALL NOT 修改 `loop_iteration` 或 `skill_sequence` 字段；这些字段的演进由 `/forge loop` 或 `/forge resume` SKILL 本身负责。
8. IF `skill_sequence` 字段不存在或 `loop_iteration` 字段不可解析，THE Case 10 的 "skill_sequence 未完成" 子条件 SHALL 视为 false（不触发）；仅"progress 未完成"主条件可触发。

### Requirement 6: 非侵入回退与异常处理

**User Story:** As a Forge user whose `.tinkerman/` state is in an unexpected state (corrupted, mid-migration, concurrent write), I want the Stop hook to fail silently rather than inject misleading instructions, so that a broken state does not cascade into model confusion.

#### Acceptance Criteria

1. THE `scripts/persistent-loop.sh` 所有新 case 的判定 SHALL 通过既有 `read_field` / `is_fresh` / `find_latest` / `count_blocking_issues` 辅助函数完成。读取失败时函数返回空值；hook SHALL 把空值视为"条件不满足"，不触发对应 case。
2. WHEN `.tinkerman/status.md` 的 `updated` 字段距今 > 2 小时（既有 `STALE_THRESHOLD_MINUTES=120` 常量），THE hook SHALL 直接 exit 0，不评估任何新 case。此行为与既有 Case 3/4 一致。
3. WHEN `phase` 字段值不属于 Forge 八阶段之一（decide/spec/plan/build/review/test/ship/learn）且不属于既有特殊值（`approved`、`completed`、`blocked`），THE hook SHALL 把此视为 unknown 状态，exit 0。
4. WHEN `.tinkerman/reviews/*.md` 存在多份文件，THE hook SHALL 通过 `find_latest` 取 mtime 最新的一份；SHALL NOT 读取所有文件累加判断。
5. WHEN 新 case 命中但 Command_Style_Injection 文本中引用的 `<topic>` 无法从 `status.md` 的 `current_task` 字段提取（该字段为空），THE hook SHALL 使用字面量 `<current-topic>` 作为占位符输出；模型从 `.tinkerman/status.md` 自行读取实际 topic。
6. THE hook SHALL NOT 引入任何 external 命令调用（npm / node / git 子进程等）；所有判定通过 shell 内置命令、既有 lib/forge-helpers.sh 函数、和 POSIX 工具（find / grep / sed / awk）完成，保持脚本低延迟和高可移植性。
7. THE hook 的总执行时间 SHALL 在 NFR 层面不超过 500 ms（p95）。与既有 hooks.json 中 Stop hook 的隐含时限保持兼容。
8. THE hook SHALL NOT 依赖 `jq` 或 `yq` 等非默认工具；所有 YAML frontmatter 字段读取通过既有 `read_field` shell 实现完成。
9. THE Non_Intrusive_Fallback 行为 SHALL 被测试覆盖：Requirement 8 中的 case 应含"status.md 为 phase: unknown"和"status.md 缺失"两个 scenario，断言 hook 无输出、exit 0。

### Requirement 7: 指令强化方案禁止扩展

**User Story:** As a Forge maintainer, I want to prevent future contributors from adding more hard rules to CLAUDE.md / SKILL.md / next-step-protocol.md to fix auto-advance breaks, so that we do not re-enter the "more instructions do not help" failure mode documented in glm-summary-ending.md.

#### Acceptance Criteria

1. THE `.tinkerman/knowledge/glm-summary-ending.md` SHALL 包含或被更新包含一段明确声明："方案 1（强化 SKILL 指令）已到天花板，不再扩展。后续针对 Auto_Advance_Break 的修复 SHALL 优先采用 Plan 结构优化（forge-plan Self-Check）、Stop hook 扩展（persistent-loop.sh）或 evolved-rules 注入。"本 spec 的实施 SHALL 验证该段落存在；若不存在则通过本需求的 tasks 补写。
2. THE 本 spec 的 tasks.md SHALL NOT 包含任何"在 CLAUDE.md / shared/next-step-protocol.md / 各 SKILL §X 新增条款"的任务。现有条款保持原样。
3. THE `evolved-rules.md` 的 R3 SHALL 是本 spec 唯一允许的"新规则文本"出口。Stop hook 输出的命令式指令不视为规则而视为动作注入。
4. IF 未来发现 R3 + Plan_Structure_Check + Stop hook 扩展三者均不能覆盖某个新场景，THE 应由新 spec 处理，SHALL NOT 回退到"再加一条规则"。此约束通过本需求的测试/文档纪律保证而非代码执行。

### Requirement 8: 回归测试与验证

**User Story:** As a Forge maintainer, I want concrete scenarios covering both old and new Stop hook behavior, so that future changes to persistent-loop.sh do not silently break auto-advance coverage.

#### Acceptance Criteria

1. THE 本 spec 的实施 SHALL 在 `test/persistent-loop.test.sh` 或等价 shell 测试文件中新增以下 scenario：
   - `plan-approved-build-not-started` → 期望命中 Case 5，stdout 含 `请立即调用 Skill(skill="forge", args="build")`。
   - `build-done-review-missing` → 期望命中 Case 6，stdout 含 `请立即调用 Skill(skill="forge", args="review")`。
   - `review-pass-test-missing` → 期望命中 Case 7，stdout 含 `请立即调用 Skill(skill="forge", args="test")`。
   - `test-pass-ship-missing` → 期望命中 Case 8，stdout 含 `请立即调用 Skill(skill="forge", args="ship")`。
   - `ship-done-full-tier-learn-missing` → 期望命中 Case 9，stdout 含 `请立即调用 Skill(skill="forge", args="learn")`。
   - `loop-autonomous-progress-remaining` → 期望命中 Case 10，stdout 含 `[LOOP HANDOFF]`。
   - `dedupe-second-call-silent` → 连续两次调用同一 phase state，第二次期望无输出。
   - `stale-status-silent` → status.md 距今 > 2 小时，期望 exit 0 无输出。
   - `unknown-phase-silent` → phase 字段为 `unknown`，期望 exit 0 无输出。
   - `light-tier-plan-build-skipped` → Case 5 在 tier=light 下不触发（light tier 由既有早期 exit 过滤）。
   - `existing-case1-p0p1-regression` → 既有 auto-fix loop 场景在新增 case 后行为不变。
   - `existing-case3-build-exhaustion-regression` → 既有 build + exhaustion 场景在新增 case 后行为不变。
2. THE 每个测试 scenario SHALL 提供一个临时 `.tinkerman/` 目录 fixture（mktemp），准备必要的 status.md / progress / reviews / plans 文件，运行 `bash scripts/persistent-loop.sh`，断言 stdout 和 exit code。
3. THE 本 spec 的 `forge-plan` SKILL 新增的 Plan_Structure_Check SHALL 在 TypeScript 测试（`test/plan.test.ts` 或新文件）中覆盖至少四个场景：
   - `split-trigger-task-count` → 16 任务触发警告。
   - `split-trigger-sprint-headings` → 2 个 `### Sprint` 标题触发警告。
   - `split-trigger-delivery-task-name` → 任务名含"Sprint 6 回归"触发警告。
   - `monolith-acknowledged-bypass` → frontmatter 含 `monolith_acknowledged: true` 跳过警告。
4. THE 现有 `.tinkerman/plans/cmux-integration.md`（6 Sprint / 33 任务）SHALL 在本 spec 实施中被用作"真实世界触发案例"记录到 `test/fixtures/` 或 tests 的注释中；作为 regression 案例不可删除。
5. THE `/forge learn` 在添加 R3 后 SHALL 通过现有的 `evolved-rules.md` 格式验证（`rule_count` 与实际 `### R<N>:` 标题数一致）。若 Forge 当前没有此验证，SHALL 在本 spec 的 tasks 中添加一个最小化 lint 脚本（`scripts/lint-evolved-rules.mjs`）以验证一致性。

### Requirement 9: 文档与可观测性更新

**User Story:** As a Forge user debugging why my build stopped and then the model resumed on its own, I want to understand that the Stop hook injected the next-step command, so that the behavior does not feel like magic.

#### Acceptance Criteria

1. THE `scripts/persistent-loop.sh` 的新 case SHALL 在注释中标注 case 编号 (`# Case 5: plan → build`, `# Case 6: build → review`, ...) 与 Requirement 号 (`# Implements Requirement 3.2, 3.3, ...`)，便于代码审查。
2. THE `.tinkerman/knowledge/glm-summary-ending.md` SHALL 在本 spec 实施后被更新，在"实施优先级"章节追加一段记录本 spec 的 ID 和完成日期，形成知识-spec 双向链接。
3. THE `docs/` 或 `CHANGELOG.md` SHALL 包含一段条目描述 Auto_Advance_Break 兜底机制的用户可见效果，形式例如 "Stop hook 现在覆盖 plan → build、build → review、review → test、test → ship、ship → learn 和 loop 迭代切换六种自动推进场景"。
4. WHEN 用户观察到 Stop hook 注入文本时，THE 文本自身 SHALL 包含足够的上下文让用户理解这是一次自动推进提示而非正常模型输出（前缀 `🔄 [AUTO-ADVANCE]` 或 `[LOOP HANDOFF]`）。
5. THE 本 spec 的 design.md SHALL 包含一张状态机图（mermaid 或等价 ASCII）展示 Case 1–10 的判定顺序与早期 exit 条件，便于未来维护者理解优先级关系。
