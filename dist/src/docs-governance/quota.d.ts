import type { Config, DiagnosticRecord } from "./types.js";
export interface QuotaOptions {
    allowGrow?: string;
}
export declare function countDocPairs(files: string[]): {
    count: number;
    distribution: Record<string, number>;
};
export declare function checkQuota(files: string[], config: Config, options?: QuotaOptions): DiagnosticRecord[];
