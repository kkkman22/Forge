/**
 * SDK Skill Detection — detects whether Skill-aware mode should be enabled
 * by checking for the `.forge/` directory in the working directory.
 *
 * This module contains only skill-aware mode detection logic and its direct
 * dependencies (`existsSync`, `join`).
 *
 * Design reference: sdk-driver-decomposition § design.md
 * **Validates: Requirements 2.3, 10.4**
 */
/**
 * Detect whether Skill-aware mode should be enabled by checking if the
 * `.forge/` directory exists in the given working directory.
 *
 * @param cwd - The working directory (repository root) to check.
 * @returns `true` if `.forge/` directory exists, `false` otherwise.
 */
export declare function detectSkillAwareMode(cwd: string): boolean;
