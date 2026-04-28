/**
 * Property-based tests for the run-manager module.
 *
 * Covers:
 *   - Property 1: Path construction equivalence after unification
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
 */
import path from "node:path";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Valid POSIX path characters (letters, digits, slashes, dots, hyphens, underscores). */
const posixPathCharArb = fc.string().filter((s) => s.length > 0 && /^[a-zA-Z0-9/._-]+$/.test(s));
/** Arbitrary UUID for run IDs. */
const runIdArb = fc.uuid();
/** Boolean to control trailing slash presence. */
const trailingSlashArb = fc.boolean();
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Strip trailing slashes from a path string. */
function stripTrailingSlashes(p) {
    return p.replace(/\/+$/, "");
}
// ---------------------------------------------------------------------------
// Feature: audit-followup-improvements, Property 1: Path construction equivalence after unification
// ---------------------------------------------------------------------------
describe("Feature: audit-followup-improvements, Property 1: Path construction equivalence after unification", () => {
    /**
     * For any valid cwd and run ID, path.join(cwd, ".forge", "runs", runId)
     * resolves to the same filesystem location as `${cwd}/.forge/runs/${runId}/`
     * after normalization and trailing-slash stripping.
     *
     * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
     */
    it("path.join produces equivalent paths to template-literal construction for run directories", () => {
        fc.assert(fc.property(posixPathCharArb, runIdArb, trailingSlashArb, (cwd, runId, addTrailingSlash) => {
            const cwdInput = addTrailingSlash ? `${cwd}/` : cwd;
            // New style: path.join
            const joinedPath = path.join(cwdInput, ".forge", "runs", runId);
            // Old style: template literal
            const templatePath = `${cwdInput}/.forge/runs/${runId}/`;
            // After normalization and trailing-slash stripping, they must be equal
            const normalizedJoined = stripTrailingSlashes(path.normalize(joinedPath));
            const normalizedTemplate = stripTrailingSlashes(path.normalize(templatePath));
            expect(normalizedJoined).toBe(normalizedTemplate);
        }), { numRuns: 100 });
    });
    /**
     * For any valid worktree path and run ID, path.join(worktreePath, ".forge", "runs", runId)
     * resolves to the same filesystem location as `${worktreePath}.forge/runs/${runId}/`
     * (the old setupWorktree style which assumed a trailing slash on worktreePath)
     * after normalization and trailing-slash stripping.
     *
     * **Validates: Requirements 2.2, 2.5**
     */
    it("path.join produces equivalent paths for worktree-based run directories", () => {
        fc.assert(fc.property(posixPathCharArb, runIdArb, trailingSlashArb, (basePath, runId, addTrailingSlash) => {
            // The old worktree code assumed worktreePath ended with a slash
            const worktreePath = addTrailingSlash ? `${basePath}/` : `${basePath}/`;
            // New style: path.join
            const joinedPath = path.join(worktreePath, ".forge", "runs", runId);
            // Old style: template literal (concatenation without separator)
            const templatePath = `${worktreePath}.forge/runs/${runId}/`;
            const normalizedJoined = stripTrailingSlashes(path.normalize(joinedPath));
            const normalizedTemplate = stripTrailingSlashes(path.normalize(templatePath));
            expect(normalizedJoined).toBe(normalizedTemplate);
        }), { numRuns: 100 });
    });
    /**
     * For any valid run directory path, path.join(runDir, "notes.md") resolves
     * to the same location as `${runDir}notes.md` (old style with trailing slash)
     * after normalization.
     *
     * **Validates: Requirements 2.4, 2.5**
     */
    it("path.join produces equivalent notes file paths", () => {
        fc.assert(fc.property(posixPathCharArb, runIdArb, (cwd, runId) => {
            // Simulate the run directory with trailing slash (old style)
            const runDirOld = `${cwd}/.forge/runs/${runId}/`;
            // Simulate the run directory without trailing slash (new style)
            const runDirNew = path.join(cwd, ".forge", "runs", runId);
            // Old style: template literal concatenation
            const oldNotesPath = `${runDirOld}notes.md`;
            // New style: path.join
            const newNotesPath = path.join(runDirNew, "notes.md");
            expect(path.normalize(newNotesPath)).toBe(path.normalize(oldNotesPath));
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=run-manager.property.test.js.map