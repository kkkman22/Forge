---
feature: agency-borrow-02-catalog-governance
layout: design
created: 2026-06-23
spec_ref: ".forge/specs/agency-borrow-02-catalog-governance/requirements.md"
---

# Catalog 治理四件套 — 设计文档

## 概述

从 agency-agents 移植两类核心治理脚本:查重(`check-agent-originality`)与 lint(`lint-agents`),用 Node 重写(Forge 脚本惯例是 `.mjs`,非 bash)。与 spec #1 的 `check-agent-sync` 串成门禁链。

## 设计决策

### D1: 实现语言——Node `.mjs` 而非移植 bash

- **问题**:agency-agents 用 bash(`lint-agents.sh`)+ Python(`check-agent-originality.sh` 内嵌 Python)。Forge 移植成什么?
- **候选**:(a) 原样移植 bash+Python;(b) 全部 Node `.mjs`。
- **选择**:**b**。理由:Forge 的 scripts 惯例是 `.mjs`(见 `forge-sync-runtime.mjs`/`check-bundle-sync.mjs`),跨平台一致(macOS bash 3.2 限制多);Node 单语言降低维护成本。
- **风险**:Python 的 shingle/Jaccard 算法需重写。**缓解**:算法简单(40 行),且 Node 的 `Set` 天然适合 Jaccard。

### D2: 查重的实体中性化策略

- **问题**:agency-agents 中性化的是地域/平台专有名词(vietnam/tiktok 等)。Forge 该中性化什么?
- **选择**:针对 Forge 场景,中性化三类实体:
  1. **agent 自身 name**(防"quality-check" vs "quality-checker" 仅名不同)。
  2. **其他 agent 的 name 集合**(同上)。
  3. **常见工具名**(`Read/Grep/Glob/Bash/Write/Edit/Agent/WebSearch`)——因为所有 agent 都会列工具,不中性化会拉高基线相似度。
- **实现**:正则把上述实体替换为 `__ENT__` 占位符后再 shingle。
- **风险**:过度中性化掩盖真实重叠。**缓解**:工具名中性化是必要的(否则基线偏高),但 agent 指令正文的核心逻辑词不中性化。

### D3: lint 的 ERROR vs WARN 分级

- **问题**:哪些 frontmatter/section 问题该阻断(ERROR),哪些仅警告(WARN)?
- **选择**:对齐 agency-agents 与 Forge 铁律:
  - **ERROR(阻断)**:`name`/`description` 缺失(无标识则 agent 不可用)、CRLF(LF 是 Forge 标准)。
  - **WARN(不阻断)**:缺推荐 section、正文过短。
- **理由**:ERROR 聚焦"agent 能否被识别和正确派发";WARN 聚焦"agent 质量是否达标"。符合 §3.3 的 P0/P1(阻断)与 P2/P3(建议)分级精神。

### D4: 门禁链的执行顺序与短路

- **问题**:lint / originality / sync 三门禁如何排序?
- **选择**:`lint → originality → sync`,前者失败短路。
- **理由**:lint 是最便宜的(纯格式校验),先跑;originality 中等(shingle 计算);sync 最贵(需跑 convert 对比)。先排除廉价错误再算贵的。这也符合 fail-fast。

## 接口设计

```
scripts/check-agent-originality.mjs
  [files...]           # 指定文件(CI 模式,校验改动);空=全库审计
  环境 ORIGINALITY_FAIL=40 ORIGINALITY_WARN=20

scripts/lint-agents.mjs
  [files...]           # 指定文件;空=全 agents/
  --strict             # WARN 也视为失败(可选)

npm run check 子步骤:
  node scripts/lint-agents.mjs            && \
  node scripts/check-agent-originality.mjs $(git diff --name-only) && \
  node scripts/check-agent-sync.mjs
```

## 数据模型

查重用数据结构:
```js
// 每个 agent 预处理为 shingle 集合
{ file: "agents/quality-check.md",
  shingles: Set<string>,  // 8-gram,实体中性化后
  name: "quality-check" }
// 两两 Jaccard: |A∩B| / |A∪B|
```

## 风险

| 风险 | 缓解 |
|------|------|
| shingle 计算对大库慢 | Forge 当前 agent 规模小(spec#1 快照约 25 个),两两比对 ~300 次,O(n²) 可接受;未来超 100 时再优化 |
| 误报(相似但合理的 agent,如 spec-check 与 quality-check 职责相近) | 阈值留宽裕(FAIL 40%,基线 1.5%);WARN 不阻断;可经 env 调阈 |
| 与 spec #1 的 sync 门禁职责混淆 | 文档明确:lint/originality 管"agent 内容质量",sync 管"派生目录一致性" |
| R3 的分组校验范围蔓延 | 明确标 P2 且依赖"未来引入分组"前提,当前不实现 |
