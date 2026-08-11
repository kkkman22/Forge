---
status: draft
feature: dead-code-assertion-gate
layout: requirements
created: 2026-06-26
tier: full
work_nature: feature
brownfield: true
import_source: ".forge/decisions/2026-06-26-arch-review-remediate-0626.md (T-01 reversal)"
triggered_by: "AI-审-AI 共享盲区 (arch-review-remediate-0626 7-round decide + T-01 reversal)"
related_adrs:
  - "ADR-0008 (code-slim-strategy)"
related_evolved_rules:
  - "R3 (Pack/Loader 约定差异必须有运行时验证) — 本 spec 是其延伸"
health:
  score: 0
  verdict: "pending"
---

# Requirements — Dead-Code Assertion Gate

## 目标

给"删除某 src 模块（主张它是死代码）"加一道**自动化实证门禁**，堵住 AI Agent（及人类）判定死代码时的一个结构性盲区：**只 grep `src/` 内部 import，漏看 test/ 通过公开 API 的使用 + packs/rules 数据目录的间接依赖**。

本 spec 直接源自 `arch-review-remediate-0626` 的 **T-01 反转**：`src/state-machine/` 被判为"零引用孤岛"（因 `grep "from.*state-machine" src/` 返回 0），build 阶段实证才发现它是 **pms pack 系统的核心引擎**——`test/pms-pack/integration.test.ts` 等通过公开 API 使用它，`packs/pms/` 下 4 个状态机 yaml 被加载验证。这个盲区贯穿了原架构报告 + 7 轮 decide 的所有 AI 视角（AI-审-AI 共享盲区），直到 build 阶段真实测试执行才打破。

机制：新增 `scripts/check-unused-module.mjs`，给定模块路径，扫描**四维依赖**（src import / scripts import / test 公开 API import / packs+rules 数据目录引用），任一命中即 exit 1 报告引用点。阻断型（误删是破坏性的）。

## 非目标

- **不做完整依赖图分析**（madge / dependency-cruiser 级别）——项目未装 madge，且 madge 默认不含 test/、不懂 packs 数据依赖（运行时 `readFileSync` 字符串拼接，静态分析看不到）。本 spec 用 grep 扫描器，够用且零依赖。
- **不替代 spec-check / quality-check subagent**——它是对"删除主张"的自动化事实核验，不是评审替代。
- **不自动清理模块**——脚本只验证主张（"真的是死代码吗"），不执行删除。
- **不占用 evolved-rules R15 名额**——本机制做成独立 check 脚本 + spec，承载力强于单条规则。R3（pack/loader 运行时验证）已部分覆盖"loader 返回空"，本 spec 聚焦"删除前验证"，是其延伸而非重复。
- **不（在本 spec）硬接 git hook**——触发用 evolved-rules Infra_Ref + build SKILL 约定（项目惯例：agent 主动调用）。hook 作为 Open Question 留给后续。

## 全局不变式（所有 REQ 必须满足，任一违反 = 阻断 ship）

| ID | 不变式 | 验证 |
|----|--------|------|
| INV-1 | 脚本只读，绝不删除/修改任何文件 | 代码审查 + 测试断言无写操作 |
| INV-2 | 不影响 dist-sync R1（src↔dist 同步契约） | `node scripts/check-dist-sync.mjs` 仍通过 |
| INV-3 | 误判为"非死代码"（false positive）远优于误判为"死代码"（false negative，导致误删）——脚本默认 fail-open（有引用即阻断删除） | 四维扫描任一命中 → exit 1 |
| INV-4 | 接入 `npm run check` 链后，现有 src/ 模块**不被误报**为死代码（脚本默认对无参数运行应跳过或只报 warning） | 现有测试全绿 |
| INV-5 | 每个改动验证：`npx tsc --noEmit && npx vitest run` 全绿 | bash exit 0 |

---

## REQ-01: 新增 `scripts/check-unused-module.mjs`（四维扫描）

**问题复现（T-01 案例）**：`src/state-machine/` 在 `grep "from.*state-machine" src/` 下返回 0（仅模块内部互引），看似孤岛。但真实使用链：
- **test 公开 API 使用**：`test/pms-pack/integration.test.ts:15-19` import `loadStateMachineDefinition`/`validateDefinition`/`deriveStatePropertyTests`（来自 `src/state-machine/index.ts:6-16` 公开 API 面）；`test/pack/zero-pack-invariant.test.ts:22` 同。
- **packs 数据依赖**：`packs/pms/state-machines/` 下 4 个 yaml（folio/room-status/housekeeping-task/reservation），被上述测试 `readFileSync` + `loadStateMachineDefinition` 加载验证（`test/pms-pack/integration.test.ts:26,101-118`）；`packs/pms/pack.yaml:11` 声明 `state_machines: ./state-machines`。
- **被忽略的间接线索**：`src/pack/types.ts:22` 的 `"state_machines"` category 字符串（pack 类型系统注册的数据目录类型，不产生 import）。

**Requirement**：
- WHEN 执行 `node scripts/check-unused-module.mjs <module-path>` THEN 脚本 SHALL 扫描四维依赖：
  1. **(a) src/ import**：grep `src/**/*.ts` 的 `from/import/require` 路径含模块名（排除模块自身内部互引）。
  2. **(b) scripts/ import**：grep `scripts/**/*.{mjs,sh,ts}` 的 import/require 含模块名。
  3. **(c) test/ 公开 API import**：先提取 `<module>/index.ts`（或模块入口）的 value export 符号（借鉴 `check-public-api.mjs:83-95` 正则），再 grep `test/**/*.ts` 是否 import 这些符号或模块路径。
  4. **(d) packs/rules 数据目录引用**：通过 `src/pack/types.ts` 的 category 字符串（如 `"state_machines"`）+ packs manifest（`packs/*/pack.yaml`）声明 + test/ 的 `readFileSync` 指向 packs/ 的间接引用判定。
- WHEN 任一维度命中 THEN 脚本 SHALL `exit 1` 并报告所有引用点（文件:行 + 命中类型）。
- WHEN 四维全无命中 THEN 脚本 SHALL `exit 0` 输出"no references found"。
- THE 脚本 SHALL 支持 `--help`（对齐项目 `validate-scripts-help.mjs` 惯例）。
- THE 脚本 SHALL 只读不写（INV-1）。

**Verify-By**: vitest（脚本行为测试，见 REQ-04）
**Evidence**：`scripts/check-unused-module.mjs` + `--help` 输出 + 四维命中/不命中用例。

---

## REQ-02: 接入 `npm run check` 链（阻断型 + skip 惯例）

**Requirement**：
- THE 脚本 SHALL 以阻断型（exit 1）接入 `package.json` 的 `check` 链（排链尾，参照 check-public-api/check-dist-sync 位置）。
- WHEN 无参数运行（`node scripts/check-unused-module.mjs` 无 module-path）THEN SHALL 跳过并 exit 0（避免对全库误报；INV-4）——本 check 在 `npm run check` 里是"工具就位"声明，实际验证由 build 阶段显式调用。
- THE 脚本 SHALL 支持 skip：`FORGE_SKIP_UNUSED_CHECK=1` 环境变量 OR commit message 含 `[unused-check-skip]` 标签（对齐 `check-dist-sync.mjs:92-108` 惯例）。Skip SHALL 在输出里 loudly warn。
- WHEN skip 触发 THEN exit 0 + warning，不阻断。

**Verify-By**: `npm run check` 全绿（脚本无参数时跳过）
**Evidence**：package.json check 链含本脚本；skip 用例测试。

---

## REQ-03: build 阶段触发约定（evolved-rules Infra_Ref + build SKILL）

**Requirement**：
- THE forge-build SKILL（`skills/forge/lib/build/`）SHALL 文档化：任何"删除 src 模块/文件"的任务，其 TDD RED 步骤**必须**在删除前先跑 `node scripts/check-unused-module.mjs <target>` 验证四维无引用。
- THE 本机制 SHALL 在 evolved-rules 的一条规则（建议更新 R3 的 Infra_Ref，或新增 Infra_Ref 指向本脚本）中作为基础设施被引用——注意 evolved-rules 已 14/15 满额，优先更新现有 R3 的 Infra_Ref 而非新增 R15。
- THE 约定 SHALL 明确：脚本判定"有引用"（exit 1）时，删除任务**必须**先解决引用（迁移消费者）或撤销删除主张（像 T-01 那样），不得用 `[unused-check-skip]` 强行跳过（skip 仅供紧急 hotfix 且需 PR 说明）。

**Verify-By**: 文档审查（build SKILL 含调用约定；evolved-rules Infra_Ref 指向脚本）
**Evidence**：build SKILL grep 命中本脚本；evolved-rules Infra_Ref 更新。

---

## REQ-04: T-01 反向回归 fixture（state-machine 判定为非死代码）

**Requirement**：
- THE 测试 SHALL 用 `src/state-machine/` 作为 fixture，断言脚本判定它**非死代码**（exit 1）并报告 test/ + packs/ 引用点。
- WHEN 对 `src/state-machine/` 运行脚本 THEN 输出 SHALL 至少包含：
  - (c) 维度命中：`test/pms-pack/integration.test.ts`、`test/pack/zero-pack-invariant.test.ts` 引用公开 API。
  - (d) 维度命中：`packs/pms/state-machines/` 下 yaml 被引用。
- THE 测试 SHALL 另含一个**真正的死代码** fixture（临时构造一个无任何引用的模块），断言脚本 exit 0。
- THE 测试 SHALL 覆盖 skip 机制（`FORGE_SKIP_UNUSED_CHECK=1` → exit 0 + warning）。

**Verify-By**: vitest
**Evidence**：`test/check-unused-module.test.ts`（RED→GREEN）：state-machine 非死代码 + 真死代码 fixture + skip。

---

## 验收标准（spec 级）

- [ ] 4 个 REQ 全部实现，各自 Evidence 齐全
- [ ] 全局不变式 INV-1 ~ INV-5 在最终 PR 全部满足
- [ ] `npx tsc --noEmit && npx vitest run` 全绿
- [ ] `npm run check` 含本脚本且全绿（无参数跳过）
- [ ] **T-01 反向回归**：`state-machine` 被正确判定为非死代码（堵住原盲区）
- [ ] build SKILL / evolved-rules 记录触发约定

## 依赖

- 无外部 spec 依赖。
- REQ-04 fixture 依赖 `src/state-machine/` 仍存在（若未来 state-machine 真被迁移/退役，需换 fixture）。
- REQ-02 接入 check 链依赖现有 `npm run check` 20 项不回归。
