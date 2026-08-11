---
status: completed
feature: frozen-zone-structured-feedback
layout: requirements
created: 2026-05-12
tier: standard
status_note: "All 4 requirements delivered. R1 (structured FrozenDiagnostic) + R2 (PreToolUse hook systemMessage + additionalContext) in src/frozen-zone-hook.ts. R3 (PostToolUse defence-in-depth: createFrozenZonePostToolUseHook emits updatedToolOutput revert prompt + writeFrozenBreachRecord audits to .tinkerman/runs/<stamp>-frozen-breach.md; does NOT undo the write per R3.4) delivered 2026-06-14. R4 (Zone_Registry single-source-of-truth): shell path already had scripts/zone-registry.sh + print-zone-registry.sh; TS path added src/zone-registry.ts (loadZoneRegistry parses .tinkerman/config.md frozen_zone field with DEFAULT_ZONE_RULES fallback + stderr warning R4.2, loadZoneRegistryCached R4.5, formatZoneRegistry R4.4) delivered 2026-06-14."
---
# Requirements Document

## Introduction

Claude Code 2.1.121（2026-04-28）扩展了 `PostToolUse` hook 的能力：`hookSpecificOutput.updatedToolOutput` 字段现在对所有工具（不只 MCP）生效，hook 可以**重写工具调用的输出**回传给模型。配合 2.1.10 起 `PreToolUse` hook 可以返回 `updatedInput` 修改工具输入，CC 的 hook 体系完成了从"拦截/放行"到"middleware"的进化。

Forge 当前的冻结区保护（`scripts/hook-check-frozen.sh` + `hooks/hooks.json`）是典型的"硬阻断"模型：

- PreToolUse 发现工具要写入 frozen 路径 → exit 2 → CC 中止工具
- 模型只得到一句 "Tool execution blocked"，没有结构化的"为什么被阻断"和"该去哪里写"
- 模型经常重试相同工具相同参数，或随意切换到另一个路径（不一定正确）

本 spec 把 Forge 的 frozen-zone 从"硬阻断"升级为"结构化反馈 middleware"：

- 阻断时注入精确诊断（哪个文件、为什么冻结、对应的非冻结替代路径、解锁方式）
- 用 `PostToolUse updatedToolOutput` 统一反馈格式（即便 CC 工具已执行但返回错误，也能覆写错误为 Forge 的规范诊断）
- 可观测：每次 frozen-zone 命中写入 `.tinkerman/runs/` 供审计

## Glossary

- **Frozen_Zone**：`.tinkerman/config.md` 定义的"AI 不可修改"区域，当前包含 `.tinkerman/specs/*/spec.md` (locked)、`.tinkerman/plans/*.md` (approved)、`.tinkerman/config.md`。
- **Guarded_Zone**：`.tinkerman/config.md` 定义的"AI 可追加，不可删除或覆盖"区域，例如 `.tinkerman/progress/*.md`、`.tinkerman/reviews/*.md`。
- **Frozen_Hook_Script**：`scripts/hook-check-frozen.sh`（及 `check-sandbox.js` 等衍生 hook），当前通过 exit code 2 阻断写入冻结区。
- **Pre_Hook_Structured_Output**：CC 2.1.10+ 支持的 PreToolUse hook 返回的 JSON 结构（含 `decision`、`systemMessage`、`updatedInput`、`additionalContext`）。
- **Post_Hook_Override_Output**：CC 2.1.121+ 支持的 PostToolUse hook 通过 `hookSpecificOutput.updatedToolOutput` 覆写工具输出的能力（原 MCP-only，现扩展至全工具）。
- **Frozen_Diagnostic**：本 spec 定义的结构化诊断对象（frozen 路径、冻结类别、原因、建议路径、解锁指令）。
- **Zone_Registry**：`.tinkerman/config.md` 中声明的所有 frozen/guarded 路径规则，被 hook 脚本读取构建匹配器。

## Requirements

### Requirement 1: 结构化 Frozen_Diagnostic 对象定义

**User Story:** As a Claude Code agent blocked from writing to a frozen file, I want a precise diagnostic explaining why, where to write instead, and how to unlock, so that I can correct my next action without trial-and-error.

#### Acceptance Criteria

1. THE Frozen_Hook_Script SHALL emit a structured Frozen_Diagnostic with fields: `path` (absolute or project-relative), `category` (`frozen-spec` | `frozen-plan` | `frozen-config`), `reason_code`, `reason_text` (human-readable), `suggested_alternative_path` (optional, path-relative), `unlock_instruction` (text).
2. THE `reason_code` SHALL be one of a fixed enum: `SPEC_LOCKED`, `PLAN_APPROVED`, `CONFIG_ROOT`, `ZONE_OVERRIDE_MISSING`; adding new codes requires updating `.tinkerman/config.md` Zone_Registry and a contract test fixture.
3. THE Frozen_Diagnostic SHALL be serializable to both JSON (for hook output) and a readable Markdown paragraph (for `additionalContext`).
4. WHEN a file path matches multiple zone rules (e.g. a spec under an approved plan), THE Frozen_Hook_Script SHALL apply the most restrictive category and report only that category; secondary matches are recorded in an audit log but not surfaced to the model.

### Requirement 2: PreToolUse hook 返回结构化 JSON

**User Story:** As a hook author improving frozen-zone blocking, I want the PreToolUse hook to return JSON with a deny decision and structured message, so that Claude Code surfaces the diagnostic cleanly instead of a raw stderr line.

#### Acceptance Criteria

1. THE Frozen_Hook_Script SHALL replace its current `exit 2` pattern with a JSON stdout containing: `{"decision": "deny", "systemMessage": "<rendered Frozen_Diagnostic>", "additionalContext": "<suggestions>"}`; exit code becomes 0 (JSON-based decision) or 2 (legacy fallback).
2. WHEN the hook uses the new JSON format, THE exit code SHALL be 0 when returning a deny decision; exit code 2 is reserved for catastrophic hook errors (script crash, config missing) that should halt CC immediately.
3. THE `systemMessage` SHALL include the exact frozen path, category, and unlock instruction; it does NOT include large markdown tables or multiline formatting (to keep model context minimal).
4. THE `additionalContext` SHALL include the suggested alternative path when available (e.g. "consider writing to `.tinkerman/findings/<slug>.md` instead") and a reminder about `.tinkerman/status.md` for state changes.
5. THE Frozen_Hook_Script SHALL respect the `permissions.deny` rules in `.claude/settings.json`: if a path is both deny-listed and frozen, the deny rule takes precedence and the hook short-circuits without emitting structured output.

### Requirement 3: PostToolUse hook 覆写输出以统一反馈格式

**User Story:** As a model that somehow bypassed a PreToolUse check (e.g. via parallel tools or a rare race), I want the PostToolUse hook to detect the frozen-zone violation and rewrite the tool output with a Frozen_Diagnostic, so that I always see the same structured guidance regardless of enforcement path.

#### Acceptance Criteria

1. THE project SHALL include a new PostToolUse hook for `Write`, `Edit`, `MultiEdit` tools that, after execution, re-checks the target path against Zone_Registry; if the path is frozen but a write succeeded (defence-in-depth), THE hook SHALL emit `hookSpecificOutput.updatedToolOutput` with a warning and revert instruction.
2. WHEN `updatedToolOutput` is emitted, THE hook SHALL overwrite the tool's success message with a Frozen_Diagnostic prefixed with `⚠ Post-hoc frozen-zone violation detected`, prompting the model to revert.
3. WHEN the PostToolUse hook detects a violation, THE hook SHALL ALSO write a `.tinkerman/runs/<timestamp>-frozen-breach.md` record with: attempted path, tool name, tool input, current state diff, so that operators can audit breaches after the fact.
4. THE PostToolUse hook SHALL NOT attempt to actually undo the file write; file system reversal is left to the user (undo it manually) or to CC's `/rewind` feature. The hook's role is reporting only.
5. THE PostToolUse hook SHALL be scoped via CC 2.1.85's `if` field to only run on Write-class tools, minimizing overhead.

### Requirement 4: Zone_Registry 从 .tinkerman/config.md 单一事实源读取

**User Story:** As a Forge maintainer updating frozen-zone rules, I want the hook script to read the rules from `.tinkerman/config.md` at runtime, so that rule changes take effect without redeploying hook scripts.

#### Acceptance Criteria

1. THE Frozen_Hook_Script SHALL parse `.tinkerman/config.md`'s YAML frontmatter and body to build the Zone_Registry at each invocation (cold start per hook invocation is acceptable; no persistent daemon).
2. IF `.tinkerman/config.md` is missing OR unparseable, THEN THE Frozen_Hook_Script SHALL fall back to hard-coded default rules (`.tinkerman/specs/*/spec.md`, `.tinkerman/plans/*.md`, `.tinkerman/config.md`) and emit a warning to stderr recommending running `/forge init`.
3. THE Zone_Registry SHALL support glob patterns (via `bash` globbing or equivalent) and a `status:` qualifier (e.g. "only frozen when spec's frontmatter has `status: locked`"); parsing `status:` from spec frontmatter requires reading the target file, which THE hook SHALL cap at 100 ms per invocation for performance.
4. THE Zone_Registry SHALL expose a CLI `bash scripts/print-zone-registry.sh` for debugging; the output is a flat list of `<path-glob> <category> <reason_code>` rows.
5. THE hook SHALL cache the Zone_Registry parse result in-process; if the hook is invoked multiple times per CC turn (e.g. parallel Write calls), it parses `.tinkerman/config.md` only once.

### Requirement 5: Guarded_Zone 差异化处理

**User Story:** As a model trying to update a progress file (guarded, not frozen), I want the hook to allow appends but block deletions and overwrites, so that progress integrity is maintained without blocking normal operation.

#### Acceptance Criteria

1. THE Frozen_Hook_Script SHALL distinguish Frozen_Zone (hard deny) from Guarded_Zone (append-only); Guarded_Zone violations (full file overwrite or delete) SHALL produce a Frozen_Diagnostic with `category: "guarded-append-only"` and a different unlock_instruction.
2. WHEN a Write operation on a Guarded_Zone file provides content that is a superset of current content (prefix match), THE hook SHALL allow the operation; when content is a replacement (not a superset), THE hook SHALL deny and provide the diff as additionalContext.
3. THE superset check SHALL use the Write tool's input to compare against on-disk content; Edit tool calls are always allowed on Guarded_Zone files (since Edit is intrinsically append/modify-preserving).
4. THE Guarded_Zone rules SHALL be declared in `.tinkerman/config.md` with syntax: `guarded: ["<glob> <append|no-delete|no-overwrite>"]`; the exact syntax is finalized during design.
5. WHEN a bash command attempts `rm <guarded-file>` or `> <guarded-file>`, THE hook SHALL detect via string matching on the tool input and deny with a Frozen_Diagnostic.

### Requirement 6: 可观测性与审计

**User Story:** As a Forge security auditor, I want every frozen-zone hit and near-miss logged to a durable location, so that I can analyze patterns and tune the zone rules.

#### Acceptance Criteria

1. EACH frozen-zone hit (PreToolUse deny or PostToolUse breach detection) SHALL append a line to `.tinkerman/runs/<YYYY-MM-DD>-frozen-events.jsonl` with fields: `timestamp`, `session_id`, `tool_name`, `path`, `category`, `reason_code`, `decision` (pre|post), `outcome` (denied|breached).
2. THE events jsonl SHALL be size-capped at 10 MB per day; rotation moves excess to `<date>-frozen-events.jsonl.1` and deletes files older than `findings_retention_days` from `.tinkerman/config.md`.
3. THE hook SHALL emit an OpenTelemetry event `forge.frozen_zone.hit` when OTel is configured, with span attributes matching the jsonl fields.
4. THE `/forge status` command SHALL include a compact summary of the last 7 days of frozen-zone hits (count per category) in its output, with a pointer to the full log.
5. THE logging SHALL never include file content; only paths and metadata are persisted to avoid leaking user data into logs.

### Requirement 7: 向后兼容与迁移

**User Story:** As an existing Forge user with a customized `hooks/hooks.json`, I want the upgrade to preserve my custom behavior and opt-in to the structured feedback, so that the feature doesn't break my workflow on rollout.

#### Acceptance Criteria

1. THE legacy `exit 2` behavior of `scripts/hook-check-frozen.sh` SHALL remain functional behind a feature flag `FORGE_STRUCTURED_FROZEN=0`; default is `1` (structured mode on).
2. WHEN `FORGE_STRUCTURED_FROZEN=0`, THE hook SHALL use the current exit-code-based blocking without JSON output; no PostToolUse hook is registered.
3. THE Forge init workflow SHALL set `FORGE_STRUCTURED_FROZEN=1` in `.claude/settings.json` `env` block during `/forge init` for new projects; existing projects get a one-line CHANGELOG note pointing to the upgrade path.
4. THE contract test suite SHALL verify both modes: one test run with the env var set to 1, one with 0, asserting the corresponding output format.
5. WHEN CC version is below 2.1.121 (where PostToolUse `updatedToolOutput` for all tools landed), THE PostToolUse hook SHALL downgrade to a no-op with a warning; PreToolUse structured output (CC 2.1.10+) remains active.

### Requirement 8: 测试与文档

**User Story:** As a Forge contributor reading the frozen-zone documentation, I want clear examples of each diagnostic category and a contributor guide for adding new zones, so that extending the protection is low-friction.

#### Acceptance Criteria

1. THE `scripts/hook-check-frozen.sh` SHALL have dedicated tests under `test/hook-check-frozen.test.sh` covering: each category deny, path that matches multiple categories, missing `.tinkerman/config.md`, guarded-zone append allowed, guarded-zone overwrite denied.
2. THE `.tinkerman/config.md` template SHALL include commented examples for adding custom zones with `status:` qualifiers, so that adopters can extend the registry.
3. THE `CHANGELOG.md` SHALL document the structured feedback feature under `[ADDED]` with the feature flag note and minimum CC version requirement.
4. THE `README.md` "安全与信任" section SHALL add a one-paragraph description of structured frozen-zone feedback, linking to `.tinkerman/decisions/` for the detailed ADR.
5. THE `.tinkerman/decisions/` SHALL include an ADR recording the migration from exit-code blocking to structured JSON feedback, the rejected alternatives (e.g. staying exit-code-only, using MCP tools for reporting), and the feature flag rollout plan.
