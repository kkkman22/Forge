---
topic: "external-review-remediate-tabbit"
status: approved
date: "2026-06-23"
spec_ref: ".forge/specs/external-review-remediate-tabbit"
format: full
source: "Tabbit external review report (v3.7.1)"
---

# Plan: External Review Remediate (Tabbit)

> 7 项评审发现修复，全 TDD（RED→GREEN→REFACTOR），逐任务原子提交。详细任务分解见 spec `tasks.md`，本 plan 补充 File Mapping、Spec Coverage、执行顺序。

## File Mapping

| File | Action | Task |
|------|--------|------|
| `src/guarded-merger.ts` | MODIFY | T1, T2 |
| `test/fix-conflicts-guarded-merge.test.ts` | MODIFY | T1, T2 |
| `src/secret-redactor.ts` | MODIFY | T3 |
| `test/secret-redactor.test.ts` | MODIFY | T3 |
| `src/sandbox-policy.ts` | MODIFY | T4 |
| `src/check-sandbox.ts` | MODIFY (lint/consumer guard, 最小) | T4 |
| `biome.json` 或等价 lint 配置 | MODIFY (新增 legacy 误用规则) | T4 |
| `src/check-frozen.ts` | MODIFY | T5 |
| `test/check-frozen.test.ts`（或对应） | MODIFY | T5 |
| `src/tool-health-writer.ts` | MODIFY (抽取锁 helper) | T6 |
| `src/forge-dispatcher/audit-log.ts` | MODIFY | T6 |
| `test/single-entry/audit-log.test.ts` | MODIFY | T6 |
| `src/router.ts` | MODIFY | T7 |
| 新数据模块（HINT_RULES 外置） | CREATE | T7 |
| `test/router*.test.ts` | MODIFY (等价性测试) | T7 |

## Spec Coverage

| Spec Requirement | Covering Task |
|------------------|---------------|
| REQ-01 (guarded-merger 时间戳) | T1 |
| REQ-02 (Math.random 兜底) | T2 |
| REQ-03 (secret-redactor PEM/JWT) | T3 |
| REQ-04 (沙箱双轨语义) | T4 |
| REQ-05 (check-frozen 跨平台) | T5 |
| REQ-06 (审计日志并发锁) | T6 |
| REQ-07 (HINT_RULES 外置) | T7 |
| 全局不变式 INV-1~5 | T8 |

## 执行顺序

Wave 1（guarded-merger 确定性，同解析器合序）：T1 → T2
Wave 2（安全健壮性，可并行）：T3, T5, T6
Wave 3（可维护性，可并行）：T4, T7
Wave 4（全局验证）：T8

---

## T1: guarded-merger 时间戳从文件内容解析（REQ-01）

- **Operation**: MODIFY
- **Files**: `src/guarded-merger.ts`, `test/fix-conflicts-guarded-merge.test.ts`
- **Depends On**: —
- **TDD**:
  - RED: 新增测试——两条 completed 任务含不同真实时间戳，断言较新者胜出；当前实现取 `Date.now()` 不可复现 → 红。新增属性测试（fast-check）同输入多次合并结果严格相等。
  - GREEN: `parseProgressTasks`（`:165`）改为从行内容解析真实完成时间（格式 `@ <ISO>` 行尾），读不到置常量哨兵；`resolveProgressConflict` 对哨兵用确定性规则。
  - REFACTOR: 抽时间戳解析为独立小函数。
- **Verify**: `npx vitest run test/fix-conflicts-guarded-merge.test.ts`
- **DoD**: merge 路径 grep `Date.now()` 零命中（INV-5）；现有 merge 行为不退化。

## T2: 解析失败显式告警，剔除 Math.random()（REQ-02）

- **Operation**: MODIFY
- **Files**: `src/guarded-merger.ts`, `test/fix-conflicts-guarded-merge.test.ts`
- **Depends On**: T1
- **TDD**:
  - RED: 新增测试——格式偏差行，断言 `warnings` 含可定位告警且结果可复现；当前实现随机 id → 红。属性测试覆盖 Math.random 非确定性。
  - GREEN: `:162` 与 `:188` 删除 `?? String(Math.random())`；解析失败行 `warnings.push(...)` + 隔离（原样附加末尾并标注，不进 merged Map）。
  - REFACTOR: 抽隔离逻辑为独立小函数。
- **Verify**: `npx vitest run test/fix-conflicts-guarded-merge.test.ts`
- **DoD**: grep `Math.random` 在 guarded-merger 零命中（INV-5）；结果完全可复现。

## T3: secret-redactor 补 PEM/JWT/小写 JSON（REQ-03）

- **Operation**: MODIFY
- **Files**: `src/secret-redactor.ts`, `test/secret-redactor.test.ts`
- **Depends On**: —
- **TDD**:
  - RED: 新增三类样本测试——PEM 多行块、裸 JWT、小写 JSON（`"apikey"`）当前未被脱敏 → 红。
  - GREEN: 追加模式 (e) PEM 跨行、(f) 裸 JWT 三段式、(g) 小写 JSON alternation 扩展（复用 `i` 标志）。
  - REFACTOR: 无（仅追加正则）。
- **Verify**: `npx vitest run test/secret-redactor.test.ts`
- **DoD**: 三类新样本脱敏为 `***`；现有 4 类回归全绿（INV-2）。

## T4: 沙箱双轨语义文档收敛 + 迁移截止点 + CI 误用检测（REQ-04）

- **Operation**: MODIFY
- **Files**: `src/sandbox-policy.ts`, `biome.json`, 最小 `src/check-sandbox.ts`
- **Depends On**: —
- **TDD**:
  - RED: 新增测试——证明 legacy 误用（新代码 import legacy 类型）被 lint 规则捕获；当前无规则 → 红。
  - GREEN: `src/sandbox-policy.ts` 顶部写明权威语义声明；lint 配置新增 legacy 误用检测规则；CHANGELOG/CONTRIBUTING 标注迁移截止版本。
  - REFACTOR: 无。
- **Verify**: `npm run lint && npx vitest run test/sandbox-policy.test.ts test/sandbox-policy.property.test.ts`
- **DoD**: 双轨语义有权威声明 + 截止点 + CI 可见检测；拦截逻辑不削弱（INV-2）。

## T5: check-frozen 入口判定跨平台化（REQ-05）

- **Operation**: MODIFY
- **Files**: `src/check-frozen.ts`, 对应测试文件
- **Depends On**: —
- **TDD**:
  - RED: 新增测试——模拟 Windows 风格 `process.argv[1]`（盘符/反斜杠），断言入口判定为 true；当前字符串拼接比对 → false → 红。
  - GREEN: `:162` 改为路径规范化比对（`pathToFileURL(resolve(argv1)).href === import.meta.url`）。
  - REFACTOR: 无。
- **Verify**: `npx vitest run test/check-frozen.test.ts`（plan 阶段确认具体文件）
- **DoD**: 入口判定平台无关；`main()` 退出码语义不变。

## T6: 审计日志并发写加锁（REQ-06）

- **Operation**: MODIFY
- **Files**: `src/tool-health-writer.ts`, `src/forge-dispatcher/audit-log.ts`, `test/single-entry/audit-log.test.ts`
- **Depends On**: —
- **TDD**:
  - RED: 新增并发测试——多次并发 `appendAuditLog` 到同一文件，断言输出无交错行；当前 appendFile 可能撕裂 → 红。
  - GREEN: 抽取 tool-health 锁为可复用 helper；`appendAuditLog`（`:122`）包 acquire/release；锁超时降级 warn。
  - REFACTOR: 锁 helper 独立导出。
- **Verify**: `npx vitest run test/single-entry/audit-log.test.ts test/single-entry/audit-hmac.test.ts`
- **DoD**: 并发写无撕裂；fail-soft 语义保留；HMAC 链不变。

## T7: HINT_RULES 外置为数据（REQ-07）

- **Operation**: MODIFY + CREATE
- **Files**: `src/router.ts`, 新数据模块, `test/router*.test.ts`
- **Depends On**: —
- **TDD**:
  - RED: 新增等价性测试——对 representative taskType×phase 组合，记录当前 `generateHints` 输出为黄金值；外置后须严格相等。
  - GREEN: 抽取 HINT_RULES 为独立数据模块（参照 `src/router-intents.ts`）；`generateHints` 改加载+查询。
  - REFACTOR: 无。
- **Verify**: `npx vitest run test/router*.test.ts`
- **DoD**: HINT_RULES 以数据承载；generateHints 输出契约不变；"hints are ADDITIVE" 不变量保留。

## T8: 全局验证 + dist 同步

- **Operation**: VERIFY
- **Files**: —
- **Depends On**: T1, T2, T3, T4, T5, T6, T7
- **Steps**:
  - `npx tsc --noEmit` 通过（INV-3）
  - `npx vitest run` 全绿（INV-1/3）
  - `bash scripts/check-dist-sync.mjs` 通过（INV-4）；失败则 `npm run dist:resync`
  - grep 终检：`src/guarded-merger.ts` 无 `Date.now`/`Math.random`（INV-5）
  - 每个任务（T1–T7）原子提交
- **Verify**: `npm run check`
- **DoD**: 全部门禁通过。
