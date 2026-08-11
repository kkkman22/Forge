---
topic: refactor-fix-into-build-mode
status: approved
date: "2026-05-14"
spec_ref: ".tinkerman/specs/refactor-fix-into-build-mode/spec.md"
format: full
---

# Plan: refactor/fix 退化为 forge-build 的 nature mode

> 来源: `.tinkerman/specs/refactor-fix-into-build-mode/spec.md` (locked)

## Objective

将 `forge-refactor` 和 `forge-fix` 两个独立 skill 的内容迁移为 `forge-build` 的内部分支模式（refactor mode / bugfix mode），由 `work_nature` 字段驱动。旧 skill 进入 deprecated 期。

## Key Findings

- **router.ts**: `detectWorkNature()` + `getWorkNatureSequenceKey()` 已就绪，无需变更
- **skill-scheduler.ts**: 已有 `refactor-scan/refactor-apply/fix-analyze/fix-apply` 阶段定义，无需变更
- **router-worknature.property.test.ts**: 已有 362 行 PBT 覆盖 nature 路由
- **forge-refactor SKILL.md**: 151 行，含 7 项预检 + scan/design/apply 流程
- **forge-fix SKILL.md**: 123 行，含 3 项预检 + analyze/apply/verify 流程
- **forge-refactor/references/**: method-library.md (L1-L4 方法库) + function-contracts.md (空)
- **forge-fix/references/**: function-contracts.md (空)
- **`.claude/commands/`**: 无 forge-refactor.md / forge-fix.md 命令文件（dispatcher 在 forge.md 内联）

## File Mapping

### MODIFY

| File | Reason |
|------|--------|
| `skills/forge-build/SKILL.md` | 新增 Nature Mode 路由节 |
| `.claude/commands/forge.md` | refactor/fix 子命令改为透传到 build |
| `skills/forge-refactor/SKILL.md` | 替换为 deprecated stub |
| `skills/forge-fix/SKILL.md` | 替换为 deprecated stub |

### CREATE

| File | Source |
|------|--------|
| `skills/forge-build/references/refactor-mode.md` | 迁移自 forge-refactor SKILL.md |
| `skills/forge-build/references/bugfix-mode.md` | 迁移自 forge-fix SKILL.md |
| `skills/forge-build/references/refactor-method-library.md` | 迁移自 forge-refactor/references/method-library.md |
| `skills/forge-build/references/bugfix-method-library.md` | 提取自 forge-fix SKILL.md 根因六分类 |
| `test/build-nature-mode.test.ts` | 新增契约测试 |
| `test/build-nature-mode.property.test.ts` | 新增 PBT |

### NOT CHANGED

| File | Reason |
|------|--------|
| `src/router.ts` | detectWorkNature / getWorkNatureSequenceKey 已就绪 |
| `src/skill-scheduler.ts` | refactor/fix 阶段定义已就绪 |
| `skills/forge-fix-conflicts/` | 独立辅助命令，不在本 spec 范围 |
| `skills/forge-debug/` | 独立诊断命令，不并入 |

---

## Tasks

### Task 1: Build Nature Mode 契约测试 (RED)

**Files**: Create `test/build-nature-mode.test.ts`

**RED** — 写失败测试

```typescript
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const BUILD_SKILL = "skills/forge-build/SKILL.md";
const REFS = "skills/forge-build/references";

describe("Build Nature Mode contracts", () => {
  // --- Reference file existence ---

  it("refactor-mode.md exists in build references", () => {
    expect(existsSync(resolve(REFS, "refactor-mode.md"))).toBe(true);
  });

  it("bugfix-mode.md exists in build references", () => {
    expect(existsSync(resolve(REFS, "bugfix-mode.md"))).toBe(true);
  });

  it("refactor-method-library.md exists in build references", () => {
    expect(existsSync(resolve(REFS, "refactor-method-library.md"))).toBe(true);
  });

  it("bugfix-method-library.md exists in build references", () => {
    expect(existsSync(resolve(REFS, "bugfix-method-library.md"))).toBe(true);
  });

  // --- Build SKILL.md contains Nature Mode section ---

  it("forge-build SKILL.md references Nature Mode routing", () => {
    const content = readFileSync(BUILD_SKILL, "utf-8");
    expect(content).toContain("Nature Mode");
    expect(content).toContain("refactor-mode.md");
    expect(content).toContain("bugfix-mode.md");
  });

  // --- Refactor mode content ---

  it("refactor-mode.md contains 7 pre-flight checks", () => {
    const content = readFileSync(resolve(REFS, "refactor-mode.md"), "utf-8");
    for (let i = 1; i <= 7; i++) {
      expect(content).toMatch(new RegExp(`\\|\\s*${i}\\s*\\|`));
    }
  });

  it("refactor-mode.md contains scan/design/apply phases", () => {
    const content = readFileSync(resolve(REFS, "refactor-mode.md"), "utf-8");
    expect(content).toContain("scan");
    expect(content).toContain("design");
    expect(content).toContain("apply");
  });

  // --- Bugfix mode content ---

  it("bugfix-mode.md contains 3 pre-flight checks", () => {
    const content = readFileSync(resolve(REFS, "bugfix-mode.md"), "utf-8");
    for (let i = 1; i <= 3; i++) {
      expect(content).toMatch(new RegExp(`\\|\\s*${i}\\s*\\|`));
    }
  });

  it("bugfix-mode.md contains analyze/apply/verify phases", () => {
    const content = readFileSync(resolve(REFS, "bugfix-mode.md"), "utf-8");
    expect(content).toContain("analyze");
    expect(content).toContain("apply");
    expect(content).toContain("verify");
  });

  // --- Method library content ---

  it("refactor-method-library.md contains L1-L4 classification", () => {
    const content = readFileSync(resolve(REFS, "refactor-method-library.md"), "utf-8");
    expect(content).toContain("L1");
    expect(content).toContain("L2");
    expect(content).toContain("L3");
    expect(content).toContain("L4");
  });

  it("bugfix-method-library.md contains root cause taxonomy", () => {
    const content = readFileSync(resolve(REFS, "bugfix-method-library.md"), "utf-8");
    expect(content).toContain("逻辑");
    expect(content).toContain("状态");
    expect(content).toContain("数据");
  });

  // --- Deprecation ---

  it("forge-refactor SKILL.md contains deprecation notice", () => {
    const content = readFileSync("skills/forge-refactor/SKILL.md", "utf-8");
    expect(content).toContain("deprecated");
    expect(content).toContain("refactor mode");
  });

  it("forge-fix SKILL.md contains deprecation notice", () => {
    const content = readFileSync("skills/forge-fix/SKILL.md", "utf-8");
    expect(content).toContain("deprecated");
    expect(content).toContain("bugfix mode");
  });

  // --- Dispatcher ---

  it("forge.md dispatcher routes refactor to build", () => {
    const content = readFileSync(".claude/commands/forge.md", "utf-8");
    expect(content).toMatch(/refactor.*build/i);
  });

  it("forge.md dispatcher routes fix to build", () => {
    const content = readFileSync(".claude/commands/forge.md", "utf-8");
    expect(content).toMatch(/fix.*build/i);
  });
});
```

Run: `npx vitest run test/build-nature-mode.test.ts`
Expected: FAIL — "ENOENT: no such file" (reference files not yet created)

**Estimated Time**: 5 min

---

### Task 2: Create refactor-mode.md reference

**Files**: Create `skills/forge-build/references/refactor-mode.md`

**GREEN** — 迁移 forge-refactor SKILL.md 核心内容为 build 内部分支模式

内容来源：`skills/forge-refactor/SKILL.md` + spec §Refactor Mode Behavior

结构：
1. Pre-flight Checks（7 项闸门）— 直接从 forge-refactor §2 迁移
2. Scan Phase — §3.1 迁移
3. Design Phase — §3.2 迁移
4. Apply Phase — §3.3 迁移
5. Light Tier 快速通道 — §5 迁移
6. Phase 更新 + Commit 策略 — §7 迁移

关键调整：
- 去掉独立 skill frontmatter，改为 reference 文档
- "SKILL 启动" → "build 内部按 nature=refactor 分支"
- 方法库引用改为 `refactor-method-library.md`
- Tier=light 跳过 scan/design，直接 apply

Run: `npx vitest run test/build-nature-mode.test.ts --reporter=verbose 2>&1 | grep -E "refactor-mode|pre-flight|scan.*design|apply"`
Expected: output contains "refactor-mode.md exists" and pre-flight check assertions pass

**Estimated Time**: 5 min

---

### Task 3: Create bugfix-mode.md reference

**Files**: Create `skills/forge-build/references/bugfix-mode.md`

**GREEN** — 迁移 forge-fix SKILL.md 核心内容为 build 内部分支模式

内容来源：`skills/forge-fix/SKILL.md` + spec §Bugfix Mode Behavior

结构：
1. Pre-flight Checks（3 项入口约束）— 直接从 forge-fix §Not For 迁移
2. Analyze Phase（5 步分析）— §2.1 迁移
3. Apply Phase — §2.2 迁移
4. Verify Phase — §2.3 迁移
5. 日志调试升级机制（最多 2 轮）— §3 迁移
6. Light Tier 快速通道 — §5 迁移
7. fix-note.md 模板 — §4 迁移
8. Phase 更新 + Commit 策略 — §7 迁移

关键调整：
- 去掉独立 skill frontmatter
- "SKILL 启动" → "build 内部按 nature=bugfix 分支"
- 根因分类引用改为 `bugfix-method-library.md`
- Tier=light 跳过 analyze，直接 apply

Run: `npx vitest run test/build-nature-mode.test.ts --reporter=verbose 2>&1 | grep -E "bugfix-mode|pre-flight|analyze|apply|verify"`
Expected: output contains "bugfix-mode.md exists" and pre-flight check assertions pass

**Estimated Time**: 5 min

---

### Task 4: Create refactor-method-library.md

**Files**: Create `skills/forge-build/references/refactor-method-library.md`

**GREEN** — 迁移方法库

内容来源：`skills/forge-refactor/references/method-library.md`

直接迁移 L1-L4 四层分类：
- L1: Rename | Move | Extract Constant | Extract Type | Inline
- L2: Extract Method | Extract Class | Replace Conditional | Introduce Parameter Object | Replace Temp with Query | Encapsulate Field
- L3: Split Module | Split Class | Introduce Facade | Extract Layer
- L4: Lazy Loading | Caching | Batch Processing | Memoization

Run: `npx vitest run test/build-nature-mode.test.ts --reporter=verbose 2>&1 | grep "L1-L4"`
Expected: output contains "refactor-method-library.md exists" and L1-L4 assertions pass

**Estimated Time**: 2 min

---

### Task 5: Create bugfix-method-library.md

**Files**: Create `skills/forge-build/references/bugfix-method-library.md`

**GREEN** — 提取根因六分类 + 日志升级模板

内容来源：`skills/forge-fix/SKILL.md` §2.1 Confirm 步骤 + §3 日志调试

结构：
1. 根因六分类（逻辑 / 状态 / 数据 / 并发 / 配置 / 缺防御）— 每类含典型模式 + 识别方法 + 修复策略
2. 日志调试升级模板（第 1 轮 / 第 2 轮 / 失败回退）

Run: `npx vitest run test/build-nature-mode.test.ts --reporter=verbose 2>&1 | grep "root cause"`
Expected: output contains "bugfix-method-library.md exists" and root cause assertions pass

**Estimated Time**: 3 min

---

### Task 6: Update forge-build SKILL.md — Nature Mode 路由节

**Files**: Modify `skills/forge-build/SKILL.md`

**GREEN** — 在 Overview 后新增 Nature Mode 路由节

在 §1 Overview 末尾（"Not For" 段之后）插入新节：

```markdown
## 1a. Nature Mode 路由

Build 启动时读取 `.tinkerman/status.md` → 提取 `work_nature` 字段 → 按值路由：

| work_nature | 行为 |
|-------------|------|
| `feature` (默认) | 走原有通用流程（§2-§6），不加载 nature-specific references |
| `refactor` | 加载 `references/refactor-mode.md` + `references/refactor-method-library.md` → 执行预检 → scan/design/apply |
| `bugfix` | 加载 `references/bugfix-mode.md` + `references/bugfix-method-library.md` → 执行预检 → analyze/apply/verify |

**条件加载**：仅当 `work_nature ≠ feature` 时读取对应 reference。feature mode 不读取 refactor / bugfix references。

**预检查入口闸门**：nature mode 第一步执行 nature-specific 预检查。不通过 → 结构化拒绝（`🚫 命中检查：<条目> 证据：<路径> 建议：<路由>`）→ 回路由器。

**逃生舱**：`--nature=refactor|bugfix|feature` 显式覆盖、`/forge refactor` / `/forge fix` 子命令仍可进入对应 mode。
```

保持 SKILL.md ≤150 行限制 — 只放路由表和加载策略，详细流程在 reference 文件中。

Run: `npx vitest run test/build-nature-mode.test.ts --reporter=verbose 2>&1 | grep "Nature Mode"`
Expected: output contains "references Nature Mode routing" assertions pass

**Estimated Time**: 3 min

---

### Task 7: Update forge.md dispatcher — refactor/fix 透传

**Files**: Modify `.claude/commands/forge.md`

**GREEN** — refactor/fix 子命令改为透传到 build with nature preset

将 §1 子命令表中 `refactor` 和 `fix` 行改为：

```markdown
| `refactor` | → `build` (refactor mode) | 透传 `work_nature=refactor` 到 forge-build |
| `fix` | → `build` (bugfix mode) | 透传 `work_nature=bugfix` 到 forge-build |
```

在 §1 末尾添加说明段落：

```markdown
**透传子命令**：`refactor` 和 `fix` 子命令已退化为 `build` 的内部分支模式。dispatch 逻辑：
1. 读取 `.tinkerman/status.md`
2. 写入/覆盖 `work_nature` 字段为对应值（refactor / bugfix）
3. 调用 `Skill(skill="forge", args="build")`

用户入口不变：`/forge refactor` 和 `/forge fix` 仍正常工作。
```

Run: `npx vitest run test/build-nature-mode.test.ts --reporter=verbose 2>&1 | grep "dispatcher"`
Expected: dispatcher assertions pass

**Estimated Time**: 3 min

---

### Task 8: Deprecate forge-refactor SKILL.md

**Files**: Modify `skills/forge-refactor/SKILL.md`

**GREEN** — 替换为 deprecated stub

保留 frontmatter（保持 `disable-model-invocation: true`），内容替换为：

```markdown
# /forge refactor — DEPRECATED

> ⚠️ 本 skill 已退化为 `/forge build` 的 refactor mode。
> 请使用 `/forge refactor` 或 `/forge --nature=refactor <描述>` 进入 refactor mode。
> 独立 skill 将在下个版本移除。

本文件仅在 deprecation 期内保留入口兼容性。所有重构逻辑已迁移至：
- `skills/forge-build/SKILL.md` §1a Nature Mode 路由
- `skills/forge-build/references/refactor-mode.md`
- `skills/forge-build/references/refactor-method-library.md`
```

Run: `npx vitest run test/build-nature-mode.test.ts --reporter=verbose 2>&1 | grep "refactor.*deprecated"`
Expected: deprecation assertion passes

**Estimated Time**: 2 min

---

### Task 9: Deprecate forge-fix SKILL.md

**Files**: Modify `skills/forge-fix/SKILL.md`

**GREEN** — 替换为 deprecated stub

与 Task 8 对称。保留 frontmatter，内容替换为：

```markdown
# /forge fix — DEPRECATED

> ⚠️ 本 skill 已退化为 `/forge build` 的 bugfix mode。
> 请使用 `/forge fix` 或 `/forge --nature=bugfix <描述>` 进入 bugfix mode。
> 独立 skill 将在下个版本移除。

本文件仅在 deprecation 期内保留入口兼容性。所有修复逻辑已迁移至：
- `skills/forge-build/SKILL.md` §1a Nature Mode 路由
- `skills/forge-build/references/bugfix-mode.md`
- `skills/forge-build/references/bugfix-method-library.md`
```

Run: `npx vitest run test/build-nature-mode.test.ts`
Expected: exit 0

**Estimated Time**: 2 min

---

### Task 10: Create build-nature-mode.property.test.ts (PBT)

**Files**: Create `test/build-nature-mode.property.test.ts`

**GREEN** — 性质测试：nature × tier 路由一致性

测试性质：
1. 对所有 nature × tier 组合，`getCommandSequence` 返回有效阶段序列
2. refactor mode 的阶段序列始终以 review 结尾（light）或包含 test+ship（standard）
3. bugfix mode 的阶段序列始终包含 fix-apply
4. feature mode 不包含 refactor/fix 特定阶段
5. 所有 nature × tier 组合的阶段序列不含占位符
6. `getWorkNatureSequenceKey` 与 `getCommandSequence` 对应关系一致

Run: `npx vitest run test/build-nature-mode.property.test.ts`
Expected: exit 0

**Estimated Time**: 5 min

---

## Self-Check

| Check | Result |
|-------|--------|
| Spec Coverage | 每条验收标准至少被一个任务覆盖 |
| Placeholder Scan | 零占位符 |
| Type Consistency | 所有文件引用存在 |
| Dependencies | T1→T2-T9, T10 独立 |
| Plan Structure | 10 tasks, 0 split triggers (≤15 files, 单模块) |

### Spec 验收标准覆盖

| # | 验收标准 | 任务 |
|---|---------|------|
| 1 | router 判定 refactor → build refactor mode → 7 项预检 → scan → design → apply | T2 + T6 |
| 2 | router 判定 bugfix → build bugfix mode → 预检 → analyze → apply → verify | T3 + T6 |
| 3 | router 判定 feature → 走通用流程，不加载 refactor/bugfix 方法库 | T6 |
| 4 | `/forge refactor` / `/forge fix` 仍工作 | T7 |
| 5 | `--nature=feature` 覆盖时不进 refactor 分支 | T6 |
| 6 | refactor 预检第 1 项命中时结构化拒绝 | T2 |
| 7 | bugfix 日志升级 2 轮失败 → 回 analyze | T3 |
| 8 | tier=light 跳过 scan/analyze | T2 + T3 |
| 9 | feature mode 不读取 refactor/bugfix references | T6 |
| 10 | 旧 skill deprecated 期内可被 dispatch 入口调用 | T7 + T8 + T9 |
| 11 | 主包 skill 计数减少 2（deprecation 期满后） | T8 + T9 |
| 12 | 三态验证覆盖 refactor + bugfix | T2 + T3 |
