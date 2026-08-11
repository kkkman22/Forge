---
name: ponytail-adoption
feature: ponytail-adoption
layout: tasks
created: "2026-06-18"
updated: "2026-06-18"
---

# Ponytail YAGNI 纪律借鉴 — 任务分解

## 波次总览

| Wave | 主题 | Tasks | 验证 |
|------|------|-------|------|
| Wave 1 | forge-build YAGNI 闸门 + 硬边界 | 1.1, 1.2 | agent 定义一致性 |
| Wave 2 | quality-check Deletions 维度 | 2.1 | review 流程不破坏 |
| Wave 3 | `forge:defer` 标记 + learn 回收 | 3.1, 3.2 | knowledge 闭环 |
| Wave 4 | 校验与回归 | 4.1 | `npm run check` 全绿 |

**依赖**：Wave 1/2/3 互相独立，可并行。Wave 4 依赖前 3 波完成。

---

## Wave 1: forge-build YAGNI 闸门 + 硬边界

### Task 1.1 — forge-build.toml 插入 Pre-task YAGNI 闸门

**文件**：`.codex/agents/forge-build.toml`

**改动**：在 Core Flow 第 2 步（读 spec）和第 3 步（TDD RED）之间，插入 "2.5 Pre-task YAGNI gate" 小节。

**内容要点**（实际文案以 build 阶段为准）：
- 5 rung 阶梯（rung 1 跳过 / rung 2 stdlib / rung 3 原生 / rung 4 引用 dependency-discipline.md / rung 5 一行）。
- rung d 文字写 `见 skills/forge/lib/build/references/dependency-discipline.md`，不复制内容（D2）。
- rung f 文字写 `进 TDD GREEN（既有 step 3）`（D1）。
- 跳过/替代记录格式：`yagni-skip` / `yagni-replace`，写进 `.tinkerman/progress/<topic>.md`。

**TDD 提示**：本任务是 agent 定义文件（toml）的文本编辑，不涉及运行时代码。Forge 的 TDD 铁律针对实现代码；agent 定义修改的验证是"双副本一致性 + 校验脚本"，不是单元测试。按既有 agent 定义修改惯例执行（参考 `.codex/agents/forge-build.toml:1-92` 现有结构）。

**验证**：
- [ ] `forge-build.toml` Core Flow 含 "2.5 Pre-task YAGNI gate"。
- [ ] rung d 引用 `dependency-discipline.md`，不含被引文件的内容。
- [ ] 跳过/替代记录格式明确。

### Task 1.2 — forge-build Self-Review 增加硬边界 + 双副本同步

**文件**：`.codex/agents/forge-build.toml`、`.claude/agents/forge-build.md`

**改动 a**（toml）：在 `forge-build.toml:63-70` Self-Review 段，现有三项自审（完整性/质量/纪律）后，追加第四项"硬边界"，含 5 类不可简化项（信任边界校验 / 防数据丢失错误处理 / 安全措施 / 可访问性 / spec 显式要求）。

**改动 b**（双副本）：`.claude/agents/forge-build.md` 同步 Task 1.1 的 YAGNI 闸门 + 本任务的硬边界。遵循 Forge 双 agent 副本惯例（`.codex` 与 `.claude` 保持一致）。

**验证**：
- [ ] `forge-build.toml` Self-Review 含"硬边界"小节，5 类齐全。
- [ ] 现有三项自审保留不变。
- [ ] `.claude/agents/forge-build.md` 与 `.codex/agents/forge-build.toml` 在 YAGNI 闸门 + 硬边界两处内容一致。
- [ ] 若有 agent 定义一致性校验脚本，通过（build 阶段确认脚本名）。

---

## Wave 2: quality-check Deletions 维度

### Task 2.1 — quality-check.toml 新增 Dimension 8: Deletions

**文件**：`.codex/agents/quality-check.toml`

**改动**：在既有 Dimension 7 Deslop（`.codex/agents/quality-check.toml` "### 7. Deslop"）之后，新增 "### 8. Deletions"。

**内容要点**：
- 5 标签表（delete / stdlib / native / yagni / shrink）+ 含义。
- 输出格式：追加在 `## Layer 2 — Code Quality` 报告末尾的 `### Deletions` 子表 + `net: -N lines possible.` 结尾。
- 与 Deslop 的边界说明（正交，异味 vs 该删）。
- 无可删项兜底：`Lean already. Ship.`。
- 不改动 Turn Budget Discipline（Deletions 扫描用 grep，成本低）。

**验证**：
- [ ] `quality-check.toml` 含 "### 8. Deletions"。
- [ ] 既有 Dimension 1-7（含 Deslop）不变。
- [ ] Deletions 输出格式明确（子表 + net 行）。
- [ ] 若 `.claude/agents/` 有 quality-check 副本则同步（build 阶段确认）。

---

## Wave 3: `forge:defer` 标记 + learn 回收

### Task 3.1 — forge-build 新增 defer 标记说明 + deferred.md 创建

**文件**：`.codex/agents/forge-build.toml`、`.tinkerman/knowledge/deferred.md`、`.claude/agents/forge-build.md`

**改动 a**（toml）：在 forge-build.toml 适当位置（Self-Review 之后或独立小节）新增 "deferred decisions" 说明：
- `forge:defer` 注释格式（三段式：已知上限 / 升级触发条件 / 升级路径）。
- 何时使用（做了简化且知道上限时）。
- 不滥用约束（每条必须有可量化的升级触发条件，D4 风险缓解）。

**改动 b**（台账）：创建 `.tinkerman/knowledge/deferred.md`，初始模板含表头说明 + 空表（日期/Feature/文件:行/已知上限/升级触发/升级路径）+ 置信度说明（无量化触发条件的条目 learn 阶段标低置信度）。

**改动 c**（双副本）：`.claude/agents/forge-build.md` 同步 defer 说明。

**验证**：
- [ ] `forge-build.toml` 含 `forge:defer` 格式说明。
- [ ] `.tinkerman/knowledge/deferred.md` 存在，含表头 + 空表。
- [ ] `.claude/agents/forge-build.md` 同步。

### Task 3.2 — learn instructions 新增 defer 回收步骤

**文件**：`skills/forge/lib/learn/instructions.md`（或等效 learn 主文件，build 阶段确认路径）

**改动**：在 learn 的经验提取流程中，新增一步（放在"扫描本次 build 产物"环节）：
- grep 本次 build 涉及文件中的 `forge:defer` 注释。
- 解析三段式，汇总写进 `.tinkerman/knowledge/deferred.md`。
- 对无量化升级触发条件的条目标 Confidence < 0.3（沿用 §4.2 清理逻辑）。

**验证**：
- [ ] learn instructions 含 `forge:defer` 回收步骤。
- [ ] 回收步骤明确写入 `deferred.md`。
- [ ] 置信度降级规则与 §4.2 一致。

---

## Wave 4: 校验与回归

### Task 4.1 — 全量校验

**命令**：`npm run check`

**验证**：
- [ ] `npm run check` 全绿（tsc + biome + vitest + public-api + dist-sync + skill/doc 校验）。
- [ ] skill-length 检查通过（本 spec 改动主要是 agent toml/md + 1 个 knowledge md，skill 体积增量可控）。
- [ ] 若有 agent 定义一致性校验（`.codex` vs `.claude` 副本），通过。
- [ ] git diff 复核：改动文件清单 = `forge-build.toml` / `forge-build.md` / `quality-check.toml` / `deferred.md` / learn instructions，无意外文件。

---

## 文件改动清单（预估）

| 文件 | Wave | 改动类型 |
|------|------|---------|
| `.codex/agents/forge-build.toml` | 1.1, 1.2, 3.1 | 新增小节（YAGNI 闸门 / 硬边界 / defer 说明） |
| `.claude/agents/forge-build.md` | 1.2, 3.1 | 同步 .codex 副本 |
| `.codex/agents/quality-check.toml` | 2.1 | 新增 Dimension 8 |
| `.tinkerman/knowledge/deferred.md` | 3.1 | 新建 |
| `skills/forge/lib/learn/instructions.md` | 3.2 | 新增回收步骤 |

**无运行时代码改动**（`src/` 不变），本 spec 是纯 agent 指令 + 文档调整。
