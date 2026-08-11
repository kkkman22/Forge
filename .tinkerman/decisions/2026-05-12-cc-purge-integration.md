# ADR: CC Purge Integration into Forge Archive

- **Date**: 2026-05-12
- **Status**: Accepted
- **Drivers**: archive-transcript-purge spec

## Context

Claude Code 2.1.126 introduced `claude project purge [path]` for cleaning per-project state (transcripts, tasks, file history). Forge's archive mechanism moves spec/plan/progress files but leaves CC state accumulating.

## Decision

Integrate `claude project purge` as an optional last step in the archive flow, behind a `--purge-cc=ask|skip|auto` flag (default: ask).

## Alternatives Considered

1. **Manual only** — Users run `claude project purge` manually. Rejected: friction, easy to forget.
2. **Always auto** — Purge always runs on archive. Rejected: destructive, no user control.
3. **Skip entirely** — Don't integrate. Rejected: accumulates stale state, slows `/resume`.

## Key Design Choices

- **Two-prompt flow**: dry-run preview + confirm. Even `--yes` mode from CC goes through Forge's confirmation.
- **Manifest-first**: Write `purge-manifest.json` before execution. Crash safety.
- **File archive independent**: CC purge failure does not roll back file-level archive. Exit code 2 vs 1.
- **Blacklist**: Additional layer on top of CC's own protection. `/`, `$HOME`, `/tmp` rejected.
- **Worktree-aware**: `git rev-parse --git-common-dir` resolves to main repo path.
- **No jq dependency**: Manifest generated with printf (portability).

## Consequences

- Archive gains an optional cleanup step. Default is interactive (ask mode).
- New files: `scripts/archive-spec.sh`, `test/archive-purge.test.sh`
- CC version < 2.1.126 gracefully degrades (warning + skip).
