export type ScenarioSource = "explicit" | "derived";
export type ScenarioType = "api" | "ui" | "cli" | "mixed" | "unknown";
export type Verdict = "PASS" | "FAIL" | "SKIP" | "WARN";
export interface Scenario {
    id: string;
    given: string;
    when: string;
    then: string;
    source: ScenarioSource;
    type: ScenarioType;
    tags: readonly string[];
    confidence: number;
    rawText: string;
}
export interface ScenarioArtifact {
    scenarioId: string;
    source: ScenarioSource;
    givenWhenThen: string;
    executedAt: string;
    verdict: Verdict;
    evidence: readonly string[];
    failureReason?: string;
}
export interface AcceptanceRunResult {
    topic: string;
    scenarios: readonly ScenarioArtifact[];
    summary: {
        pass: number;
        fail: number;
        skip: number;
        warn: number;
        blocksShip: boolean;
    };
}
export declare function parseExplicitScenarios(specContent: string): readonly Scenario[];
export interface AcceptanceCriterion {
    text: string;
}
export declare function deriveScenariosFromCriteria(criteria: readonly AcceptanceCriterion[]): readonly Scenario[];
export declare function parseScenariosFromSpec(specContent: string): readonly Scenario[];
export interface SelectionOptions {
    maxCount?: number;
    explicitIds?: readonly string[];
    promoteDerived?: boolean;
}
export declare function selectScenariosForRun(scenarios: readonly Scenario[], options?: SelectionOptions): readonly Scenario[];
export declare function classifyScenarioType(scenario: Scenario): ScenarioType;
