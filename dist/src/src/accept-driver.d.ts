import type { AcceptanceRunResult, Scenario, ScenarioArtifact, ScenarioType } from "./accept.js";
export interface RunnerContext {
    topic: string;
    projectRoot: string;
    outputDir: string;
    tierAvailability: {
        cmuxAvailable: boolean;
        devServerRunning: boolean;
    };
}
export interface Runner {
    type: ScenarioType;
    supports(scenario: Scenario): boolean;
    run(scenario: Scenario, ctx: RunnerContext): Promise<ScenarioArtifact>;
}
export declare const apiRunner: Runner;
export declare const uiRunner: Runner;
export declare const cliRunner: Runner;
export declare const mixedRunner: Runner;
export declare const RUNNERS: readonly Runner[];
export declare function runScenario(scenario: Scenario, ctx: RunnerContext): Promise<ScenarioArtifact>;
export declare function aggregateVerdicts(artifacts: readonly ScenarioArtifact[]): {
    pass: number;
    fail: number;
    skip: number;
    warn: number;
    blocksShip: boolean;
};
export declare function renderAcceptanceReport(result: AcceptanceRunResult): string;
