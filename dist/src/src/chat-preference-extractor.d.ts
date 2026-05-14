export interface PreferenceAtom {
    trigger: string;
    behavior: string;
    rationale?: string;
    decisionRule?: string;
    confidence: "strong" | "moderate" | "weak" | "contradicted";
    source: string;
}
export interface FromChatsOptions {
    window?: number;
    claudeDir?: string;
    forgeDir?: string;
    interactive?: boolean;
}
export interface FromChatsResult {
    candidates: PreferenceAtom[];
    strong: PreferenceAtom[];
    moderate: PreferenceAtom[];
    weak: PreferenceAtom[];
    contradicted: PreferenceAtom[];
    skipped: string[];
    message: string;
}
export declare function runFromChats(opts?: FromChatsOptions): FromChatsResult;
