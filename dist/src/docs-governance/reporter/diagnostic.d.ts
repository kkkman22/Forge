import type { DiagnosticRecord } from "../types.js";
export declare function truncateMessage(msg: string): string;
export declare function sortDiagnostics(records: DiagnosticRecord[]): DiagnosticRecord[];
export declare function formatDiagnostics(records: DiagnosticRecord[]): string;
export declare function formatNdjson(records: DiagnosticRecord[]): string;
export declare function summarize(records: DiagnosticRecord[]): string;
export declare function formatGitHubAnnotations(records: DiagnosticRecord[]): string;
