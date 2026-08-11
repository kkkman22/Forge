---
audit: "CI / Build Script Audit — Subtraction Pass (Fifth Cut)"
date: "2026-08-11"
basis: "ADR-0009 (Subtraction Strategy)"
scope: "scripts/ 下 check-* / validate-* / lint-* 共 58 个文件（≈40 逻辑检查，.mjs/.sh 双实现计为一个检查的两个文件）。runtime hook 见 hook-audit-2026-08-11.md。"
verdict_legend:
  keep: "🟢 留 — 真外部性（安全 / 质量 / 契约 / 刹车延伸）"
  degrade: "🟡 退化 — 留核心砍过严"
  cut: "🔴 砍 — 元维护警察（立即或随减法失效）"
---

# CI / Build Script Audit — Fifth Cut

## 核心洞察（先于表格）

**58 个文件里，真保障软件质量的 ~12 个，其余 ~46 个（80%）是「Forge 维护自身脚手架的警察」。**

这些警察校验的不是用户的代码质量，是 Forge 自己的元数据：
- skill 多长 / skeleton 对不对 / 描述规范不规范
- agent 是否重复 / symlink 完整
- router 有没有新类型 / 有没有 anti-noise / golden task 回归
- docs 配额 / 根白名单 / 陈旧度 / updated 字段 / index 同步
- iron-law 名唯一 / registry parity / dispatcher skeleton

**关键判断：这 58 个是 Forge 复杂度的「症状」，不是「病因」。**

- 病因 = 38 命令 + 27 agents + 三级路由 + 全套 skill/docs 治理体系（ADR-0009 要砍的）
- 症状 = 需要一堆警察来维护这套复杂度的一致性

**推论：ADR-0009 减法做完（命令收敛 / 路由退化 / skill 简化 / docs 瘦身），大量元维护警察自动失业——不需要逐个删，它们会随依赖消失而失效。**

按 Existence Test 四类：这些脚本几乎不落在「纪律 / 品味 / 风险 / 记忆」任何一类——它们是**工具自维护税**，不产出外部软件质量。

## 汇总

| 判定 | 逻辑检查数（约） | 说明 |
|------|------------------|------|
| 🟢 留 | 12 | 真质量 / 安全 / 契约 / 刹车延伸 |
| 🟡 退化 | 5 | 留核心，砍过严规则 |
| 🔴 立即砍 | 6 | 纯风格 / 统计，无外部性 |
| 🔴 随减法失效 | ~17 | router/skill/docs/agent/dispatcher/registry 元维护——待 ADR-0009 各刀落地后清理 |
| **合计** | **~40 逻辑（58 文件）** | 留 12 / 砍+退化 ~28（**70%**） |

---

## 🟢 留（12）— 真外部性 / 安全 / 契约

| 脚本 | 职责 | Existence 归类 | 理由 |
|------|------|----------------|------|
| `check-shell-pipefail.mjs` | 校验 user-facing .sh 设 pipefail | 风险判断 | 防静默失败，安全门禁 |
| `check-doc-links.ts` | docs 内部链接 + anchor 校验 | 品味（可用性） | 文档可用性，用户直接感知 |
| `check-spec-contract.sh` | spec 契约 + 证据校验 | 纪律强制力 | 需求实现门禁 |
| `check-domain-safety.mjs` | reference domain 安全红线巡逻 | 风险判断 | 安全 |
| `check-frozen.sh` / `check-frozen-zone-invariants.mjs` | 冻结区不变量 | 纪律（刹车延伸） | 配合 runtime frozen hook |
| `check-evolution-marker-zones.mjs` | 冻结/只读区标记泄漏扫描 | 纪律（刹车延伸） | 防 .tinkerman/ 篡改 |
| `check-no-execsync.sh` | 禁 src/ 用 execSync | 品味（性能） | 防同步阻塞 |
| `check-no-bare-console.sh` | 禁 bare console.* | 品味（日志规范） | 代码质量 |
| `check-public-api.mjs` | barrel @public/@internal 校验 | 契约（ADR-0002） | 公开 API 外部契约 |
| `check-dist-sync.mjs` | src/dist 漂移检测 | 风险（运行时正确性） | scripts 直读 dist，漂移破坏 runtime |
| `check-pyramid-ratio.ts/.sh` | 测试金字塔比例（ADR-0006 Req7） | 品味（测试结构） | 留，但可议 |

## 🟡 退化（5）— 留核心砍过严

| 脚本 | 职责 | 退化动作 |
|------|------|----------|
| `validate-scripts-help.mjs` | §2.8 help 要求 | 留（宪法 §2.8 仍有效），简化规则 |
| `validate-knowledge.sh` | 知识库校验 | 留（知识库是 ADR-0009 保留项），放宽条目数限制 |
| `check-spec-status.mjs` | spec 状态清单 | 留，但随 specs 历史精简而简化 |
| `lint-evolved-rules.mjs` | evolved-rules rule_count 一致性 | 留，规则砍到 ≤15 后压力大降 |
| `validate-plugin-manifest.mjs` | plugin.json workflows | 留（plugin 保留，ADR-0009 分发形态节） |

## 🔴 立即砍（6）— 纯风格 / 统计，无外部性

| 脚本 | 职责 | 砍理由 |
|------|------|--------|
| `check-iron-law-name-uniqueness.sh` | IRON-LAW/HARD-GATE 名唯一 | 铁律减少后无意义；命名规范 biome 可管 |
| `check-unused-module.mjs` | 未用模块扫描 | tsc + biome 已覆盖 |
| `check-readme-metrics.sh` | README 指标 | 统计非门禁 |
| `check-purity.ts` | docs-governance 纯度（禁 child_process/Date） | 过度约束生成器 |
| `check-spec-close-coverage.mjs` | spec close 覆盖 | 随 specs 精简失效 |
| `lint-pack-rules.mjs` | pack lint 规则 | pack 体系若精简则失效 |

## 🔴 随减法失效（~17 逻辑）— 元维护警察，待各刀落地后清理

| 类别 | 脚本 | 随哪刀失效 |
|------|------|-----------|
| **router 元维护** | `check-router-no-anti-noise` / `check-router-no-new-types` / `check-router-zero-regression` | ADR-0009 第二刀（路由退化） |
| **skill 元维护** | `validate-skill-length`(.mjs+.sh) / `validate-skill-descriptions`(.mjs+.sh) / `validate-skill-skeleton`(.mjs+.sh) / `check-skill-function-refs` | skill 体系简化（第三刀相关） |
| **docs 治理** | `check-docs-quota` / `check-docs-root-whitelist` / `check-docs-staleness` / `check-docs-updated` / `check-docs-index` / `check-doc-structure` | docs 治理瘦身 |
| **agent 元维护** | `check-agent-links` / `check-agent-originality` / `lint-agents` | agents 收缩到评审为主 |
| **dispatcher/registry** | `check-dispatcher-skeleton` / `check-registry-parity` | 命令收敛（38→几条） |

> 这些**不立即删**（删了现 Forge 会 CI 红）。标注「随依赖消失而失效」——ADR-0009 各刀落地时，对应脚本一并清理。

---

## package.json check 链瘦身建议

当前 `check:strict` 串了一长串（部分）：
```
check-skill-function-refs → validate-skill-length → validate-skill-skeleton →
check-evolution-marker-zones → validate-scripts-help → check-shell-pipefail →
lint-evolved-rules → verify-evolved-rule-infra-refs → check-dist-sync →
bundle-mcp --check → normalize-hook-paths → lint-agents →
check-agent-originality → check-agent-links → ...
```

**减法后应保留的最小 check 链**（~8 项）：
```
tsc --noEmit && biome check && vitest run &&
check-shell-pipefail && check-dist-sync && check-public-api &&
check-domain-safety && check-frozen-zone-invariants
```

砍掉的 ~14 项（skill/docs/router/agent 元维护）——随各刀失效后从链上摘除。

## 执行建议

1. **第一批立即砍 6 个**（纯风格/统计）：`check-iron-law-name-uniqueness` / `check-unused-module` / `check-readme-metrics` / `check-purity` / `check-spec-close-coverage` / `lint-pack-rules`。grep 无强制 caller 后删，从 `check:strict` 链摘除。
2. **退化 5 个**：放宽规则不删脚本（`validate-knowledge` 条目数、`lint-evolved-rules` 阈值）。
3. **随减法失效 17 类**：不立即动，在 ADR-0009 各刀的 spec 里挂「同步清理这些脚本」TODO。
4. **保留 12 个**：每次模型/工具升级后重评 `check-pyramid-ratio` / `check-no-bare-console` 是否已被 biome/tsc 覆盖。

## 与 hook 审计合并视图

| 审计 | 范围 | 留 | 砍+退化 | 砍占比 |
|------|------|-----|---------|--------|
| runtime hook | 31 | 14 | 17 | 52% |
| CI 脚本 | ~40 逻辑（58 文件） | 12 | ~28 | 70% |
| **合计** | **71** | **26** | **~45** | **63%** |

**两轮审计共砍/退化 ~63%**。Forge 的 runtime + 自维护拦截面收缩到 ~26 个真外部性机制。印证 ADR-0009 判断：当前体量 ~3x 于必要。
