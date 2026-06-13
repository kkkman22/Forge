---
id: "ADR-0008"
title: "Code Slim Strategy — Module-Sliced Equivalence Refactor"
status: accepted
date: "2026-06-12"
deciders:
  - "@maintainer"
related_adrs:
  - "ADR-0002"
  - "ADR-0003"
  - "ADR-0004"
  - "ADR-0007"
---

# ADR-0008: Code Slim Strategy — Module-Sliced Equivalence Refactor

## Context

Forge 代码库增长到 src/ 172 文件 ~16K 行 + scripts/ 156 文件 + test/ 626 文件，且 `dist/` tracked in git（hooks 运行时直接读）。需要精简以降低维护成本，但必须保证对外行为完全不变（公开 API/CLI/MCP tool/Bitbucket marker 均为外部契约）。

`/forge decide` 四视角（product/architect/security）+ Critic 交叉审查发现：

1. **无大块死代码**——最大 5 模块均已接入 entry；冗余分散在 barrel re-export 幂等、纯函数未引用 export、跨模块 parse/validate 同名函数。
2. **`src/deprecated.ts`（152 行）是真正的死代码**——v2.4→v2.5 迁移 shim，标注 v2.5.0 移除而当前 v3.4.0（契约已到期），唯一 caller 是测试类型断言。Critic 发现，主 agent 验证（R9）。
3. **"建 adapter 层去重"与精简目标矛盾**——新增抽象 ≠ 精简；且实测 `parseGitLog` 有 3 套不同签名/语义（recap.ts/fix-recovery.ts/git-scanner.ts），合并必改调用方契约=违反行为不变。
4. **scripts/ 是 dist 真实 consumer**——check-frozen/init/bump-version 等 10+ 脚本直 `import dist/src/*.js`，src 路径漂移会破坏 hooks 运行时。
5. **测试是重构对象而非纯安全网**——`barrel-file.test.ts` 硬编码 `toHaveLength(140)`，删公开 export 须同步改魔数。

## Decision

1. **按 6 个子任务拆分精简**，每项独立 feature 分支，按 ROI/风险排序：
   (1) 删 deprecated.ts → (2) barrel re-export 清理 → (3) error-recovery → (4) docs-governance → (5) review-comment-bitbucket（仅删死代码）→ (6) mcp（仅内部小函数合并，不动 register* 入口）。
2. **激进度=平衡**：仅删铁定死代码 + 经 grep+entry 双向核验的未引用 export + 同构纯函数合并 + 适度内联；每改动以 `tsc --noEmit && vitest run` 为安全网。
3. **剔除"adapter 层去重"**——新增抽象层违反精简目标；签名/语义不同的同名函数（如 `parseGitLog` 三套）不在本次范围。
4. **精简禁止重命名/移动被 scripts import 的 src 路径**——scripts 直读 `dist/src/*.js`，路径漂移破坏 hooks 运行时（R6 不对称风险）。
5. **测试作为重构对象**：`barrel-file.test.ts` 的 export 数断言随精简更新；改前核对公开 API 契约 ADR（0002/0003）。安全测试（`*-parity.test.ts`、`test/security/*`）不得删除。
6. **删除 `src/deprecated.ts`**——契约已到期，纳入子任务 #1。

## Consequences

### Positive

- 精简可控、每步可独立验证（行为等价有 tsc+626 测试 + dist-sync 三重证据）
- 不引入新抽象债，ROI 落在维护成本而非 LOC
- 每子任务独立分支，回归可隔离、可回滚
- 清理 152 行真死代码（deprecated.ts）及散落的 barrel/未引用 export

### Negative

- 精简收益分散（无大块死代码），单子任务 LOC 收益有限
- `dist/src/**` 同步是每个子任务的持续摩擦（R6）
- `barrel-file.test.ts` export 魔数需手动维护，易遗忘导致 CI 失败
- mcp/docs-governance 等大模块的精简空间受 ADR 锁定边界限制，实际可动较少
