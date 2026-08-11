---
updated: 2026-08-11
---
# Spec Leak Detector

Detects implementation details in spec documents that should describe behavior, not implementation.

## How It Works

1. Loads banned patterns from enabled packs and custom layer (union across layers)
2. Scans spec text line by line, skipping fenced code blocks
3. Matches each line against banned patterns (literal and regex)
4. Exempts terms defined in the glossary for the spec's context or `_shared`
5. Reports findings with category, line, matched term, and suggested rewrite

## Categories

| Category | Examples |
|----------|----------|
| `code` | UserService, *Service suffix |
| `infrastructure` | POST /api/*, SELECT |
| `framework` | Controller, Middleware |
| `technical` | Redis, Kafka |

## Integration

- **forge-spec lock**: 8th self-check item. Findings block `status: locked`.
- **forge-review Layer 1**: Re-scan step. Post-lock findings reported as P1.

## Zero-Pack Behavior

When no packs are enabled and no custom `banned-patterns.yaml` exists, the detector returns no findings (no-op).

## Customization

Add project-specific banned patterns in `.tinkerman/custom/banned-patterns.yaml`:

```yaml
schema_version: 1
categories:
  code:
    - pattern: "MyInternalClass"
      description: "Internal class name should not appear in spec"
```
