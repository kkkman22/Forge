---
name: regenerative-checkpoint
status: completed
feature: regenerative-checkpoint
layout: requirements
created: "2026-06-16"
updated: "2026-06-16"
priority: P1
tier: standard
source: MiMo-Code（小米 MiMo 团队，基于 OpenCode，MIT）持久化记忆体系调研
---

# 再生式 Checkpoint — 需求文档

## 背景

### 痛点：长会话"越用越偏"且多次修复收效甚微

Forge 反复遭遇长会话上下文爆炸 / compact 后状态丢失，已交付多个相关 spec：

- `context-explosion-defense`（completed, 17/17）：Read 去重、阶段隔离、预算监控、subagent 文件化返回。
- `context-optimization`（completed）：forge_exec/git/read MCP server，协议层事前拦截大输出。
- `subagent-truncation-fix` / `subagent-result-truncation`（completed）：subagent 结果裁剪。
- `.tinkerman/.compact-snapshot.md`（PreCompact/PostCompact hook）：compact 前 grep 拼 progress/findings，compact 后吐回。

**这些修复都聚焦在"工具输出的瘦身"（事前拦截 + 事后裁剪）——这是 Forge 已有的 InformationLifecycle 四级分类的优势区。但它们不碰会话状态保全。** 结果是：工具输出确实瘦了，但 compact 发生时，会话状态（用户意图、精确值、决策理由、当前进度）仍是一次性 LLM 总结，且由主 agent 自己写，分心。

### 根因：总结式 vs 再生式

| 维度 | 总结式（Forge 现状 / CC 默认 compact） | 再生式（MiMo-Code） |
|------|--------------------------------------|-------------------|
| 触发时机 | 接近溢出被动触发 | 多点分级（压力 0-3）主动触发 |
| 做什么 | 一次性总结整个历史 | 增量更新 checkpoint；翻页时从 checkpoint 重建 |
| 谁来做 | 主 agent 自己总结（分心） | 独立 checkpoint-writer subagent（主 agent 不分心） |
| 精确值 | 每次总结 paraphrase 一层（衰减） | EXACT-FORM 规则逐字节保留 |
| 历史 | 压成一段 summary，细节永久丢失 | 保留尾部真实消息 + checkpoint 全量状态 |

**只要还是"一次性总结整个历史"，信息衰减是数学必然——每次总结丢一层，长会话必然偏。这是范式问题，调参解决不了。** 这是 Forge 多次修复"收效甚微"的根因。

### MiMo-Code 的解法（调研结论）

MiMo-Code（小米 MiMo 团队，基于 OpenCode fork，MIT 开源）通过一套"再生式 checkpoint"体系实现官方博客所述的"无限上下文"：

1. **checkpoint-writer 独立 subagent**：主 agent 干活，writer 在后台并行写 `checkpoint.md`（11 个固定 section + 每 section token 预算）。
2. **EXACT-FORM CONSTRAINT LITERAL**：用户给的精确值（DSN/端口/命令行/版本号/ID）逐字节复制，禁止 paraphrase。直接对抗漂移。
3. **renderRebuildContext 预算化重建**：compact 时不是总结历史，而是丢弃旧历史、保留尾部真实消息 + 注入 checkpoint/memory/tasks 简报 + seam framing（"直接继续别复述"）。
4. **/dream 周期收敛**：每 7 天 spawn 独立 agent，对账 raw trajectory，去重 / 压缩 / 验证 / prune 知识库（≤200 行 / 10KB 硬上限）。

### 关键可行性澄清（调研验证，推翻初始疑虑）

本 spec 立项前经过三轮严格验证，确认**不影响 Claude Code 市场分发**：

1. **CC 完整轨迹可读**：CC 将每个会话的完整消息流存成 `~/.claude/projects/<slug>/<session_id>.jsonl`（逐行 `type:user/assistant` + `content[].tool_use/tool_result`），等价于 MiMo 的 SQLite `message/part` 表。PreCompact/PostCompact hook 的 stdin payload 直接带 `transcript_path` + `session_id`。**dream 的 raw-trajectory 对账可完整复刻，读 JSONL 即可，不需要自带 DB。**
2. **cron 可用**：`ScheduleWakeup` + `CronCreate` 是 CC 原生调度工具，已在 `src/loop/scheduling-strategy.ts` 落地。opt-in 安装（`--install`），与 `loop-engineering-adoption` R2 的 triage `--install` 共建同一套调度框架。硬限制：需 CC 进程活着（机器关机漏触发），文档明确约束，不承诺关机运行。
3. **不引入 FTS5/SQLite**：跨会话检索用 JSONL + Grep，不自带索引层。MEMORY.md/checkpoint.md 本就是 Markdown ground truth，索引只是可重建缓存，自建 DB 是过度工程。

### 与现有 spec 的关系（互补，非重叠）

- **`context-explosion-defense` / `context-optimization`**：管"工具输出瘦身"（事前拦截 + 事后裁剪 + Read 去重）。**本 spec 管"会话状态保全"**。两者正交：前者管信息怎么瘦着进上下文，后者管状态怎么不丢着跨 compact。Forge 的独特优势是两者都有。
- **`forge-learn-reframing-integration`**（completed）：learn 读 Gate 日志提炼问题模式。本 spec R4 给 learn 加**收敛纪律层**（去重/密度上限/prune/对账），叠加而非替换。
- **`loop-engineering-adoption` R2**（triage `--install` 停在 feature 分支）：本 spec R5 的 cron 框架与之同构，共建统一 `--install/--uninstall/--status` 安装器，顺势合并 R2 的调度部分。

## 目标

1. 让 Forge 的长会话从"总结式衰减"转为"再生式保全"：compact 后关键状态（用户意图、精确值、决策、进度）不丢、不漂。
2. 让 checkpoint 写入**外包给独立 subagent**，主 agent 永远不分心于记录。
3. 让 `/forge learn` 具备**周期性收敛纪律**（去重 / 密度上限 / prune / 对账），而非只增不减。
4. 让 learn / triage 的**周期触发统一走 CC 原生 `CronCreate`**，opt-in，零分发摩擦。

**非目标**（明确排除，防止 scope creep）：
- 不引入 FTS5 / SQLite 索引层（JSONL + Grep 足够）。
- 不做 OS 级 daemon / 关机也跑的 cloud scheduling（CC 进程活着的本地调度即可）。
- 不做 Task DB-backed 状态机（Forge 现有 `.tinkerman/progress/*.md` + TaskCompleted hook 够用）。
- 不改变 review 三层架构 / TDD 铁律 / three-strike 等现有流程纪律。
- 不替换 `context-explosion-defense` 的工具输出裁剪（那是 Forge 的优势区，保留）。

## 术语

- **再生式 checkpoint（Regenerative Checkpoint）**：compact 时从结构化 checkpoint 文件重建上下文（注入状态简报 + 保留尾部真实消息），而非一次性 LLM 总结整个历史。本 spec 的核心范式。
- **总结式（Summarization）**：Forge 现状 / CC 默认 compact——接近溢出时一次性总结历史，每次总结丢一层信息。
- **checkpoint-writer**：专职维护 checkpoint.md 的独立 subagent。主 agent 干活，writer 后台并行写。借鉴 MiMo-Code 的同名 subagent。
- **EXACT-FORM CONSTRAINT LITERAL**：用户给的精确值（连接串 / 端口 / 命令行 / 版本号 / ID / seed）必须逐字节复制进 checkpoint，禁止 paraphrase。漂移的主要来源之一就是精确值被总结成模糊描述。
- **seam framing**：重建上下文后注入的衔接提示——明确告诉模型"下面是真实历史不是伪内容，直接继续任务，不要复述"。防止重建后模型重新开场。
- **budgeted injection**：按 token 预算 section-aware 注入记忆文件。预算用完时保留 header + index 行（骨架），截断 body。
- **dream（收敛）**：周期性 spawn 独立 agent，对账 raw trajectory（CC 的 JSONL），对知识库执行去重 / 合并 / 压缩 / 验证 / prune。借鉴 MiMo-Code `/dream`。
- **CC transcript JSONL**：`~/.claude/projects/<slug>/<session_id>.jsonl`，CC 原生的会话轨迹文件，逐行一条消息（`type:user/assistant` + `content[].tool_use/tool_result`）。本 spec dream 对账的数据源。
- **CLAUDE_CODE_AUTO_COMPACT_WINDOW + CLAUDE_AUTOCOMPACT_PCT_OVERRIDE**：CC 控制 auto-compact 触发点的两个环境变量。WINDOW 定义 compaction 计算用的 context 容量（默认=模型 window），PCT 是百分比。**两者必须配合使用**——单独 PCT 对默认本地会话无效（官方 env-vars 文档原文）。GLM-5.2 1M 场景推荐 WINDOW=1000000 + PCT=60（600K compact，省额优先，见 design D9）。
- **turn 边界 compact**：CC auto-compact 在 turn（轮次）边界发生，不打断 mid-turn 工具调用（compact 本质是替换历史，无法 mid-turn 插入）。checkpoint-writer 的角色是**预持久化**——提前在 B 边界把状态写好，compact 时再生，而非 compact 那一刻临时记录（见 design D10）。

## 需求

### R1: 固定 section 模板 + EXACT-FORM 的 checkpoint.md

**User Story:** 作为在长会话中工作的开发者，我希望 compact 后关键状态（用户意图、精确值、决策、进度）不丢失、不漂移，而不是被总结成模糊描述。

现状：`.tinkerman/.compact-snapshot.md` 由 `hook-precompact.sh` 用 grep + head 拼凑自由文本，精确值（端口 / 命令行 / 版本号）会在拼凑中丢失或被截断。

#### 验收标准

1. THE 系统 SHALL 提供 `.tinkerman/checkpoint.md` 作为会话状态的结构化载体，采用固定 section 模板（适配 Forge 的 plan/build/review/test/ship 阶段语义，非照搬 MiMo 的任务树模型）。
2. 每个 section SHALL 有明确的 italic 指令行（说明该 section 写什么）+ token 预算（防止膨胀）。
3. THE 系统 SHALL 在 checkpoint 维护规则中强制 EXACT-FORM CONSTRAINT LITERAL：用户给的精确值（DSN / 端口 / 命令行 + flags / 版本 pin / ID / seed）必须逐字节复制，禁止 paraphrase。规则覆盖：连接串、host:port、env var 值、API token、文件路径、完整命令行、版本号、ID、seed。
4. THE checkpoint 模板 SHALL 包含至少：当前阶段与意图（verbatim 用户原话 block-quote）、下一步具体动作、本会话指令（session-specific，非项目级）、当前工作（文件路径 + 代码位置）、已发现问题与修复、活跃资源（branch / 进程）、设计决策与讨论结果。
5. THE 系统 SHALL 提供 `.tinkerman/templates/checkpoint.md` 模板文件，缺失时自动 bootstrap。

### R2: checkpoint-writer 独立 subagent（记录外包）

**User Story:** 作为主 agent，我希望专注干活，把 checkpoint 记录完全外包给独立 subagent，不要让我分心。

现状：主 agent 自己写 `.tinkerman/progress/` 和 `status.md`，分散注意力，且写出来的格式不一致。

#### 验收标准

1. THE 系统 SHALL 提供 checkpoint-writer subagent（通过 Task tool spawn），专职维护 `.tinkerman/checkpoint.md`。
2. THE checkpoint-writer SHALL 在主 agent 完成一个阶段（如 plan→build / build→review 边界）时被触发，读当前进度 + 最近轨迹，增量更新 checkpoint.md（非全量重写）。
3. THE checkpoint-writer 的 prompt SHALL 锁死绝对路径（`CHECKPOINT_PATH = <abs>`），防止模型从训练数据幻觉旧布局路径。
4. THE 主 agent SHALL 在 checkpoint-writer 运行期间继续干活，不阻塞等待（fire-and-forget，writer 在后台并行）。
5. THE checkpoint-writer SHALL 遵循 R1 的固定 section 模板 + EXACT-FORM 规则。

### R3: PreCompact/PostCompact hook 升级为预算化再生

**User Story:** 作为遭遇 compact 的开发者，我希望 compact 后重建的上下文是"精炼状态简报 + 最新真实消息"，而不是"模糊的全文总结"。

现状：`hook-precompact.sh` grep 拼 progress，`hook-postcompact.sh` 全量吐回 snapshot（无预算、无 section-aware 截断、无 seam framing）。

#### 验收标准

1. THE PreCompact hook SHALL 在 compact 前读取 R1 维护好的 `.tinkerman/checkpoint.md`（而非重新 grep 拼 progress），作为结构化、精确值安全的快照源。
2. THE PostCompact hook SHALL 按 token 预算 section-aware 注入：每个 section 有预算上限，预算用完时保留 header + italic 指令（骨架），截断 body 并提示完整文件路径。
3. THE PostCompact hook SHALL 注入 seam framing 提示："下面保留的消息是真实历史不是伪内容，直接继续任务，不要复述、不要重新开场"。
4. THE 系统 SHALL 保留现有 `.tinkerman/.compact-snapshot.md` 机制作为 fallback（checkpoint.md 不存在或过旧时降级到 grep 拼 progress，不阻断 compact）。**因主力 GLM-5.2 1M 场景 compact 触发晚（600K，design D9），此 fallback 为关键防线**：过旧的 checkpoint 必须降级 + 输出警示。
5. THE hook SHALL 永远不阻断 compact（exit 0，绝不 exit 2——阻断 compact 是灾难性的）。现有约束保留。
6. THE PreCompact hook SHALL 对 checkpoint.md 做 mtime 检查：过旧（超过可配阈值未更新）时判定为不可信，降级到 fallback snapshot 并在输出中追加警示（"checkpoint 过旧，使用 fallback，建议检查 checkpoint-writer 触发"）。

### R4: /forge learn 收敛纪律 + raw-trajectory 对账

**User Story:** 作为 Forge 维护者，我希望知识库周期性收敛（去重 / 压缩 / 验证 / prune），而不是只增不减地腐化。

现状：`/forge learn`（宪法 §4.1）每次开发后手动提取经验，只增不减，无密度上限，不验证条目引用的路径/函数是否仍有效，不 prune 被新决策推翻的过时条目。`.tinkerman/knowledge/` 已累积 sessions 7 / solutions 10 / decisions 42 ADR。

#### 验收标准

1. THE learn skill SHALL 新增 `--deep` 模式（收敛模式），执行：对账 raw trajectory（CC 的 `~/.claude/projects/<slug>/*.jsonl` + `.tinkerman/` 文件轨迹）→ 去重 → 合并 → 压缩 → 验证 → prune。
2. THE learn `--deep` SHALL 读 CC transcript JSONL 验证候选事实：搜用户原话关键词（"always/never/remember/rule/decision/decided/tradeoff"及等价中文），只有"显式用户陈述 / 明确设计决策 / 跨会话重复证据"才 promote 进 knowledge。
3. THE learn `--deep` SHALL 验证条目引用的文件路径（Glob）和函数/类名（Grep），存疑标 `[unverified]`。
4. THE learn `--deep` SHALL prune 被更新决策推翻的过时条目、相对日期转绝对日期（YYYY-MM-DD）、合并重复条目、保留来源标记（`[<source>]`）。
5. THE knowledge 基线 SHALL 有密度上限：单个 knowledge 文件 ≤200 行 / 10KB（宁少勿滥），可配置。宪法 §4.2 现有 20 文档上限保留。
6. THE learn `--deep` SHALL 输出收敛报告：新增 / 更新 / 删除 / 跳过 / 健康度（行数/200 + 字节/10KB）。

### R5: 统一 cron 调度框架（learn / triage 共建）

**User Story:** 作为开发者，我希望周期性任务（learn --deep / triage）能 opt-in 自动触发，而不用每次手动跑。

现状：`ScheduleWakeup` + `CronCreate` 已在 `src/loop/scheduling-strategy.ts` 落地，但 `/forge triage --install` 的 cron 安装部分停在 `feature/loop-engineering-adoption` 分支未合并。

#### 验收标准

1. THE 系统 SHALL 提供统一的 opt-in 调度安装器：`/forge learn --install [--uninstall] [--status]` 和 `/forge triage --install [--uninstall] [--status]` 共用同一套 `--install/--uninstall/--status` 框架。
2. THE 安装器 SHALL 用 CC 原生 `CronCreate`（>5min 必然走它，cache-cold 可接受）安装定时触发，cron 表达式放 `.tinkerman/config.md`（`learn.cron` 默认 `"0 9 * * 1"` 示例 / `triage.cron` 默认 `"0 9 * * *"` 示例），用户可自定义。
3. THE 系统 SHALL 明确文档约束：本地 cron 需 CC 进程活着，机器关机漏触发，不承诺关机运行（对齐 loop-engineering-adoption AC8）。
4. THE `learn.enabled: false` / `triage.enabled: false`（config 默认）SHALL 只挡 `--install`，不挡手动 `/forge learn --deep` / `/forge triage`。
5. THE 系统 SHALL 提供 `.tinkerman/state/last-learn-at`（learn）/ `triage-state.json`（triage）记录上次触发时间，触发时检查间隔，防抖（`MIN_SPAWN_GAP`，对齐 MiMo `auto-dream.ts`）。

## 验收标准（整 spec）

- [ ] R1：`.tinkerman/templates/checkpoint.md` 模板存在，含 italic 指令 + token 预算 + EXACT-FORM 规则。
- [ ] R2：checkpoint-writer subagent 可被 Task tool spawn，主 agent 不阻塞。
- [ ] R3：PreCompact hook 读 checkpoint.md；PostCompact hook 预算化注入 + seam framing。
- [ ] R4：`/forge learn --deep` 能读 CC JSONL 对账，输出去重/压缩/prune 报告。
- [ ] R5：`/forge learn --install` 和 `/forge triage --install` 走统一 CronCreate 框架。
- [ ] 端到端：一个跨越 compact 的长会话，compact 后主 agent 能准确复述用户给过的精确值（端口/命令/版本号），不漂移。
- [ ] 零分发摩擦：不引入新运行时依赖（无 SQLite/FTS5/daemon），plugin 形态分发不受影响。

## 依赖

- CC 原生 `ScheduleWakeup` / `CronCreate` 调度工具（已验证可用）。
- CC transcript JSONL（`~/.claude/projects/<slug>/<session_id>.jsonl`，已验证存在）。
- CC PreCompact/PostCompact hook（`hooks/hooks.json` 已注册，v2.1.139+）。
- `loop-engineering-adoption` R2（triage `--install`，feature 分支待合并——R5 与之共建调度框架）。
- 现有 `scheduling-strategy.ts`（main 分支，`selectScheduler` / `toCronInterval`）。
- 现有 `hook-precompact.sh` / `hook-postcompact.sh`（R3 升级其内容，保留 fallback）。
- CC 环境变量 `CLAUDE_CODE_AUTO_COMPACT_WINDOW` + `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`（控制 compact 触发点）。**init 自动写入** settings.json 的 env 块（WINDOW=1000000 + PCT=60，与现有 3 个 env 同等，idempotent 不覆盖用户改值），主力 GLM 用户 forge init 即得。

## 非目标

- 不引入 FTS5 / SQLite 索引层（JSONL + Grep 足够；MEMORY.md 本就是 Markdown ground truth）。
- 不做 OS 级 daemon / 关机也跑 / cloud scheduling（CC 进程活着的本地调度即可）。
- 不做 Task DB-backed 状态机（不可复活 / 幂等 handoff 的价值对 Forge 任务粒度是过度工程；现有 progress 文件够用）。
- 不替换 `context-explosion-defense` 的工具输出裁剪（那是 Forge 优势区，保留）。
- 不做跨品牌 / 跨端点模型路由（分发摩擦致命，对齐 loop-engineering-adoption D8）。
- 不改变 review 三层架构 / TDD 铁律 / three-strike 等流程纪律。
