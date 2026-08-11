---
feature: "external-review-remediate-tabbit"
date: "2026-06-23"
layout: tasks
kind: bugfix
brownfield: true
tier: full
work_nature: bugfix
---

# Tasks — External Review Remediate (Tabbit)

> TDD 顺序：每个 task 先写/改测试（RED）→ 实现（GREEN）→ 清理（REFACTOR）。逐任务原子提交。
> REQ 间无强依赖；REQ-01/02 共改同一解析器须同 Wave 内顺序执行。

## Overview

7 REQ 分 3 簇并行推进。Wave 内任务可同分支连续提交，Wave 间无阻断依赖（仅全局验证 Wave 串在最后）。

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "label": "guarded-merger 确定性（REQ-01 + REQ-02，同解析器合序）",
      "tasks": ["T1", "T2"]
    },
    {
      "wave": 2,
      "label": "安全健壮性三项（可并行）",
      "tasks": ["T3", "T5", "T6"]
    },
    {
      "wave": 3,
      "label": "可维护性与一致性（可并行）",
      "tasks": ["T4", "T7"]
    },
    {
      "wave": 4,
      "label": "全局验证 + dist 同步",
      "tasks": ["T8"]
    }
  ]
}
```

### Task Definitions

## T1: REQ-01 — guarded-merger 时间戳从文件内容解析（P1-1）

- **Goal**: 消除 tie-break 死逻辑，`completedAt` 取真实完成时间或确定性哨兵，移除 `Date.now()`。
- **Depends On**: —（Wave 1，须先于 T2 完成，因共改 `parseProgressTasks`）
- **TDD Steps**:
  - [ ] T1.1 RED：新增测试——两条 completed 任务含不同真实时间戳，断言较新者胜出；当前实现取 `Date.now()` 不可复现 → 红。
  - [ ] T1.2 RED：新增属性测试（fast-check）——同输入多次 `mergeProgressFile` 结果严格相等（捕获 Date.now 非确定性）。
  - [ ] T1.3 GREEN：`parseProgressTasks`（`src/guarded-merger.ts:165`）改为从行内容解析真实完成时间（格式由 Open Q1 定，与 conflict-resolver 写入端对齐）；读不到则置常量哨兵；`resolveProgressConflict` 对哨兵用确定性规则。
  - [ ] T1.4 REFACTOR：抽时间戳解析为独立小函数，保持解析器可读。
- **Verify Command**: `npx vitest run test/fix-conflicts-guarded-merge.test.ts`
- **Verify-By**: vitest:unit
- **Evidence**: 属性测试绿 + 时间戳决胜测试绿 + 现有 merge 用例全绿。
- **Definition of Done**: merge 路径 grep `Date.now()` 零命中（INV-5）；现有 merge 行为不退化。

## T2: REQ-02 — 解析失败显式告警，剔除 Math.random()（P1-2）

- **Goal**: 消除 `String(Math.random())` 兜底 id，改为显式告警 + 隔离。
- **Depends On**: T1（Wave 1，共改同一解析器）
- **TDD Steps**:
  - [ ] T2.1 RED：新增测试——喂入格式偏差行，断言 `warnings` 含可定位告警且结果可复现；当前实现随机 id → 红。
  - [ ] T2.2 RED：属性测试——同输入多次合并结果严格相等（与 T1.2 协同，覆盖 Math.random）。
  - [ ] T2.3 GREEN：`src/guarded-merger.ts:162` 与 `:188` 删除 `?? String(Math.random())`；解析失败行 `warnings.push(...)` + 隔离（原样附加末尾并标注，不进 merged Map）。
  - [ ] T2.4 验证 `src/conflict-resolver.ts`（唯一生产消费者）容忍 warnings 增多，无破坏。
- **Verify Command**: `npx vitest run test/fix-conflicts-guarded-merge.test.ts`
- **Verify-By**: vitest:unit
- **Evidence**: grep `Math.random` 在 guarded-merger 零命中（INV-5）；属性测试绿。
- **Definition of Done**: merge 结果完全可复现；格式漂移可见于 warnings。

## T3: REQ-03 — secret-redactor 补 PEM/JWT/小写 JSON（P1-3）

- **Goal**: 脱敏覆盖 PEM 私钥块、裸 JWT、小写 JSON 密钥字段。
- **Depends On**: —（Wave 2）
- **TDD Steps**:
  - [ ] T3.1 RED：新增三类样本测试——PEM 多行块、裸 JWT（`eyJ…` 三段式）、小写 JSON（`"apikey":"…"`）当前未被脱敏 → 红。
  - [ ] T3.2 GREEN：`src/secret-redactor.ts` 追加模式 (e) PEM 跨行、(f) 裸 JWT、(g) 小写 JSON alternation 扩展（复用 `i` 标志）。
  - [ ] T3.3 回归：现有 `test/secret-redactor.test.ts` 全套不变；确认 `triage-mcp-adapter.ts`/`bitbucket-mcp-adapter.ts` 消费者行为不受影响。
- **Verify Command**: `npx vitest run test/secret-redactor.test.ts`
- **Verify-By**: vitest:unit
- **Evidence**: 三类新样本脱敏为 `***`；现有 4 类回归全绿（INV-2）。
- **Definition of Done**: 脱敏覆盖常见密钥形态；现有语义零回退。

## T4: REQ-04 — 沙箱双轨语义文档收敛 + 迁移截止点 + CI 误用检测（P2-1）

- **Goal**: 消除 default-deny/allow 双轨认知陷阱，不削弱任何拦截。
- **Depends On**: —（Wave 3）
- **TDD Steps**:
  - [ ] T4.1 调研：grep legacy 消费者（`check-sandbox.ts`/`sdk-sandbox-policy.ts`）确认迁移范围；Decision_Point 确认本轮不做消费者迁移（另立 spec）。
  - [ ] T4.2 文档：`src/sandbox-policy.ts` 顶部写明"权威语义 = Phase 1 default-allow，legacy 仅供运行时强制层"；CHANGELOG/CONTRIBUTING 标注迁移截止版本。
  - [ ] T4.3 RED→GREEN：新增 lint 规则（`no-restricted-syntax` 禁新代码 import legacy 类型）或运行时 deprecation warn；附测试证明能捕获"混用"。
  - [ ] T4.4 回归：`checkFileAccess`/`checkNetworkAccess` 拦截逻辑与测试全绿（INV-2 不削弱）。
- **Verify Command**: `npm run lint && npx vitest run test/sandbox-policy.test.ts test/sandbox-policy.property.test.ts`
- **Verify-By**: vitest:unit
- **Evidence**: lint 规则可捕获 legacy 误用；现有拦截测试全绿。
- **Definition of Done**: 双轨语义有明确权威声明 + 截止点 + CI 可见检测。

## T5: REQ-05 — check-frozen 入口判定跨平台化（P2-2）

- **Goal**: Windows 下 CLI 钩子不再静默不执行 `main()`。
- **Depends On**: —（Wave 2）
- **TDD Steps**:
  - [ ] T5.1 调研：grep 项目其它 CLI 入口判定形式，取一致写法（Open Q2）。
  - [ ] T5.2 RED：新增测试——模拟 Windows 风格 `process.argv[1]`（盘符/反斜杠），断言入口判定为 true；当前字符串拼接比对 → false → 红。
  - [ ] T5.3 GREEN：`src/check-frozen.ts:162` 改为路径规范化比对（`pathToFileURL(resolve(argv1)).href === import.meta.url` 或等价）。
  - [ ] T5.4 回归：现有 check-frozen 测试全绿；`main()` 退出码语义不变。
- **Verify Command**: `npx vitest run test/check-frozen.test.ts`（或对应测试文件，plan 阶段确认）
- **Verify-By**: vitest:unit
- **Evidence**: Windows 风格路径判定为 true；Linux/macOS 现有行为不变。
- **Definition of Done**: 入口判定平台无关。

## T6: REQ-06 — 审计日志并发写加锁（P2-3）

- **Goal**: 复用 tool-health-writer 锁原语，消除 dispatch.log 并发撕裂。
- **Depends On**: —（Wave 2）
- **TDD Steps**:
  - [ ] T6.1 调研：确认 tool-health 锁（sync `O_EXCL`+spin）在 async `appendAuditLog` 内可用性（Open Q3）；不可用则提供 async 变体。
  - [ ] T6.2 RED：新增并发测试——多次并发 `appendAuditLog` 到同一文件，断言输出无交错行；当前 appendFile 可能撕裂 → 红。
  - [ ] T6.3 GREEN：抽取 tool-health 锁为可复用 helper；`appendAuditLog`（`src/forge-dispatcher/audit-log.ts:122`）在 append 前后包 acquire/release；锁超时降级 warn（对齐 fail-soft，不阻断）。
  - [ ] T6.4 回归：现有 `test/single-entry/audit-log.test.ts`、`audit-hmac.test.ts` 全绿；HMAC 链与 AuditEntry 结构不变。
- **Verify Command**: `npx vitest run test/single-entry/audit-log.test.ts test/single-entry/audit-hmac.test.ts`
- **Verify-By**: vitest:unit
- **Evidence**: 并发写无撕裂；锁超时降级不阻断分发。
- **Definition of Done**: 审计写串行化；fail-soft 语义保留。

## T7: REQ-07 — HINT_RULES 外置为数据（P3）

- **Goal**: `router.ts:374` 硬编码 HINT_RULES 抽为数据模块，`generateHints` 改加载+查询。超大文件拆分降级另立 spec。
- **Depends On**: —（Wave 3）
- **TDD Steps**:
  - [ ] T7.1 Decision_Point 确认：本轮只做 HINT_RULES 外置，超大文件拆分另立 spec。
  - [ ] T7.2 RED：新增等价性测试——对 representative taskType×phase 组合，记录当前 `generateHints` 输出为黄金值；外置后须严格相等。
  - [ ] T7.3 GREEN：抽取 HINT_RULES 为独立数据模块（参照 `src/router-intents.ts` 先例）；`generateHints`（`router.ts:674`）改为加载+查询。
  - [ ] T7.4 回归：router 全套测试全绿；"hints are ADDITIVE" 不变量（`router.ts:361`）保留。
- **Verify Command**: `npx vitest run test/router*.test.ts`（plan 阶段确认具体文件集）
- **Verify-By**: vitest:unit
- **Evidence**: 等价性测试——外置前后输出严格相等。
- **Definition of Done**: HINT_RULES 以数据承载；generateHints 输出契约不变。

## T8: 全局验证 + dist 同步

- **Depends On**: T1–T7 全部完成
- **Steps**:
  - [ ] T8.1 `npx tsc --noEmit` 通过（INV-3）。
  - [ ] T8.2 `npx vitest run` 全绿（INV-1/3）。
  - [ ] T8.3 `bash scripts/check-dist-sync.mjs` 通过（INV-4）；失败则 `npm run dist:resync`。
  - [ ] T8.4 grep 终检：`src/guarded-merger.ts` 无 `Date.now`/`Math.random`（INV-5）。
  - [ ] T8.5 每个任务（T1–T7）原子提交。
