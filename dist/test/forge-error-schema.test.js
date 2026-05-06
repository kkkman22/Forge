/**
 * Unit tests for `SchemaValidationError`.
 *
 * **Validates: Requirement 2.6**
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ForgeError, SchemaValidationError } from "../src/forge-error.js";
describe("SchemaValidationError", () => {
    it("extends ForgeError and sets the canonical code", () => {
        const err = new SchemaValidationError([]);
        expect(err).toBeInstanceOf(ForgeError);
        expect(err.code).toBe("SCHEMA_VALIDATION_FAILED");
        expect(err.name).toBe("SchemaValidationError");
    });
    it("normalises zod issues and produces a field_path-based summary", () => {
        const schema = z.object({
            tier: z.enum(["light", "standard", "full"]),
            security_level: z.number().int().min(0).max(3),
        });
        const result = schema.safeParse({ tier: "XL", security_level: 99 });
        expect(result.success).toBe(false);
        const err = new SchemaValidationError(result.error?.issues ?? []);
        expect(err.issues.length).toBeGreaterThanOrEqual(2);
        const paths = err.issues.map((i) => i.path);
        expect(paths).toContain("tier");
        expect(paths).toContain("security_level");
        expect(err.message).toMatch(/tier:/);
        expect(err.message).toMatch(/security_level:/);
    });
    it("accepts pre-normalised issue objects directly", () => {
        const err = new SchemaValidationError([
            { path: "project.stack", message: "must be non-empty" },
        ]);
        expect(err.issues[0]).toEqual({ path: "project.stack", message: "must be non-empty" });
        expect(err.message).toBe("project.stack: must be non-empty");
    });
});
//# sourceMappingURL=forge-error-schema.test.js.map