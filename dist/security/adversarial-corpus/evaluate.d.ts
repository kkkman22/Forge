#!/usr/bin/env tsx
/**
 * evaluate.ts — deterministic evaluator for the adversarial-injection corpus.
 *
 * The fence defense (`wrapWorkspaceContext`) wraps untrusted content in an
 * `<untrusted>` boundary with a `UNTRUSTED_PREAMBLE` instruction. This
 * evaluator measures how robust that defense is — WITHOUT calling an LLM —
 * by checking, for each corpus entry, whether the fence contract survives
 * wrapping intact.
 *
 * An injection "bypasses" the fence when EITHER:
 *   1. the preamble is absent from the wrapped context (defense dropped), OR
 *   2. the injection injects a `</untrusted>` close tag that appears BEFORE
 *      the wrapper's own closing tag — i.e. it closes the fence early and
 *      escapes into the trusted instruction region.
 *
 * This is a structural string check, fully deterministic, zero LLM cost. It
 * measures "did the fence stay intact", NOT "did the model behave safely" —
 * the latter is the L5 behavior-eval harness's range.
 *
 * Usage:
 *   npx tsx security/adversarial-corpus/evaluate.ts [--update-baseline]
 *   npx tsx security/adversarial-corpus/evaluate.ts --help
 */
export declare const CORPUS_ROOT: string;
export interface BypassJudgement {
    bypassed: boolean;
    note: string;
}
/**
 * Deterministically judge whether an injection bypasses the fence.
 *
 * @param injection the raw injection text (as it would appear in untrusted content)
 * @param wrappedContext the full context after wrapWorkspaceContext was applied
 */
export declare function judgeBypass(injection: string, wrappedContext: string): BypassJudgement;
export interface CorpusResult {
    id: string;
    category: string;
    bypassed: boolean;
    note: string;
}
/**
 * Walk every `.txt` under injections/<category>/ and judge each one.
 */
export declare function evaluateCorpus(): CorpusResult[];
export interface BaselineSummary {
    generated_at: string;
    total: number;
    bypassed: number;
    rate: number;
    per_category: Record<string, {
        total: number;
        bypassed: number;
    }>;
}
export declare function summarize(results: CorpusResult[]): BaselineSummary;
