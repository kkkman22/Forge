---
topic: regenerative-checkpoint
date: "2026-06-16"
spec_ref: regenerative-checkpoint
format: lightweight
monolith_acknowledged: true
---

# 再生式 Checkpoint — 任务清单

> 五个需求按依赖与风险分五个 Wave 顺序交付：**Wave1 R1（模板）→ Wave2 R3（hook 升级，依赖 R1 模板但保留 fallback 可独立交付）→ Wave3 R2（writer subagent）→ Wave4 R4（learn 收敛）→ Wave5 R5（cron 框架）**。
>
> **已知背景（研究成果约束）**：
> - `.forge/config.md` 在**冻结区**，build 阶段 AI 不得修改。所有 config 变更只能落进 `scripts/init.sh` 的 heredoc 模板（L369 `cat > config.md << CONFIGEOF`）+ 文档指引让用户手加。
> - 新增/改 sub-skill 需跑 `scripts/sync-command-registry.mjs`（刷新 registry.toml + allowlist.ts）+ `scripts/build-lib-manifest.mjs`（刷新 manifest.json sha256）。
> - `dist-plugin/` 是分发镜像副本，构建时由 `scripts/build-dist.sh` 同步。
> - learn skill 在 `skills/forge/lib/learn/`（instructions.md + references/）。
> - checkpoint-writer 不是 CC 内置 subagent 类型，通过 Task tool（主 agent 在 build 指令里 spawn）实现，不需注册成独立 agent 文件——它是 build/review instructions 里的一个 spawn 约定。
> - `scripts/init.sh` 已有 triage 模板复制块（L346-357）和 config heredoc（L369-457 含 `triage:` 块 L377），R5 的 learn cron config 追加到此。

## Design Reference Index

| Anchor | 位置 | 用途 |
|---|---|---|
| `design.md#d1-checkpointmd-用-forge-阶段语义` | D1 | section 适配 Forge 阶段，非照搬 MiMo |
| `design.md#d2-exact-form-规则用-prompt-强制` | D2 | EXACT-FORM 纯 prompt，不引入解析器 |
| `design.md#d3-checkpoint-writer-用-task-tool-spawn` | D3 | Task tool subagent，非自建 actor |
| `design.md#d4-触发时机用阶段边界` | D4 | 阶段边界触发，非 token 压力等级 |
| `design.md#d5-precompactpostcompact-保留-fallback` | D5 | checkpoint.md 不存在降级 grep 拼 progress |
| `design.md#d6-对账读-cc-jsonl` | D6 | 读 CC transcript JSONL，非自建轨迹存储 |
| `design.md#d7-统一-cron-框架` | D7 | learn/triage 共建 installCronSkill |
| `design.md#d8-不引入-fts5sqlite` | D8 | 跨会话检索用 JSONL + Grep |
| `design.md#d9-glm-1m-compact-配置` | D9 | GLM-5.2 window=1000000+pct=60（省额优先，D5 升级关键防线） |
| `design.md#d10-compact-在-turn-边界发生` | D10 | turn 边界 compact + checkpoint-writer 预持久化 |

## File Mapping

| 文件 | 动作 | 需求 |
|---|---|---|
| `.forge/templates/checkpoint.md` | CREATE | R1 |
| `skills/forge/lib/build/instructions.md` | MODIFY（阶段边界 spawn checkpoint-writer 约定） | R2 |
| `skills/forge/lib/review/instructions.md` | MODIFY（build→review 边界 spawn checkpoint-writer 约定） | R2 |
| `scripts/hook-precompact.sh` | MODIFY（优先读 checkpoint.md，保留 grep fallback） | R3 |
| `scripts/hook-postcompact.sh` | MODIFY（预算化注入 + seam framing） | R3 |
| `src/checkpoint/read-budgeted.mjs` | CREATE（section-aware 预算读取，PostCompact 用） | R3 |
| `skills/forge/lib/learn/instructions.md` | MODIFY（加 --deep 收敛模式） | R4 |
| `skills/forge/lib/learn/references/deep-reconciliation.md` | CREATE（对账 JSONL + 收敛纪律规则） | R4 |
| `src/loop/install-cron-skill.mjs` | CREATE（统一 installCronSkill 安装器） | R5 |
| `scripts/init.sh` | MODIFY（config heredoc 加 learn cron 块 + 复制 checkpoint.md 模板） | R1, R5 |
| `skills/forge/registry.toml` | REGEN | R4 |
| `skills/forge/lib/manifest.json` | REGEN | R4 |
| `src/forge-dispatcher/allowlist.ts` | REGEN | R4 |
| `docs/forge-checkpoint.md` | CREATE（再生式 checkpoint 机制 + EXACT-FORM 指引 + GLM 1M compact 配置） | R1, D9 |
| `docs/claude-code-compatibility.md` | MODIFY（记录 transcript_path / CronCreate 依赖版本） | R3, R5 |
| `scripts/track-read-budget.mjs` | MODIFY（修正 deprecated 注释：PCT 单独无效，须配合 WINDOW） | D9 |

---

## Wave 1 — R1 固定 section 模板 + EXACT-FORM

### Task 1: 创建 checkpoint.md 模板
- **目标文件**：`.forge/templates/checkpoint.md`
- **内容**：Forge 阶段语义版 11 section（design.md 数据模型表），每 section italic 指令 + token 预算标注。含独立的 §EXACT-FORM 值 section（集中管理精确值）。
- **验收**：模板含 italic 指令行、token 预算、EXACT-FORM 规则说明；§当前阶段与意图含 block-quote 占位。

### Task 2: init.sh 复制 checkpoint.md 模板
- **目标文件**：`scripts/init.sh`（L346 triage 模板块附近追加）
- **内容**：idempotent 复制 `.forge/templates/checkpoint.md` 到项目的 `.forge/checkpoint.md`（不存在时才复制）。
- **验收**：`forge init` 后 `.forge/checkpoint.md` 存在；重复 init 不覆盖。

### Task 3: 文档 forge-checkpoint.md
- **目标文件**：`docs/forge-checkpoint.md`
- **内容**：再生式 checkpoint 机制说明（为什么从总结式转再生式）+ EXACT-FORM 指引（举例端口/命令/版本号怎么记）+ 11 section 用途。
- **验收**：文档解释再生式 vs 总结式差异、EXACT-FORM 规则、各 section 写什么。

### Task 3a: init 自动写入 GLM compact 配置 + 文档 + 修正 track-read-budget 注释
- **目标文件**：`scripts/init.sh`（L757-761 envVars 对象）、`docs/forge-checkpoint.md`（配置章节）、`scripts/track-read-budget.mjs`（L4-6 注释）
- **内容**：
  - **init.sh 自动写入**（D9 决策：init 自动写入，与现有 3 个 env 同等）：在 L757 的 `envVars` 对象追加 `'CLAUDE_CODE_AUTO_COMPACT_WINDOW': '1000000'` + `'CLAUDE_AUTOCOMPACT_PCT_OVERRIDE': '60'`。复用现有 idempotent 逻辑（L766 按 key 存在判断，已设不同值的用户不覆盖）。同步更新 L797 的 warn 文案（node 缺失时手动指引）+ L1002 附近的手动配置 echo。
  - docs 给主力用户（GLM coding plan）说明：推荐配置（init 已自动写入，无需手动）、600K compact 的省额 vs 漂移权衡、**单独设 PCT 对默认本地会话无效必须配合 WINDOW**、备选档（平衡 window=200000+pct=80 / 激进 window=500000+pct=60）。
  - 修正 `track-read-budget.mjs` L4-6 注释：`Superseded by CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=60` → `Superseded by CLAUDE_CODE_AUTO_COMPACT_WINDOW=1000000 + CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=60（配合使用，单独 PCT 对默认本地会话无效）`。
- **验收**：`forge init` 后 settings.json 的 env 块含两个新变量；重复 init 不覆盖用户改值；docs 含配置说明 + 三档建议；track-read-budget 注释修正。

---

## Wave 2 — R3 PreCompact/PostCompact hook 升级

### Task 4: section-aware 预算读取工具
- **目标文件**：`src/checkpoint/read-budgeted.mjs`
- **内容**：纯函数。输入 checkpoint.md 路径 + 总预算，按 `## ` section 切分，预算用完时保留 header + italic 指令（骨架）截断 body，输出截断文本 + hint（对齐 MiMo `readBudgetedSectionAware`）。**RED 先行**：先写测试（预算内全量 / 超预算骨架截断 / 多 section 分配）。
- **验收**：vitest 通过；超预算时输出骨架 + `Read(.forge/checkpoint.md) for full content` hint。

### Task 5: hook-precompact.sh 优先读 checkpoint.md（含 mtime 检查 — D9 升级为关键防线）
- **目标文件**：`scripts/hook-precompact.sh`
- **内容**：前置逻辑——`.forge/checkpoint.md` 存在且 mtime 较新（如最近 N 个 turn 内更新）时，以它为 snapshot 源（替代 grep 拼 progress）；不存在或**过旧**时降级到现有 grep 逻辑（D5 fallback，不变）。**D9 选 600K compact 使此检查升级为关键防线**：过旧的 checkpoint 在 600K 区间会丢失大量状态，故过旧时除走 fallback 外，须在 snapshot 中追加警示行（`⚠️ checkpoint.md 过旧（<mtime>），使用 fallback snapshot，建议检查 checkpoint-writer 是否正常触发`）。保留"NEVER exit 2"约束。
- **验收**：checkpoint.md 新鲜时 snapshot 含其内容；过旧/不存在时走原 grep 路径 + 警示行；hook 永远 exit 0。

### Task 6: hook-postcompact.sh 预算化注入 + seam framing
- **目标文件**：`scripts/hook-postcompact.sh`
- **内容**：调用 Task 4 的 read-budgeted.mjs 对 checkpoint.md 做 section-aware 截断 → 注入；追加 seam framing 文案（design.md 接口设计：真实历史 / 直接继续 / 不复述）。snapshot 不存在时走原逻辑（不变）。
- **验收**：输出含截断后的 checkpoint + seam framing；空 snapshot 时不报错。

### Task 7: claude-code-compatibility.md 记录 hook 依赖
- **目标文件**：`docs/claude-code-compatibility.md`
- **内容**：记录 PreCompact/PostCompact 的 `transcript_path` 依赖（v2.1.139+，现有 L27 已记录 R13）+ checkpoint.md 读取为新增行为。
- **验收**：兼容性表含 checkpoint.md 读取行为 + 旧版本降级说明。

---

## Wave 3 — R2 checkpoint-writer subagent（记录外包）

### Task 8: build instructions 加阶段边界 spawn 约定
- **目标文件**：`skills/forge/lib/build/instructions.md`
- **内容**：在每个 task 完成 / 阶段收尾时，主 agent 用 Task tool spawn checkpoint-writer（prompt 结构见 design.md 接口设计：锁死绝对路径 + 读 prior checkpoint/status/progress + 增量 Edit 各 section + EXACT-FORM 规则）。主 agent fire-and-forget，不阻塞等待。对齐 D4（阶段边界触发）。
- **验收**：instructions 含 spawn checkpoint-writer 的明确指令 + 不阻塞约束 + EXACT-FORM 规则引用。

### Task 9: review instructions 加 build→review 边界 spawn 约定
- **目标文件**：`skills/forge/lib/review/instructions.md`
- **内容**：build→review 边界同样 spawn checkpoint-writer 记录 build 产出状态。复用 Task 8 的 prompt 模板。
- **验收**：review instructions 含阶段边界 spawn 约定。

---

## Wave 4 — R4 /forge learn --deep 收敛

### Task 10: learn instructions 加 --deep 模式
- **目标文件**：`skills/forge/lib/learn/instructions.md`
- **内容**：新增 `--deep`（收敛模式）分支：对账 raw trajectory（CC JSONL + `.forge/` 文件轨迹）→ 去重 → 合并 → 压缩 → 验证 → prune → 输出收敛报告。默认 `/forge learn`（提取模式）行为不变。
- **验收**：`--deep` 触发收敛流程；无 `--deep` 时行为与现有 learn 一致。

### Task 11: deep-reconciliation 参考文档
- **目标文件**：`skills/forge/lib/learn/references/deep-reconciliation.md`
- **内容**：对账规则（读 `~/.claude/projects/<slug>/*.jsonl`，搜 always/never/decided 等关键词 + 等价中文）、验证规则（Glob 路径 / Grep 函数名 / 存疑标 `[unverified]`）、prune 规则（推翻的过时条目 / 相对日期转绝对 / 合并重复 / 保留来源）、密度上限（≤200行/10KB）。对齐 D6（读 CC JSONL）。
- **验收**：文档含 JSONL 读取示例 + 验证 + prune 规则 + 密度上限。

### Task 12: registry / manifest / allowlist REGEN
- **目标文件**：`skills/forge/registry.toml`、`skills/forge/lib/manifest.json`、`src/forge-dispatcher/allowlist.ts`
- **内容**：跑 `scripts/sync-command-registry.mjs` + `scripts/build-lib-manifest.mjs` 刷新（learn --deep 是现有 skill 的新参数，可能不需新 registry 条目，以脚本输出为准）。
- **验收**：三个文件一致刷新；`npm run check` 通过。

---

## Wave 5 — R5 统一 cron 调度框架

### Task 13: installCronSkill 统一安装器
- **目标文件**：`src/loop/install-cron-skill.mjs`
- **内容**：纯函数 + CC `CronCreate` 调用。签名 `installCronSkill(skillName, cronExpr, prompt)`。复用 `scheduling-strategy.ts` 的 `selectScheduler`（>5min 走 CronCreate）。含 `--uninstall` / `--status`（读 `.forge/state/last-<skill>-at`）。**RED 先行**。对齐 D7。
- **验收**：vitest 通过；install/uninstall/status 三态正确。

### Task 14: learn --install 接入安装器
- **目标文件**：`skills/forge/lib/learn/instructions.md`
- **内容**：`/forge learn --install [--uninstall] [--status]` 调用 installCronSkill，cron 表达式读 `.forge/config.md` 的 `learn.cron`（默认 `"0 9 * * 1"`）。`learn.enabled: false` 只挡 --install 不挡手动 --deep（对齐 R5-AC4）。
- **验收**：--install 安装 cron；--uninstall 卸载；--status 显示 last-learn-at。

### Task 15: init.sh config heredoc 加 learn cron 块
- **目标文件**：`scripts/init.sh`（L377 triage 块附近追加）
- **内容**：config heredoc 加 `learn:` 块（`enabled: false` / `cron: "0 9 * * 1"` / `deep_interval_days: 7`）。冻结区约束——只改 init 模板，不改现有项目 config。
- **验收**：`forge init` 后 config.md 含 learn 块；默认 enabled: false。

### Task 16: triage --install 合并进统一框架
- **目标文件**：`skills/forge/lib/triage/instructions.md`（若已在 main 则 MODIFY；若在 feature 分支则从 `feature/loop-engineering-adoption` cherry-pick 后改造）
- **内容**：triage `--install` 改用 Task 13 的 installCronSkill（替代 feature 分支里的独立实现）。顺势把 triage `--install` 调度部分合并进 main。
- **验收**：learn --install 和 triage --install 共用同一安装器；两者可独立安装/卸载。

---

## 交付顺序与验证门禁

| Wave | 需求 | 完成标志 |
|------|------|---------|
| 1 | R1 模板 | checkpoint.md 模板 + init 复制 + 文档 |
| 2 | R3 hook | PreCompact 读 checkpoint / PostCompact 预算化注入 + seam framing |
| 3 | R2 writer | build/review instructions 含 spawn checkpoint-writer 约定 |
| 4 | R4 learn --deep | learn 能读 JSONL 对账 + 收敛报告 |
| 5 | R5 cron | learn/triage 共用 installCronSkill |

每个 Wave 完成后：`npm run check`（tsc + biome + vitest + readme metrics）+ 原子提交。端到端验收（整 spec 验收标准）：一个跨越 compact 的长会话，compact 后主 agent 能准确复述用户给过的精确值，不漂移。
