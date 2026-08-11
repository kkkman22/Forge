---
updated: 2026-08-11
---
# Forge Verify — Artifact Layout Reference

## Directory Structure

```
.tinkerman/findings/<topic>/verify-this/
├── claim.md              # Falsifiable_Claim
├── baseline/
│   ├── <command-1>.log   # Command invocation log
│   └── <metric-1>.json   # Metric output
├── treatment/
│   ├── <command-1>.log
│   └── <metric-1>.json
├── diff/
│   └── <metric-1>.diff.md
└── verdict.md            # Three_State_Verdict + Evidence_Chain
```

## Artifact Schemas

### claim.md [R1.2]

Frontmatter fields: `condition`, `metric`, `threshold` (all required non-empty), `baseline_ref`, `topic`, `created_at`.

### verdict.md [R1.1, R1.5, R1.9]

Frontmatter: `verdict` (three-state enum), `topic`, `claim_path`, `baseline_snapshot`, `treatment_snapshot`, `decided_at`, `missing_artifacts` (array), `inconclusive_reason`.

Body: `## Evidence Chain` section with one entry per artifact.

### Command Invocation Log

```
Command: <executed-command>
Exit Status: <code>
Timestamp: <ISO-8601>
---
<output>
```

## Invariants

1. `verdict === "VERIFIED"` → both `baseline/` and `treatment/` contain ≥1 file [R13.4]
2. Every artifact has exactly one Evidence Chain entry [R1.5]
3. `claim.md` written before artifact capture [R1.2]
4. Failed captures preserve already-captured artifacts [R1.6]

## Harness Verdict Compatibility

CLI_Harness (R5) and UI_Harness (R6) produce `verdict.md` with the same schema. Forge_Verify parses and re-emits without altering verdict value or Evidence_Chain entries [R1.9].
