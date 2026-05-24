---
description: "Browser-based QA verification using cmux browser commands during /forge test. Requires cmux installed."
dispatch_mode: inline
allowed_tools:
  - Read
  - Bash
---

# Forge Browser QA

Provides browser-based quality assurance during the `/forge test` phase using cmux browser commands.

## Usage

Activated automatically during `/forge test` when cmux browser capabilities are available.

## Verdict States

| Verdict | Meaning |
|---------|---------|
| pass | All browser checks completed |
| fail | One or more checks failed |
| inconclusive | cmux browser unavailable or error |

## Artifact

Results written to `.forge/.cmux-browser-qa.json`.

## Zero-Impact

Without cmux, standard test verification proceeds normally. Browser QA is purely additive.
