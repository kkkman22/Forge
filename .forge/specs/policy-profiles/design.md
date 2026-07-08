---
feature: "policy-profiles"
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
brownfield: true
---

# Design — policy-profiles

## Overview

Add `policy_profile` as a first-class config field consumed by workflow graph and health/gate layers.

## Profile Matrix

| Profile | Intended Use | Review | Evidence | Mutation | Force Skip |
|---------|--------------|--------|----------|----------|------------|
| solo | Personal projects | lightweight allowed | basic artifacts | optional | warning + log |
| team | Default collaboration | current behavior | required review/test/ship | opt-in | explicit audit |
| enterprise | Compliance-heavy teams | full review layers | immutable artifacts required | selected hard gates | stricter approval artifact |

## Architecture

| Component | Change |
|-----------|--------|
| `.forge/config.md` parser | Add `policy_profile`. |
| Workflow graph | Attach gates by profile. |
| Ship gates | Enforce profile-specific requirements. |
| Doctor/status | Explain active profile. |
| Docs | Explain selection guidance. |

## Testing Strategy

- Config parser tests.
- Workflow graph profile tests.
- Ship gate profile behavior tests.
- Doctor explanation tests.

## Rollout

1. Add config parsing and default.
2. Add graph metadata.
3. Add status/doctor display.
4. Add ship gate profile differences.
5. Update docs.

## Reversibility

Default profile remains `team`; removing profile config restores current behavior.
