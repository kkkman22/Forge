# Four Delivery Options — 详解

门禁检查全部通过后，**必须**使用 AskUserQuestion 让用户选择交付方式。**禁止**跳过询问直接执行任何选项。

```
AskUserQuestion:
  questions:
    - question: "门禁已通过，请选择交付方式"
      header: "Ship"
      options:
        - label: "Merge to main"
          description: "本地合并到 main，删除功能分支"
        - label: "Create PR"
          description: "推送分支并创建 Pull Request"
        - label: "Keep branch"
          description: "保留当前分支，稍后处理"
        - label: "Discard"
          description: "丢弃所有变更（需二次确认）"
      multiSelect: false
```

用户选择 Discard 时，需追加确认 AskUserQuestion（输入理由或确认）。

## Option 1: Merge to Main Branch

通过 `ship_merge` 效果执行：checkout main → merge branch → delete branch。Merge 失败时自动执行 `merge --abort` 恢复。适用场景：个人项目、小团队直接合并。

## Option 2: Push and Create PR

通过 `ship_push_pr` 效果执行：push origin → gh pr create。Push 失败时不创建 PR。适用场景：团队协作。PR 描述自动从 plan Objective 提取。

## Option 3: Keep Branch

不做任何 Git 操作，保留当前分支状态。适用场景：稍后处理、等待依赖。可随时重新运行 `/forge ship` 选择其他方式。

**Pending-Delivery 记录**：选择保留分支时，必须调用 `recordPendingDelivery(branchName, topic, timestamp)` 记录交付状态：

- `branchName` 来源：`git branch --show-current` 输出
- `topic` 来源：`.forge/status.md` 的 `current_task` 字段
- `timestamp` 来源：`Date.now()`

返回的 `PendingDeliveryRecord` 追加到 `.forge/status.md` 或配置指定的持久化位置。下次 `/forge build` 启动时，`detectUnshippedBranches` 和 `detectStaleBranches` 将读取这些记录并展示警告。

## Option 4: Discard

丢弃当前分支的所有变更。**需要二次确认**：用户输入 `discard` 才执行，输入其他内容则取消。通过 `ship_discard` 效果执行：checkout main → delete branch。

## Autonomous Mode Configuration

在 `.forge/config.md` frontmatter 中可配置 `ship_default_method` 控制自主模式的交付行为：

| Value | Behavior |
|-------|----------|
| `merge` | 自动合并到主分支 |
| `push-pr` | 自动推送并创建 PR |
| `keep-branch` | 保留分支（默认值） |
| `prompt` | 覆盖 autonomous 行为，强制等待用户选择 |

无效值安全回退到 `keep-branch` 并输出警告。
