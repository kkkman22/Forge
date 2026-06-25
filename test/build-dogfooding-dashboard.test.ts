/**
 * Tests for the dogfooding-dashboard aggregation functions.
 *
 * Each scan function is a pure function: given a `.forge/` root directory,
 * it walks the relevant sub-tree and returns structured KPI data. Tests use
 * a minimal fixture shadow at test/__fixtures__/dogfooding-sample/.
 */

import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  renderMarkdown,
  scanEpisodes,
  scanFindings,
  scanSpecs,
} from "../scripts/build-dogfooding-dashboard.js";

const FIXTURE = resolve(import.meta.dirname, "__fixtures__/dogfooding-sample");

describe("scanSpecs [REQ-01]: spec→ship complete chain rate", () => {
  it("counts features with locked spec + tasks + ship marker as complete", () => {
    const result = scanSpecs(FIXTURE);
    // complete-feature has all three; half-done lacks ship; spec-only lacks tasks+ship
    expect(result.total).toBe(3);
    expect(result.complete).toBe(1);
    expect(result.rate).toBeCloseTo(1 / 3, 5);
  });

  it("returns a rate between 0 and 1", () => {
    const result = scanSpecs(FIXTURE);
    expect(result.rate).toBeGreaterThanOrEqual(0);
    expect(result.rate).toBeLessThanOrEqual(1);
  });

  it("names the methodology (numerator/denominator) for auditability [REQ-03]", () => {
    const result = scanSpecs(FIXTURE);
    expect(result.methodology).toContain("locked spec");
    expect(result.methodology).toContain("ship");
  });
});

describe("scanFindings [REQ-01]: review interception by severity", () => {
  it("aggregates P0/P1/P2/P3 counts from review severity_counts frontmatter", () => {
    const result = scanFindings(FIXTURE);
    // abc123: P0=1 P1=1 P2=1; def456: P0=0 P1=1 P2=1; standalone: P0=0 P1=0 P2=0 P3=2
    expect(result.P0).toBe(1);
    expect(result.P1).toBe(2);
    expect(result.P2).toBe(2);
    expect(result.P3).toBe(2);
  });

  it("reports the total review count for context", () => {
    const result = scanFindings(FIXTURE);
    expect(result.reviewCount).toBe(3);
  });

  it("names the methodology [REQ-03]", () => {
    const result = scanFindings(FIXTURE);
    expect(result.methodology).toContain("severity_counts");
  });
});

describe("scanEpisodes [REQ-01]: replay evidence-chain ratio", () => {
  it("counts sessions with an evidence_chain marker", () => {
    const result = scanEpisodes(FIXTURE);
    // 2 of 4 sessions have evidence_chain: true
    expect(result.total).toBe(4);
    expect(result.withEvidence).toBe(2);
    expect(result.rate).toBe(0.5);
  });

  it("names the methodology [REQ-03]", () => {
    const result = scanEpisodes(FIXTURE);
    expect(result.methodology).toContain("evidence_chain");
  });
});

describe("renderMarkdown [REQ-02, REQ-03]: static deterministic output", () => {
  const sampleKpis = {
    specs: scanSpecs(FIXTURE),
    findings: scanFindings(FIXTURE),
    episodes: scanEpisodes(FIXTURE),
  };

  it("includes all three KPI sections with their methodology footnotes", () => {
    const md = renderMarkdown(sampleKpis);
    expect(md).toContain("spec→ship");
    expect(md).toContain("P0");
    expect(md).toContain("evidence");
    // methodology footnotes present [REQ-03]
    expect(md).toContain("口径");
  });

  it("is deterministic: same input → byte-identical output", () => {
    const a = renderMarkdown(sampleKpis);
    const b = renderMarkdown(sampleKpis);
    expect(a).toBe(b);
  });

  it("shows '无数据' for a KPI when its count is zero (resilience)", () => {
    const md = renderMarkdown({
      specs: { total: 0, complete: 0, rate: 0, methodology: "n/a" },
      findings: { P0: 0, P1: 0, P2: 0, P3: 0, reviewCount: 0, methodology: "n/a" },
      episodes: { total: 0, withEvidence: 0, rate: 0, methodology: "n/a" },
    });
    expect(md).toContain("无数据");
  });
});
