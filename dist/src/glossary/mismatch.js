/**
 * Cross-context term mismatch detector.
 *
 * Scans text for glossary terms that are defined in other contexts
 * but NOT in the current context or `_shared`. Flags them as mismatches.
 *
 * **Validates: R1 Context boundary enforcement**
 */
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
export function detectContextTermMismatch(text, currentContext, registry) {
    const tokens = text.split(/[\s,.;:!?()[\]{}"']+/).filter((t) => t.length > 1);
    const seen = new Set();
    const mismatches = [];
    for (const token of tokens) {
        if (seen.has(token))
            continue;
        seen.add(token);
        const entries = registry.byTerm.get(token);
        if (!entries || entries.length === 0)
            continue;
        // Check if term is defined in current context or _shared
        const isInCurrentContext = entries.some((e) => e.context === currentContext);
        const isInShared = entries.some((e) => e.context === "_shared");
        if (isInCurrentContext || isInShared)
            continue;
        // Collect all contexts where this term is defined
        const definedIn = [...new Set(entries.map((e) => e.context))];
        mismatches.push({
            term: token,
            usedContext: currentContext,
            definedIn,
        });
    }
    return mismatches;
}
//# sourceMappingURL=mismatch.js.map