# Decision Transcript: Forge Review 内联评论交付通道（Bitbucket-first）

**Date**: 2026-05-23
**Status**: 决策已锁定（4 个开放问题已回答，待 `/forge decide` 转为正式 ADR）
**Trigger**: Claude Code 2.1.147 引入 `/code-review --comment`，调研其在 Forge 项目的跟进价值
**Predecessor**: `.tinkerman/decisions/2026-05-16-claude-code-uplift-2.1.143.md`

---

## 1. 背景

Claude Code 2.1.147 changelog 引入 `/code-review` 命令（原 `/simplify`），支持 `--comment` 标志将 findings 作为内联评论 post 到 PR。该命令的实现（[GitHub 源码](https://github.com/anthropics/claude-code/blob/main/plugins/code-review/commands/code-review.md)）锁死了 `gh` CLI 和 `mcp__github_inline_comment__create_inline_comment` 工具，**仅支持 GitHub**。Bitbucket 集成被 Anthropic 标记为 duplicate 关闭（[issue #40829](https://github.com/anthropics/claude-code/issues/40829) → #38179），无官方实现计划。

Forge 当前 review 阶段产物是 `.tinkerman/reviews/<run-id>.md`，依赖人工查看和 ship 阶段 gate（参见 ADR-0005 fallback ladder）。Bitbucket 是 Forge 团队的主要代码协作平台，现有 `bitbucket` MCP power 已经提供完整的 PR 操作能力。

## 2. 调研结论

### 2.1 Bitbucket MCP Power 能力清单（关键工具）

| 工具 | 用途 |
|---|---|
| `add_comment` | 内联行级评论，支持 `file_path` + `line_number` / `code_snippet` 自动定位、`line_type`（ADDED/REMOVED/CONTEXT）、`suggestion` 代码建议块、`parent_comment_id` 线程化回复 |
| `create_pr_task` | Bitbucket Server 独有的 PR Task（待办状态机） |
| `set_pr_task_status` | 标记 task done / 重开 |
| `list_pr_tasks` / `delete_pr_task` | 查询和删除 PR Task |
| `convert_pr_item` | comment ↔ task 互转 |
| `set_review_status(request_changes)` | 顶层评审动作：请求改动 |
| `get_pull_request_diff` | 结构化 diff（含 source_line/destination_line/type/content），review subagent 的理想输入 |
| `get_pull_request` | 读取已有 active comments，用于幂等 post |

能力**比 GitHub 版本更丰富**：PR Task 是状态机（不只是文字）、`code_snippet` 自动定位行号（不需要算 SHA）、`suggestion_end_line` 支持多行 suggestion。

### 2.2 关键事实：PR Task 的阻断能力依赖配置

Bitbucket Data Center 8.x/9.x 提供 **"No incomplete tasks" merge check**（参见 [Bitbucket Data Center 8.9 文档](https://ja.confluence.atlassian.com/display/BITBUCKETSERVER089/Default+tasks)），但**必须由仓库管理员显式启用**才生效。否则 PR Task 只是显眼的 comment，没有真正的 merge 阻断能力。

> 内容已重述以符合许可。

## 3. 决策（草案）

**采用双层混合设计：PR Task 承载 P0/P1 的"必须解决"语义，inline comment 承载详细诊断与代码建议。**

### 3.1 Finding → Bitbucket 映射

```
P0/P1 finding（必须修复，阻断 ship — 详见 spec review-comment-bitbucket）
    ├─ create_pr_task("[Forge P0/P1] <one-line summary>")
    └─ add_comment(
         file_path, line_number, line_type,
         comment_text=<详细描述 + 链接到 task>,
         suggestion=<可选的 committable suggestion>
       )

P2 finding（建议修复 — 详见 spec review-comment-bitbucket）
    └─ add_comment（普通 inline comment，无 task）

P3 finding（开发者决定 — 不进入 spec scope，仅本节描述）
    └─ 仅写入 .tinkerman/reviews/<run-id>.md
    └─ 不创建 PR Task
    └─ 不创建 inline comment
    └─ 不影响 set_review_status

存在任何 P0/P1 → set_review_status(pull_request_id, request_changes=true,
                                   comment="Forge review found N P0/P1 findings")
```

#### P3 处理规则（不进入 spec，仅文档化）

P3 finding 在本通道**完全不向 PR 投递**，理由：

1. **§3.3 P0/P1 必须修是阻断语义，P2 是协商语义，P3 是纯建议性** — 把 P3 投递到 PR 会稀释 task/comment 的信号强度，违反"high-signal only"原则（呼应 Claude 官方 `/code-review` 的过滤准则）
2. **review markdown 已是 source of truth** — 开发者主动查看 `.tinkerman/reviews/<run-id>.md` 即可看到 P3，不需要 PR 通知
3. **可观测性兜底** — `.tinkerman/knowledge/metrics.md` 累计每次 review 的 P3 计数，便于团队事后分析"我们丢了多少建议"

如果未来需要支持"P3 也投递"，应通过新增 `p3_strategy: inline` 配置项实现（schema 已预留，见 §5.2），但**默认且强烈建议保持 `p3_strategy: none`**。本 spec **不实现 P3 inline 模式**。

### 3.2 设计依据

**为什么不是单选 PR Task**：
- PR Task 是纯文本，没有 ADDED/REMOVED 行类型染色
- 不能附 committable suggestion
- 长文本难读

**为什么不是单选 inline comment**：
- "阻断 ship" 的语义靠纯文字传递太弱
- 没有显式"已解决"状态机
- 容易在新 push 后沉没

**双层的价值**：
- PR Task 列表 = Forge P0/P1 dashboard，开发者打开 PR 一眼看到"还有 N 个必须修"
- Inline comment = 详细诊断，精确定位行号、染色、给出 suggestion
- 即使 "No incomplete tasks" merge check 未启用，`request_changes` 状态 + Forge ship 阶段 gate（ADR-0005 L3）+ Forge 自身 P0/P1 阻断（§3.3）形成三道独立保险

### 3.3 已确认的设计参数（用户 2026-05-23 拍板）

#### A1: "No incomplete tasks" merge check 假设

**采纳**：按"未启用"假设设计。方案不依赖该 merge check 是否启用，启用即获得额外 bonus。

依据：避免依赖 Forge 控制范围之外的环境配置。Bitbucket 实例的仓库管理员可能因为各种原因不启用该 check，方案必须在最弱前提下仍然成立。如果实例后续启用，PR Task 会自动获得真正的 merge 阻断能力，无需修改 Forge 代码。

#### A2: PR Task 关闭策略

**采纳**：双方都能关（开发者手动 + Forge 重评审时自动 reconcile）。

具体规则：
- 开发者：在 Bitbucket UI 点 done 或 API 调用 `set_pr_task_status(done=true)`，Forge 不阻止
- Forge：每次 `/forge ship` 触发的重评审中，按 §4.3 幂等机制对账：
  - 当前 review 已不存在的 finding → 自动 `set_pr_task_status(done=true)` + 评论 `Forge auto-resolved (no longer present in review v<N>)`
  - 仍然存在 → 保持 task 开启
  - 新出现 → 创建新 task
- 冲突处理：开发者已关 + 当前 review 仍存在该 finding → Forge **重新打开** task 并评论 `Forge re-opened (still present in review v<N>)`

依据：兼顾开发者灵活性和审计可验证性。"糊弄关闭"风险通过"重新打开"机制兜底——即使开发者点 done 但没真修，下一次重评审会自动重开。

#### A3: 平台支持范围

**采纳**：暂时仅支持 Bitbucket。SKILL 命名锁定 `review-comment-bitbucket`，不抽象 platform layer。

依据：
- Forge 团队主要使用 Bitbucket，GitHub 是次要场景
- 抽象 platform layer 会显著增加 SKILL 复杂度，违反 §2.6 输出克制原则
- 未来如需支持 GitHub，可另开独立 SKILL `review-comment-github`，复用 finding-hash 和 reconcile 纯函数模块（lib 内部抽象）
- Claude Code 官方 `/code-review --comment` 已经覆盖 GitHub，Forge 不必重复造轮子

#### A4: comment_channel 开关粒度与优先级

**采纳**：默认 per-project（`.tinkerman/config.md`），CLI flag `--post-comments` 可临时覆盖。

优先级（高 → 低）：
1. CLI flag `--post-comments` / `--no-post-comments`（per-run，最高优先级）
2. `.tinkerman/config.md` 的 `review.comment_channel.enabled`（per-project）
3. 内置默认值：`false`（最低优先级，保守开关）

依据：
- per-project 适合稳定团队规约（一次配置长期生效）
- CLI flag 提供 ad-hoc 控制（比如调试时临时关闭、紧急 ship 时临时启用）
- 默认关闭遵循"opt-in 引入新副作用"原则，避免老用户升级 Forge 后意外向 PR 发评论

#### A5: 平台前置门禁（Platform Precondition Gate）

**采纳**：在 post 流程启动前增加 **平台前置门禁**——只有当当前仓库实际托管于 Bitbucket 时才走此流程，否则静默跳过（不报错）。

执行顺序（高 → 低）：

1. **远端 URL 检测**（主路径，零成本）
   - 读取 `git config --get remote.origin.url`（或当前 PR 关联的 remote）
   - 匹配 Bitbucket 特征：
     - URL 包含 `bitbucket.` 子域（如 `bitbucket.yourcompany.com`、`bitbucket.org`）
     - 或匹配 `BITBUCKET_BASE_URL` 配置的 host（环境变量或 MCP 配置中已注入）
   - 多 remote 时：优先 `origin`，其次 PR upstream，最后所有 remotes 取第一个匹配项

2. **配置覆盖**（second，应对边缘情况）
   - `.tinkerman/config.md` 的 `review.comment_channel.platform_override`：
     - `auto`（默认）：完全依赖远端 URL 检测
     - `bitbucket`：强制识别为 Bitbucket（用于私有镜像 / 内网代理 / 非标准域名场景）
     - `none`：强制禁用，永不识别为 Bitbucket（即使 URL 匹配也跳过）

3. **MCP 配置可达性检查**（pre-flight）
   - 即使 URL 匹配，也需确认 `bitbucket` MCP power 已配置且 `BITBUCKET_BASE_URL` 与 remote URL **同源**
   - 不同源时跳过并记录 `.tinkerman/findings/comment-channel-skipped-<date>.md`：
     - `reason: mcp-base-url-mismatch`
     - `remote_url: <git remote>`
     - `mcp_base_url: <BITBUCKET_BASE_URL>`

4. **失败模式：静默跳过 + 留痕**
   - 任何检测失败 → post 流程**静默跳过**，review markdown 仍正常产出
   - skip 原因写入：
     - 同一 review run 的 `.tinkerman/reviews/<run-id>.md` 末尾追加 `## comment_channel: skipped (reason: <code>)` 段
     - `.tinkerman/knowledge/tool-health.md` 累积 skip 计数（用于检测配置漂移）

依据：
- **避免对非 Bitbucket 项目造成噪音或误调用**：Forge 是通用框架，可能被 fork 到 GitHub/GitLab/Gitea 项目使用。即使 SKILL 锁定 bitbucket，运行时也必须自检平台
- **静默跳过而非报错**：在 GitHub 项目里跑 `/forge ship --post-comments` 不应当 fatal，应当降级（review markdown 仍是 source of truth）
- **配置覆盖应对企业内网**：有的团队 Bitbucket 部署在 `code.internal.example.com` 这种无 `bitbucket` 关键字的域名，需要手动 override 路径
- **MCP 同源校验防止跨实例误发**：避免一个 MCP 配置指向 staging Bitbucket，但 git remote 指向 production，导致评论发错地方

##### 检测决策矩阵

| 远端 URL 特征 | platform_override | bitbucket MCP 配置 | 同源 | 决策 |
|---|---|---|---|---|
| 含 `bitbucket.` | auto | 已配置 | ✓ | ✅ 走 post 流程 |
| 含 `bitbucket.` | auto | 已配置 | ✗ | ⏭ 跳过（mcp-base-url-mismatch） |
| 含 `bitbucket.` | auto | 未配置 | — | ⏭ 跳过（mcp-not-configured） |
| 不含 `bitbucket.` | auto | 任意 | — | ⏭ 跳过（platform-not-bitbucket） |
| 任意 | bitbucket | 已配置 | ✓ | ✅ 走 post 流程（强制） |
| 任意 | bitbucket | 已配置 | ✗ | ⏭ 跳过（mcp-base-url-mismatch） |
| 任意 | bitbucket | 未配置 | — | ⏭ 跳过 + 警告（override-but-mcp-missing） |
| 任意 | none | 任意 | — | ⏭ 跳过（platform-disabled-by-config） |

## 4. 架构对接现有 Forge 设计

### 4.1 与 ADR-0005 fallback ladder 的关系

```
L0 (subagent parallel) → 产出 .tinkerman/reviews/*.md
                        ↓ opt-in (--post-comments / config.md)
                     [A5 平台前置门禁] ← 检测当前仓库是否 Bitbucket
                        ↓ 通过
                     新 SKILL: forge-review-comment-bitbucket
                        ↓ 调用 bitbucket MCP power
                     PR Tasks + inline comments
L1 (serial retry)     → 同上
L2 (CI evidence)      → 同上（如果 CI 报告 parse 后能产出 P0/P1）
L3 (unavailable)      → 不 post（review 未产出，无可 post 内容）
                        Forge ship 阶段照常 block
```

不修改 fallback ladder 本身，post 通道是 review 完成后的**独立交付层**，前置门禁是该层的入口守卫。

### 4.2 与 §3.3 P0/P1 阻断的关系

P0/P1 的 ship 阻断**仍然由 Forge 自身控制**（fallback ladder L0-L3 + ship gate），Bitbucket PR Task 是**附加的协作层**：
- Forge 视角：`.tinkerman/reviews/*.md` 是 source of truth，ship 看 markdown 决定是否阻断
- Bitbucket 视角：PR Task + comments 是开发者的协作界面

两套机制独立运作，互不污染。

### 4.3 幂等机制

每次 post 前：

1. `list_pr_tasks` → 已有 Forge 创建的 tasks（按 task 文本前缀 `[Forge P0]` / `[Forge P1]` 识别）
2. `get_pull_request` → 已有 inline comments（按 comment 前缀 `<!-- forge-review:hash=... -->` 识别）
3. 计算每个 finding 的稳定 hash：`sha256(file_path + line_number + finding_type + first_100_chars_of_message)`
4. 对比已有 vs 当前：
   - 缺失的 finding（已有但本次没有）→ 标记 task done，comment 不动（保留历史）
   - 新增的 finding → 创建 task + comment
   - 重复的 finding → 跳过

## 5. 实现草图（spec 阶段细化）

### 5.1 新 SKILL：`skills/forge/lib/review-comment-bitbucket/`

```
review-comment-bitbucket/
├── instructions.md       # SKILL 主文档
├── lib/
│   ├── post.ts          # 主入口：read review markdown → call bitbucket tools
│   ├── platform-gate.ts # A5 决定：平台前置门禁（远端 URL + override + MCP 同源）
│   ├── finding-hash.ts  # 稳定 hash 计算
│   ├── reconcile.ts     # 已有 vs 当前 finding 对账（含 auto-reopen-regressed）
│   └── format.ts        # finding → comment_text / task_text 格式化
└── test/
    ├── platform-gate.test.ts  # 8 行决策矩阵的边界测试
    ├── finding-hash.test.ts
    ├── reconcile.test.ts
    └── format.test.ts
```

### 5.2 配置项（写入 `.tinkerman/config.md`）

```yaml
review:
  comment_channel:
    enabled: false              # 默认关闭（A4 决定），opt-in
    platform: bitbucket         # A3 决定：暂仅支持 bitbucket
    platform_override: auto     # A5 决定：auto | bitbucket | none
    p0_p1_strategy: both        # both（task + inline，默认）| pr-task | inline-only
    p2_strategy: inline         # inline | none
    p3_strategy: none           # none（默认，仅写 markdown）| inline
    request_changes_on_p0_p1: true     # 存在 P0/P1 时调 set_review_status
    auto_reconcile_resolved: true      # A2 决定：重评审时自动关已修复 task
    auto_reopen_regressed: true        # A2 决定：重评审时自动重开 false-done task
    comment_marker_prefix: "forge-review"  # 用于幂等识别
    rate_limit_interval_ms: 100        # 批量 post 间隔（§6 缓解）
```

### 5.3 CLI 接入

```bash
/forge ship                       # 默认行为不变，按 config.md 决定是否 post
/forge ship --post-comments       # 强制启用 post（覆盖 config）
/forge ship --no-post-comments    # 强制禁用 post（覆盖 config）
/forge review --post-comments     # review 完成后立即 post（绕过 ship）
```

优先级（A4）：CLI flag > `.tinkerman/config.md` > 内置默认（关闭）

### 5.4 测试要求

按 §2.1 TDD 铁律，每个纯函数模块先写测试：

- `finding-hash.test.ts`：hash 稳定性（相同 finding → 相同 hash）、跨版本稳定性
- `reconcile.test.ts`：三种状态（缺失/新增/重复）的边界
- `format.test.ts`：comment_marker_prefix 注入、task 文本截断、suggestion 块格式

集成测试用 mocked `bitbucket` MCP 工具调用，验证 `post.ts` 的 orchestration 正确性。

## 6. Risks & Open Questions

| 风险 | 缓解 |
|---|---|
| Bitbucket MCP 工具响应延迟拖慢 ship | 设计成 review 完成后异步 post，不阻塞 ship gate |
| 幂等 hash 误判（finding message 微调导致 hash 变化） | hash 仅基于稳定字段（file/line/type），不含 message 主体 |
| 大量 P2 评论造成噪音 | 配置 `p2_strategy: none` 关闭 P2 inline comment |
| Bitbucket 实例 API rate limit | 批量 post 时加 100ms 间隔；幂等机制本身减少重复调用 |
| review subagent 输出格式变化 | finding 格式应统一为结构化 schema（spec 阶段定义） |
| **GitHub/GitLab/Gitea 项目误用此 SKILL** | A5 平台前置门禁静默跳过 + `.tinkerman/findings/comment-channel-skipped-*.md` 留痕 |
| **MCP 配置指向错实例（staging vs prod）** | A5 MCP 同源校验：remote URL host 必须匹配 `BITBUCKET_BASE_URL` |
| **企业内网域名不含 bitbucket 关键字** | A5 `platform_override: bitbucket` 显式强制 |
| **远端 URL 探测脚本失败（无 git / 无 remote）** | 视为 `platform-not-bitbucket`，静默跳过；记录到 tool-health.md |

**待用户回答的开放问题**：（已全部回答，参见 §3.3）

✅ Q1 → A1: 按 "No incomplete tasks" merge check 未启用假设设计
✅ Q2 → A2: 双方都能关，含 auto-reopen-regressed 兜底
✅ Q3 → A3: 暂仅支持 Bitbucket，SKILL 命名锁定
✅ Q4 → A4: per-project 默认关闭，CLI flag 覆盖
✅ Q5 → A5: 平台前置门禁（远端 URL + override + MCP 同源），失败静默跳过

## 7. 下一步

按 Forge 宪法 §1 Three-Tier Routing 判断：

- 影响多个文件（新 SKILL + ship CLI + config schema 扩展）
- 设计参数已定（4 个开放问题已回答）
- 不涉及新服务/新数据库/认证变更

→ **建议路径：Full tier**（`/forge decide` → `/forge spec` → `/forge plan` → `/forge build` → `/forge review` → `/forge test` → `/forge ship` → `/forge learn`）

具体步骤：
1. ~~用户回答 Q1-Q4~~ ✅ 已完成（2026-05-23）
2. 运行 `/forge decide review-comment-bitbucket` 将本文档转为正式 ADR-0006（由 `nextAdrId` 分配）
3. decide 阶段 round 1 让 product/architect/security subagent 并行评审本草案
4. round 2 由 critic subagent 交叉审视
5. 运行 `/forge spec review-comment-bitbucket` 细化 SKILL 的需求场景
6. spec lock 后进入 plan/build 流程，按 §2.1 TDD 铁律 RED → GREEN → REFACTOR

## References

- Claude Code 2.1.147 changelog: `/code-review` rename + `--comment` flag
- [`/code-review` 源码](https://github.com/anthropics/claude-code/blob/main/plugins/code-review/commands/code-review.md)
- [Bitbucket Data Center 8.9 - Default tasks](https://ja.confluence.atlassian.com/display/BITBUCKETSERVER089/Default+tasks)
- ADR-0005: Review Fallback Ladder
- `.tinkerman/decisions/2026-05-16-claude-code-uplift-2.1.143.md`
- AGENTS.md §3 Review Discipline

> 本文档内容基于网络资源整理，部分文本已重述以符合许可要求。
