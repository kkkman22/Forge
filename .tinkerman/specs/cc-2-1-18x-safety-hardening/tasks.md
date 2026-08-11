---
feature: cc-2-1-18x-safety-hardening
layout: tasks
created: 2026-06-23
tier: standard
---

# Tasks — Claude Code 2.1.18x 安全护栏借鉴(v2)

## Overview

v1 已实现 R4(knowledge-quota)且通过 review;R1/R2/R3 因 5 个 P0 被打回。v2 任务聚焦**重做 R1 规则引擎 + nonce 通道、修正 R2 接入定性 + lineage 可信源、修正 R3 边界语义 + tool-health**,并补 doctor 的 bypass env 感知与文档的 sandbox 声明。R4 不变。

**总任务数**: 12。所有任务 `Verify Command` 统一用 `npm run check`。

> v1 已实现代码(destructive-guard.ts v1 / spawn-policy.ts / dispatcher 接线 / check-sandbox 接线)在 T-01~T-06 中被**替换或重写**,非增量。R4 代码(knowledge-quota.ts + learn 接线)保留不动。

## Task Dependency Graph

```json
{
  "waves": [
    ["T-01", "T-04", "T-10"],
    ["T-02", "T-05"],
    ["T-03", "T-06"],
    ["T-07", "T-08", "T-09", "T-11"],
    ["T-12"]
  ]
}
```

- Wave 1: R1 规范化引擎 RED + R2 spawn-policy 修正 RED + 文档(并行)。
- Wave 2: R1 规范化 GREEN + nonce 装配 + R2 GREEN。
- Wave 3: R1 接线(check-sandbox + config + loop nonce)+ R3 修正(depth 边界 + tool-health)。
- Wave 4: doctor(bypass env 感知)+ 契约回归 + 最终回归。
- Wave 5: ship 准备。

### Task Definitions

#### T-01 R1 规范化引擎 RED(v2 重做)
- **Goal**: 删除 v1 destructive-guard.ts,为 `normalizeCommand` + `checkDestructive`(command: string 入参)写失败测试。覆盖 P0-1 全部绕过构造:`git reset --hard=1`、`env git reset --hard`、`/usr/bin/git reset --hard`、`git --no-pager reset --hard`、`git -c k=v reset --hard`、`bash -c 'git reset --hard'`、`git checkout -- <path>`(任意 path)、`tofu destroy`、`terraform apply -destroy`。加 property test:随机非破坏性命令断言 allow(假阳性不变量,P1-4)。
- **TDD Steps**:
  - RED: 重写 `test/destructive-guard.property.test.ts`,引用新签名 `checkDestructive(command: string, ctx)` + `normalizeCommand`;`src/destructive-guard.ts` 删除后重写为存根,测试红。
- **Verify Command**: `npx vitest run test/destructive-guard.property.test.ts`(预期 fail)
- **Definition of Done**: 测试覆盖 P0-1 所有构造 + 假阳性 property;运行显式 fail。
- **Depends On**: —

#### T-02 R1 规范化引擎 GREEN + nonce 装配
- **Goal**: (a) 实现 `normalizeCommand`(剥引号/env 前缀/绝对路径/git 全局 flag/bash -c 展开)+ `checkDestructive`(command 字符串入参,内部 normalize)+ 扩展规则(tofu/apply -destroy/--stack);(b) 新增 `src/destructive-nonce.ts`:`issueRollbackNonce` / `issueAllowNonce`(写受信文件 + HMAC)、`contextFromNonce`(校验文件 + HMAC + 即焚)。
- **TDD Steps**:
  - GREEN: 实现 normalizeCommand + 规则 → T-01 转绿。
  - RED→GREEN(nonce): nonce 文件存在+HMAC 合法 → rollbackActive/userSingleAllow=true;仅 env 无文件 → false;放行后即焚(二次 deny)。
  - REFACTOR: 规则匹配抽共享 helper;HMAC 计算抽独立函数。
- **Verify Command**: `npx vitest run test/destructive-guard.property.test.ts`(全绿)+ 新增 nonce 测试
- **Definition of Done**: P0-1 所有构造 deny;nonce 即焚;HMAC 校验;biome/tsc 通过。
- **Depends On**: T-01

#### T-03 R1 接线 check-sandbox(读 config)+ loop nonce 接入
- **Goal**: (a) `src/check-sandbox.ts` Bash 分支调 `checkDestructive(command, contextFromNonce(env, projectRoot, configContent))`;(b) check-sandbox 入口读 config.md(P0-5:经共享 `extractScalarField` 从 frontmatter.ts 提取,`destructive_guard: off` 传导);(c) `skills/forge/lib/loop/instructions.md` 回滚步骤加 `issueRollbackNonce()`(P0-2:loop 自救通道);(d) 共享 `extractScalarField` 提取(P2:消除第 3 份正则副本)。
- **TDD Steps**:
  - RED: 接线测试(config.md off → hook 放行,不依赖 env;回滚 nonce 文件存在 → 放行;sandbox-allow + destructive-deny → 整体 deny)。
  - GREEN: 接线 + config 读入 + loop nonce。
  - REFACTOR: extractScalarField 共享。
- **Verify Command**: `npm run check`
- **Definition of Done**: config.md off 传导到 hook;loop 回滚经 nonce 畅通;现有 sandbox 测试全绿。
- **Depends On**: T-02

#### T-04 R2 spawn-policy 修正 RED
- **Goal**: 修正 `test/spawn-policy.test.ts`:depth 边界语义改为 `depth>=maxDepth` 拒绝(P1-5:maxDepth=5 时 depth=4 允许、depth=5 拒绝);规则名改 `spawn-tool-forbidden`;加 spawn 工具名集合覆盖(`Agent`/`Task`/`dispatch_agent`,P1-7)。
- **TDD Steps**:
  - RED: 修正测试深度边界 + 规则名 + 工具名集合;当前实现不匹配,红。
- **Verify Command**: `npx vitest run test/spawn-policy.test.ts`(预期 fail)
- **Definition of Done**: 测试覆盖修正后边界 + spawn 工具名集合;运行 fail。
- **Depends On**: —

#### T-05 R2 spawn-policy GREEN + 接入定性 + lineage 可信源
- **Goal**: (a) 实现 `SPAWN_TOOL_NAMES` 集合 + 修正 depth 语义(`depth>=maxDepth`)+ 规则名 `spawn-tool-forbidden`;(b) 接入定性:spec/design/SKILL 一致声明"经 `dispatch()` 的 spawn 才受保护",删除对不存在 `workflow-dispatcher.ts` 的引用(P0-4 选项 b);(c) `evaluateSpawnPolicy` 缺失 lineage 时 fail-secure(block)而非 skip(P1-7);(d) fail-open 分支加测试(P1-3:mock 抛错 + tool-health 写入断言)。
- **TDD Steps**:
  - GREEN: 实现 → T-04 转绿。
  - 接入: 修正 SKILL 指令路径引用 + design 声明。
  - RED→GREEN(fail-secure): 缺 lineage → block;fail-open 测试。
- **Verify Command**: `npm run check`(含契约回归)
- **Definition of Done**: depth 边界对齐;spawn 工具名集合;缺 lineage fail-secure;fail-open 有测试;SKILL 路径引用修正。
- **Depends On**: T-04

#### T-06 R3 修正(depth tool-health + 边界)
- **Goal**: (a) dispatcher 在 depth 超限拒绝时调 `appendToolHealthRecord({ event: "max-depth-exceeded" })`(P1-2);(b) depth 边界与 T-04 一致;`DEFAULT_MAX_SUBAGENT_DEPTH` 与 CONFIG_DEFAULTS 单一来源(P3)。
- **TDD Steps**:
  - RED: depth 超限 → tool-health 写入断言(当前缺失)。
  - GREEN: 加 tool-health 写入 + 单一来源常量。
- **Verify Command**: `npm run check`
- **Definition of Done**: depth 超限记 tool-health;常量单一来源。
- **Depends On**: T-05

#### T-07 R1 doctor bypass env 感知(P0-3 配套)
- **Goal**: `forge-doctor` 报告 `FORGE_ROLLBACK_NONCE` / `FORGE_ALLOW_DESTRUCTIVE` env 是否被设置;env 被设置但 nonce 文件缺失 → warn(检测潜在伪造)。同时报告 guard 是否实际激活(检测 `.tinkerman/.sandbox-active.json`,P1-1)。
- **TDD Steps**:
  - RED: env set + 无 nonce 文件 → warn;sandbox 未激活 → guard unknown。
  - GREEN: doctor 加 env 检测分支。
- **Verify Command**: `npm run check`
- **Definition of Done**: doctor 感知 bypass env + sandbox 激活状态。
- **Depends On**: T-03

#### T-08 契约回归(skill-disallowed-tools)
- **Goal**: 确认 `test/contract/skill-disallowed-tools.test.ts` 在 R2 修正后仍全绿(spawn 工具名集合不破坏静态 frontmatter 契约)。
- **TDD Steps**: 验证任务。
- **Verify Command**: `npm run check`
- **Definition of Done**: 契约测试全绿。
- **Depends On**: T-05

#### T-09 R4 回归确认(不动代码)
- **Goal**: 确认 v1 的 knowledge-quota.ts + learn 接线在 v2 修订后仍全绿(R4 未受 review 影响)。
- **TDD Steps**: 验证任务。
- **Verify Command**: `npx vitest run test/knowledge-quota.test.ts`
- **Definition of Done**: R4 测试全绿,代码不动。
- **Depends On**: —

#### T-10 文档:兼容性 + sandbox 声明(P1-1)
- **Goal**: `docs/claude-code-compatibility.md` 增 v2 修订说明 + sandbox 声明("destructive guard 仅在 --sandbox 模式生效");更新 2.1.18x 评估章节反映 nonce 机制。
- **TDD Steps**: 文档任务。
- **Verify Command**: `npm run docs:check`
- **Definition of Done**: sandbox 声明 + nonce 机制文档化。
- **Depends On**: —

#### T-11 P2/P3 质量改进(quality layer 建议)
- **Goal**: (a) doctor.ts maxSubagentDepth 超范围 message 自相矛盾修复;(b) `ALLOW` 常量改名 `ALLOW_DEFAULT`;(c) NFR-1 延迟 smoke test;(d) `isGitCheckoutDiscard` 的 `*` 分支、`hasStackTarget` 的 `--target` 长形式回归用例。
- **TDD Steps**: 小修 + 测试补充。
- **Verify Command**: `npm run check`
- **Definition of Done**: P2/P3 项清理。
- **Depends On**: T-02, T-05

#### T-12 最终全量回归 + ship 准备
- **Goal**: `npm run check` 全绿;`npm run docs` 通过;`bash scripts/build-dist.sh` 同步;确认 frozen zone 未违规。
- **Verify Command**: `npm run check && npm run docs && bash scripts/build-dist.sh`
- **Definition of Done**: 三命令全绿;准备 ship。
- **Depends On**: T-07, T-08, T-09, T-10, T-11
