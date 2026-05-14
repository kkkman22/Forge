/**
 * Registry of TypeScript functions referenced by SKILL.md documents.
 *
 * Each entry maps a function name to its source module and the SKILL.md
 * files that reference it. The contract test (`test/contract.skill-function-sync.test.ts`)
 * verifies bidirectional consistency:
 *
 * 1. Every registered function actually exists and is exported from its module
 * 2. Every "Function Call" / "call `fn(`" pattern in SKILL.md has a registry entry
 * 3. Every registry entry's declared SKILL references actually contain the function name
 *
 * This registry is the **single source of truth** for SKILL-code sync.
 * When adding a new function reference to a SKILL.md, add a corresponding
 * entry here. When renaming or removing a function, update both the registry
 * and the SKILL.md references.
 *
 * **Validates: SKILL-Code Sync Contract**
 */
export interface SkillFunctionEntry {
    /** Source module relative to src/ (e.g., "build.ts") */
    module: string;
    /** Exported function name */
    functionName: string;
    /** SKILL.md files that reference this function (relative to skills/) */
    skills: string[];
    /** Parameter names for contract verification */
    parameterNames: string[];
    /** If true, the function is registered via MCP server.tool() instead of export function */
    mcpTool?: boolean;
}
export declare const SKILL_FUNCTION_REGISTRY: readonly SkillFunctionEntry[];
