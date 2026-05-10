export type ScriptCategory = "user-facing" | "internal-only" | "one-off" | "unclear";
export interface ScriptAuditEntry {
    path: string;
    category: ScriptCategory;
    hasHelpBranch: boolean;
    helpOutputValid: boolean;
    errors: string[];
}
export declare function parseScriptCategory(fileContent: string): ScriptCategory;
export declare function parseHelpOutput(output: string): {
    valid: boolean;
    reason?: string;
};
export declare function parseHelpExempt(content: string): readonly string[];
export declare function auditScript(path: string, content: string, helpOutput?: string): ScriptAuditEntry;
