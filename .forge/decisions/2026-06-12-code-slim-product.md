---
perspective: product
topic: code-slim-0612
date: 2026-06-12
tier: full
risk_rating: 中高
---

# Product 视角 — 全项目代码精简

## 核心结论
这是一个高回归风险、低功能收益的内部技改，ROI 完全取决于"是否用更少的代码/更清晰的结构，换来后续维护者每次改动更快、更少出 bug"——必须以维护负担和回归保护为度量，而非行数。

## 风险评级
**中高**（等价 refactor 容易因认知成本导致隐性回归，而 Forge 自身契约文件密集）

## ROI 判定框架
1. **重复消除 + 触达面广**：同一逻辑被 ≥2 个模块复制（如 finding-hash 类标记/哈希模式、config 读取），消除后未来任一处 bugfix 只改一处 → 高 ROI。
2. **回归保护强度倒推优先级**：只动那些有 co-located `<name>.test.ts` 覆盖的代码；无测试的大体积模块先补测试再精简，否则禁止动。
3. **改动可逆性**：纯内部 pure function（如 loop/three-strike、finding-hash）低风险先动；契约/边界（MCP 协议、Bitbucket marker 格式、CLI 行为）即便冗余也低 ROI。

## 模块优先级
- **高**：`error-recovery`(1200)、`docs-governance`(2825)、`review`(1049)——内部逻辑为主、有 types.ts 抽象、测试可补，去重收益直接落到维护成本。
- **中**：`grill`(817)、`decide`(787)、`pack`(847)、`loop`(764)——多为纯决策/编排函数，体量适中，按 slice 渐进精简。
- **低**：`mcp`(2884)、`review-comment-bitbucket`(1559)——MCP 是对外协议契约，Bitbucket marker/comment 格式是外部可观察行为，冗余也尽量不动或仅去死代码。

## 非目标 / 取舍警示
1. **不动任何可观察契约**：MCP tool 名称/参数、CLI 退出码与 stdout、Bitbucket marker 正则/hash 算法、`forge init` 生成产物——重构即破坏。
2. **不动安全/门禁控制**：`state-file-locking`、`branch-protection`、three-strike 触发逻辑、sandbox 检测——行为变更等于绕过铁律。
3. **不把"看起来重复"当目标**：constitution/glossary/ADR 契约性文本、`.claude/rules/*` 即便有冗余也不在本次范围（属文档治理，非代码 refactor）。

## 可维护性量化建议
- 用"每次 PR 的回归 bug 数（review 阶段 P0/P1）"作为前后对比指标，而非 LOC 删减量；精简前后各观察 N 个真实改动，回归率应 ≤ 基线。
- 记录每个模块精简前后的"新成员首次改动耗时"（sample 1 个真实小任务），把"可维护性"落到时间维度。

## 参考文件
- /Users/king/code/Forge/src/mcp/server.ts
- /Users/king/code/Forge/src/loop/three-strike.ts
- /Users/king/code/Forge/src/review-comment-bitbucket/finding-hash.ts
