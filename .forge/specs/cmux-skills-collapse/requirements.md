---
status: completed
feature: cmux-skills-collapse
layout: requirements
created: 2026-05-24
tier: standard
---
# Requirements Document

## Introduction

本特性将三个可选 cmux SKILL（原 `forge-sidebar-sync`、`forge-browser-qa`、`forge-loop-signals`）从仓库根目录的独立 `cmux-skills/` 包迁移到 v2.5 collapsed dispatcher 路径下，作为三个**平级 sub**（`forge-cmux-sidebar-sync`、`forge-cmux-browser-qa`、`forge-cmux-loop-signals`）注册到现有 29-sub allowlist 中（扩为 32-sub）。Forge_Dispatcher 在 9 步分发链路的 `validateTopic` 之后、`resolveLibPath` 之前新增一个 **Conditional_Availability_Gate** 闸门：若被调用的 sub 属于 `Cmux_Gated_Subs` 集合且 `cmuxAvailable()` 返回 false，则拒绝分发并回 `SKILL_UNAVAILABLE`，不再继续向下加载 SKILL.md 内容。

完成后将彻底移除独立的 `cmux-skills/install.sh` 安装步骤，使三种安装方式（Claude Code Plugin Marketplace、源仓库 clone、全局 `~/.claude/skills/forge` 安装）下 cmux SKILL 的可用性完全由「装了 cmux 与否」决定，与安装方式无关。

迁移必须严格保持 Zero-Impact 不变量：未安装 cmux 时三个 cmux sub 永远进不到 `resolveLibPath`，token 开销不增加，Forge 主流程行为零变化。三个 SKILL 的功能与触发关键词必须以「向后兼容超集」方式保留——原 `trigger` 关键词在迁移后仍能命中，并在此基础上扩充新的 cmux 命名空间别名。

## Glossary

- **Forge_Dispatcher**：定义于 `src/forge-dispatcher/` 的 9 步分发链路，是所有 `/forge <topic>` 调用的唯一入口与 SKILL 注册点（参见 ADR-0004 与 `skills/forge/SKILL.md §3 Dispatch Chokepoint`）。
- **Cmux_Skill**：依赖 cmux 终端能力的可选 SKILL，迁移后为三个平级 sub：`forge-cmux-sidebar-sync`、`forge-cmux-browser-qa`、`forge-cmux-loop-signals`。
- **Collapsed_Skill_Path**：v2.5 dispatcher 模式下的 SKILL 物理路径根 `skills/forge/lib/`。每个 sub 必须落在单层 `skills/forge/lib/<sub>/instructions.md` 路径下，文件名固定为 `instructions.md`（不是 `SKILL.md`）。
- **Cmux_Skill_Sub_Names**：迁移后三个 cmux sub 的目录与 `name` 字段值集合：`{forge-cmux-sidebar-sync, forge-cmux-browser-qa, forge-cmux-loop-signals}`。
- **Cmux_Gated_Subs**：dispatcher 内部的常量集合，列出所有需要通过 Conditional_Availability_Gate 闸门的 sub。本特性首批包含 `Cmux_Skill_Sub_Names` 全部三项；后续可扩展。
- **Conditional_Availability_Gate**：在 Forge_Dispatcher 9 步链路中新增的闸门步骤，位于 `validateTopic` 之后、`resolveLibPath` 之前。当被调用的 sub 属于 `Cmux_Gated_Subs` 且 `cmuxAvailable()` 返回 false 时，闸门拒绝分发并回 `SKILL_UNAVAILABLE`，链路终止于此，不进入 `resolveLibPath`。
- **Cmux_Availability_Probe**：定义于 `scripts/cmux-mirror/lib/availability.mjs` 的 `cmuxAvailable()` 函数。**1 秒超时由该模块自身保证**，零影响降级，支持 sticky-unavailable 与 `CMUX_INTEGRATION` 短路。Forge_Dispatcher 不再添加额外计时或重试逻辑。
- **Marketplace_Install**：用户通过 Claude Code Plugin Marketplace 安装 Forge plugin 的入口，运行时 `CLAUDE_PLUGIN_ROOT` 指向 plugin 根目录。
- **Source_Clone_Install**：用户 clone Forge 源仓库后运行 `scripts/init.sh` 的入口，`FORGE_ROOT` 指向仓库根。
- **Global_Skills_Install**：用户将 Forge 安装到 `~/.claude/skills/forge/` 的入口。
- **Zero_Impact_Invariant**：未安装 cmux 时所有 cmux 集成代码立即短路、Forge 行为零变化的不变量（参见 reference-advanced.md「cmux 集成（可选）」段首引文）。本特性以 4 条可量化属性具体化（见 R3.4）。
- **Legacy_Cmux_Skills_Dir**：仓库根的旧目录 `cmux-skills/`，包含 3 个 SKILL.md 与 `install.sh` 安装器，本特性完成后将被删除。
- **User_Skill_Install_Dir**：旧 `install.sh --apply` 的目标目录，默认为 `.claude/skills/`，下含 `forge-sidebar-sync/`、`forge-browser-qa/`、`forge-loop-signals/` 三个用户已安装的副本。
- **Build_Dist_Script**：构建脚本 `scripts/build-dist.sh`，输出 `dist/claude-code/bundles/forge/` 与 `dist-plugin/` 两套分发包。
- **Reference_Advanced_Doc**：用户文档 `docs/reference-advanced.md` 的「cmux 集成（可选）」段落。
- **Cmux_Integration_Plan**：`.forge/plans/cmux-integration.md` 与对应的进度文件 `.forge/progress/cmux-integration.md`。
- **Skill_Authoring_Guide**：`docs/best-practices/skill-authoring.md`，规定 `name` 字段必须匹配 `skills/forge/lib/<sub>/` 目录名（例如 `skills/forge/lib/forge-cmux-sidebar-sync/` → `name: forge-cmux-sidebar-sync`）。

## Requirements

### Requirement 1: cmux SKILL 物理位置统一到 collapsed 平级路径

**User Story:** 作为 Forge 维护者，我希望三个 cmux SKILL 与其它 29 个 sub 一样落在 `skills/forge/lib/` 单层路径下，文件名遵循 `instructions.md` 约定，避免在仓库根维护一个特殊的 `cmux-skills/` 子树，也避免引入嵌套子目录冲击 dispatcher 的 path-resolve 实现。

#### Acceptance Criteria

1. THE Forge_Repository SHALL 在 `skills/forge/lib/` 路径下保存三个并列子目录：`forge-cmux-sidebar-sync/`、`forge-cmux-browser-qa/`、`forge-cmux-loop-signals/`。
2. THE Forge_Repository SHALL 为每个 cmux 子目录提供一个 `instructions.md` 文件，路径形式为 `skills/forge/lib/<Cmux_Skill_Sub_Name>/instructions.md`，文件名固定为 `instructions.md`（不允许使用 `SKILL.md`）。
3. THE Forge_Repository SHALL 在迁移完成后删除根目录下的 `cmux-skills/` 目录及其所有子文件。
4. WHEN 迁移完成后 Forge_Dispatcher 通过 `src/forge-dispatcher/path-resolve.ts` 解析任一 cmux sub 的物理路径，THE Forge_Dispatcher SHALL 直接使用现有 `resolve(root, "skills/forge/lib", sub, "instructions.md")` 单层逻辑命中目标文件，无需任何 dispatcher 主链路代码改动。
5. THE Forge_Repository SHALL 不在 `Collapsed_Skill_Path` 之外的任何位置保留三个 Cmux_Skill 的 instructions.md 副本。
6. THE Forge_Repository SHALL 在 `skills/forge/SKILL.md §2 Subcommand Listing` 中把 sub 总数从 29 更新为 32，并把三个 `Cmux_Skill_Sub_Names` 列入相应的 tier 段落。

### Requirement 2: dispatcher 在 Conditional_Availability_Gate 按 cmux 可用性条件分发 cmux SKILL

**User Story:** 作为 Forge 用户，我希望 SKILL 列表与我本机环境一致——只有装了 cmux 才让 cmux SKILL 真正分发执行，没装就在闸门处友好拒绝并不加载任何 SKILL.md 内容，从而避免无意义的 token 开销和触发歧义。

#### Acceptance Criteria

1. THE Forge_Dispatcher SHALL 在 9 步分发链路的 `validateTopic` 之后、`resolveLibPath` 之前插入 Conditional_Availability_Gate 闸门步骤，使分发链路扩展为 10 步。
2. WHEN Forge_Dispatcher 进入 Conditional_Availability_Gate，IF 当前 sub 不属于 `Cmux_Gated_Subs`，THEN THE Forge_Dispatcher SHALL 直接放行进入 `resolveLibPath`，不调用 `cmuxAvailable()`。
3. WHEN Forge_Dispatcher 进入 Conditional_Availability_Gate，IF 当前 sub 属于 `Cmux_Gated_Subs`，THEN THE Forge_Dispatcher SHALL 调用 `Cmux_Availability_Probe.cmuxAvailable()` 判定 cmux 是否可用。
4. WHERE 当前 sub 属于 `Cmux_Gated_Subs` 且 `cmuxAvailable()` 返回 true，THE Forge_Dispatcher SHALL 放行进入 `resolveLibPath` 并按现有链路完成分发。
5. IF 当前 sub 属于 `Cmux_Gated_Subs` 且 `cmuxAvailable()` 返回 false，THEN THE Forge_Dispatcher SHALL 终止链路于闸门处，回 `SKILL_UNAVAILABLE` 状态码，并不再进入 `resolveLibPath`、不读取该 sub 的 `instructions.md`。
6. THE Cmux_Availability_Probe SHALL 自身保证 1 秒超时；THE Forge_Dispatcher SHALL 不在 Conditional_Availability_Gate 添加额外计时、重试或并行探测逻辑。
7. IF `Cmux_Availability_Probe` 进入 sticky-unavailable 状态，THEN THE Forge_Dispatcher SHALL 在该进程后续所有命中 `Cmux_Gated_Subs` 的分发中直接判定不可用，不再发起新的探测调用。
8. THE Forge_Dispatcher SHALL 把 Conditional_Availability_Gate 的判定结果记录到 dispatch audit log，字段需包含：sub 名、是否属于 `Cmux_Gated_Subs`、`cmuxAvailable()` 返回值、最终是放行还是回 `SKILL_UNAVAILABLE`。

### Requirement 3: 未安装 cmux 时维持 Zero-Impact 不变量

**User Story:** 作为不使用 cmux 的 Forge 用户，我希望本次迁移之后我的 token 开销与迁移前完全一致，Forge 主流程行为不发生任何可观察变化，旧的非 cmux sub 调用路径在字节级别上不受任何干扰。

#### Acceptance Criteria

1. WHEN 未安装 cmux 的用户调用任意非 `Cmux_Gated_Subs` 的 sub（例如 `/forge build`、`/forge review`），THE Forge_Dispatcher SHALL 在 Conditional_Availability_Gate 直接放行，不调用 `cmuxAvailable()`、不读取任何 cmux sub 的 instructions.md。
2. WHEN 未安装 cmux 的用户调用任意 `Cmux_Gated_Subs` 中的 sub，THE Forge_Dispatcher SHALL 在 Conditional_Availability_Gate 终止链路并回 `SKILL_UNAVAILABLE`，不读取该 sub 的 instructions.md，亦不向用户展示该 SKILL 的全文内容。
3. THE Forge_Repository SHALL 不在主 SKILL 注册路径中静态嵌入三个 Cmux_Skill 的 instructions.md 全文（例如不内联拼入 `skills/forge/SKILL.md`、不嵌入 dispatcher 源码字符串常量）。
4. THE Forge_Dispatcher SHALL 在「未安装 cmux」环境下满足以下 4 条可量化的 Zero_Impact_Invariant 属性：
    a. 调用任意非 `Cmux_Gated_Subs` sub 时，stdout 与 stderr 输出与迁移前逐字节一致；
    b. 调用任意非 `Cmux_Gated_Subs` sub 时，不创建任何位于 `.forge/`、`.claude/` 或仓库其它位置的额外临时文件、缓存文件或 dedupe 文件；
    c. 调用任意非 `Cmux_Gated_Subs` sub 时，不修改 `.forge/`、`.claude/`、`hooks/` 下任何已有配置文件（mtime 与 sha256 与迁移前一致）；
    d. 在装包的 `dist-plugin/skills/forge/lib/` 下取「非 cmux sub instructions.md 集合」的 sha256 manifest 与迁移前的同一集合 manifest 完全相等。
5. WHEN cmux 探测失败或超时，THE Forge_Dispatcher SHALL 按 cmux 不可用处理并完成 Conditional_Availability_Gate 拒绝，不阻断用户调用其它非 cmux sub，且不向用户输出任何探测尝试或失败的提示信息（静默继续）。
6. IF 未安装 cmux，THEN THE Forge_Dispatcher SHALL 不把任何 cmux sub 的 instructions.md 内容加载进内存或上下文（包括但不限于预读、缓存、摘要、日志回显），以保证真正的 Zero-Impact。

### Requirement 4: 三种安装入口下 cmux SKILL 行为一致

**User Story:** 作为通过 Marketplace、源仓库 clone 或全局 `~/.claude/skills/forge/` 安装 Forge 的用户，我希望无论选择哪种安装方式，cmux SKILL 的可用性都只由「我的机器装没装 cmux」决定，安装方式本身不影响 dispatcher 的判定与拒绝行为。

#### Acceptance Criteria

1. WHEN 用户通过 Marketplace_Install 完成 plugin 安装，THE Forge_Dispatcher SHALL 在解析 cmux sub 物理路径时使用 `${CLAUDE_PLUGIN_ROOT}/skills/forge/lib/<Cmux_Skill_Sub_Name>/instructions.md` 作为目标路径。
2. WHEN 用户通过 Source_Clone_Install 在仓库根运行 `/forge` 命令，THE Forge_Dispatcher SHALL 在解析 cmux sub 物理路径时使用仓库根下的 `skills/forge/lib/<Cmux_Skill_Sub_Name>/instructions.md` 作为目标路径。
3. WHEN 用户通过 Global_Skills_Install 把 Forge 装到 `~/.claude/skills/forge/`，THE Forge_Dispatcher SHALL 在解析 cmux sub 物理路径时使用与全局安装路径约定一致的 `skills/forge/lib/<Cmux_Skill_Sub_Name>/instructions.md`，复用现有 `resolveLibPath` 双模式（`CLAUDE_PLUGIN_ROOT ?? cwd`）逻辑。
4. WHERE 三种安装入口对应的 cmux 探测在同一台机器上结果相同，THE Forge_Dispatcher SHALL 在三种入口下产生相同的 Conditional_Availability_Gate 判定结果（同时放行或同时回 `SKILL_UNAVAILABLE`）。
5. THE Forge_Dispatcher SHALL 不依赖 `cmux-skills/install.sh` 或任何用户级 SKILL 拷贝步骤即可在三种入口下正确发现并条件分发 cmux SKILL。

### Requirement 5: 移除旧的独立 installer 与其引用

**User Story:** 作为 Forge 维护者，我希望条件加载完成后，旧的 `cmux-skills/install.sh` 与其在文档、init 脚本、构建脚本中的引用全部清理干净，避免遗留死代码与误导性指引。

#### Acceptance Criteria

1. THE Forge_Repository SHALL 在迁移完成后不再包含 `cmux-skills/install.sh` 文件。
2. THE Forge_Repository SHALL 在迁移完成后不再包含任何指向 `cmux-skills/install.sh` 的脚本调用、文档命令片段或 hook 配置项。
3. WHEN 维护者在仓库内全文搜索字符串 `cmux-skills/install.sh`，THE Forge_Repository SHALL 不返回除归档目录（`.forge/archive/`）和已归档 spec 之外的任何匹配。
4. THE Forge_Repository SHALL 在迁移完成后不再包含 `cmux-skills/forge-sidebar-sync/`、`cmux-skills/forge-browser-qa/`、`cmux-skills/forge-loop-signals/` 三个子目录。
5. WHEN 迁移脚本执行旧目录清理，IF 上述任一子目录或文件无法被成功删除，THEN THE 迁移脚本 SHALL 中止整体清理流程并报告错误，不允许部分删除留下不一致状态。
6. IF 旧引用必须在归档目录中保留以供历史溯源，THEN THE Forge_Repository SHALL 仅在 `.forge/archive/` 或带「archived」/「superseded」标记的 spec 文档中保留这些字符串。

### Requirement 6: reference-advanced.md 文档同步重写

**User Story:** 作为阅读 Forge 用户文档的开发者，我希望 cmux 集成段落与新的条件加载机制一致——告诉我「装上 cmux 后下次 `/forge` 调用即可启用」，而不是要求我跑两条 bash 命令。

#### Acceptance Criteria

1. THE Reference_Advanced_Doc SHALL 在「cmux 集成（可选）」段落中说明 cmux SKILL 由 Forge_Dispatcher 在运行时通过 Conditional_Availability_Gate 按 `cmuxAvailable()` 探测结果条件分发，无需用户手动安装。
2. THE Reference_Advanced_Doc SHALL 不再在「使用」段落中提供 `bash cmux-skills/install.sh --apply .claude/skills` 命令。
3. THE Reference_Advanced_Doc SHALL 不再在「卸载」段落中提供 `bash cmux-skills/install.sh --uninstall .claude/skills` 命令。
4. THE Reference_Advanced_Doc SHALL 在「使用」段落中给出新的启用步骤：「安装 cmux 后，下次 `/forge` 调用即可自动检测并启用 cmux SKILL，sticky 状态机在该进程内保持判定结果」。
5. THE Reference_Advanced_Doc SHALL 在「卸载」段落中说明：卸载或停用 cmux 后，下次 `/forge` 调用 Conditional_Availability_Gate 自动转为拒绝分发，cmux SKILL 自然失活，无需额外清理步骤。
6. THE Reference_Advanced_Doc SHALL 在「新增文件」段落中把 `cmux-skills/` 条目替换为 `skills/forge/lib/forge-cmux-sidebar-sync/`、`skills/forge/lib/forge-cmux-browser-qa/`、`skills/forge/lib/forge-cmux-loop-signals/` 三条平级条目。

### Requirement 7: build-dist 简化，无需为 cmux SKILL 增加特殊打包逻辑

**User Story:** 作为发布者，我希望 cmux SKILL 跟随 `skills/` 目录自然进入分发包，构建脚本不需要为它们增加任何特殊处理，从而降低构建脚本的复杂度。

#### Acceptance Criteria

1. WHEN Build_Dist_Script 执行时拷贝 `skills/` 到 `dist/claude-code/bundles/forge/`，THE Build_Dist_Script SHALL 同时把 `skills/forge/lib/forge-cmux-sidebar-sync/`、`skills/forge/lib/forge-cmux-browser-qa/`、`skills/forge/lib/forge-cmux-loop-signals/` 三个子目录及其下 `instructions.md` 一并打包，无需额外命令。
2. WHEN Build_Dist_Script 执行时拷贝 `skills/` 到 `dist-plugin/`，THE Build_Dist_Script SHALL 同时把上述三个子目录及其下 `instructions.md` 一并打包，无需额外命令。
3. THE Build_Dist_Script SHALL 不再包含任何针对 `cmux-skills/` 目录的特殊拷贝、判断或排除逻辑。
4. WHEN Build_Dist_Script 完成后生成 `.manifest.sha256`，THE Build_Dist_Script SHALL 在 manifest 中包含三个 `skills/forge/lib/forge-cmux-*/instructions.md` 文件的 sha256 条目。

### Requirement 8: 三个 SKILL 的功能与触发关键词以向后兼容超集方式保留

**User Story:** 作为已经依赖 cmux SKILL 的用户，我希望迁移之后这三个 SKILL 的功能完全保留；触发关键词以「超集」方式扩充——原 trigger 仍能命中迁移后的 sub，并且新增 cmux 命名空间别名（例如 `forge cmux sidebar`）也能命中。

#### Acceptance Criteria

1. THE Forge_Repository SHALL 在 `skills/forge/lib/forge-cmux-sidebar-sync/instructions.md` 中保留与原 `cmux-skills/forge-sidebar-sync/SKILL.md` 一致的功能描述、Activation 段、What It Shows 段、Requirements 段与 Zero-Impact 段。
2. THE Forge_Repository SHALL 在 `skills/forge/lib/forge-cmux-browser-qa/instructions.md` 中保留与原 `cmux-skills/forge-browser-qa/SKILL.md` 一致的 Usage 段、Verdict States 表、Artifact 段与 Zero-Impact 段。
3. THE Forge_Repository SHALL 在 `skills/forge/lib/forge-cmux-loop-signals/instructions.md` 中保留与原 `cmux-skills/forge-loop-signals/SKILL.md` 一致的 Loop States 段、Activation 段、Requirements 段与 Zero-Impact 段。
4. THE Forge_Repository SHALL 把迁移后三个 instructions.md frontmatter 的 `name` 字段更新为 `forge-cmux-sidebar-sync`、`forge-cmux-browser-qa`、`forge-cmux-loop-signals`，与目录名严格一致以满足 Skill_Authoring_Guide 命名约定。
5. THE Forge_Repository SHALL 把迁移后三个 instructions.md frontmatter 的 `trigger` 字段值集合配置为「原集合 ⊇」的超集——必须包含原 `trigger` 关键词的全部条目（例如 `forge sidebar sync`、`cmux sidebar`、`sync sidebar` 等），并允许新增带 `cmux` 命名空间的别名（例如 `forge cmux sidebar`、`forge cmux loop`）。
6. WHEN 用户在装有 cmux 的环境下使用任一原 `trigger` 关键词触发命令，THE Forge_Dispatcher SHALL 仍然能够命中迁移后的对应 sub 并通过 Conditional_Availability_Gate 放行至 `resolveLibPath`。
7. THE Forge_Repository SHALL 在迁移后三个 instructions.md frontmatter 中保留或新增必要的 dispatcher 元数据字段（例如 `disable-model-invocation: true`），以满足 v2.5 collapsed dispatcher 模式约束。

### Requirement 9: cmux-integration plan 与 progress 状态同步更新

**User Story:** 作为查阅 Forge 进度文档的维护者，我希望 cmux-integration 的 plan 与 progress 文件能反映本次迁移——Task 27（cmux-skills/）和 Task 30（README/reference-advanced.md）的状态、文件路径与 Notes 与本特性产物保持一致。

#### Acceptance Criteria

1. THE Cmux_Integration_Plan SHALL 在 File Mapping 段中把 `cmux-skills/forge-sidebar-sync/SKILL.md`、`cmux-skills/forge-browser-qa/SKILL.md`、`cmux-skills/forge-loop-signals/SKILL.md`、`cmux-skills/install.sh` 四条记录更新为反映新路径（`skills/forge/lib/forge-cmux-*/instructions.md`）的条目，或在 Notes 中显式说明已被本 spec（`cmux-skills-collapse`）取代。
2. THE Cmux_Integration_Plan SHALL 在 Sprint 5 Task 27 的状态或 Notes 中追加对 `cmux-skills-collapse` 特性的引用。
3. THE Cmux_Integration_Plan SHALL 在 Sprint 6 Task 30 的 Notes 中更新为反映「reference-advanced.md 已按条件分发方式重写」。
4. WHEN 维护者读取 `.forge/progress/cmux-integration.md`，THE 进度文件 SHALL 在 Task 27 或 Task 30 行追加链接或文字指向 `.forge/specs/cmux-skills-collapse/`。
5. THE Cmux_Integration_Plan SHALL 不修改已批准的 Objective、Design Reference Index 与 Sprint 1–4 已完成任务的 Status 字段。

### Requirement 10: 旧用户安装目录的向后兼容清理

**User Story:** 作为之前跑过 `bash cmux-skills/install.sh --apply .claude/skills` 的用户，我希望升级到新版本后，老的 `.claude/skills/forge-sidebar-sync/` 等用户级副本不会与 Conditional_Availability_Gate 的判定冲突，并且我能找到清晰的清理指引。

#### Acceptance Criteria

1. THE Reference_Advanced_Doc SHALL 在迁移版本的「升级说明」或等价段落中提供清理 `.claude/skills/forge-sidebar-sync/`、`.claude/skills/forge-browser-qa/`、`.claude/skills/forge-loop-signals/` 三个旧目录的命令。
2. WHEN 用户的 `.claude/skills/` 目录下同时存在旧的 `forge-sidebar-sync/`（或其他两个）副本，THE Forge_Dispatcher SHALL 仍然按本特性的 Conditional_Availability_Gate 判定 cmux sub 的分发结果，不因旧副本而把 cmux SKILL 重复注册或绕过闸门。
3. IF 旧 `.claude/skills/forge-sidebar-sync/` 副本与新 `forge-cmux-sidebar-sync` sub 在 trigger 关键词层面发生命中冲突，THEN THE Forge_Dispatcher SHALL 优先使用 `Collapsed_Skill_Path` 下的新 sub，并在 audit log 中记录冲突。
4. THE Reference_Advanced_Doc SHALL 说明用户保留旧目录不会破坏 Zero_Impact_Invariant：未装 cmux 时旧目录中的 SKILL 仍然受其原 SKILL.md 内 `Requirements: cmux installed` 前置条件约束而自然失活，迁移本身不新增运行时拦截逻辑。
5. THE Forge_Repository SHALL 不在仓库或分发包中提供任何会自动删除用户 `.claude/skills/` 目录内容的脚本（清理由用户根据文档手动执行）。
