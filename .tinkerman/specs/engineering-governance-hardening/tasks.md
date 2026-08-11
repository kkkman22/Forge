---
feature: engineering-governance-hardening
layout: tasks
created: 2026-05-05
spec_ref: ".tinkerman/specs/engineering-governance-hardening/requirements.md"
---

# Implementation Plan: Engineering Governance Hardening

## Overview

分 3 个 phase 共 6 个需求落地。phase 内部按模块自底向上（类型 → 纯函数 → 集成 → 测试 → 文档）。每个顶级任务可独立发 PR，不产生大爆炸式合并。

## Tasks

- [x] 1. Phase 1.1 — ADR Registry (需求 1)
  - [x] 1.1 定义 ADR 类型与 frontmatter schema（`src/adr-registry.ts`）
    - 定义 `AdrFrontmatter` interface，包含 id / title / status / date / deciders / related_adrs / supersedes / superseded_by 字段
    - 定义 `AdrEntry` 扩展类型，增加 `filePath`
    - 实现 `parseAdrFrontmatter(content: string): AdrFrontmatter | null` 纯函数
    - _Requirements: 1.3_

  - [x] 1.2 实现 ADR 编号生成与加载（`src/adr-registry.ts`）
    - 实现 `loadAllAdrs(entries: string[], readFile)` 纯函数，扫描目录 + 解析 frontmatter
    - 实现 `nextAdrId(existing: AdrEntry[]): string` 纯函数，返回最大编号 +1，4 位零填充
    - 实现 `findRelatedAdrs(taskDescription, adrs, limit)` 纯函数，用 Jaccard 相似度匹配
    - 编写 property-based test：nextAdrId 严格递增、格式稳定、空输入返回 "ADR-0001"
    - _Requirements: 1.1, 1.2, 1.7_

  - [x] 1.3 实现索引渲染与 supersession 处理
    - 实现 `renderAdrIndex(adrs: AdrEntry[]): string` 纯函数，生成按 id 排序的 Markdown 表格
    - 实现 `applySupersession(newAdr, allAdrs): AdrEntry[]` 纯函数，返回需要更新 status 的 entry 列表
    - 编写 property-based test：renderAdrIndex 输出包含所有唯一 id、supersession 为可逆变换
    - _Requirements: 1.5, 1.6, 1.8_

  - [x] 1.4 集成到 `/forge decide` 流程
    - 修改 `src/decide.ts` 的 confirmDecision 末尾：调用 nextAdrId → 写 ADR 文件 → 更新 adr-index.md
    - 修改 `forge-decide/SKILL.md`：启动时调用 findRelatedAdrs 展示相关历史 ADR（最多 5 条）
    - 集成测试：end-to-end 运行 `/forge decide` 生成真实 ADR 文件并校验索引更新
    - _Requirements: 1.1, 1.5, 1.6, 1.7_

  - [x] 1.5 创建 ADR 模板与文档
    - 创建 `.tinkerman/decisions/ADR-TEMPLATE.md` 模板文件
    - 创建初始 `.tinkerman/knowledge/adr-index.md`（可为空表头）
    - 修改 `scripts/init.sh`：在项目初始化时复制模板
    - 将现有 `.tinkerman/decisions/` 下已有文件重编号为 ADR-NNNN 格式（若存在）
    - _Requirements: 1.9, 1.10_

  - [x] 1.6 更新保护区规则
    - 修改 `.tinkerman/config.md` 中的受保护区说明，显式列出 `.tinkerman/decisions/ADR-*.md`
    - 验证 PreToolUse Hook 对 ADR 文件修改路径的行为符合 guarded zone 语义
    - _Requirements: 1.9_

---

- [x] 2. Phase 1.2 — Security Signals (需求 6)
  - [x] 2.1 在 README 新增"安全与信任"章节
    - 在项目价值主张后、快速开始前插入新章节
    - 包含防御分层表格（5 层）：工具调用 / Shell 注入 / Prompt Injection / 依赖供应链 / 不变量
    - 链接到 SECURITY.md 和 CHANGELOG 的 [SECURITY] 条目
    - _Requirements: 6.1, 6.2_

  - [x] 2.2 创建或补全 SECURITY.md
    - 漏洞报告渠道（email 或 GitHub security advisory）
    - 响应 SLA：初步响应 ≤ 3 天，critical 修复 ≤ 14 天
    - 支持版本列表（当前 main + 前一个 minor）
    - CVE 记录格式模板
    - _Requirements: 6.3_

  - [x] 2.3 增强 CONTRIBUTING.md 的安全章节
    - 新增"安全贡献指南"小节
    - 密钥与 PII 处理规范：禁止在日志中回显、禁止 commit 到 git
    - Shell 命令构建规范：必须使用 `src/git-transaction.ts` 或等价 builder，禁止字符串拼接
    - 敏感信息过滤规则
    - 第三方依赖引入的审查清单（typosquatting 检查、license 兼容、维护状态）
    - 列出"修改需要 ADR"的高敏感文件（hooks.json、check-frozen.sh、prompt-defense-patterns.ts）
    - _Requirements: 6.6, 6.10_

  - [x] 2.4 CI 新增 security-audit job
    - 在 `.github/workflows/ci.yml` 增加 `security-audit` job
    - 运行 `npm audit --audit-level=high`，high/critical 漏洞导致失败
    - 编写 `scripts/check-deps.mjs`：依赖名称模式检查（typosquatting）、license 白名单
    - 每个 PR 触发 + main 分支每日定时扫描（cron）
    - _Requirements: 6.4, 6.5_

  - [x] 2.5 CHANGELOG [SECURITY] 标签规范
    - 修改现有 CHANGELOG：为历史安全修复条目加 `[SECURITY]` 前缀（如 v2.2.1 的审计修复）
    - 每条 [SECURITY] 条目关联至少一个 ADR 编号（补录 ADR-XXXX）
    - 在 CONTRIBUTING.md 说明 CHANGELOG 规范
    - _Requirements: 6.7, 6.8_

  - [x] 2.6 README 安全徽章
    - 加入 npm audit 通过状态徽章
    - 加入 CI security job 状态徽章
    - 加入 License 徽章（如未添加）
    - _Requirements: 6.9_

---

- [x] 3. Phase 2.1 — Prompt Defense (需求 5)
  - [x] 3.1 定义类型与威胁模式库（`src/prompt-defense-patterns.ts`）
    - 定义 `ThreatType`、`ThreatSeverity`、`Threat`、`ScanResult` 类型
    - 编写威胁模式库，至少 30 条：instruction_override ≥4、jailbreak ≥6、role_switching ≥4、context_manipulation ≥6、encoding_attack ≥2、pii_exposure ≥8
    - 每条模式有唯一 id、type、severity、baseConfidence、description
    - _Requirements: 5.3, 5.4_

  - [x] 3.2 实现 scanInput 纯函数（`src/prompt-defense.ts`）
    - 实现 `scanInput(text: string): ScanResult` 纯函数，遍历 PATTERNS 进行正则匹配
    - 计算 detectionTimeMs 使用 `performance.now()`
    - PII 类型的 `pattern` 字段返回模式 id 而非匹配内容，`location` 指向匹配位置
    - 严重度排序：critical → high → medium → low
    - _Requirements: 5.1, 5.2, 5.3, 5.12_

  - [x] 3.3 编写 property-based test
    - 良性样本集：至少 100 条日常开发描述，断言 `safe === true`
    - 恶意样本集：至少 50 条已知攻击模式，断言 `safe === false` 且类型正确
    - 性能测试：对 fast-check 生成的 ≤ 10KB 随机字符串 200 次迭代，`detectionTimeMs < 5`
    - fuzzing：任意输入不抛出异常
    - PII 回显测试：`ScanResult` 的任何字段不包含原始 PII 值
    - _Requirements: 5.8, 5.11, 5.12_

  - [x] 3.4 定义 PromptDefenseError
    - 在 `src/forge-error.ts` 增加 `PromptDefenseError` 子类
    - code: `PROMPT_DEFENSE_REJECTED`
    - 包含 threats 摘要（不含原文）
    - _Requirements: 5.6_

  - [x] 3.5 集成到 router
    - 修改 `src/router.ts` 的 `classifyTask()`：入口调用 `scanInput()`
    - critical 威胁抛 PromptDefenseError
    - high/medium 威胁转为 `prompt-defense-warning` tag 的 RouteHint
    - 更新 `router.property.test.ts`：验证恶意输入被拒绝、良性输入不受影响
    - _Requirements: 5.5, 5.6, 5.7_

  - [x] 3.6 将模式库加入冻结区
    - 在 `src/prompt-defense-patterns.ts` 文件头 frontmatter 添加 `status: locked`
    - 更新 `src/state.ts` 的 `getProtectionZone()` 逻辑，使 `src/prompt-defense-patterns.ts` 返回 frozen
    - 集成测试：验证修改该文件的 PreToolUse Hook 被阻断
    - _Requirements: 5.10_

  - [x] 3.7 使用 benchmark 锁定性能
    - 新增 `test/benchmarks/prompt-defense.bench.ts`，BUDGET 声明 `p99 < 5ms`
    - 在 CI 增加对 prompt-defense benchmark 的独立校验（关联需求 4）
    - _Requirements: 5.8_

---

- [x] 4. Phase 2.2 — Schema-driven Validation (需求 2)
  - [x] 4.1 引入 zod 依赖与 schema 目录
    - 在 `package.json` 的 dependencies 中加入精确版本的 zod
    - 验证 bundle size 增长 < 80KB（记录到 PR 描述）
    - 创建 `src/schemas/` 目录与 `src/schemas/index.ts` 出口
    - _Requirements: 2.1, 2.2_

  - [x] 4.2 实现 StatusFileSchema（`src/schemas/status-file.ts`）
    - 定义 `PhaseSchema`、`TierSchema`、`LoopFieldsSchema`、`StatusFileSchema`
    - 使用 `.passthrough()` 允许未知字段（兼容现有语义）
    - 导出 `StatusFile` 类型（`z.infer`）
    - 实现 `safeParse(raw: unknown): { value, errors }` 包装，错误不抛出
    - _Requirements: 2.3, 2.5, 2.6, 2.7, 2.10_

  - [x] 4.3 实现 ConfigFileSchema（`src/schemas/config-file.ts`）
    - 定义 `SecurityLevelSchema`、`KnowledgeLimitSchema`、`ConfigFileSchema`
    - 兼容现有 `.tinkerman/config.md` 的 frontmatter 字段
    - 导出 `ConfigFile` 类型
    - _Requirements: 2.4, 2.5_

  - [x] 4.4 迁移 state.ts 使用 schema（渐进）
    - `parseStatusFileGraceful()` 内部改用 `safeParse(StatusFileSchema)`
    - 保持函数签名与返回结构不变（shadow migration）
    - 新增 feature flag `FORGE_USE_ZOD_PARSER`（环境变量），默认 off，启用时走新路径
    - 在 property-based test 中对比新旧 parser 对同一输入的输出等价性
    - _Requirements: 2.8_

  - [x] 4.5 迁移 config-store.ts 使用 schema
    - 类似 state.ts 的迁移策略
    - 包括环境变量 override 的兼容
    - _Requirements: 2.8_

  - [x] 4.6 SchemaValidationError 与 forge-error 层次
    - 在 `src/forge-error.ts` 增加 `SchemaValidationError` 子类
    - code: `SCHEMA_VALIDATION_FAILED`
    - 消息格式：`field_path: message; field_path2: message2`
    - _Requirements: 2.6_

  - [x] 4.7 Property-based 测试
    - 对 StatusFileSchema：`fc.record(StatusFileArb).map(serialize).chain(safeParse)` 等价性
    - 对 ConfigFileSchema：同上
    - 对 passthrough 行为：任意未知字段存在时不抛错
    - _Requirements: 2.9_

  - [x] 4.8 后续 schema 迁移（第二批）
    - ReviewReport、PlanFile、SpecFile 的 schema 化
    - 作为后续单独任务，不纳入本次合并范围
    - _Requirements: 2.8_

---

- [x] 5. Phase 3.1 — Event Sourcing (需求 3)
  - [x] 5.1 定义 EventLogEntry 类型与序列化（`src/event-log.ts`）
    - 定义 `EventLogEntry` 接口
    - 实现 `buildEntry(runId, iteration, event, stateBefore, stateAfter, effects)` 纯函数
    - 实现 `serializeEntry(entry): string` 纯函数（单行 JSON）
    - 实现 `parseEventLog(jsonl: string): EventLogEntry[]` 纯函数
    - _Requirements: 3.1, 3.2_

  - [x] 5.2 实现 state hashing（`src/event-log.ts`）
    - 实现 `stableStringify(state: OrchestratorState): string` 纯函数（按 key 字典序）
    - 实现 `hashState(state): string` 纯函数，使用 node:crypto 的 SHA-256 前 16 位
    - Property test：同输入同输出、不同输入不同输出、key 顺序无关
    - _Requirements: 3.3_

  - [x] 5.3 实现 replay 纯函数
    - 实现 `replay(initial: OrchestratorState, events: EventLogEntry[]): OrchestratorState`
    - 对每条 entry 调用 `transition(state, event)`，不产生副作用
    - Property test：任意 entries，`hashState(replay(initial, entries))` 等于最后 entry 的 stateHashAfter
    - _Requirements: 3.8, 3.9_

  - [x] 5.4 扩展 OrchestratorEffect 增加 write_event_log
    - 在 `src/loop-types.ts` 增加 `{ type: "write_event_log"; entry: EventLogEntry }` 分支
    - 更新 `orchestrator.transition` 的 exhaustiveness check 不受影响（新 effect 由 driver 追加，非 transition 产生）
    - _Requirements: 3.4_

  - [x] 5.5 EffectExecutor 实现 write_event_log 处理
    - 在 `src/effect-executor.ts` 的 `executeEffect` 新增 case
    - 使用 `fs.appendFile` 追加一行到 `.tinkerman/runs/<runId>/events.jsonl`
    - 写失败时抛 ForgeError，但不触发 rollback 语义（日志失败不影响业务）
    - _Requirements: 3.1, 3.6_

  - [x] 5.6 集成到 SdkDriver
    - 在 `src/sdk-driver.ts` 的迭代主循环：每次 transition 后构建 EventLogEntry 追加到 effects
    - 确保 `runId` 在整个会话中稳定（已有 RunManager 提供）
    - Integration test：运行 forge-loop 1-2 轮 → 验证 events.jsonl 存在且格式正确
    - _Requirements: 3.1, 3.5_

  - [x] 5.7 Resume 校验
    - 修改 `src/run-manager.ts` 的 `resumeRun`：读 events.jsonl → replay → hash 比对 state-final.json
    - 定义 `EventLogReplayError`（code: EVENT_LOG_REPLAY_MISMATCH）
    - CLI 增加 `--force-resume` flag 允许跳过校验
    - Integration test：人为篡改 events.jsonl 后 resume 被拒绝
    - _Requirements: 3.7_

  - [x] 5.8 Retention 策略
    - 在 `.tinkerman/config.md` schema 中增加 `event_log_retention_days` 字段（默认 30）
    - 编写 `scripts/prune-event-logs.sh`：扫描 `.tinkerman/runs/`，删除超期目录
    - 在 `/forge learn` 收尾阶段可选调用 prune 脚本
    - _Requirements: 3.10_

  - [x] 5.9 更新保护区规则
    - 将 `.tinkerman/runs/` 归入开放区（Open zone）
    - 更新 `.tinkerman/config.md` 保护区说明
    - _Requirements: 3.11_

---

- [x] 6. Phase 3.2 — Performance Budgets (需求 4)
  - [x] 6.1 建立 benchmark 目录与运行配置
    - 创建 `test/benchmarks/` 目录
    - 在 `vitest.config.ts` 增加 `benchmark` 配置（include: `test/benchmarks/**/*.bench.ts`）
    - 在 `package.json` scripts 增加 `"bench": "vitest bench"` 和 `"bench:ci": "vitest bench --reporter=json"`
    - _Requirements: 4.1, 4.4_

  - [x] 6.2 编写 hot path benchmark 套件
    - `orchestrator-transition.bench.ts`：BUDGET p99 < 1ms
    - `state-parse.bench.ts`：BUDGET p99 < 5ms
    - `router-classify.bench.ts`：BUDGET p99 < 10ms
    - `context-budget.bench.ts`：serialize/deserialize round-trip BUDGET p99 < 2ms
    - `skill-loader.bench.ts`：BUDGET p99 < 20ms（含文件 IO）
    - `frontmatter.bench.ts`：BUDGET p99 < 1ms
    - 每个文件头部注释声明 BUDGET，在测试内通过 expect 断言（可选）
    - _Requirements: 4.2, 4.3_

  - [x] 6.3 CI benchmark job
    - 在 `.github/workflows/ci.yml` 新增 `bench` job（独立于 `test`）
    - 运行 `npm run bench:ci` 输出 JSON
    - 下载 main 分支 baseline artifact
    - 运行 `scripts/extract-bench-json.mjs` 比较，超过 20% 阈值失败
    - PR 评论显示对比表
    - _Requirements: 4.5, 4.6_

  - [x] 6.4 Baseline 更新机制
    - 新增 `.github/workflows/update-baseline.yml`：仅 main push 触发
    - 运行 benchmark → 输出 JSON → 调用 `scripts/append-baseline.mjs` 写入 `.tinkerman/knowledge/metrics.md`
    - 使用 `[skip ci]` commit 防止循环触发
    - Baseline 保留最近 90 天或 30 次运行
    - _Requirements: 4.7, 4.8_

  - [x] 6.5 结构化输出与表格渲染
    - `scripts/extract-bench-json.mjs`：解析 vitest bench JSON，输出结构化对比结果
    - `scripts/render-bench-markdown.mjs`：生成 Markdown 表格（用于 PR 评论）
    - 表格字段：benchmark / mean / p95 / p99 / ops-per-sec / budget status / vs baseline
    - _Requirements: 4.9_

  - [x] 6.6 回归测试
    - 构造测试分支：在 orchestrator.transition 引入 10x 延迟（人为 setTimeout）
    - 验证 CI bench job 正确失败
    - 合并此测试到 `.github/workflows/ci-smoke-test.yml` 或文档中
    - _Requirements: 4.6_

---

## Dependency Graph

```
Phase 1.1 (ADR) ──────┐
                      ├─> Phase 2.1 (Prompt Defense)
Phase 1.2 (Security) ─┘            │
                                   ├─> Phase 3.1 (Event Sourcing)
Phase 2.2 (Schema) ────────────────┤
                                   └─> Phase 3.2 (Perf Budget)
```

Phase 1.1 和 1.2 可并行。Phase 2.1 和 2.2 可并行（但都依赖 1.1 的 ADR 机制用于决策记录）。Phase 3.1 和 3.2 可并行。

## Success Criteria

- [x] 所有 6 个需求的验收标准通过
- [x] 新增依赖仅 1 个（zod），bundle size 增长 < 80KB
- [x] 现有 2751 个测试全部通过（当前 2979 个测试全部通过）
- [x] 新增至少 150 个测试（含 property-based）— 实际新增 228 个测试
- [x] CI pipeline 新增 2 个 job（security-audit、bench），通过时间 < 3 分钟
- [x] README 安全章节在首屏可见
- [x] ADR 索引可读、`/forge decide` 展示相关历史
- [x] Event log 可被 replay 验证
- [x] Benchmark baseline 在 main 分支每次合并后更新
