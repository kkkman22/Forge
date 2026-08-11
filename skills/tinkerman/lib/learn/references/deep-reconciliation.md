---
updated: 2026-08-11
---
# /tinkerman learn --deep — 知识库收敛模式

> **Spec: regenerative-checkpoint R4/D6**
> 借鉴 MiMo-Code `/dream`。周期性收敛知识库：不是提取新知识，而是让已有知识更紧凑、更准确、无冗余。

---

## 何时用

`/tinkerman learn`（默认提取模式）每次开发后**只增不减**——knowledge 文件会持续增长腐化。`--deep` 是收敛动作：定期跑（建议每 7 天，或 R5 cron 自动触发），对账真实轨迹、去重、压缩、验证、prune。

---

## 数据源

### 1. CC transcript JSONL（raw trajectory，权威源）

路径：`~/.claude/projects/<slug>/<session_id>.jsonl`

- `<slug>` = 当前 cwd 路径转义（`/` → `-`），如 `-Users-king-code-Forge`
- 每行一条 JSON：`{ type: "user"|"assistant", message: { role, content: [{type, text/tool_use/tool_result}] } }`
- 用 Glob 定位 + 按 mtime 过滤最近 7 天（`deep_interval_days` 可配，默认 7）

### 2. `.forge/` 文件轨迹（Forge 自己的沉淀）

- `.forge/knowledge/sessions/*.md` — 会话总结
- `.forge/knowledge/solutions/*.md` — 解决方案
- `.forge/knowledge/instincts.md` — 直觉模式
- `.forge/knowledge/known-failures.md` — 已知失败
- `.forge/decisions/*.md` — ADR
- `.forge/runs/*.jsonl` — 事件日志

---

## 收敛流程

### Phase 0 — 防抖检查

若由 cron 触发（非手动），先检查防抖：读 `.forge/state/last-learn-at`（ISO 时间戳）。若距今 < `MIN_SPAWN_GAP_MS`（10s，`src/loop/install-cron-skill.ts` 的 `shouldDebounceSpawn`），跳过本次触发并输出 `⏭️ learn --deep debounced (last run <10s ago)`，避免 cron 重复触发或手动+cron 碰撞。

### Phase 1 — 定位数据

1. Glob `~/.claude/projects/<slug>/*.jsonl`，按 mtime 过滤最近 `deep_interval_days` 天。
2. Glob `.forge/knowledge/**/*.md` + `.forge/decisions/*.md`，记录现有知识库结构。

### Phase 2 — 对账验证（D6：读 CC JSONL）

对每个 knowledge 条目的候选事实，在 CC JSONL 里验证：

- 逐行 `JSON.parse` JSONL，提取 `type:user` 的文本内容。
- 搜用户原话关键词验证"规则/决策"类条目：
  - 英文：`always` / `never` / `remember` / `rule` / `decision` / `decided` / `tradeoff`
  - 中文：`总是` / `绝不` / `记住` / `规则` / `决定` / `权衡`
- **只有以下三类才保留为 knowledge**：
  1. 显式用户陈述（用户在对话里明确说过）
  2. 明确设计决策（ADR 记录或 discussion 产出）
  3. 跨会话重复证据（≥2 次 session 出现同一模式）

JSONL 解析示例（bash read-only）：
```bash
# 列出最近 7 天的 session 文件
find ~/.claude/projects/-Users-king-code-Forge/ -name "*.jsonl" -mtime -7 | head

# 提取某 session 的用户消息文本
node -e "
const fs = require('fs');
for (const line of fs.readFileSync(process.argv[1],'utf8').split('\n')) {
  if (!line.trim()) continue;
  try {
    const o = JSON.parse(line);
    if (o.type !== 'user') continue;
    const c = o.message?.content;
    if (!Array.isArray(c)) continue;
    for (const p of c) if (p.type === 'text') console.log(p.text);
  } catch {}
}
" <session.jsonl> | grep -iE 'always|never|decide|rule|总是|绝不'
```

**格式容错**（D6 风险缓解）：JSONL 字段可能随 CC 版本变化。只取已知字段（`type`/`message.role`/`content[].type`），未知字段忽略。解析失败时降级为"只对账 `.forge/` 文件轨迹"（跳过 JSONL，仍执行去重/压缩/prune）。

### Phase 3 — 去重与合并

- 扫描 knowledge 文件，找内容重叠的条目（同一事实/规则出现在多个 sessions/solutions）。
- 合并重复：保留信息最完整的版本，其余删除，保留来源标记 `[<source>]`。
- 相对日期（"昨天"、"recently"）→ 绝对日期 YYYY-MM-DD。

### Phase 4 — 验证

- knowledge 条目引用的**文件路径**：用 Glob 验证是否存在。
- knowledge 条目引用的**函数/类名**：用 Grep 验证是否存在。
- 无法验证但合理的条目标 `[unverified]`。
- 引用的路径/函数已不存在的条目标 `[stale]` 并 prune。

### Phase 5 — Prune（密度上限）

- 单个 knowledge 文件 ≤ **200 行 / 10KB**（`learn.deep_max_lines` / `learn.deep_max_bytes` 可配）。宁少勿滥。
- prune 被新决策推翻的过时条目（如旧 ADR 被 new ADR 取代）。
- prune 只对一个 session 有意义的细节（已迁移进 solutions 的 sessions 条目可精简）。
- 宪法 §4.2 的 20 文档上限 + Confidence<0.3 自动清理规则**保留不变**，本收敛在其基础上叠加行数/字节约束。

---

## Phase 6 — 记录触发时间

收敛完成后，写入 `.forge/state/last-learn-at`（ISO 8601 时间戳），供 `--status` 和 cron 防抖读取：

```bash
mkdir -p .forge/state
date -u +%Y-%m-%dT%H:%M:%SZ > .forge/state/last-learn-at
```

---

## 输出格式

收敛完成后输出报告：

```
✅ learn --deep 收敛完成

- Consolidated: <N> 条新条目（经验证从 trajectory 提取）
- Updated: <N> 条已有条目被更新
- Deleted: <N> 条过时/重复/失效条目被 prune
- Skipped: <原因>（如无变化）
- Unverified: <N> 条标记 [unverified]
- Health: <文件名> <行数>/200 行, <KB>/10KB

[可选] Workflow candidates: 如发现重复工作流，建议跑 /tinkerman distill（本 spec 范围外）
```

将报告摘要写入 `.forge/knowledge/sessions/<date>-deep-reconciliation.md`。

---

## 约束

- **只读 JSONL**：不修改 CC 的 transcript 文件。
- **不阻断**：收敛失败（JSONL 解析失败、knowledge 文件缺失）时降级继续，不报错中断。
- **保留来源**：合并/prune 时保留 `[<source>]` 标记，可追溯。
- **不提取新功能知识**：发现重复工作流不打包（那是 distill 的职责），只在报告里一行提示。
