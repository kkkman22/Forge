---
status: completed
feature: oz-skills-inspiration
layout: requirements
created: 2026-05-08
tier: standard
---
# 需求文档：借鉴 warpdotdev/oz-skills 的能力吸收

## 简介

基于对 [warpdotdev/oz-skills](https://github.com/warpdotdev/oz-skills) 的深度分析（15 个 SKILL.md + AGENTS.md 风格指南），从中提取 **6 项** 与 Forge 「流程 + 纪律 + 状态」定位互补、不破坏现有架构、可渐进落地的能力增强项。本 spec 将这 6 项作为一个整体包规划，**按价值从高到低排序**。

**当前现状（2026-05-08 审计）**：
- `scripts/validate-skill-descriptions.mjs` 已存在并校验：非空、≤1024 字符、含 "Use when"、禁用营销/版本号/日期模式
- `scripts/validate-skill-length.mjs` 已存在并校验：SKILL.md ≤ 150 行（progressive disclosure）
- 19 个 `skills/forge-*/SKILL.md` 的 description 全部已含 "Use when" 短语，合规现状良好
- 本 spec 的多数需求是**扩展既有校验 + 补齐缺失章节**，而非从零新建

**价值评估维度**：投入产出比、对路由精度的贡献、对审计盲区的弥补、对 token 预算的影响、对现有三区文件保护模型的冲击度、工程风险。

**目标**：

1. 把所有 `skills/forge-*/SKILL.md` 的 description 在已合规的基础上，**追加**"两句式 + 祈使动词开头"的句法约束，进一步提升 router 可扫描性
2. 建立项目级 SKILL 风格指南与模板，让新增 skill 有单一事实来源的作者规范（目前 19 个 skill 的隐式约定需要显式化）
3. 给 19 个 skill 补齐 **Prerequisites / Workflow / Deliverable** 三段骨架（当前没有一个 skill 用此标题，grep 验证）；明确仅对新建/大幅重构强制，回溯由 `skill-document-optimization` spec 单独规划
4. 引入 **Scripts as Black Box** 纪律，对抗通过 `cat scripts/*.sh` 把脚本源码塞进上下文的浪费模式（`scripts/` 目录实有 27 个文件）
5. 新增 **frontend-check** 作为 `/forge review` 第 4 层评审 agent，结合 cmux 浏览器自动化 + chrome-devtools MCP，补齐 Vue3 项目的 WCAG / Core Web Vitals 盲区
6. 引入 **Acceptance Scenario Eval** 作为 ship 前额外门禁（取自 MCP Builder 的 Phase 4 思路），把 spec 中的可验证场景（BDD Scenarios 或 acceptance criteria 反向提取）真跑一遍而非只查代码实现

**来源研究**：与用户在会话中完成的 warpdotdev/oz-skills 深度对比分析（全量阅读 README.md、AGENTS.md、CONTRIBUTING.md，以及 `ci-fix`、`docs-update`、`create-pull-request`、`github-bug-report-triage`、`github-issue-dedupe`、`scheduler`、`slack-qa-investigate`、`mcp-builder`、`terraform-style-check`、`dbt-model-index`、`analysis-artifacts`、`webapp-testing`、`web-accessibility-audit`、`web-performance-audit`、`seo-aeo-audit` 共 15 个 SKILL.md）。cmux 能力对齐基于 [cmux browser-automation 文档](https://www.cmux.dev/docs/browser-automation) 全量阅读。

**Bitbucket 约束**：用户项目使用 Bitbucket，无 CI 流水线。因此 `forge-ci-fix`（依赖 GH Actions）、`forge-feedback`（已在其他 spec 规划）、`webapp-testing`（已在其他功能规划）均不在本 spec 范围内。

## Glossary

- **Oz_Skills**：`github.com/warpdotdev/oz-skills` 公开的 15 个 Warp agent skill 集合，本 spec 从中吸收方法论
- **Two_Sentence_Description**：Oz AGENTS.md 定义的 description 规范——句 1 祈使动词开头 + 句 2 以 `Use when ...` 开头
- **Imperative_Whitelist**：允许作为 description 第一句开头的动词白名单（存于 `src/skill-description-imperatives.ts`），可扩充但不允许任意词
- **Description_Validator_Extended**：扩展后的 description 校验器，在既有 `validateDescription()` 基础上新增句数、祈使动词开头、Use when 开头三条规则
- **Skill_Style_Guide**：`.forge/knowledge/skill-style-guide.md`（或 `templates/SKILL-TEMPLATE.md`），项目级 SKILL.md 作者规范，涵盖 frontmatter 字段、章节骨架、命名、引用语法
- **Style_Guide_Version**：风格指南的语义化版本（`style_guide_version: X.Y`），skill 可标注遵循的版本，大版本升级走 ADR
- **Skill_Skeleton**：所有 forge-* skill 的共同三段式章节结构——Prerequisites（准入条件）→ Workflow（步骤）→ Deliverable（交付清单）
- **Deliverable_Block**：SKILL.md 末尾的结构化交付描述块，固定字段说明产出格式，对齐 output-bloat-control
- **Deliverable_Exempt**：frontmatter 字段 `deliverable_exempt: true`，工具类 skill 可声明豁免 Deliverable 章节
- **Skeleton_Exempt_Legacy**：frontmatter 字段 `skeleton_exempt_legacy: true`，既有 skill 未回溯骨架时的 warning-only 标记
- **Scripts_As_Blackbox**：纪律条款——agent 调用 `scripts/*.sh` 时必须先 `--help`，不得直接 cat 脚本源码，除非确认需要定制方案
- **Script_Category**：脚本分类（user-facing / internal-only / one-off），通过文件头注释 `# category:` 声明
- **Frontend_Check**：新增 agent `agents/frontend-check.md`，`/forge review` 的 Layer 4 评审者，检查 Vue3 无障碍性、性能、路由稳定性、控制台告警
- **Vue3_A11y_Patterns**：Vue 模板特化的 a11y 静态扫描规则集合，覆盖 `v-html`、`@click` on 非 button、`<router-link>` vs `<a>`、异步组件加载态等 Vue 专有陷阱
- **Tier_A_Static**：frontend-check 的静态扫描档——仅 grep/AST，不启动浏览器，秒级完成
- **Tier_B_Interactive**：frontend-check 的交互档——通过 cmux browser CLI 驱动真实浏览器，注入 axe-core 做 WCAG 规则扫描
- **Tier_C_Perf**：frontend-check 的性能档——走 chrome-devtools MCP 的 `performance_start_trace` + insights
- **cmux**：用户本机的原生 macOS 终端 + 内建浏览器，提供 `cmux browser` 命令组，通过 `/tmp/cmux.sock` 与 `$CMUX_WORKSPACE_ID` 双重检测可用性（与 cursor-team-kit-integration spec 对齐）
- **cmux_Browser_CLI**：cmux 提供的浏览器自动化 CLI 命令组，覆盖 navigate / snapshot / screenshot / eval / cookies / state 等 30+ 子命令
- **Chrome_DevTools_MCP**：已安装的 Chrome DevTools Protocol MCP server，提供 `performance_start_trace`、`performance_analyze_insight`、`list_network_requests`、`take_snapshot` 等工具
- **axe_Core**：Deque 的 Web 无障碍性规则引擎，版本 pin 到 4.10.x，**作为 git 追踪文件**存放于 `scripts/vendor/axe.min.js`，保证离线可用
- **Login_State_Cache**：cmux browser state save 产出的登录态 JSON 缓存，路径 `.forge/cache/login-state-<project>.json`，必须在 `.gitignore` 中排除
- **Acceptance_Scenario_Eval**：新增 ship 前门禁（或 review Layer 5），把 spec 中的 BDD Scenario 或反向提取的场景选出 3-5 条关键路径真实执行，产出 Pass/Fail + 证据
- **Scenario_Source**：scenario 来源枚举——`explicit`（显式 `## Scenarios` / `Scenario:` 块）或 `derived`（从 Acceptance Criteria WHEN/THEN 反向提取）
- **Scenario_Artifact**：Acceptance_Scenario_Eval 的产出目录 `.forge/acceptance/<topic>/`，包含每个 scenario 的执行脚本、截图、响应 JSON、verdict
- **Description_Linter**：`scripts/validate-skill-descriptions.mjs`（已存在），本 spec 扩展其规则而非新建
- **Skeleton_Linter**：`scripts/validate-skill-skeleton.mjs`，新增校验脚本，检查 SKILL.md 包含 Prerequisites / Workflow / Deliverable 三个必需段落（或声明豁免）

## 需求

### 需求 1：Skill Description 两句式强化（扩展既有规则） ⭐⭐⭐⭐

**用户故事**：作为 Forge 路由器的使用者与 SKILL 作者，我希望 `skills/forge-*/SKILL.md` 的 description 字段在已有"Use when"校验的基础上，**追加**两句式句法约束（恰好两句、第一句祈使动词开头、第二句 Use when 开头），以便进一步提升 router 可扫描性与 SKILL.md 作者侧规范。

**价值理由**：Oz AGENTS.md 把 description 规范写成可执行的格式规则，而非风格建议。Forge 当前 19 个 skill 的 description 已全部含 "Use when"（`scripts/validate-skill-descriptions.mjs` 已校验），但句法结构参差：有些一句（`forge-ship` description 为 "Delivery engine... `Use when` ... ready to push branch..." 实际是两句但依赖 `/` 断句）、有些明显多句拼接。本需求是**对既有校验器的增量扩展**，不是从零新建。

**现状事实**：
- `scripts/validate-skill-descriptions.mjs` 已存在并校验：非空、≤1024、含 "Use when"、禁用营销/版本号/日期模式
- 规则镜像自 `src/skill-description.ts`，有对应单元测试
- 19 个 skill 的 description 通过 `grep` 验证全部含 "Use when"
- 缺的是：**句数限定、祈使动词开头、两句结构分离**

**关系说明**：本需求与 `skills-cross-pollination` 需求 3（description 按失败模式重写）是同一主题的不同来源——skills-cross-pollination 来自 mattpocock，强调"失败模式触发"；本需求来自 oz-skills，强调"祈使动词 + Use when 的句法结构"。**两者合并执行**：句法结构遵循本需求，语义触发条件遵循 skills-cross-pollination 需求 3。若 skills-cross-pollination 需求 3 已实施，本需求作为格式补强；若未实施，本需求优先落地句法规范，语义可后续精修。

#### 验收标准

1. THE 审计范围 SHALL 覆盖 `skills/forge-*/SKILL.md` 的 frontmatter `description:` 字段（当前 19 个）
2. THE 每个 description SHALL 由**恰好两句话**组成，句末以 `.` 或 `。` 结尾（**新增规则**，当前校验器未覆盖）
3. THE 第一句 SHALL 以祈使动词开头（英文 Build / Audit / Diagnose / Execute / Plan / Review / Ship / Test / Resume / Orchestrate / Capture / Refactor / Grill / Decompose / Decide / Restart 等，或中英混排时英文动词先行）（**新增规则**）
4. THE 第二句 SHALL 以 `Use when` 开头（大小写不敏感）（**扩展现有规则**——当前仅校验"包含"，升级为"开头"）
5. THE description SHALL 继续满足现有 `validateDescription()` 的全部规则（≤1024、禁用营销语言/版本号/具体日期），本需求**不弱化**既有规则
6. THE `scripts/validate-skill-descriptions.mjs` 与对应的 `src/skill-description.ts` SHALL 被**扩展**（而非替换），新增三条校验：`sentenceCount === 2`、`firstSentenceStartsWithImperative`、`secondSentenceStartsWithUseWhen`
7. THE 新增规则的校验 SHALL 附带白名单祈使动词列表（存于 `src/skill-description-imperatives.ts` 或同等位置），允许未来扩充但不允许任意词
8. WHEN `npm run check` 运行时，THE 扩展后的校验器 SHALL 被调用，任一规则失败则构建失败（现有规则 + 新增规则合并评估）
9. THE 迁移策略 SHALL 分两步：
   - Step A：扩展校验器但**仅以 warning 模式输出**（不退出非零），允许现有 19 个 skill 逐个修正
   - Step B：迁移完成后切换为 error 模式（退出非零）
10. THE 示例改写清单 SHALL 在本 spec 的 tasks 阶段产出，至少覆盖 `forge-plan` / `forge-build` / `forge-ship` / `forge-review` 四个（**这些 description 虽合规但句数/动词开头可能不达新规**）——具体改写由 tasks 阶段逐条审视
11. THE 改写 SHALL 仅影响 frontmatter 字段，不触及 SKILL.md 正文与 skill 实际行为
12. WHEN 本需求与 skills-cross-pollination 需求 3 同时存在时，THE 两套规则 SHALL 取并集——新 description 必须同时满足"两句式 + 祈使动词 + Use when 开头"语法与"失败模式/触发信号"语义
13. THE property-based test SHALL 覆盖新增三条规则：
    - `countSentences(text)` 对任意输入返回整数 ≥ 0
    - `startsWithImperative(sentence, whitelist)` 是纯函数
    - `validateDescriptionExtended(text)` 向后兼容——所有原校验失败的输入，在扩展后仍失败

---

### 需求 2：SKILL.md 章节骨架统一（Prerequisites / Workflow / Deliverable） ⭐⭐⭐⭐

**用户故事**：作为 skill 的调用者（含 agent）与阅读者，我希望所有新建 forge-* skill 有共同的三段式骨架——Prerequisites（准入条件）→ Workflow（步骤）→ Deliverable（交付清单），以便快速跳转到想看的段落、对齐结构化输出纪律、让 router 在调用前能提取"是否满足 Prerequisites"。

**价值理由**：Oz 的 `ci-fix`、`create-pull-request`、`docs-update` 都有清晰的 Prerequisites 块首 + Workflow 中段 + Deliverable 末尾模式。Forge 现有 `forge-build` §2 Pre-build Checks、`forge-ship` §2 Gate Checks 已有相似结构但命名不统一；`forge-plan`、`forge-review`、`forge-debug` 等缺乏 Deliverable 块，导致输出格式散落在正文各处。统一骨架对 output-bloat-control（.forge/plans/output-bloat-control.md）的结构化输出目标是直接加固。

**现状事实**（2026-05-08 grep 验证）：
- 19 个 `skills/forge-*/SKILL.md` 中**没有一个**使用 `## Prerequisites` / `## Workflow` / `## Deliverable` 作为章节标题
- `forge-build` 使用 "Pre-build Checks"（§2）、`forge-ship` 使用 "Gate Checks"（§2）、其他 skill 多数没有显式准入条件章节
- 本需求的改造规模 = 新建 skill 强制三段 + **可选回溯**（17 个 skill 缺 Deliverable），不是"改名"

**关系说明**：
- 本需求与 `output-bloat-control` spec 正交——后者管"每条消息的 token 上限"，本需求管"SKILL.md 本身的段落组织"
- 本需求与 `skill-document-optimization` spec 边界明确——后者管"精简现有 SKILL.md 的内容到 150 行内"，本需求管"引入新章节骨架标准"。**两者不冲突也不替代**：skill-document-optimization 在精简时应遵循本需求定义的骨架标准
- 本需求是需求 3（风格指南）引用的核心章节规范

#### 验收标准

1. THE 所有**新建** `skills/forge-*/SKILL.md` SHALL 包含以下三个编号章节（顺序固定）：
   - `## 1. Overview`（已有，不变）
   - `## 2. Prerequisites`（统一命名，替换现有的 "Pre-build Checks"、"Gate Checks"、"前置检查" 等异名——但仅对新建 skill 强制）
   - `## <N>. Deliverable`（放在主 Workflow 章节之后、References 之前）
2. THE Prerequisites 章节 SHALL 采用表格格式（若有 ≥2 条准入条件），列：`#`、`Check`、`Block Condition`、`Route`（失败时的修复路径或下一命令）
3. THE Prerequisites 章节 SHALL 在表格后追加 Rejection Output 格式描述，与 `forge-build` §2 的 `🚫 ... 命名：<检查> 证据：<文件状态> 建议：<路由> 重入：<条件>` 格式对齐
4. THE Deliverable 章节 SHALL 采用结构化列表，固定字段（按 skill 类型选择）：
   - 决策/评审类 skill：`Decision` / `Rationale` / `Evidence` / `Next Action`
   - 代码执行类 skill：`Changed Files` / `Tests Run` / `Verification Output` / `Commit Hash`
   - 交付类 skill（forge-ship）：`Delivery Target` / `Gate Results` / `Next Step Prompt`
   - 探索/诊断类 skill（forge-debug / forge-grill）：`Finding` / `Root Cause` / `Recommendation` / `Confidence`
5. THE Deliverable 字段 SHALL 不允许"Markdown 散文"——每个字段必须可填入具体值或明确的 N/A
6. THE 回溯策略 SHALL 明确：
   - **本 spec 不强制回溯 19 个已有 skill**——回溯由 `skill-document-optimization` spec 单独规划，或作为后续维护任务逐个推进
   - 已有 skill 中自愿回溯的优先级建议：输出最分散的 5 个（forge-review、forge-debug、forge-learn、forge-plan、forge-refactor）
   - 新建或大幅重构的 skill 必须遵循本规范
7. WHEN 已有 skill 自愿回溯时，THE 回溯改写 SHALL 不改变 skill 的实际行为——通过 before/after 的输出结构对比验证
8. THE 可选豁免机制 SHALL 存在：纯工具类 skill（如 forge-status、forge-zoom-out）若 Deliverable 过于琐碎，可在 frontmatter 声明 `deliverable_exempt: true` 并在 SKILL.md 首段说明豁免理由
9. THE 新增验证脚本 `scripts/validate-skill-skeleton.mjs`（与既有 `validate-skill-descriptions.mjs` / `validate-skill-length.mjs` 保持风格一致）SHALL 校验每个 SKILL.md 包含 `## 2. Prerequisites` 与 Deliverable 章节（除非 frontmatter 声明豁免或 SKILL.md 声明 `skeleton_exempt_legacy: true` 标记为未回溯的既有 skill）
10. WHEN `npm run check` 运行时，THE 校验脚本 SHALL 被调用，对声明豁免或 legacy 标记的文件仅输出 warning，对未声明且未合规的失败则构建失败（保证新 skill 纳规）
11. THE 新建 skill 的 PR 模板 SHALL 勾选 "✅ 包含 Prerequisites / Workflow / Deliverable 三段骨架" 核对项
12. THE 与 `shared/next-step-protocol.md` 的关系 SHALL 清晰——next-step-protocol 处理"阶段间衔接"，Deliverable 处理"单 skill 输出"，两者不冲突
13. THE property-based test SHALL 覆盖：`parseSkeleton(content)` 返回 `{ hasPrerequisites, hasWorkflow, hasDeliverable, deliverableExempt, legacyExempt }`、对任意输入不抛错

---

### 需求 3：Skill 风格指南与作者模板 ⭐⭐⭐⭐⭐

**用户故事**：作为新增 forge-* skill 的作者（人类或 agent），我希望项目有一份权威的风格指南 + 可复制模板，明确 frontmatter 字段集合、SKILL.md 章节骨架、`references/` 与 `scripts/` 的用途边界、命名规范、引用语法，以便不需要逐个扒现有 skill 推断约定。

**价值理由**：Oz AGENTS.md 里的 "Skill Metadata Style Guide (Canonical)" + "Authoring Template (Copy/Paste)" 是极高 ROI 的单点投资——把散落在 19 个已有 skill 里的隐式约定显式化。Forge 有 `.forge/config.md` 讲文件保护分区，有 CLAUDE.md 讲宪法，但**缺失"怎么写一个合格的 SKILL.md"的单一文档**。新人（含 AI agent）每次新建 skill 都在重新发明轮子。

**关系说明**：本需求**整合并引用**需求 1（两句式强化）与需求 2（章节骨架），是它们的规范文档化出口。需求 1、2、4 的**规则定义**由各自需求负责，本需求负责**把这些规则汇总到一份可检索的作者文档**。因此本需求在需求 1、2 之后落地。与 CLAUDE.md 的关系：CLAUDE.md 是宪法（跨 skill 行为），本文档是细则（SKILL.md 作者层），两者层级不同。

#### 验收标准

1. THE 新增文档 `.forge/knowledge/skill-style-guide.md` SHALL 作为 SKILL.md 作者规范的单一事实来源
2. THE 文档 SHALL 位于开放区（Open Zone），允许自由修改
3. THE 文档 frontmatter SHALL 包含 `style_guide_version: X.Y`（语义化版本），规则重大变更时版本升级并追加到 `.forge/decisions/` 走 ADR 流程
4. THE 文档 SHALL 涵盖以下章节（顺序固定）：
   - Overview（为什么需要这份指南、面向谁、与 CLAUDE.md 的关系）
   - Frontmatter 字段规范（name、description、disable-model-invocation、license、deliverable_exempt、skeleton_exempt_legacy 等；每个字段含：类型、是否必填、示例、常见错误）
   - SKILL.md 章节骨架（引用需求 2）
   - Description 两句式规则（引用需求 1）
   - 命名规范（skill 目录名 kebab-case、单 H1 Title Case、章节编号风格）
   - `references/` 用途边界（什么内容应该迁移、命名规范、引用语法 `→ references/<filename>.md`）
   - `scripts/` 用途边界（引用需求 4 的黑盒纪律）
   - 反模式清单（至少 5 条："避免 Emoji 分散注意力"、"避免写死绝对路径"、"避免版本号写进 description" 等）
   - 版本演进策略（style_guide_version 升级流程、向旧 skill 的兼容策略）
5. THE 新增模板 `templates/SKILL-TEMPLATE.md` SHALL 提供一个可直接 `cp` 使用的骨架文件
6. THE 模板 SHALL 包含全部必需章节占位符与注释引导（`<!-- 此处说明何时触发 -->`）
7. THE 模板的示例内容 SHALL 基于一个虚构的 `forge-example` skill，避免误导抄袭
8. THE 模板 SHALL 可选声明 `style_guide_version:` frontmatter，供 skill 作者标注遵循的指南版本
9. THE 风格指南的末尾 SHALL 包含"快速核对清单"（≤ 10 条），作为 PR 自检清单
10. WHEN 新建 skill 的 PR 被审查时，THE PR 模板（`.github/pull_request_template.md` 或 CONTRIBUTING.md 片段）SHALL 引用本指南的核对清单
11. THE 风格指南 SHALL 不重复 CLAUDE.md 的宪法内容（三维路由、TDD 铁律等）——专注 SKILL.md 作者层面规范
12. THE 风格指南首版 SHALL 基于当前 19 个已有 skill 的归纳提取，避免主观创造；每条规则 SHALL 标注"来自 X 个 skill 的共性"或"为解决 Y 反模式"
13. WHEN 已有 skill 违反风格指南时，THE 风格指南 SHALL 不强制回溯——仅对新建或大幅重构的 skill 强制；已有 skill 的精修由 `skill-document-optimization` spec 单独推进
14. THE 指南版本升级策略 SHALL 明确：style_guide_version 从 1.0 开始，小版本（1.x）兼容，大版本（2.0+）强制升级并伴随 ADR 声明
15. THE property-based test SHALL 覆盖：`validateSkillTemplate(filePath, guideVersion)` 对符合指定版本模板的 SKILL.md 返回 `{ valid: true }`、对缺失必需章节的返回 `{ valid: false, missingSections: [...] }`

---

### 需求 4：Scripts as Black Box 纪律 ⭐⭐⭐

**用户故事**：作为每次会话预算 ~10K tokens 的 Forge 使用者，我希望 agent 调用 `scripts/*.sh` 时默认把它们当黑盒 CLI 使用（先 `--help` 再调用），而不是把整段 shell 源码 cat 进上下文占用预算，以便保持 token 预算纪律。

**价值理由**：Oz 的 `webapp-testing` 明确写入铁律："Always run scripts with `--help` first. **DO NOT read the source until you try running the script first** and find that a customized solution is absolutely necessary." Forge 的 `scripts/` 目录实有 **27 个文件**（mix of `.sh` / `.mjs`，2026-05-08 审计），涵盖校验、初始化、分发包、事件日志修剪、持续循环等；其中相当比例是**内部被其他脚本/hook 调用**的非 user-facing 工具。但 CLAUDE.md §2.6 Output Conciseness 只管输出散文，不管工具调用模式。本需求把 Oz 的原则迁移过来，**并区分 user-facing 与 internal-only 两类**。

**关系说明**：本需求与 output-bloat-control、context-budget-management 同属 token 预算家族，但各守一层：前者管"响应文本"、context-budget 管"总预算"、本需求管"工具调用模式"。三者可独立落地。本需求是需求 3（风格指南）引用的一条规则。

**投入评估**：中（不是小）——27 个脚本逐个分类 + 为 user-facing 子集补 `--help` 需要 1-2 天。

#### 验收标准

1. THE CLAUDE.md SHALL 在 §2 Execution Discipline 下新增 §2.8 "Scripts as Black Box" 章节（或在现有 §2.6 Output Conciseness 下作为子条款 §2.6.3）
2. THE 新条款文本 SHALL 包含以下核心内容：
   - 默认行为：遇到 `scripts/*.sh`、`scripts/*.mjs`、`scripts/*.py` 调用需求时，先运行 `bash scripts/<name> --help` 或 `node scripts/<name> --help`
   - 禁止行为：未尝试 `--help` 前，**不得**用 read_file / cat / sed 查看脚本源码
   - 例外情况：`--help` 输出不足以决定用法 → 明确声明"需要查看源码"并标注原因
   - 例外情况：脚本需要修改或扩展时 → 允许读源码
3. THE 脚本 SHALL 按用途分为两类，分类判定标准明确：
   - **User-facing CLI**：可被用户/agent 直接调用，出现在 package.json scripts、CLAUDE.md、SKILL.md 的 Bash 示例中，必须支持 `--help`
   - **Internal-only**：仅被其他脚本 `source`、被 hook 调用、被 CI workflow 调用，或标注为一次性修复——可豁免 `--help`
4. THE 首版审计 SHALL 产出 `.forge/findings/scripts-help-audit.md`，列出每个脚本的当前状态：`user_facing_with_help` / `user_facing_missing_help` / `internal_only` / `one_off` / `unclear`；分类依据 SHALL 附带 evidence（何处调用、调用方）
5. THE 本 spec 的 tasks 阶段 SHALL 为审计标记为 `user_facing_missing_help` 的脚本补齐 `--help | -h` 分支，输出用法、参数、示例、副作用说明
6. THE 补齐后的 `--help` 输出 SHALL ≥ 3 行且 ≤ 30 行，覆盖：`Usage:`、`Arguments:`、`Options:`、`Examples:`
7. THE 新增脚本（PR 引入的 `scripts/*`）SHALL 默认按 user-facing 处理——必须声明分类（通过文件头注释 `# category: user-facing | internal-only | one-off`）；user-facing 必须带 `--help`，否则 PR 不合并
8. THE 新增验证脚本 `scripts/validate-scripts-help.mjs`（风格对齐 `validate-skill-descriptions.mjs`）SHALL 对分类为 user-facing 的每个 `scripts/*.{sh,mjs,py}` 调用 `--help`，捕获退出码与输出；无 `Usage:` 字符串则校验失败；internal-only 与 one-off 跳过
9. WHEN `npm run check` 运行时，THE 验证脚本 SHALL 被调用，失败则构建失败
10. THE 豁免配置文件 `scripts/.help-exempt` SHALL 以行分隔记录 internal-only 与 one-off 脚本（每行一个相对路径 + 可选注释），审计阶段的分类结果写入此文件作为首版基线
11. THE 风格指南（需求 3）SHALL 在 `scripts/` 用途边界章节引用本纪律
12. THE property-based test SHALL 覆盖：
    - `parseHelpOutput(output)` 对包含 `Usage:` 的任意文本返回 `{ valid: true }`、对空字符串或纯错误信息返回 `{ valid: false }`
    - `parseScriptCategory(fileContent)` 正确解析文件头 `# category:` 注释
    - `parseHelpExempt(content)` 对任意合法行分隔文件返回路径数组

---

### 需求 5：Frontend-Check 评审 Agent（Vue3 + cmux + DevTools MCP） ⭐⭐⭐⭐

**用户故事**：作为 Vue3 全家桶项目的 Forge 用户，我希望 `/forge review` 的 agent team 包含一个前端质量评审者，通过三档逐步加深的策略（静态扫描 → cmux 浏览器交互 → DevTools 性能 trace）检查 WCAG 无障碍性、Core Web Vitals、路由切换稳定性、控制台告警，以便在 ship 前发现 quality-check / security-check 看不出来的前端盲区。

**价值理由**：Oz 的 `web-accessibility-audit` + `web-performance-audit` 覆盖了 Forge 当前的重大盲区——`forge-review` 的 description 虽然写了 `"covering structure, security, performance, and accessibility"`，但现有 3 层 agent（spec-check / quality-check / security-check）**没有一个懂前端**，router 的 `a11y-check` / `responsive-check` / `visual-regression` hint 是**占位符无实现**。Vue3 项目的真实风险（自定义组件键盘不可达、路由切换 CLS、`v-html` XSS+a11y 双隐患、异步组件加载态屏幕阅读器不友好）当前全部漏检。

**技术路径**：
- **Tier A 静态档**：grep/AST 扫 `.vue` 模板，秒级完成，零依赖，`/forge review` 默认档
- **Tier B 交互档**：`cmux browser` CLI 驱动真实浏览器 + 注入 axe-core 做 WCAG 规则扫描
- **Tier C 性能档**：chrome-devtools MCP 的 `performance_start_trace` + `LCPBreakdown`/`CLSCulprits` insights

**关系说明**：
- 本需求与 skills-cross-pollination 需求 4 / cursor-team-kit-integration 相关 harness 需求**不重叠**——本需求专注 Vue3 前端 review，后两者是通用 E2E / PR 评审
- Tier A 不依赖任何外部组件，Tier B 依赖 cmux（macOS-only 且需在 cmux workspace 内运行），Tier C 依赖 chrome-devtools MCP。降级路径：无 cmux → Tier A + Tier C；无 DevTools MCP → Tier A + Tier B
- cmux 能力参考：`cmux browser open/navigate/snapshot/screenshot/eval/cookies/state/console/errors` 共 30+ 子命令
- cmux 可用性判定与 `cursor-team-kit-integration` spec 保持一致——通过 `$CMUX_WORKSPACE_ID` 与 `/tmp/cmux.sock` 双重检测，避免"`which cmux` 返回但不在 workspace 内"的误判
- axe-core 版本 pin 到 4.10.x，存 `scripts/vendor/axe.min.js`，作为 git 追踪文件入库；通过 `addinitscript` 注入

#### 验收标准

1. THE 新增 agent `agents/frontend-check.md` SHALL 作为 `/forge review` 的 Layer 4 评审者，与 spec-check / quality-check / security-check 并行
2. THE agent frontmatter SHALL 包含：`name: frontend-check`、`description`（遵循需求 1 的两句式）、`model: sonnet`、`allowedTools: Bash(cmux browser:*), mcp_chrome-devtools_*, Read, Grep`
3. THE agent SHALL 自动探测可用档位（Prerequisites 块），检测逻辑与 `cursor-team-kit-integration` spec 保持一致：
   - `test -S /tmp/cmux.sock && [ -n "$CMUX_WORKSPACE_ID" ]` 同时成立 → Tier B 可用（首选路径）
   - `which cmux` 存在但不在 workspace 内 → Tier B 可用（降级模式，评审输出附带提示 "recommend running inside cmux workspace for best results"）
   - 其他（非 macOS、cmux 未安装）→ Tier B 不可用，降级到 Tier A + Tier C
   - MCP 响应 `performance_start_trace` 探针成功 → Tier C 可用
   - 所有探测结果 SHALL 在 Deliverable 的 `tier_availability` 字段明确标注
4. THE Tier A 静态扫描 SHALL 覆盖以下 Vue3 特化模式（每条对应 WCAG 或 Vue 最佳实践）：
   - `<div @click>` / `<span @click>` 无 `role="button"` 无 `tabindex` → WCAG 2.1.1 键盘可达
   - `<img>` 无 `:alt` 或 `alt=""` 但 src 指向语义图片 → WCAG 1.1.1
   - `<input>` / `<textarea>` / `<select>` 无 `<label for>` 且无 `aria-label` → WCAG 3.3.2
   - `<a>` 文本为 "点击这里" / "更多" / "click here" / "read more" → WCAG 2.4.4
   - `v-html` 绑定到非受信域变量 → XSS + a11y 双风险
   - `<router-link>` 缺失 → 使用 `<a href>` 硬链接破坏 SPA 路由
   - 异步组件 `<Suspense>` 无 `aria-live` 区域 → 屏幕阅读器不通知加载完成
   - 路由切换组件无 `focus` 返回 → 键盘焦点丢失
5. THE Tier A 静态扫描规则集 SHALL 存放于 `skills/forge-review/references/frontend-check-patterns.md`（与 agent 路径分离——agent 文件本身保持 Forge 现有扁平结构 `agents/*.md`，不引入 `agents/<name>/references/` 的新约定；规则集作为 review skill 的 Layer 4 参考数据存放）
6. THE 每条规则 SHALL 包含字段：pattern（grep 正则）、severity（P0/P1/P2/P3）、WCAG criterion、example fix、false-positive 排除模式
7. THE Tier B 交互扫描工作流 SHALL 遵循以下步骤：
   - 前置 A：启动 dev server（通过 `control_bash_process` start 派发 `npm run dev`，记录 terminalId）
   - 前置 B：登录态处理（见验收标准 12）
   - Step 1：`cmux browser open http://localhost:5173`
   - Step 2：`cmux browser surface:N state load .forge/cache/login-state-<project>.json`（若存在且未过期）
   - Step 3：`cmux browser surface:N addinitscript "$(cat scripts/vendor/axe.min.js)"`
   - Step 4：遍历 spec 定义的关键页面（或用户指定 URL 列表）：
     - `cmux browser surface:N navigate <url> --snapshot-after`
     - `cmux browser surface:N wait --load-state complete`
     - `cmux browser surface:N eval "JSON.stringify(await axe.run())"` → 保存 `.forge/reviews/assets/axe-<page>.json`
     - `cmux browser surface:N screenshot --out .forge/reviews/assets/<page>.png`
     - `cmux browser surface:N console list > .forge/reviews/assets/console-<page>.log`
     - `cmux browser surface:N errors list > .forge/reviews/assets/errors-<page>.log`
   - Step 5：stop dev server 进程（必须执行，即使前面步骤失败）
8. THE Tier C 性能工作流 SHALL 遵循：
   - `navigate_page(url)` → `performance_start_trace(autoStop: true, reload: true)` → `performance_analyze_insight(insightSetId, insightName: "LCPBreakdown")` 等核心 insight
   - 提取 Core Web Vitals 数值（LCP / INP / CLS / FCP / TTFB / TBT）
   - 阈值判定（good / needs-improvement / poor）按 [web.dev CWV](https://web.dev/vitals/) 标准
9. THE 输出 SHALL 追加到 `.forge/reviews/<topic>.md` 的 Layer 4 段落，格式遵循需求 2 的 Deliverable 规范，字段：
   - `Tier Executed`: A / A+B / A+B+C
   - `Tier Availability`: 每档可用性与理由
   - `P0/P1/P2/P3 Counts`: 分级统计
   - `WCAG Violations`: axe-core 规则命中清单
   - `Core Web Vitals`: LCP / INP / CLS 数值与评级（Tier C 才有）
   - `Console Warnings`: Vue warn / a11y plugin warn / 其他告警
   - `Screenshots`: 附件路径列表（Tier B 才有）
10. THE P0/P1 问题 SHALL 按 `forge-review` 既有规则阻断 ship（与 quality-check、security-check 同级）
11. THE 所有 `.forge/reviews/assets/` 下的文件 SHALL 纳入 `.forge/archive/` 的 retention 策略（与 event-log 一致），保留 30 天后自动归档
12. THE 登录态处理策略 SHALL 明确：
    - 缓存路径 `.forge/cache/login-state-<project>.json`（开放区文件）
    - `.gitignore` SHALL 包含 `.forge/cache/` 条目以避免凭证入库——本 spec tasks 阶段负责补齐 `.gitignore`
    - 首次运行或缓存过期（cookie expiry 检测失败）时，agent SHALL 提示用户手动在 cmux browser 内登录一次，然后运行 `cmux browser surface:N state save` 自动缓存
    - 纯公开页面（无鉴权）的 scenario SHALL 跳过登录态加载步骤
13. THE axe-core 版本 SHALL pin 到 `4.10.x` 存于 `scripts/vendor/axe.min.js`，**作为 git 追踪文件入库**（不进 `.gitignore`），保证离线环境可用
14. THE `scripts/update-vendor-axe.sh --help` SHALL 提供升级路径；脚本需要网络，运行失败时输出明确错误（"network required to fetch axe-core"）而非静默失败
15. THE 路由器 hint 体系 SHALL 接入 frontend-check：`behavior-hints.md` 中已有占位的 `a11y-check` / `responsive-check` / `visual-regression` 分别映射到 frontend-check 的 Tier B 的不同扫描维度
16. THE dev server 生命周期 SHALL 通过 `control_bash_process` 的 start/stop 动作严格管理——每次扫描结束必须 stop（包括异常路径），避免遗留进程；超时保护 5 分钟
17. THE 降级行为 SHALL 明确：Tier B 不可用时在 Deliverable 显示 `tier_b_skipped: "cmux not available"` 或 `tier_b_degraded: "cmux outside workspace"`，不阻断评审流程
18. THE property-based test SHALL 覆盖：
    - `parseAxeResult(json)` 对任意合法 axe-core 输出返回分级统计
    - `scanVueTemplate(content, rules)` 对任意 `.vue` 字符串不抛错，返回 violations 数组
    - `detectTierAvailability(env)` 对各种 env 组合返回正确的 tier 集合
19. THE agent description（按需求 1） SHALL 类似 `"Audit Vue3 frontend for WCAG accessibility, Core Web Vitals, router stability, and console warnings via three-tier strategy. Use when /forge review runs on a project with Vue or .vue files, when router applies a11y-check or responsive-check hints, or when user explicitly requests a frontend audit."`

---

### 需求 6：Acceptance Scenario Eval（来自 MCP Builder Phase 4 启发） ⭐⭐⭐

**用户故事**：作为 `/forge ship` 前的最后一道闸门，我希望能从 spec 的可验证场景（BDD Scenarios 块、或从 acceptance criteria 的 WHEN/THEN 子句反向提取）中选 3-5 条关键路径真实执行一遍（API 则 curl、前端则走 cmux 浏览器），而不是只靠单元测试绿灯就声称"验收通过"，以便避免"单测绿、场景死"的经典陷阱。

**价值理由**：Oz 的 `mcp-builder` 把创建 10 道"复杂、真实、独立、可验证、稳定"的 evaluation 问题作为独立的 Phase 4，先让自己解一遍再作为回归基线。翻译到 Forge 语义就是**"Acceptance Scenarios 真跑一遍"**。Forge 当前 `spec-check` 只检查"代码是否实现 scenario 描述的逻辑"，不会模拟用户走一遍 scenario；`forge-test` 偏单元/集成测试；`forge-ship` 门禁查的是 review/test 结果元数据。这是真实盲区——BDD scenario 写得再完整，如果从来没被当成 e2e 用例执行过，ship 时就是赌运气。

**现状事实**（2026-05-08 审计）：
- Forge 现有 spec 模板（`.forge/specs/` 下的 requirements.md）使用 **"User Story + Acceptance Criteria"** 格式，不是严格 BDD Scenario 格式
- Acceptance Criteria 已有 WHEN/THEN/WHERE 子句（类似 BDD 但粒度更细、关注行为断言而非用户路径）
- 少数 spec 可能已含 `## Scenarios` 或 `Scenario:` 块（历史格式或手动添加），但不是主流
- 本需求必须兼容两种来源：显式 Scenario 块 + 从 Acceptance Criteria 反向提取

**关系说明**：
- 与 `forge-ship` 现有三道 gate（Review / Test / Progress）**互补**——本需求作为第 4 道可选 gate，默认关闭，通过 `acceptance_eval: true` 在 spec frontmatter 显式开启
- 与需求 5 frontend-check 的 Tier B 技术栈**共用**——cmux browser / chrome-devtools MCP；前端 scenario 复用 Tier B 的 dev server 生命周期管理与登录态缓存
- 与 `forge-review` 并列但职责不同——review 是"代码质量评审"，acceptance eval 是"用户路径验收"
- 与 `forge-test` 的边界清晰（见验收标准 15）
- 本需求 P3，在需求 1-5 完成后再启动；属于"高价值但高实施成本"项

#### 验收标准

1. THE 新增 skill `skills/forge-accept/SKILL.md` SHALL 作为 ship 前的 scenario 验收执行器
2. THE skill 触发方式 SHALL 支持以下三种：
   - spec frontmatter 声明 `acceptance_eval: true` 时，`/forge ship` 前自动触发
   - 用户主动 `/forge accept [scenario-id]`
   - `/forge ship --with-acceptance` 强制触发
3. THE skill 的 Prerequisites（按需求 2）SHALL 校验：
   - spec.md 存在且 status=locked
   - spec.md 包含**至少一个可执行场景来源**（显式 `## Scenarios` / `Scenario:` 块 **OR** acceptance criteria 中含 WHEN/THEN 子句可反向提取）
   - 若两类来源都缺失：skill 输出 warning `no executable scenarios found — skipping acceptance eval` 并**跳过而非阻断 ship**
   - 对应技术栈工具可用（curl / cmux browser / MCP）
4. THE scenario 提取逻辑 SHALL 支持两种来源的统一解析：
   - **显式来源**：解析 `## Scenarios` 章节下的 `Scenario:` 块（Gherkin Given/When/Then）
   - **隐式来源**：从 Acceptance Criteria 的 `WHEN <action>, THE <subject> SHALL <outcome>` 子句反向提取为 scenario 草稿，`Given` 留空或从 user story 推断
   - 两类 scenario 统一表示为 `{ id, given, when, then, source: "explicit" | "derived", confidence }` 结构
5. THE scenario 选择逻辑 SHALL：
   - 从 spec.md 提取所有 scenarios（显式 + 隐式）
   - 按以下规则排序关键程度：标注 `@critical` > 标注 `@happy-path` > source === "explicit" > 其他
   - 取前 min(5, 总数) 条作为必执行集
   - 允许用户通过 `--scenarios <id1>,<id2>` 指定具体子集
   - 隐式来源的 scenario 默认仅警告（不阻断 ship），需用户显式 `--promote-derived` 才参与阻断判定
6. THE 每条 scenario 执行 SHALL 产生一个 Scenario_Artifact：
   - 目录 `.forge/acceptance/<topic>/<scenario-id>/`
   - 文件：`script.sh`（可重放的命令序列）、`output.log`（stdout/stderr）、`screenshot-<step>.png`（UI scenario）、`response-<step>.json`（API scenario）、`verdict.md`
7. THE verdict.md SHALL 包含字段：`scenario_id`、`source`、`given_when_then`（原文或反向提取文本）、`executed_at`、`verdict: PASS | FAIL | SKIP | WARN`、`evidence: [paths]`、`failure_reason`（FAIL/WARN 时必填）
8. THE 执行器 SHALL 根据 scenario 类型选择驱动：
   - API scenario（关键词：`request` / `POST /` / `GET /` 等）→ 用 curl，参数从 `Given` 块提取 endpoint/body
   - 前端 scenario（关键词：`user clicks` / `页面显示` / `点击` 等）→ 用 cmux browser CLI（复用需求 5 Tier B 工作流）
   - CLI scenario（关键词：`run` / `command` 等）→ 直接 bash
   - 混合 scenario → 顺序执行并汇总
9. THE 任一 scenario `verdict: FAIL` 且 spec frontmatter 声明 `acceptance_blocks_ship: true` 时，THE `/forge ship` SHALL 被阻断——与 P0 review issue 同级
10. THE 默认行为 SHALL 为 `acceptance_blocks_ship: false`（警告级而非阻断），避免首次启用对既有项目的破坏性影响
11. THE acceptance 报告 SHALL 汇总写入 `.forge/reviews/<topic>-acceptance.md`，包含总 PASS/FAIL/SKIP/WARN 数、每条 scenario 的简要判定、详细 evidence 路径、来源分布统计
12. THE 失败 scenario SHALL 自动触发 Evolution 标记（对齐 skills-cross-pollination 需求 8）：`<!-- Evolution: YYYY-MM-DD | source: acceptance/<topic>/<scenario-id> | target: forge-build#scenario-gap -->`
13. THE `.forge/acceptance/` 目录 SHALL 纳入 retention 策略，默认保留 30 天
14. THE skill description（按需求 1）SHALL 类似 `"Execute spec Scenarios end-to-end against real runtime and produce pass/fail verdicts with evidence. Use when /forge ship runs on a spec with acceptance_eval true, when user runs /forge accept explicitly, or when /forge ship --with-acceptance flag is provided."`
15. THE 与 forge-test 的边界 SHALL 明确区分：
    - **forge-test** = 程序员视角。Three-layer：property tests（不变量）、unit tests（单函数）、integration smoke tests（多模块组合，断言代码层可观察结果如返回值/状态码/JSON shape）
    - **forge-accept** = 用户视角。按 spec 的 given-when-then 断言**外部可观察的业务结果**（DB 记录创建、邮件发出、UI 元素可见、文件写入等用户能感知的变化）
    - 示例对比：test 调 `POST /users` 断言 201 + 返回 JSON 含 `id` 字段；accept 调 `POST /users` 后断言 DB 里有新记录 + 欢迎邮件队列有条目 + 前端用户列表可见新用户
16. THE property-based test SHALL 覆盖：
    - `parseScenariosFromSpec(content)` 对任意 Markdown 不抛错，返回 scenarios 数组，正确识别显式与隐式来源
    - `deriveScenariosFromCriteria(criteria)` 从 WHEN/THEN 子句正确反向提取
    - `classifyScenarioType(scenario)` 正确识别 api / ui / cli / mixed
    - `aggregateVerdicts(verdicts)` 产出总览 `{ pass, fail, skip, warn, blocksShip }`
17. THE 首版实施 SHALL 支持 API 与前端两类 scenario + 显式 + 隐式两种来源，CLI 与混合类、`@promote-derived` 流程在后续迭代实现——需求的 tasks 阶段可拆分为 MVP / Phase 2

---

## 优先级与依赖关系

| 优先级 | 需求 | 价值 | 投入（人日） | 依赖 | 建议落地顺序 |
|------|------|------|------|------|-----------|
| P1 | 需求 1 description 两句式强化 | ⭐⭐⭐⭐ | S(≤1d) | 扩展既有 `validate-skill-descriptions.mjs` | 第 1 步 |
| P1 | 需求 2 章节骨架定义 | ⭐⭐⭐⭐ | S(≤1d) | 无 | 第 2 步 |
| P1 | 需求 3 风格指南与模板 | ⭐⭐⭐⭐⭐ | M(≤3d) | 需求 1 + 2 | 第 3 步（汇总前两者） |
| P2 | 需求 4 Scripts as Black Box | ⭐⭐⭐ | M(≤3d) | 无 | 第 4 步（可并行） |
| P2 | 需求 5 frontend-check agent | ⭐⭐⭐⭐ | L(≤1w) | 需求 2 | 第 5 步 |
| P3 | 需求 6 Acceptance Scenario Eval | ⭐⭐⭐ | L(≤1w) | 需求 5（复用 Tier B） | 第 6 步（首版 MVP） |

**总投入估算**：MVP ≤ 12 人日（所有 P1 + 选 P2 之一），完整实施 ≤ 20 人日。

## 非目标（Not in Scope）

- **不做** `forge-ci-fix`：项目无 CI 流水线，ci-fix 的 GH Actions 依赖失去锚点；本地验证失败循环由现有 three-strike + forge-debug 覆盖
- **不做** `forge-feedback`（Bitbucket issue triage/dedupe）：已在其他 spec 规划
- **不做** `forge-webapp-test`（Playwright 测试）：已在其他功能规划
- **不做** SEO/AEO skill：Forge 作为元框架不承载业务层 SEO 逻辑
- **不做** MCP Server 创建能力（mcp-builder 原样）：Forge 作为 Claude Code skill 本身不需要
- **不回溯精修** 19 个已有 skill 以完全符合所有规则——仅对新建或大幅重构 skill 强制；已有 skill 的精修由 skill-document-optimization spec 单独推进
- **不删除** 任何现有 skill / agent 文件——本 spec 全部为新增或 frontmatter 级修改
- **不触及** `.forge/` 三区保护模型、三维路由、TDD 铁律等宪法级约定

## 向后兼容

- 所有需求均为增量新增，不修改现有 skill 的既有字段语义或实际执行路径
- 需求 1 的 description 改写仅涉及 frontmatter 文本，不影响 skill 触发逻辑
- 需求 3 的章节统一提供可选豁免机制（`deliverable_exempt: true`），避免强制回溯
- 需求 5 的 frontend-check 是新增 Layer 4，不影响现有 3 层 review 的行为
- 需求 6 的 acceptance eval 默认关闭（`acceptance_eval: false`），显式声明才启用
- 新增的验证脚本通过 `npm run check` 调用，校验失败的粒度为"新改动的 skill"，不回溯既有

## 风险与缓解

| 风险 | 概率 | 影响 | 代价（时间/人力） | 缓解 |
|-----|-----|-----|------------------|-----|
| description 规范化导致 router 误路由 | 低 | 中 | 2-4 人时（新 validator 回归测试） | 改写前后运行 router 路由判定测试套件，对比命中率；迁移分两步（warning → error） |
| 章节骨架统一破坏现有 output 结构 | 低 | 中 | 豁免 legacy 的话接近零 | 豁免机制 + 仅对新建强制 + 可选回溯由 skill-document-optimization 单独推进 |
| frontend-check Tier B 在非 cmux workspace 不可用 | 高 | 低 | 约 2 人时（降级路径测试） | Tier A+C 降级路径 + Prerequisites 双重检测（socket + workspace id）+ 输出明确 tier_availability |
| axe-core 版本升级破坏 Tier B 规则集 | 中 | 中 | 每次升级约 1 人日回归 | version pin + vendor 入库 + update-vendor-axe.sh 可回滚 |
| dev server 进程泄漏 | 中 | 低 | 泄漏后手动清理约 10 分钟 | 严格的 control_bash_process stop 纪律 + 5 分钟超时保护 + 异常路径也执行 stop |
| 登录态缓存凭证入库 | 中 | 高 | 事故恢复可能需数小时 | `.gitignore` 必含 `.forge/cache/` + tasks 阶段强制校验 + skill 文档警示 |
| acceptance eval 首次启用阻断 ship 造成生产阻塞 | 高 | 高 | 阻塞期约数小时至 1 天 | 默认 `acceptance_blocks_ship: false` 警告而非阻断；隐式来源默认不阻断 |
| Scripts as Black Box 禁止读源码导致漏改脚本 bug | 低 | 低 | 约 1 人时（破例读源码） | 例外机制（明确声明需要改/扩展脚本时允许） |
| 风格指南与现有 skill 大面积冲突 | 低 | 低 | 回溯 19 个 skill 约 3-5 人日 | 不强制回溯 + style_guide_version 机制 + PR 模板渐进引入 |
| spec 缺少 Scenarios 导致需求 6 无法触发 | 中 | 低 | 约 4 人时（反向提取算法） | 双来源支持（显式 + 隐式 reverse-derive）+ Prerequisites 不阻断 ship |
| MCP 或 cmux 未来行为变更 | 低 | 中 | 每次外部变更约 1 人日适配 | 探针先行 + 降级路径完备 + Prerequisites 版本校验 |
