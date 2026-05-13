// Feature: forge-slimming-plan, Property 2: Archive Classify Correctness
// Validates the shipped/active/ambiguous classification logic.

import fc from "fast-check";
import { describe, expect, it } from "vitest";

interface Evidence {
  inRoadmapShipped: boolean;
  inChangelog: boolean;
  inActiveProgress: boolean;
  inStatusCurrent: boolean;
}

type Status = "active" | "shipped" | "ambiguous";

function classify(e: Evidence): Status {
  if (e.inActiveProgress || e.inStatusCurrent) return "active";
  if (e.inRoadmapShipped && e.inChangelog && !e.inActiveProgress && !e.inStatusCurrent)
    return "shipped";
  return "ambiguous";
}

const evidenceArb = fc.record({
  inRoadmapShipped: fc.boolean(),
  inChangelog: fc.boolean(),
  inActiveProgress: fc.boolean(),
  inStatusCurrent: fc.boolean(),
});

describe("Property 2: Archive Classify Correctness", () => {
  it("active when in_active_progress or in_status_current", () => {
    fc.assert(
      fc.property(evidenceArb, (e) => {
        if (e.inActiveProgress || e.inStatusCurrent) {
          expect(classify(e)).toBe("active");
        }
      }),
      { numRuns: 200 },
    );
  });

  it("shipped when dual evidence and not active", () => {
    fc.assert(
      fc.property(evidenceArb, (e) => {
        if (e.inRoadmapShipped && e.inChangelog && !e.inActiveProgress && !e.inStatusCurrent) {
          expect(classify(e)).toBe("shipped");
        }
      }),
      { numRuns: 200 },
    );
  });

  it("ambiguous covers all remaining cases", () => {
    fc.assert(
      fc.property(evidenceArb, (e) => {
        const result = classify(e);
        const isActive = e.inActiveProgress || e.inStatusCurrent;
        const isShipped =
          e.inRoadmapShipped && e.inChangelog && !e.inActiveProgress && !e.inStatusCurrent;
        if (!isActive && !isShipped) {
          expect(result).toBe("ambiguous");
        }
      }),
      { numRuns: 200 },
    );
  });

  it("classification is deterministic", () => {
    fc.assert(
      fc.property(evidenceArb, (e) => {
        const r1 = classify(e);
        const r2 = classify(e);
        expect(r1).toBe(r2);
      }),
      { numRuns: 200 },
    );
  });

  it("covers all 16 boolean combinations", () => {
    const statuses = new Set<Status>();
    for (let i = 0; i < 16; i++) {
      const e: Evidence = {
        inRoadmapShipped: !!(i & 1),
        inChangelog: !!(i & 2),
        inActiveProgress: !!(i & 4),
        inStatusCurrent: !!(i & 8),
      };
      statuses.add(classify(e));
    }
    expect(statuses.has("active")).toBe(true);
    expect(statuses.has("shipped")).toBe(true);
    expect(statuses.has("ambiguous")).toBe(true);
  });
});
