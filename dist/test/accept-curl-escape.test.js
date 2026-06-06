import { describe, expect, it } from "vitest";
import { buildCurlCommand } from "../src/accept-driver.js";
describe("buildCurlCommand — shell injection protection", () => {
    it("produces valid command for normal URL", () => {
        const cmd = buildCurlCommand("GET", "https://api.example.com/v1/status");
        expect(cmd).toBe("curl -s -o /dev/null -w \"%{http_code}\" -X GET 'https://api.example.com/v1/status'");
    });
    it("escapes URL containing shell metacharacters", () => {
        const cmd = buildCurlCommand("GET", "https://example.com/path?q=hello&x=1");
        // URL must be inside single quotes so & is not interpreted by shell
        expect(cmd).toContain("'https://example.com/path?q=hello&x=1'");
    });
    it("handles URL with single quotes by escaping them", () => {
        const cmd = buildCurlCommand("GET", "https://example.com/path?q=it's");
        // Single quotes in URL must not break the shell command — use '\'' escaping
        expect(cmd).not.toContain("'https://example.com/path?q=it's'");
        expect(cmd).toMatch(/it.*s/); // content preserved
    });
    it("handles URL with backticks (command substitution attempt)", () => {
        const cmd = buildCurlCommand("GET", "https://evil.com/$(whoami)");
        // $() inside single quotes is NOT expanded by shell — verify it's quoted
        expect(cmd).toMatch(/'[^']*\$\(whoami\)[^']*'/);
    });
    it("handles URL with semicolon (command chaining attempt)", () => {
        const cmd = buildCurlCommand("GET", "https://evil.com/; rm -rf /");
        // ; inside single quotes is NOT interpreted by shell
        expect(cmd).toMatch(/'[^']*;[^']*'/);
    });
    it("handles URL with pipe (command chaining attempt)", () => {
        const cmd = buildCurlCommand("GET", "https://evil.com/ | cat /etc/passwd");
        // | inside single quotes is NOT interpreted by shell
        expect(cmd).toMatch(/'[^']*\|[^']*'/);
    });
    it("handles URL with newline injection", () => {
        const cmd = buildCurlCommand("GET", "https://evil.com/\nrm -rf /");
        expect(cmd).not.toContain("\n");
    });
});
//# sourceMappingURL=accept-curl-escape.test.js.map