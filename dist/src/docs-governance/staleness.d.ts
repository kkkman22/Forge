import type { Frontmatter } from "./types.js";
export interface StalenessConfig {
    warning_days: number;
    critical_days: number;
    exempt_paths: readonly string[];
}
export declare function classifyStaleness(fm: Frontmatter, today: Date, config: StalenessConfig, filePath?: string): "fresh" | "warning" | "critical" | "invalid";
