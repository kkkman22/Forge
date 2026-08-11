# 再生式 Checkpoint — 设计文档

## 概述

本设计把 Forge 的长会话上下文管理从"总结式"转为"再生式"：compact 时从结构化 checkpoint 文件重建上下文（注入状态简报 + 保留尾部真实消息），而非一次性 LLM 总结整个历史。五个需求（R1 模板 / R2 writer / R3 hook 升级 / R4 learn 收敛 / R5 cron 框架）构成"结构化载体 → 自动维护 → 压缩时再生 → 周期收敛 → 自动触发"的闭环。

设计原则：**复用 Forge 现有基建（PreCompact/PostCompact hook、scheduling-strategy.ts、learn skill），不引入新运行时依赖（无 SQLite/FTS5/daemon）；读 CC 原生 JSONL 轨迹而非自建 DB；零配置分发，对官方 Anthropic API 用户开箱即用。** 借鉴 MiMo-Code 的机制设计（11-section 模板、EXACT-FORM、checkpoint-writer subagent、dream 对账），但落地形态完全是 Forge plugin 原生（hooks + skills + Task tool + CronCreate）。

## 设计决策

### D1: checkpoint.md 用 Forge 阶段语义，非照搬 MiMo 任务树模型

- **问题描述**：MiMo 的 checkpoint.md 是 11 个 section（§1 Active intent / §2 Next action / §4 Task tree / ...），围绕其 task DB 状态机设计。Forge 的阶段语义是 plan/build/review/test/ship，没有 task DB。模板怎么定？
- **候选方案**：
  - A. 照搬 MiMo 11 section。
  - B. 适配 Forge 阶段语义重新设计 section。
- **选择理由**：选 B。MiMo 的 §4 Task tree 依赖其 task DB（唯一真相源），照搬会出现"引用不存在的 DB"的空 section。Forge 的 checkpoint 要服务自己的阶段流转，section 应反映"当前在哪个阶段、下一步去哪、这个阶段的活跃文件/决策"。保留 MiMo 的精髓——§1 用户意图 verbatim、EXACT-FORM 精确值、§设计决策、§活跃资源——但结构对齐 Forge。token 预算逐 section 分配（对齐 MiMo 的 budget 设计，总 ~11K）。
- **风险和缓解**：section 设计可能不覆盖所有场景。缓解：§Open notes 作为 catch-all（对齐 MiMo §11），宁可空着不要硬填。

### D2: EXACT-FORM 规则用 prompt 强制，不引入解析器

- **问题描述**：怎么保证 checkpoint-writer 把精确值逐字节保留，而不是 paraphrase？
- **候选方案**：
  - A. 引入值提取解析器（正则/AST 从对话里抽 port/DSN/command）。
  - B. 纯 prompt 规则强制（writer 的 system-reminder 里写死 EXACT-FORM CONSTRAINT LITERAL）。
- **选择理由**：选 B。解析器复杂、易漏（无法枚举所有"精确值"形态），且 Forge 不该维护一个值提取框架。MiMo 的做法就是纯 prompt——在 checkpoint-writer.txt 里明确写"精确值必须逐字节复制，拿不准当 exact-form 处理"，并给大量例子（`MC_DB_DSN=postgres://...`、`--seed 2718281`）。LLM 对这类强约束的遵从率足够高，且失败了下次 writer 增量更新时能补回。解析器的边际收益覆盖不了维护成本。
- **风险和缓解**：LLM 偶尔 paraphrase。缓解：writer 是增量更新（每次触发读 prior checkpoint + 最近轨迹再写），漂移的值有机会在后续触发被纠正；且 R3 的 PostCompact seam framing 让主 agent 在重建后直接继续，减少二次询问导致重新 paraphrase 的机会。

### D3: checkpoint-writer 用 Task tool spawn，非自建 actor 系统

- **问题描述**：MiMo 用自建的 `actor.spawn({ mode: "subagent", agentType: "checkpoint-writer" })`。Forge 没有自建 actor 系统，怎么 spawn writer？
- **候选方案**：
  - A. 自建轻量 actor/spawn 机制。
  - B. 用 CC 原生 Task tool（subagent）spawn writer。
- **选择理由**：选 B。Forge 已有成熟的 Task/subagent 用法（review 的 spec-check/quality-check/security-check 就是这么跑的），模式成熟、零新基建。Task tool 的 subagent 天然 fire-and-forget（主 agent 可继续干活），符合"记录外包"的核心诉求。自建 actor 系统违反"不引入新运行时依赖"原则，且 MiMo 的 actor 系统是为了它自己的 child-session / prefix-cache 共享等深度集成，Forge 不需要这些。
- **风险和缓解**：Task tool subagent 不共享主 agent 的完整上下文（MiMo 的 child-session 共享 sessionID）。缓解：writer 通过 Read `.tinkerman/progress/` + `.tinkerman/status.md` + 最近 CC transcript JSONL 获取状态，不依赖内存上下文——这反而更稳定（不随主 agent 的上下文波动）。

### D4: checkpoint-writer 触发时机用阶段边界，非 token 压力等级

- **问题描述**：MiMo 用 `pressureLevel`（0-3，50%/70%/85%）多点触发 writer。Forge 作为 plugin 拿不到 CC 内部的 token 占用信号（CC 不暴露给 plugin）。怎么定触发时机？
- **候选方案**：
  - A. 估算 token（用 Forge 的 `token-estimate.ts`）算压力等级，模拟 MiMo 的多点触发。
  - B. 用阶段边界（plan→build / build→review / 每个 task 完成）作为触发点。
- **选择理由**：选 B。Forge 测不准真实 context 占用（`token-estimate.ts` 估的是文件大小，不是运行时窗口占用——`loop-engineering-adoption` requirements 已论证这点，并据此否决了 token 硬上限）。强行估算压力等级会复现"测不准"的老问题。而阶段边界是 Forge 已有的、确定性的流转点（TaskCompleted hook 已存在），在边界 spawn writer 天然合理——"这个阶段干完了，把状态记下来"。这也对齐 Forge 宪法 §6 Session Boundaries（"阶段间上下文交接通过 `.tinkerman/` 文件系统进行"）。
- **风险和缓解**：单一长阶段内可能很久不触发 writer，到 compact 时 checkpoint 过时。缓解：PostCompact hook 读 checkpoint.md 时加 mtime 检查，若过旧则降级到现有 grep 拼 progress 的 fallback（不阻断）；R3 的 fallback 机制保留。

### D5: PreCompact/PostCompact 升级保留现有机制作为 fallback

- **问题描述**：R3 要让 PreCompact 读 checkpoint.md。但 checkpoint.md 可能不存在（新项目 / writer 没跑过 / 用户禁用了 R2）。怎么处理？
- **候选方案**：
  - A. checkpoint.md 不存在时阻断并提示用户先跑 writer。
  - B. 降级到现有 `.compact-snapshot.md` 的 grep 拼 progress 机制。
- **选择理由**：选 B。阻断 compact 是灾难性的（现有 `hook-precompact.sh` 注释明确"NEVER exits with code 2"）。现有 grep 拼 progress 机制虽粗糙但是可用的兜底。再生式是升级，不是替换——checkpoint.md 存在时用它（结构化、精确值安全），不存在时降级（粗糙但能用）。这让 R3 可以独立于 R1/R2 交付，降低耦合。
- **风险和缓解**：降级路径与再生路径行为不一致。缓解：文档明确两条路径的差异；鼓励用户启用 R2 的 writer 让 checkpoint.md 持续更新。

### D6: learn --deep 对账读 CC JSONL，非自建轨迹存储

- **问题描述**：dream 的核心是"对账 raw trajectory"。MiMo 查自己的 SQLite（session/message/part 表）。Forge 作为 plugin 没有自带 DB，怎么对账？
- **候选方案**：
  - A. Forge 自建一个轻量轨迹记录（hook 里把每条消息追加到 `.tinkerman/runs/trajectory.jsonl`）。
  - B. 直接读 CC 原生的 transcript JSONL（`~/.claude/projects/<slug>/<session_id>.jsonl`）。
- **选择理由**：选 B。调研已验证 CC 把完整会话轨迹存成 JSONL（逐行 `type:user/assistant` + `content[].tool_use/tool_result`），hook stdin 直接给 `transcript_path`。自建轨迹存储是重复造轮子（CC 已经存了）、增加维护成本、且每条消息多一次 IO。读 CC 的 JSONL 等价于 MiMo 查 SQLite，只是查询方式从 SQL 变成逐行 JSON.parse + Grep。dream 只扫"最近 7 天"，按文件 mtime 过滤即可，量不大。
- **风险和缓解**：CC 的 JSONL 格式非公开稳定 API，未来版本可能变。缓解：JSONL 的 `type`/`message.role`/`content[].type` 是 CC 的核心存储格式，大改会破坏 `/resume`，稳定性高；解析时对未知字段容错（只取已知字段）；加格式探测，解析失败时降级为"只对账 `.tinkerman/` 文件轨迹"（对齐上一轮讨论的退化版）。

### D7: 统一 cron 框架复用 scheduling-strategy.ts，与 triage --install 共建

- **问题描述**：R5 要让 learn / triage 都能 `--install` cron。triage 的 `--install` 已在 feature 分支实现但没合并。怎么避免重复造调度？
- **候选方案**：
  - A. 各自实现 `--install` 逻辑。
  - B. 抽统一调度安装器，learn / triage 共用。
- **选择理由**：选 B。`scheduling-strategy.ts`（main 分支）已有 `selectScheduler` / `toCronInterval`，triage `--install` 已验证过 `CronCreate` 路径。learn 只是另一个被调度的 skill（对齐 loop-engineering-adoption D5："triage 只是另一个被调度的 skill，调度机制相同"）。共建统一安装器避免重复，且顺势把 triage `--install` 合并进 main。安装器签名：`installCronSkill(skillName, cronExpr, prompt) → CronCreate`。
- **风险和缓解**：learn --deep 和 triage 可能同时被 cron 触发，并发。缓解：两者都是只读 + 写各自文件（learn 写 knowledge / triage 写 inbox），不抢 worktree、不改源码，并发安全；加 `MIN_SPAWN_GAP`（对齐 MiMo `auto-dream.ts`，10s 防抖）。

### D8: 不引入 FTS5/SQLite，跨会话检索用 JSONL + Grep

- **问题描述**：MiMo 用 SQLite FTS5 做跨会话检索。Forge 要不要也做索引层？
- **候选方案**：
  - A. 引入 SQLite + FTS5（甚至兼容 CC 的 `.claude/projects` 目录索引）。
  - B. 不做索引层，跨会话检索用 Grep + 良好命名约定。
- **选择理由**：选 B。调研结论：FTS5 建立在"MiMo 自带 DB 持有全部轨迹"前提上，它只是可重建的缓存，MEMORY.md/checkpoint.md 本就是 Markdown ground truth。Forge 自带 SQLite 会增加分发体积、维护成本、且 CC 的轨迹在 JSONL（不在 Forge 能索引的 DB 里）。dream 对账直接读 JSONL + Grep 即可（R4）。若未来检索成为瓶颈，再考虑——但现在不是。这是 YAGNI。
- **风险和缓解**：会话多时 Grep 慢。缓解：dream 只扫最近 7 天（按 mtime 过滤），且 JSONL不大（一个 session 通常 <1MB）；真正需要全文检索时用户可用 CC 原生的 Grep 工具。

### D9: GLM-5.2 1M 上下文场景的 compact 配置（CLAUDE_CODE_AUTO_COMPACT_WINDOW=1000000 + PCT=60）

- **问题描述**：Forge 主力用户用 GLM coding plan（GLM-5.2，1M 上下文，经 `ANTHROPIC_BASE_URL` 接入 CC）。1M 窗口下 compact 时机怎么配？
- **平台约束（官方 env-vars 文档原文）**：
  - `CLAUDE_CODE_AUTO_COMPACT_WINDOW`：auto-compaction 计算用的 context 容量（token）。**默认 = 模型 context window**。CC 若正确识别 GLM 的 1M，默认 window 就是 1M。
  - `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`：在 window 的百分比触发 compact。**关键限定**：单独设此变量，对"默认本地会话"**无效**——只在 CC "proactively compact" 时生效（设了 WINDOW / cloud / Remote Control / Sonnet 4.6 & Opus 4.6 非扩展）。**必须配合 WINDOW 一起设才有效。**
  - 既有错误认知（需修正）：`scripts/track-read-budget.mjs` 注释"Superseded by CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=60"不准确——单独 PCT 对本地会话无效，应改为"配合 CLAUDE_CODE_AUTO_COMPACT_WINDOW 使用"。
- **候选方案**：
  - A. window=200000 + pct=80（160K compact）——平衡，checkpoint 命中率高，但重建频繁。
  - B. window=1000000 + pct=60（600K compact）——充分利用 1M 省额度，但漂移风险大。
  - C. window=500000 + pct=60（300K compact）——激进，checkpoint 几乎总新鲜，但 token 消耗高。
- **选择理由**：**选 B**（已与产品决策确认）。Forge 主力用户的 GLM coding plan 有周限/5h 额度约束，是真金白银的代价。选 B 充分利用 1M 窗口（不浪费额度），在 600K 时 compact——这是"省额优先"的取向。
- **风险和缓解**：600K 才 compact 意味着两个 B 边界之间会攒下大量历史，checkpoint 过时风险高，且 compact 时一次性总结 600K 历史，漂移最严重。**缓解——D5（mtime 检查 + grep fallback）从"兜底"升级为"关键防线"**：
  - checkpoint-writer 必须在每个 B 边界（wave 间 + 跨阶段）可靠触发，让 600K 区间内的 checkpoint 尽可能新；
  - PostCompact hook 必须实现 mtime 检查——checkpoint 过旧（如超过 N 个 turn 未更新）时，降级到现有 grep 拼 progress 兜底，并输出警示（"checkpoint.md 过旧（<mtime>），使用 fallback snapshot，建议检查 checkpoint-writer 是否正常触发"）；
  - 长远缓解：文档明确 600K 配置的漂移风险，让重度用户知情可选 A/C。
- **配置安装（init 自动写入）**：这两个变量是 CC 的 env 变量，须放进 `.claude/settings.json` 的 `env` 块（放错位置不生效——官方文档 + 社区确认）。**与现有 3 个 env（`ENABLE_PROMPT_CACHING_1H` 等）同等处理**：`forge init` 自动写入（零配置分发哲学），复用 init.sh L746-775 的 idempotent node 合并逻辑（按 key 存在判断，已存在的值不覆盖——尊重用户手改）。追加到 `envVars` 对象：
  ```js
  const envVars = {
    'ENABLE_PROMPT_CACHING_1H': 'true',
    'MCP_CONNECTION_NONBLOCKING': 'true',
    'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB': 'true',
    'CLAUDE_CODE_AUTO_COMPACT_WINDOW': '1000000',
    'CLAUDE_AUTOCOMPACT_PCT_OVERRIDE': '60'
  };
  ```
  这是 CC 平台调优而非 Forge 功能依赖，但 Forge 主力场景（GLM coding plan）下它直接决定 checkpoint 再生质量，故 init 自动写入。已设过不同值的用户不受影响（idempotent skip）。

### D10: compact 在 turn 边界发生，checkpoint-writer 的角色是"预持久化"而非"临时记录"

- **问题描述**：auto-compact 发生时是中断 mid-turn 工具调用，还是在 turn 边界？checkpoint-writer 此刻起什么作用？
- **平台行为（官方 DISABLE_AUTO_COMPACT 语义印证）**：CC auto-compact 在 **turn（轮次）边界**发生，**不打断 mid-turn 工具调用**。原因：compact 本质是"用总结替换历史"，只能在完整 turn 之间做——mid-turn 插入会破坏 tool_use/tool_result 配对，导致 API 报错。流程：
  ```
  模型完成一个 turn（可能含多次工具调用，turn 内完整）
    → turn 结束，模型停止输出
    → CC 检查 context 是否超阈值（window × pct）
    → 超了 → 执行 compact（总结历史→重建上下文）
    → 下一 turn 开始，上下文已是压缩后的
  ```
  所以"在任务中还是先完成"——CC 让当前 turn 的工具调用链跑完，在 turn 边界压缩，不半路掐断。
- **checkpoint-writer 的真正角色（修正此前"compact 时临时记录"的误解）**：
  - checkpoint-writer **不是**在 compact 发生那一刻临时起作用，而是**提前**在 B 边界（D4）把状态写好。
  - compact 发生时，PreCompact hook 读已写好的 checkpoint.md（再生源），PostCompact hook 把它预算化注入 + seam framing。
  - 这是"再生式"的本质：状态提前持久化到文件，compact 时从文件再生，而非靠 compact 那一刻的 LLM 总结（那个会丢精确值）。
- **固有局限（诚实记录）**：若 auto-compact 发生在两个 B 边界之间（如一个 wave 内部跑到 600K 爆了，还没到下一个 wave 边界），checkpoint.md 是上一个边界的旧版本，这一段工作状态靠 D5 fallback 兜底（粗糙但不阻断）。D9 的 600K 配置放大了这个风险，因此 D5 升级为关键防线。

## 接口设计

### checkpoint-writer subagent（R2）

通过 Task tool spawn，prompt 结构（借鉴 MiMo composeWriterPrompt）：

```
<system-reminder>
You are checkpoint-writer. Ignore general coding framing.
ABSOLUTE PATHS — USE VERBATIM:
  CHECKPOINT_PATH = <abs>/.tinkerman/checkpoint.md
  STATUS_PATH     = <abs>/.tinkerman/status.md
  PROGRESS_DIR    = <abs>/.tinkerman/progress/
Read CHECKPOINT_PATH (prior) + STATUS_PATH + active progress files.
Update each section in-place (Edit body only, never headers/italic instructions).
EXACT-FORM: precise values (ports/commands/versions/IDs) copied byte-for-byte.
</system-reminder>
Write the next checkpoint for the current <phase> phase. <range description>
```

### PreCompact hook 升级（R3）

`hook-precompact.sh` 新增逻辑（前置，保留现有 grep 路径作 fallback）：

```bash
# 优先读结构化 checkpoint.md
if [ -f ".tinkerman/checkpoint.md" ]; then
  SNAPSHOT_SOURCE=".tinkerman/checkpoint.md"
else
  # fallback: 现有 grep 拼 progress 逻辑（不变）
  SNAPSHOT_SOURCE=""  # 走原路径生成 .compact-snapshot.md
fi
```

### PostCompact hook 升级（R3）

`hook-postcompact.sh` 新增预算化注入 + seam framing（输出到 stdout 注入上下文）：

```
[checkpoint.md 内容，section-aware 截断，每 section 带预算]

---
This session continues from a checkpoint. The messages below are real history.
Resume directly. Do not recap, do not preface with "I'll continue".
```

### 统一 cron 安装器（R5）

```
/forge learn --install     → installCronSkill("learn", config.learn.cron, "/forge learn --deep")
/forge triage --install    → installCronSkill("triage", config.triage.cron, "/forge triage")
```

`installCronSkill` 内部调 CC 的 `CronCreate`（对齐 `scheduling-strategy.ts` 的 `selectScheduler`，>5min 走 CronCreate）。

## 数据模型

### .tinkerman/checkpoint.md（R1）

固定 section（Forge 阶段语义版），每 section italic 指令 + token 预算：

| Section | 内容 | 预算 |
|---------|------|------|
| 当前阶段与意图 | 当前 phase + 用户原话 block-quote | 500 |
| 下一步具体动作 | 单一下一步，带 verbatim 引用 | 1000 |
| 本会话指令 | session-specific 工作风格（非项目级） | 800 |
| 当前工作 | 正在做什么，文件路径 + 代码位置 | 2000 |
| 文件与代码区段 | 活跃读写的文件，一行用途 | 1500 |
| 已发现问题与修复 | 错误 + 如何解决，最新在前 | 1500 |
| 活跃资源 | branch / 进程 / temp artifacts | 1000 |
| 设计决策与讨论结果 | 讨论达成的决策（无立即产物），含 why | 3000 |
| 待迁移知识 | 候选提升进 knowledge 的跨任务事实 | 1500 |
| 开放笔记 | catch-all（引用/未决问题/观察） | 800 |
| **EXACT-FORM 值** | 用户给的所有精确值逐字节集中 | 800 |

总 ~15.4K，配 R3 的 section-aware 截断。EXACT-FORM 值独立成 section（集中管理，最不易丢）。

### CC transcript JSONL 读取（R4）

```
路径: ~/.claude/projects/<slug>/<session_id>.jsonl
slug: cwd 的路径转义（/ → -），如 -Users-king-code-Forge
session_id: hook stdin 的 session_id 字段
每行: { type: "user"|"assistant", message: { role, content: [{type, text/tool_use/tool_result}] } }
```

learn --deep 读取流程：Glob `~/.claude/projects/<slug>/*.jsonl` → 按 mtime 过滤最近 7 天 → 逐行 JSON.parse → 提取 user text（搜关键词）+ tool_use（找重复）。

## 风险

| 风险 | 缓解 |
|------|------|
| checkpoint-writer subagent 拖慢主 agent（Task tool spawn 有成本） | fire-and-forget，主 agent 不阻塞；触发用阶段边界（D4），非高频 |
| CC JSONL 格式未来版本变更 | D6：解析容错 + 格式探测 + 降级到对账 `.tinkerman/` 文件轨迹 |
| EXACT-FORM 规则 LLM 遵从率不稳定 | D2：增量更新给纠正机会；独立 EXACT-FORM section 集中管理；R4 dream 周期对账补漏 |
| checkpoint.md 过时（长阶段内不触发 writer） | D4：PostCompact 加 mtime 检查，过旧则降级 fallback；D5 fallback 保留 |
| learn --deep 和 triage cron 并发 | D7：两者只读 + 写各自文件，不抢资源；MIN_SPAWN_GAP 防抖 |
| 本地 cron 关机漏触发 | 文档明确约束（对齐 loop-engineering-adoption AC8），不承诺关机运行 |
| 与 context-explosion-defense 边界模糊 | 背景 + D8 明确：前者管工具输出瘦身，本 spec 管会话状态保全，正交 |
