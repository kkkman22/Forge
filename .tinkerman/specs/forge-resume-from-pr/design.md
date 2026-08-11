---
feature: forge-resume-from-pr
layout: design
created: 2026-05-12
---

# Design Document: `/forge resume --from-pr`

## Overview

本 spec 在 Forge 的 `/forge resume` 命令上新增 `--from-pr <url-or-number>` 标志，实现"从 PR 一键恢复 Claude Code + Forge 双端状态"。核心是把 Claude Code 原生的 `--from-pr` 与 Forge 的 `.tinkerman/status.md` 状态恢复衔接起来。

**变更范围**：
- 修改 `skills/forge-resume/SKILL.md`：增加 `--from-pr` 分支流程
- 新增 `scripts/resume-from-pr.mjs`：Node 脚本实现 PR 元数据获取、slug 推断、context bundle 加载、status 更新
- 修改 `scripts/forge-resume.sh`（若存在）：入口分发到新脚本
- 新增 `.tinkerman/.pr-slug-cache.json` 到 `.gitignore`
- 修改 `README.md`、`CHANGELOG.md`

**不涉及**：`.tinkerman/specs/`、`.tinkerman/plans/`、`.tinkerman/progress/` 的文件格式；`/forge plan`、`/forge build` 的行为。

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              /forge resume --from-pr <value>                 │
└────────────────────────────┬────────────────────────────────┘
                             │
                 ┌───────────▼────────────┐
                 │ parse <value>           │
                 │  - URL → host + number │
                 │  - integer → infer host│
                 └───────────┬────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
┌────────▼────────┐ ┌────────▼────────┐ ┌────────▼────────┐
│ PR_Metadata     │ │ claude --from-pr │ │ Forge state load│
│ Fetcher         │ │ (CC session)    │ │                 │
│ - gh/glab/git   │ │                 │ │                 │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         └───────────┬───────┴───────────────────┘
                     │
         ┌───────────▼────────────┐
         │ PR_Slug_Mapping        │
         │  (title → branch →     │
         │   description →        │
         │   decisions → prompt)  │
         └───────────┬────────────┘
                     │
         ┌───────────▼────────────┐
         │ PR_Context_Bundle load │
         │  spec/plan/progress/   │
         │  reviews/adr           │
         └───────────┬────────────┘
                     │
         ┌───────────▼────────────┐
         │ update .tinkerman/status.md│
         │ write .tinkerman/runs/...  │
         │ emit OTel event        │
         └───────────┬────────────┘
                     │
         ┌───────────▼────────────┐
         │ print context summary  │
         │ (via SessionStart hook)│
         └────────────────────────┘
```

**设计决策**：

1. **复用 CC 的 `--from-pr`**：不自己实现 CC session 恢复，只在 CC 成功/失败后做 Forge 侧的工作。CC session 恢复失败不是 Forge 侧的致命错误，Forge 可以"best-effort" 继续。

2. **分层失败降级**：`CC --from-pr` 失败 → 回退到 Forge-only 恢复 → slug 推断失败 → 交互提示 → 仍无 → 明确报错。每一层失败都有诊断。

3. **幂等设计**：重复运行相同的 `--from-pr` 命令不产生额外副作用，除了更新 `.tinkerman/status.md` 的 timestamp。

4. **只写两个文件**：`--from-pr` 只修改 `.tinkerman/status.md` 和 `.tinkerman/.pr-slug-cache.json`，其他所有读取都只读。这与 Forge 的 frozen-zone 规则一致。

5. **隔离外部 CLI 调用**：`gh`、`glab` 调用都封装在 `PR_Metadata_Fetcher`，超时和失败都不向上传播。

## Components and Interfaces

### Component 1: resume-from-pr.mjs 脚本

**文件**：`scripts/resume-from-pr.mjs`

**接口**：
```
用法: node scripts/resume-from-pr.mjs <url-or-number> [--json]
环境变量:
  FORGE_ROOT       （可选，默认项目根）
  FORGE_NO_CACHE=1 （跳过 slug 缓存）
  FORGE_INTERACTIVE=0 （非交互模式，推断失败即 exit 1）

退出码:
  0  成功
  1  PR 未找到或 slug 推断失败（交互模式下用户拒绝）
  2  CC 版本过低（--from-pr 不支持）
  3  参数错误
```

**模块拆分**（单文件内）：
- `parseTarget(value)` → `{ host, number, url }`
- `fetchPRMetadata(target)` → `{ title, branch, description, commit, baseBranch }`
- `resolveSlug(metadata)` → `{ slug, resolutionPath }` 或 `null`
- `loadContextBundle(slug)` → `{ spec, plan, progress, reviews, adrs, missing }`
- `updateStatus(slug, metadata)` → 写 `.tinkerman/status.md`
- `writeRunReport(...)` → 写 `.tinkerman/runs/<ts>-resume-from-pr.md`

### Component 2: forge-resume SKILL 修改

**文件**：`skills/forge-resume/SKILL.md`

**修改位置 1**：Workflow 章节新增分支：

```markdown
### 从 PR 恢复（--from-pr）

当用户以 `/forge resume --from-pr <url-or-number>` 调用时：

1. 运行 `node scripts/resume-from-pr.mjs <value>`
2. 脚本输出 JSON 结构的 context bundle，包含：
   - slug、phase、PR number/URL、branch
   - spec / plan / progress / reviews / adr 文件列表
   - warnings（missing files、推断路径）
3. 以结构化格式向用户汇报：
   ```
   📋 从 PR 恢复完成
   Spec: <slug> (phase: build)
   Progress: 3/7 完成（最新：实现 XYZ）
   待处理 Review findings: 2 条 P1
   ⚠ 缺失：.tinkerman/progress/<slug>.md 已被归档
   ```
4. 后续交互按当前 phase 给出建议命令（如 build 阶段提示 `/forge build` 继续）。

**失败模式**：

- PR 未找到 → 提示检查 URL 和 `gh auth status`
- slug 无法推断 → 列出所有已知 spec 供选择
- CC `--from-pr` 不支持 → 退化为 Forge-only 恢复，输出 warning

**与 `--spec` 的互斥**：`--from-pr` 和 `--spec <slug>` 同时指定时，脚本拒绝执行。
```

**修改位置 2**：`/forge resume` 的根 Workflow 开头新增参数分发说明，标明 `--from-pr` 走上面的分支。

### Component 3: PR_Metadata_Fetcher

**接口**（伪代码）：
```ts
interface PRMetadata {
  host: 'github' | 'gitlab' | 'bitbucket' | 'unknown';
  number: number;
  title: string;
  branch: string;          // head ref
  baseBranch: string;      // base ref
  description: string;
  commit: string;           // head commit sha
  url: string;
  fetcherUsed: 'gh' | 'glab' | 'git-bitbucket' | 'none';
}

async function fetchPRMetadata(target: {host, number, url}): Promise<PRMetadata>
```

**实现策略**：

| Host | 工具 | 命令 |
|---|---|---|
| github | `gh` | `gh pr view <num> --json title,headRefName,baseRefName,body,commits,url` |
| gitlab | `glab` | `glab mr view <num> --output json` |
| bitbucket | `curl` + API | `curl .../pull-requests/<num>` + BITBUCKET_TOKEN env |
| unknown | git only | 只能从 `git log` 和 branch name 推断 |

**超时**：每个命令包 `Promise.race` 10s timeout。超时返回 `fetcherUsed: 'none'` + warning。

### Component 4: PR_Slug_Mapping

**解析顺序**（每步命中即返回）：

1. **PR title 前缀**：正则 `^\[spec:([a-z0-9-]+)\]` 或 `\(([a-z0-9-]+)\)$`
2. **Branch 名**：正则 `^(forge|feature|spec)/([a-z0-9-]+)` → slug = `$2`
3. **PR description 链接**：`.tinkerman/specs/([a-z0-9-]+)/` → slug
4. **Decisions 关联**：grep `.tinkerman/decisions/*.md` 中 `pr: <number>` 或 `pull_request: <url>` 的 ADR → frontmatter `slug` 字段
5. **交互提示**：列出 `.tinkerman/specs/` 下的 slug，要求选择；`FORGE_INTERACTIVE=0` 时直接 fail

**缓存**：`.tinkerman/.pr-slug-cache.json`:
```json
{
  "github:123": { "slug": "my-spec", "resolvedAt": "2026-05-12T..." },
  ...
}
```
缓存 TTL = 7 天（硬编码，后续可配置）。

### Component 5: PR_Context_Bundle

**接口**：
```ts
interface ContextBundle {
  slug: string;
  phase: string;           // from status.md or inferred from progress
  specFiles: { path: string; frozen: boolean }[];
  planFile: string | null;
  progressFile: string | null;
  reviews: string[];        // .tinkerman/reviews/<pr>-*.md
  adrs: string[];           // referenced from spec
  missing: string[];        // expected but not found
}
```

**加载流程**：
1. `readdir(.tinkerman/specs/<slug>)` → specFiles
2. `access(.tinkerman/plans/<slug>.md)` → planFile
3. `access(.tinkerman/progress/<slug>.md)` → progressFile
4. `readdir(.tinkerman/reviews) | grep ^<pr>-` → reviews
5. 从 spec 文件中 grep `.tinkerman/decisions/ADR-*` 引用 → adrs
6. 所有预期但 `ENOENT` 的都进 missing

### Component 6: Status 更新

**文件**：`.tinkerman/status.md`

**格式**（YAML frontmatter）：
```yaml
---
slug: my-spec
phase: build
pr_number: 123
pr_url: https://github.com/org/repo/pull/123
branch: forge/my-spec
base_branch: main
updated_at: "2026-05-12T10:00:00Z"
updated_by: "resume-from-pr"
---

# Forge Status

Last resumed from PR #123 at 2026-05-12T10:00:00Z.
```

**冲突处理**：如果 `.tinkerman/status.md` 已有不同 slug，按 Requirement 5.2 交互提示。非交互模式下退出 1。

## Data Models

### PR_Slug_Cache

文件：`.tinkerman/.pr-slug-cache.json`（git-ignored）

```json
{
  "<host>:<number>": {
    "slug": "string",
    "resolutionPath": "title|branch|description|decisions|manual",
    "resolvedAt": "ISO 8601"
  }
}
```

### Resume_Run_Report

文件：`.tinkerman/runs/<timestamp>-resume-from-pr.md`

```markdown
---
command: "forge resume --from-pr"
target: "https://github.com/org/repo/pull/123"
host: github
number: 123
success: true
fallback_used: false
slug: my-spec
resolution_path: "title"
started_at: "2026-05-12T10:00:00Z"
finished_at: "2026-05-12T10:00:03Z"
---

# Resume Run Report

## Fetched Metadata
- title: ...
- branch: ...

## Context Bundle
- spec: 4 files
- plan: 1 file
- progress: 1 file
- reviews: 2 files
- missing: (none)

## Warnings
(none)

## Final Status
(snapshot of .tinkerman/status.md)
```

## Error Handling

| 场景 | 脚本行为 | SKILL 呈现 |
|---|---|---|
| PR URL 格式非法 | exit 3 | "URL 格式非法，请检查" |
| `gh` / `glab` 未安装 | fetcher 返回 `none`，继续 | Warning："未安装 gh，已退化为 branch 推断" |
| 远程 API 超时 | fetcher 返回 `none`，继续 | Warning："远程查询超时（10s），使用缓存或 branch 推断" |
| PR 不存在 | exit 1 | "PR 未找到" + 检查建议 |
| slug 推断所有源均失败 | 交互模式：prompt；非交互：exit 1 | 列出 `.tinkerman/specs/` 供选择 |
| CC `--from-pr` 不支持 | 继续 Forge-only，打印 warning | "CC 版本 <2.1.29，session 未恢复，仅恢复 Forge 状态" |
| `.tinkerman/status.md` 冲突 | 交互模式 prompt；非交互：exit 1 | 展示两个 slug 的差异 |
| 网络完全不可用 | fetcher 返回 `none`，继续 | Warning + 退化到 branch 推断 |

## Testing Strategy

1. **单元测试** `test/resume-from-pr.test.ts`：
   - `parseTarget` 各种 URL 格式
   - `resolveSlug` 各种推断路径（title/branch/description/decisions）
   - `loadContextBundle` missing 文件处理

2. **集成测试** `test/resume-from-pr.integration.test.ts`：
   - mock `gh`/`glab` 子进程
   - 用 fixture 仓库跑完整流程

3. **契约测试** `test/contract.skills.test.ts` 扩展：
   - 断言 `skills/forge-resume/SKILL.md` 含 "从 PR 恢复" section
   - 断言 `--from-pr` / `--spec` 互斥规则说明

4. **手动 e2e**：
   - 在 Forge 自己的 repo 开一个 test PR，运行 `/forge resume --from-pr <url>`
   - 切换 branch 到干净状态，运行同上 → 验证状态恢复
   - 临时卸载 `gh` → 验证退化路径
