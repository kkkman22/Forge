/* eslint-disable */
// biome-ignore-all lint/suspicious/noThenProperty: `then` is a Gherkin field
/**
 * T-04 (Wave 4) — API runner body assertions + redaction (Req4).
 *
 * Req4 AC:
 *   AC1: buildCurlArgs accepts opts.assertBody; when true curl keeps the body.
 *   AC2: evaluateApiVerdict supports `data.<path> shall be <value>` (JSONPath).
 *   AC3: status + body assertions both must pass → PASS.
 *   AC4: status-only assertion → back-compat (unchanged).
 *   AC5: non-JSON / JSONPath parse failure → FAIL + reason (no throw).
 *   AC6: body assertion must NOT write full body to artifact; only matched
 *        path:value summary (redaction — body may contain sensitive data).
 */
import { describe, expect, it } from "vitest";
import { buildCurlArgs, evaluateApiVerdictWithBody, matchJsonPath, redactBody, splitBodyAndStatus, } from "../src/accept-driver.js";
describe("buildCurlArgs — assertBody option (Req4 AC1)", () => {
    it("default (no assertBody) discards body — back-compat", () => {
        const d = buildCurlArgs("GET", "http://x/api");
        expect(d.args).toContain("-o");
        expect(d.args).toContain("/dev/null");
        expect(d.args).not.toContain("-i");
    });
    it("assertBody: true keeps the body (no -o /dev/null)", () => {
        const d = buildCurlArgs("GET", "http://x/api", { assertBody: true });
        expect(d.args).not.toContain("/dev/null");
        // body is retained so evaluateApiVerdict can parse it
        expect(d.args.join(" ")).not.toContain("-o /dev/null");
    });
});
describe("splitBodyAndStatus — curl output parser (Req4)", () => {
    it("splits trailing 3-digit status from body", () => {
        const out = '{"data":{"role":"admin"}}200';
        const { body, status } = splitBodyAndStatus(out);
        expect(status).toBe("200");
        expect(body).toBe('{"data":{"role":"admin"}}');
    });
    it("status-only output (no body) → empty body, status present", () => {
        const { body, status } = splitBodyAndStatus("200");
        expect(status).toBe("200");
        expect(body).toBe("");
    });
    it("no trailing digits → no status, whole string is body", () => {
        const { body, status } = splitBodyAndStatus('{"data":1}');
        expect(status).toBeNull();
        expect(body).toBe('{"data":1}');
    });
});
describe("matchJsonPath — JSONPath-style body matcher (Req4 AC2)", () => {
    it("matches a top-level field", () => {
        expect(matchJsonPath({ role: "admin" }, "role")).toEqual({
            ok: true,
            value: "admin",
        });
    });
    it("matches a nested path (data.role)", () => {
        expect(matchJsonPath({ data: { role: "admin" } }, "data.role")).toEqual({
            ok: true,
            value: "admin",
        });
    });
    it("returns ok:false when path does not exist", () => {
        expect(matchJsonPath({ data: { role: "admin" } }, "data.missing")).toEqual({
            ok: false,
            reason: expect.any(String),
        });
    });
    it("handles array index path (data.items.0.id)", () => {
        expect(matchJsonPath({ data: { items: [{ id: "a1" }] } }, "data.items.0.id")).toEqual({
            ok: true,
            value: "a1",
        });
    });
});
describe("evaluateApiVerdictWithBody — status + body assertions (Req4 AC2-AC5)", () => {
    it("status-only assertion → back-compat PASS (AC4)", () => {
        const verdict = evaluateApiVerdictWithBody({ stdout: "200", stderr: "" }, "the response status code shall be 200");
        expect(verdict.verdict).toBe("PASS");
    });
    it("status-only assertion → FAIL when status mismatches", () => {
        const verdict = evaluateApiVerdictWithBody({ stdout: "404", stderr: "" }, "the status code shall be 200");
        expect(verdict.verdict).toBe("FAIL");
    });
    it("body assertion matches → PASS (AC2)", () => {
        const stdout = '{"data":{"role":"admin"}}200';
        const verdict = evaluateApiVerdictWithBody({ stdout, stderr: "" }, 'the response data.role shall be "admin"');
        expect(verdict.verdict).toBe("PASS");
    });
    it("body assertion mismatches → FAIL (AC3 — both must pass)", () => {
        const stdout = '{"data":{"role":"viewer"}}200';
        const verdict = evaluateApiVerdictWithBody({ stdout, stderr: "" }, 'the response data.role shall be "admin"');
        expect(verdict.verdict).toBe("FAIL");
    });
    it("status + body both required: status fails → FAIL even if body ok (AC3)", () => {
        const stdout = '{"data":{"role":"admin"}}500';
        const verdict = evaluateApiVerdictWithBody({ stdout, stderr: "" }, 'the response status code shall be 200 and data.role shall be "admin"');
        expect(verdict.verdict).toBe("FAIL");
    });
    it("non-JSON body with a body assertion → FAIL + reason, no throw (AC5)", () => {
        const stdout = "<html>not json</html>200";
        const verdict = evaluateApiVerdictWithBody({ stdout, stderr: "" }, 'the response data.role shall be "admin"');
        expect(verdict.verdict).toBe("FAIL");
        expect(verdict.failureReason).toBeTruthy();
    });
    it("body assertion not present + no status → PASS (lenient, back-compat)", () => {
        const verdict = evaluateApiVerdictWithBody({ stdout: '{"x":1}', stderr: "" }, "the response shall contain data");
        expect(verdict.verdict).toBe("PASS");
    });
    it("records matched path:value summary for PASS (AC6 evidence)", () => {
        const stdout = '{"data":{"role":"admin","token":"secret"}}200';
        const verdict = evaluateApiVerdictWithBody({ stdout, stderr: "" }, 'the response data.role shall be "admin"');
        expect(verdict.verdict).toBe("PASS");
        expect(verdict.bodySummary).toContain("data.role");
        expect(verdict.bodySummary).toContain("admin");
    });
});
describe("redactBody — sensitive data redaction (Req4 AC6)", () => {
    it("keeps only matched path:value, drops everything else", () => {
        const body = { data: { role: "admin", token: "super-secret", password: "p@ss" } };
        const summary = redactBody(body, [{ path: "data.role", value: "admin" }]);
        expect(summary).toContain("data.role");
        expect(summary).toContain("admin");
        expect(summary).not.toContain("super-secret");
        expect(summary).not.toContain("p@ss");
        expect(summary).not.toContain("token");
        expect(summary).not.toContain("password");
    });
    it("multiple matches all retained", () => {
        const body = { a: 1, b: 2, secret: "x" };
        const summary = redactBody(body, [
            { path: "a", value: 1 },
            { path: "b", value: 2 },
        ]);
        expect(summary).toContain("a");
        expect(summary).toContain("b");
        expect(summary).not.toContain("secret");
        expect(summary).not.toContain('"x"');
    });
    it("empty matches → empty-ish summary (no body leaked)", () => {
        const body = { secret: "leak-me" };
        const summary = redactBody(body, []);
        expect(summary).not.toContain("leak-me");
    });
});
//# sourceMappingURL=accept-driver-api-body.property.test.js.map