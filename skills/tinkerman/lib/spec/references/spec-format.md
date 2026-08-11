---
updated: 2026-08-11
---
# Spec Document Format

## 1. Layout Variants

Forge supports two spec layouts:

| Layout | Files | When Used |
|--------|-------|-----------|
| **three-file** (default) | `requirements.md` + `design.md` + `tasks.md` | New specs since Kiro-style upgrade |
| **legacy-single** | `spec.md` | Pre-existing specs, backward compat |

**Detection**: `loadSpecBundle(featureDir)` auto-detects layout by checking which files exist.

## 2. Three-File Layout

### YAML Frontmatter (shared across all three files)

```yaml
---
feature: "<feature-name>"           # kebab-case
status: "draft" | "locked"
date: "YYYY-MM-DD"
workflow_variant: "requirements-first" | "design-first" | "quick-plan"
kind: "feature" | "bugfix"          # optional, defaults to "feature"
import_source: "<path>"             # optional, import mode only
brownfield: true                    # optional, auto-detected
contract_legacy: true               # optional, skips Contract Gate
---
```

### requirements.md (Feature Spec)

```markdown
## Purpose
<problem statement, for whom>

## Glossary
| Term | Definition |
|------|-----------|

## Requirements
### Requirement N: <Title>
<behavioral description>

#### Acceptance Criteria
- 当 <condition> 时 系统应当 <behavior> <!-- EARS syntax -->

## Non-Functional Requirements
<performance, security, accessibility constraints>

## Out of Scope
<explicit boundary: what this feature does NOT do>

## Delta (brownfield only)
### Added
### Modified
### Unchanged
```

### requirements.md (Bugfix Spec)

```markdown
## Current Behavior
- 当 <condition> 时 系统应当 <current-buggy-behavior>

## Expected Behavior
- 当 <condition> 时 系统应当 <correct-behavior>

## Unchanged Behavior
- 当 <condition> 时 系统应当 <preserved-behavior>
```

### design.md

```markdown
## Overview
## Architecture
## Component Interfaces
## Data Model
## Error Handling
## Testing Strategy
## Rollout
## Open Questions

<!-- Brownfield additions -->
## Current State (brownfield only)
## Proposed Change (brownfield only)
## Reversibility (brownfield only)
```

### Bugfix design.md

```markdown
## Root Cause Analysis
## Fix Strategy
## Test Properties
```

### tasks.md

```markdown
## Overview
<execution summary>

## Task Dependency Graph
```json
{ "waves": [...] }
```

### Task Definitions
#### T-NN <title>
- **Goal**: ...
- **TDD Steps**: RED → GREEN → REFACTOR
- **Verify Command**: ...
- **Definition of Done**: ...
- **Depends On**: T-XX
```

## 3. Legacy Single-File Layout (Backward Compatible)

### YAML Frontmatter

```yaml
---
feature: "<feature-name>"
status: "draft" | "locked"
date: "YYYY-MM-DD"
import_source: "<path>"
---
```

### Body Structure

```markdown
## 目的 — <problem, for whom>
## 需求 — ### 需求 N：<title> + behavioral description + **场景**：当...则...
## 场景汇总 — | ID | Scenario | Requirement |
## Current State — **Required**. Related Modules table + Structure Overview
## Proposed Change — **Required**. To Change + Explicitly Unchanged
## 不做什么 — boundary
## Reversibility — **Required**. Rollback Checklist + Mount Points
## 反漂移声明 — main goal + non-goal signals + verification material role
## Delta — brownfield only: New / Modified / Unchanged
```

## 4. Compatibility Slice Table

| Three-File Section | Legacy Section | Notes |
|--------------------|----------------|-------|
| requirements.md → Purpose | ## 目的 | Direct map |
| requirements.md → Requirements | ## 需求 | EARS replaces 当...则... |
| requirements.md → Acceptance Criteria | **场景** entries | EARS format preferred |
| requirements.md → Out of Scope | ## 不做什么 | Direct map |
| requirements.md → Delta | ## Delta | Direct map |
| design.md → Current State | ## Current State | Direct map |
| design.md → Proposed Change | ## Proposed Change | Direct map |
| design.md → Reversibility | ## Reversibility | Direct map |
| tasks.md → Tasks | (was in plans/) | Single source replaces plans/ |

## 5. Scenario Linter Rules

All Gherkin scenarios in spec documents must pass the following rules before lock:

| Rule | Description |
|------|-------------|
| SCN001 | Every Given/When/Then/And line must end with `.` or `。` |
| SCN002 | Every Scenario must have at least one Given, one When, and one Then |
| SCN003 | THEN lines must describe externally observable outcomes (no "database contains", "variable equals") |
| SCN004 | Scenario titles must use kebab-case or Chinese (no mixed camelCase) |

Error-severity findings block lock. Warning-severity findings are informational.

Legacy specs (locked before this rule) are exempt via `lint_grandfathered: true` in frontmatter.
