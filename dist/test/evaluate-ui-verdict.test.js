import { describe, expect, it } from "vitest";
import { evaluateUiVerdict, extractThenKeywords } from "../src/evaluate-ui-verdict.js";
// Verifies spec R1-AC5: evaluateUiVerdict pure function.
// T1.2 RED → GREEN
describe("evaluateUiVerdict", () => {
    it("PASS when url matches and text contains all keywords", () => {
        const result = evaluateUiVerdict({ url: "http://localhost:5173/dashboard", title: "控制台", text: "欢迎 admin" }, "跳转到 dashboard 且显示 欢迎");
        expect(result).toBe("PASS");
    });
    it("FAIL when url does not contain expected path", () => {
        const result = evaluateUiVerdict({ url: "http://localhost:5173/login", title: "登录", text: "欢迎 admin" }, "跳转到 dashboard");
        expect(result).toBe("FAIL");
    });
    it("FAIL when text lacks a required keyword", () => {
        const result = evaluateUiVerdict({ url: "http://localhost:5173/dashboard", title: "控制台", text: "" }, "显示 欢迎");
        expect(result).toBe("FAIL");
    });
    it("PASS on url suffix match (/dashboard matches /dashboard/x)", () => {
        const result = evaluateUiVerdict({ url: "http://localhost:5173/dashboard/overview", title: "", text: "" }, "跳转到 /dashboard");
        expect(result).toBe("PASS");
    });
    it("PASS when title contains keyword", () => {
        const result = evaluateUiVerdict({ url: "http://localhost:5173/", title: "首页 Home", text: "" }, "显示 首页");
        expect(result).toBe("PASS");
    });
    it("multi-keyword THEN requires ALL keywords satisfied", () => {
        expect(evaluateUiVerdict({ url: "/dashboard", title: "", text: "欢迎" }, "跳转 dashboard 且 显示 欢迎")).toBe("PASS");
        expect(evaluateUiVerdict({ url: "/dashboard", title: "", text: "" }, "跳转 dashboard 且 显示 欢迎")).toBe("FAIL");
    });
    it("empty then clause → PASS (no assertion to violate)", () => {
        expect(evaluateUiVerdict({ url: "", title: "", text: "" }, "")).toBe("PASS");
    });
    it("extractThenKeywords strips longest filler prefix (跳转到 → not 到)", () => {
        expect(extractThenKeywords("跳转到 /dashboard")).toEqual(["/dashboard"]);
        expect(extractThenKeywords("跳转到 dashboard 且显示 欢迎")).toEqual(["dashboard", "欢迎"]);
    });
});
//# sourceMappingURL=evaluate-ui-verdict.test.js.map