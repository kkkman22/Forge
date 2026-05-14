export interface TierAvailability {
    a: true;
    b: "preferred" | "degraded" | "unavailable";
    c: "available" | "unavailable";
    reasons: {
        cmuxSocket: boolean;
        cmuxWorkspaceEnv: boolean;
        cmuxBinary: boolean;
        mcpDevtools: boolean;
    };
}
export declare function detectTierAvailability(env: {
    socketExists: boolean;
    workspaceIdSet: boolean;
    cmuxBinaryExists: boolean;
    mcpDevtoolsResponsive: boolean;
}): TierAvailability;
export interface VueA11yRule {
    id: string;
    pattern: string;
    severity: "P0" | "P1" | "P2" | "P3";
    wcag: string;
    description: string;
    falsePositiveFilter: readonly string[];
}
export interface Vue3Violation {
    ruleId: string;
    severity: "P0" | "P1" | "P2" | "P3";
    file: string;
    line: number;
    wcag: string;
    snippet: string;
}
export declare function scanVueTemplate(content: string, filePath: string, rules: readonly VueA11yRule[]): Vue3Violation[];
export interface AxeViolation {
    id: string;
    impact: "critical" | "serious" | "moderate" | "minor" | string;
    description: string;
    wcag: string[];
    nodes: number;
}
export interface AxeResultSummary {
    p0: number;
    p1: number;
    p2: number;
    p3: number;
    violations: AxeViolation[];
}
export declare function parseAxeResult(json: unknown): AxeResultSummary;
export declare function scanVueProject(projectRoot: string, rules: readonly VueA11yRule[], patterns?: readonly string[]): Vue3Violation[];
