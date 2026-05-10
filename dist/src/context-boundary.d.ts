/**
 * Context boundary checker — validates that source code imports don't violate
 * declared Context Map relationships between Bounded Contexts.
 *
 * Public API:
 *   - loadOwnershipMap
 *   - resolveFileContext
 *   - parseImports
 *   - checkBoundary
 */
import type { ContextMapEntry } from "./pack/types.js";
export interface BoundaryCheckInput {
    filePath: string;
    fileContent: string;
    contextMap: ContextMapEntry[];
    /** glob pattern → context name */
    ownershipMap: Record<string, string>;
}
export interface BoundaryViolation {
    sourceContext: string;
    targetContext: string;
    importStatement: string;
    line: number;
    relationshipType: string | "undeclared";
    suggestion: string;
}
export interface BoundaryCheckResult {
    violations: BoundaryViolation[];
    escapeHatchUsed: number;
}
/**
 * Load ownership map from .forge/context-ownership.yaml.
 * Parses YAML map format under `mappings:` key.
 * Returns empty object when file doesn't exist or is malformed.
 */
export declare function loadOwnershipMap(_projectRoot: string, ownershipYamlPath: string): Record<string, string>;
/**
 * Extract JSDoc @context tag from first 30 lines of file content.
 */
export declare function extractJsdocContext(fileContent: string): string | null;
/**
 * Determine which bounded context a file belongs to.
 *
 * Priority:
 *  1. JSDoc-annotated context (if provided)
 *  2. Directory-prefix match against ownership map globs
 *  3. No match → null
 */
export declare function resolveFileContext(filePath: string, ownershipMap: Record<string, string>, jsdocContext: string | null): string | null;
/**
 * Parse TypeScript import statements from source code.
 * Detects escape-hatch comments (`// @forge:allow-cross-context <reason>`)
 * on the line immediately preceding each import.
 */
export declare function parseImports(fileContent: string): Array<{
    module: string;
    line: number;
    hasEscapeHatch: boolean;
}>;
/**
 * Main boundary checker.
 *
 * 1. Resolve which context the file belongs to.
 * 2. Parse imports from the file content.
 * 3. For each import, resolve the imported module's context.
 * 4. Check whether the context-map relationship allows the import.
 * 5. Count escape-hatch uses.
 */
export declare function checkBoundary(input: BoundaryCheckInput): BoundaryCheckResult;
