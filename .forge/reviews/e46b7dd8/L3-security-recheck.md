## Layer 3: security-check Re-check — cmux-0.64-integration (post-fix c77e3472)

reviewer: security-check (independent subagent, re-verification)
reviewed_at_commit: c77e3472

### Verdict: CLEAN — all 4 prior findings resolved, no residual, no new issues.

### Per-finding verification

**S1 (P1, path-traversal) — RESOLVED.** `SAFE_TOPIC = /^[A-Za-z0-9._-]{1,64}$/`; `safeTopic = typeof topic==="string" && SAFE_TOPIC.test(topic) ? topic : "default"` before `join`. Exhaustive: absolute path (`/`) → rejected; traversal needs `/` which the class excludes (bare `..` only cancels the `findings` segment, lands inside forgeDir); empty/non-string/NUL/overlong → "default". Never-throws preserved (pure assignment + outer try/catch).

**S2 (P1, argument-injection) — RESOLVED.** `SAFE_SURFACE = /^[A-Za-z0-9._:-]{1,64}$/`; `injectSurface` throws on mismatch. Class excludes whitespace/`/`/`=` → `--out=`, `--window=`, `;`, newline, backtick all fail. No `--flag=value` form smuggleable. Throw posture correct: `collectBrowserDiagnostics` per-step try/catch → throw degrades to skipped step, Zero-Impact holds. Bypass: non-browser arrays never get surface spliced (returns unchanged).

**Q3 (P2, method validation) — RESOLVED.** `SAFE_METHOD = /^[a-zA-Z0-9_.]+$/`. All real cmux methods (set_status, set_progress, notification.create, sidebar_state, log, browser.*) match; none rejected. Whitespace/`-`/`/`/shell-meta rejected. Dispatch sites (mirror.mjs:51-56, sync-once.mjs:87-94) wrap buildRpcArgs in try/catch (R13.5 best-effort) → throw degrades to skipped command, no crash, no silent security swallow.

**Q1 (P2, dead-code) — RESOLVED.** `buildFocusWebviewArgs` fully removed; only remaining reference is a changelog doc comment in the file header, not code/export/importer. Zero dangling importers.

### New findings
None. No new injection surface, no Zero-Impact regression (both dispatch sites preserve try/catch), no new secrets/exec/eval/path-joins beyond the now-guarded one.

### Notes
- `SAFE_PATH` in buildScreenshotArgs is weaker than SAFE_TOPIC but pre-existing; its `outPath` input is `join(dir,"screenshot.png")` where `dir` is now SAFE_TOPIC-guarded, so input is already confined. Not a residual.
- SAFE_TOPIC vs SAFE_SURFACE char classes differ (`_-` vs `._:`) — defensible per distinct namespaces (filesystem vs cmux handle).

<!-- review-final -->
