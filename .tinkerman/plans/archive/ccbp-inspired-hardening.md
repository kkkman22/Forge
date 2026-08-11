---
status: approved
created: "2026-05-12"
source: "CCBP (Claude Code Best Practices) 8-item gap analysis"
---

# Plan: CCBP-Inspired Hardening

> 来源：Anthropic 官方 best practices + shanraisshan/claude-code-best-practice 社区资源
> 8 项差距消弭，全部为内容改动，不涉及 TypeScript 代码

## Objective

基于 CCBP 推荐实践加固 Forge 的 SKILL 系统、CLAUDE.md 和 hooks，提升规则遵从度、降低 context token 消耗、增强 skill 可靠性。

## 任务摘要

| # | 任务 | 类型 | 涉及文件 |
|---|------|------|---------|
| T1 | 创建 `.claude/rules/` 路径懒加载 | 新增 | 4 个 rules 文件 |
| T2 | SKILL `context: fork` 隔离 | 改 frontmatter | 8 个 SKILL.md |
| T3 | CLAUDE.md `<important if=...>` 条件强调 | 改内容 | CLAUDE.md |
| T4 | SKILL Gotchas 段落标准化 | 改内容 | 28 个 SKILL.md |
| T5 | Stop hook 验证 nudge | 改 hooks | hooks/hooks.json |
| T6 | SKILL description trigger 优化 | 改 frontmatter | 按需 |
| T7 | 探索类 skill 去 railroad | 改内容 | 5 个 SKILL.md |
| T8 | SKILL `!command` 动态注入 | 改内容 | 按需 |

---

## T1: 创建 `.claude/rules/` 路径懒加载

**CCBP 来源**: "`.claude/rules/*.md` auto-load into every session like CLAUDE.md — add `paths:` YAML frontmatter to lazy-load them only when Claude touches files matching the glob"

**做法**: 创建以下 rules 文件，将 CLAUDE.md 中可延迟加载的指令抽出：

### T1.1: `.claude/rules/forge-state.md`
```yaml
---
paths:
  - ".tinkerman/**"
  - ".tinkerman/config.md"
  - ".tinkerman/status.md"
  - ".tinkerman/plans/*.md"
  - ".tinkerman/specs/*.md"
  - ".tinkerman/progress/*.md"
  - ".tinkerman/reviews/*.md"
---
```
内容：Forge 三区保护规则（冻结区/受保护区/开放区）的完整描述。当前 CLAUDE.md 只引用 `docs/forge-constitution-detail.md`，但 rules 文件在触发时直接加载，无需间接引用。

### T1.2: `.claude/rules/testing.md`
```yaml
---
paths:
  - "test/**"
  - "tests/**"
  - "**/*.test.ts"
  - "**/*.test.js"
---
```
内容：TDD 执行纪律精要、biome 分层严格度规则、`npm run check` 命令参考。

### T1.3: `.claude/rules/skill-authoring.md`
```yaml
---
paths:
  - "skills/**"
  - ".claude/agents/**"
  - ".claude/commands/**"
---
```
内容：SKILL.md 设计原则（Gotchas 必选、description 是 trigger、目标优于步骤、`!command` 注入模式）。

### T1.4: `.claude/rules/hooks.md`
```yaml
---
paths:
  - "hooks/**"
  - "scripts/**"
---
```
内容：Hook 事件类型、matcher 语法、安全约束。

**不做什么**: 不从 CLAUDE.md 删除内容（rules 是补充，不是替代）。rules 只在匹配路径时加载，CLAUDE.md 始终加载。

---

## T2: SKILL `context: fork` 隔离

**CCBP 来源**: "use `context: fork` to run a skill in an isolated subagent — main context only sees the final result, not intermediate tool calls"

**适用 skill**（研究/探索类，不修改 .forge 状态）：
- `forge-decide` — 并行 subagent 输出汇总后返回结论
- `forge-learn` — 知识提取，只写 .tinkerman/knowledge/
- `forge-debug` — 诊断过程消耗大量 context
- `forge-storm` — 事件风暴探索
- `forge-zoom-out` — 架构审计
- `forge-recap` — 时间窗复盘
- `forge-grill` — Socratic 问答
- `forge-mutate` — 变异测试分析

**不适用**（需主 context 持续交互）：
- forge-build, forge-plan, forge-ship, forge-test, forge-review, forge-fix — 这些 skill 需要主 context 管理状态流转

**做法**: 在 frontmatter 添加 `context: fork`。

---

## T3: CLAUDE.md `<important if=...>` 条件强调

**CCBP 来源**: "wrap domain-specific CLAUDE.md rules in `<important if=...">` tags to stop Claude from ignoring them as files grow longer"

**做法**: 在 CLAUDE.md 中对铁律规则包裹条件强调标签：

```markdown
<important if="executing /forge build or /forge plan">
IRON-LAW: TDD RED→GREEN→REFACTOR. Code before test = delete and restart.
</important>

<important if="completing a task or phase">
No confirmation between steps. Phase done → auto-advance. Stop = violation.
</important>

<important if="running /forge review or /forge ship">
P0/P1 findings block ship. Fix → re-review. No exceptions.
</important>

<important if="context exceeds 100k tokens or session runs long">
Consider /clear + /forge resume. .tinkerman/ directory carries state between sessions.
</important>
```

**不做什么**: 不改 docs/forge-constitution-detail.md（detail doc 是参考，不被条件强调）。

---

## T4: SKILL Gotchas 段落标准化

**CCBP 来源**: "build a Gotchas section in every skill — highest-signal content, add Claude's failure points over time"

**做法**: 每个 SKILL.md 末尾增加 `## Gotchas` 段落（3-5 条），内容基于该 skill 已知的失败模式。

**已有 Gotchas 的 skill**: 保留并补充。
**无 Gotchas 的 skill**: 新增。

**每条 Gotcha 格式**:
```markdown
- **<失败模式>**: <症状> → <原因> → <预防>
```

**示例**（forge-build）:
```markdown
## Gotchas
- **跳过 RED 阶段**: 先写实现再补测试 → 测试测的是实现不是行为 → 必须先写失败测试
- **原子提交遗漏**: 改了 3 个文件只 commit 1 个 → 状态不一致 → 每完成一个子任务立即 commit
- **subagent 上下文泄漏**: subagent 返回全部原始输出 → 主 context 被污染 → subagent 只返回结论摘要
```

**优先从 `.tinkerman/knowledge/` 提取已知失败模式**。

---

## T5: Stop Hook 验证 Nudge

**CCBP 来源**: "use a Stop hook to nudge Claude to keep going or verify its work at the end of a turn"

**当前 Stop hooks**: 已有任务完成检查、persistent loop、规则提案检查、违规记录、stale 标记。

**做法**: 在现有 Stop hooks 末尾添加验证 nudge：

```json
{
  "hooks": [
    {
      "type": "command",
      "command": "if [ -f .tinkerman/status.md ]; then phase=$(grep '^phase:' .tinkerman/status.md 2>/dev/null | sed 's/phase: *\"\\{0,1\\}//;s/\"\\{0,1\\} *$//'); if [ -n \"$phase\" ] && [ \"$phase\" != 'completed' ] && [ \"$phase\" != '' ]; then echo \"⚠️ Phase: $phase — did you verify your last change? Run the relevant test/lint command before stopping.\"; fi; fi",
      "timeout": 3
    }
  ]
}
```

**行为**: 当 phase 不是 completed/空时，提醒 Claude 验证最后一次修改。

---

## T6: SKILL Description Trigger 优化

**CCBP 来源**: "skill description field is a trigger, not a summary — write it for the model ('when should I fire?')"

**做法**: 审查全部 28 个 SKILL.md 的 description 字段。确保每个 description 包含明确的触发条件（"Use when..."模式）。

**当前状态**: 大多数 Forge skill 已经采用 "Use when..." 模式（审查时确认）。只需修正少数不符合的。

**标准格式**:
```
description: "<动词短语>. Use when <触发条件1>, <触发条件2>, or <触发条件3>."
```

---

## T7: 探索类 Skill 去 Railroad

**CCBP 来源**: "don't railroad Claude in skills — give goals and constraints, not prescriptive step-by-step instructions"

**范围（仅探索类）**:
- `forge-storm` — 事件风暴探索
- `forge-zoom-out` — 架构审计
- `forge-recap` — 时间窗复盘
- `forge-grill` — Socratic 问答
- `forge-learn` — 知识提取

**不改动（保持 prescriptive）**:
- forge-build, forge-plan, forge-review, forge-test, forge-ship — 流程确定性是 Forge 的核心价值
- forge-debug, forge-fix — 诊断流程需要结构化
- forge-decide — 多视角评估需要严格步骤

**做法**: 将探索类 skill 的步骤改为 goals + constraints 格式：
```
Before: "Step 1: Read X. Step 2: Analyze Y. Step 3: Output Z."
After: "Goal: Produce Z. Constraints: Must cover X and Y. Approach: Your choice."
```

---

## T8: SKILL `!command` 动态注入

**CCBP 来源**: "embed `!command` in SKILL.md to inject dynamic shell output into the prompt — Claude runs it on invocation and the model only sees the result"

**适用场景**: SKILL 需要当前状态信息时（git branch、test status、phase state）。

**候选注入点**:
- `forge-build`: 注入当前 branch 和 plan status
- `forge-review`: 注入最近 commit hash 和 diff stat
- `forge-ship`: 注入当前 branch、review status、test status
- `forge-resume`: 注入当前 phase 和 task status
- `forge-status`: 注入完整 status 文件内容

**做法**: 在 SKILL.md 的相关段落嵌入 `!command` 指令。格式：
```markdown
Current branch: !`git branch --show-current`
Plan status: !`head -5 .tinkerman/plans/*.md 2>/dev/null || echo "no plan"`
```

**注意**: `!command` 是 Claude Code 原生功能，不是 shell 执行。确认支持后使用。

---

## 执行顺序

```
T1 (rules) → 无依赖
T2 (context: fork) → 无依赖
T3 (important if) → 无依赖
T4 (gotchas) → 无依赖，但量大（28 个文件）
T5 (stop hook) → 无依赖
T6 (description) → 无依赖
T7 (de-railroad) → 无依赖
T8 (!command) → T2 完成后执行（需要确认 context: fork 下 !command 行为）
```

T1-T7 可并行。T8 依赖 T2。

## 验收标准

- [ ] `.claude/rules/` 有 4 个带 `paths:` 的 rule 文件
- [ ] 8 个探索类 SKILL 有 `context: fork`
- [ ] CLAUDE.md 有 4 个 `<important if=...>` 包裹的铁律
- [ ] 全部 28 个 SKILL.md 有 Gotchas 段落（≥3 条）
- [ ] hooks.json Stop 事件有验证 nudge
- [ ] 全部 description 符合 trigger 格式
- [ ] 5 个探索类 SKILL 去 railroad
- [ ] 至少 3 个 SKILL 有 `!command` 注入
- [ ] `npm run check` 通过（无 TS 代码改动，不应受影响）
