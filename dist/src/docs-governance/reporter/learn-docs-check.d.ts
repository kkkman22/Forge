import type { DiagnosticRecord } from "../types.js";
export interface DocsGovernanceResult {
    status: "clean" | "needs_attention";
    timestamp: string;
    diagnostics: DiagnosticRecord[];
    errors: string[];
}
export declare function runDocsGovernanceCheck(rootDir: string): DocsGovernanceResult;
export declare function formatDocsGovernanceSection(result: DocsGovernanceResult): string;
