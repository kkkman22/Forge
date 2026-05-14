/**
 * Evolved rules Infra_Ref validator (pure functions).
 *
 * Verifies each rule's `Infra_Ref:` field points to files/sections that
 * actually exist. Failing references indicate that a SKILL/hook/agent
 * refactor may have broken a rule's landing location — evolved rules
 * would then silently regress.
 *
 * Format expected in evolved-rules.md:
 *   **Infra_Ref**: `path/to/file.md` §<section> + `other/path.ts` ...
 *
 * Validation rules:
 *   - Every backticked path `<value>` within the `Infra_Ref` line is
 *     extracted as a reference.
 *   - File references (ending with `.md`, `.ts`, `.json`, `.yaml`,
 *     `.mjs`, `.sh`) must exist on disk.
 *   - §<section> hints are best-effort: if present and the referenced
 *     file is markdown, we check that the section header exists.
 */
/** A single reference extracted from an Infra_Ref line. */
export interface InfraRef {
    ruleId: string;
    path: string;
    section: string | null;
    rawLine: string;
}
/** Result of validating a single ref. */
export interface InfraRefVerdict {
    ref: InfraRef;
    valid: boolean;
    reason?: string;
}
/**
 * Parse Infra_Ref lines from rule blocks.
 *
 * Given the full body of evolved-rules.md, returns one InfraRef per
 * backticked path found under each rule's Infra_Ref field.
 */
export declare function parseInfraRefs(body: string): InfraRef[];
/**
 * Extract backticked paths + optional §<section> hints from a line.
 *
 * Examples:
 *   "`a.md` §Foo + `b.ts`" → [{path:"a.md", section:"Foo"}, {path:"b.ts", section:null}]
 */
export declare function extractBacktickPathsWithSections(line: string): Array<{
    path: string;
    section: string | null;
}>;
/**
 * Validate refs against a filesystem interface.
 *
 * `fileExists(path)` returns true iff the file exists on disk.
 * `readFile(path)` returns the file content if the ref has a `section`
 * hint (used for section existence check).
 *
 * Section check: if section hint is non-null and file is `.md`, search
 * the content for a heading line `## <section>` or `### <section>` or
 * a bolded paragraph pattern `**<section>**`. Best-effort, non-fatal.
 */
export declare function validateInfraRefs(refs: readonly InfraRef[], fs: {
    fileExists: (p: string) => boolean;
    readFile: (p: string) => string;
}): InfraRefVerdict[];
