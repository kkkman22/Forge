# Loop Engineering 橙皮书借鉴采纳 — 设计文档

## 概述

本设计落实三件事：(1) 让 adversarial-check 评判器具备行为验证能力（跑代码而非读代码）；(2) 新增 `/forge triage` 自动发现 skill；(3) 强化 loop 的 Mission Summary 对抗理解腐烂。三者在代码层几乎不耦合，可独立交付。设计原则：**复用 Forge 现有 harness 基建，不引入新依赖；零配置分发，对官方 Anthropic API 用户开箱即用；凡要求用户改基础设施的一律不做。**

## 设计决策

### D1: 行为验证挂在 adversarial-check 层，而非新建第四层 reviewer

- **问题描述**：行为验证应该放在 review 流程的哪一层？现有有 spec-check/quality-check/security-check/adversarial-check 四层。
- **候选方案**：
  - A. 新建第五层 `behavioral-check`，专职行为验证。
  - B. 挂在 adversarial-check，扩充其职责。
- **选择理由**：选 B。行为验证本质是"对 implementer 声称能跑的最强反驳"，与 adversarial-check 的"构造失败场景"同源——都是"不信它，自己动手验"。新建第五层增加 spawn 成本和并行协调复杂度，且行为验证是 adversarial 的手段而非独立关注点。论文 §05 Rajasekaran 的做法也是 evaluator 自己接 Playwright，不单列。
- **风险和缓解**：adversarial-check 职责变重可能拖慢。缓解：行为验证是**条件触发**（D2），低风险变更不触发。

### D2: 行为验证的高风险触发规则用文件路径 + diff 规模，不引入 AST 分析

- **问题描述**：如何判定"哪些变更值得跑行为验证"，而不对每个 diff 都启动服务？
- **候选方案**：
  - A. AST 分析变更影响面，精确判定。
  - B. 文件路径 glob + diff 行数阈值，粗粒度判定。
- **选择理由**：选 B。AST 分析复杂、慢、易错，且 Forge 不该承担静态分析框架的维护成本。路径 glob（`*.vue`/`*.tsx`/`src/**/route*`）+ diff≥100 行是论文/社区实践的朴素启发式，足够抓住绝大多数行为性变更，误报成本（多跑一次验证）远低于漏报成本（漏掉跑不起来的 bug）。规则放 `.forge/config.md` 可配，用户可调阈值。
- **风险和缓解**：粗粒度可能漏掉非典型路径的行为变更。缓解：规则可配，且 adversarial-check 仍保留静态推理作为兜底。

### D3: 行为验证复用 harness-playwright / harness-cdp，不引新依赖

- **问题描述**：行为验证需要启动服务、操作 UI、查 DOM、截图。用什么实现？
- **候选方案**：
  - A. 引入新测试框架（如 Vitest browser mode、Cypress）。
  - B. 复用 Forge 现有 `harness-playwright.ts`/`harness-cdp.ts`/`dev-server-lifecycle.ts`。
- **选择理由**：选 B。Forge 已有完整 harness 基建（`harness-detector.ts` 探测可用 harness、`harness-playwright.ts` 驱动 Playwright、`dev-server-lifecycle.ts` 管理 dev server 生命周期）。引入新依赖违反"零配置分发"原则，且增加插件体积。现有 harness 已处理了 harness 不可用时的探测逻辑，行为验证可直接复用其"探测→执行→回退"链路。
- **风险和缓解**：现有 harness 可能不完全适配 review 场景（它主要服务 dev/canvas）。缓解：先复用接口，必要时小幅扩展 `PlaywrightHarnessOptions`，不改架构。

### D4: 行为验证的 confidence 语义复用现有 5 级锚点

- **问题描述**：行为验证产出的证据，confidence 怎么标？
- **候选方案**：
  - A. 新增 `behavioral: true` 布尔字段标记。
  - B. 复用现有 confidence 锚点：行为验证 = `100`（机械验证/确定性）。
- **选择理由**：选 B。现有 5 级锚点（100/75/50/25/0）里 100 的定义就是"机械验证（确定性）"——行为验证跑出来的结果（截图、DOM 断言、测试 pass/fail）正是确定性证据。新增字段破坏现有 confidence 系统的一致性，且 review 合成逻辑（confidence gate）无需改。回退到静态推理时自然落到 ≤50，语义自洽。

### D5: triage skill 复用 loop 调度基建，不新建调度机制

- **问题描述**：triage 的定时触发用什么？
- **候选方案**：
  - A. 新建独立的 cron/定时机制。
  - B. 复用 loop 的 `CronCreate`/`ScheduleWakeup`，trigger prompt 指向 `/forge triage`。
- **选择理由**：选 B。loop skill 已建立完整的调度基建（`scheduling-strategy.ts` 的 `computeDelay`/`selectScheduler`）。triage 只是另一个被调度的 skill，复用同一套调度器避免重复造轮子，也符合论文 §04 零件一"automation 触发的是 skill 名"原则。triage 与 loop 的区别仅在"发现 vs 执行"，调度机制相同。
- **风险和缓解**：triage 与正在跑的 loop 可能并发。缓解：triage 只写 inbox 不开 build（R2-AC5），与 loop 不抢 worktree。

### D6: triage inbox 用 markdown 而非 JSON，对齐论文 Memory 零件

- **问题描述**：triage 的发现存成什么格式？
- **候选方案**：
  - A. JSON 结构化文件。
  - B. Markdown 文件（人类可读 + 结构化 frontmatter）。
- **选择理由**：选 B。论文 §03/§04 反复强调 Memory 零件是 markdown 或看板，"agent 会忘，仓库不会"——核心是**人能直接读**。triage inbox 的消费者首先是人（决定哪些值得 build），JSON 降低可读性。用带 frontmatter 的 markdown，既有结构（可被 agent 解析）又人可读。条目用 `## <id>` 分节，frontmatter 放元数据。

### D7: commit-narrative 落盘而非塞上下文，对抗理解腐烂且省 token

- **问题描述**：loop 的关键改动复述放哪？
- **候选方案**：
  - A. 塞进 Mission Summary 上下文一次性输出。
  - B. 每个 build commit 时落盘到 `.forge/runs/<run_id>/commit-narrative.md`，Mission Summary 摘录。
- **选择理由**：选 B。落盘符合论文 Memory 原则（"记忆在磁盘不在上下文"），且避免长 loop 的复述文本挤占 Mission Summary 的 token 预算。commit 时生成"干了什么+为什么"是上下文最丰富的时刻（agent 刚干完），事后从 git log 重构会丢失"为什么"。Mission Summary 只摘关键改动，超 5 条提示人工复核。

### D8: 跨品牌/跨端点评判器明确不做（产品决策，记录防重复评估）

- **问题描述**：是否在 Forge 里支持评判器打到不同品牌/端点的模型？
- **决策**：**不做。** Forge 是 Claude Code 插件市场分发产品。Claude Code 原生支持 per-subagent `model` 字段——对官方 Anthropic API 用户，`model: haiku` 自动打到 Haiku，**跨规格评判器零配置生效**。但跨品牌/跨端点需用户搭代理网关或改 `ANTHROPIC_BASE_URL`，分发摩擦致命。用户用第三方端点时 `model: haiku` 打到什么，是用户和端点之间的事，不是 Forge 该解决的。
- **理由**：守住"能力做在编排层，用户安装成本永远是装插件一步"。Forge 的 fresh-context 独立 subagent 已拿到论文收益①（无自我说服包袱），这是大头；行为验证（本 spec R1）拿到的质变收益远超模型差异。

## 接口设计

### 行为验证（adversarial-check 扩展）

`.claude/agents/forge-review.md` adversarial-check 层新增指令段：

```
## Behavioral Verification（行为验证）

WHEN 变更命中高风险规则（前端组件 *.vue/*.tsx/*.jsx，或路由/服务入口，或 diff≥100 行）：
  1. 探测 harness 可用性（harness-detector 逻辑）
  2. IF 前端变更 AND harness 可用：
     - 启动/复用 dev server（dev-server-lifecycle）
     - 导航到受影响路由
     - 执行 DOM 断言或截图
     - 产出 confidence:100 的行为证据
  3. ELIF 逻辑/服务变更：
     - 运行受影响文件的关联测试子集（非全量）
     - pass → confidence:100；fail → confidence:100（证伪）+ P0/P1 finding
  4. ELSE（harness 不可用）：
     - 回退静态推理，confidence≤50
     - 标注 behavioral_verification: skipped(reason)
```

### triage skill 接口

```
/forge triage              # 手动触发一次发现（默认能力，无需任何配置即可用）
/forge triage --install    # opt-in：安装 cron 定时触发（用用户自定义的 cron 表达式）
/forge triage --status     # 查看 last_triage_at + inbox 统计
/forge triage --uninstall  # 卸载定时触发，恢复为纯手动
```

**触发语义（D5 强化）**：
- 默认 `/forge triage` 手动触发，**永远可用，不依赖 `triage.enabled`**。
- `triage.enabled` 只控制"是否允许 `--install` 安装定时触发"，**不影响手动触发**。这样 opt-in 语义清晰：用户即使不想要定时打扰，也能随时手动跑一次。
- `triage.cron` **完全由用户自定义**，`"0 9 * * *"` 只是 config 模板里的示例默认值，用户改成半夜、工作日、每小时都行。

### triage 发现源（Jira + Bitbucket 主力场景）

主力发现源通过 MCP 拉取，**MCP 工具名配置化**（不硬编码，适配不同 mcp-atlassian/Bitbucket MCP 版本）：

| 发现源 | MCP | 关注什么 | 工具（可配） |
|---|---|---|---|
| **Jira active sprint case** | `mcp-atlassian` | 滞留(>In 天)/分配未启动/阻塞/待处理评论 | `jira_get_sprint_issues`、`jira_search`(JQL) |
| **Bitbucket PR** | Bitbucket MCP | 失败/冲突 PR、长期未合并 | （工具名配置化） |
| **Bitbucket 分支** | Bitbucket MCP | 长期未合并分支、可疑 force-push | （工具名配置化） |
| **本地 git（降级）** | git CLI | `--since=<last_triage_at>` 的 TODO/FIXME/HACK | 始终可用 |

**降级链（D6 新增）**：Jira/Bitbucket MCP 任一不可用 → 跳过该源，继续其余源 + 本地 git；全不可用 → 纯 git 发现源。绝不因 MCP 缺失而阻断 triage。

### triage inbox 条目格式（对齐 Jira/Bitbucket 引用）

```markdown
## TRIAGE-2026-0616-001
- source: jira-sprint
- external_ref: CH-1234          # Jira case key / PR URL / commit sha
- severity: high
- detected_at: 2026-06-16T09:00:00Z
- status: open
- summary: CH-1234 In Progress 已滞留 7 天（login 并发偶发失败）
- suggested_action: 开 worktree 进 build / 手动排查 / skip
```

### config.md 新增块

```markdown
triage:
  enabled: false                 # 只控制 --install 是否可装定时；不影响手动 /forge triage
  cron: "0 9 * * *"              # 用户自定义（示例默认，可改任意表达式）
  sources: [jira-sprint, bitbucket-pr, bitbucket-branch, git]   # 启用的发现源
  stale_days: 5                  # Jira case 滞留阈值（天）
  assignee: ""                   # Jira 当前用户标识（空=读 MCP 用户上下文）
  mcp:
    jira_tools:                  # mcp-atlassian 工具名映射（适配版本差异）
      get_sprint_issues: "jira_get_sprint_issues"
      search: "jira_search"
    bitbucket_tools:             # Bitbucket MCP 工具名映射
      list_prs: ""
      get_pr: ""
  high_risk_globs:               # 行为验证触发规则（R1-AC2）
    - "*.vue"
    - "*.tsx"
    - "*.jsx"
    - "src/**/route*"
    - "src/**/server*"
  behavioral_diff_threshold: 100 # 行为验证 diff 行数阈值
```

### commit-narrative 落盘

`.forge/runs/<run_id>/commit-narrative.md`（每个 build commit 追加一节）：

```markdown
## <commit_sha>
- subject: <commit subject>
- what: 一句话说明改了什么
- why: 一句话说明为什么这么改
```

Mission Summary §10 摘录该文件的关键节（≤5 条），超 5 条输出"建议人工逐条复核"。

## 数据模型

无 TypeScript 类型变更。新增/扩展的纯文件产物：

| 产物 | 路径 | 性质 |
|---|---|---|
| triage inbox | `.forge/triage-inbox.md` | 新增，markdown，append-only |
| triage 时间戳 | `.forge/state/triage-state.json`（`last_triage_at`） | 新增，轻量 JSON |
| commit 叙事 | `.forge/runs/<run_id>/commit-narrative.md` | 新增，markdown，append-only |
| config 块 | `.forge/config.md` 的 `triage:` 块 | 新增配置 |

`loop-state.json` 无需改（triage 独立于 loop run）。

## 风险

| 风险 | 缓解 |
|---|---|
| 行为验证拖慢 review（启动 dev server 慢） | 条件触发（D2），仅高风险变更；逻辑变更只跑关联测试子集；harness 不可用即回退（R1-AC7） |
| 行为验证在 CI 环境（无 GUI）失败 | 复用 sandbox 策略，sandbox 不可用按 R1-AC8 回退静态推理，不阻断 review |
| triage 误报淹没 inbox | severity 分级；人工复核点（R2-AC5 不自动 build）；inbox 条目可 skip/done 收敛 |
| triage 本地 cron 漏触发（机器关机） | 文档明确约束（R2-AC8），不承诺关机运行；云端 scheduling 明确排除（D8 同源决策） |
| commit-narrative 增加每 commit 开销 | 生成是 build commit 时的轻量追加（不重新推理），落盘不塞上下文 |
| 行为验证证据（截图）占用磁盘 | 截图存 `.forge/runs/<run_id>/` 随 run 归档清理，不进 git |
| 与 `review-adversarial-stance` 职责重叠 | 该 spec 只改"态度/指令"（assume broken），本 spec 改"手段"（跑代码），互补不重叠 |
