---
title: "Frontend Check — Tier B Workflow"
version: "1.0"
updated: 2026-08-11
---

# Tier B — cmux Browser + axe-core Workflow

Prerequisites: `detectTierAvailability().b !== "unavailable"` AND `scripts/vendor/axe.min.js` exists.

## Dev Server Lifecycle

```bash
# Start dev server with managed lifecycle
control_bash_process start "npm run dev" -> terminal_id=TID

# Ensure cleanup on any exit path
trap 'control_bash_process stop $TID' EXIT
```

Timeout: 5 minutes max. If exceeded, force stop and report partial results.

## Browser Workflow

```bash
# Open browser surface
cmux browser open http://localhost:5173
SURFACE=$(cmux browser identify | jq -r '.focused_surface_id')

# Login state handling
STATE_CACHE=".tinkerman/cache/login-state-${PROJECT}.json"
if [ -f "$STATE_CACHE" ]; then
  cmux browser $SURFACE state load "$STATE_CACHE"
fi

# Inject axe-core
cmux browser $SURFACE addinitscript "$(cat scripts/vendor/axe.min.js)"
cmux browser $SURFACE reload --snapshot-after
cmux browser $SURFACE wait --function "window.axe !== undefined"

# Page traversal configuration (JSON array in project config or default)
# DEFAULT_KEY_URLS=["/","/login","/dashboard"]

# For each key URL:
for URL in "${KEY_URLS[@]}"; do
  PAGE_NAME=$(basename "$URL" | sed 's/^$/index/')
  cmux browser $SURFACE navigate "$URL" --snapshot-after
  cmux browser $SURFACE wait --load-state complete --timeout-ms 15000

  # Run axe-core audit
  cmux browser $SURFACE eval "JSON.stringify(await axe.run())" \
    > ".tinkerman/reviews/assets/axe-${PAGE_NAME}.json"

  # Capture artifacts
  cmux browser $SURFACE screenshot --out ".tinkerman/reviews/assets/${PAGE_NAME}.png"
  cmux browser $SURFACE console list > ".tinkerman/reviews/assets/console-${PAGE_NAME}.log"
  cmux browser $SURFACE errors list > ".tinkerman/reviews/assets/errors-${PAGE_NAME}.log"
done

# Save login state for future runs
cmux browser $SURFACE state save "$STATE_CACHE"
```

## Login State Cache Strategy

| State | Agent Action |
|-------|-------------|
| No cache + page requires auth | Prompt user to login in cmux browser, then save state |
| Cache exists and not expired | Load cache, continue workflow |
| Cache expired | Clear cache, prompt for fresh login |
| No auth required | Skip login state logic |

## Error Handling

- Dev server fails to start → report error, skip Tier B
- Browser connection lost → retry once, then degrade
- axe.run() timeout → capture partial results, report warning
- Page load timeout → skip page, continue to next

## Output Parsing

Parse `axe-*.json` with `parseAxeResult()` from `src/frontend-check.ts`.
Impact mapping: `critical` → P0, `serious` → P1, `moderate` → P2, `minor` → P3.
