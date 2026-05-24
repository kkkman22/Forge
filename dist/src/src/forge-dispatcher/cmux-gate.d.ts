import type { statSync as StatSyncFn } from "node:fs";
export declare const CMUX_GATED_SUBS: ReadonlySet<string>;
export type GateBlockReason = "integration_off" | "socket_path_invalid" | "socket_missing" | "socket_not_socket" | "sticky_unavailable";
export type GateResult = {
    ok: true;
    gate_result: "go" | "n_a";
    cmux_available: boolean | null;
} | {
    ok: false;
    code: "SKILL_UNAVAILABLE";
    reason: GateBlockReason;
    gate_result: "blocked";
    cmux_available: false;
};
export interface CmuxGateOpts {
    env?: NodeJS.ProcessEnv;
    statSync?: typeof StatSyncFn;
}
export declare function checkCmuxGate(sub: string, opts?: CmuxGateOpts): GateResult;
export declare function __resetGateForTest(): void;
