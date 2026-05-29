import type { ToolFailure } from "./types.js";
export declare function recordPartialFailures(failures: ToolFailure[], baseDir: string): Promise<void>;
export declare function appendRunMetrics(params: {
    run_id: string;
    post_enabled: boolean;
    gate_skipped_reason: string | null;
    creates: number;
    dones: number;
    reopens: number;
    skips: number;
    partial_failures: number;
    set_review_status_called: boolean;
    total_duration_ms: number;
}, baseDir: string): Promise<void>;
