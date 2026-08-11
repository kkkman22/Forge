## Layer 3: security-check Review — cmux-0.64-integration

methodology: subagent-parallel
reviewer: security-check (independent subagent)
reviewed_at_commit: e46b7dd8

### Severity Table

| # | Severity | Confidence | File:Line | Category | Description |
|----|----------|------------|-----------|----------|-------------|
| S1 | P1 | 0.85 | scripts/cmux-mirror/browser-qa.mjs:137 | path-traversal | `topic` flows unsanitized into `join(forgeDir, "findings", topic, "browser-qa")`; a caller passing `topic="../.."` or an absolute path escapes `forgeDir`, then `mkdirSync`/`writeFileSync` write outside `.forge`. `buildScreenshotArgs` has a `..` guard on `outPath`, but `topic` itself is never checked (asymmetry). |
| S2 | P1 | 0.75 | scripts/cmux-mirror/lib/browser-q-actions.mjs:64-67 | argument-injection | `injectSurface(args, surface)` splices a caller-supplied `surface` into the argv with no validation. `execFile` prevents shell parsing, but a `surface` like `"--out=/etc/x"` or `"--window=evil"` pollutes the `cmux browser` subcommand's flag set. No regex confinement (unlike `SAFE_WINDOW_ID`/`REF_PATTERN`). |
| S3 | P3 | 0.60 | scripts/cmux-mirror/mirror.mjs:179-184 | permission-boundary | `raiseActiveWorkspace` mutates cmux UI state (workspace reorder) on daemon start without explicit consent. Low impact (UI-only, in-group, no-op without cmux), but alters user's workspace order. |

### Fix Routing
- **S1**: `safe_auto` — validate `topic` before `join` with `/^[A-Za-z0-9._-]{1,64}$/`, reject `..`/absolute; fallback to `"default"` or throw. Mirror buildScreenshotArgs/buildReorderArgs.
- **S2**: `safe_auto` — add `SAFE_SURFACE = /^[A-Za-z0-9._:-]{1,64}$/` confine; reject whitespace/`--`/newline. Validate in `injectSurface` before splicing.
- **S3**: `advisory` — document the auto-raise side effect; optional opt-out env flag later. Not blocking.

### P0
None.

### P1
- S1: path traversal via unsanitized `topic` in collectBrowserDiagnostics.
- S2: argument pollution via unsanitized `surface` in injectSurface.

### P2
None.

### P3
- S3: surprising workspace reorder on daemon start.

### Positive confirmations
- No hardcoded secrets in templates/cmux.json or new code.
- All dispatch uses `execFile` (not `exec`) → no shell injection at any dispatch site.
- `SAFE_WINDOW_ID` / `REF_PATTERN` / `buildScreenshotArgs` outPath `..` check are sound.
- Socket-path relaxation (dropped `/tmp` prefix whitelist) is acceptable: `statSync().isSocket()` constrains the target and impact is bounded to boolean availability detection via the `cmux` binary (not raw socket).

<!-- review-final -->
