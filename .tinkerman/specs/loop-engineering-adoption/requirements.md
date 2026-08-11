---
name: loop-engineering-adoption
status: draft
feature: loop-engineering-adoption
layout: requirements
created: "2026-06-16"
updated: "2026-06-16"
priority: P2
tier: standard
source: Loop Engineering 橙皮书 v260615（花叔，基于 Addy Osmani / Anthropic 框架）
---

# Loop Engineering 橙皮书借鉴采纳 — 需求文档

## 背景

《Loop Engineering 橙皮书 v260615》系统化提出了"循环工程"框架：四层栈（prompt→context→harness→loop）、五个动作（发现→交付→验证→持久化→调度）、六个零件（Automations/Worktrees/Skills/Connectors/Sub-agents/Memory）、生成器-评判器分离、以及四笔代价（验证债/理解腐烂/认知投降/token 失控）。

逐项对照 Forge 现状后，结论如下：

**已经对齐、不做**：Skills（整个 `/forge` 即 skill 编排）、Worktrees（`worktree-manager.ts` + 分支门禁）、Memory（`.tinkerman/` 文件系统交接 + `events.ndjson`）、验证与持久化（三层 review + progress 文件）、调度（`ScheduleWakeup`/`CronCreate`）。Forge 把论文"难的是往循环里放能说不的东西"写成了不可违反的 IRON-LAW 系统，是论文该思想的极致体现。

**经过讨论决定不做**（附理由，记录在此防止日后重复评估）：
- **token 硬上限**（论文 §07）：Forge 测不准真实 API 花费（`token-estimate.ts` 估的是 context window 占用，非 provider 侧实际消耗）；现有 three-strike + `stopWhen max-iterations` 已能拦住跑飞的 loop。用户侧 provider 级配额（如 GLM coding plan 的周限/5h 额度）本身就是硬天花板。**收益覆盖不了测不准的成本**。
- **跨品牌评判器**（论文 §05 "different model"）：Forge 是 Claude Code 插件市场分发产品，面向大量开发者。跨品牌/跨端点需用户搭代理网关或开多进程（改 `ANTHROPIC_BASE_URL` 等），**分发摩擦致命**，不该作为推荐架构。这是用户自行增强的高阶玩法，不上升为 Forge 特性。
- **关机也跑 / Cloud scheduling**（论文 §06）：当前条件不允许（需 Forge 支持 headless + CI 运行），明确不做。

**值得做、零分发摩擦、且真正补齐 Forge 缺口的**（本 spec 范围）：
1. **行为验证**（论文 §05 Rajasekaran 接 Playwright）——评判器从"读代码"升级为"跑代码"。这是质变收益，比换任何模型都大，且完全在 Forge 编排内部实现，用户零配置。
2. **自动发现 / triage loop**（论文五动作之首"发现"）——Forge 的 loop 当前是任务驱动（用户给 goal），缺"自动发现该干什么"这一动作。补齐后 Forge 才是论文说的"loop 自己找活干"。**主力发现源是用户的真实工作流：Jira active sprint 的 case 状态 + Bitbucket 仓库动态**（Forge 主力用户场景：Jira 管理项目、Bitbucket 托管代码），通过 `mcp-atlassian` 和 Bitbucket MCP 拉取，而非扫一个跟用户无关的通用 issue/CI 流。
3. **理解腐烂对策**（论文 §07）——long-running loop 产出后，强制人工可理解的摘要，防止"代码在长、脑里的地图停了"。

**与现有 spec 的关系**：
- `review-adversarial-stance`（completed）只覆盖了评判器的**态度/指令**（"assume broken until proven otherwise"），**未覆盖行为验证**（"跑代码而非读代码"）。本 spec 的行为验证需求与之互补、不重叠。
- `build-goal-replace-loop`（retired-partial）已交付 `/goal` 驱动 build 内 TDD 循环。本 spec 的 triage 需求复用其调度基建，不改 `/goal` 集成。
- `gsd-core-adoption/spec-3-goal-backward-verification.md` 是 goal 条件的向后验证，与行为验证的"评判器跑代码"是不同切面，不冲突。

## 目标

1. 让 Forge 的评判器具备**行为验证**能力：不只读 diff 判断"看起来对不对"，而是运行测试/启动服务/查 DOM/截图，判断"跑起来对不对"。对官方 Anthropic API 用户开箱即用，用户安装成本永远是"装插件"一步。
2. 让 Forge 具备**自动发现**能力：定时扫描 CI 失败/open issues/最近 commit，把值得做的事写进 triage inbox，对齐论文五动作的"发现"。
3. 让 Forge 的 long-running loop 产出**可复述摘要**，对抗理解腐烂。

**非目标**（明确排除，防止 scope creep）：
- 不做 token 花费硬上限。
- 不做跨品牌/跨端点模型路由。
- 不做云端/headless scheduling。
- 不改变 review 的三层架构。
- 不新增 TypeScript 依赖（行为验证复用现有 Playwright/Harness 基建，不引入新测试框架）。

## 术语

- **Loop Engineering**：本 spec 所参考的框架，详见背景。核心是"从 prompt agent 的人，变成设计驱动 agent 的系统的人"。
- **行为验证（Behavioral Verification）**：评判器通过运行代码（跑测试、启动服务、点 UI、查 DOM、截图）验证正确性，而非仅静态读 diff。论文 §05 Rajasekaran 的做法。
- **生成器-评判器分离（Generator-Evaluator Separation）**：写代码的 agent 不评审自己，由独立 subagent 评审。Forge 已通过独立 review subagent 实现，本 spec 强化的是评判器的"动手"能力。
- **fresh-context 评判器**：评判器是独立 subagent，不携带"我为什么这么写"的干活上下文。这是论文收益①（无自我说服包袱）的来源，Forge 已具备。
- **triage（分诊）**：论文五动作之首"发现"。自动扫描 CI 失败/open issues/最近 commit，判断哪些值得动手，写进 inbox。
- **triage inbox**：自动发现的、值得处理的事项落盘文件（`.tinkerman/triage-inbox.md`），对应论文 Memory 零件。"agent 会忘，仓库不会"。
- **理解腐烂（Understanding Rot）**：论文 §07 第二笔代价。循环交付你没写的代码越快，"实际存在的东西"和"你真正理解的东西"的差距越大。
- **Mission Summary**：Forge loop 结束时的产出摘要（loop instructions §10）。本 spec 强化其"可复述性"以对抗理解腐烂。

## 需求

### Requirement 1: 评判器行为验证能力（adversarial-check 接 harness）

**User Story:** 作为 Forge 用户，我希望 adversarial-check 评判器不只读 diff，还能运行测试、启动服务、查 DOM、截图来判断"跑起来对不对"，这样能抓出"看起来对但跑起来错"的问题。

#### 验收标准

1. THE `.claude/agents/forge-review.md` 的 adversarial-check 层 SHALL 在现有"失败场景构造"职责之外，新增**行为验证**职责：对涉及 UI/服务行为的高风险变更，运行可执行验证而非仅静态推理。
2. THE adversarial-check SHALL 定义"高风险变更"判定规则：变更文件命中以下任一即触发行为验证——`*.vue`/`*.tsx`/`*.jsx`（前端组件）、`src/**/route*`/`src/**/server*`（路由/服务入口）、测试文件以外的 `*.test.*`/`*.spec.*` 关联的源文件改动、或 diff ≥ 100 行的行为性改动。
3. THE adversarial-check SHALL 复用 Forge 现有 harness 基建（`harness-playwright.ts`/`harness-cdp.ts`/`harness-pty.ts`）执行行为验证，**不引入新的测试框架依赖**。
4. WHEN 高风险变更是前端组件，THE adversarial-check SHALL 至少执行一项动态验证：启动 dev server（或复用已运行的）→ 导航到受影响路由 → 查询 DOM 断言或截图 → 将结果作为 confidence=100 的机械证据。
5. WHEN 高风险变更是纯逻辑/服务端，THE adversarial-check SHALL 运行 `ci_check_command` 之外的针对性测试子集（仅跑受影响文件的关联测试），而非全套测试。
6. THE 行为验证结果 SHALL 以 `confidence: 100`（机械验证）标注，与现有的 75/50/25/0 推理性 confidence 区分。
7. WHEN 行为验证不可执行（dev server 起不来、harness 不可用），THE adversarial-check SHALL 回退到静态推理并将该 finding 的 confidence 降为 ≤50，同时在输出中标注 `behavioral_verification: skipped(reason)`。
8. THE 行为验证 SHALL 遵守 Forge 现有 sandbox 策略，不在 CI 中启动需要 GUI 的进程（sandbox 不可用时按 AC7 回退）。

### Requirement 2: /forge triage 自动发现能力（Jira + Bitbucket 主力场景）

**User Story:** 作为 Forge 用户，我用 Jira 管理项目、Bitbucket 做代码仓库（Forge 主力开发场景）。我希望 triage 能自动拉取我 active sprint 里的 case 状态（滞留的、未动的、阻塞的）和 Bitbucket 仓库动态（失败的 PR、未合并的分支、可疑提交），把值得我关注的事写进 triage inbox，这样 Forge 能"自己找活干"而不总是我喂任务给它。

**triage 的目标**：让 agent 主动从用户的**真实工作流**（Jira sprint + Bitbucket 仓库）里发现"值得动手但用户还没注意到"的事，而不是扫一个跟用户无关的 CI/issue 流。对齐论文五动作之首"发现"——"让 agent 自己去找活，而不是你把活喂给它"。

#### 验收标准

1. THE `skills/forge/lib/triage/` SHALL 新增 triage 子 skill，职责为"发现"：拉取发现源 → 判断价值 → 写进 inbox。
2. THE triage skill SHALL 通过 MCP 连接用户的项目管理与代码仓库。**主力发现源**（Forge 主力场景：Jira + Bitbucket）：
   - **Jira active sprint case**：通过 `mcp-atlassian`（Jira MCP）拉取当前用户 active sprint 里的 case。工具名配置化（见 AC8），不硬编码。关注的 case 状态（可配置）：
     - 长期滞留（In Progress 超过 N 天，N 可配，默认 5）
     - 分配给我但未启动（To Do 且 assignee = 当前用户）
     - 阻塞（有 Blocks 链接或标注 blocked）
     - 有新评论/状态变更待处理
   - **Bitbucket 仓库动态**：通过 Bitbucket MCP 拉取。工具名配置化。关注：
     - 失败/冲突的 PR（需人工介入）
     - 长期未合并的分支（可清理）
     - 近期可疑提交（大范围重构、force-push）
   - **代码仓库本地动态**（git，始终可用作降级）：`git log --since=<last_triage_at>`，识别新增 TODO/FIXME/`// HACK`。
3. THE triage skill SHALL 具备**降级链**：当 Jira/Bitbucket MCP 不可用时（未配置/未授权/网络不通），降级到本地 git 发现源，并在 inbox 记录 `source: git-fallback`，**不阻断 triage 运行**。
4. THE triage skill SHALL 将每个值得处理的发现写入 `.tinkerman/triage-inbox.md`，条目格式包含：`id`、`source`（jira-sprint/bitbucket-pr/bitbucket-branch/git-fallback）、`external_ref`（Jira case key 如 `CH-1234` / PR URL / commit sha）、`summary`、`severity`（high/medium/low）、`detected_at`、`status`（open/in-progress/done/skip）、`suggested_action`。
5. THE triage skill SHALL 对每个 high severity 发现建议下一步动作（开 worktree 进 build / 手动排查 / 标记 skip），但不自动启动 build——**发现与执行分离**，保留人工复核点（论文 §09 清单第六条）。
6. THE `.tinkerman/state/triage-state.json` SHALL 记录 `last_triage_at` 时间戳，供下次 triage 增量扫描（只看上次之后的变更），避免重复报告已记录的 case/PR。
7. **触发方式（默认人工，定时 opt-in，时间可配）**：
   - **默认**：triage **不自动运行**。用户敲 `/forge triage` 手动触发一次。
   - **定时（opt-in）**：用户主动敲 `/forge triage --install` 显式同意后，才安装定时触发。`cron` 表达式**用户可自定义**（非硬编码 9 点）。
   - **关机不跑**：本地 cron 需 Claude Code 进程活着，机器关了就漏触发。文档 SHALL 明确说明此限制，不承诺"关机也跑"。云端/headless scheduling 明确排除（本 spec 范围外）。
   - 触发 prompt 是具名 skill `/forge triage` 而非指令墙（论文 §04 零件一原则）。
8. THE `.tinkerman/config.md` SHALL 新增 triage 配置块（`forge init` 模板含默认值）：
   - `triage.enabled`（默认 false，opt-in 控制定时是否安装，**不影响手动 `/forge triage`**）
   - `triage.cron`（用户自定义 cron 表达式，默认 `"0 9 * * *"`，仅作示例）
   - `triage.sources`（数组：`jira-sprint`/`bitbucket-pr`/`bitbucket-branch`/`git`）
   - `triage.stale_days`（case 滞留阈值，默认 5）
   - `triage.assignee`（Jira 当前用户标识，用于"分配给我"过滤；默认读 MCP 用户上下文）
   - `triage.mcp.jira_tools`（Jira MCP 工具名映射，如 `{"get_sprint_issues": "jira_get_sprint_issues", "search": "jira_search"}`，**配置化以适配不同 mcp-atlassian 版本**）
   - `triage.mcp.bitbucket_tools`（Bitbucket MCP 工具名映射，同上配置化）
9. THE triage skill SHALL 在 MCP 未配置时给出清晰指引（如何配置 `mcp-atlassian` 和 Bitbucket MCP），而非静默失败。指引指向 `.tinkerman/config.md` 的 MCP 工具映射配置。

### Requirement 3: loop 产出可复述摘要（对抗理解腐烂）

**User Story:** 作为 Forge 用户，我希望 long-running loop 跑完后，Mission Summary 不只是"完成了几个 phase、几个 commit"，还能让我逐条看懂"每个关键改动干了什么、为什么"，这样我不会在 loop 跑顺后变成"看不懂自己项目的看门人"。

#### 验收标准

1. THE `skills/forge/lib/loop/instructions.md` §10 Mission Summary SHALL 在现有统计（wall-clock/iterations/phases/token）之外，新增**关键改动复述段**。
2. THE 关键改动复述段 SHALL 对 loop 期间的每个 build commit 生成一条：`commit_sha` + `subject` + `一句话人类可读说明`（这个改动解决了什么、改了什么）。说明由 loop 在 commit 时落盘到 `.tinkerman/runs/<run_id>/commit-narrative.md`，而非事后从 git log 重构。
3. THE 复述段 SHALL 按论文 §07 的检查方式组织：挑出 loop 产出的关键改动，每条用"干了什么 + 为什么这么改"两要素，控制在能让一个没参与的人 30 秒内理解。
4. WHEN Mission Summary 的关键改动超过 5 条，THE 摘要 SHALL 标记"建议人工逐条复核"，提示用户对抗认知投降（论文 §07 第三笔代价）。
5. THE `/forge learn` SHALL 新增"理解确认"提示：当从 runs/ 提取经验时，提示用户至少复述一条关键改动的意图，复述不出则标记"理解地图需更新"。

## 验收标准

本 spec 整体验收：

| 验收点 | 验证方式 |
|---|---|
| 行为验证可执行 | 对一个前端组件改动跑 review，adversarial-check 产出 `confidence:100` 的行为证据 |
| 行为验证回退 | sandbox 不可用时，adversarial-check 回退到静态推理并标注 `behavioral_verification: skipped` |
| triage 发现写入 inbox | 跑 `/forge triage`，`.tinkerman/triage-inbox.md` 出现结构化条目（含 Jira case key / Bitbucket PR 引用） |
| triage 增量扫描 | 第二次 triage 只看 `last_triage_at` 之后的变更，不重复报告 |
| triage MCP 降级 | Jira/Bitbucket MCP 未配置时降级到 git 发现源，inbox 标 `source: git-fallback`，不阻断 |
| triage 触发语义 | 默认不自动跑；`/forge triage` 手动可用；`--install` 后按用户自定义 cron 定时 |
| Mission Summary 含复述 | loop 跑完后 Mission Summary 出现"关键改动复述段" |
| 零配置分发 | 官方 Anthropic API 用户装插件即得行为验证能力，无需改任何配置 |

## 风险

| 风险 | 缓解 |
|---|---|
| 行为验证拖慢 review | 仅对高风险变更触发（AC2），逻辑变更只跑关联测试子集（AC5），非全量 |
| dev server 启动不稳定 | harness 不可用时回退静态推理（AC7），不阻断 review |
| triage 误报噪音 | severity 分级 + 人工复核点（AC5 不自动 build），inbox 可 skip |
| triage 本地 cron 依赖机器在线 | 文档明确约束（AC8），不承诺关机运行；云端 scheduling 明确排除 |
| 复述段增加 token 占用 | commit-narrative.md 落盘而非塞上下文；Mission Summary 只摘关键改动 |
