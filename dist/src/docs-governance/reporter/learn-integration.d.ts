import type { DiagnosticRecord } from "../types.js";
export interface LearnInsight {
    category: "governance-pattern" | "anti-pattern" | "trend";
    source: string;
    description: string;
    data: Record<string, number>;
}
export declare function extractLearnInsights(diagnostics: DiagnosticRecord[], source: string): LearnInsight[];
export declare function formatLearnInsights(insights: LearnInsight[]): string;
