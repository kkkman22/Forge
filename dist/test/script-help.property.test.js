import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { auditScript, parseHelpExempt, parseHelpOutput, parseScriptCategory, } from "../src/script-help.js";
const CATEGORY_VALUES = ["user-facing", "internal-only", "one-off", "unclear"];
describe("parseScriptCategory — property", () => {
    it("returns one of the four valid categories for any string", () => {
        fc.assert(fc.property(fc.string(), (content) => {
            const result = parseScriptCategory(content);
            expect(CATEGORY_VALUES).toContain(result);
        }));
    });
    it("detects user-facing from comment header", () => {
        expect(parseScriptCategory("#!/usr/bin/env bash\n# category: user-facing\n")).toBe("user-facing");
    });
    it("detects internal-only from comment header", () => {
        expect(parseScriptCategory("#!/usr/bin/env node\n# category: internal-only\n")).toBe("internal-only");
    });
    it("detects one-off from comment header", () => {
        expect(parseScriptCategory("# category: one-off\n")).toBe("one-off");
    });
    it("returns unclear when no category comment", () => {
        expect(parseScriptCategory("#!/usr/bin/env bash\necho hello\n")).toBe("unclear");
    });
});
describe("parseHelpOutput — property", () => {
    it("returns valid:true only when output contains 'Usage:'", () => {
        fc.assert(fc.property(fc.string(), (output) => {
            const result = parseHelpOutput(output);
            if (output.includes("Usage:")) {
                expect(result.valid).toBe(true);
            }
            else {
                expect(result.valid).toBe(false);
            }
        }));
    });
    it("includes reason when invalid", () => {
        const result = parseHelpOutput("no usage info here");
        expect(result.valid).toBe(false);
        expect(result.reason).toBeTruthy();
    });
    it("no reason when valid", () => {
        const result = parseHelpOutput("Usage: foo [options]");
        expect(result.valid).toBe(true);
        expect(result.reason).toBeUndefined();
    });
});
describe("parseHelpExempt — property", () => {
    it("never returns lines starting with #", () => {
        fc.assert(fc.property(fc.array(fc.oneof(fc.constant("# comment"), fc.constant("scripts/foo.sh"))), (lines) => {
            const content = lines.join("\n");
            const result = parseHelpExempt(content);
            for (const entry of result) {
                expect(entry.trimStart()[0]).not.toBe("#");
            }
        }));
    });
    it("strips inline comments", () => {
        const content = "scripts/foo.sh  # some reason\nscripts/bar.sh";
        const result = parseHelpExempt(content);
        expect(result).toContain("scripts/foo.sh");
        expect(result).toContain("scripts/bar.sh");
    });
    it("ignores blank lines", () => {
        const result = parseHelpExempt("\n\nscripts/a.sh\n\n");
        expect(result).toEqual(["scripts/a.sh"]);
    });
});
describe("auditScript — property", () => {
    it("never throws for any inputs", () => {
        fc.assert(fc.property(fc.string(), fc.string(), fc.option(fc.string(), { nil: undefined }), (path, content, helpOutput) => {
            expect(() => auditScript(path, content, helpOutput)).not.toThrow();
        }));
    });
    it("always has non-null category and errors array", () => {
        fc.assert(fc.property(fc.string(), fc.string(), (path, content) => {
            const result = auditScript(path, content);
            expect(CATEGORY_VALUES).toContain(result.category);
            expect(Array.isArray(result.errors)).toBe(true);
        }));
    });
    it("user-facing without help output has errors", () => {
        const content = "#!/usr/bin/env bash\n# category: user-facing\necho hi";
        const result = auditScript("scripts/test.sh", content, undefined);
        expect(result.category).toBe("user-facing");
        expect(result.errors.length).toBeGreaterThan(0);
    });
    it("user-facing with valid help has no errors", () => {
        const content = "#!/usr/bin/env bash\n# category: user-facing\necho hi";
        const result = auditScript("scripts/test.sh", content, "Usage: test [options]");
        expect(result.category).toBe("user-facing");
        expect(result.errors).toEqual([]);
    });
    it("internal-only has no errors regardless of help", () => {
        const content = "#!/usr/bin/env bash\n# category: internal-only\necho hi";
        const result = auditScript("scripts/test.sh", content, undefined);
        expect(result.category).toBe("internal-only");
        expect(result.errors).toEqual([]);
    });
});
//# sourceMappingURL=script-help.property.test.js.map