---
feature: dist-sync-guard
layout: design
created: 2026-05-10
---

# Design Document

## 1. Overview

本设计把 5 条 Requirement 落到 **2 个脚本 + 1 个 CONTRIBUTING 章节 + 1 个 evolved-rules 条目 + 测试**，全部零新依赖。核心是一个 `check-dist-sync.mjs` 纯函数 + CLI 组合，执行三类 drift 检测；配套 `dist-resync.sh` 提供本地便利。

映射关系：

| Requirement | 主要实现载体 | 工作量 |
|---|---|---|
| R1 CI 层漂移检测 | `src/dist-sync.ts`（纯函数） + `scripts/check-dist-sync.mjs`（CLI） + package.json / CI 集成 | 4 小时 |
| R2 本地一键同步工具 | `scripts/dist-resync.sh` | 1 小时 |
| R3 CONTRIBUTING.md 约定 | `CONTRIBUTING.md` 新增章节 | 30 分钟 |
| R4 evolved-rules R6 条目 | `.tinkerman/knowledge/evolved-rules.md` frontmatter + 新段 | 15 分钟 |
| R5 非功能需求 | 横切（测试 + 性能验证） | 1 小时 |

总工作量估计：**约 0.5-1 个工作日**。

## 2. High-Level Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                   Dist Sync Guard 三层架构                      │
│                                                                │
│  Layer 1: CI 硬门禁（强制）                                    │
│  ├── scripts/check-dist-sync.mjs                               │
│  │   ├── A) src → dist 对应关系检查                            │
│  │   ├── B) dist 孤儿检查（dist 存在但无对应 src）              │
│  │   └── C) 编译一致性检查（tsc 产出 vs tracked dist）          │
│  ├── package.json 的 check 脚本集成                            │
│  └── .github/workflows/ci.yml 显式 step (若需要)                │
│                                                                │
│  Layer 2: 本地便利工具（可选）                                 │
│  └── scripts/dist-resync.sh                                    │
│      ├── 清理 .tsbuildinfo                                     │
│      ├── 跑 tsc                                                │
│      ├── 列出 dist/ 变更                                       │
│      └── 交互提示 / --yes 自动 stage                           │
│                                                                │
│  Layer 3: 文档与规则（长效）                                   │
│  ├── CONTRIBUTING.md "dist/ Sync Requirement" 章节             │
│  └── .tinkerman/knowledge/evolved-rules.md R6 新条目                │
└────────────────────────────────────────────────────────────────┘
                              ↓ 消费
┌────────────────────────────────────────────────────────────────┐
│                   现有 Forge 基础设施（不改）                    │
│                                                                │
│  - tsconfig.json（当前 outDir: "dist", rootDir: "."）           │
│  - scripts/build-dist.sh（分发打包，继续读 dist/）              │
│  - hooks/hooks.json（运行时引用 dist/src/check-frozen.js）      │
└────────────────────────────────────────────────────────────────┘
```

## 3. Data Model

### 3.1 Drift Report Schema

```ts
interface DriftReport {
  missingInDist: Array<{ srcPath: string; expectedDistPaths: string[] }>;
  orphansInDist: Array<{ distPath: string; reason: "no-src" | "src-deleted" }>;
  compilationMismatch: Array<{
    distPath: string;
    srcPath: string;
    diff: "content-differs" | "size-differs" | "mtime-suggests-stale";
  }>;
  summary: {
    totalSrc: number;
    totalDist: number;
    drifted: number;
    cleanExit: boolean;
  };
}
```

### 3.2 Src-Dist 对应关系

对 tsconfig.json 当前配置（`rootDir: "."`, `outDir: "dist"`）：

```
src/foo.ts          → dist/src/foo.js + dist/src/foo.js.map + dist/src/foo.d.ts
src/bar/baz.ts      → dist/src/bar/baz.js + .map + .d.ts
test/foo.test.ts    → dist/test/foo.test.js + .map + .d.ts  (tsc 也编译 test/)
```

## 4. Component Design

### 4.1 `src/dist-sync.ts`（纯函数层）

```ts
/**
 * Dist sync drift detector (pure functions).
 *
 * Given a listing of tracked src/ files and tracked dist/ files, compute
 * a DriftReport. The CLI driver handles all IO.
 */

export interface FileListing {
  trackedSrcFiles: string[];      // relative paths, e.g. ["src/foo.ts"]
  trackedDistFiles: string[];     // relative paths, e.g. ["dist/src/foo.js"]
  /** Files written by a fresh tsc run to a temp outDir (for mismatch check). */
  freshDistFiles?: Map<string, { sha256: string; size: number }>;
  /** Current tracked dist/ content checksums (for mismatch check). */
  trackedDistChecksums?: Map<string, { sha256: string; size: number }>;
}

export function detectDrift(input: FileListing): DriftReport;
export function srcToExpectedDist(srcPath: string): string[];
export function distToExpectedSrc(distPath: string): string | null;
```

**算法**：
- `srcToExpectedDist("src/foo.ts")` → `["dist/src/foo.js", "dist/src/foo.d.ts"]`（不含 `.js.map`，sourceMap 可选）
- `distToExpectedSrc("dist/src/foo.js")` → `"src/foo.ts"`
- `detectDrift` 对三类 drift 逐项检查

### 4.2 `scripts/check-dist-sync.mjs`（CLI 驱动）

```js
#!/usr/bin/env node
/**
 * Dist Sync Guard CLI.
 *
 * Phase 1: Collect listings
 *   - `git ls-files 'src/**/*.ts' 'dist/**'` → tracked files
 *   - Exclude `*.d.ts` from src (only .ts counts as source)
 *
 * Phase 2: Compile to temp
 *   - `npx tsc --outDir .tinkerman/.dist-sync-check/` (may need temporary tsconfig)
 *   - Compute SHA-256 of temp outputs
 *
 * Phase 3: Compute checksums for tracked dist/
 *
 * Phase 4: detectDrift(input)
 *
 * Phase 5: Report + cleanup + exit code
 */
```

**跳过机制**：
- 读 env `FORGE_SKIP_DIST_SYNC=1` → 打印警告，exit 0
- 读最近一个 commit message，若含 `[dist-sync-skip]` → 打印警告，exit 0（通过 `git log -1 --format=%B`）

### 4.3 `scripts/dist-resync.sh`（本地便利）

```bash
#!/bin/bash
# category: user-facing
set -euo pipefail

usage() {
  cat <<EOF
Usage: $0 [--yes]

Regenerate dist/ from src/ and stage changes for commit.

Options:
  --yes      Skip interactive prompt and auto-stage changes.
  --help     Show this help.
EOF
}

# ... implementation
```

流程：
1. `rm -f .tsbuildinfo tsconfig.tsbuildinfo`
2. `npx tsc`
3. 捕获 `git status --porcelain dist/`
4. 若有变更：
   - 非 `--yes`：列出变更 + 交互询问
   - `--yes`：直接 `git add dist/`
5. 打印 `Done. Commit with: git commit -m "chore(dist): resync"`

### 4.4 package.json 增加

```json
{
  "scripts": {
    "dist:resync": "bash scripts/dist-resync.sh",
    "check": "... && node scripts/check-dist-sync.mjs && ..."
  }
}
```

### 4.5 CONTRIBUTING.md 新章节（R3）

```markdown
## dist/ Sync Requirement

Forge's `dist/` directory is **tracked in git** because:
- `hooks/hooks.json` references `dist/src/check-frozen.js` at runtime
- `scripts/build-dist.sh` reads `dist/src/` to create distribution bundles

This creates a requirement: **every PR that modifies `src/**/*.ts` must include
the corresponding `dist/src/**` changes in the same PR.**

### How to fix a "dist-sync failed" CI error

1. Run `npm run dist:resync` (or `npm run dist:resync -- --yes` for auto-stage)
2. Commit the staged dist/ changes: `git commit -m "chore(dist): resync"`
3. Push again

### Why this is enforced

Without enforcement, dist/ drifts silently. The 2026-05-10 audit found ~300
untracked dist/ files accumulated across Sprint 1-3 — runtime was using old
compiled logic while src/ had moved on. See commit `078e482` for the one-time
resync that eliminated the backlog.

### Emergency bypass

For rare cases where src/ and dist/ MUST be in separate commits (e.g., hotfix
where dist/ regen takes too long and src/ fix is urgent), include
`[dist-sync-skip]` in the commit message. Use sparingly — the next PR will
restore full sync.
```

### 4.6 evolved-rules R6 条目（R4）

```markdown
### R6: src/dist 同步是 PR 合约一部分

**Content**: 修改 `src/**/*.ts` 的 PR 必须同时包含对应 `dist/src/**` 的变更。Forge 的 `dist/` 是 tracked in git（hooks 运行时 + 分发包都读它）。开发者的思维模型应该是"src/ 和 dist/ 是同一次逻辑变更的两面"，不是"tsc 只是构建步骤可以之后再补"。如果 CI 报 dist-sync 失败，运行 `npm run dist:resync` + commit dist/。紧急情况允许 commit message 带 `[dist-sync-skip]` 绕过，但下一 PR 必须恢复同步。
**Prevents**: Sprint 级别的 dist 积压漂移（2026-05-10 审计：Sprint 1-3 累计 300+ dist 文件未提交，`078e482` 一次性消除，但这种"突发大规模同步"本身说明缺乏持续守卫）
**Source**: 2026-05-10 存量 biome / dist 积压清理会话
**Added**: 2026-05-10
**Confidence**: 0.85
**Last_triggered**: 2026-05-10
**Infra_Ref**: `scripts/check-dist-sync.mjs` + `CONTRIBUTING.md` §dist/ Sync Requirement
```

## 5. Testing Strategy

### 5.1 单元测试（`test/dist-sync.test.ts`）

```ts
describe("detectDrift", () => {
  it("flags missing dist for new src", () => {
    const drift = detectDrift({
      trackedSrcFiles: ["src/foo.ts", "src/bar.ts"],
      trackedDistFiles: ["dist/src/foo.js", "dist/src/foo.d.ts"],
      // bar has no dist
    });
    expect(drift.missingInDist).toHaveLength(1);
    expect(drift.missingInDist[0].srcPath).toBe("src/bar.ts");
  });

  it("flags orphan dist with no src", () => {
    const drift = detectDrift({
      trackedSrcFiles: ["src/foo.ts"],
      trackedDistFiles: ["dist/src/foo.js", "dist/src/foo.d.ts",
                         "dist/src/deleted.js"],
    });
    expect(drift.orphansInDist).toHaveLength(1);
    expect(drift.orphansInDist[0].distPath).toBe("dist/src/deleted.js");
  });

  it("flags compilation mismatch when checksums differ", () => {
    // ... detailed test
  });

  it("returns clean report when src and dist are in sync", () => {
    // ... detailed test
  });
});

describe("srcToExpectedDist / distToExpectedSrc", () => {
  it("maps nested paths correctly", () => {
    expect(srcToExpectedDist("src/pack/loader.ts")).toEqual([
      "dist/src/pack/loader.js",
      "dist/src/pack/loader.d.ts",
    ]);
    expect(distToExpectedSrc("dist/src/pack/loader.js")).toBe(
      "src/pack/loader.ts",
    );
  });
});
```

### 5.2 Property test（`test/dist-sync.property.test.ts`）

```ts
it("round-trip: srcToExpectedDist then distToExpectedSrc returns original", () => {
  fc.assert(
    fc.property(fc.string().filter((s) => /^src\/[\w/]+\.ts$/.test(s)), (src) => {
      const [jsPath] = srcToExpectedDist(src);
      expect(distToExpectedSrc(jsPath)).toBe(src);
    }),
  );
});
```

### 5.3 集成 smoke test

手动执行（不入自动化）：
1. 删除 `dist/src/evolved-rules-staleness.js`
2. 跑 `npm run check`
3. 确认 `check-dist-sync.mjs` 报 "missing in dist"
4. 跑 `npm run dist:resync --yes`
5. 再跑 `npm run check`，应 OK

## 6. Execution Flow

### 6.1 CI 运行时

```
npm run check
  → tsc --noEmit
  → biome check
  → vitest run
  → ...
  → node scripts/check-dist-sync.mjs
    → git ls-files src/ dist/
    → npx tsc --outDir .tinkerman/.dist-sync-check/
    → 比较 tracked dist/ vs .tinkerman/.dist-sync-check/
    → 有 drift → exit 1，报告具体文件
    → 无 drift → cleanup + exit 0
```

### 6.2 开发者本地流程

```
# 正常流程（改了 src/ 后）
npm run dist:resync       # 跑 tsc + 交互式 stage
git add src/ test/ other-files
git commit -m "feat: ..."

# 或一行搞定
npm run dist:resync -- --yes
git add src/ test/ other-files
git commit -m "feat: ..."
```

## 7. Security Considerations

- 脚本不执行任何从用户输入来的代码，仅调用 `tsc` / `git`
- 临时 outDir `.tinkerman/.dist-sync-check/` 在 `.gitignore` 已存在的 `.tinkerman/` 覆盖下自动忽略
- `[dist-sync-skip]` 检测只读 commit message，不受污染
- `npm run dist:resync` 不做 `git commit` 或 `git push`，只 stage

## 8. Migration

### 8.1 基线建立

本 spec 启用前：跑 `node scripts/check-dist-sync.mjs` 应 exit 0（因为 `078e482` 已经完成 dist 同步）。如果报 drift，先修掉再启用。

### 8.2 既有 PR 的处理

本 spec 启用时 main 分支上 dist/ 是干净的。之后的 PR 必须遵守守卫。对在 spec 启用前 open 但未合并的 PR，合并时会 CI fail，需要 rebase + 跑 `npm run dist:resync`。

## 9. Open Questions / Deferred

- **Husky pre-commit hook**：是否加本地 pre-commit 自动跑 `check-dist-sync`？权衡：收益是本地即时反馈，代价是强制每个开发者装 husky 且容易被 `--no-verify` 绕过。**暂缓**，观察 CI 层守卫是否已足够。
- **自动 dist 生成 bot**：是否写一个 GitHub Action，PR 上传后自动跑 `tsc` 并 amend commit？**暂缓**，自动 push 风险大且降低开发者对 dist 状态的认知。
- **Performance 基线监控**：`check-dist-sync.mjs` 随项目增大可能变慢。若将来超过 60s，应考虑增量 checksum 缓存。目前项目规模 300 文件，30s 预算充足。

## 10. Exit Criteria

本 spec 完成判定：

1. `scripts/check-dist-sync.mjs` 存在且通过自测
2. `scripts/dist-resync.sh` 存在且能正确交互 / `--yes`
3. `npm run check` 包含 dist-sync 检查
4. `CONTRIBUTING.md` 新增 dist/ Sync Requirement 章节
5. `.tinkerman/knowledge/evolved-rules.md` 含 R6 条目，rule_count=6
6. `test/dist-sync.test.ts` 单元测试全绿
7. 手动 smoke test：删 dist 文件 → `npm run check` fail → `npm run dist:resync` → `npm run check` pass
