/**
 * Zod schemas for Forge state files.
 *
 * Schemas in this directory serve as the single source of truth for:
 *   - Runtime validation of frontmatter and structured documents
 *   - TypeScript type inference via `z.infer<typeof Schema>`
 *
 * Callers MUST NOT write duplicate hand-rolled interfaces alongside the
 * schemas — derived types only.
 *
 * Each schema file stays pure (no IO, no side effects) so it can be
 * exercised by property-based tests via `fast-check`.
 *
 * **Validates: Requirements 2.1, 2.2, 2.5**
 */

export * from "./config-file.js";
export * from "./package-summary.js";
export * from "./plan-file.js";
export * from "./review-report.js";
export * from "./spec-file.js";
export * from "./status-file.js";
