---
feature: mattpocock-skill-craft-borrow
status: locked
date: 2026-06-21
layout: requirements
created: 2026-06-21
tier: standard
workflow_variant: requirements-first
kind: feature
brownfield: true
source: https://github.com/mattpocock/skills (v1.0.1, 2026-06-18)
pending_glossary_advisories: [user-invoked, model-invoked, smart-zone, leading-word, completion-criterion, no-op, tight-loop, out-of-scope]
---

# Requirements Document

## Purpose

深度调研 mattpocock/skills v1.0.0–v1.0.1 后,识别出 9 项值得 Forge 借鉴的"skill 工艺(skill craft)"改进。mattpocock 是单作者个人技能包,在 **skill 设计词汇、会话拓扑、元技能自审**上领先;Forge 在**流程纪律与 gating**上领先。两者互补。

本 spec 把 9 点落地为 Forge 的可执行改动,分三类:
- **A. 心智模型与文档**(R1–R3,R5,R6):user/model-invoked 二分、router 会话拓扑、CONTEXT/ADR/out-of-scope 三分、completion criterion 治"过早完成"、failure-modes 词汇表。
- **B. 流程门禁增强**(R4,R8):`/forge debug` 现有 Phase 1(Symptom Gathering)收紧为"产出 red-capable 回路作为 Phase 1→2 gate";review 共享词汇单源化。
- **C. 现有资产体检**(R7,R9):用 no-op 测试给 `AGENTS.md`/SKILL 瘦身;leading words 提炼。

**反范围蔓延**:本 spec **不重写** Forge 的三级路由、TDD 铁律、review 三层架构、knowledge loop——这些是 Forge 已比 mattpocock 强的部分,只做**增量增强**。每条 Requirement 标注其 mattpocock 出处,确保借鉴有据。

## Glossary

| Term | Definition |
|------|-----------|
| User-invoked skill | 只能被人手输触发、零 context load 的 skill(mattpocock `disable-model-invocation: true`) |
| Model-invoked skill | agent 可自主触发也可手输、保留 description 但每轮占 context 的 skill |
| Context Load | model-invoked skill 的 description 每轮占用窗口的代价 |
| Cognitive Load | user-invoked skill 要求人记住其存在的代价 |
| Smart Zone | 模型仍能锐利推理的窗口区间(~120k tokens),逼近应换会话 |
| Tight Loop | diagnosing-bugs 中快、确定、能在具体 bug 上变 red 的 pass/fail 信号 |
| Red-capable | 回路能驱动真实 bug 代码路径并断言用户确切症状,修复后变 green |
| Leading Word | 模型预训练里已有的紧凑词,锚定整片行为、省 token(mattpocock 亦称 Leitwort) |
| Completion Criterion | 告诉 agent 步骤是否完成的条件;checkable + exhaustive 两属性 |
| No-Op | 模型默认就会做、写了不改变行为的指令(mattpocock no-op 测试) |
| Failure Modes | mattpocock skill 质量诊断词:premature completion / duplication / sediment / sprawl / no-op |
| Out-of-scope KB | 被拒绝的需求库,防止 triage 反复评估同一被否请求 |

## Requirements

### Requirement 1: User-invoked / Model-invoked 二分标签 [出处: mattpocock docs/invocation.md]

Forge 的 skill 资产(`.agents/skills/`、`.Codex/agents/`、`skills/`)显式区分 user-invoked 与 model-invoked,description 写法按调用方分化,降低主 context 的 context load。

#### Acceptance Criteria

- 当 Forge 的 skill 组织约定被文档化时 系统应当 在 `docs/forge-constitution-detail.md` 新增小节定义 user-invoked / model-invoked 二分,含"两种 load"context load / cognitive load 权衡。
- 当 user-invoked skill 的 description 被书写时 系统应当 写成人的一句话摘要,**剥离**触发词列表("Use when…")。
- 当 model-invoked skill 的 description 被书写时 系统应当 保留富触发短语("Use when the user wants…, mentions…")。
- 当二分规则被表述时 系统应当 显式声明约束:user-invoked 可调用 model-invoked,但**永远不能调用另一个 user-invoked**。
- 当 Forge 现有 skill 被盘点时 系统应当 产出一份清单标注每个 skill 的 invocation 类型,纳入 spec 附件或 `docs/`。

### Requirement 2: Router 会话拓扑 + Smart Zone 阈值 [出处: mattpocock ask-matt/SKILL.md]

`docs/forge-constitution-detail.md §6 会话边界` 补充"会话拓扑"视角:哪些阶段必须同窗、哪些必须换窗,以及 smart zone(~120k tokens)量化阈值。

#### Acceptance Criteria

- 当 §6 被更新时 系统应当 区分三类会话节点:主流程(必须同窗的连续阶段)、on-ramp(汇聚到主流程的入口)、跨会话桥(handoff/换窗)。
- 当主流程节点被描述时 系统应当 标注 decide/spec/plan 的同窗关系,以及每个 build task 应开全新会话。
- 当 smart zone 阈值被引入时 系统应当 声明 ~120k tokens 为"降级区"起点,逼近时建议 `/forge resume` 换新会话而非硬撑(不阻断)。
- 当 handoff 与 compact 的区别被说明时 系统应当 用"fork(新会话引用文件)vs continue(同会话摘要)"二分表达。
- 当拓扑规则被引入时 系统应当 与现有 §6"会话恢复/并发控制"段落共存,不覆盖。

### Requirement 3: CONTEXT.md / ADR / Out-of-scope 三分 [出处: mattpocock domain-modeling + triage]

Forge 的领域文档分层与 triage 防重复评估机制,引入"被拒需求库"。

#### Acceptance Criteria

- 当 Forge 的知识文档分层被文档化时 系统应当 区分:glossary(纯术语表,禁实现细节)、decisions(ADR,仅三条件全满足时建)、rejected-requests(被拒需求库)。
- 当 ADR 创建门控被表述时 系统应当 声明三条件:①难以逆转 ②没背景会困惑 ③真实权衡;缺一跳过。
- 当 `/forge decide` 或 `/forge triage`(若存在)评估需求时 系统应当 先查 rejected-requests 库,命中相似项则直接引用结论不重复评估。
- 当需求被显式拒绝时 系统应当 写入 `.tinkerman/knowledge/out-of-scope/`(或等价路径),并在原决策处链接。
- 当三分机制落地时 系统应当 与现有 `.tinkerman/knowledge/` 共存,不破坏 §4 knowledge loop 的五维度提取。

### Requirement 4: /forge debug Phase 1 收紧为 red-capable 回路 gate [出处: mattpocock diagnosing-bugs/SKILL.md]

`/forge debug` 现有 Five-Phase 结构的 **Phase 1(Symptom Gathering)** 被强化:产出一条 tight red-capable 回路作为 **Phase 1→2(Symptom Gathering → Hypothesis Generation)的前置 gate**。在 red-capable 回路存在前,禁止进入假设阶段。**不新增 Phase 编号,改造现有 Phase 1 的完成判定 + 新增 Phase 2 前置 gate。**

#### Acceptance Criteria

- 当 `/forge debug` 执行现有 Phase 1(Symptom Gathering)时 系统应当 产出一条 tight red-capable 回路,作为 Phase 1 的产物与 Phase 2(Hypothesis Generation)的前置 gate。
- 当 Phase 1 回路完成判定被定义时 系统应当 要求:能命名**一条具体命令**(脚本路径/测试调用/curl),已**至少运行一次**,且 red-capable(驱动真实 bug 路径并断言用户确切症状)、deterministic、fast、agent-runnable。
- 当 red-capable 回路不存在时 系统应当 **阻断**进入 Phase 2 假设阶段,并提示这正是该 skill 要防止的失败。
- 当 bug 为非确定性时 系统应当 允许以"高复现率"替代确定性复现,记录复现率。
- 当确实无法建回路时 系统应当 要求显式声明、列出已尝试手段、向用户请求环境/捕获产物/临时探针授权,**不**继续假设。
- 当 Phase 1 gate 文档被写入时 系统应当 落到 debug 相关 SKILL/`docs/`,使用 leading words `tight` 与 `red-capable`,并与现有 §2.4 three-strike 联动说明。

### Requirement 5: Completion Criterion 治"过早完成" [出处: mattpocock writing-great-skills GLOSSARY]

Forge 的 task 列表与 build/review 步骤补 per-step 的 checkable + exhaustive completion criterion。

#### Acceptance Criteria

- 当 completion criterion 两属性被文档化时 系统应当 定义:clarity(能否区分 done/not-done)+ demand(要求多少工作量)。
- 当 Forge task 模板被审视时 系统应当 标注现有 plan task 列表哪些 step 缺 checkable criterion。
- 当防御顺序被表述时 系统应当 声明:**先磨利边界(便宜本地)**,仅当边界不可磨利且观察到抢跑时才**拆分藏后续步骤**。
- 当 demand 属性被应用时 系统应当 示例对照:"每个被改的 model 都 account for"(高 demand)vs"产出变更清单"(低 demand)。
- 当该机制被引入时 系统应当 作为 §2.5 Context Refresh / build 指导的增强,不新增独立阶段。

### Requirement 6: Failure Modes 词汇表(skill 自审清单) [出处: mattpocock writing-great-skills + GLOSSARY]

把 mattpocock 五种 failure modes 作为 Forge 自有 skill / 宪法 / SKILL 的自审清单。

#### Acceptance Criteria

- 当 failure modes 被引入时 系统应当 定义五个词及判据:premature completion / duplication / sediment / sprawl / no-op。
- 当 no-op 测试被定义时 系统应当 表述为:**这行 vs 模型默认,行为有变吗?** 无变即 no-op,删。
- 当自审清单被安置时 系统应当 放入 `docs/` 作为 Forge skill 质量参考,并在 skill-creator 类 skill 中引用。
- 当 duplication 被定义时 系统应当 与 single-source-of-truth 关联:同一含义多 source 即违规。
- 当 sediment 被定义时 系统应当 表述为"加比删安全导致的旧内容沉淀",并给出清理触发。

### Requirement 7: AGENTS.md / SKILL no-op 体检 [出处: mattpocock writing-great-skills no-op 测试]

用 no-op 测试逐句过 `AGENTS.md` 与核心 SKILL,删模型默认就会做的指令,降 context load。

#### Acceptance Criteria

- 当体检执行时 系统应当 产出 `AGENTS.md` 的 no-op 清单:标注每条疑似 no-op 的句子 + 删除/保留建议。
- 当指令被判定 no-op 时 系统应当 给出判据:模型在该上下文默认行为是否已满足该指令。
- 当铁律(<IRON-LAW>)被审视时 系统应当 **保留**所有铁律(no-op 测试不适用于强制纪律,铁律的价值是阻断而非提示)。
- 当体检完成后 系统应当 估算删除带来的 context load 降幅(行数/token 估算)。
- 当体检结论被记录时 系统应当 纳入 `.tinkerman/specs/` 或 findings,作为后续 build 的依据。

### Requirement 8: Review 共享词汇单源化 [出处: mattpocock codebase-design 共享 skill 模式]

把 review 三层 checker(spec-check/quality-check/security-check)重复的概念抽成共享 reference,各 checker 单源引用。

#### Acceptance Criteria

- 当 review 三层重复概念被识别时 系统应当 盘点 spec-check/quality-check/security-check 中重复的规则/定义。
- 当共享 reference 被抽出时 系统应当 落地为 model-invoked 共享 skill 或 `skills/forge/lib/review/` 下的共享文档,各 checker 通过引用而非复制取用。
- 当 checker 引用共享内容时 系统应当 用 prose 式调用("/引用 review 共享词汇"),不用深路径文件交叉引用。
- 当单源化完成时 系统应当 保证:改一处规则,三个 checker 同步生效。
- 当本改动落地时 系统应当 不改 review 三层架构、不改 P0/P1 阻断逻辑、不改 fallback ladder。

### Requirement 9: Leading Words 提炼 [出处: mattpocock writing-great-skills Leading Word]

给 Forge 关键流程提炼 leading words,优先用预训练已有词,提升一致性、省 token。

#### Acceptance Criteria

- 当 leading word 选取原则被文档化时 系统应当 声明:优先预训练已有词,自创需付定义成本。
- 当 Forge 流程被扫描时 系统应当 为 debug 提炼 `tight` / `red-capable`(与 R4 协同),为 verification 提炼候选词(如把"验证必须基于刚运行的命令"凝练)。
- 当 leading word 被引入时 系统应当 在对应 SKILL/宪法中重复使用该 token(非整句)锚定行为。
- 当现有 <IRON-LAW name="..."> 被审视时 系统应当 视为 leading word 的雏形,评估是否进一步提炼。
- 当 leading word 落地时 系统应当 不强制每处都用,强词一处即可(mattpocock:"a strong leading word might only be needed once")。

## Non-Functional Requirements

- **增量非重写**:所有改动是增强现有结构,不重写三级路由/TDD/review 三层/knowledge loop。
- **出处可溯**:每条 Requirement 标注 mattpocock 出处,借鉴有据,防止"假借鉴"。
- **文档紧凑**:新增文档遵循 Forge §2.6 Output Conciseness,不制造 sprawl。
- **向后兼容**:所有改动与现有 `.tinkerman/` 结构、frontmatter、铁律共存。
- **分级落地**:R1/R2/R5/R6/R9 偏文档(轻);R3/R7 偏盘点(中);R4/R8 偏门禁/结构(重)。

## Out of Scope

- 不引入 Claude Code 的 `disable-model-invocation` frontmatter 字段到 Forge 自有 skill 系统(Forge 用自有约定表达二分)。
- 不照搬 mattpocock 的 changesets 版本管理(Forge 已有版本机制)。
- 不引入 mattpocock 的 teach/grilling/prototype 等 skill(Forge 有自己的等价物或不需要)。
- 不改 Forge 的三级路由命令序列(Light/Standard/Full)。
- 不把 mattpocock 的 HTML 报告(improve-codebase-architecture)搬进 Forge。
- 不重写 AGENTS.md(只做 no-op 体检 + 增量删除,R7)。

## Delta

### Added
- user-invoked / model-invoked 二分文档(R1)。
- 会话拓扑 + smart zone 阈值(R2)。
- rejected-requests(out-of-scope)库机制(R3)。
- `/forge debug` Phase 1 red-capable 回路 gate(R4,改造现有 Phase 1 不新增编号)。
- completion criterion 两属性文档(R5)。
- failure modes 自审词汇表(R6)。
- review 共享词汇单源(R8)。
- Forge leading words 词表(R9)。

### Modified
- `docs/forge-constitution-detail.md §6`(R2 会话拓扑)。
- `/forge debug` 相关 SKILL/docs(R4 强化 Phase 1 + 新增 Phase 1→2 gate)。
- review 三层 checker 的重复规则改单源引用(R8)。
- `AGENTS.md` 增量删 no-op(R7,仅删除不改语义)。

### Unchanged
- Forge 三级路由、TDD 铁律、review 三层架构、P0/P1 阻断、fallback ladder、knowledge loop 五维度——全部不动。
- 现有所有 <IRON-LAW> 铁律保留(R7 显式豁免)。

## 反漂移声明

- **主目标**:把 mattpocock 的 skill 工艺增量引入 Forge,增强心智模型/会话拓扑/门禁/自审,不重写 Forge 已有强项。
- **非目标代理信号**:不照搬 mattpocock 全部 skill(teach/grilling/prototype 等不引入);不引入 Claude 专有 frontmatter;不改三级路由;不重写宪法(只增量删 no-op)。
- **验证材料角色**:需求满足的证据是——文档新增含出处、门禁可检测、共享单源可 grep、体检清单可执行、leading words 可在 SKILL 中检索到。

## Validation Contract

### VAL-R1-001: 二分文档存在
**Verify-By**: `bash:contract`
**Evidence**: `grep -ri "user-invoked\|model-invoked" docs/forge-constitution-detail.md` 非空,且命中"context load"与"cognitive load"
**Covers**: R1.AC1, R1.AC4

### VAL-R1-002: description 写法分化
**Verify-By**: `bash:contract`
**Evidence**: 文档含"user-invoked description 剥离触发词"与"model-invoked 保留富触发短语"两条规则
**Covers**: R1.AC2, R1.AC3

### VAL-R1-003: skill 盘点清单
**Verify-By**: `bash:contract`
**Evidence**: 存在清单文件(如 `docs/skill-inventory.md`)标注每个 skill 的 invocation 类型
**Covers**: R1.AC5

### VAL-R2-001: 会话拓扑三节点
**Verify-By**: `bash:contract`
**Evidence**: `grep -E "主流程|on-ramp|跨会话|handoff" docs/forge-constitution-detail.md` 命中三类节点
**Covers**: R2.AC1, R2.AC2

### VAL-R2-002: smart zone 阈值
**Verify-By**: `bash:contract`
**Evidence**: `grep -E "120k|smart zone|降级区" docs/forge-constitution-detail.md` 非空
**Covers**: R2.AC3

### VAL-R3-001: 三分文档
**Verify-By**: `bash:contract`
**Evidence**: 文档含 glossary / ADR三条件 / rejected-requests 三类区分
**Covers**: R3.AC1, R3.AC2

### VAL-R3-002: out-of-scope 库机制
**Verify-By**: `bash:contract`
**Evidence**: `grep -ri "out-of-scope\|rejected-requests" .tinkerman/knowledge/ docs/` 命中机制描述或目录约定
**Covers**: R3.AC3, R3.AC4

### VAL-R4-001: Phase 1 gate 存在
**Verify-By**: `bash:contract`
**Evidence**: debug 相关 SKILL/docs 命中 "Phase 1" 与 "red-capable" 与 gate("前置 gate"/"Phase 1→2"),且不新增 Phase 编号
**Covers**: R4.AC1, R4.AC2

### VAL-R4-002: 无回路禁假设
**Verify-By**: `bash:contract`
**Evidence**: 文档命中"red-capable 回路不存在时阻断进入假设阶段"
**Covers**: R4.AC3

### VAL-R4-003: leading words 落地
**Verify-By**: `bash:contract`
**Evidence**: `grep -rw "tight\|red-capable" skills/forge/lib/debug/ docs/` 非空
**Covers**: R4.AC6

### VAL-R5-001: completion criterion 文档
**Verify-By**: `bash:contract`
**Evidence**: 文档含 clarity + demand 两属性定义及防御顺序"先磨利边界"
**Covers**: R5.AC1, R5.AC3

### VAL-R6-001: failure modes 词汇表
**Verify-By**: `bash:contract`
**Evidence**: `grep -rw "premature completion\|sediment\|sprawl\|no-op" docs/` 命中五个词的至少四个
**Covers**: R6.AC1

### VAL-R6-002: no-op 测试表述
**Verify-By**: `bash:contract`
**Evidence**: 文档命中"这行 vs 模型默认,行为有变吗"
**Covers**: R6.AC2

### VAL-R7-001: AGENTS.md no-op 体检清单
**Verify-By**: `bash:contract`
**Evidence**: 存在体检清单(spec 附件或 `.tinkerman/findings/`),含每条疑似 no-op + 建议
**Covers**: R7.AC1

### VAL-R7-002: 铁律豁免
**Verify-By**: `bash:contract`
**Evidence**: 体检清单显式声明 <IRON-LAW> 不适用 no-op 测试,全部保留
**Covers**: R7.AC3

### VAL-R8-001: review 重复概念盘点
**Verify-By**: `bash:contract`
**Evidence**: 存在盘点文档列出三层 checker 重复规则
**Covers**: R8.AC1

### VAL-R8-002: 共享单源可 grep
**Verify-By**: `bash:contract`
**Evidence**: `ls skills/forge/lib/review/` 或等价位置存在共享词汇文件,三个 checker 引用而非复制
**Covers**: R8.AC2, R8.AC3, R8.AC4

### VAL-R9-001: leading words 词表
**Verify-By**: `bash:contract`
**Evidence**: 存在 Forge leading words 词表文档,含选取原则"优先预训练已有词"
**Covers**: R9.AC1, R9.AC2

### VAL-R9-002: leading words 落地检索
**Verify-By**: `bash:contract`
**Evidence**: `grep -rw "tight\|red-capable" skills/ docs/` 在至少一处 SKILL 中被使用
**Covers**: R9.AC3
