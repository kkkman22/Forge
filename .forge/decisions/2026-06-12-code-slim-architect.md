---
perspective: architect
topic: code-slim-0612
date: 2026-06-12
tier: full
risk_rating: 中
---

# Architect 视角 — 全项目代码精简

## 核心结论
本项目冗余空间真实但分散——**不存在大块死代码**（最大 5 模块均已接入 entry），ROI 集中在 barrel re-export 冗余、纯函数模块的细粒度未引用 export、以及多模块共有的 parse/validate/normalize 重复签名；按"模块+共享主题"双层拆分，先低风险 barrel 清理再逐模块深入。

## 风险评级
中（dist tracked + 626 测试是强保护，但 src 改动 ×156 文件的 dist 同步量是主要摩擦）

## 冗余识别方法（附实测证据）
- **Barrel re-export 冗余扫描**（最高 ROI、最低风险）：`grep '^export \*' src/**/*.ts` 找 barrel，再核对显式 re-export。实测 `src/error-recovery/index.ts:5-11` 用 `export *` 重新导出 7 子模块，`:12` 又 `export { PHASE_SEQUENCES, TEST_FILE_PATTERNS }`——同一符号两条路径，删除 `:12` 零行为变化。decide/schemas/review/index.ts 同模式需逐一核。
- **未引用 export 扫描**（R10 合规）：`grep -RIn 'export.*<fn>' src/` 收敛到 1。实测 196 个顶层 export 跨 50 文件，但高密度集中在 `state.ts`(24)/`status-file-ext.ts`(14)/`zoom-out.ts`(10)/`error-recovery/types.ts`(25)——这些大文件需逐 export 核 caller，建议跑 `ts-prune`（项目无此依赖时用 grep 双向校验 entry 文件 build/plan/spec/review/ship/loop.ts）。
- **疑似孤儿模块验证**：实测 `skip-trace`→被 post.ts 引入、`read-cache-hash`→被 forge-read-cached.ts 引入、`error-recovery/reconciler`→barrel 引入、`zoom-out`→skill-function-registry+dispatcher 引入——**5 个全部非孤儿**。唯一待终验：`docs-governance/root-whitelist.ts` 仅自引用 SCRIPT_NAME，需 ts-prune 确认无外部 caller。
- **重复函数签名聚类**：实测 `parse*`(15)/`validate*`(14)/`normalize*`/`redact*` 跨模块重复——如 `parseStatusFileGraceful`/`parseReviewReportGraceful`/`parseConfigGraceful`(state.ts+config-store.ts) 结构同构，是 canonical+adapter 合并候选（R12）。

## 模块拆分方案（按 ROI/风险排序，每项独立 feature 分支）
1. **barrel re-export 清理** — 空间=中 风险=**低**（删幂等 re-export，`tsc+vitest` 即可证）。先做，建立 dist-sync 流程肌肉。
2. **error-recovery (1200 行)** — 空间=中 风险=低（纯函数、barrel 隔离、types.ts 25 export 是主战场；删 `index.ts:12` 冗余 + 收敛 parseGitStatus/parseGitLog 等同族）。
3. **docs-governance (2825 行)** — 空间=中 风险=中（9 文件，staleness/link-checker/quota 互相独立可并行；root-whitelist 终验后或删或留）。
4. **review-comment-bitbucket (1559 行)** — 空间=中 风险=**中**（wire 进 post.ts/reconcile.ts，parse-review/format/finding-hash 是 hash 重复区；reconcile 逻辑改动高敏感，**只做删死代码不动 reconcile 主流程**）。
5. **mcp (2884 行)** — 空间=小 风险=**高**（ADR-0002 capability scope + typed-capabilities 锁定，read-cache/forge-exec 是 runtime 热路径；**建议只做 forge-exec.ts 内部 12 个小函数的合并，不动 register* 入口**）。
6. **共享 parse/validate/normalize 去重** — 空间=中 风险=中（跨模块，放最后，须建 adapter 层不能只重命名——R12）。

## 平衡档边界
- **允许**：删幂等 barrel re-export / 删经 grep+entry 双向核验的真死代码 / 合并结构同构纯函数（canonical+adapter）/ 适度内联单调用点函数
- **不允许**：改任何 `register*`/CLI/公开 export 签名 / 跨模块移动文件（破坏 import 路径触发 dist 风暴）/ 触碰 ADR-0002/0003/0004/0007 锁定边界 / 删疑似孤儿模块（必须 ts-prune 终验）

## 回归防护
1. 每步 `npx tsc --noEmit`（R11，catch 类型回归）+ `npx vitest run`（626 测试，catch 行为回归）
2. 每 feature 分支结束 `npm run dist:resync` 同步 dist/src/**（R6，hooks 运行时读 dist）
3. 删函数前 `grep -RIn 'import.*<fn>' src/` + 核 entry 文件（R10 wire 完整性）
4. 626 测试是行为等价的最强证据——**测试不动**，它们是 refactor 的安全网而非重构对象

## 相关文件
- `/Users/king/code/Forge/src/error-recovery/index.ts`（barrel 冗余样本，:12 可删）
- `/Users/king/code/Forge/src/docs-governance/root-whitelist.ts`（待 ts-prune 终验的疑似孤儿）
- `/Users/king/code/Forge/src/mcp/tools/forge-exec.ts`（12 函数合并候选，runtime 热路径高风险）
- `/Users/king/code/Forge/src/state.ts`（24 export，parse* 同族合并主战场）
- `/Users/king/code/Forge/src/error-recovery/types.ts`（25 export 高密度文件）
