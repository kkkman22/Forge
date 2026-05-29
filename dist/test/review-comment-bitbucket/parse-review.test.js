import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseReviewMarkdown, ReviewMarkdownNotFoundError, ReviewMarkdownParseError, } from "../../src/review-comment-bitbucket/parse-review.js";
let tmpDir;
function tmpFile(name, content) {
    if (!tmpDir)
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-test-"));
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, content);
    return p;
}
afterEach(() => {
    if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = undefined;
    }
});
const VALID_REVIEW_MD = `---
topic: "test-review"
date: "2026-05-23"
result: "fail"
reviewed_at_commit: "abc123"
p0_count: 1
p1_count: 1
p2_count: 1
p3_count: 1
methodology: subagent-parallel
---

# Review Report: test-review

## Findings

\`\`\`findings
- priority: P0
  finding_type: security.injection
  file_path: src/api.ts
  line_number: 42
  line_type: ADDED
  message: "SQL injection vulnerability in user input"
  source_layer: security-check
- priority: P1
  finding_type: quality.error-handling
  file_path: src/handler.ts
  line_number: 15
  line_type: CONTEXT
  message: "Missing error handling for null response"
  suggestion: "Add null check"
  source_layer: quality-check
- priority: P2
  finding_type: spec-check.scope-creep
  file_path: src/utils.ts
  line_number: 100
  line_type: REMOVED
  message: "Unnecessary utility function added outside scope"
  source_layer: spec-check
- priority: P3
  finding_type: quality.naming
  file_path: src/types.ts
  line_number: 5
  line_type: ADDED
  message: "Variable name 'x' is too short"
  source_layer: quality-check
\`\`\`
`;
describe("Unit: file not found throws ReviewMarkdownNotFoundError", () => {
    it("non-existent path throws with path in message", async () => {
        const badPath = "/nonexistent/review-123.md";
        await expect(parseReviewMarkdown(badPath)).rejects.toThrow(ReviewMarkdownNotFoundError);
        try {
            await parseReviewMarkdown(badPath);
        }
        catch (e) {
            expect(e.message).toContain(badPath);
        }
    });
});
describe("Unit: parse failure throws ReviewMarkdownParseError", () => {
    it("invalid YAML in findings block throws parse error", async () => {
        const filePath = tmpFile("bad.md", `---
topic: "test"
date: "2026-05-23"
result: "fail"
---

\`\`\`findings
- priority: P0
  this is not valid yaml: [
\`\`\`
`);
        await expect(parseReviewMarkdown(filePath)).rejects.toThrow(ReviewMarkdownParseError);
    });
    it("missing findings block throws parse error", async () => {
        const filePath = tmpFile("no-findings.md", `---
topic: "test"
date: "2026-05-23"
result: "fail"
---

# Review Report

No findings here.
`);
        await expect(parseReviewMarkdown(filePath)).rejects.toThrow(ReviewMarkdownParseError);
    });
});
describe("Unit: successful parse returns Finding[]", () => {
    it("parses all findings with required fields", async () => {
        const filePath = tmpFile("full.md", VALID_REVIEW_MD);
        const findings = await parseReviewMarkdown(filePath);
        expect(findings).toHaveLength(4);
        const p0 = findings.find((f) => f.priority === "P0");
        expect(p0).toMatchObject({
            priority: "P0",
            finding_type: "security.injection",
            file_path: "src/api.ts",
            line_number: 42,
            line_type: "ADDED",
            message: "SQL injection vulnerability in user input",
            source_layer: "security-check",
        });
    });
});
describe("Unit: optional fields default to undefined", () => {
    it("findings without suggestion have undefined suggestion", async () => {
        const filePath = tmpFile("full.md", VALID_REVIEW_MD);
        const findings = await parseReviewMarkdown(filePath);
        const p0 = findings.find((f) => f.priority === "P0");
        expect(p0.suggestion).toBeUndefined();
        expect(p0.suggestion_end_line).toBeUndefined();
    });
    it("findings with suggestion preserve it", async () => {
        const filePath = tmpFile("full.md", VALID_REVIEW_MD);
        const findings = await parseReviewMarkdown(filePath);
        const p1 = findings.find((f) => f.priority === "P1");
        expect(p1.suggestion).toBe("Add null check");
    });
});
describe("Unit: P3 findings included in results", () => {
    it("P3 finding is in parse output (filtering is caller's job)", async () => {
        const filePath = tmpFile("full.md", VALID_REVIEW_MD);
        const findings = await parseReviewMarkdown(filePath);
        const p3 = findings.find((f) => f.priority === "P3");
        expect(p3).toBeDefined();
        expect(p3.file_path).toBe("src/types.ts");
    });
});
//# sourceMappingURL=parse-review.test.js.map