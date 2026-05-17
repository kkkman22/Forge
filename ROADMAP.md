# 🗺️ Forge 路线图

> 本文档描述 Forge 项目的演进方向。已完成版本的详细变更记录见 Git history 和 `.forge/archive/`。

---

## 已完成版本摘要

| 版本 | 日期 | 主题 |
|------|------|------|
| v2.1 | 2026-04-26 | Forge Loop 自主执行引擎、CI 加固、冻结文件硬阻断 |
| v2.1.1 | 2026-04-26 | CI Actions 升级 Node.js 24、Shellcheck 合规 |
| v2.2 | 2026-04-26 | parseListSection 修复、PBT、Forge Loop npm 发包 |
| v2.2.1 | 2026-04-28 | 上线前深度审核修复（H1-H6、M1-M11、L9/L14/L15） |
| v2.3 | 2026-04-28 | Loop × Skills 融合、平台抽象层、i18n、可观测性 |
| v2.4 | 2026-05 | Subagent 迁移、上下文预算、错误恢复、Plugin 分发、MCP Server |
| v2.5 | 2026-05 | 瘦身——recap/resume/abort/learn/review 委托官方原语 |

---

## v2.6 — skill 归位 + 数量精简（进行中）

> **战略定位**：Forge 站在 Claude Code 官方原语之上，只保留方法论差异化。

### 已完成

- ✅ **`forge-mutate` 归位到 pack** — `pack_conditional` frontmatter，仅在 pack 声明 `mutation_critical_modules` 时激活
- ✅ **`forge-accept` / `forge-verify` / `forge-ship` 职责明确化** — Gate 边界澄清 + 校验脚本
- ✅ **Skill 数量达标** — SST=22（目标 18-22），plugin.json 对齐真实命令集
- ✅ **使用率度量管线** — 已部署，正在收集数据

### 待评估（阻塞于 14 天使用率数据窗口）

- ⏳ **`forge-refactor` + `forge-fix` + `forge-fix-conflicts` 整合评估** — 三者命令序列相近，考虑合并为 `forge-maintenance` 单 skill 的三个子命令
- ⏳ **`forge-grill` / `forge-zoom-out` 使用率评估** — 跟踪实际调用频次，若低则并入 `decide` / `debug`

### 保持观察（v2.2.1 遗留低风险项）

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| L-10 | `stop_condition_met` 不增加 `currentIteration` | orchestrator.ts | stop 后循环立即终止，实际影响有限 |
| L-11 | router.ts 与 skill-scheduler.ts full 档位序列不一致 | router.ts, skill-scheduler.ts | 注释说明是设计意图 |
| L-12 | 孤儿导出函数 | router.ts, skill-scheduler.ts | 仅测试中使用 |
| L-13 | brownfield 提升逻辑被困 light 分支 | router.ts | brownfield 仅 light→standard |
| L-16 | AtomicTask 缺少 dependsOn 字段 | plan.ts | 无法表达任务间依赖 |

### 明确保留（不动）

- `skills/forge/lib/decide-teams/` — PoC 跟进 Agent Teams 趋势，每季度评估
- `cmux-skills/forge-loop-signals/` — opt-in 可视化，30 行声明式文件，零维护成本
- `/forge control-cli` + `/forge control-ui` — `/forge test` 三态验证体系的执行层
- `forge-storm` — `/forge spec` 的前置方法论能力，对 DDD 项目有独有价值
- `forge-pack-pms` — 在 `packs/` 目录，不是主包 skill

---

## 剩余中期项

- **Events_NDJSON 多消费者扩展**（优先级：中）
  - 当前：cmux Mirror_Daemon 单消费者
  - 目标：IDE 插件（VS Code 状态栏）、Web Dashboard、CI 集成报告器
  - 字节游标协议已就位，无需协议改动

- **cmux claude-teams 模式**（优先级：低，阻塞中）
  - 利用 cmux 多窗格为 `/forge decide` 和 `/forge review` 多 Subagent 提供可视化面板
  - 阻塞条件：等待官方 Agent Teams 可靠性问题解决（见 v3.0）

---

## 长期 — v3.0（社区与生态）

面向社区开放，构建可扩展的 AI 编码工作流生态。

- **Agent Teams 重新评估**（阻塞条件：Claude Code 官方解决以下问题）
  - 会话恢复：`/resume` 能恢复 in-process teammates（当前官方文档明确标注为已知限制）
  - 状态持久化：team config 在 context compaction 后不丢失（[#23620](https://github.com/anthropics/claude-code/issues/23620) Open）
  - Shutdown 可靠性：teammates 关闭不阻塞主流程
  - 内存 GC 不破坏 team membership（[#29271](https://github.com/anthropics/claude-code/issues/29271) Open）
  - SendMessage 接收者验证（[#25135](https://github.com/anthropics/claude-code/issues/25135) Open）
  - **跟进策略**：每季度检查上述 issues 状态
  - **回迁判定**：Agent Team 仅用于需要多轮持续对话的场景；fan-out → gather → merge 模式永久使用独立 Subagent

- **社区建设**
  - 贡献者指南完善和 issue 模板标准化
  - SKILL 插件机制：支持第三方开发和发布自定义 SKILL
  - 示例项目和最佳实践文档

- **沙箱执行环境**（已有雏形）
  - 当前：`check-sandbox.ts` + `sandbox-policy.ts` + `sdk-sandbox-policy.ts` 提供基础能力
  - 目标：细粒度的权限控制模型，替代 `bypassPermissions`

- **多 AI 平台支持**
  - 平台抽象层已就位（`AgentInterface`），当前只有 claude + mock 两个 adapter
  - 目标：添加 Codex / Gemini CLI 等 adapter，验证抽象层通用性

---

## Forge 的核心护城河（瘦身时不动的部分）

以下能力是 Forge 区别于 Claude Code 原生 + 其他 plugin 的真正差异化，任何瘦身决策都不影响这些：

1. **三维路由**（tier × type × phase）+ 自动降级
2. **TDD 铁律** — Plan 阶段强制嵌入 TDD 步骤 + hooks 强制执行
3. **Spec 锁定 + frozen zone 分级保护**（locked/approved/open 三级 + `FrozenZoneViolation`）
4. **五维度结构化 learn** — 跨项目经验库 + ADR
5. **Property-based Testing 文化** — 133 个 PBT 文件
6. **三层独立评审中的 Spec-alignment 层**
7. **Forge Loop 的工程纪律** — Git 事务、熔断器、指数退避、完成摘要、PUA 引擎
8. **Domain Pack 机制** — PMS pack 作为示例
9. **证据化三态验证**（VERIFIED / NOT_VERIFIED / INCONCLUSIVE）+ control-cli/ui 执行层
10. **事件风暴（storm）作为 `/forge spec` 的 DDD 前置**

---

*本路线图会随项目进展持续更新。具体排期和优先级可能根据社区反馈和实际需求调整。*
