---
feature: "external-review-remediate-tabbit"
date: "2026-06-23"
layout: design
kind: bugfix
brownfield: true
tier: full
work_nature: bugfix
---

# Design — External Review Remediate (Tabbit)

> 范围限定为外部评审的 7 项发现修复。设计原则：最小改动、确定性优先、安全控制只增不减、复用已验证方案而非新造原语。
> 棕地信号：所有改动均有 Current State（`src/` 现有代码 file:line）+ Proposed Change。

## Overview

7 个 REQ 分布在 3 个簇：(A) guarded-merger 确定性（REQ-01/02，强耦合同文件同解析器）；(B) 安全健壮性（REQ-03 脱敏 / REQ-05 跨平台 / REQ-06 审计并发锁）；(C) 可维护性与一致性（REQ-04 沙箱语义 / REQ-07 文件拆分）。REQ 间无强依赖，可并行 Wave，仅 REQ-01/REQ-02 共改同一解析函数须合序。

## Current State（棕地模块全景）

| 文件 | 评审发现 | 关键行 |
|------|---------|--------|
| `src/guarded-merger.ts` | P1-1 / P1-2 | `:165` Date.now()；`:162/:188` Math.random()；`:170-175` tie-break |
| `src/secret-redactor.ts` | P1-3 | `:23/:26/:30-33/:36` 4 条正则，无 PEM/JWT |
| `src/sandbox-policy.ts` | P2-1 | `:28-33` 双轨注释；`:71/:112/:170/:220` @deprecated |
| `src/check-frozen.ts` | P2-2 | `:162` import.meta.url 字符串拼接比对 |
| `src/forge-dispatcher/audit-log.ts` | P2-3 | `:122` appendFile 无锁 |
| `src/router.ts` + `plan.ts` 等 | P3 | `router.ts:374` HINT_RULES 硬编码；多文件 26-35KB |

**消费者清单**（决定改动边界）：
- `guarded-merger` → 唯一生产消费者 `src/conflict-resolver.ts` + 测试
- `redactSecrets` → `src/triage-mcp-adapter.ts`、`src/bitbucket-mcp-adapter.ts` + 测试
- legacy sandbox（checkFileAccess/checkNetworkAccess/buildDefaultPolicy）→ `src/check-sandbox.ts`、`src/sdk-sandbox-policy.ts` + 测试
- `appendAuditLog` → 唯一生产消费者 `src/forge-dispatcher.ts` + 测试
- 数据外置先例：`src/router-intents.ts`（已存在，是 HINT_RULES 外置的参照）

## Proposed Change

### D1: REQ-01 — 时间戳改为从文件内容解析（确定性优先）

[现状] `parseProgressTasks` 对 completed 行取 `Date.now()` → tie-break 死逻辑。
[选择] 在 `- [x] <id>: <text>` 行格式**可选**追加真实完成时间（如行尾 `@ <ISO>` 或从 frontmatter），解析器优先读它；读不到则 `completedAt` 落为**常量哨兵**（如 `0`，表示"完成时间未知"），交由 tie-break 用确定性规则（未知时间者视为相等，回退"ours 优先"或按 id 字典序）决断。
[依据] 消除非确定性（INV-5）是铁律，Date.now() 必须从 merge 路径移除。向后兼容：无时间戳行回退为确定性的哨兵+规则，可观测行为不退化。
[风险] 现有进度文件不含时间戳格式 → 哨兵路径须被测试固化，避免"看起来还能 merge"掩盖退化。

### D2: REQ-02 — 解析失败显式告警，剔除 Math.random()

[现状] 正则不匹配时 `?? String(Math.random())`。
[选择] 解析失败行：`id` 置空/哨兵 + `warnings.push(\`unparseable line: <content>\`)`，该行**隔离**（不进 merged Map，原样附加到结果末尾并标注）。
[依据] 随机 id 使 Map 去重失效且不可复现；显式告警让格式漂移可见。隔离策略优于"伪造 id 全部保留"，因后者同样污染结果。
[约束] `conflict-resolver.ts` 调用方需容忍 warnings 增多（已是数组语义，无破坏）。

### D3: REQ-03 — 补 PEM/JWT/小写 JSON 三类脱敏模式

[现状] 4 条正则。
[选择] 追加 3 类：(e) PEM 多行块 `-----BEGIN [\w ]*PRIVATE KEY-----[\s\S]*?-----END [\w ]*PRIVATE KEY-----`；(f) 裸 JWT `eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`；(g) 小写 JSON 密钥字段扩展（`apikey|api_key|secret|private_key` 等加入模式 b 的 alternation，复用 `i` 标志）。
[依据] redactSecrets 用于工件/日志脱敏，纵深防御应覆盖常见密钥形态。PEM 用 `[\s\S]*?` 跨行；JWT 用三段式锚定 `eyJ` 前缀降低误报。
[明确不做] 不照搬报告失实的"违反文档承诺"论据（见 requirements REQ-03 修正）。不改动现有 4 条语义。

### D4: REQ-04 — 沙箱双轨语义：文档收敛 + 迁移截止点 + CI 误用检测

[现状] legacy default-deny 与 Phase 1 default-allow 共存于同模块，无迁移截止点。
[选择] **最小闭环**（推荐）：(1) 在模块顶部写明"当前权威语义 = Phase 1 default-allow（advisory），legacy 仅供 check-sandbox/sdk-sandbox-policy 运行时强制层使用"；(2) 给 legacy 导出加 lint 规则（如 `no-restricted-syntax` 禁止新代码 import legacy 类型）或运行时 deprecation warn；(3) 在 CHANGELOG/CONTRIBUTING 标注迁移截止版本。
[Decision_Point] 是否本轮完成 check-sandbox/sdk-sandbox-policy 的消费者迁移？默认**否**——迁移涉及运行时强制语义切换，风险高于 bugfix 范围，应另立 spec。本 REQ 只消除"认知陷阱"（文档+截止点+CI 可见），不削弱任何现存拦截。
[依据] INV-2 要求安全控制不削弱；双轨陷阱的根因是"认知"而非"拦截缺失"，文档+CI 检测即可解。

### D5: REQ-05 — 入口判定用 path 规范化比对

[现状] `import.meta.url === \`file://${process.argv[1]}\``（字符串拼接，Windows 失效）。
[选择] 改为 `pathToFileURL(resolve(process.argv[1])).href === import.meta.url`，或等价的 `fileURLToPath(import.meta.url) === resolve(process.argv[1])`。二选一取与项目其它入口判定一致的形式（plan 阶段 grep 确认）。
[依据] 路径规范化消除盘符/反斜杠/URL 编码差异。`main()` 退出码语义不变。

### D6: REQ-06 — 审计日志复用 tool-health-writer 的锁原语

[现状] `appendFile` 无锁；tool-health 已有 `acquireLockSync` + `O_EXCL` + stale 清理 + 超时。
[选择] 将 tool-health 的锁原语提取为可复用 helper（或 audit-log 直接 import），`appendAuditLog` 在 append 前后包 acquire/release。超时降级为 warn（对齐 audit 现有 fail-soft，不阻断分发）。
[依据] 复用已验证方案避免双原语（项目已为此付过 F8 的学费）。audit 是 fail-soft 设计，锁超时不应升级为阻断。
[风险] audit-log 是 async，tool-health 锁是 sync（`O_EXCL` + spin）→ 需在 design 确认 sync 锁在 async 函数内的可用性（Node 允许 async 函数内调 sync API，只是阻塞 event loop；audit 写入低频，可接受）。若不可接受则 plan 阶段提供 async 锁变体。

### D7: REQ-07 — HINT_RULES 外置为数据；超大文件拆分降级

[现状] `router.ts:374` 硬编码 HINT_RULES；多文件 26-35KB。
[选择] **最小闭环**（推荐）：只做 HINT_RULES 外置——抽取为独立数据模块（参照 `src/router-intents.ts` 先例），`generateHints` 改为加载+查询，附等价性测试。
[Decision_Point] 超大文件（plan/pua-engine/router/ship-gates/learn/state/status-file-ext）拆分是否纳入本轮？默认**否**——拆分是纯重构、高工作量、独立可验收，应另立 refactor spec。本 REQ 收敛到 HINT_RULES 单点。
[依据] HINT_RULES 外置是"配置即代码"膨胀的直接解，单点可独立验收；超大文件拆分收益分散，混入会拖慢 P1/P2 交付。

## Architecture

改动均为局部，不引入新跨模块抽象（D6 的锁 helper 复用除外）。不新增运行时依赖。

## Component Interfaces

- `redactSecrets(text)` 签名不变，仅内部正则增多。
- `mergeProgressFile`/`mergeInstinctsOrFailures` 的 `GuardedMergeResult` 接口不变（warnings 可能增多）。
- `appendAuditLog(entry, opts?)` 签名不变；锁超时通过现有 warn 通道，不抛新异常类型（或抛但由调用方 catch，对齐 fail-soft）。
- `generateHints` 输出契约不变（REQ-07 等价性）。

## Error Handling

- REQ-02 解析失败 → warnings（非抛错），保持 merge 不中断。
- REQ-04 legacy 误用 → lint error（CI 可见）或运行时 deprecation warn。
- REQ-06 锁超时 → warn + 继续写入（best-effort），不阻断分发，对齐现有 `appendAuditLog` 的 try/catch fail-soft。

## Testing Strategy

- 每个 REQ 先 RED（复现 bug 或编码非确定性），再 GREEN，再 REFACTOR。
- REQ-01/02 加**属性测试**（fast-check）：同输入多次合并严格相等（消除 Date.now/Math.random 非确定性）。
- REQ-03 加三类样本（PEM/JWT/小写 JSON）+ 现有 4 类回归。
- REQ-05 模拟 Windows 风格 argv 路径，断言规范化比对为 true。
- REQ-06 并发写撕裂测试。
- REQ-07 等价性测试：外置前后 `generateHints` 输出严格相等。
- 全局：`npx tsc --noEmit` + `npx vitest run` 全绿（INV-3）；`check-dist-sync.mjs`（INV-4）。

## Reversibility

- 每个 REQ 独立原子提交，可 `git revert` 单个。
- REQ-07 HINT_RULES 外置若引发回归，revert 后数据表仍可保留为参考。
- REQ-06 锁改动若引发分发阻塞，revert 回 appendFile（恢复 fail-soft 原状）。
- REQ-04 是文档+CI 规则，纯增量，revert 零副作用。

## Mount Points（挂载点，供回滚定位）

- `src/guarded-merger.ts`（D1/D2）
- `src/secret-redactor.ts`（D3）
- `src/sandbox-policy.ts` + lint 配置（D4）
- `src/check-frozen.ts`（D5）
- `src/forge-dispatcher/audit-log.ts` + `src/tool-health-writer.ts` 锁 helper 抽取点（D6）
- `src/router.ts` + 新数据模块（D7）

## Open Questions

1. REQ-01：真实完成时间在进度行里的承载格式（行尾 `@ ISO`？frontmatter？）—— plan 阶段定，需与 conflict-resolver 现有写入端对齐。
2. REQ-05：入口判定规范化形式二选一——取与项目其它 CLI 入口（如其它 hook 脚本）一致的形式，plan 阶段 grep 确认。
3. REQ-06：sync 锁在 async audit-log 内是否可接受，还是需 async 锁变体——plan 阶段验证。
