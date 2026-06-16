# Triage Inbox — <project>

> 自动发现的事项落盘（论文 §04 Memory 零件："agent 会忘，仓库不会"）。
> 由 `/forge triage` 追加，人工复核后流转 status。

## 条目格式

```markdown
## TRIAGE-YYYYMMDD-NNN
- source: jira-sprint | bitbucket-pr | bitbucket-branch | git-fallback
- external_ref: CH-1234 | <PR URL> | <commit sha> | <branch>
- severity: high | medium | low
- detected_at: <ISO timestamp>
- status: open | in-progress | done | skip
- summary: <一句话说明为什么值得处理>
- suggested_action: open-worktree | investigate | skip
```

## status 流转

`open` → `in-progress`（开始处理）→ `done` / `skip`

---

<!-- triage 条目追加到此分隔线下方 -->
