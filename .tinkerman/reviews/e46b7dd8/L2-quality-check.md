## Layer 2: quality-check Review — cmux-0.64-integration

methodology: subagent-parallel
reviewer: quality-check (independent subagent)
reviewed_at_commit: e46b7dd8

### Severity Table

| # | Severity | Confidence | File:Line | Category | Description |
|---|----------|------------|-----------|----------|-------------|
| Q1 | P2 | 0.85 | `scripts/cmux-mirror/lib/browser-q-actions.mjs:52` | dead-code | `buildFocusWebviewArgs()` exported but never imported by any production caller (only by the test). Mirrors known-failure `skill-function-defined-without-production-caller`. |
| Q2 | P2 | 0.80 | `scripts/cmux-mirror/lib/browser-q-actions.mjs:64-67` | injection-guard-gap | `injectSurface()` does not validate the `surface` param; an untrusted caller can pass shell-meta/newline strings that propagate into the argv array (execFile avoids shell, but surface reaches cmux unvalidated — inconsistent with `SAFE_PATH`/`REF_PATTERN` guards elsewhere). |
| Q3 | P2 | 0.82 | `scripts/cmux-mirror/lib/cli.mjs:15-20` | injection-guard-gap | `buildRpcArgs()` does not validate `cmd.method`; a method like `"foo; rm -rf /"` passes through. Unlike `buildReorderArgs` (REF_PATTERN), `buildRpcArgs` trusts the caller. |

### Fix Routing
- **Q1**: `manual` — remove `buildFocusWebviewArgs` (no near-term production use) OR wire it into `collectBrowserDiagnostics`/`runBrowserQa` as an optional pre-interaction step.
- **Q2**: `safe_auto` — add a `SAFE_PATH`/pattern guard in `injectSurface`, throw on invalid surface.
- **Q3**: `gated_auto` — add a `SAFE_METHOD` pattern (`^[a-zA-Z_][a-zA-Z0-9_.]*$`) or reject whitespace/shell-meta in `buildRpcArgs`.

### P0 / P1
None.

### P2
- Q1: `buildFocusWebviewArgs` dead export.
- Q2: `injectSurface` no surface validation.
- Q3: `buildRpcArgs` no method validation.

### P3
None.

### Zero-Impact Assessment — PASS
All new cmux code paths correctly no-op when cmux absent:
- `raiseActiveWorkspace`: early-returns on empty `activeRef` or `probeReorderSupported() === false`.
- `collectBrowserDiagnostics`: early-returns on `!cmuxAvailable()` / missing `forgeDir`; per-step independent degradation; never throws.
- `resolveSocketPath`: falls through to `/tmp/cmux.sock` default on any state-file read failure.
- `probeReorderSupported` cache: correct for daemon lifetime (`--help` outcome stable).
- Socket path validated by `isSafeSocketPath` + `statSync().isSocket()`.

### Test Coverage — ADEQUATE (not tautological)
buildReorderArgs (5), probeReorderSupported (3), raiseActiveWorkspace (3), buildRpcArgs (2), browser-q-actions builders (5), collectBrowserDiagnostics (4), cmux-json-schema (structural), zero-impact regression. Tests assert specific argv tokens, rejection behavior, integration wiring.

### Deslop Scan — clean
No comment-paraphrase, no infallible try/catch, no `as any`, nesting ≤2.

<!-- review-final -->
