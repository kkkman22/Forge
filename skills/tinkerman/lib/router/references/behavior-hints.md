---
updated: 2026-08-11
---
# Behavior Hints Reference

Hints 是叠加的（只增加检查项，不移除命令）。按 Scope 触发：

| Hint | Scope | Target Command |
|------|-------|---------------|
| `a11y-check` | frontend | review → frontend-check Tier B axe.run() |
| `responsive-check` | frontend | review → frontend-check Tier B viewport + snapshot |
| `visual-regression` | frontend | test → frontend-check Tier B screenshot diff (placeholder) |
| `component-isolation` | frontend | build |
| `api-contract-check` | backend | review |
| `n-plus-one-check` | backend | review |
| `integration-test` | backend | test |
| `migration-safety` | backend | build |
| `data-integrity-check` | data | review |
| `data-validation` | data | test |
| `data-volume-estimate` | data | plan |
| `iac-drift-check` | infra | review |
| `dry-run-first` | infra | build |
| `blast-radius` | infra | review |
| `accuracy-check` | docs | review |
| `link-check` | docs | review |
| `scaffold-first` | greenfield | plan |
| `tech-stack-review` | greenfield | decide |
| `backward-compat` | iteration | review |
| `regression-suite` | iteration | test |
| `behavior-preservation` | refactor | plan |
| `characterization-tests` | refactor | test |
| `small-steps` | refactor | build |
| `behavior-diff` | refactor | review |
| `reproduce-first` | bugfix | build |
| `root-cause-focus` | bugfix | plan |
| `regression-for-fix` | bugfix | test |
| `snapshot-update` | frontend+refactor | test |
| `error-path-audit` | backend+bugfix | review |
| `cost-estimate` | infra+greenfield | decide |

当 TaskType 与 ProjectPhase 同时匹配 Scope 时，对应 hint 会被注入到命令序列中。下游 skill 读取 `.forge/status.md` 的 `hints` 字段并据此调整行为。
