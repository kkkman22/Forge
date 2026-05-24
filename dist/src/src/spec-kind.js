/**
 * Spec kind detection — determine feature vs bugfix from directory contents.
 *
 * Validates: Requirement 14 (T-22)
 */
/**
 * Detect spec kind from directory listing.
 * Returns "bugfix" if bugfix.md present or mode is "fix".
 * Returns "feature" otherwise (default).
 */
export function detectSpecKind(files, mode) {
    if (mode === "fix")
        return "bugfix";
    if (files.includes("bugfix.md"))
        return "bugfix";
    return "feature";
}
//# sourceMappingURL=spec-kind.js.map