---
topic: "agent-skills-learnings"
status: "draft"
date: "2026-05-01"
source: "addyosmani/agent-skills 对比分析"
---

# Agent-Skills 借鉴改进规划表

> 来源：与 addyosmani/agent-skills 的逐行对比分析
> 共 6 个 Spec，按优先级分为 P0（2 个）、P1（2 个）、P2（2 个）

---

## Spec 总览

| # | Spec 名称 | 优先级 | 类型 | 涉及文件数 | 预估工作量 | 依赖 |
|---|----------|--------|------|-----------|-----------|------|
| 1 | skill-behavioral-guardrails | P0 | 内容 | 17 个 SKILL.md | 1 个会话 | 无 |
| 2 | routing-assumptions | P0 | 内容 | 1 个 SKILL.md + 1 个 TS | 1 个会话 | 无 |
| 3 | build-discipline-enhancement | P1 | 内容 | 1 个 SKILL.md | 1 个会话 | Spec 1 |
| 4 | ship-gate-commit-verification | P1 | 架构+内容 | 2 个 SKILL.md + 1 个 TS | 1 个会话 | 无 |
| 5 | skill-composability | P2 | 架构 | 5+ 个 SKILL.md + references/ | 2-3 个会话 | 无 |
| 6 | state-resilience | P2 | 架构 | 3+ 个 TS 模块 | 2-3 个会话 | 无 |

---

## Spec 1：Skill 行为护栏（skill-behavioral-guardrails）

**优先级**：P0
**类型**：纯内容改动
**目标**：为所有 SKILL.md 增加反合理化表和反触发条件，直接对抗 Agent 跳步倾向

### 范围

| 改动项 | 涉及文件 | 内容 |
|--------|---------|------|
| 反合理化表 | 全部 17 个 SKILL.md | 每个 SKILL 增加 3-5 行的 Common Rationalizations 表，针对该阶段 Agent 最容易跳步的点定制借口与反驳 |
| 反触发条件 | 全部 17 个 SKILL.md | 每个 SKILL 的 Overview 后增加 `Not For` 段落（2-3 行），明确该 skill 不适用的场景 |

### 不做什么

- 不修改任何 TypeScript 代码
- 不改变 SKILL 的执行逻辑或流程
- 不增加新的门禁或检查点

### 验收标准

- [ ] 每个 SKILL.md 都有 Common Rationalizations 表（≥3 行）
- [ ] 每个 SKILL.md 都有 Not For 段落
- [ ] 反合理化内容针对该阶段定制，不是通用模板
- [ ] forge-test 已有的 §3.4 Rationalization Excuses Rebuttal 保持不变（不重复）
- [ ] contract.test.ts 通过（SKILL frontmatter 格式不变）

### 参考

- agent-skills 每个 SKILL.md 的 Common Rationalizations 表
- forge-test §3.4 已有的反合理化模式

---

## Spec 2：路由假设显式化（routing-assumptions）

**优先级**：P0
**类型**：内容 + 轻量代码
**目标**：路由分析时将 Agent 的隐式判断显式化，让用户在第一步就能纠正错误假设

### 范围

| 改动项 | 涉及文件 | 内容 |
|--------|---------|------|
| 路由输出增加假设段落 | `skills/forge-router/SKILL.md` | §2 路由分析输出模板中增加"假设"段落，列出 Agent 基于项目扫描做出的 3-5 条隐式判断，每条标注来源 |
| 假设写入 status | `skills/forge-router/SKILL.md` §5 | 假设列表写入 `.tinkerman/status.md` 的新字段 `assumptions`，下游 skill 可读取 |
| router.ts 增加假设类型 | `src/router.ts` | 路由结果类型增加 `assumptions: string[]` 字段 |

### 假设段落格式

```
假设：
  1. <判断内容>（基于 <来源>）
  2. <判断内容>（基于 <来源>）
  3. <判断内容>（基于 <来源>）
  → 如有不符请纠正
```

来源包括：package.json、项目路由扫描、现有代码模式、.tinkerman/config.md 技术栈、git log 等。

### 不做什么

- 不改变路由的档位判定逻辑
- 不增加新的门禁
- 不阻断流程（假设段落是信息性的，用户不纠正则按假设继续）

### 验收标准

- [ ] forge-router 输出包含假设段落
- [ ] 假设内容基于实际项目扫描，不是通用模板
- [ ] 每条假设标注来源
- [ ] 假设写入 status.md 的 assumptions 字段
- [ ] router.ts 的路由结果类型包含 assumptions 字段
- [ ] 现有路由测试不受影响

### 参考

- agent-skills using-agent-skills 的 "Surface Assumptions" 模式
- agent-skills spec-driven-development 的假设显式化流程

---

## Spec 3：Build 纪律增强（build-discipline-enhancement）

**优先级**：P1
**类型**：纯内容改动
**目标**：在 forge-build 中增加 6 项从 agent-skills 借鉴的工程纪律规则
**依赖**：Spec 1 完成后执行（避免同时修改 forge-build）

### 范围

| 改动项 | 位置 | 内容 |
|--------|------|------|
| 简洁性检查 | §4 TDD Iron Rules 后新增 §4.1 | GREEN 阶段要求最简实现，REFACTOR 阶段才引入抽象且仅当重复 3 次以上 |
| 三段式变更摘要 | §6 Execution Discipline 新增 §6.6 | Subagent 提交前输出：变更 / 未触碰（有意）/ 关注点 |
| Source-driven 规则 | §3.2 Subagent Instruction Construction 追加 | 涉及框架特定 API 时，先验证 API 签名与项目依赖版本一致 |
| Chesterton's Fence | Reflection Triggers 表追加 1 行 | 删除或大幅修改现有代码时触发理解检查 |
| 依赖纪律 | §6 Execution Discipline 新增 §6.7 | 添加新依赖前的 4 项确认清单 |
| Dead Code Hygiene | §4 TDD REFACTOR 步骤追加 | REFACTOR 后扫描孤儿代码，记录到 findings |

### 不做什么

- 不修改 TypeScript 代码
- 不改变 build 的执行路径或门禁逻辑
- 不增加新的 Subagent 或 Hook

### 验收标准

- [ ] forge-build SKILL.md 包含上述 6 项新增内容
- [ ] 每项内容有明确的触发条件和执行规则
- [ ] 不与现有 §6 Anti-drift Execution Guardrails 重复
- [ ] contract.test.ts 通过

### 参考

- agent-skills incremental-implementation 的 Rule 0 (Simplicity First)
- agent-skills git-workflow-and-versioning 的 Change Summaries
- agent-skills source-driven-development 的完整流程
- agent-skills code-simplification 的 Chesterton's Fence
- agent-skills code-review-and-quality 的 Dependency Discipline

---

## Spec 4：Ship 门禁 Commit 校验（ship-gate-commit-verification）

**优先级**：P1
**类型**：架构 + 内容
**目标**：确保 ship 阶段的 review 结果与当前代码一致，防止 review 后的代码变更逃逸检查

### 范围

| 改动项 | 涉及文件 | 内容 |
|--------|---------|------|
| Review 报告记录 commit hash | `skills/forge-review/SKILL.md` §9 | review 完成时在报告 frontmatter 中记录 `reviewed_at_commit` 字段（当前 HEAD hash） |
| Ship 门禁增加 commit 比对 | `skills/forge-ship/SKILL.md` §2 | Review Gate 增加第二步：比较 `reviewed_at_commit` 与当前 HEAD，diff 涉及项目代码 → 提示重新 review |
| ship.ts 增加校验函数 | `src/ship.ts` | 新增 `checkReviewFreshness(reviewedCommit, currentHead, diffFiles)` 纯函数 |
| review.ts 增加 commit 记录 | `src/review.ts` | review 报告生成时填充 `reviewed_at_commit` 字段 |

### 校验逻辑

```
1. 读取 .tinkerman/reviews/<topic>.md 的 reviewed_at_commit
2. 获取当前 HEAD commit hash
3. 如果相同 → 通过
4. 如果不同 → 计算 diff：
   - diff 仅涉及 .tinkerman/ 文件 → 通过（状态更新不影响代码质量）
   - diff 涉及项目代码 → ⚠️ 提示重新 review（不硬阻断，输出警告）
5. reviewed_at_commit 字段缺失 → 通过（向后兼容旧报告）
```

### 不做什么

- 不在 ship 阶段重新执行评审（不采用 agent-skills 的 fan-out 模式）
- 不硬阻断——只输出警告，用户可选择继续或重新 review
- 不修改 review 的执行逻辑

### 验收标准

- [ ] forge-review 生成的报告 frontmatter 包含 `reviewed_at_commit` 字段
- [ ] forge-ship 门禁检查包含 commit 比对步骤
- [ ] `checkReviewFreshness` 纯函数有属性测试
- [ ] 旧格式报告（无 reviewed_at_commit）不阻断 ship
- [ ] diff 仅涉及 .tinkerman/ 文件时不触发警告
- [ ] npm run check 通过

### 参考

- agent-skills shipping-and-launch 的 pre-launch checklist 思路（交付前全面检查）
- 但不采用其 fan-out 重新评审模式（与 Forge 有状态架构不匹配）

---

## Spec 5：Skill 可组合性（skill-composability）

**优先级**：P2
**类型**：架构
**目标**：将大型 SKILL 拆分为主体 + references，实现跨 SKILL 引用和 token 优化
**预估**：2-3 个会话

### 范围

| 改动项 | 涉及文件 | 内容 |
|--------|---------|------|
| forge-build 拆分 | `skills/forge-build/` | 主体精简到 ~150 行，拆出 `references/tdd-rules.md`、`references/closure-probes.md`、`references/context-budget.md`、`references/anti-drift.md`、`references/reflection-triggers.md` |
| forge-review 拆分 | `skills/forge-review/` | 主体精简到 ~120 行，拆出 `references/confidence-filtering.md`、`references/dedup-pipeline.md`、`references/quality-gate.md` |
| forge-plan 拆分 | `skills/forge-plan/` | 主体精简到 ~100 行，拆出 `references/atomic-task-format.md`、`references/prohibited-content.md` |
| 跨 SKILL 引用 | forge-debug、forge-test | 引用 forge-build 的 `references/tdd-rules.md` 而非重复描述 |
| 函数签名分离 | 所有含函数调用的 SKILL | 将 Function Call 签名移到 `references/function-contracts.md`，SKILL 主体只描述行为契约 |
| Persona 可覆盖声明 | forge-review、forge-decide | 显式声明用户可在 `.claude/agents/` 下定义同名文件覆盖默认评审标准 |

### 拆分原则

1. **主体保留**：Overview、执行流程、门禁检查、阶段转换、边界情况——Agent 每次都需要的编排逻辑
2. **References 拆出**：详细规则、格式模板、检查清单、函数签名——按需加载的参考材料
3. **引用方式**：主体中用 `→ 详见 references/tdd-rules.md` 指向，Agent 需要时读取

### 不做什么

- 不改变 SKILL 的执行逻辑
- 不修改 commands/forge.md 的分发机制
- 不引入新的加载框架（利用 Agent 的文件读取能力即可）

### 验收标准

- [ ] forge-build 主体 ≤ 200 行
- [ ] forge-review 主体 ≤ 150 行
- [ ] 所有 references 文件可被其他 SKILL 引用
- [ ] 函数签名不再出现在 SKILL 主体中
- [ ] contract.test.ts 更新并通过（验证 references 文件存在性）
- [ ] 拆分前后 SKILL 的行为完全一致（通过人工对照验证）

### 参考

- agent-skills 的 `references/` 目录模式（testing-patterns.md、security-checklist.md 等）
- Anthropic Agent Skills 规范的三层渐进式披露模型

---

## Spec 6：状态容错与自愈（state-resilience）

**优先级**：P2
**类型**：架构
**目标**：提高 Forge 状态系统的鲁棒性，减少状态文件损坏或不一致导致的流程阻断
**预估**：2-3 个会话

### 范围

| 改动项 | 涉及文件 | 内容 |
|--------|---------|------|
| 状态文件宽容解析 | `src/state.ts` | 读取状态文件时，缺失字段使用合理默认值而非报错。定义每个字段的默认值表 |
| 降级执行模式 | `src/skill-scheduler.ts` | 当前置阶段的输出文件缺失时，允许 skill 以降级模式执行（跳过依赖前一阶段输出的检查），输出 ⚠️ 警告 |
| 状态自愈 | `src/status-resolver.ts`（新增或扩展） | 检测到状态不一致时（如 phase=review 但无 progress 文件），尝试从 git log 和文件系统重建状态 |
| 渐进式披露基础 | `src/skill-loader.ts` | 为每个 SKILL 目录增加 skill.json metadata，skill-scheduler 可查询 skill metadata 辅助决策 |

### 容错规则

| 场景 | 当前行为 | 改进后行为 |
|------|---------|-----------|
| status.md 的 phase 字段缺失 | 报错或行为不确定 | 默认 "router"，输出 ⚠️ |
| progress 文件不存在但 phase=build | 阻断 | 降级：从 Plan 重建任务列表，输出 ⚠️ |
| review 报告 frontmatter 缺字段 | 解析失败 | 缺失字段用默认值（result="incomplete"），输出 ⚠️ |
| status.md 的 phase 值不在预期范围 | skill-scheduler 回退到 router | 保持现有行为（已合理） |
| config.md 格式损坏 | 阻断 | 使用内置默认配置，输出 ⚠️ |

### 不做什么

- 不改变正常流程的行为（容错只在异常情况下触发）
- 不自动修复状态文件（只重建内存中的状态，不覆盖磁盘文件）
- 不降低质量标准（降级模式输出警告，不跳过门禁）

### 验收标准

- [ ] 所有状态文件字段有定义的默认值
- [ ] skill-scheduler 在前置文件缺失时不崩溃
- [ ] 降级模式输出明确的 ⚠️ 警告
- [ ] 状态自愈逻辑有属性测试（模拟各种不一致场景）
- [ ] 正常流程的行为完全不变
- [ ] npm run check 通过

### 参考

- agent-skills 的无状态设计揭示的问题：有状态系统需要更强的容错
- Forge Loop 长时间无人值守运行中遇到的状态不一致场景

---

## 执行顺序建议

```
Phase 1（P0，可并行）
  ├── Spec 1: skill-behavioral-guardrails     ← 1 个会话
  └── Spec 2: routing-assumptions             ← 1 个会话

Phase 2（P1，Spec 3 依赖 Spec 1）
  ├── Spec 3: build-discipline-enhancement    ← 1 个会话（Spec 1 完成后）
  └── Spec 4: ship-gate-commit-verification   ← 1 个会话（可与 Spec 3 并行）

Phase 3（P2，独立推进）
  ├── Spec 5: skill-composability             ← 2-3 个会话
  └── Spec 6: state-resilience                ← 2-3 个会话（可与 Spec 5 并行）
```

总计：8-12 个会话，Phase 1 可在 1 天内完成。
