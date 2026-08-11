---
updated: 2026-08-11
---
# Forge Verify — Baseline Resolution Reference

## 4-Level Priority Chain

`resolveBaseline(topic, explicit?)` 按以下优先级解析 baseline：

### Level 1: Explicit `--baseline <git-ref>`

- 来源：用户通过 CLI flag `--baseline abc123` 显式指定
- 解析：`git rev-parse <ref>`
- 成功 → `{ ref: "<sha>", strategy: "explicit" }`
- 失败 → 降级到 Level 2

### Level 2: merge-base(origin/main)

- 前提：git repo 存在 AND remote `origin` 存在
- 解析：`git merge-base HEAD origin/main`
- 成功 → `{ ref: "<sha>", strategy: "merge-base" }`
- 失败（no remote / no common ancestor）→ 降级到 Level 3

### Level 3: HEAD^ (parent commit)

- 前提：git repo 存在 AND 有 parent commit
- 解析：`git rev-parse HEAD^`
- 成功 → `{ ref: "<sha>", strategy: "parent" }`
- 失败（initial commit / shallow clone without parent）→ 降级到 Level 4

### Level 4: Last treatment snapshot

- 前提：`.forge/findings/<topic>/verify-this/treatment/` 存在且非空
- 解析：读目录中最新的 artifact 作为 baseline
- 成功 → `{ ref: null, strategy: "last-treatment", snapshotDir: "<path>" }`
- 失败 → `{ ref: null, strategy: "none" }` → INCONCLUSIVE

## Type Signature

```typescript
export interface BaselineResolution {
  ref: string | null;
  strategy: "explicit" | "merge-base" | "parent" | "last-treatment" | "none";
  snapshotDir?: string;
}
```

## Implementation Notes

- 使用 `child_process` 执行 `git` 命令
- 每个 `git` 命令超时 10 秒
- 超时或非零退出码视为该 level 失败，降级到下一级
- 全部失败返回 `{ ref: null, strategy: "none" }` [R1.10]
