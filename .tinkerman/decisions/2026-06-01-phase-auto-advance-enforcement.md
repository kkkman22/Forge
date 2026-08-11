---
id: phase-auto-advance-enforcement
date: 2026-06-01
deciders: [product, architect, security]
status: pending
---

# Decision: Phase Auto-Advance Enforcement

## Context

AI 在 Forge 管道执行中两次发生"阶段停滞"：输出"✅ 阶段完成 → 自动进入"文字但未实际调用 `Skill(skill="forge", args="next")`。

根因分析确认这是系统性问题：
1. 铁律（§2.7）是纯文本约束，无运行时强制
2. 长会话后 AI 行为退化，丢失阶段推进约束
3. skill-scheduler.ts 是纯函数，只确定"应该做什么"不控制"实际执行"

## Options Evaluated

| 方案 | 描述 | 产品 | 架构 | 安全 |
|------|------|------|------|------|
| A: PostToolUse Hook | 检测 status.md phase 过渡，注入提醒 | ✅ 推荐 | ✅ 推荐 | ✅ 首选 |
| B: shared/next-step-protocol.md | 填补 CLAUDE.md §2.7 的幽灵引用 | ❌ 已失效两次 | ✅ 补充 | ⚠️ 无效 |
| C: PreToolUse Guard | phase 过渡后阻止非 Skill 调用 | ❌ 误报风险 | ❌ 脆弱状态 | ❌ DoS/竞态 |
| D: Scheduler 内置验证 | 修改 skill-scheduler.ts | ❌ 纯函数违规 | ❌ 不可协商 | ⚠️ 次选 |

## Decision

**采用 A+B 组合方案**。

### Layer 1: PostToolUse Phase Transition Detector (A)

**实现**：`scripts/phase-transition-guard.sh`
- 匹配：PostToolUse on Write/Edit，目标包含 `status.md`
- 逻辑：
  1. 读取当前 `.tinkerman/status.md` 的 `phase` 字段
  2. 比对 `/tmp/forge-last-phase-<task>` 中缓存的上一 phase
  3. 如果 phase 发生变化（且不是 → completed），输出结构性提醒
  4. 原子更新缓存文件
- 提醒内容：明确指令 `§2.7 铁律：phase 已从 X 过渡到 Y。必须立即调用 Skill(skill="forge", args="<next>")。不得输出过渡文字而不调用。`
- 失败模式：良性（漏触发回到现状，无破坏性）

### Layer 2: shared/next-step-protocol.md (B)

**实现**：创建 `shared/next-step-protocol.md`
- 填补 CLAUDE.md §2.7 的幽灵引用（文件不存在但被引用）
- 提供结构化的自动推进协议：原子动作要求、过渡映射表、违规形态清单
- 被 hook 提醒和 skill instructions 共同引用
- 虽然"纯文档已失效两次"，但 hook 提醒会引用此文档，形成双重保障

### Not Adopted

- **C (PreToolUse Guard)**：三位评审一致拒绝。exit 2 阻止能力过度授权，跨 hook 进程的状态文件有竞态条件，误触发会阻断所有操作。
- **D (Scheduler 内置验证)**：skill-scheduler.ts 是纯函数，添加验证层违反核心设计契约。
- **Stop hook exit 2**：hook-design-principles.md 明确规定 Stop hooks 不能阻塞（Can Block: No）。

## Consequences

- **正向**：phase 过渡后 AI 上下文收到结构性提醒，比 CLAUDE.md 静态文本更显眼
- **正向**：填补幽灵引用，消除文档一致性 gap
- **风险**：PostToolUse 提醒仍可能被 AI 忽略（但比纯文本约束可靠）
- **风险**：如果 status.md 被频繁写入（非 phase 变化的写入），可能产生噪音（通过"仅 phase 变化时触发"缓解）

## Implementation Scope

| 文件 | 动作 |
|------|------|
| `scripts/phase-transition-guard.sh` | 新建 |
| `.claude/settings.json` | 添加 PostToolUse hook 条目 |
| `shared/next-step-protocol.md` | 新建 |
| CLAUDE.md §2.7 引用 | 无需修改（已引用） |
| `test/` | hook 脚本测试 |
