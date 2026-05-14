/**
 * UI harness orchestrator — selects and runs the appropriate tier.
 *
 * 4-tier priority: project > cmux-browser > playwright > cdp
 * All tiers fail → INCONCLUSIVE [R6.8]
 *
 * **Validates: Requirements R6.2, R6.5, R6.6, R6.8**
 */
export type UiControllerTier = "project" | "cmux-browser" | "playwright" | "cdp";
export interface UiHarnessOptions {
    topic: string;
    appUrl: string;
    designerSpecPath?: string;
    forgeDir?: string;
}
export interface UiHarnessVerdict {
    verdict: "VERIFIED" | "NOT_VERIFIED" | "INCONCLUSIVE";
    controllerUsed: UiControllerTier | null;
    controllersAttempted: {
        tier: UiControllerTier;
        reason: string;
    }[];
    artifactsDir: string;
}
export declare function runUiHarness(opts: UiHarnessOptions): Promise<UiHarnessVerdict>;
