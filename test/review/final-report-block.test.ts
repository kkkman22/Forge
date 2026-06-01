import { describe, expect, it } from "vitest";
import {
  enforceFinalReportContract,
  FINAL_REPORT_SENTINEL,
  validateFinalReportBlock,
} from "../../src/review-final-block.js";
import type { SubagentResult } from "../../src/types.js";

const VALID_LAYER1 = `
Some thinking text...

## Layer 1 — Spec Alignment

**Reviewer**: spec-check

| Requirement/Scenario | Status | Note |
|-----------|------|------|
| 需求 1 | ✅ | — |

**Issue List**:

| # | Severity | Issue | Fix Suggestion |
|---|--------|------|---------|
| 1 | P2 | minor finding | refactor |

${FINAL_REPORT_SENTINEL}
`.trim();

const VALID_LAYER2 = `
## Layer 2 — Code Quality

**Reviewer**: quality-check

| # | Severity | File | Issue | Suggestion |
|---|--------|------|------|------|
| 1 | P3 | src/x.ts | minor | comment |

${FINAL_REPORT_SENTINEL}
`.trim();

const VALID_LAYER3 = `
## Layer 3 — Security & Risk

**Reviewer**: security-check

| # | Severity | File | Issue | Suggestion |
|---|--------|------|------|------|

无 issue 发现。

${FINAL_REPORT_SENTINEL}
`.trim();

describe("validateFinalReportBlock", () => {
  it("accepts a layer-1 report with heading, table, and sentinel", () => {
    const r = validateFinalReportBlock(VALID_LAYER1, "spec-check");
    expect(r.valid).toBe(true);
    expect(r.reason).toBeUndefined();
  });

  it("accepts a layer-2 report", () => {
    const r = validateFinalReportBlock(VALID_LAYER2, "quality-check");
    expect(r.valid).toBe(true);
  });

  it("accepts a layer-3 report (table header but no rows allowed)", () => {
    const r = validateFinalReportBlock(VALID_LAYER3, "security-check");
    expect(r.valid).toBe(true);
  });

  it("rejects output that ends with a preamble like 'Now let me check...'", () => {
    const preamble = "Now let me check one of the test files to understand test coverage:";
    const r = validateFinalReportBlock(preamble, "spec-check");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("missing-final-block");
  });

  it("rejects output that has the heading but no severity table", () => {
    const noTable = `## Layer 2 — Code Quality\n\nLooks fine.\n${FINAL_REPORT_SENTINEL}`;
    const r = validateFinalReportBlock(noTable, "quality-check");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("missing-severity-table");
  });

  it("rejects output that has a heading + table but no sentinel", () => {
    const noSentinel = VALID_LAYER1.replace(FINAL_REPORT_SENTINEL, "").trim();
    const r = validateFinalReportBlock(noSentinel, "spec-check");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("missing-sentinel");
  });

  it("rejects empty output", () => {
    const r = validateFinalReportBlock("", "spec-check");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("empty-output");
  });

  it("rejects undefined output", () => {
    const r = validateFinalReportBlock(undefined, "spec-check");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("empty-output");
  });

  it("requires the layer heading to match the agent type", () => {
    // quality-check returning Layer 1 heading is wrong-layer
    const r = validateFinalReportBlock(VALID_LAYER1, "quality-check");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("wrong-layer");
  });

  it("accepts frontend-check with Layer 4 heading", () => {
    const layer4 = `## Layer 4 — Frontend Check\n\n| # | Severity | File | Issue | Suggestion |\n|---|---|---|---|---|\n| 1 | P2 | src/App.vue | nit | fix |\n\n${FINAL_REPORT_SENTINEL}`;
    const r = validateFinalReportBlock(layer4, "frontend-check");
    expect(r.valid).toBe(true);
  });

  it("rejects when sentinel appears mid-content (not at end)", () => {
    const sentinelMid = `${VALID_LAYER1}\n\nNow let me also check the tasks.md...`;
    const r = validateFinalReportBlock(sentinelMid, "spec-check");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("sentinel-not-at-end");
  });
});

describe("enforceFinalReportContract", () => {
  function ok(agentType: string, output: string): SubagentResult {
    return { agentType, status: "success", output };
  }

  it("passes through a status:failure result unchanged", () => {
    const failed: SubagentResult = {
      agentType: "spec-check",
      status: "failure",
      error: "underlying SDK exploded",
    };
    const out = enforceFinalReportContract(failed);
    expect(out).toBe(failed);
  });

  it("passes through a valid success result unchanged", () => {
    const result = ok("spec-check", VALID_LAYER1);
    const out = enforceFinalReportContract(result);
    expect(out.status).toBe("success");
    expect(out.output).toBe(VALID_LAYER1);
  });

  it("reclassifies success-with-preamble as failure", () => {
    const preambleOnly = ok("spec-check", "Now let me check one of the test files:");
    const out = enforceFinalReportContract(preambleOnly);
    expect(out.status).toBe("failure");
    expect(out.error).toMatch(/incomplete-report:missing-final-block/);
    // Original output is preserved on the result for diagnostics
    expect(out.output).toBe(preambleOnly.output);
  });

  it("reclassifies success-without-sentinel as failure with specific reason", () => {
    const noSentinel = VALID_LAYER2.replace(FINAL_REPORT_SENTINEL, "").trim();
    const result = ok("quality-check", noSentinel);
    const out = enforceFinalReportContract(result);
    expect(out.status).toBe("failure");
    expect(out.error).toContain("incomplete-report:missing-sentinel");
  });

  it("reclassifies wrong-layer success as failure", () => {
    const wrong = ok("quality-check", VALID_LAYER1); // layer 1 heading, but agent is quality-check
    const out = enforceFinalReportContract(wrong);
    expect(out.status).toBe("failure");
    expect(out.error).toContain("incomplete-report:wrong-layer");
  });

  it("preserves a description of the actual reason for the orchestrator log", () => {
    const empty = ok("security-check", "");
    const out = enforceFinalReportContract(empty);
    expect(out.status).toBe("failure");
    expect(out.error).toContain("incomplete-report:empty-output");
  });
});
