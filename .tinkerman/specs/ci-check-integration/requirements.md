---
status: completed
feature: ci-check-integration
layout: requirements
created: 2026-04-29
tier: standard
---
# Requirements Document

## Introduction

Forge 的 `/forge build` 在 Final Validation 步骤中，AI 自行拼凑部分验证命令（如 `npx tsc --noEmit`、部分 `biome check`），而非运行项目定义的完整 CI 检查命令（如 `npm run check`）。这导致本地验证通过但 CI 失败，因为遗漏了 lint 对 test 文件的检查、typedoc 生成、dist 同步校验、readme metrics 检查等步骤。

本功能在 Forge 的 SKILL 文档和初始化脚本中引入 `ci_check_command` 的完整集成，确保 build 全量测试、test 验证清单和 ship 门禁检查统一使用项目配置的 CI 命令，消除 AI 自行拼凑命令导致的本地/CI 不一致问题。

本功能仅涉及 SKILL.md 文档修改和 init.sh 脚本修改，不涉及 TypeScript 代码变更。

## Glossary

- **CI_Check_Command**: 项目在 `.tinkerman/config.md` 的 YAML frontmatter 中通过 `ci_check_command` 字段配置的完整 CI 检查命令（如 `npm run check`），一条命令覆盖所有 CI 检查步骤。
- **Verify_Commands**: `.tinkerman/config.md` 的 YAML frontmatter 中通过 `verify_commands` 字段配置的逐条验证命令列表（如 `npm run lint`、`npm run typecheck`），供 Forge Loop 的 TDD 循环使用。
- **Forge_Build_SKILL**: `skills/forge-build/SKILL.md`，定义 `/forge build` 执行引擎的完整流程，包括全量测试步骤和已知 AI 失败模式。
- **Forge_Test_SKILL**: `skills/forge-test/SKILL.md`，定义 `/forge test` 测试引擎的三层验证流程，包括 7 项完成前验证清单。
- **Forge_Ship_SKILL**: `skills/forge-ship/SKILL.md`，定义 `/forge ship` 交付引擎的门禁检查流程。
- **Init_Script**: `scripts/init.sh`，Forge 项目初始化脚本，交互式收集项目配置并生成 `.tinkerman/config.md`。
- **Config_Template**: `templates/config.md`，`.tinkerman/config.md` 的模板文件，定义所有可配置字段的默认值和说明。
- **Final_Validation**: Forge_Build_SKILL 中所有任务完成后运行的全量测试步骤，用于确认无回归。
- **Completion_Checklist**: Forge_Test_SKILL 中的 7 项完成前验证清单（Layer 3），逐项检查测试、类型检查、Lint 等交付条件。
- **Ship_Gate**: Forge_Ship_SKILL 中的三道门禁检查（Review、Test、Progress），全部通过后才允许交付。

## Requirements

### Requirement 1: Forge_Build_SKILL 全量测试引用 CI_Check_Command

**User Story:** As a developer using `/forge build`, I want the Final Validation step to run the project's configured CI check command, so that local validation matches CI behavior and I don't discover failures only after pushing.

#### Acceptance Criteria

1. WHEN all tasks are completed and Final_Validation begins, THE Forge_Build_SKILL SHALL instruct the AI to read the `ci_check_command` field from `.tinkerman/config.md` YAML frontmatter and execute that command as the full validation step.
2. WHILE `ci_check_command` is non-empty in `.tinkerman/config.md`, THE Forge_Build_SKILL SHALL prohibit the AI from substituting, omitting, or partially reconstructing the CI check command.
3. IF `ci_check_command` is empty or absent in `.tinkerman/config.md`, THEN THE Forge_Build_SKILL SHALL fall back to executing each command in the `verify_commands` list sequentially; IF `verify_commands` is also empty or absent, THEN THE Forge_Build_SKILL SHALL fall back to AI auto-detection of verification commands.
4. WHEN Final_Validation executes CI_Check_Command, THE Forge_Build_SKILL SHALL report the result using the P5 evidence chain format: `[Command] → [Output] → [Claim]`.

### Requirement 2: Forge_Build_SKILL 新增"自行拼凑验证命令"失败模式

**User Story:** As a developer maintaining Forge, I want the known AI failure modes section to document the "self-assembled verification commands" anti-pattern, so that the AI is explicitly warned against this behavior during build execution.

#### Acceptance Criteria

1. THE Forge_Build_SKILL SHALL include a new failure mode entry in the "已知 AI 失败模式" section that describes the anti-pattern of the AI assembling its own verification commands instead of using the configured CI_Check_Command.
2. THE failure mode entry SHALL describe the incorrect behavior (AI running `npx tsc --noEmit` or partial `biome check` instead of `npm run check`), explain why the behavior is wrong (local validation diverges from CI, causing post-push failures), and specify the correct behavior (read `ci_check_command` from config.md and execute it verbatim).
3. THE failure mode entry SHALL follow the same format as existing failure mode entries in Forge_Build_SKILL (错误行为 / 为什么这是错的 / 正确做法).

### Requirement 3: Forge_Test_SKILL 验证清单引用 CI_Check_Command

**User Story:** As a developer using `/forge test`, I want the 7-item completion checklist to use the project's configured CI check command, so that the test verification matches CI behavior.

#### Acceptance Criteria

1. WHEN executing Layer 3 Completion_Checklist, THE Forge_Test_SKILL SHALL instruct the AI to read the `ci_check_command` field from `.tinkerman/config.md` and use it as the primary verification command for checklist items 1-4 (test execution, test pass, type check, lint).
2. WHILE `ci_check_command` is non-empty, THE Forge_Test_SKILL SHALL execute CI_Check_Command as a single command that covers checklist items 1-4, instead of running separate commands for each item.
3. IF `ci_check_command` is empty or absent, THEN THE Forge_Test_SKILL SHALL fall back to the current behavior of running individual commands for each checklist item (test runner, `tsc --noEmit`, eslint/biome).
4. WHEN CI_Check_Command is used for checklist items 1-4, THE Forge_Test_SKILL SHALL still report each checklist item individually with pass/fail status extracted from the combined command output.

### Requirement 4: Forge_Ship_SKILL 门禁验证 CI_Check_Command 执行

**User Story:** As a developer using `/forge ship`, I want the Test gate to verify that the CI check command was executed and passed, so that I don't ship code that would fail CI.

#### Acceptance Criteria

1. WHEN evaluating the Test gate, THE Forge_Ship_SKILL SHALL verify that CI_Check_Command (if configured) was executed during the `/forge test` phase and passed.
2. IF `ci_check_command` is configured but the test phase only ran individual verification commands (not the full CI_Check_Command), THEN THE Forge_Ship_SKILL SHALL flag this as a gate warning and recommend re-running `/forge test`.
3. WHILE `ci_check_command` is empty or absent, THE Forge_Ship_SKILL SHALL evaluate the Test gate using the current behavior (Layer 1 + Layer 3 verification results).

### Requirement 5: Init_Script 提示配置 CI_Check_Command

**User Story:** As a developer initializing a new Forge project, I want the init script to prompt me for the CI check command, so that the project is correctly configured from the start.

#### Acceptance Criteria

1. WHEN collecting project configuration in Step 1, THE Init_Script SHALL prompt the user to enter the project's CI check command after collecting the security level.
2. THE Init_Script SHALL display a help message explaining what CI_Check_Command is (the single command that runs all CI checks, e.g., `npm run check`) and how it differs from verify_commands.
3. WHEN the user provides a CI_Check_Command value, THE Init_Script SHALL write it to the `ci_check_command` field in `.tinkerman/config.md` YAML frontmatter and include the CI check command section in the config body.
4. WHEN the user leaves CI_Check_Command empty (presses Enter without input), THE Init_Script SHALL set `ci_check_command` to an empty string in `.tinkerman/config.md`, and the system SHALL fall back to verify_commands or AI auto-detection.
5. THE Init_Script SHALL sanitize the CI_Check_Command input using the same sanitization function applied to other user inputs, preventing shell injection characters.

### Requirement 6: Config_Template 文档化 CI_Check_Command 与 Verify_Commands 的关系

**User Story:** As a developer reading the config template, I want clear documentation of the relationship between `ci_check_command` and `verify_commands`, so that I understand when each is used.

#### Acceptance Criteria

1. THE Config_Template SHALL include a `ci_check_command` field in the YAML frontmatter with an empty string as the default value and a comment explaining its purpose.
2. THE Config_Template SHALL include a "CI 检查命令" section in the body that documents the precedence rules: CI_Check_Command takes priority over verify_commands for build Final Validation and test Completion Checklist; verify_commands is used by Forge Loop TDD cycles regardless of CI_Check_Command.
3. THE Config_Template SHALL document the fallback chain: if `ci_check_command` is non-empty, use it for full validation; if empty, fall back to `verify_commands`; if both are empty, fall back to AI auto-detection.
4. THE Config_Template SHALL include an example showing a typical configuration with both fields populated (e.g., `ci_check_command: "npm run check"` alongside `verify_commands: ["npm run lint", "npm run typecheck", "npm test -- --run"]`).

### Requirement 7: 向后兼容性保证

**User Story:** As a developer with an existing Forge project that does not have `ci_check_command` configured, I want the upgrade to be seamless, so that my current workflow is not disrupted.

#### Acceptance Criteria

1. WHILE `ci_check_command` is absent from `.tinkerman/config.md` YAML frontmatter, THE Forge_Build_SKILL SHALL operate identically to the current behavior (AI auto-detection or verify_commands fallback).
2. WHILE `ci_check_command` is absent from `.tinkerman/config.md`, THE Forge_Test_SKILL SHALL operate identically to the current behavior (individual commands for each checklist item).
3. WHILE `ci_check_command` is absent from `.tinkerman/config.md`, THE Forge_Ship_SKILL SHALL operate identically to the current behavior (Test gate based on Layer 1 + Layer 3 results).
4. THE changes to Forge_Build_SKILL, Forge_Test_SKILL, and Forge_Ship_SKILL SHALL NOT alter any existing behavior when `ci_check_command` is empty or absent — all changes are additive and gated behind the presence of a non-empty `ci_check_command` value.
