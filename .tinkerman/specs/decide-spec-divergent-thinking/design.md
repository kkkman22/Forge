---
feature: decide-spec-divergent-thinking
layout: design
created: 2026-06-04
---

# Design Document: Decide/Spec Divergent Thinking

## 一、为什么不新增 `/forge brainstorm` 命令

CE 有独立的 `/ce-brainstorm` 命令，在 plan 之前用于需求发现。Forge 不走这条路，三个理由：

1. **认知负担**：Forge 已有三档路由 + 21 个子命令。多一个入口 = 多一层"我该用哪个？"的犹豫
2. **集成优势**：把问题重构嵌入 decide/spec 内部，**保证每次都执行**（Full tier 强制），而不是依赖用户记住"先 brainstorm 再 decide"
3. **CE 自己也发现**：brainstorm 的核心价值不是产出文档，而是那 3–5 个提问。如果提问能直接嵌入 decide/spec，就不需要独立的产出物

---

## 二、变更剧本

### 剧本 A — `/forge decide` 的重构改变了方向

**pre-change**（今天的 Forge）：

```
用户: /forge decide "是否引入 Redis 做缓存层"

→ 5 个 reviewer 立即分析 Redis vs Memcached vs in-memory cache
→ ADR 产出："引入 Redis，预计性能提升 3x"
→ 3 周后发现：瓶颈不在缓存，在 N+1 查询
```

**change**（本 spec 落地后）：

```
用户: /forge decide "是否引入 Redis 做缓存层"

→ Reframing Gate:
  Q1: "你确定瓶颈在数据获取速度吗？有没有 profile 过？"
  用户: "没有 profile 过，但感觉慢"

→ AI 建议: "建议先 profile，确认瓶颈是查询还是序列化或网络。
            如果是 N+1 查询，索引优化可能比缓存更有效且更简单。"

→ 用户决定: 先跑 profile，再决定

→ 最终 ADR: "先做性能 profile（ADR-015），
            待确认瓶颈后再决定缓存策略"
```

**效果**：避免了引入 Redis 的运维复杂度，因为问题本身是错误的。

### 剧本 B — `/forge spec` 的澄清发现了隐藏约束

**pre-change**：

```
用户: /forge spec "用户数据导出功能"

→ 直接进入模板化需求
→ 需求文档产出，没有提到合规
→ 实现后法务团队提出: "导出需要审计日志，满足 GDPR 要求"
→ 需要重做
```

**change**：

```
用户: /forge spec "用户数据导出功能"

→ Clarification Gate:
  Q1: "这个功能的核心用户价值是什么？"
  用户: "合规团队需要审计用户行为数据"
  Q2: "有监管合规要求吗？"
  用户: "是的，GDPR，需要审计日志和用户同意追踪"

→ 需求文档立即包含:
  R1: 用户数据导出（含审计日志）
  R2: 用户同意追踪
  R3: 数据脱敏规则
```

**效果**：一次 spec 就覆盖了合规需求，避免了返工。

### 剧本 C — Light tier 跳过，不增加延迟

```
用户: /forge decide "变量命名用 camelCase 还是 snake_case"
→ tier = Light
→ 跳过 Reframing Gate
→ 直接进入 5 视角分析
→ 3 秒内出结果
```

---

## 三、问题选择算法

### Reframing Gate（decide）

```
IF 决策题包含具体方案关键词（"引入"、"迁移"、"切换"、"使用 X"）
   AND 不包含问题关键词（"太慢"、"出错"、"不够"）
   → 触发"问题替代"问题："你确定这是正确的问题吗？"

IF 决策涉及 ≥3 个文件或新依赖
   → 触发"约束揭示"问题："有什么隐藏约束？"

IF 决策有明显的成本选项（如"自建 vs SaaS"、"重写 vs 迁移"）
   → 触发"代价校准"问题："你愿意承受多大代价？"

MAX 3 个问题，优先级: 问题替代 > 约束揭示 > 代价校准
```

### Clarification Gate（spec）

```
IF spec 主题包含"功能"、"特性"、"新增"
   → 必问"用户价值"问题

IF charter 不存在 OR charter 无排除范围章节
   → 问"边界条件"问题

IF spec 主题涉及外部交互（API、服务、数据库）
   → 问"依赖关系"问题

IF 以上都已覆盖
   → 问"成功标准"或"替代方案"问题

MAX 5 个问题，已回答的维度不重复
```

---

## 四、Blueprint Delta

### 修改文件

| 路径 | 改动 |
|------|------|
| `.claude/agents/forge-decide-lead.md` 或 decide skill | 增加 Reframing Gate 阶段 |
| `skills/forge-spec/SKILL.md` 或 spec skill | 增加 Clarification Gate 阶段 |
| `skills/forge/SKILL.md` | 增加 `--no-reframe` flag 路由 |
| `CLAUDE.md` | §2 增加 Reframing/Clarification Gate 说明（≤5 行） |

### 文件数净变化

- 新增：0 个
- 修改：4 个
- 删除：0 个

---

## 五、设计决策

### D1 — 为什么用 Gate 而非独立阶段？

**选择**：嵌入 decide/spec 开头的 Gate（1–3 分钟）

**理由**：
- 独立阶段（如 CE 的 brainstorm）需要用户主动执行，有"忘记做"的风险
- Gate 是自动的，用户只需回答或跳过
- Gate 的成本极低（1–3 个问题），不增加 ceremony
- Full tier 强制执行，Standard tier 默认执行

### D2 — 为什么 Light tier 完全跳过？

**选择**：Light tier 不触发 Gate

**理由**：
- Light tier 的定义是"影响文件 ≤1 且改动 ≤20 行"
- 这种规模的问题不需要重构——问题通常很明确
- 用户选择 Light tier 就是在说"小改动，快速处理"

### D3 — 为什么 max 3 个问题（decide）和 5 个（spec）？

**选择**：decide ≤3, spec ≤5

**理由**：
- decide 的重构是"你确定这是正确的问题吗？"——3 个问题足够
- spec 的澄清需要覆盖更多维度（用户价值、边界、成功标准、依赖、替代方案）——5 个问题
- 超过这个数量用户会开始跳过，失去价值
- CE 的 brainstorm 也是"一次一个问题"的原则
