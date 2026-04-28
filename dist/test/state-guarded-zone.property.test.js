/**
 * Bug Condition Exploration Test: Guarded Zone Returns Empty Reason
 *
 * Property 1 (Bug Condition): For all guarded zone paths, checkWritePermission()
 * should return a non-empty `reason` string containing an advisory warning —
 * but currently returns `reason: ""`.
 *
 * Bug Condition from design:
 *   input.function == "checkWritePermission"
 *   AND input.zone == "guarded"
 *   AND result.reason == ""
 *
 * Expected Behavior from design:
 *   { blocked: false, reason: "⚠️ 受保护区文件，仅允许追加操作" }
 *
 * This test is EXPECTED TO FAIL on unfixed code — failure confirms the bug exists.
 *
 * **Validates: Requirements 1.5, 2.5**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkWritePermission } from "../src/state.js";
// ---------------------------------------------------------------------------
// Generators (reused pattern from state-protection.property.test.ts)
// ---------------------------------------------------------------------------
const topicArb = fc
    .string({ minLength: 3, maxLength: 20 })
    .map((s) => s.replace(/[^a-z0-9-]/gi, "a").toLowerCase())
    .filter((s) => s.length >= 3 && /^[a-z]/.test(s));
/** Paths that fall in the guarded zone. */
const guardedPathArb = fc.oneof(topicArb.map((t) => `progress/${t}.md`), topicArb.map((t) => `reviews/${t}.md`), fc.constant("knowledge/instincts.md"), fc.constant("knowledge/known-failures.md"), topicArb.map((t) => `knowledge/solutions/${t}.md`));
/** Arbitrary frontmatter status values. */
const statusArb = fc.constantFrom("draft", "locked", "approved", "in_progress", "new");
/** Content with a specific status in frontmatter. */
function contentWithStatus(status) {
    return `---\nfeature: "test"\nstatus: "${status}"\ndate: "2025-01-15"\n---\n\n# Content\n`;
}
// ---------------------------------------------------------------------------
// Bug Condition Exploration: Guarded Zone Advisory Warning
// ---------------------------------------------------------------------------
describe("Bug Condition: checkWritePermission() guarded zone returns empty reason", () => {
    it("guarded zone paths should return advisory warning in reason (not empty string)", () => {
        fc.assert(fc.property(guardedPathArb, statusArb, (path, status) => {
            const result = checkWritePermission(path, contentWithStatus(status));
            // Guarded zone should NOT be blocked
            expect(result.blocked).toBe(false);
            // Bug condition: reason should contain advisory warning, not be empty
            // Expected: reason contains "⚠️" or "受保护区"
            // Current buggy behavior: reason === ""
            expect(result.reason).not.toBe("");
            expect(result.reason.includes("⚠️") || result.reason.includes("受保护区")).toBe(true);
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=state-guarded-zone.property.test.js.map