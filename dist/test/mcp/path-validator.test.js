/**
 * Tests for shared path validation utility.
 *
 * Covers:
 *   - validatePaths from forge-read.ts (existing)
 *   - validateSinglePath from shared path-validator (new)
 *   - Prefix attack detection (forge-read-cached.ts vulnerability)
 *   - Symlink escape documentation
 *
 * **Validates: T2 — Path traversal hardening**
 */
import { describe, expect, it } from "vitest";
// Import from the shared path-validator module (T2 GREEN target)
import { validateSinglePath } from "../../src/mcp/tools/path-validator.js";
describe("validateSinglePath", () => {
    it("allows paths within project root", () => {
        expect(validateSinglePath("/home/user/project/src/index.ts", "/home/user/project")).toBe(true);
    });
    it("allows relative paths resolved within project root", () => {
        expect(validateSinglePath("src/index.ts", "/home/user/project")).toBe(true);
    });
    it("rejects absolute paths escaping project root", () => {
        expect(validateSinglePath("/etc/passwd", "/home/user/project")).toBe(false);
    });
    it("rejects relative paths with .. traversal", () => {
        expect(validateSinglePath("../../../etc/passwd", "/home/user/project")).toBe(false);
    });
    it("rejects prefix attack — root is prefix of another dir", () => {
        // root = /home/user/proj, path resolves to /home/user/project2/file
        // Without proper validation, startsWith("/home/user/proj") would pass
        expect(validateSinglePath("../project2/file", "/home/user/proj")).toBe(false);
    });
    it("rejects prefix attack with trailing slash ambiguity", () => {
        // root = /tmp/test, path resolves to /tmp/test-data/file
        expect(validateSinglePath("../test-data/evil", "/tmp/test")).toBe(false);
    });
    it("allows paths at the root boundary", () => {
        // Path exactly at root should be allowed
        expect(validateSinglePath(".", "/home/user/project")).toBe(true);
    });
    it("handles deeply nested valid paths", () => {
        expect(validateSinglePath("src/mcp/tools/forge-read.ts", "/home/user/project")).toBe(true);
    });
});
//# sourceMappingURL=path-validator.test.js.map