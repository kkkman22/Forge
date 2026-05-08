---
topic: "cmux-integration"
plan_ref: ".forge/plans/cmux-integration.md"
sprint: 1
updated: "2026-05-08"
---

# Progress: cmux-integration

## Sprint 1 — 打地基：纯函数库 + 依赖 + i18n

| Task | Status | Commit |
|------|--------|--------|
| 1. mock-socket 测试基础设施 | done | — |
| 2. 添加 yaml npm 依赖 | done | — |
| 3. lib/availability.mjs | done | — |
| 4. lib/capabilities.mjs | done | — |
| 5. lib/payload.mjs | done | — |
| 6. lib/budget.mjs | done | ca32dd2 |
| 7. lib/dedupe.mjs | done | b2fd692 |
| 8. lib/cli.mjs | done | 28a2311 |
| 9. config + i18n | done | 9905d85 |
| 10. Sprint 1 回归 | done | f61fff9 |

## Sprint 2 — Events_NDJSON 与 Reviews Frontmatter

| Task | Status | Commit |
|------|--------|--------|
| 11. lib/events.mjs | pending | — |
| 12. src/sdk-driver.ts Events_NDJSON | pending | — |
| 13. lib/reviews.mjs | pending | — |
| 14. src/review.ts frontmatter | pending | — |

## Sprint 3 — Mirror_Daemon 核心 + Push 通道

| Task | Status | Commit |
|------|--------|--------|
| 15. lib/session.mjs | pending | — |
| 16. lib/respawn.mjs | pending | — |
| 17. lib/reader.mjs + lib/emitter.mjs | pending | — |
| 18. lib/push-server.mjs + push.sh | pending | — |
| 19. mirror.mjs 主程序 | pending | — |

## Sprint 4 — Sync_Once / Hook 接入

| Task | Status | Commit |
|------|--------|--------|
| 20. sync-once.mjs | pending | — |
| 21. hook-notify.sh | pending | — |
| 22. src/check-frozen.ts | pending | — |
| 23. hooks/hooks.json | pending | — |

## Sprint 5 — 模板 / 可选包 / Browser QA

| Task | Status | Commit |
|------|--------|--------|
| 24. templates/cmux.json | pending | — |
| 25. install-template.sh + init.sh | pending | — |
| 26. browser-qa.mjs | pending | — |
| 27. cmux-skills/ | pending | — |
| 28. prune-event-logs.sh 扩展 | pending | — |

## Sprint 6 — 文档与收尾

| Task | Status | Commit |
|------|--------|--------|
| 29. SKILL references | pending | — |
| 30. README.md | pending | — |
| 31. ROADMAP.md | pending | — |
| 32. 最终回归 | pending | — |
| 33. E2E 手工验收 | pending | — |
