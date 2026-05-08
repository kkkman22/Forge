---
topic: "cmux-integration"
plan_ref: ".forge/plans/cmux-integration.md"
sprint: 3
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
| 11. lib/events.mjs | done | a7af511 |
| 12. src/sdk-driver.ts Events_NDJSON | done | 7f41387 |
| 13. lib/reviews.mjs | done | a7af511 |
| 14. src/review.ts frontmatter | done | 7f41387 |

## Sprint 3 — Mirror_Daemon 核心 + Push 通道

| Task | Status | Commit |
|------|--------|--------|
| 15. lib/session.mjs | done | d351412 |
| 16. lib/respawn.mjs | done | 16611fe |
| 17. lib/reader.mjs + lib/emitter.mjs | done | fe06126 |
| 18. lib/push-server.mjs + push.sh | done | 639eca3 |
| 19. mirror.mjs 主程序 | done | 60560f0 |

## Sprint 4 — Sync_Once / Hook 接入

| Task | Status | Commit |
|------|--------|--------|
| 20. sync-once.mjs | done | 723fe09 |
| 21. hook-notify.sh | done | bb5c3ee |
| 22. src/check-frozen.ts | done | e9b4172 |
| 23. hooks/hooks.json | done | 013deb4 |

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
