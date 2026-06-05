import { describe, expect, it } from "vitest";
import { parseReviewReportGraceful } from "../../src/state.js";

describe("parseReviewReportGraceful — methodology field", () => {
  it("fills methodology default for old reports without field", () => {
    const content = `---
topic: "test"
date: "2026-05-15"
result: "pass"
p0_count: 0
p1_count: 0
p2_count: 0
p3_count: 0
---
Body`;
    const { parsed, warnings } = parseReviewReportGraceful(content);
    expect(parsed.methodology).toBe("subagent-parallel");
    expect(warnings.some((w) => w.includes("methodology"))).toBe(false);
  });

  it("parses subagent-serial methodology", () => {
    const content = `---
result: "pass"
methodology: subagent-serial
p0_count: 0
p1_count: 0
p2_count: 0
p3_count: 0
---
Body`;
    const { parsed } = parseReviewReportGraceful(content);
    expect(parsed.methodology).toBe("subagent-serial");
  });

  it("degrades invalid methodology to default with warning", () => {
    const content = `---
result: "pass"
methodology: bogus-value
p0_count: 0
p1_count: 0
p2_count: 0
p3_count: 0
---
Body`;
    const { parsed, warnings } = parseReviewReportGraceful(content);
    expect(parsed.methodology).toBe("subagent-parallel");
    expect(warnings.some((w) => w.includes("methodology field invalid"))).toBe(true);
  });

  it("forces result=blocked when methodology=unavailable", () => {
    const content = `---
result: "pass"
methodology: unavailable
p0_count: 0
p1_count: 0
p2_count: 0
p3_count: 0
---
Body`;
    const { parsed, warnings } = parseReviewReportGraceful(content);
    expect(parsed.result).toBe("blocked");
    expect(parsed.methodology).toBe("unavailable");
    expect(warnings.some((w) => w.includes("methodology=unavailable forces"))).toBe(true);
  });
});
