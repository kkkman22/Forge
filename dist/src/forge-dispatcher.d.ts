export { ALLOW_LIST, validateTopic } from "./forge-dispatcher/allowlist.js";
export { appendAuditLog, computeHmac } from "./forge-dispatcher/audit-log.js";
export type { GateBlockReason, GateResult } from "./forge-dispatcher/cmux-gate.js";
export { __resetGateForTest, CMUX_GATED_SUBS, checkCmuxGate, } from "./forge-dispatcher/cmux-gate.js";
export { checkIntegrity } from "./forge-dispatcher/integrity-check.js";
export { resolveLibPath } from "./forge-dispatcher/path-resolve.js";
export { resolveAllowedTools } from "./forge-dispatcher/tools-resolve.js";
export { UNTRUSTED_PREAMBLE, wrapWorkspaceContext } from "./forge-dispatcher/untrusted-fence.js";
export interface DispatchOpts {
    mode?: string;
    dispatcherMode?: "collapsed" | "legacy";
    pluginRoot?: string;
    cwd?: string;
    _mocks?: Record<string, unknown>;
    _mockSteps?: Record<string, unknown>;
    _overrideFrontmatter?: Record<string, unknown>;
}
export interface DispatchResult {
    code: string;
    dispatchPath?: string;
    notice?: string;
    suggestion?: string;
}
export declare function dispatchForgeSubcommand(topic: string, opts?: DispatchOpts): Promise<DispatchResult>;
