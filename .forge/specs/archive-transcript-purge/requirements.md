---
status: completed
feature: archive-transcript-purge
layout: requirements
created: 2026-05-12
tier: standard
---
# Requirements Document

## Introduction

Claude Code 2.1.126（2026-05-01）引入 `claude project purge [path]` 子命令，用于清理单个项目的 CC 状态（transcripts、tasks、file history、config entry），支持 `--dry-run`、`-y/--yes`、`-i/--interactive`、`--all`。

Forge 已有 `.forge/archive/` 归档机制：完成的 spec/plan 会被移到 `archive/<YYYY-MM-DD>-<slug>/`，但 CC 侧的 transcripts（`~/.claude/projects/-Users-king-code-Forge/*.jsonl` 等）不会被清理。长期积累后：

- `~/.claude/` 占用磁盘空间
- `/resume` 加载所有 project 时变慢
- transcript 中仍含已废弃 spec 的残余上下文

本 spec 把 `claude project purge` 纳入 Forge 的归档流程，作为归档的最后一步。

## Glossary

- **CC_Project_Purge**：`claude project purge [path]` 子命令，支持 `--dry-run`、`-y`、`-i`、`--all`。
- **Forge_Archive_Command**：Forge 的归档流程入口，当前位于 `scripts/archive.sh` 或通过 skill 调用。
- **Forge_Archive_Dir**：`.forge/archive/<YYYY-MM-DD>-<slug>/`，归档产物目录。
- **CC_Project_State**：CC 侧对应某项目的 state，含 transcripts、tasks、file history、config entry，位于 `~/.claude/projects/<encoded-path>/` 和 `~/.claude.json` 的 projects entry。
- **Purge_Manifest**：归档时生成的清单 `manifest.json`，记录 CC purge 的 dry-run 预览、用户确认状态、实际执行结果。

## Requirements

### Requirement 1: 归档流程纳入 CC_Project_Purge 作为可选最后一步

**User Story:** As a developer archiving a completed spec, I want the archive command to optionally clean up Claude Code's transcripts for that spec's work period, so that my local ~/.claude/ doesn't accumulate stale conversation history.

#### Acceptance Criteria

1. WHEN Forge_Archive_Command completes the file-level archive (moving spec/plan/progress to Forge_Archive_Dir), THE Forge_Archive_Command SHALL prompt: "归档完成。是否同时清理 Claude Code transcripts？[y/N]"; default is No.
2. IF the user accepts, THEN THE Forge_Archive_Command SHALL invoke `claude project purge "$(pwd)" --dry-run` first, display the summary (count of transcripts, tasks, file-history entries), and prompt a second confirmation.
3. IF the user confirms both prompts, THEN THE Forge_Archive_Command SHALL invoke `claude project purge "$(pwd)" --yes` and capture the output.
4. IF the user declines either prompt, THEN THE Forge_Archive_Command SHALL record the decline in the Purge_Manifest and exit successfully without touching CC state.
5. THE Forge_Archive_Command SHALL NEVER invoke `claude project purge --all`; only the current project path is allowed, to prevent cross-project damage.

### Requirement 2: Purge_Manifest 记录

**User Story:** As an auditor or maintainer, I want a durable record of every purge decision and outcome, so that I can verify nothing was deleted without user consent.

#### Acceptance Criteria

1. WHEN Forge_Archive_Command invokes CC_Project_Purge (dry-run or real), THE Forge_Archive_Command SHALL write a Purge_Manifest file at `<archive-dir>/purge-manifest.json` containing: `slug`, `archive_date`, `cc_project_path`, `dry_run_output`, `user_decision` (accepted/declined/declined_preview), `execution_output` (if executed), `timestamp`.
2. THE Purge_Manifest SHALL include the full stdout of `claude project purge --dry-run` as a string field, even if truncated to 10 KB with a `truncated: true` flag.
3. IF `claude project purge` execution fails (non-zero exit), THEN THE Purge_Manifest SHALL record `execution_output.exit_code` and `execution_output.stderr`, and the archive process SHALL NOT roll back the file-level archive; the error is surfaced to the user but does not abort.
4. THE Purge_Manifest SHALL be written before the second (real) invocation of `claude project purge`, so that crashes mid-purge still leave a trace.

### Requirement 3: 非交互模式与 CI 场景

**User Story:** As a CI pipeline running automated cleanup, I want a non-interactive flag that auto-accepts the dry-run summary and runs purge, so that stale project state can be cleaned without human intervention.

#### Acceptance Criteria

1. THE Forge_Archive_Command SHALL support a flag `--purge-cc[=auto|skip|ask]` where `auto` accepts both prompts, `skip` declines both, and `ask` (default) uses interactive prompts.
2. WHEN `--purge-cc=auto` is set AND no TTY is available (e.g. CI), THE Forge_Archive_Command SHALL still execute the purge, logging the dry-run output to the Purge_Manifest before execution.
3. WHEN `--purge-cc=auto` is set AND `claude project purge` is not available (older CC version), THE Forge_Archive_Command SHALL emit a warning and continue, recording `cc_purge_unavailable: true` in the Purge_Manifest.
4. THE Forge_Archive_Command SHALL NEVER auto-execute `claude project purge` without an explicit `--purge-cc=auto` flag or the user's y/y double confirmation, even in `-y/--yes` modes of other flags.

### Requirement 4: 安全边界与回滚

**User Story:** As a developer worried about destructive operations, I want strong safeguards so that an accidental purge is limited in scope and reversible where possible.

#### Acceptance Criteria

1. THE Forge_Archive_Command SHALL resolve the current project path via `git rev-parse --show-toplevel` before passing it to `claude project purge`; if the resolution fails, THE command exits without invoking purge.
2. THE Forge_Archive_Command SHALL compare the resolved project path against a blacklist (`/`, `$HOME`, `/tmp`, current user's home directory root); if matched, the command refuses to invoke purge with a diagnostic.
3. WHEN the user runs Forge_Archive_Command from a git worktree, THE command SHALL pass the main repository path (not the worktree path) to `claude project purge`, so that transcripts for the full project are cleaned consistently.
4. THE Forge_Archive_Command SHALL NEVER invoke `claude project purge` with interactive mode (`-i`); only `--dry-run` and `--yes` modes are used, to keep all decision-making inside Forge's confirmation flow.

### Requirement 5: 文档与 ADR 记录

**User Story:** As a new user reading Forge's archive docs, I want the CC purge integration explained clearly with opt-out paths, so that I understand what happens to my conversation history during archive.

#### Acceptance Criteria

1. THE `README.md` SHALL include a new subsection "归档与 CC transcripts 清理" under the archive documentation, explaining the two-prompt flow, the `--purge-cc` flag, and how to disable.
2. THE `.forge/decisions/` SHALL include a new ADR documenting the decision to integrate `claude project purge` as an optional archive step, the alternatives considered (manual, automatic, skip entirely), and the chosen trade-offs.
3. THE CHANGELOG SHALL include a `[CHANGED]` entry under the next unreleased version describing the archive flow enhancement and cross-referencing Claude Code 2.1.126.
4. THE new flag `--purge-cc` SHALL be documented in the relevant skill (`skills/forge-archive/SKILL.md` if exists, otherwise the skill orchestrating archive) with examples for each value.
