---
feature: cmux-skills-collapse
layout: tasks
created: 2026-05-24
spec_ref: ".forge/specs/cmux-skills-collapse/requirements.md"
---

# Implementation Plan — cmux-skills-collapse

> 基于 `.forge/specs/cmux-skills-collapse/{requirements.md, design.md}`。
> 任务粒度：每项 30–90 分钟，原子可提交。

## Overview

本文件给出 `cmux-skills-collapse` 特性的执行任务清单。共 18 个任务，分 5 个 Tier 推进：基础设施（cmux-gate 闸门 + allowlist 扩展 + dispatcher 接入 + audit schema）、物理迁移（3 个 SKILL git mv + 旧目录清理 + manifest regen）、集成验证（cmux 可用 / 不可用 / Zero-Impact 三组属性测试）、文档与归档（SKILL.md 计数 + reference-advanced 重写 + plan/progress 同步）、最终回归（npm run check + build-dist 路径验证）。每个任务标注涉及文件、验证命令与关联 Requirements，可独立提交、可在 PR 内单独评审。

## Tasks

- [x] 1. 创建 cmux-gate.ts 模块（含单元测试）
  - **实施目标**：实现 `src/forge-dispatcher/cmux-gate.ts`，导出 `CMUX_GATED_SUBS` 集合、`checkCmuxGate(sub, opts)` 函数、`GateResult` / `GateBlockReason` 类型与 `__resetGateForTest()`。内部 `cmuxAvailableShim()` 复刻 availability.mjs 关键判定（CMUX_INTEGRATION 短路、CMUX_WORKSPACE_ID 跳过、socket stat、白名单前缀）。状态机按 design §4.3：进程内 `stickyUnavailable` 标志，blocked 后不再 probe。
  - **涉及文件**：
    - `src/forge-dispatcher/cmux-gate.ts`（CREATE）
    - `test/forge-dispatcher/cmux-gate.test.ts`（CREATE，≥ 8 用例覆盖 design §8.1 表）
  - **验证命令**：`npx vitest run test/forge-dispatcher/cmux-gate.test.ts`
  - **关联 Requirements**：R2.6, R2.7, R2.8（gate_reason 字段）

- [x] 2. allowlist.ts 扩展为 32 项
  - **实施目标**：在 `src/forge-dispatcher/allowlist.ts` 的 `ALLOW_LIST` 数组追加 3 项 `forge-cmux-sidebar-sync` / `forge-cmux-browser-qa` / `forge-cmux-loop-signals`，按字母序插入。注：manifest 实际 31 项（含内部 sub `init`、`review-comment-bitbucket`），ALLOW_LIST 从 29 → 32，manifest 从 31 → 34。
  - **涉及文件**：
    - `src/forge-dispatcher/allowlist.ts`（MODIFY）
    - `test/forge-dispatcher/allowlist.test.ts`（MODIFY，断言长度 = 32 + 三个新 sub 命中）
  - **验证命令**：`npx vitest run test/forge-dispatcher/allowlist.test.ts`
  - **关联 Requirements**：R1.1（命名）, R8.6（trigger 超集功能等价）

- [x] 3. forge-dispatcher.ts 插入 Step 2.5 闸门
  - **实施目标**：在 `src/forge-dispatcher.ts` 的 `dispatchForgeSubcommand()` 内，Step 2 `validateTopic` 之后、Step 3 `resolveLibPath` 之前插入闸门调用。`gateResult.ok = false` 时短路返回 `{ code: "SKILL_UNAVAILABLE" }`，并在返回前调用 `appendAuditLog`（rejected + gate_result: blocked + gate_reason）。`gate_result = "n_a"` / `"go"` 时透传至 Step 3。支持 `_mockSteps.checkCmuxGate` 测试注入。
  - **涉及文件**：
    - `src/forge-dispatcher.ts`（MODIFY）
    - `test/forge-dispatcher/dispatch.test.ts`（MODIFY，新增 3 个用例：n_a / go / blocked）
  - **验证命令**：`npx vitest run test/forge-dispatcher/dispatch.test.ts`
  - **关联 Requirements**：R2.1, R2.2, R2.3, R2.4, R2.5, R3.1, R3.5, R3.6

- [x] 4. audit-log.ts schema 扩展
  - **实施目标**：在 `AuditEntry` 接口追加三个字段：`gate_result: "go" | "n_a" | "blocked"`、`cmux_available: boolean | null`、`gate_reason: GateBlockReason | null`。`computeHmac` 不变（新字段已含在 entry 序列化里）。向前兼容旧条目缺字段按 null 处理（仅消费侧关心，本任务只改写入侧）。
  - **涉及文件**：
    - `src/forge-dispatcher/audit-log.ts`（MODIFY）
    - `test/forge-dispatcher/audit-log.test.ts`（MODIFY，断言新字段写入）
  - **验证命令**：`npx vitest run test/forge-dispatcher/audit-log.test.ts`
  - **关联 Requirements**：R2.8

- [x] 5. 物理迁移 forge-sidebar-sync → forge-cmux-sidebar-sync
  - **实施目标**：`mkdir -p skills/forge/lib/forge-cmux-sidebar-sync` → `git mv cmux-skills/forge-sidebar-sync/SKILL.md skills/forge/lib/forge-cmux-sidebar-sync/instructions.md` → 重写 frontmatter（去掉 `name` / `trigger`，保留 `description`，新增 `dispatch_mode: inline` 与 `allowed_tools: [Read, Bash]`，按 design §3.4 / §7.2 模板）→ Body 保留原 Activation / What It Shows / Requirements / Zero-Impact 段（R8.1）。
  - **涉及文件**：
    - `skills/forge/lib/forge-cmux-sidebar-sync/instructions.md`（CREATE，由旧 SKILL.md 迁移而来）
    - `cmux-skills/forge-sidebar-sync/SKILL.md`（DELETE，git mv 自动）
  - **验证命令**：`test -f skills/forge/lib/forge-cmux-sidebar-sync/instructions.md && head -8 skills/forge/lib/forge-cmux-sidebar-sync/instructions.md | grep -E '^(description|dispatch_mode|allowed_tools)'`
  - **关联 Requirements**：R1.1, R1.2, R1.5, R8.1, R8.7

- [x] 6. 物理迁移 forge-browser-qa → forge-cmux-browser-qa
  - **实施目标**：同 Task 5，处理 browser-qa；保留原 Usage / Verdict States / Artifact / Zero-Impact 段（R8.2）。
  - **涉及文件**：
    - `skills/forge/lib/forge-cmux-browser-qa/instructions.md`（CREATE）
    - `cmux-skills/forge-browser-qa/SKILL.md`（DELETE）
  - **验证命令**：`test -f skills/forge/lib/forge-cmux-browser-qa/instructions.md && grep -q 'Verdict States' skills/forge/lib/forge-cmux-browser-qa/instructions.md`
  - **关联 Requirements**：R1.1, R1.2, R1.5, R8.2, R8.7

- [x] 7. 物理迁移 forge-loop-signals → forge-cmux-loop-signals
  - **实施目标**：同 Task 5，处理 loop-signals；保留原 Loop States / Activation / Requirements / Zero-Impact 段（R8.3）。
  - **涉及文件**：
    - `skills/forge/lib/forge-cmux-loop-signals/instructions.md`（CREATE）
    - `cmux-skills/forge-loop-signals/SKILL.md`（DELETE）
  - **验证命令**：`test -f skills/forge/lib/forge-cmux-loop-signals/instructions.md && grep -q 'Loop States' skills/forge/lib/forge-cmux-loop-signals/instructions.md`
  - **关联 Requirements**：R1.1, R1.2, R1.5, R8.3, R8.7

- [x] 8. 删除 cmux-skills/ 根目录及 install.sh
  - **实施目标**：执行 `git rm cmux-skills/install.sh`、`rmdir cmux-skills/forge-{sidebar-sync,browser-qa,loop-signals}`、`rmdir cmux-skills/`。验证仓库内除 `.forge/archive/` 与本 spec 文档外不再含字符串 `cmux-skills/install.sh`。
  - **涉及文件**：
    - `cmux-skills/install.sh`（DELETE）
    - `cmux-skills/`（DELETE，目录）
  - **验证命令**：`! test -d cmux-skills && rg -n 'cmux-skills/install.sh' --glob '!.forge/archive/**' --glob '!.forge/specs/cmux-skills-collapse/**' --glob '!docs/reference-advanced.md' && echo OK || echo "still referenced"`（期望输出 `OK`，rg 返回非零即视为通过）
  - **关联 Requirements**：R1.3, R5.1, R5.2, R5.3, R5.4

- [x] 9. 重新生成 manifest.json
  - **实施目标**：运行 `node scripts/regen-skill-registry.mjs`；验证 `skills/forge/lib/manifest.json` 的 `subs` 键集合从 31 项扩为 34 项（新增 forge-cmux-sidebar-sync / forge-cmux-browser-qa / forge-cmux-loop-signals 三键）；每个新键含 `instructions.path` 与 `instructions.sha256` 字段。
  - **涉及文件**：
    - `skills/forge/lib/manifest.json`（REGEN）
    - `scripts/regen-skill-registry.mjs`（READ-only，无需修改）
  - **验证命令**：`node scripts/regen-skill-registry.mjs && jq '.subs | keys | length' skills/forge/lib/manifest.json`（期望输出 `34`）
  - **关联 Requirements**：R1.1, R1.4（path-resolve 自然命中需 manifest 含新 sha256）

- [x] 10. 集成测试：cmux 不可用时分发 cmux sub 回 SKILL_UNAVAILABLE
  - **实施目标**：在 `test/forge-dispatcher/dispatch.test.ts` 或新建 integration 文件中编写测试：mock `statSync` 抛 ENOENT、env 清空 cmux 相关变量、调用 `dispatchForgeSubcommand("forge-cmux-sidebar-sync")` → 断言返回 `{ code: "SKILL_UNAVAILABLE" }`、断言 `readFileSync` spy 未对 instructions.md 调用、断言 audit log 含 `gate_result: "blocked"`。三个 cmux sub 各跑一次。
  - **涉及文件**：
    - `test/forge-dispatcher/cmux-gate.integration.test.ts`（CREATE）
  - **验证命令**：`npx vitest run test/forge-dispatcher/cmux-gate.integration.test.ts`
  - **关联 Requirements**：R2.5, R3.2, R3.6

- [x] 11. 集成测试：cmux 可用时正常分发 cmux sub
  - **实施目标**：mock `statSync` 返回 `isSocket: () => true`；env 设 `CMUX_INTEGRATION=on` 或 `CMUX_WORKSPACE_ID=ws-test`；调用 `dispatchForgeSubcommand("forge-cmux-loop-signals")` → 断言返回 `{ code: "OK", dispatchPath: "..."}`，且 `dispatchPath` 末尾为 `forge-cmux-loop-signals/instructions.md`；断言 audit log 含 `gate_result: "go"`、`cmux_available: true`。
  - **涉及文件**：
    - `test/forge-dispatcher/cmux-gate.integration.test.ts`（同 Task 10）
  - **验证命令**：`npx vitest run test/forge-dispatcher/cmux-gate.integration.test.ts -t "available"`
  - **关联 Requirements**：R2.4, R8.6

- [x] 12. Zero-Impact 测试：未装 cmux 时 /forge build 字节级一致
  - **实施目标**：实现 design §8.3 R3.4.a-d 的 4 条属性测试。R3.4.a：捕获迁移前 commit + 迁移后 commit 在「未装 cmux」环境下跑 dispatcher 单测的 stdout/stderr，`diff --binary` 必须空。R3.4.b：snapshot `.forge/`、`.claude/` 文件列表。R3.4.c：跑前后 `(mtime, sha256)` 比对。R3.4.d：build-dist 后比对 31 个非 cmux sub 的 instructions.md sha256 集合。
  - **涉及文件**：
    - `test/forge-dispatcher/zero-impact.test.ts`（CREATE）
    - 测试夹具：`test/forge-dispatcher/fixtures/pre-migration-stdout.txt`（CREATE，捕获迁移前基线）
  - **验证命令**：`npx vitest run test/forge-dispatcher/zero-impact.test.ts`
  - **关联 Requirements**：R3.1, R3.3, R3.4.a, R3.4.b, R3.4.c, R3.4.d

- [x] 13. 更新 skills/forge/SKILL.md（sub 计数 + tier 段落）
  - **实施目标**：在 `skills/forge/SKILL.md` §1 Overview 把 `29 sub-skills` 改为 `32 sub-skills`；§2 Subcommand Listing 在 Auxiliary 段落末尾追加 `forge-cmux-sidebar-sync` `forge-cmux-browser-qa` `forge-cmux-loop-signals` 三项；frontmatter `description` 字段同步更新（如有具体计数文字）。
  - **涉及文件**：
    - `skills/forge/SKILL.md`（MODIFY）
  - **验证命令**：`grep -c 'forge-cmux-' skills/forge/SKILL.md`（期望 ≥ 3）+ `grep -E '32 sub-skills' skills/forge/SKILL.md`
  - **关联 Requirements**：R1.6

- [x] 14. 重写 docs/reference-advanced.md「使用」「卸载」段
  - **实施目标**：删除 `bash cmux-skills/install.sh --apply ...` 与 `bash cmux-skills/install.sh --uninstall ...` 两条命令；「使用」段改为：「安装 cmux 后，下次 `/forge` 调用即可自动检测并启用 cmux SKILL，sticky 状态机在该进程内保持判定结果」；「卸载」段改为：「卸载或停用 cmux 后，下次 `/forge` 调用 Conditional_Availability_Gate 自动转为拒绝分发，cmux SKILL 自然失活」；「新增文件」段把 `cmux-skills/` 行替换为三条 `skills/forge/lib/forge-cmux-*/` 平级条目；新增「升级说明」段，给出 `rm -rf .claude/skills/forge-{sidebar-sync,browser-qa,loop-signals}` 用户级清理命令（R10.1）。
  - **涉及文件**：
    - `docs/reference-advanced.md`（MODIFY）
  - **验证命令**：`! grep -q 'cmux-skills/install.sh' docs/reference-advanced.md && grep -q 'forge-cmux-sidebar-sync' docs/reference-advanced.md && grep -q '升级说明\|.claude/skills/forge-sidebar-sync' docs/reference-advanced.md`
  - **关联 Requirements**：R6.1, R6.2, R6.3, R6.4, R6.5, R6.6, R10.1, R10.4

- [x] 15. 更新 .forge/plans/cmux-integration.md（File Mapping + Task 27/30 Notes）
  - **实施目标**：在 plan 的 File Mapping 表中：把 `cmux-skills/forge-sidebar-sync/SKILL.md` 等 4 行改为 `skills/forge/lib/forge-cmux-{sidebar-sync,browser-qa,loop-signals}/instructions.md` + Notes 列注明「moved by spec cmux-skills-collapse」；删除 `cmux-skills/install.sh` 行（或改为 DELETE 操作 + Notes）。Sprint 5 Task 27 状态保持 done 但 Notes 加入「superseded by .forge/specs/cmux-skills-collapse/」；Sprint 6 Task 30 Notes 改为「reference-advanced.md 已按条件分发方式重写（cmux-skills-collapse R6）」。Objective、Design Reference Index、Sprint 1–4 不动（R9.5）。
  - **涉及文件**：
    - `.forge/plans/cmux-integration.md`（MODIFY）
  - **验证命令**：`grep -c 'cmux-skills-collapse' .forge/plans/cmux-integration.md`（期望 ≥ 2）
  - **关联 Requirements**：R9.1, R9.2, R9.3, R9.5

- [x] 16. 更新 .forge/progress/cmux-integration.md（Task 27/30 链接）
  - **实施目标**：在 Sprint 5 Task 27 行 Notes 列末尾追加 `→ superseded by .forge/specs/cmux-skills-collapse/`；在 Sprint 6 Task 30 行 Notes 列追加 `→ rewritten per .forge/specs/cmux-skills-collapse/ R6`。其它 Task 状态不动。
  - **涉及文件**：
    - `.forge/progress/cmux-integration.md`（MODIFY）
  - **验证命令**：`grep -c 'cmux-skills-collapse' .forge/progress/cmux-integration.md`（期望 ≥ 2）
  - **关联 Requirements**：R9.4

- [x] 17. 全量回归 npm run check
  - **实施目标**：`npm run check` 全绿（含 lint + typecheck + 全部单测 + property tests）。若有失败必须修复后再提交，不允许 skip。
  - **涉及文件**：
    - 无（验证型任务）
  - **验证命令**：`npm run check`
  - **关联 Requirements**：R3.1, R3.4, 全量集成验证

- [x] 18. build-dist 验证打包路径
  - **实施目标**：`bash scripts/build-dist.sh` → 验证 `dist-plugin/skills/forge/lib/forge-cmux-sidebar-sync/instructions.md`、`forge-cmux-browser-qa/instructions.md`、`forge-cmux-loop-signals/instructions.md` 三文件存在；验证 `dist/claude-code/bundles/forge/skills/forge/lib/` 下同三文件存在；验证 `.manifest.sha256` 含三条新文件 sha256 行。无需修改 build-dist.sh（R7.3 要求不增特殊逻辑）。
  - **涉及文件**：
    - 无修改；`scripts/build-dist.sh` 仅作为执行对象
  - **验证命令**：`bash scripts/build-dist.sh && for f in forge-cmux-sidebar-sync forge-cmux-browser-qa forge-cmux-loop-signals; do test -f "dist-plugin/skills/forge/lib/$f/instructions.md" || exit 1; done && grep -E 'forge-cmux-(sidebar-sync|browser-qa|loop-signals)/instructions.md' dist/claude-code/bundles/.manifest.sha256 | wc -l`（期望 wc 输出 3）
  - **关联 Requirements**：R7.1, R7.2, R7.3, R7.4

---

## Spec Coverage

| Requirement | Covering Tasks |
|-------------|---------------|
| R1: cmux SKILL 物理位置统一 | 5, 6, 7, 9, 13 |
| R2: Conditional_Availability_Gate | 1, 3, 4, 10, 11 |
| R3: Zero-Impact 不变量 | 3, 10, 12, 17 |
| R4: 三种安装入口一致 | 11, 17（path-resolve 双模式已在现有代码中） |
| R5: 移除旧 installer | 8 |
| R6: reference-advanced.md 重写 | 14 |
| R7: build-dist 简化 | 18 |
| R8: SKILL 内容保留 + frontmatter | 5, 6, 7（含 R8.4/R8.5 按 design §7.2 适配） |
| R9: plan/progress 同步 | 15, 16 |
| R10: 旧用户目录兼容 | 14（R10.1 升级说明） |

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2", "4"], "description": "基础设施可并行：cmux-gate / allowlist / audit schema" },
    { "wave": 2, "tasks": ["3"], "description": "dispatcher Step 2.5 接入（依赖 wave 1 全部完成）" },
    { "wave": 3, "tasks": ["5", "6", "7"], "description": "三个 SKILL 物理迁移可并行" },
    { "wave": 4, "tasks": ["9"], "description": "regen manifest（依赖 wave 3 全部完成）" },
    { "wave": 5, "tasks": ["8"], "description": "删除 cmux-skills/ 旧目录（依赖 wave 4 manifest 已含新 sub）" },
    { "wave": 6, "tasks": ["10", "11", "12"], "description": "集成测试 + Zero-Impact（依赖 dispatcher + manifest 完成）" },
    { "wave": 7, "tasks": ["13", "14", "15", "16"], "description": "文档与归档同步" },
    { "wave": 8, "tasks": ["17"], "description": "全量回归 npm run check" },
    { "wave": 9, "tasks": ["18"], "description": "build-dist 验证打包路径" }
  ],
  "rationale": "Tier 1 基础设施 + Tier 2 物理迁移可在 wave 内并行。Wave 间严格依赖：dispatcher 接入需基础设施就绪、删除旧目录需 manifest 已切换、集成测试需 dispatcher + manifest 完成、回归需所有改动落地、build-dist 需回归通过。"
}
```

执行规则：
- Tier 1（Task 1–4）可并行；Task 3 在 Task 1+2+4 完成后整合。
- Tier 2（Task 5–9）按字母序串行迁移，Task 9 必须在 Task 5/6/7 之后；Task 8 在 Task 9 之后（manifest 已含新 sub 才删除旧目录，避免中间态破坏 dispatcher）。
- Tier 3（Task 10–12）依赖 Tier 1+2 完成；三个集成测试可并行编写。
- Tier 4（Task 13–16）可与 Tier 3 并行（仅文档/索引）。
- Tier 5（Task 17–18）最后串行：先 npm run check 全绿，再 build-dist 验证打包。

## Notes

### 与 Forge plan 的关系

本 tasks.md 取代 `.forge/plans/cmux-integration.md` 中 Sprint 5 Task 27（cmux-skills/ 创建）的后续维护责任，并触发 Sprint 6 Task 30（reference-advanced.md）的重写。Sprint 1–4 与 Sprint 5 的 Task 24–26、28 不受影响（已 done，状态保持不变）。

### Frontmatter 现实校准

实际 collapsed sub 的 instructions.md frontmatter **没有 `name` 字段**也**没有 `trigger` 字段**，仅有 `description` / `dispatch_mode` / `allowed_tools`。requirements R8.4 和 R8.5 在 design §7.2.1 / §7.2.2 中已重新解释为「目录名作为隐式 name」+「sub 名 + Levenshtein 覆盖原 trigger 语义」。Task 5/6/7 按校准后规则执行 frontmatter 改写，不机械追加 `name` / `trigger`。

### Sub 计数事实

ALLOW_LIST 实际 29 项，迁移后 32 项。manifest.json 比 ALLOW_LIST 多两个内部 sub（`init` 与 `review-comment-bitbucket`），实际 31 项，迁移后 34 项。Task 9 验证 manifest 输出 34，Task 13 把 SKILL.md §2 的「29」改为「32」（与 ALLOW_LIST 对齐，与用户可见的 `/forge <sub>` 集合一致）。

### 验收阻塞条件

任何一项 Tier 1–3 任务失败时立即停止后续任务，进入 `/forge debug`，不允许跳过。
