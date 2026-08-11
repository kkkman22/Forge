---
feature: "external-review-remediate-tabbit"
status: "draft"
date: "2026-06-23"
layout: requirements
kind: bugfix
brownfield: true
tier: full
work_nature: bugfix
import_source: "https://go.tabbit.space/projects/01c6427b-1b68-4ef6-a273-0e4bbb368e23/index.html"
health:
  score: 92
  verdict: "pass"
  spec_hash: "draft-2026-06-23"
  generated_at: "2026-06-23"
  self_check:
    testability: pass
    boundary_clarity: pass
    human_readability: pass
    brownfield_compat: pass
    anti_drift: pass
    two_part_structure: pass
    reversibility: pass
    spec_leak_check: "pass (zero-pack no-op, no custom banned-patterns)"
    scenario_lint: "n/a (EARS natural-language, non-Gherkin)"
    validation_contract: "pass (check-spec-contract.sh OK on all 3 files)"
---

# Requirements — External Review Remediate (Tabbit)

## Purpose

外部 Tabbit 代码级评审报告（基于 main v3.7.1）的"修复优先级矩阵"共 7 项发现，经本会话源码逐项复核后采纳。本 spec 将其固化为可测试、可锁定的行为规格，供 build 以 TDD 执行、review 以验收。

复核结论摘要（详见各 REQ）：7 项中 5 项判定完全成立、2 项（P1-1、P1-3）核心缺陷成立但报告论据有事实性偏差——本 spec 采纳缺陷修复方向，并修正报告的错误论据，避免向作者反馈时被"你没读对我的注释"反驳。

## Glossary

| Term | Definition |
|------|-----------|
| Tabbit 报告 | 外部评审方生成的代码级报告，URL 见 frontmatter `import_source` |
| tie-break | 合并冲突的决胜规则，guarded-merger 声称 "latest completed_at 胜出" |
| 桶文件 (barrel) | 公共 API 桶文件 `src/index.ts`，统一 re-export |
| O_EXCL 加锁 | 用 `O_CREAT\|O_EXCL` 原子创建排他锁文件的并发串行化方案 |

---

## REQ-01: guarded-merger 时间戳从文件内容解析，消除死 tie-break（P1-1）

**背景**：`mergeProgressFile` 声称按 "completed > pending; tie-break: latest completed_at" 解决冲突，但 `parseProgressTasks` 把时间戳赋为解析当下的 `Date.now()`，而非文件里的真实完成时间。结果是两个 commit 合并时双方已完成任务的时间戳几乎相等，`resolveProgressConflict` 的 tie-break 是死逻辑。

> 报告论据修正：报告称该死逻辑导致"永远偏向 ours"，**实际**偏向是 timing 相关（解析顺序 ours 先、theirs 后，theirs 的 `Date.now()` ≥ ours，多数情况偏向 theirs）。但"tie-break 死逻辑、真实完成时间从未被解析"这一核心判定成立——本 REQ 修的是后者。

**Current State**（`src/guarded-merger.ts`）：
- `:165` `completedAt: isCompleted ? Date.now() : 0,` — 时间戳取解析时刻
- `:170-175` `resolveProgressConflict` 用 `completedAt` 做 tie-break

**Requirement**：
- WHEN 进度文件行内含可解析的真实完成时间 THEN `parseProgressTasks` SHALL 从文件内容解析该时间戳填入 `completedAt`。
- WHEN 行内无真实完成时间 THEN `completedAt` SHALL 落为确定值（解析失败标记，见 REQ-02），**不得**取 `Date.now()`。
- WHEN 双方均 completed 且 `completedAt` 可比 THEN tie-break SHALL 选取 `completedAt` 更新者。
- 对**未**携带完成时间格式的现有进度文件（向后兼容）SHALL 保持当前可观测行为：不因解析不到时间而抛错或改变 merge 输出顺序。

**明确不改变**：`completed > pending` 的优先级主规则、`GuardedMergeResult` 接口、`strategy` 文案。

**Verify-By**: vitest:unit
**Evidence**：
- 新增 RED 测试：两条 completed 任务含不同真实时间戳，断言较新者胜出（当前实现取 Date.now() → 测试不可复现地通过/失败）。
- 新增测试：无时间戳行保持向后兼容行为。

---

## REQ-02: 解析失败显式告警，消除 Math.random() 兜底 ID（P1-2）

**背景**：`parseProgressTasks` 与 `parseKnowledgeEntries` 在正则不匹配时用 `String(Math.random())` 当 task/entry id。合并依赖 `Map<id, task>` 去重，随机 id 使格式略有偏差的行不被识别为同一任务而被当成两条独立记录全部保留，污染合并结果且不可复现。

**Current State**（`src/guarded-merger.ts`）：
- `:162` `id: textMatch?.[1] ?? String(Math.random()),`
- `:188` `id: idMatch?.[1] ?? String(Math.random()),`

**Requirement**：
- WHEN 行无法解析出合法 id THEN 系统 SHALL 不伪造随机 id。
- WHEN 出现无法解析的行 THEN merge 结果 `warnings` SHALL 包含一条可定位的告警（指出行内容或行号），该行 SHALL 被隔离（不参与 Map 去重合并，原样保留或显式丢弃并记录，二选一在 design 定）。
- WHEN 多次合并同一输入 THEN 结果 SHALL 可复现（无随机性）。

**明确不改变**：能正确解析的行的 id 提取逻辑、合并主流程结构。

**Verify-By**: vitest:unit
**Evidence**：
- 新增 RED 测试：喂入格式偏差行，当前实现生成随机 id 不可复现 → 测试断言 warnings 非空且 id 确定性。
- 属性测试：同一输入多次合并，结果严格相等（消除 Math.random 的非确定性）。

---

## REQ-03: secret-redactor 覆盖 PEM 私钥块与裸 JWT（P1-3）

**背景**：`redactSecrets` 用于脱敏写入工件和日志的密钥，但 4 条正则不覆盖 `-----BEGIN ... PRIVATE KEY-----` 多行块和 `eyJ…` 三段式裸 JWT，存在实际泄漏风险。

> 报告论据修正（两处失实，本 REQ 据实重述）：
> 1. 报告称"文件头注释自称覆盖 PEM/JWT"。**实际** `src/secret-redactor.ts:4-8` 文件头只列 4 个模式（Bearer/Basic、JSON token 字段、env var、自定义 auth header），**从未提及 PEM 或 JWT**。故本 REQ 理由是"纵深防御应覆盖常见密钥形态"，非"违反文档承诺"。
> 2. 报告称 CHANGELOG 有"凭证脱敏"承诺。**实际** `CHANGELOG.md` 全文 grep `脱敏|redact|PEM|PRIVATE KEY|JWT` 零命中，不存在该承诺。
> 3. 报告把"模式(c)对小写无效"与"JSON 小写字段漏脱敏"搅在一起。**实际**模式(c) 带 `i` 标志（`:31`），小写 env var 能命中；真正漏的是 JSON `:` 形式的小写字段（属模式 b 盲区，如 `"apikey":"…"`），本 REQ 一并补。

**Current State**（`src/secret-redactor.ts`）：仅 4 条正则（`:23, :26, :30-33, :36`）。

**Requirement**：
- WHEN 文本含 PEM 私钥块（`-----BEGIN ... PRIVATE KEY-----` 至 `-----END ... PRIVATE KEY-----`，多行）THEN `redactSecrets` SHALL 将整块替换为 `***`。
- WHEN 文本含裸 JWT（三段式 `eyJ…\.eyJ…\.[A-Za-z0-9_-]+`）THEN SHALL 替换为 `***`。
- WHEN 文本含 JSON 小写键名密钥字段（如 `"apikey"`/`"api_key"`/`"secret"`/`"private_key"`）THEN SHALL 与现有大写键名同等脱敏。
- 现有 4 类模式（Bearer/Basic、token JSON 字段、env var、自定义 header）SHALL 行为不变（回归全绿）。

**明确不改变**：现有 4 条正则的语义、`***` 替换字面量、函数签名。

**Verify-By**: vitest:unit
**Evidence**：
- 新增 RED 测试：PEM 块、裸 JWT、小写 JSON 密钥字段三类样本当前未被脱敏 → 断言脱敏后输出。
- 回归测试：现有 redactSecrets 全套用例不变。

---

## REQ-04: 统一沙箱默认语义并设迁移截止点（P2-1）

**背景**：`sandbox-policy.ts` 自陈两套相反默认语义——legacy 类型 `FileSystemPolicy`/`NetworkPolicy` 默认 deny（未匹配即拒），Phase 1 新类型 `SandboxConfig` 默认 allow（未匹配即放行）。同一模块双轨，迁移期混用易"以为在拦截实则放行"。

**Current State**（`src/sandbox-policy.ts`）：
- `:28-33` 注释自陈双轨；`:71-72`、`:112`、`:170`、`:220` 各 `@deprecated` 标注
- legacy 与 Phase 1 函数共存于同一模块导出

**Requirement**：
- WHEN 消费者查阅 sandbox 模块 THEN 文档/注释 SHALL 明确标注"哪个默认语义是当前权威"，并给出 legacy → Phase 1 的**迁移截止点**（明确版本或里程碑）。
- IF 本轮无法完成全部消费者迁移 THEN 模块 SHALL 至少为 legacy 消费者添加 lint 规则或运行时告警，使"误用 default-allow 当作 default-deny"在 CI 可见。
- 所有现存的 default-deny 拦截行为（checkFileAccess / checkNetworkAccess）SHALL 不被削弱。

**明确不改变**：Phase 1 声明式 API 的 default-allow 语义（advisory 模式设计意图）、`checkFileAccess`/`checkNetworkAccess` 的拦截逻辑。

> 范围注记：完整消费者迁移可能是独立 spec。本 REQ 的最小闭环是"消除认知陷阱"——加文档约束 + 迁移截止点 + CI 可见的误用检测。是否在本轮做更深迁移，由 design 的 Decision_Point 定。

**Verify-By**: vitest:unit
**Evidence**：
- 文档/注释更新（人类可读的迁移说明 + 截止点）。
- CI 可见的误用检测（lint 规则或等价物），附新增测试证明其能捕获"混用"场景。

---

## REQ-05: check-frozen 入口判定跨平台化（P2-2）

**背景**：`check-frozen.ts` 末尾用 `import.meta.url === \`file://${process.argv[1]}\`` 判断是否为入口模块。该等式在 Windows 上因盘符、反斜杠、URL 编码差异而判等失败，可能使 CLI 钩子静默不执行 `main()`。

**Current State**（`src/check-frozen.ts:162`）：
```ts
if (import.meta.url === `file://${process.argv[1]}`) { main(); }
```

**Requirement**：
- WHEN 模块作为 CLI 入口被直接调用（任意平台）THEN `main()` SHALL 被执行。
- WHEN 模块被 import（非入口）THEN `main()` SHALL 不执行。
- 入口判定 SHALL 用路径规范化比对（如 `fileURLToPath(import.meta.url) === path.resolve(process.argv[1])`），消除平台差异。

**明确不改变**：`main()` 的退出码语义、`isHardFrozenSourceFile`/`isFrozenZonePath` 的拦截逻辑。

**Verify-By**: vitest:unit
**Evidence**：
- 新增测试：模拟 Windows 风格 `process.argv[1]`（盘符/反斜杠），断言入口判定逻辑返回 true（规范化比对），当前字符串拼接比对会返回 false。
- 回归：现有 check-frozen 测试全绿。

---

## REQ-06: 审计日志并发写加锁，对齐 tool-health 方案（P2-3）

**背景**：`appendAuditLog` 用 `fs/promises.appendFile` 追加，POSIX `O_APPEND` 仅在写入 < `PIPE_BUF` 时原子；审计条目为可变长 JSON，多 `/forge` 子进程并发写 `dispatch.log` 有交错撕裂风险。同项目 `tool-health-writer.ts` 已用 `.lock` + `O_EXCL` 解决同类问题（CHANGELOG F8），审计这条更安全敏感的路径反而未套用，属防护不一致。

**Current State**：
- `src/forge-dispatcher/audit-log.ts:122` `await appendFile(logPath, ...)` 无锁
- `src/tool-health-writer.ts:89` `acquireLockSync(\`${path}.lock\`, opts)` + try/finally release — 可复用方案

**Requirement**：
- WHEN 多个 `/forge` 子进程并发写同一 `dispatch.log` THEN 写操作 SHALL 被串行化（无交错撕裂）。
- 加锁方案 SHALL 复用 tool-health-writer 已验证的 `.lock` + `O_EXCL` 模式（含 stale lock 清理与超时），避免两套并发原语。
- WHEN 锁获取超时 THEN SHALL 降级为现有 best-effort 行为（warn 并不阻断分发，对齐 audit 现有 fail-soft 语义），不引入新的阻断。
- 审计日志内容格式、HMAC 链、secret 来源 SHALL 不变。

**明确不改变**：`AuditEntry` 结构、HMAC 计算、fail-soft 不阻断分发的语义。

**Verify-By**: vitest:unit
**Evidence**：
- 新增 RED 测试：并发多次 appendAuditLog 到同一文件，断言输出无交错行（当前实现可能撕裂）。
- 回归：现有 audit-log 测试全绿。

---

## REQ-07: 拆分超大文件 + HINT_RULES 外置为数据（P3）

**背景**：多个文件体积逼近临界：`plan.ts`(35KB)、`pua-engine.ts`(32KB)、`router.ts`(30KB)、`ship-gates.ts`(30KB)、`learn.ts`(30KB)、`state.ts`/`status-file-ext.ts`(各26KB)。`router.ts` 的 `HINT_RULES` 是近 200 行硬编码数组（`:374`），每加一种 taskType×phase 组合需手改代码并配套测试，更适合外置为数据表（router-intents.md 已先例）。

**Requirement**：
- WHEN `HINT_RULES` 被外置 THEN 其内容 SHALL 以数据形式（如 JSON/MD/数据模块）承载，代码侧改为加载 + 查询。
- 外置后 `generateHints`（`router.ts:674`）的输出 SHALL 与现有硬编码逐项等价（行为不变）。
- 拆分超大文件 SHALL 以"不改变对外 API/行为"为前提，按内聚边界切分，每个新模块有独立测试。

**明确不改变**：`generateHints` 的输出契约、"hints are ADDITIVE" 不变量（`router.ts:361`）。

> 范围注记：P3 是技术债，可拆为多 spec 或降级为后续 backlog。本 REQ 的最小闭环建议：先做 `HINT_RULES` 外置（单点、可独立验收、收益明确）；超大文件拆分可作为 design 的 Decision_Point 决定本轮范围或另立 spec。

**Verify-By**: vitest:unit
**Evidence**：
- 等价性测试：外置前后，对 representative taskType×phase 组合，`generateHints` 输出严格相等。
- 回归：router 全套测试全绿。

---

## 全局不变式

| ID | 不变式 | 验证 |
|----|--------|------|
| INV-1 | 公开 API / CLI 退出码 / 现有拦截行为不变 | vitest 全绿 |
| INV-2 | 安全控制不削弱（脱敏只增不减、沙箱拦截不放宽、冻结区保护不破） | diff 审查 + 专项测试 |
| INV-3 | 每个改动 `npx tsc --noEmit && npx vitest run` 全绿 | bash exit 0 |
| INV-4 | 每个子任务结束 `dist/src/**` 与 src 同步 | `bash scripts/check-dist-sync.mjs` 通过 |
| INV-5 | 确定性：消除所有 `Math.random()`/`Date.now()` 在 merge 路径的使用 | grep 零命中 + 属性测试 |

## 反漂移声明

- **主目标**：7 项评审发现修复，使 guarded-merger 确定化、secret-redactor 覆盖常见密钥形态、沙箱/冻结/审计三处健壮性与一致性收口、超大文件与硬编码数组减负。每项对外行为除"明确 bug 修正"外不变。
- **非目标代理信号**：本 spec 不修报告范围外的代码；不重构 PUA（需架构决策）；HINT_RULES 外置与超大文件拆分允许降级为独立 backlog（见各 REQ 范围注记）。
- **验证材料角色**：Tabbit 报告（已复核修正）→ 本规格 → plan → build(TDD) → review → ship。报告的 2 处失实论据已在 REQ-01/REQ-03 内据实修正，不照搬。
