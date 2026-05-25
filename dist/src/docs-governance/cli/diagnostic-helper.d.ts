import type { DiagnosticRecord, DocPath, Severity } from "../types.js";
export declare function makeDiagnosticFactory(scriptName: string): (file: DocPath, severity: Severity, message: string, extra?: Record<string, string | number | boolean>) => DiagnosticRecord;
