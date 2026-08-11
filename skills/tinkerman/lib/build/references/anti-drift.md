---
updated: 2026-08-11
---
# Anti-drift Execution Guardrails (Detailed)

## 6.0 Anti-drift Execution Guardrails

| Prohibited Behavior | Description |
|---------|------|
| Optimizing proxy metrics while abandoning frozen targets | Must not write meaningless tests for coverage numbers while ignoring Spec core scenarios |
| Absorbing verification material as product truth | Must not hardcode test example data as product logic |
| Relabeling limited fixes as universal completion | Must not fix one edge case and claim "all done" |
| Silent degradation | Must not silently switch to degraded approach when main path fails without informing user |
| Pseudo-success | Must not swallow errors, output templated pass results, or pretend success |
| Modifying frozen files | Must not modify locked Spec or approved Plan during build phase |

If Spec has anti-drift declarations (primary target / non-target proxy metrics / verification material role), use primary target as the sole judgment criterion.

**Status File Protection**: Observe `.tinkerman/config.md` protection zones — 🔒 Frozen zone immutable, 🛡️ Protected zone append-only, 🟢 Open zone freely modifiable. Violation causes immediate block and report.
