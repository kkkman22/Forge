import type { DiagnosticRecord } from "../types.js";
export interface ExitResult {
    exitCode: number;
    diagnostics: DiagnosticRecord[];
    error?: Error;
}
export declare function computeExitResult(main: () => DiagnosticRecord[]): ExitResult;
export declare function run(main: () => Promise<DiagnosticRecord[]>, options?: {
    json?: boolean;
}): Promise<never>;
