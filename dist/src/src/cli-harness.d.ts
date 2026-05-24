/**
 * CLI harness orchestrator — selects and runs the appropriate tier.
 *
 * 4-tier priority: project > cmux > tmux > node-pty
 * All tiers fail → INCONCLUSIVE [R5.8]
 *
 * **Validates: Requirements R5.2, R5.3, R5.4, R5.8**
 */
export type ControllerTier = "project" | "cmux" | "tmux" | "node-pty";
export interface CliHarnessOptions {
    topic: string;
    targetCommand: string;
    inputScript?: string;
    forgeDir?: string;
}
export interface HarnessVerdict {
    verdict: "VERIFIED" | "NOT_VERIFIED" | "INCONCLUSIVE";
    controllerUsed: ControllerTier | null;
    controllersAttempted: {
        tier: ControllerTier;
        reason: string;
    }[];
    artifactsDir: string;
}
export declare function runCliHarness(opts: CliHarnessOptions): Promise<HarnessVerdict>;
