---
updated: 2026-08-11
title: "forge-test vs forge-accept Boundary"
version: "1.0"
---

# Boundary: forge-test vs forge-accept

## forge-test (Unit/Integration Tests)

- Runs automated test suites (vitest, jest, etc.)
- Validates code correctness at function/module level
- Requires test files to exist in the project
- Always runs during Standard/Full pipeline
- Blocks ship on failure

## forge-accept (Acceptance Scenarios)

- Runs spec scenarios against real runtime (API, UI, CLI)
- Validates end-to-end behavior against spec requirements
- Requires spec with Scenarios or Acceptance Criteria section
- Only runs when `acceptance_eval: true` in spec frontmatter or `--with-acceptance` flag
- Optionally blocks ship based on `acceptance_blocks_ship` setting

## When to Use Which

| Scenario | forge-test | forge-accept |
|----------|-----------|-------------|
| Unit function correctness | Yes | No |
| Integration between modules | Yes | No |
| API contract verification | No | Yes |
| User workflow validation | No | Yes |
| CLI command output assertion | No | Yes |
| Spec scenario coverage | No | Yes |

## Complementary, Not Overlapping

forge-test verifies **how** code works. forge-accept verifies **what** it delivers against spec requirements.
