---
feature: community-ecosystem
layout: tasks
created: 2026-04-29
spec_ref: ".forge/specs/community-ecosystem/requirements.md"
---

# Implementation Plan: Community & Ecosystem (v3.0)

## Overview

Build community infrastructure and SKILL plugin ecosystem for the Forge project. Tasks are ordered: community docs first, then plugin mechanism, then example projects.

## Tasks

- [x] 1. Community infrastructure
  - [x] 1.1 Enhance CONTRIBUTING.md with architecture overview and development workflow
    - Add project architecture diagram (modules, data flow, pure function pattern)
    - Add development environment setup (Node.js 22+, npm ci, biome, vitest)
    - Add code style guide (Biome config reference, pure function conventions)
    - Add commit message format and PR workflow
    - Add testing requirements (property tests for pure functions, unit tests for edge cases)
    - _Requirements: 1.1, 1.4_

  - [x] 1.2 Create GitHub Issue templates
    - Create `.github/ISSUE_TEMPLATE/bug_report.md` with reproduction steps, expected/actual behavior, environment info
    - Create `.github/ISSUE_TEMPLATE/feature_request.md` with use case, proposed solution, alternatives
    - Create `.github/ISSUE_TEMPLATE/skill_plugin_proposal.md` with skill name, phases, description, design sketch
    - _Requirements: 1.2_

  - [x] 1.3 Create GitHub PR template
    - Create `.github/PULL_REQUEST_TEMPLATE.md` with change description, related issues, test coverage, breaking changes checklist
    - _Requirements: 1.3_

- [x] 2. SKILL plugin mechanism
  - [x] 2.1 Define `SkillManifest` type and `skill.json` schema (`src/skill-loader.ts`)
    - Define `SkillManifest` interface with required fields: name, version, description, author, forgeVersion, phases
    - Define optional fields: i18n (supported locales array)
    - _Requirements: 2.1_

  - [x] 2.2 Implement `validateManifest()` pure function (`src/skill-validator.ts`)
    - Validate all required fields present and correctly typed
    - Validate `forgeVersion` is a valid semver range
    - Validate `phases` is a non-empty string array
    - Return `ValidationResult` with error details
    - _Requirements: 2.1, 2.5_

  - [x] 2.3 Implement `checkVersionCompatibility()` pure function
    - Parse semver range from `forgeVersion` field
    - Compare against current Forge version from package.json
    - Return boolean compatibility result
    - _Requirements: 2.5_

  - [x] 2.4 Implement `loadSkillsFromDir()` and `mergeSkillLists()` pure functions
    - Scan directory entries for subdirectories containing `skill.json` or `SKILL.md`
    - Merge builtin and external lists with builtin priority (same name → keep builtin)
    - _Requirements: 2.3, 2.4_

  - [x] 2.5 Add `--skills-dir <path>` CLI option to forge-loop
    - Accept optional path to external skills directory
    - Load and validate external skills at startup
    - Merge with builtin skills
    - _Requirements: 2.3_

  - [x] 2.6 Write property tests for skill list merging
    - Builtin skills always take priority over external skills with same name
    - Merged list contains all unique skill names from both sources
    - 200 iterations minimum
    - _Requirements: 2.3_

  - [x] 2.7 Write unit tests for manifest validation and version compatibility
    - Valid manifest passes validation
    - Missing required fields fail with descriptive errors
    - Version range matching works for various semver patterns
    - _Requirements: 2.1, 2.5_

- [x] 3. Checkpoint — Plugin mechanism complete
  - Ensure all tests pass
  - Verify external skills can be loaded via `--skills-dir`

- [x] 4. Example projects and best practices
  - [x] 4.1 Create example frontend project (`examples/react-todo/`)
    - Include `.forge/` directory with status.md, config.md
    - Include sample spec, plan, and review files
    - Include README with step-by-step forge-loop usage guide
    - _Requirements: 3.1, 3.3_

  - [x] 4.2 Create example backend project (`examples/node-api/`)
    - Include `.forge/` directory with full configuration
    - Include sample spec for API endpoint addition
    - Include README with forge-loop usage guide
    - _Requirements: 3.1, 3.3_

  - [x] 4.3 Create best practices documentation (`docs/best-practices/`)
    - SKILL authoring guide: frontmatter format, phase integration, i18n support
    - Router tier selection: when to use light/standard/full
    - Review quality gate configuration: P0/P1 thresholds, fix loop limits
    - Worktree usage: when to use `--worktree`, concurrent execution patterns
    - _Requirements: 3.2_

  - [x] 4.4 Provide Chinese and English versions of documentation
    - All docs in `docs/best-practices/` have both `.md` (Chinese) and `.en.md` (English) versions
    - Example project READMEs in both languages
    - _Requirements: 3.4_

- [x] 5. Final checkpoint
  - Verify all documentation renders correctly
  - Verify example projects can run with `forge-loop`
  - Verify external SKILL loading works end-to-end
