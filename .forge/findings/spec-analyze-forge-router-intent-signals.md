# Analyze Requirements 预检报告（含两轮记录）

**评审对象**: `.forge/specs/forge-router-intent-signals/requirements.md`
**评审者**: spec-check (Analyze Requirements mode, delegated subagent — §3.1 separation)
**ADR**: `.forge/decisions/ADR-0006-router-intent-signals.md` (accepted)

---

## Round 2（最终轮）— 2026-05-23

**判定：✅ PASS** — 可锁定 requirements.md 进入 design 阶段。

### 上轮 Issue 修复确认

| # | 上轮 Severity | 维度 | 状态 | 修复评估 |
|---|--------------|------|------|----------|
| 1 | P1 | 遗漏 (router 零回归) | ✅ 已修 | R1 末条新增 golden snapshot CI 守门 `check-router-zero-regression.mjs`；≥ 20 条 golden 任务描述、字段差异非零阻断；可观测、可执行、EARS 合规 |
| 2 | P1 | 遗漏 (prompt-defense 优先级) | ✅ 已修 | R7-6/7/8 三条 acceptance 覆盖 `ThreatSeverity` 四级；critical/high 抑制 intent、medium 双信号共存、low 无额外约束；与 `src/prompt-defense.ts` 实际枚举对齐 |
| 3 | P2 | 一致性 (`--help` vs CLI flag) | ✅ 已修 | Glossary 新增"既有基线 CLI 表面"条目 + R5-6 加注引用 |
| 4 | P2 | 歧义 (缺省 source 读/写) | ✅ 已修 | R1-2 严格按建议拆为序列化层 + SKILL 容错两条断言 |
| 5 | P2 | 歧义 (取消判定) | ✅ 已修 | Glossary 新增"取消语义关键词集"（9 个中英关键词 + NFC + case-insensitive 全词匹配） |
| 6 | P2 | 歧义 (反向去噪 CI) | ✅ 已修 | R3-3 改为 AST 扫描，明示不依赖纯文本正则 |
| 7 | P2 | EARS (R2-3 策略性补充) | ✅ 已修 | 拆出 Implementation Note 引用 ADR-0004 |
| 8 | P2 | EARS (R6 系统主语) | ✅ 已修 | R6-3 改为 `scripts/lint-evolved-rules.mjs` 主语；PR 描述要求挪到 Process Note |
| 9 | P2 | EARS (R7-4 元引用) | ✅ 已修 | 替换为显式编号"R7 第 2 条规则" + 新增独立断言 |
| 10 | P2 | 一致性 (双阈值变量) | ✅ 已修 | Glossary 显式定义 `MAX_DICT_INTENTS = 8` / `MAX_RUNTIME_INTENT_HINTS = 5`，R6-1/R6-4 引用变量名 |
| 11 | P3 | EARS (R4-3 自我削弱) | ✅ 已修 | Glossary 新增"Intent Hints 小节"条目，R4-3 主句精简 |

### 五维度结论（最终）

| 维度 | 结论 | P0 | P1 | P2 | P3 |
|---|---|---|---|---|---|
| 一致性 | ✅ pass | 0 | 0 | 0 | 0 |
| 歧义 | ✅ pass | 0 | 0 | 0 | 0 |
| 冲突 | ✅ pass | 0 | 0 | 0 | 0 |
| 遗漏 | ✅ pass | 0 | 0 | 0 | 0 |
| EARS 合规 | ✅ pass | 0 | 0 | 0 | 1 |

### 新发现 Issue

| # | Severity | 维度 | 位置 | Issue | 修复建议 |
|---|----------|------|------|-------|----------|
| 12 | P3 | EARS | R1-6, R2-4 | 复合 acceptance 包含两个独立条件，理想拆分为两条 | 可在 design 阶段补 unit test 覆盖时一并拆分；不阻断 lock |

### 总体判定

- [x] **PASS** — 可锁定 requirements 进入 design 阶段
- [ ] CONDITIONAL PASS
- [ ] FAIL

**下一步**：

1. 切 frontmatter `status: locked`
2. 按 `forge-spec` skill 自动推进规则进入 design.md 生成
3. design 阶段需把 R7-6/7/8 的 prompt-defense × intent 优先级翻译为
   `src/router-intents.ts` 的具体调用顺序伪码

---

## Round 1（历史记录） — 2026-05-23

**判定：CONDITIONAL PASS** — 0 P0 / 2 P1 / 7 P2 / 1 P3

### Round 1 Issue 清单（全部已在 Round 2 处理，详见上方修复确认表）

#### P1 必修项

| # | 维度 | 位置 | Issue | 修复建议 |
|---|------|------|-------|----------|
| 1 | 遗漏 | R1 / R7 | Glossary 定义零回归约束但全文无 router 维度 acceptance；R4 仅覆盖 SKILL 维度 | 增补 golden snapshot CI 守门 |
| 2 | 遗漏 | R7 | 未声明 intent × prompt-defense 同时命中时的优先级 | 增补四级 severity 处理规则 |

#### P2 建议项

| # | 维度 | 位置 | Issue |
|---|------|------|-------|
| 3 | 一致性 | R5-5 | `/forge --help` 与"不暴露 CLI flag"承诺表面冲突 |
| 4 | 歧义 | R1-1 | 缺省 source 读/写两侧语义未明 |
| 5 | 歧义 | R5-2 | "取消 intent 信号"缺判定阈值 |
| 6 | 歧义 | R3-3 | "剥离类正则"举例非穷尽 |
| 7 | EARS | R2-3 | 末段策略性补充非可观测 |
| 8 | EARS | R6-3/5 | 动作主语在自然人而非系统 |
| 9 | EARS | R7-4 | "上一条规则"是元引用 |
| 10 | EARS / 一致性 | R6-1 vs R6-4 | 双阈值常量易混淆 |

#### P3 风格建议

| # | 维度 | 位置 | Issue |
|---|------|------|-------|
| 11 | EARS | R4-3 | "缺失不阻断"在 acceptance 内自我削弱可测性 |
