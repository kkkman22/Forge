# P1 Fix Checklist — cmux-0.64-integration

Review: `.forge/reviews/cmux-0.64-integration.md` @ e46b7dd8

| ID | Sev | Status | File:Line | Fix |
|----|-----|--------|-----------|-----|
| S1 | P1 | ✅ verified | scripts/cmux-mirror/browser-qa.mjs | `SAFE_TOPIC` confines `topic`; invalid → "default". Re-checked CLEAN (c77e3472). |
| S2 | P1 | ✅ verified | scripts/cmux-mirror/lib/browser-q-actions.mjs | `SAFE_SURFACE` confines `surface`; throws on flag-like values. Re-checked CLEAN (c77e3472). |

(P2: Q1 dead export `buildFocusWebviewArgs`, Q3 `buildRpcArgs` method guard — handled alongside, not blockers.)
