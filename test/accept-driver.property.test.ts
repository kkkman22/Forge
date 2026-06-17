import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { AcceptanceRunResult, ScenarioArtifact } from "../src/accept.js";
import { aggregateVerdicts, renderAcceptanceReport } from "../src/accept-driver.js";

function artifactArb(): fc.Arbitrary<ScenarioArtifact> {
  return fc.record({
    scenarioId: fc.string({ minLength: 1 }),
    source: fc.constantFrom("explicit", "derived"),
    givenWhenThen: fc.string(),
    executedAt: fc.string(),
    verdict: fc.constantFrom("PASS", "FAIL", "SKIP", "WARN", "INCONCLUSIVE"),
    evidence: fc.array(fc.string()),
    failureReason: fc.option(fc.string()),
  });
}

describe("aggregateVerdicts — property", () => {
  it("never throws", () => {
    fc.assert(
      fc.property(fc.array(artifactArb()), (artifacts) => {
        expect(() => aggregateVerdicts(artifacts)).not.toThrow();
      }),
    );
  });

  it("counts sum to total", () => {
    fc.assert(
      fc.property(fc.array(artifactArb()), (artifacts) => {
        const result = aggregateVerdicts(artifacts);
        expect(result.pass + result.fail + result.skip + result.warn + result.inconclusive).toBe(artifacts.length);
      }),
    );
  });

  it("empty input → zero counts", () => {
    const result = aggregateVerdicts([]);
    expect(result).toEqual({ pass: 0, fail: 0, skip: 0, warn: 0, inconclusive: 0, blocksShip: false });
  });

  it("any FAIL → blocksShip true", () => {
    const artifact: ScenarioArtifact = {
      scenarioId: "s1",
      source: "explicit",
      givenWhenThen: "g/w/t",
      executedAt: "2026-01-01",
      verdict: "FAIL",
      evidence: [],
      failureReason: "test",
    };
    expect(aggregateVerdicts([artifact]).blocksShip).toBe(true);
  });

  it("all PASS → blocksShip false", () => {
    const artifact: ScenarioArtifact = {
      scenarioId: "s1",
      source: "explicit",
      givenWhenThen: "g/w/t",
      executedAt: "2026-01-01",
      verdict: "PASS",
      evidence: [],
    };
    expect(aggregateVerdicts([artifact]).blocksShip).toBe(false);
  });
});

describe("renderAcceptanceReport — property", () => {
  it("never throws", () => {
    fc.assert(
      fc.property(fc.string(), fc.array(artifactArb()), (topic, scenarios) => {
        const summary = aggregateVerdicts(scenarios);
        const result: AcceptanceRunResult = { topic, scenarios, summary };
        expect(() => renderAcceptanceReport(result)).not.toThrow();
      }),
    );
  });

  it("contains topic in output", () => {
    const result: AcceptanceRunResult = {
      topic: "test-topic",
      scenarios: [],
      summary: { pass: 0, fail: 0, skip: 0, warn: 0, inconclusive: 0, blocksShip: false },
    };
    const report = renderAcceptanceReport(result);
    expect(report).toContain("test-topic");
  });
});
