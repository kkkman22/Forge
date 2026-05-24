import type { TermCandidate } from "./glossary-extractor.js";
export type GlossaryCheckPhase = "spec" | "decide" | "grill" | "plan" | "review" | "learn" | "build";
export type GlossaryCheckMode = "autonomous" | "interactive";
export type GlossaryConflictResolution = "keep_existing" | "replace_existing" | "add_alias" | "skip";
export interface GlossaryConflictInfo {
    candidate: string;
    existing: import("./glossary.js").GlossaryTerm;
    reason: import("./glossary.js").ConflictResult["reason"];
}
export interface GlossaryCheckResult {
    phase: GlossaryCheckPhase;
    hasConflict: boolean;
    conflicts: GlossaryConflictInfo[];
    newCandidates: TermCandidate[];
    shouldBlock: boolean;
}
export type GlossaryCheckInput = {
    phase: GlossaryCheckPhase;
    mode: GlossaryCheckMode;
    rawInput: {
        kind: "candidates";
        terms: import("./glossary.js").GlossaryTerm[];
    } | {
        kind: "decision_tree";
        tree: unknown;
    } | {
        kind: "spec_content";
        markdown: string;
    } | {
        kind: "plan_content";
        tasks: Array<{
            title: string;
            description: string;
        }>;
    } | {
        kind: "review_findings";
        findings: Array<{
            description: string;
        }>;
    } | {
        kind: "session";
        data: import("./learn.js").SessionData;
    } | {
        kind: "commit_message";
        message: string;
    };
    glossary: import("./glossary.js").Glossary;
    now: Date;
    alreadyChecked: Set<string>;
};
export declare const GLOSSARY_BLOCK_POLICY: Record<GlossaryCheckPhase, Record<GlossaryCheckMode, boolean>>;
export declare function hashCandidates(candidates: TermCandidate[]): string;
export declare function normalizeInput(input: GlossaryCheckInput): TermCandidate[];
export declare function runGlossaryCheck(input: GlossaryCheckInput): GlossaryCheckResult;
export declare function renderGlossaryConflictPrompt(result: GlossaryCheckResult, _mode: GlossaryCheckMode): string;
export declare function getAdvisoryPath(phase: GlossaryCheckPhase, topic: string): string;
export declare function renderPendingAdvisoryNotice(paths: string[]): string;
export declare function renderGlossaryAdvisory(result: GlossaryCheckResult): string;
