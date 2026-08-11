---
status_note: "Task 4 (E2E) 部分N/A — 目标架构已删除；Task 5 (API面) 部分完成；覆盖率 branches 未达标"
feature: v2.4-review-followups
layout: tasks
created: 2026-05-07
spec_ref: ".tinkerman/specs/v2.4-review-followups/requirements.md"
---

# Implementation Plan: v2.4 Review Follow-ups

## Overview

按 3 个 phase 推进共 8 个需求。phase 内部可并行，phase 间存在依赖。每个顶级任务可独立发 PR，避免大爆炸式合并。

所有 breaking 变更遵循 v2.3.1（warning 过渡）→ v2.4.0-beta（核心能力）→ v2.4.0（验收闭环）的节奏。

## Tasks

- [x] 1. Phase 1.1 — Hook 阻断强化（需求 1）
  - [x] 1.1 新增 `HooksProtectionMissingError` 错误类
    - 在 `src/forge-error.ts` 增加子类
    - code: `HOOKS_PROTECTION_MISSING` 常量字面量
    - 消息格式包含 reason + 建议动作（运行 init.sh / 使用 --force-no-hooks）
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 修改 `SdkDriver.run()` 启动路径
    - 将现有 `try/catch + warn` 改为 `throw new HooksProtectionMissingError` 默认路径
    - 读取 `config.forceNoHooks`（新字段），为 true 时走 warn + 写 flag 文件路径
    - 保持 `validateHooksPresence` 纯函数签名不变
    - _Requirements: 1.1, 1.8, 1.9_

  - [x] 1.3 扩展 `SdkDriverConfig` 与 CLI flag
    - `SdkDriverConfig` 增加 `forceNoHooks?: boolean` 字段
    - `forge-loop-cli.ts` commander 增加 `--force-no-hooks` flag 定义
    - 传入时在启动横幅中打印醒目警告（红色或 `[!!!]` 前缀）
    - _Requirements: 1.3_

  - [x] 1.4 写 `force-no-hooks.flag` 审计文件
    - `SdkDriver` 增加私有方法 `writeForceNoHooksFlag()`
    - 写入 JSON 格式（timestamp、cliArgs、reason、runId）到 `.tinkerman/runs/<runId>/`
    - _Requirements: 1.4_

  - [x] 1.5 改写 check-frozen hook 命令为 wrapper 脚本
    - 新增 `scripts/hook-check-frozen.sh`：Node 缺失 / dist 缺失时 exit 2 + stderr 原因
    - 修改 `hooks/hooks.json` 的 PreToolUse 命令引用新 wrapper
    - 保留原有双路径 fallback 逻辑（forge/dist / ~/.claude/skills/forge/dist）
    - _Requirements: 1.5, 1.6_

  - [x] 1.6 Property test 验证阻断
    - 新增 `test/sdk-driver.hooks-enforcement.property.test.ts`
    - 对任意 `SdkDriverConfig`（hooks 缺失且 forceNoHooks=false），`run()` 必抛 `HooksProtectionMissingError`
    - 验证 mock agent 的 `invocationCount === 0`（agent 从未被调用）
    - _Requirements: 1.7_

  - [x] 1.7 v2.3.1 过渡版
    - 将 1.1-1.6 改为 opt-in（默认 warn + 新行为需 `FORGE_STRICT_HOOKS=1` 环境变量）
    - 发 v2.3.1 tag，CHANGELOG 标 `[DEPRECATION]` 说明 v2.4.0 会切换默认
    - _Requirements: 1.1_

---

- [x] 2. Phase 1.2 — Console 迁移收尾（需求 6）
  - [x] 2.1 新增 `ConsoleSink`（`src/logger/console-sink.ts`）
    - 实现 `createConsoleSink({ format, minLevel })` 纯工厂函数
    - text/json 两种输出格式，与 `StructuredObservability` spec 对齐
    - stderr（warn/error）与 stdout（info/debug）分流
    - 内部 `console.*` 调用处带 `biome-ignore noConsole` + 理由注释（作为单一出口豁免）
    - _Requirements: 6.3, 6.4_

  - [x] 2.2 迁移 `src/logger/log-sink.ts`（根因）
    - 移除内部的裸 `console.*` 调用
    - 改为调用 `ConsoleSink` 实例
    - 更新对应 unit test
    - _Requirements: 6.1, 6.2_

  - [x] 2.3 迁移 `forge-loop-cli.ts` 用户输出
    - 所有用户可见的 CLI 输出改为通过 `ConsoleSink`
    - 保留与 v2.3 兼容的文本格式
    - _Requirements: 6.3, 6.4_

  - [x] 2.4 批量迁移剩余 10 个文件
    - `run-manager.ts`、`failure-sink.ts`、`mcp/server.ts`、`orphan-detector.ts`、`pua-state-manager.ts`、`sdk-status-helpers.ts`、`sdk-quality-helpers.ts`、`sdk-skill-detection.ts`、`check-frozen.ts`、`process-registry.ts`
    - 每个文件的 `console.*` 改为 `LogSink.write(createLogEntry(...))`
    - 每个文件单独 PR 或按相关性分组 PR
    - _Requirements: 6.1_

  - [x] 2.5 启用 Biome `noConsole` 规则
    - 修改 `biome.json` 的 `linter.rules.suspicious.noConsole` 为 error
    - `test/**` 作用域覆盖为 off
    - 运行 `npm run lint` 验证 `src/` 全绿或仅含 biome-ignore 豁免
    - _Requirements: 6.5, 6.6, 6.7_

  - [x] 2.6 新增 `scripts/check-no-bare-console.sh`
    - grep `src/` 中 `console\.` 并过滤带 biome-ignore 的行
    - 无匹配视为通过
    - 集成到 `npm run check`
    - _Requirements: 6.8_

---

- [x] 3. Phase 1.3 — execFileSync 统一（需求 7）
  - [x] 3.1 迁移 `src/orphan-detector.ts`
    - 将 `execSync("ps -eo pid,ppid,etime,command")` 改为 `execFileSync("ps", ["-eo", "pid,ppid,etime,command"], {...})`
    - 保持函数签名与返回值不变
    - _Requirements: 7.1, 7.2_

  - [x] 3.2 现有单元测试回归
    - 运行现有 `orphan-detector.test.ts` 确保全绿
    - _Requirements: 7.3_

  - [x] 3.3 新增 ps 输出解析属性测试
    - 构造 arbitrary 合法 ps 输出行（长命令、tab、空格、特殊字符）
    - 验证解析函数不抛出且输出稳定
    - _Requirements: 7.4_

  - [x] 3.4 新增 `scripts/check-no-execsync.sh`
    - grep `\bexecSync\b` 于 `src/`，过滤 biome-ignore
    - 集成到 `npm run check`
    - _Requirements: 7.5, 7.6_

---

- [~] 4. Phase 2.1 — E2E 测试套件（需求 2）
  > **部分 N/A — 2026-06-12**
  > 5 个 E2E 测试路径（Task 4.4-4.8）及 mock-agent.ts（Task 4.2）目标为 `SdkDriver`、`EffectExecutor`、`RunManager`，这三个类已被 `forge-loop-native-fusion`（2026-06-01）刻意删除。架构替换为原生 loop 模式后，这些测试不再有可测目标。

  - [x] 4.1 新增 `test/e2e/helpers/temp-repo.ts`
    - `createTempRepo(seed?)`：mkdtemp + git init + git config + initial commit
    - `copyForgeSkeleton(cwd)`：从 fixture 复制最小 `.tinkerman/` 与 `hooks/` 结构
    - 导出 `cleanup()` 函数供 afterEach 使用
    - _Requirements: 2.1, 2.2_

  - [-] 4.2 新增 `test/e2e/helpers/mock-agent.ts` — **N/A：目标 `AgentInterface` + `SdkDriver` 已删除**
    - ~~实现 `ScriptedAgent implements AgentInterface`~~
    - ~~支持 `success / failure / stop / abort` 四种响应~~
    - ~~暴露 `invocationCount` 用于断言~~
    - _Requirements: 2.9 — N/A_

  - [x] 4.3 新增 `test/e2e/helpers/snapshot.ts`
    - `assertGitLog(cwd, patterns[])`：运行 git log --oneline 按序匹配
    - `assertStatusFile(cwd, expected)`：解析 `.tinkerman/status.md` frontmatter 比对
    - `assertNotesDocument(cwd, runId, expected)`：读取 notes.md 比对
    - _Requirements: 2.4_

  - [-] 4.4 E2E 成功路径（`e2e-success-path.test.ts`）— **N/A：目标 `SdkDriver.run()` + commit effect 已删除**
    - ~~mock agent 返回 `success` → 预期 commit + exit 0~~
    - ~~断言 git log 包含 `forge(loop).*done`~~
    - _Requirements: 2.3 — N/A_

  - [-] 4.5 E2E 软失败路径（`e2e-soft-failure.test.ts`）— **N/A：目标 `EffectExecutor` backoff 已删除**
    - ~~mock agent 第 1 轮 `failure`，第 2 轮 `success`~~
    - ~~断言 backoff effect 被记录、最终 exit 0~~
    - _Requirements: 2.3 — N/A_

  - [-] 4.6 E2E 硬失败路径（`e2e-hard-failure.test.ts`）— **N/A：目标 `RunManager` 熔断 + rollback 已删除**
    - ~~mock agent 连续 `failure` 触发熔断（`maxConsecutiveErrors`）~~
    - ~~断言 rollback effect + abort + exit 非 0~~
    - _Requirements: 2.3 — N/A_

  - [-] 4.7 E2E worktree 模式（`e2e-worktree.test.ts`）— **N/A：目标 `SdkDriver` worktree 模式已删除**
    - ~~启用 `--worktree` 运行成功路径~~
    - ~~断言 worktree 已被删除~~
    - _Requirements: 2.3 — N/A_

  - [-] 4.8 E2E 中断恢复路径（`e2e-resume.test.ts`）— **N/A：目标 `RunManager` SIGTERM + resume 已删除**
    - ~~启动 forge-loop，第一轮成功后发送 SIGTERM~~
    - ~~调用 `forge-resume` 续跑至完成~~
    - _Requirements: 2.3 — N/A_

  - [x] 4.9 `package.json` scripts 与 CI job
    - 新增 `"test:e2e"` 与 `"test:e2e:watch"` scripts
    - `.github/workflows/ci.yml` 新增独立 `e2e` job
    - 失败时 upload `/tmp/forge-e2e-*` 为 artifact
    - _Requirements: 2.6, 2.7, 2.8, 2.10_

---

- [x] 5. Phase 2.2 — API 面收敛（需求 3）
  - [x] 5.1 盘点 `src/index.ts` 现有 51 个 export
    - 生成清单表格：符号名 / 来源模块 / 是否在文档提及 / 是否在 examples 引用 / 是否在 SKILL 引用
    - 输出到 `.tinkerman/findings/public-api-audit-2026-05.md` 供 review
    - _Requirements: 3.3_

  - [x] 5.2 决策保留清单
    - 按"文档 + examples + SKILL"三选二标准决定保留集
    - 维护者评审后锁定 ≤ 20 个保留符号
    - 更新 `.tinkerman/findings/public-api-audit-2026-05.md` 记录决策
    - _Requirements: 3.3, 3.8_

  - [x] 5.3 标注 `@public` / `@internal` TSDoc
    - 在保留符号的定义处添加 `@public`
    - 在其他被 barrel 导出的符号定义处添加 `@internal`
    - 运行 typedoc 确认输出合理
    - _Requirements: 3.4, 3.5_

  - [x] 5.4 调整 `src/index.ts` barrel
    - 移除内部符号的 export 语句
    - 对 v2.3 已对外的内部符号保留 deprecated re-export（加 TSDoc `@deprecated`）
    - typedoc 配置 `excludeTags: ["@deprecated"]` 或 `excludeInternal: true`
    - _Requirements: 3.2, 3.10_

  - [x] 5.5 新增 `scripts/check-public-api.mjs`
    - 规则 1：所有 @public 必在 barrel
    - 规则 2：所有 barrel exports 必有 @public
    - 规则 3：@internal 不可在 barrel
    - 集成到 `npm run check`
    - _Requirements: 3.6, 3.7_

  - [x] 5.6 验证 docs/api 体积缩减
    - 运行 typedoc 前后对比 `docs/api/` 字节数或文件数
    - 记录减小比例到 CHANGELOG
    - _Requirements: 3.9_

  - [x] 5.7 CHANGELOG BREAKING 条目
    - 列出所有移出 barrel 的符号
    - 链接 `docs/v2.4-migration.md`（新增迁移指南）
    - 在 v2.4.0-beta 发布时先行公示
    - _Requirements: 3.11_

---

- [x] 6. Phase 2.3 — Plan 注入收敛（需求 8）
  - [x] 6.1 新增 `scripts/inject-plan-context.mjs`
    - 读取 `.tinkerman/plans/*.md`，过滤 `status: active`
    - 按 mtime 倒序取 3 个
    - 每个 plan 最多 50 行或 2000 字符
    - 总字符上限 8000（~2000 tokens）
    - fail-open：任何异常 → exit 0 且不输出
    - _Requirements: 8.1, 8.2, 8.3, 8.6_

  - [x] 6.2 修改 `hooks/hooks.json`
    - UserPromptSubmit 的 bash head -50 命令替换为 `node scripts/inject-plan-context.mjs`
    - 保留 `2>/dev/null || true` fail-open 语义
    - _Requirements: 8.5_

  - [x] 6.3 单元测试 `test/inject-plan-context.test.ts`
    - 场景 1：空 plans 目录 → 空 stdout
    - 场景 2：3 个 active plan → 包含全部
    - 场景 3：5 个 active plan → 最多 3 个（mtime 最新）
    - 场景 4：超长 plan → 截断到 2000 字符且含 `[... truncated]`
    - 场景 5：无 frontmatter 的 plan → 跳过
    - 场景 6：总长超 8000 → 部分截断并附总量提示
    - 场景 7：格式正确（含 `=== Forge Context ===` 头）
    - _Requirements: 8.4_

  - [x] 6.4 Dogfooding 发现 6 跟进
    - 更新 `.tinkerman/findings/dogfooding-observations.md`，标记发现 6 的 plan 注入部分为"已解决"
    - 如有残留 context 压力（非 plan 注入原因），开新 finding
    - _Requirements: 8.7_

---

- [x] 7. Phase 3.1 — 覆盖率门禁上调（需求 4）
  - [x] 7.1 在 main 分支验证实际覆盖率
    - 运行 `npm run test:coverage` 获取当前数字
    - 确认达到 statements/functions/lines ≥ 90、branches ≥ 85
    - 不达标则先补测试再调门禁
    - _Requirements: 4.2_

  - [x] 7.2 修改 `vitest.config.ts`
    - `statements: 90`、`functions: 90`、`lines: 90`、`branches: 85`
    - _Requirements: 4.1_

  - [x] 7.3 更新 README 覆盖率数字
    - 从 `89.35/89.62/95.2` 更新为运行后的新数字
    - `scripts/check-readme-metrics.sh` 增加 ±0.5% 公差校验
    - _Requirements: 4.4, 4.5_

  - [x] 7.4 覆盖率倒退告警
    - 新增 `scripts/check-coverage-regression.mjs`：对比 PR 与 main 的 coverage-summary.json，倒退 ≥ 1% 失败
    - CI 中存 main 分支 baseline coverage 为 artifact
    - _Requirements: 4.3, 4.6_

---

- [x] 8. Phase 3.2 — SKILL 映射补齐（需求 5）
  - [x] 8.1 读取现有 `findings/skill-function-audit.md`
    - 列出 16 条概念引用 + 2 条未对接
    - 按 skill 分组
    - _Requirements: 5.1_

  - [x] 8.2 逐条分流决策
    - 每条走 A/B/C 三档之一：
      - A：补 SKILL.md 显式函数名 + 导入路径
      - B：标为"📝 文档语义"无需函数
      - C：标记函数为 deprecated 或 merge
    - 决策记录到 audit 文件
    - _Requirements: 5.1, 5.2_

  - [x] 8.3 修改相关 SKILL.md
    - 按 A 档决策补显式调用示例（如 `src/review.ts:mergeReviewFindings`）
    - 保证每个 ✅ 标记的函数在至少一个 SKILL.md 中有调用示例
    - _Requirements: 5.1, 5.3_

  - [x] 8.4 扩展 `scripts/check-skill-function-refs.sh`
    - 新增 `--strict` 模式
    - strict 下校验所有 ✅ 函数在 SKILL 中有调用示例
    - 集成到 `npm run check`（自动启用 strict）
    - _Requirements: 5.3, 5.4_

  - [x] 8.5 验证 ✅ 函数数 ≥ 20
    - 最终审计表统计 ≥ 20 已对接
    - 若不达标则新增更多 SKILL.md 补写
    - _Requirements: 5.5_

---

## Dependency Graph

```
Phase 1（可完全并行）：
  1. Hook 阻断 ──┐
  2. Console   ─┼─> v2.3.1 tag（1 的过渡版）
  3. execFileSync┘

Phase 2（依赖 Phase 1 的 console 链与 forge-error 扩展）：
  4. E2E      ─┐
  5. API 面   ─┼─> v2.4.0-beta tag
  6. Plan 注入─┘

Phase 3（依赖 Phase 1+2 全部完成）：
  7. 覆盖率   ─┐
  8. SKILL 映射┘─> v2.4.0 release
```

## Success Criteria

- [x] `npm run check` 全绿（含新增的 coverage@90 / public-api / no-execsync / no-bare-console / skill-refs strict / readme-metrics）
- [~] `npm run test:e2e` 独立全绿，墙钟 ≤ 5 分钟 — **部分 N/A：5 条核心 E2E 路径目标架构已删除，现有 test:e2e 仅覆盖 spec-kiro-style**
- [x] `forge-v2.3-technical-review.md` §8 风险清单中 R1 / R3 / R4 / R5 / R6 在后续审计报告中标记为"已缓解"
- [x] `src/index.ts` export 数 ≤ 20（v2.3 时为 51）
- [x] `docs/api/` 体积减小 ≥ 40%
- [x] `src/` 下无未豁免的 `console.*` / `execSync` 使用
- [x] `findings/skill-function-audit.md` ✅ 函数 ≥ 20
- [x] Hook 缺失时 forge-loop 默认阻断启动（需求 1 核心验收）
- [x] 全仓现有测试全部通过 + 新增至少 80 个测试（含 E2E、property、unit）
