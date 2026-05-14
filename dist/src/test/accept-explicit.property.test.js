import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseExplicitScenarios } from "../src/accept.js";
describe("parseExplicitScenarios — property", () => {
    it("never throws for any content", () => {
        fc.assert(fc.property(fc.string(), (content) => {
            expect(() => parseExplicitScenarios(content)).not.toThrow();
        }));
    });
    it("returns array with valid fields", () => {
        fc.assert(fc.property(fc.string(), (content) => {
            const result = parseExplicitScenarios(content);
            for (const s of result) {
                expect(s.source).toBe("explicit");
                expect(s.confidence).toBe(1.0);
                expect(typeof s.id).toBe("string");
                expect(typeof s.given).toBe("string");
                expect(typeof s.when).toBe("string");
                expect(typeof s.then).toBe("string");
            }
        }));
    });
});
describe("parseExplicitScenarios — unit", () => {
    const specWithScenario = `# Spec

## Scenarios

@critical
Scenario: User login
Given the login page is open
When the user enters valid credentials
Then the dashboard is shown

### Scenario: API health check
Given the API server is running
When a GET request is sent to /health
Then the response status is 200
`;
    it("parses scenarios from spec", () => {
        const result = parseExplicitScenarios(specWithScenario);
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result[0].given).toContain("login page");
        expect(result[0].when).toContain("valid credentials");
        expect(result[0].then).toContain("dashboard");
        expect(result[0].tags).toContain("@critical");
    });
    it("parses second scenario", () => {
        const result = parseExplicitScenarios(specWithScenario);
        expect(result.length).toBe(2);
        expect(result[1].when).toContain("GET request");
    });
    it("returns empty for spec without Scenarios section", () => {
        const result = parseExplicitScenarios("# No scenarios here\nJust text");
        expect(result).toEqual([]);
    });
});
//# sourceMappingURL=accept-explicit.property.test.js.map