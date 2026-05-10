export interface LivingDocScenario {
    title: string;
    tags: string[];
    lastVerdict: "pass" | "fail" | "pending" | "skip";
    lastRunAt: string | null;
    sourceLine: number;
    acceptanceReportPath: string | null;
}
export interface LivingDocContext {
    name: string;
    specs: Array<{
        topic: string;
        scenarios: LivingDocScenario[];
        specPath: string;
    }>;
    stats: {
        total: number;
        pass: number;
        fail: number;
        pending: number;
    };
}
export interface LivingDocData {
    generatedAt: string;
    contexts: Map<string, LivingDocContext>;
    globalStats: {
        totalScenarios: number;
        pass: number;
        fail: number;
        pending: number;
    };
}
type Verdict = "pass" | "fail" | "pending" | "skip";
interface VerdictEntry {
    verdict: Verdict;
    timestamp: string;
}
export declare function parseSpecScenarios(specContent: string, _specPath: string): {
    context: string | null;
    scenarios: Array<{
        title: string;
        tags: string[];
        sourceLine: number;
    }>;
};
export declare function parseAcceptanceVerdicts(reportContent: string, _reportPath: string): Map<string, VerdictEntry>;
export declare function generateLivingDoc(specsDir: string, acceptanceDir: string | null): LivingDocData;
export {};
