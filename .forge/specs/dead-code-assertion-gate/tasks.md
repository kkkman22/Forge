---
feature: dead-code-assertion-gate
layout: tasks
created: 2026-06-26
tier: full
work_nature: feature
brownfield: true
---

# Tasks — Dead-Code Assertion Gate

## Overview

4 个 REQ 拆为 6 个任务，分 3 波。核心约束：纯新增工具（无对外行为变化）、fail-open（有引用即阻断删除）、零新增依赖（grep 扫描器）、全程 TDD。

任务围绕 T-01 反向回归展开——state-machine 必须被正确判定为非死代码，这是本 spec 存在的验证锚点。

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["T-01", "T-04"], "parallel": true, "note": "脚本骨架（四维扫描）+ state-machine fixture 测试（RED 驱动）" },
    { "wave": 2, "tasks": ["T-02"], "parallel": false, "note": "接入 check 链 + skip 机制（依赖 T-01 脚本存在）" },
    { "wave": 3, "tasks": ["T-03"], "parallel": false, "note": "build SKILL + evolved-rules Infra_Ref 触发约定" }
  ]
}
```

依赖：T-02 depends T-01（脚本先存在）；T-03 独立（文档）；T-04 驱动 T-01（RED 先行）；T-05/T-06 收尾。

---

## Task Definitions

### T-01 新增 `scripts/check-unused-module.mjs`（四维扫描骨架）

- **Goal**: 实现四维扫描 check 脚本，给定模块路径判定是否死代码（有引用 → exit 1）。
- **REQ**: REQ-01
- **TDD Steps**:
  - RED: `test/check-unused-module.test.ts` 先写——(a) 真死代码 fixture（tmpdir 构造无引用模块）→ exit 0；(b) `--help` → exit 0 含 usage。此时脚本未建，import 失败。
  - GREEN: 实现 `scripts/check-unused-module.mjs`：
    1. 解析 module-path（目录/文件）→ 定位 entry（目录优先 index.ts）。
    2. `extractExports(entry)`（借鉴 check-public-api.mjs:83-95 正则）提取 value export 符号集。
    3. 四维扫描：`scanImports("src")` + `scanImports("scripts")` + `scanTestPublicApiUsage("test")` + `scanDataDirUsage()`（启发式，见 design Open Question 1）。
    4. 任一命中 → 报告引用点（文件:行 + 维度）+ exit 1；全无 → exit 0。
    5. `--help` 输出 usage。
  - REFACTOR: 抽 scan 函数为可单测纯函数。
- **Verify Command**: `node scripts/check-unused-module.mjs --help && npx vitest run test/check-unused-module.test.ts`
- **Definition of Done**: 脚本存在；`--help` 规范；真死代码 fixture exit 0；只读不写（INV-1）。
- **Depends On**: 无
- **风险**: 中（第四维启发式判定边界——见 Open Question 1，先宽匹配）

### T-02 接入 `npm run check` 链 + skip 机制

- **Goal**: 脚本以阻断型接入 check 链，支持 env/commit-msg skip，无参数运行跳过（不误报）。
- **REQ**: REQ-02
- **TDD Steps**:
  - RED: 测试断言——(a) `npm run check`（脚本无参数）全绿（跳过）；(b) `FORGE_SKIP_UNUSED_CHECK=1` → exit 0 + warn；(c) commit msg `[unused-check-skip]` → exit 0 + warn。
  - GREEN:
    1. `package.json:29` check 链尾追加 `&& node scripts/check-unused-module.mjs`。
    2. 脚本开头加 skip 检测（env + git log commit msg，对齐 check-dist-sync.mjs:92-108）。
    3. 无参数 → 输出"工具就位"+ exit 0（INV-4，避免全库误报）。
    测试全绿。
  - REFACTOR: skip 检测抽为 `shouldSkip()` 复用。
- **Verify Command**: `npm run check 2>&1 | tail -3`（全绿）+ skip 测试
- **Definition of Done**: `npm run check` 含本脚本且全绿；skip 两种方式有效；无参数跳过不误报现有模块。
- **Depends On**: T-01
- **风险**: 低（check 链追加，无参数跳过保护）

### T-03 build SKILL 触发约定 + evolved-rules Infra_Ref

- **Goal**: 文档化"删除前必须跑脚本"约定，更新 R3 Infra_Ref（不占 R15 名额）。
- **REQ**: REQ-03
- **TDD Steps**: 非 TDD（文档）。
  - `skills/forge/lib/build/instructions.md` Pre-build Checks 段新增条目："删除 src 模块前，必须 `node scripts/check-unused-module.mjs <target>`；exit 1 时迁移消费者或撤销主张（参见 T-01 state-machine 案例）；`[unused-check-skip]` 仅限紧急 hotfix。"
  - `.forge/knowledge/evolved-rules.md` R3 的 Infra_Ref 追加 `scripts/check-unused-module.mjs`（评估是否需微调 R3 Content 提及"删除前验证"；不新增 R15）。
- **Verify Command**: `grep check-unused-module skills/forge/lib/build/instructions.md`（命中）+ `grep check-unused-module .forge/knowledge/evolved-rules.md`（命中）
- **Definition of Done**: build SKILL 含调用约定；R3 Infra_Ref 含脚本；R15 名额未占用。
- **Depends On**: T-01（脚本路径确定后才能写 Infra_Ref）
- **风险**: 低（纯文档；evolved-rules 满额，只更新不新增）

### T-04 T-01 反向回归 fixture（state-machine 非死代码）

- **Goal**: 用 state-machine 作 fixture，证明脚本堵住 T-01 盲区——判定它非死代码并报告 test/packs 引用。
- **REQ**: REQ-04
- **TDD Steps**:
  - RED: `test/check-unused-module.test.ts` 加用例——`execFileSync(node, [script, "src/state-machine/"])` 断言 `status !== 0` 且输出含：`test/pms-pack/integration.test.ts`、`test/pack/zero-pack-invariant.test.ts`（维度 c）、`packs/pms/state-machines`（维度 d）。此时第四维启发式可能不命中，失败。
  - GREEN: 调优 `scanDataDirUsage` 启发式（命名约定 `state-machine` ↔ `state_machines` category；grep pack.yaml manifest；grep test readFileSync）使第四维命中。测试通过。
  - REFACTOR: 启发式映射抽为可配置（为 Open Question 1 的"显式映射表"升级留路）。
- **Verify Command**: `npx vitest run test/check-unused-module.test.ts`
- **Definition of Done**: state-machine 判定 exit 1（非死代码）；输出含 test + packs 引用点；真死代码 fixture 仍 exit 0。
- **Depends On**: T-01（脚本存在）
- **风险**: 中（第四维启发式是否够准——T-01 是核心验证锚点，必须命中）

### T-05 全局不变式终验

- **Goal**: 最终 PR 前验证 INV-1 ~ INV-5 全满足。
- **REQ**: 全部
- **TDD Steps**: 非 TDD（验证门禁）。
- **Verify Command**:
  ```bash
  npx tsc --noEmit && \
  npx vitest run && \
  npm run check && \
  node scripts/check-dist-sync.mjs
  ```
- **Definition of Done**: INV-1~5 全满足；T-01 反向回归（state-machine 非死代码）通过；现有 8868 测试无回归。
- **Depends On**: T-01 ~ T-04 全部

### T-06 spec 状态闭环 + learn

- **Goal**: spec status 标 completed，执行 `/forge learn` 从本机制提取经验（"死代码判定必须四维扫描"写入知识库）。
- **REQ**: 元
- **TDD Steps**: 非 TDD（文档闭环 + 知识沉淀）。
- **Verify Command**: 人工核对 frontmatter status + learn 产出。
- **Definition of Done**: frontmatter `status: completed` + `status_note` 记录交付；learn 产出的知识条目可被未来 `/forge plan` 检索到。
- **Depends On**: T-05

---

## 执行顺序建议

1. **Wave 1**：T-01（脚本骨架）+ T-04（state-machine fixture，RED 驱动 T-01）—— 并行，T-04 的 RED 推 T-01 实现
2. **Wave 2**：T-02（接入 check 链 + skip）
3. **Wave 3**：T-03（build SKILL + evolved-rules 文档约定）
4. **收尾**：T-05（不变式终验）→ T-06（闭环 + learn）

## 与 arch-review-remediate-0626 的关系

本 spec 是 `arch-review-remediate-0626` T-01 反转的直接产物——把那次"build 阶段才打破盲区"的教训固化为自动化门禁，避免未来同类误判。T-04 的 state-machine fixture 正是用 T-01 的真实案例作为回归锚点。若未来 state-machine 真被迁移退役（解除了 pms pack 依赖），需同步更新本 spec 的 fixture。
