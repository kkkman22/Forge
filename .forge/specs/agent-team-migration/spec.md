---
status: locked
created: "2026-04-29"
locked: "2026-04-29"
source: ".kiro/specs/agent-team-migration/requirements.md"
---

# Spec: Agent Team Migration

> 来源: `.kiro/specs/agent-team-migration/requirements.md`

## 需求清单

### R1: Review 评审迁移
- Review Engine 使用独立 Subagent（spec-check、quality-check、security-check）并行执行替代 Agent Team
- 轻量模式仅启动 quality-check 和 security-check
- 产出相同的 YAML frontmatter 报告格式
- Subagent 失败时不阻塞其他 Subagent
- 消除 Agent Team 清理步骤

### R2: Decide 决策迁移
- 两轮 Subagent 流程：Round 1 并行视角评估（product、architect、security、可选 designer），Round 2 Critic 交叉审查
- Critic 识别阻断问题时标记 `needs_revision`
- 产出相同的决策文档格式
- 保持 500-token 输出限制
- 消除 Agent Team 清理步骤

### R3: Build 研究阶段迁移
- 全量路径研究阶段使用独立 Subagent 并行执行
- 合并发现到 `.forge/findings/<topic>.md`
- Subagent 失败时不阻塞其他

### R4: SKILL 文档更新
- forge-review/SKILL.md: 替换 Section 2，移除 Team 启动/清理步骤
- forge-decide/SKILL.md: 替换 Section 2，更新为两轮 Subagent 模式
- forge-build/SKILL.md: 替换 Section 3.3 Phase 1 描述
- 保留所有非 Team 相关内容

### R5: 项目宪法和模板更新
- CLAUDE.md: 替换 "Agent Team 配置" 为 "Subagent 并行执行配置"
- CLAUDE.md Section 3.1: 更新描述
- templates/CLAUDE.md: 同步更新

### R6: 废弃配置清理
- 删除 `teams/` 目录
- 删除 `.claude/teams/` 目录
- 移除所有 Team 配置文件引用

### R7: Subagent 调用协议
- 统一的 SubagentInvocation 接口（prompt、permissionMode、maxTurns、agentType）
- 并行启动、Promise.allSettled 收集
- 输出格式验证
- 无 Team 生命周期管理

### R8: 向后兼容性
- 保持 merge pipeline 行为（置信度过滤 0.8、去重 ±3 行、一致性提升 +0.10）
- 保持报告质量门禁（6 项自检）
- 保持 P0/P1 ship 阻断
- 保持 veto 机制
- 保持 `involvesUIChanges()` 动态 designer 逻辑
- 保持 findings 输出格式

## 正确性属性

1. Review subagent selection: quality-check + security-check 始终包含，spec-check 仅当 hasSpec
2. Parallel fault tolerance: 成功结果全部保留，失败全部报告
3. Decide member selection: product + architect + security 始终包含，designer 仅当 UI 变更
4. Critic blocking → needs_revision
5. Invocation protocol completeness: 非空 prompt、有效 permissionMode、正 maxTurns、有效 agentType
6. Research findings merge completeness: 所有发现完整保留
