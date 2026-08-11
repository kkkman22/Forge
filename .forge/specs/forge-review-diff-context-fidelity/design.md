---
feature: forge-review-diff-context-fidelity
layout: design
created: 2026-05-17
---

# Bugfix Design Document

## Overview

修复 `/forge review` 流程中 `.forge/reviews/.diff-context.md` 由主 agent 手工产出导致 narrative summary 替代真实 unified diff hunk 的 prompt-following bug。修复策略遵循 bug condition 方法（详见 bugfix.md "Bug Condition"）：

- **C(X)**：主 agent 在 Step 1.5 写 `.diff-context.md` 时 `## Patch` 段不含 unified diff hunk 标志（`@@`/`---`/`+++`）。
- **¬C(X)**：`.diff-context.md` 含真实 patch hunk，subagent 不需要重新调 forge_git。
- **F → F'**：（A）实现 `scripts/prepare-diff-context.mjs` 把手工 4 步换成单一 bash 调用，脚本直接复用 `truncateDiffContent` pure function 写真实 patch；（B）契约测试 + 可选 PostToolUse hook 守护防退化。

修复采用两阶段 rollout：

- **Stage 1（脚本化主路径 + 文档同步，可独立验证）**：实现 `scripts/prepare-diff-context.mjs`、改 SKILL.md §2.0 + `references/diff-context-preparation.md`，让用户跑一次 `/forge review` 在主 agent 会话验证 quality-check 是否恢复完整 Layer 2 报告。验证通过即说明 A 方向可继续 Stage 2。
- **Stage 2（契约测试 + 可选 hook 守护，防退化）**：实现 `test/contract.diff-context.test.ts`（unified diff 标志扫描）+ PBT；可选实现 PostToolUse hook 在 Write `.diff-context.md` 时校验。CI + 运行时双层守护。

## Glossary

- **Bug Condition (C)**：`.diff-context.md` 的 `## Patch` 段不含 unified diff 标志的 prompt-following 错误。
- **Unified Diff Hunk Markers**：`@@ -... +... @@` 标志、文件头 `--- a/<path>` + `+++ b/<path>`、行级 `+`/`-` prefix 中的任意一个。Hunk 体本身的 byte 完全性不要求严格 round-trip（截断中间也算 valid hunk），但**至少有一个上述 marker** 是契约下界。
- **Narrative Summary**：以 "See forge_git output"、"Key changes:"、`- ` bullet list 起头且 全文 0 个 unified diff marker 的内容。Bug Condition 的具象形式。
- **Mandatory Investigation Set**：review subagent 启动后必走的 tool 调用最小集（forge_git first step + 任意 Read fixture）。本 spec 修复目标是让该集合 byte 等价 Stage 2 baseline，subagent 不必重新调 forge_git。
- **F**：修复前的 Step 1.5 实现 — 主 agent 手工执行 SKILL.md §2.0 step 1-4，无任何代码层守护。
- **F'**：修复后的 Step 1.5 — 主 agent 单一 `bash node scripts/prepare-diff-context.mjs` 调用 + `test/contract.diff-context.test.ts` CI 守护 + 可选 PostToolUse hook 运行时守护。
- **`truncateDiffContent`**：现有 pure function（`src/mcp/tools/forge-git.ts:86`），接收原始 git diff 字符串，按 file-priority 截断到 `DIFF_CONTENT_MAX_LINES = 1500`。本 spec 在脚本中 import 复用，零 MCP 依赖。
- **Patch Hunk Detection**：契约扫描函数，对一段文本做正则匹配 `/^@@ .+ @@/m` 或 `/^--- a\//m` 或 `/^\+\+\+ b\//m`；任一命中即视为含 hunk。
- **Stage 1 Smoke**：仅 Stage 1 提交后跑一次 Real `/forge review`，对 review target 含 ≥ 20 行非测试改动的 fixture 观察 quality-check 是否完整。
- **Stage 2 Smoke**：Stage 2 提交后跑一次 Real `/forge review`，验证契约 + （可选）hook 守护对故意写入 narrative summary 的退化场景的拦截行为。

## Bug Details

### Bug Condition (Restated for design)

```
FUNCTION isBugCondition(diffContextPath)
  INPUT: diffContextPath = .forge/reviews/.diff-context.md
  OUTPUT: boolean

  body := readFileSync(diffContextPath, "utf-8")
  patchSection := extractSection(body, ["## Patch", "## Diff Content"])
  hasHunkMarker := /(?:^@@ .+ @@)|(?:^--- a\/)|(?:^\+\+\+ b\/)/m.test(patchSection)

  RETURN NOT hasHunkMarker
END FUNCTION
```

### Examples

- **Example 1 — Stage 4 实测 narrative**：`## Patch` 段是 `See forge_git diff-content output. Single file change: agents/spec-check.md.` + bullet list，0 个 hunk marker → C(X) = true。
- **Example 2 — 修复后正确路径**：`## Patch` 段含 `--- a/agents/spec-check.md` + `+++ b/agents/spec-check.md` + `@@ -1,8 +1,9 @@` + 多行 `+`/`-` 行 → C(X) = false。
- **Example 3 — fallback shell 路径**：脚本通过 `git diff ${BASE}...HEAD | head -3000` 写入未排序但完整的 patch hunk → C(X) = false（与优先路径同 schema）。
- **Edge Case — 空 diff**：review target 是 0 文件改动的特殊情况。`truncateDiffContent` 输入空字符串返回 `"（无 diff 内容）"`。脚本应**保留**这种语义（hasHunkMarker = false 但合法），契约测试需排除"空 diff"特例（通过检查 `file_count` frontmatter 字段）。

## Hypothesized Root Cause

事实校准 V4 后的 root cause 链（来自 bugfix.md "Hypothesized Root Cause Summary"）：

1. **H3 (CONFIRMED)**：缺少自动化路径，主 agent 必须手工 4 步拼接。grep 实证仓库无任何代码实现。
2. **H4 (CONFIRMED)**：缺少防退化机制，无契约测试覆盖 `.diff-context.md` schema。
3. **H1, H2 (LIKELY)**：SKILL.md §2.0 step 4 措辞偏 narrative-friendly + step 3→4 隐式跳跃 — 修复 H3 后这两个失去触发机会（主 agent 不再自由发挥 step 4）。

修复方向 A（脚本化）治 H3 + H1/H2；方向 B（契约 / hook 守护）治 H4。两者组合是最小但充分的修复。

## Expected Behavior

### Preservation Requirements

- 主 agent 在所有非 review 流程上的行为不变。
- review subagent 自身的 prompt + frontmatter byte-equal 前序两个 spec 的产出（不动 `agents/*.md` / `.codex/agents/*.toml`）。
- hook 注入预算适配（前序 spec `subagent-hook-context-budget`）行为不变。
- `.diff-context.md` frontmatter schema 不变（`base / head / file_count / total_added / total_removed / truncated / source`）。
- forge_git MCP fallback 路径（`git diff ... | head -3000`）保留，且与主路径一致地写真实 hunk。
- review target 是 0 文件改动的特殊情况下 `## Patch` 段输出 `（无 diff 内容）` 文案，契约测试豁免该路径。
- `mergeReviewResults` / `Subagent_Summary_Protocol` 出口路径不变。

**Scope:**

All inputs that do NOT involve `/forge review` Step 1.5 should be unaffected by this fix. Specifically:

- 主 agent 在 `/forge plan` / `/forge build` / `/forge ship` / `/forge debug` 等命令上的所有 hook / prompt / 工具调用行为。
- review subagent 在 prompt 层的 Turn Budget Discipline / Final Report Block / Step 0 forge_git IRON-LAW / optional Step 0.5 行为。
- review subagent 启动后读 `.diff-context.md` 的解析逻辑（仍是 prompt 内的解析，不在脚本范围）。

**Note:** Property 1 / Property 2 / Property 3 / Property 4 / Property 5（见 §Correctness Properties）共同覆盖 C(X) → unified diff hunk + ¬C(X) → byte-equal 两类语义。

## Correctness Properties

### Property 1: Bug Condition — Unified Diff Hunk Always Present

_For any_ `/forge review` 调用 where review target diff is non-empty, after Step 1.5 完成时，`.forge/reviews/.diff-context.md` 的 `## Patch` 段 SHALL 含至少一个 unified diff hunk marker（`/^@@ .+ @@/m` ∨ `/^--- a\//m` ∨ `/^\+\+\+ b\//m`）。

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 2: Preservation — Empty Diff Edge Case

_For any_ `/forge review` 调用 where review target diff is empty (file_count = 0)，`.forge/reviews/.diff-context.md` 的 `## Patch` 段 SHALL 输出 `（无 diff 内容）`（沿用 `truncateDiffContent` 现有语义）。契约测试 SHALL 在 `file_count === 0` 时豁免 hunk marker 检查。

**Validates: Requirements 2.6**

### Property 3: Preservation — Fallback Path Schema Equivalence

_For any_ `/forge review` 调用 where forge_git MCP unavailable（脚本走 shell `git diff ...` fallback），`.forge/reviews/.diff-context.md` 的 frontmatter `source: shell_fallback` AND `## Patch` 段 SHALL 仍含 unified diff hunk marker（与优先路径同 schema）。

**Validates: Requirements 2.6**

### Property 4: Preservation — Frontmatter Schema Stability

_For any_ `.diff-context.md` 由本 spec 引入的脚本写入时，frontmatter 的 7 个字段（`base / head / file_count / total_added / total_removed / truncated / source`）SHALL 全部存在且类型不变。任何字段缺失或类型偏离 → 契约测试 FAIL。

**Validates: Requirements 3.3**

### Property 5: Preservation — Subagent Tool Whitelist + Hook Layer Untouched

_For any_ change introduced by this spec，全部修改 SHALL 仅落在以下范围：
- 新建：`scripts/prepare-diff-context.mjs`、`test/contract.diff-context.test.ts`、可选 `test/contract.diff-context.property.test.ts`
- 修改：`skills/forge-review/SKILL.md` §2.0、`skills/forge-review/references/diff-context-preparation.md`
- 可选修改：`hooks/hooks.json` / `.claude-plugin/plugin.json` PostToolUse 段（仅当 design 阶段决定加 hook 守护时）

`agents/*.md` / `.claude/agents/*.md` / `.codex/agents/*.toml` / `scripts/lib/hook-stdin-router.mjs` / `scripts/inject-plan-context.mjs` / `scripts/inject-evolved-rules.mjs` / `scripts/cmux-mirror/*` / `.claude/settings.json` / `.claude-plugin/plugin.json` UserPromptSubmit + SessionStart 段 / `hooks/hooks.json` UserPromptSubmit + SessionStart 段 byte-equal 修复前。

**Validates: Requirements 3.1, 3.2, 3.5**

## Architecture

### Modification Inventory

| # | File | Section / Change | Stage |
|---|------|------------------|-------|
| ① | `scripts/prepare-diff-context.mjs` | NEW — 单一 entry script，读取 BASE_BRANCH，调 `git diff` shell，import 复用 `truncateDiffContent`，写完整 frontmatter + `## Diff Stat` + `## Patch` 段到 `.forge/reviews/.diff-context.md` | Stage 1 |
| ② | `skills/forge-review/SKILL.md` §2.0 | 把现有 4 步手工流程改写为单一 `bash node scripts/prepare-diff-context.mjs` 调用；保留 fallback 描述 | Stage 1 |
| ③ | `skills/forge-review/references/diff-context-preparation.md` | 同 ②，保持文档与 SKILL 同步 | Stage 1 |
| ④ | `test/contract.diff-context.test.ts` | NEW — 契约扫描，断言 `## Patch` 段含 unified diff hunk marker（除空 diff 豁免）；frontmatter schema 完整 | Stage 2 |
| ⑤ | `test/contract.diff-context.property.test.ts` | NEW — PBT，任意 mutation 移除 hunk marker → 契约扫描 FAIL；任意合法 patch → 扫描 PASS | Stage 2 |
| ⑥ | `hooks/hooks.json` + `.claude-plugin/plugin.json` PostToolUse 段 | 可选 — Write `.diff-context.md` 时调用 `scripts/check-diff-context-integrity.mjs` 校验 hunk marker；不通过 → 阻断 + 提示 retry | Stage 2 (optional) |
| ⑦ | `scripts/check-diff-context-integrity.mjs` | 可选 NEW — 接收 `$TOOL_INPUT_FILE` env，校验 `.diff-context.md` 是否含 hunk marker | Stage 2 (optional) |

### Stage Topology

```
Stage 1 (script + docs) — independent commit
┌─────────────────────────────────────────────────────────────┐
│  scripts/prepare-diff-context.mjs (NEW)                     │
│  ├── import { truncateDiffContent } from src/mcp/tools/forge-git.ts │
│  ├── shell `git diff ${BASE}...HEAD`                        │
│  ├── shell `git diff --stat ${BASE}...HEAD`                 │
│  ├── 计算 frontmatter (base / head / file_count / +/- / truncated / source) │
│  └── writeFileSync .forge/reviews/.diff-context.md          │
│                                                              │
│  skills/forge-review/SKILL.md §2.0 — 4 steps → 1 bash call  │
│  references/diff-context-preparation.md — sync              │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                Real /forge review (Stage 1 Smoke)
                          │
                          ▼
        quality-check 完整 Layer 2 报告? ───┐
                          │                  │
                       Yes│                No│ → debug, 调整脚本
                          ▼                  │   再回 Stage 1
Stage 2 (contract + optional hook)            │
┌─────────────────────────────────────────────────────────────┐
│  test/contract.diff-context.test.ts (NEW)                   │
│  test/contract.diff-context.property.test.ts (NEW)          │
│  hooks/hooks.json PostToolUse — 可选 hook 守护              │
│  scripts/check-diff-context-integrity.mjs — 可选            │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                Real /forge review (Stage 2 Smoke)
                          │
                          ▼
        三个 subagent 全绿 + 故意写 narrative 时 CI/hook 拦截?
                          │
                       Yes│ → spec closure
```

### Out of Scope

- **forge_git 主路径保留**：本 spec **不**让脚本调用 MCP forge_git（脚本进程做不到）。脚本走 shell `git diff` + 复用 `truncateDiffContent` pure function，schema 等价 forge_git 输出。SKILL.md 的"forge_git MCP 优先 + shell fallback"两条路径在本 spec 后**统一**为"脚本走 shell（内部已带智能截断）"。SKILL 文档需明确这一变化（不再分主/降级）。
- **`.codex/agents/*.toml` 依然不动**：本 spec 仅触 SKILL 文档与脚本/测试，不动 agent definitions。
- **`Subagent_Summary_Protocol`**：出口摘要由 `context-budget-management` spec 负责，本 spec 不动。
- **LLM-preamble known-limitation**：仍属 known-limitation，本 spec 不试图修复。

## Components

### Component 1: `scripts/prepare-diff-context.mjs` (NEW)

唯一的脚本化主路径。零 MCP 依赖。

**Public Contract**:

```
Usage:
  node scripts/prepare-diff-context.mjs

Behavior:
  1. Determine BASE_BRANCH:
     BASE = $(git merge-base main HEAD 2>/dev/null) || echo "HEAD~1"
  2. Capture HEAD: HEAD_SHA = $(git rev-parse HEAD)
  3. Run `git diff --stat ${BASE}...HEAD` → diffStat
  4. Run `git diff ${BASE}...HEAD -- ':(exclude)*.lock' ':(exclude)package-lock.json' ':(exclude)dist/*' ':(exclude)*.d.ts'` → rawDiff
  5. Apply truncateDiffContent(rawDiff) → truncatedDiff
  6. Compute file_count / total_added / total_removed / truncated from diffStat & rawDiff
  7. Write .forge/reviews/.diff-context.md:
     ---
     base: <BASE>
     head: <HEAD_SHA>
     file_count: <N>
     total_added: <N>
     total_removed: <N>
     truncated: <true|false>
     source: shell_with_truncate_lib
     ---

     ## Diff Stat
     <diffStat>

     ## Diff Content
     <truncatedDiff>

Exit codes:
  0 — success
  1 — git command failed (no main/HEAD)
  2 — file system error (write failed)

Side effects:
  Always writes .forge/reviews/.diff-context.md (overwrite if exists).
  No other I/O.
```

**Implementation key points**:

```javascript
#!/usr/bin/env node
// category: internal-only
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { truncateDiffContent } from "../dist/src/mcp/tools/forge-git.js";

const OUTPUT_PATH = ".forge/reviews/.diff-context.md";
const EXCLUDE_GLOBS = [":(exclude)*.lock", ":(exclude)package-lock.json", ":(exclude)dist/*", ":(exclude)*.d.ts"];

function tryExec(cmd) {
  try { return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim(); }
  catch { return null; }
}

const base = tryExec("git merge-base main HEAD") || "HEAD~1";
const head = tryExec("git rev-parse HEAD");
if (!head) { process.stderr.write("ERROR: cannot resolve HEAD\n"); process.exit(1); }

const stat = tryExec(`git diff --stat ${base}...HEAD`) || "";
const rawDiff = tryExec(`git diff ${base}...HEAD -- ${EXCLUDE_GLOBS.join(" ")}`) || "";
const truncated = truncateDiffContent(rawDiff);
const wasTruncated = truncated.length < rawDiff.length;

// parse stat for file_count / total_added / total_removed
const fileMatches = stat.match(/^.+? \| /gm) || [];
const fileCount = fileMatches.length;
const summaryLine = stat.match(/(\d+) insertions?\(\+\),?\s*(\d+) deletions?\(-\)/) || stat.match(/(\d+) insertions?\(\+\)/) || stat.match(/(\d+) deletions?\(-\)/);
const totalAdded = summaryLine ? Number.parseInt(summaryLine[1] ?? "0", 10) : 0;
const totalRemoved = summaryLine && summaryLine[2] !== undefined ? Number.parseInt(summaryLine[2], 10) : 0;

const content = `---
base: ${base}
head: ${head}
file_count: ${fileCount}
total_added: ${totalAdded}
total_removed: ${totalRemoved}
truncated: ${wasTruncated}
source: shell_with_truncate_lib
---

## Diff Stat

${stat || "（无 diff stat）"}

## Diff Content

${truncated}
`;

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, content);
process.stdout.write(`Wrote ${OUTPUT_PATH}\n`);
```

**重要细节**：

- 复用 `truncateDiffContent`：从 `dist/src/mcp/tools/forge-git.js` import（pure function，无副作用、无 MCP 依赖）。前提是 `dist/` 已构建。fallback：如果 import 失败（例如 dist 未生成）→ 不截断，直接 `head -c 200000` shell 兜底（保证脚本不阻断 review）。
- 排除 glob 与 SKILL §2.0 step 3 fallback 路径一致（lock / package-lock / dist / d.ts）。
- 文件 count / 行数从 stat 文本 parse；现行 SKILL 也是这做法。
- `source` 字段统一写 `shell_with_truncate_lib`（非 `forge_git` 也非 `shell_fallback`），明示这是脚本化路径。

### Component 2: `skills/forge-review/SKILL.md` §2.0 改写 (MODIFY)

把 4 步手工流程压缩为单一 bash 调用。改写前后对比：

**改写前**（现有）:

```
1. **确定基准**：BASE_BRANCH=$(git merge-base main HEAD 2>/dev/null || echo "HEAD~1")
2. **获取 diff stat**：git diff --stat ${BASE_BRANCH}...HEAD
3. **获取 diff 内容（带智能截断）**：优先 forge_git(...), MCP 不可用时降级到 git diff ... | head -3000
4. **写入** .forge/reviews/.diff-context.md，frontmatter ...，正文为 diff stat + 截断后的 patch
```

**改写后**:

```
**单一调用**：

```bash
node scripts/prepare-diff-context.mjs
```

脚本自动执行：
- 确定 BASE_BRANCH（git merge-base main HEAD，fallback HEAD~1）
- 取 diff stat 与 diff content
- 应用智能截断（按文件优先级 + 单文件 200 行 / 总量 1500 行上限）
- 写入 `.forge/reviews/.diff-context.md`

**禁止**：手工拼接 narrative summary 替代真实 patch hunk。脚本输出含 unified diff
hunk（`@@ ... @@` 标记）的真实内容；如脚本不可用（构建未完成等）→ fallback shell：
`git diff ${BASE}...HEAD | head -3000` 并直接写入 `## Diff Content` 段，**不要** 替
换为 narrative summary。
```

### Component 3: `references/diff-context-preparation.md` (MODIFY)

与 SKILL.md §2.0 同步改写，保留详细步骤说明（脚本内部已封装），新增"为什么禁止 narrative summary"段引用 Stage 4 现象。

### Component 4: `test/contract.diff-context.test.ts` (NEW)

契约扫描。Stage 2 主测试。

```typescript
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PATH = ".forge/reviews/.diff-context.md";
const HUNK_MARKERS = [
  /^@@ .+ @@/m,            // hunk header
  /^--- a\//m,              // file head (---)
  /^\+\+\+ b\//m,           // file head (+++)
];

function parseFrontmatter(content) { /* same as agent-prompt-discipline.test.ts */ }

describe("Contract: .diff-context.md fidelity", () => {
  it("file exists when /forge review has been initialized", () => {
    if (!existsSync(PATH)) return; // gracefully skip when no review in progress
    expect(existsSync(PATH)).toBe(true);
  });

  it("frontmatter has all 7 required fields", () => {
    if (!existsSync(PATH)) return;
    const { fields } = parseFrontmatter(readFileSync(PATH, "utf-8"));
    for (const k of ["base", "head", "file_count", "total_added", "total_removed", "truncated", "source"]) {
      expect(fields[k], `frontmatter missing ${k}`).toBeDefined();
    }
  });

  it("Patch section contains unified diff hunk markers (unless empty diff)", () => {
    if (!existsSync(PATH)) return;
    const content = readFileSync(PATH, "utf-8");
    const { fields } = parseFrontmatter(content);
    if (fields.file_count === "0") return; // empty-diff exemption
    const patchSection = content.split(/^## (Patch|Diff Content)/m)[2] || "";
    const hasMarker = HUNK_MARKERS.some((re) => re.test(patchSection));
    expect(hasMarker, "## Patch section must contain at least one unified diff marker (@@ / --- / +++)").toBe(true);
  });

  it("Patch section does not contain narrative-summary anti-pattern", () => {
    if (!existsSync(PATH)) return;
    const content = readFileSync(PATH, "utf-8");
    const patchSection = content.split(/^## (Patch|Diff Content)/m)[2] || "";
    // Anti-pattern: starts with "See forge_git" or pure bullet list with no diff markers
    const hasAntiPattern = /^(\s*See forge_git|\s*Key changes:\s*\n\s*-)/m.test(patchSection);
    if (hasAntiPattern) {
      expect(HUNK_MARKERS.some((re) => re.test(patchSection)), "narrative summary must be accompanied by real hunk markers (or removed)").toBe(true);
    }
  });
});
```

### Component 5: `test/contract.diff-context.property.test.ts` (NEW, optional but recommended)

PBT 形式锁定契约扫描的 totality。生成任意 patch 字符串，断言：

- 含 `@@ ... @@` 的字符串始终被识别为有 marker。
- 不含 hunk marker 的纯 narrative 字符串始终被识别为 missing marker。
- frontmatter 字段缺失始终被检测出。

### Component 6: PostToolUse Hook 守护（可选）

如果 Stage 2 需要运行时拦截，加 PostToolUse hook：

```
"PostToolUse": [
  {
    "matcher": "Write|Edit",
    "if": "Write(.forge/reviews/.diff-context.md)|Edit(.forge/reviews/.diff-context.md)",
    "hooks": [{
      "type": "command",
      "command": "node forge/scripts/check-diff-context-integrity.mjs \"$TOOL_INPUT_FILE\" 2>/dev/null || node scripts/check-diff-context-integrity.mjs \"$TOOL_INPUT_FILE\" 2>/dev/null",
      "timeout": 5
    }]
  }
]
```

`check-diff-context-integrity.mjs` 校验内容含 hunk marker；不通过 → exit 2 阻断 + stderr 提示 retry。

**取舍**：design 阶段倾向**先不加 hook**（CI 契约测试 + 脚本化主路径已足够覆盖正常路径）。如 Stage 2 Real Smoke 仍发现主 agent 退化，再加 hook 作为兜底。

## Data Models

无新数据模型。本 spec 复用现有 `truncateDiffContent` pure function 与 `.diff-context.md` frontmatter schema，不引入新接口。

## Fix Implementation

### Stage 1 Changes

**File**: `scripts/prepare-diff-context.mjs` (NEW)

按 Component 1 实现。关键约束：

1. import `truncateDiffContent` from `dist/src/mcp/tools/forge-git.js`（pure function 复用）。
2. fallback：`truncateDiffContent` import 失败时直接 `head -c 200000` 兜底（保证脚本不阻断）。
3. 脚本自我测试：可加 `--dry-run` flag（不写文件，只 print 内容）便于 contract test 验证。

**File**: `skills/forge-review/SKILL.md` §2.0 (MODIFY)

按 Component 2 文本改写。

**File**: `skills/forge-review/references/diff-context-preparation.md` (MODIFY)

按 Component 3 改写。

### Stage 2 Changes

**File**: `test/contract.diff-context.test.ts` (NEW)

按 Component 4 实现 + 4 个测试用例。

**File**: `test/contract.diff-context.property.test.ts` (NEW, optional)

按 Component 5 实现 PBT。

**File**: `hooks/hooks.json` + `.claude-plugin/plugin.json` PostToolUse 段（可选，仅当 Stage 2 Smoke 触发需要）

按 Component 6 添加。

### Verification Order

每段对应一次原子提交 + 一次 Stage 验证：

1. **Stage 1 commit**：`scripts/prepare-diff-context.mjs` + SKILL.md §2.0 + references 文档；跑 `node scripts/prepare-diff-context.mjs --dry-run` 自检。
2. **Stage 1 manual smoke**：跑 Real `/forge review`，观察 quality-check 是否完整 Layer 2 报告。
3. **Stage 2 commit batch**：契约测试 + 可选 PBT；如 Stage 1 主路径有效但仍想加运行时守护，加 hook。
4. **Stage 2 manual smoke**：在 Real review 中故意写错 `.diff-context.md`（手工 narrative），跑 `npx vitest run test/contract.diff-context.test.ts` 验证 CI 拦截；如有 hook，验证 Write 时阻断。

## Testing Strategy

### Validation Approach

测试分三层：契约层（断言 `.diff-context.md` 含 unified diff marker）+ Real Smoke（端到端验证 quality-check 是否恢复完整 Layer 2 报告）+ 回归（前序两个 spec 全部测试零回归）。

### Exploratory Bug Condition Checking

**Goal**：在 fix 应用前确认 C(X) 在 Stage 0 仍然可复现。

**Test Plan**：直接读 `.forge/reviews/.diff-context.md`（Stage 4 的产物），断言 `## Patch` 段不含 hunk marker。这本身是 Real Smoke 已记录的现象，无需重复——直接引用 `.forge/findings/subagent-foreground-truncation-stage4.md` § quality-check Detailed Analysis 作为 counterexample。

### Fix Checking

**Goal**：验证修复应用后，C(X) 不再出现。

```
FOR ALL reviewTarget WHERE forge review is initiated DO
  result := postFixDiffContextPrep(reviewTarget)
  ASSERT NOT isBugCondition(result):
    result.diffContextFile.patchSection contains hunk markers
    AND quality-check completes with full Layer 2 report
END FOR
```

### Preservation Checking

**Goal**：验证 ¬C(X) 路径（脚本主路径与 fallback 路径）字节级保留。

**Test Plan**：

1. 跑 Real `/forge review` 在前序 spec Stage 2 fixture 上（49 plans + 9580 byte evolved-rules + 小 review target）。比较修复前 quality-check 输出 vs 修复后输出，断言 Layer 2 报告 byte-equal（允许 ≤ 5% 自然语言波动）。
2. 故意 unset `forge_git` MCP（移除 dist/...）模拟 fallback 路径，跑同样 review，断言 fallback 路径也写出 hunk markers。

### Unit Tests

- **`test/contract.diff-context.test.ts`** (NEW)：4 个用例 — 文件存在 + frontmatter 7 字段 + Patch 段 hunk marker（除空 diff 豁免）+ narrative summary anti-pattern 检测。
- **`test/contract.diff-context.property.test.ts`** (NEW, optional)：3 个 PBT — hunk marker totality + narrative recognition + frontmatter integrity。

### Integration Tests

- **Stage 1 Smoke**（手工）：跑一次 `/forge review`，预期 quality-check 完整 Layer 2 报告 + spec-check 完整 Layer 1 + security-check 完整 Layer 3。
- **Stage 2 Smoke**（手工）：手工把 `.forge/reviews/.diff-context.md` 改成 narrative summary，跑契约测试，预期 FAIL。如有 hook，预期 Write 时阻断。

### PBT Targets

- 任意合法 unified patch 字符串 → 契约扫描函数返回 `{passes: true}`。
- 任意 narrative summary 字符串（无 `@@` / `---` / `+++`）→ 契约扫描函数返回 `{passes: false}`。
- 任意 frontmatter 缺失字段 → 契约扫描函数返回 `{passes: false, reasons: [missing <field>]}`.

## Migration / Rollout

### Stage 1: Script + Docs

**Scope**:

- NEW: `scripts/prepare-diff-context.mjs` (Component 1)
- MODIFY: `skills/forge-review/SKILL.md` §2.0 (Component 2)
- MODIFY: `skills/forge-review/references/diff-context-preparation.md` (Component 3)

**为什么独立**：

- 主路径 + 文档同步是一组，独立可回滚。
- 不动测试也不动 hook，不影响 CI 行为；唯一变化是主 agent 在 review 时调用方式不同。
- Stage 1 完成后即可立刻 Real Smoke 验证 — 主修复落地。

**Verification commands**:

```bash
# 1. 脚本自检（dry-run）
node scripts/prepare-diff-context.mjs --dry-run

# 2. 实际跑一次（写 .diff-context.md）
node scripts/prepare-diff-context.mjs

# 3. 跑前序 spec 测试零回归
npx vitest run test/agent-prompt-discipline.test.ts \
                test/agent-prompt-discipline.property.test.ts \
                test/hook-stdin-router.test.ts \
                test/hook-stdin-router.property.test.ts \
                test/inject-plan-context.test.ts \
                test/inject-evolved-rules.test.ts \
                test/cmux-sync-once.subagent-skip.test.ts \
                test/hooks-config-integrity.property.test.ts \
                test/non-frozen-hook-preservation.property.test.ts \
                test/contract.hooks.test.ts

# 4. Real Smoke (manual, in Claude Code main agent)
/forge review
```

**Decision gate**：quality-check 完整 Layer 2 报告 → 进 Stage 2；否则 debug 脚本（`truncateDiffContent` import 失败？stat 解析错？fallback 路径未触发？）。

### Stage 2: Contract Tests + Optional Hook

**Scope**:

- NEW: `test/contract.diff-context.test.ts` (Component 4)
- NEW: `test/contract.diff-context.property.test.ts` (Component 5, optional)
- 可选 NEW: `scripts/check-diff-context-integrity.mjs` + `hooks/hooks.json` + `plugin.json` PostToolUse 段 (Component 6)

**Verification commands**:

```bash
# 1. 契约测试
npx vitest run test/contract.diff-context.test.ts test/contract.diff-context.property.test.ts

# 2. 故意 narrative summary 测试（手工）
# 把 .forge/reviews/.diff-context.md 的 ## Patch 改成 "See forge_git output. Key changes: - foo - bar"
# 跑 npx vitest run test/contract.diff-context.test.ts → 预期 FAIL

# 3. 全量回归
npx vitest run

# 4. Stage 2 Smoke (manual)
/forge review
```

**Decision gate**：全部测试 PASS + 故意写 narrative 时 CI FAIL + Real Smoke 三个 subagent 全绿 → spec **closure**。

### Rollback Strategy

- Stage 1 回滚：删脚本 + 还原 SKILL.md + references。主 agent 退回手工 4 步。零回归到 Stage 4 状态。
- Stage 2 回滚：删契约测试（与 hook 守护，如有）。Stage 1 脚本主路径仍生效。

## Error Handling

| 错误场景 | 行为 | 验证位置 |
|---------|------|---------|
| `git merge-base main HEAD` 失败 | 脚本 fallback 到 `HEAD~1` | Component 1 `tryExec` |
| `git rev-parse HEAD` 失败（无 git 仓库） | 脚本 exit 1 + stderr 错误 | Component 1 |
| `truncateDiffContent` import 失败（dist 未构建） | 脚本 fallback 到 `head -c 200000` 兜底 | Component 1 |
| `git diff` 输出为空（无改动） | `truncateDiffContent` 返回 `（无 diff 内容）`；契约测试豁免 hunk marker | Component 1 + Component 4 empty-diff exemption |
| `.forge/reviews/` 目录不存在 | `mkdirSync(..., { recursive: true })` 自动创建 | Component 1 |
| 主 agent 不调脚本，手工写 narrative summary | Stage 2 契约测试 CI FAIL；如有 hook，Write 阻断 | Component 4 + Component 6 |
| 契约测试在 Real Smoke 之前 review 未跑（`.diff-context.md` 不存在） | 测试 graceful skip（`if (!existsSync(PATH)) return`） | Component 4 第 1 个 it |
| `dist/src/mcp/tools/forge-git.js` import 路径变化（重构）| 单元测试覆盖；CI 拦截 | Stage 2 + 现有 contract test |
| 脚本被 Stage 1 验证后用户改 `.diff-context.md` 添加自定义内容 | 契约只检查 hunk marker 存在与 narrative anti-pattern；用户额外内容不阻断 | Component 4 设计 |

**Fail-safe principle**：在任何不确定情况下（脚本失败、import 失败、git 错误），**不退回 narrative summary 路径**。要么 fallback 到 shell `head -c` 兜底（仍是真实 patch），要么阻断 review 流程让主 agent 显式重试。**绝不**让主 agent 在不知情时退化到 Stage 4 narrative 路径。
