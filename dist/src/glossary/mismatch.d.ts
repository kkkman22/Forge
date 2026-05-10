/**
 * Cross-context term mismatch detector.
 *
 * Scans text for glossary terms that are defined in other contexts
 * but NOT in the current context or `_shared`. Flags them as mismatches.
 *
 * **Validates: R1 Context boundary enforcement**
 */
import type { GlossaryRegistry } from "../pack/types.js";
/** A detected context-term mismatch. */
export interface TermMismatch {
    /** The term that was found in the text. */
    term: string;
    /** The context the text is in. */
    usedContext: string;
    /** The contexts where this term is actually defined. */
    definedIn: string[];
}
/**
 * Detect terms in `text` that belong to other contexts but not the current one.
 *
 * A term triggers a mismatch when:
 *   - It exists in `registry.byTerm`
 *   - It is NOT defined in `currentContext`
 *   - It is NOT defined in `_shared`
 *
 * @param text - The text to scan
 * @param currentContext - The context this text belongs to
 * @param registry - The loaded glossary registry
 * @returns List of mismatches (deduplicated by term)
 */
export declare function detectContextTermMismatch(text: string, currentContext: string, registry: GlossaryRegistry): Array<{
    term: string;
    usedContext: string;
    definedIn: string[];
}>;
