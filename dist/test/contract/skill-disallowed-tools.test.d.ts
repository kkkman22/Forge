/**
 * Contract tests — skill disallowed-tools matrix (R3).
 *
 * Validates that every forge agent / skill instruction file
 * carries a `disallowedTools` frontmatter field whose value
 * matches the matrix defined in ADR 2026-05-28-skill-disallowed-tools-matrix.md.
 *
 * Covers:
 *   - Each agent .md file has valid YAML frontmatter with `disallowedTools`
 *   - forge-review disallows Edit, Write, MultiEdit
 *   - forge-decide-* agents disallow Edit, Write
 *   - forge-plan disallows Edit, Write, MultiEdit
 *   - forge-ship disallows destructive Bash commands
 *   - forge-learn disallows git push
 *   - Matrix ADR file exists
 */
export {};
