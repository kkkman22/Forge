import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ICON,
  LOOP_STATE_TO_ICON,
  PHASE_TO_ICON,
  phaseToIcon,
  TIER_TO_COLOR,
  tierToColor,
} from "../../scripts/cmux-mirror/lib/payload.mjs";

const VALID_PHASES = [
  "decide",
  "spec",
  "plan",
  "build",
  "review",
  "test",
  "ship",
  "learn",
  "debug",
  "idle",
];

const VALID_TIERS = ["light", "standard", "full"];

const ALL_ICONS = Object.values(PHASE_TO_ICON).concat(DEFAULT_ICON);

describe("payload: icon mapping totality (R12.3)", () => {
  it("every valid phase maps to exactly one icon from the known set", () => {
    for (const phase of VALID_PHASES) {
      const icon = phaseToIcon(phase);
      expect(ALL_ICONS).toContain(icon);
    }
  });

  it("any out-of-domain phase maps to circle (R12.3)", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !VALID_PHASES.includes(s)),
        (unknown) => {
          expect(phaseToIcon(unknown)).toBe("circle");
        },
      ),
    );
  });
});

describe("payload: color mapping totality (R12.4)", () => {
  it("every valid tier maps to a fixed color", () => {
    for (const tier of VALID_TIERS) {
      const color = tierToColor(tier);
      expect(color).toBeTruthy();
      expect(color).toBe(TIER_TO_COLOR[tier as keyof typeof TIER_TO_COLOR]);
    }
  });

  it("out-of-domain tier returns null (emitter omits --color)", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !VALID_TIERS.includes(s)),
        (unknown) => {
          expect(tierToColor(unknown)).toBeNull();
        },
      ),
    );
  });
});

describe("payload: loop state mapping", () => {
  it("maps known loop states to icon/color objects", () => {
    for (const state of ["running", "interrupted", "terminated"]) {
      const entry = LOOP_STATE_TO_ICON[state as keyof typeof LOOP_STATE_TO_ICON];
      expect(entry).toBeDefined();
      expect(entry.icon).toBeTruthy();
      expect(entry.color).toBeTruthy();
    }
  });
});
