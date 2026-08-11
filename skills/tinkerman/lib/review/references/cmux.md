---
updated: 2026-08-11
---
# cmux Integration — Review Phase

## Overview

When cmux is installed, Forge review results are projected to the cmux sidebar in real-time.

## Integration Points

- **Frontmatter**: Review files (`/.tinkerman/reviews/*.md`) include `layers_status` frontmatter tracking each review layer's completion state
- **Notifications**: Review completion triggers a cmux notification via `hook-notify.sh`
- **Sidebar**: Layer progress (spec-check, quality-check, security-check) displayed in sidebar

## How It Works

1. `review.ts` performs atomic frontmatter rewrite: read → parse → mutate → tmp → rename
2. `Mirror_Daemon` or `sync-once.mjs` detects file change
3. `reader.mjs` reads frontmatter, `emitter.mjs` generates `sidebar_state` commands
4. Commands dispatched to cmux CLI

## Zero-Impact

Without cmux installed, review proceeds identically. The frontmatter changes are still written (useful for tooling) but no cmux commands are emitted.

## Related Files

- `scripts/cmux-mirror/lib/reviews.mjs` — frontmatter parser
- `src/review.ts` — atomic frontmatter rewrite (≤80 lines added)
- `scripts/cmux-mirror/hook-notify.sh` — frozen interception notification
