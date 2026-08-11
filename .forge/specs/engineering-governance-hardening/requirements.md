---
status: completed
feature: engineering-governance-hardening
layout: requirements
created: 2026-05-05
tier: standard
---
# 需求文档：工程治理能力加固（Engineering Governance Hardening）

## 简介

基于对 Ruflo（原 Claude Flow）与 Forge 的代码级深度对比研究，从 Ruflo 的工程治理实践中提炼出 6 项与 Forge「纪律 + 简洁」定位相符、不破坏轻量架构、可用渐进方式落地的增强项。本 spec 将这 6 项能力作为一个整体的治理能力包规划，统一管理优先级与依赖关系。

**来源研究**：`.forge/findings/ruflo-comparison-research.md`（后续沉淀）。所有决策均避开 Ruflo 的规模派特性（swarm/federation/HNSW/Rust WASM/100+ agent 库），聚焦治理层。

**目标**：让 Forge 在保持 75 模块 / ~10K 单会话 token / 零重量级依赖的前提下，补齐架构决策留存、状态契约、调试回放、性能纪律、输入防御、安全信号 6 块工程治理拼图。

## 术语表

- **ADR**（Architecture Decision Record）：架构决策记录，单一不可变文档记录一次架构决策的 Context / Decision / Consequences
- **Schema-driven validation**：以 Zod schema 作为单一事实来源，同时驱动 TypeScript 类型生成与运行时校验
- **Event Sourcing**：将状态变化记录为不可变事件流，当前状态可由事件流重放得到
- **Performance budget**：为 hot path 设定的性能硬阈值，超阈值则 CI 失败
- **Prompt Injection**：通过用户输入注入的恶意指令（如 "Ignore previous instructions"、"Enable DAN mode"）
- **Threat pattern**：可被正则匹配或 AST 识别的输入威胁模式，含类型 / 严重度 / 置信度
- **CVE remediation**：对已知漏洞的修复记录，在 CHANGELOG 和 SECURITY.md 中显式可追溯

## 需求

### 需求 1：ADR 制度化（Architecture Decision Records）

**用户故事**：作为 Forge 维护者和贡献者，我希望架构决策有标准化的记录格式和索引机制，以便新成员能理解历史决策、避免重复讨论、防止决策在版本迭代中遗失。

#### 验收标准

1. WHEN `/forge decide` 生成决策文档时，THE decide SKILL SHALL 自动分配单调递增的 ADR 编号，格式为 `ADR-NNNN`（4 位数字，零填充）
2. THE ADR 文档文件名 SHALL 形如 `.forge/decisions/ADR-0042-spec-lock-mechanism.md`
3. THE ADR frontmatter SHALL 包含字段：`id`（string，形如 "ADR-0042"）、`title`（string）、`status`（enum: proposed / accepted / superseded / deprecated）、`date`（ISO 8601）、`deciders`（string[]）、`related_adrs`（string[]，可选）、`supersedes`（string，可选）、`superseded_by`（string，可选）
4. THE ADR 文档正文 SHALL 至少包含三个固定章节：`## Context`（决策背景）、`## Decision`（实际决策）、`## Consequences`（正面与负面影响）
5. THE `.forge/knowledge/adr-index.md` SHALL 作为所有 ADR 的聚合索引，列出每条 ADR 的 id / title / status / date / 所在文件路径
6. WHEN 新建或修改 ADR 时，THE `/forge decide` SHALL 自动更新 `adr-index.md`，不要求用户手动维护
7. WHEN `/forge decide` 启动时，THE decide SKILL SHALL 基于任务描述的关键词匹配，展示最多 5 条相关历史 ADR 的摘要，帮助用户感知已有决策
8. WHEN 一个 ADR 被取代（superseded）时，新 ADR SHALL 在 frontmatter `supersedes` 字段中引用旧 ADR 的 id，旧 ADR SHALL 被更新 `status: superseded` 且填入 `superseded_by` 字段
9. THE ADR 文档 SHALL 位于受保护区（Guarded zone），可追加但不得删除或覆盖，与现有 `.forge/decisions/` 保护策略一致
10. THE `.forge/decisions/` 目录下新增一个 `ADR-TEMPLATE.md` 文件，作为新建 ADR 的起始模板

---

### 需求 2：Schema-driven validation（状态文件契约自动校验）

**用户故事**：作为 Forge 维护者，我希望所有状态文件的契约由 Zod schema 定义并自动校验，以便减少手写 parser 的维护成本、避免字段漂移、为属性测试自动生成输入数据。

#### 验收标准

1. THE 项目 SHALL 引入 `zod` 作为运行时依赖，版本精确锁定（非范围），bundle size 增长不超过 80 KB（压缩后）
2. THE `src/schemas/` 目录 SHALL 作为所有 schema 的唯一存放位置
3. THE `.forge/status.md` 的 frontmatter 契约 SHALL 由 `src/schemas/status-file.ts` 的 Zod schema 定义
4. THE `.forge/config.md` 的 frontmatter 契约 SHALL 由 `src/schemas/config-file.ts` 的 Zod schema 定义
5. THE TypeScript 类型 SHALL 通过 `z.infer<typeof Schema>` 从 schema 推导，不得手写与 schema 重复的类型定义（单一事实来源）
6. WHEN 状态文件校验失败时，THE 错误消息 SHALL 指明具体字段路径、当前值、期望类型，使用 zod 的 `formatError()` 或等价格式
7. THE schema 校验 SHALL 兼容现有 `parseStatusFileGraceful` / `parseReviewReportGraceful` 的宽松解析语义（未知字段保留、类型错误降级为 undefined 或默认值）
8. THE 迁移 SHALL 按模块增量替换：先 `state.ts` 和 `config-store.ts`，其他 parser 分阶段迁移，避免一次性破坏
9. THE 每个 schema SHALL 至少伴随一个 property-based test，使用 fast-check 从 schema 采样生成输入，验证 `parse(serialize(x))` 等价于 `x`
10. THE schema 定义 SHALL 不包含任何副作用（无文件 IO、无全局状态），保持纯函数性质

---

### 需求 3：Event Sourcing（事件流审计与回放）

**用户故事**：作为调试者和审计者，我希望 forge-loop 的每次运行都有完整的事件流记录，以便回放运行轨迹、定位 bug、重现状态机转换、满足未来可能的合规审计需求。

#### 验收标准

1. THE forge-loop 每次运行 SHALL 在 `.forge/runs/<runId>/events.jsonl` 写入事件流（JSON Lines 格式，每行一个完整 JSON 对象）
2. THE 每条 `EventLogEntry` SHALL 包含字段：`timestamp`（ISO 8601 毫秒级）、`runId`、`iteration`、`event`（OrchestratorEvent discriminated union）、`stateHashBefore`（string）、`stateHashAfter`（string）、`effects`（OrchestratorEffect[]）
3. THE `stateHash` SHALL 为 `OrchestratorState` 字段的稳定序列化（按 key 字典序）的 SHA-256 哈希前 16 位十六进制
4. THE 事件流写入 SHALL 通过一个新的 `write_event_log` effect 类型完成，不破坏 `orchestrator.transition()` 的纯函数性质
5. WHEN `transition(state, event)` 返回时，THE 调用方 SHALL 将 event + before/after state hash 作为 write_event_log effect 追加到 effects 列表
6. THE `EffectExecutor` SHALL 实现 `write_event_log` 处理器，使用 append-only 方式写入 jsonl 文件
7. THE `forge-loop --resume <runId>` SHALL 能读取 events.jsonl，重放事件得到最后状态，若重放 state hash 与持久化 state hash 不一致，THE CLI SHALL 报错并拒绝恢复（防止状态漂移）
8. THE replay 函数 SHALL 为纯函数：`replay(events: EventLogEntry[]): OrchestratorState`
9. THE property-based test SHALL 验证：对任意事件序列 E，`replay(E)` 的最终 state hash 等于 E 最后一条 entry 的 stateHashAfter（即"事件流即事实"）
10. THE 事件流的保留策略 SHALL 由 `.forge/config.md` 的 `event_log_retention_days` 字段控制，默认 30 天，过期由 `/forge learn` 或单独的 `scripts/prune-event-logs.sh` 归档/删除
11. THE 事件流 SHALL 位于开放区（Open zone），AI 可自由修改（仅用于审计用途，非决策输入）

---

### 需求 4：Performance Budgets（性能预算与回归检测）

**用户故事**：作为性能敏感的工程师，我希望 Forge 的 hot path 有明确的性能预算和自动化回归检测，以便让"快"从宣传变成可度量的工程纪律。

#### 验收标准

1. THE 项目 SHALL 在 `test/benchmarks/` 目录下建立 benchmark 套件，使用 `vitest` 内置的 `bench` API（无需引入新依赖）
2. THE benchmark 套件 SHALL 覆盖以下 hot path 模块：`orchestrator.transition`、`state.parseStatusFileGraceful`、`router.classifyTask`、`context-budget` 的 serialize/deserialize 函数族、`skill-loader.loadSkillsFromDir`、`frontmatter` 正则解析
3. THE 每个 benchmark SHALL 在文件头部注释中声明明确的 performance budget（如 `// BUDGET: p99 < 1ms, ops/sec > 10000`）
4. THE `npm run bench` 脚本 SHALL 离线运行完整 benchmark 套件，输出每个测试的 mean / p50 / p95 / p99 / ops-per-second
5. THE CI pipeline SHALL 在独立的 `bench` job 中运行 benchmark，并与 `main` 分支的 baseline 结果比较
6. WHEN PR 的 benchmark 结果超过 main 基线 20% 以上时，THE CI SHALL 标记为 failure 并在 PR 评论中附明细
7. THE baseline 基线 SHALL 存储在 `.forge/knowledge/metrics.md` 的 `performance_baselines` 段中，由 CI 在 main 分支合并后自动更新
8. THE baseline 历史 SHALL 保留最近 90 天或最近 30 次运行，便于趋势分析
9. THE benchmark 结果 SHALL 输出为结构化 JSON（同时保留人类可读表格），供 CI 脚本解析
10. THE benchmark SHALL 不依赖任何外部服务、网络或 LLM 调用，纯 CPU-bound

---

### 需求 5：Prompt Injection Defense（输入威胁检测）

**用户故事**：作为 Forge 用户，我希望输入给 router 和 skills 的文本被自动扫描，拒绝 prompt 注入和角色切换企图，保护冻结区与代码库不被恶意诱导绕过。

#### 验收标准

1. THE `src/prompt-defense.ts` SHALL 作为新增模块，提供 `scanInput(text: string): ScanResult` 纯函数
2. THE `ScanResult` SHALL 包含字段：`safe`（boolean）、`threats`（Threat[]）、`detectionTimeMs`（number）
3. THE `Threat` SHALL 包含字段：`type`（enum: instruction_override / jailbreak / role_switching / context_manipulation / encoding_attack / pii_exposure）、`severity`（enum: critical / high / medium / low）、`confidence`（0-1）、`pattern`（匹配到的模式名）、`location`（{ start: number, end: number } 可选）
4. THE 威胁模式库 SHALL 至少包含 30 条正则规则，覆盖以下类别：
   - `instruction_override`：ignore / forget / disregard + previous/above/prior + instructions 组合（至少 4 条）
   - `jailbreak`：DAN / developer mode / bypass restrictions / unrestricted / no limits 等关键词（至少 6 条）
   - `role_switching`：You are now / Act as / Pretend to be / From now on you 等模式（至少 4 条）
   - `context_manipulation`：伪造 system: / <|system|> / [system] / ```system 等注入分隔符（至少 6 条）
   - `encoding_attack`：base64 / rot13 / hex encoded 等混淆声明（至少 2 条）
   - `pii_exposure`：email / SSN / credit card / API key（sk-ant-*, sk-*, ghp_*）等（至少 8 条）
5. THE `router.classifyTask()` 入口 SHALL 在任务描述分析前调用 `scanInput()`
6. WHEN 检测到 `severity === "critical"` 威胁时，THE router SHALL 拒绝任务，返回包含威胁类型与匹配位置的错误，任务不进入后续 skill 执行
7. WHEN 检测到 `severity === "high"` 或 `"medium"` 威胁时，THE router SHALL 在 `ClassificationResult.hints` 中添加一条 `tag: "prompt-defense-warning"` 的 RouteHint，下游 skill 可选择性处理
8. THE `scanInput` SHALL 在 ≤ 5 ms 内完成（p95，输入长度 ≤ 10KB），通过 Performance Budget 约束（关联需求 4）
9. THE `prompt-defense` 模块 SHALL 不引入任何运行时依赖（纯正则 + 标准库）
10. THE 威胁模式库文件 `src/prompt-defense-patterns.ts` SHALL 被加入 frozen zone 保护，修改模式需要通过 `/forge decide` 产生 ADR
11. THE property-based test SHALL 覆盖：所有良性输入样本（至少 100 条）的 `safe` 为 true；所有已知恶意样本（至少 50 条）的 `safe` 为 false 且检出正确类型
12. THE PII 检出 SHALL 不在日志或错误消息中回显原始匹配内容，仅回显类型和位置

---

### 需求 6：Security-First Mindset（安全信号前置与 CVE 可追溯）

**用户故事**：作为潜在用户、企业采用者、安全审计者，我希望能在 README 第一屏就看到 Forge 的安全姿态与防御能力，建立基本信任；同时希望每个安全修复都有清晰的公开追溯。

#### 验收标准

1. THE `README.md` SHALL 在项目价值主张之后、使用方法之前的位置，新增"安全与信任"章节，位置不晚于 README 第一屏（≤ 原第 3 章）
2. THE "安全与信任"章节 SHALL 至少列出以下防御能力：冻结区硬阻断（PreToolUse Hook）、Command Injection 预防（Git transaction builder）、Prompt Injection 防御（scanInput）、运行时依赖精确版本锁定、最小权限默认策略（acceptEdits mode）、属性测试驱动的不变量验证
3. THE 项目 SHALL 新增 `SECURITY.md` 文件（若已存在则补全），包含：漏洞报告渠道（email 或 GitHub security advisory）、响应 SLA（初步响应 ≤ 3 天 / 修复 critical ≤ 14 天）、支持版本列表、CVE 记录格式
4. THE CI pipeline SHALL 新增一个 `security-audit` job，执行以下检查：`npm audit --audit-level=high`（high/critical 漏洞失败）、package.json 新增依赖的典型字段审查（名称拼写、作者可信度、license 兼容性）
5. THE CI `security-audit` job SHALL 在每次 PR 运行，并在每日定时任务中对 main 分支重新扫描
6. THE `CONTRIBUTING.md` SHALL 新增"安全贡献指南"小节，涵盖：密钥与 PII 处理规范、shell 命令构建必须使用 `git-transaction.ts` 或等价 builder、日志与错误消息中的敏感信息过滤、第三方依赖引入的审查清单
7. THE `CHANGELOG.md` SHALL 使用 `[SECURITY]` 前缀标签突出标记安全修复条目，每条安全修复 SHALL 关联至少一个 ADR 或 issue 编号
8. THE 每个已修复的 CVE 或 GHSA SHALL 在 CHANGELOG 中有公开条目，标注编号、严重度、修复版本、影响范围
9. THE README SHALL 显示关键安全徽章：`npm audit` 通过状态、CI security job 状态、最近一次 security scan 的时间戳
10. THE 安全相关配置文件（`hooks/hooks.json`、`scripts/check-frozen.sh`、`src/prompt-defense-patterns.ts`）SHALL 在 `CONTRIBUTING.md` 中被列为"修改需要 ADR"的高敏感文件
