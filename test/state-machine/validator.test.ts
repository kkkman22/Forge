import { describe, it, expect } from "vitest";
import { validateDefinition } from "../../src/state-machine/validator.js";
import type { StateMachineDefinition } from "../../src/state-machine/types.js";

/** Helper to build a minimal valid definition. */
function validDef(overrides?: Partial<StateMachineDefinition>): StateMachineDefinition {
  return {
    name: "test",
    description: "test machine",
    states: [
      { name: "A", description: "state A" },
      { name: "B", description: "state B", terminal: true },
    ],
    initial: "A",
    transitions: [
      { from: "A", to: "B", event: "Go" },
    ],
    invariants: [],
    ...overrides,
  };
}

describe("validateDefinition", () => {
  it("returns valid:true for a correct definition", () => {
    const report = validateDefinition(validDef());
    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  // ST001: initial must be in states
  it("ST001: errors when initial is not in states", () => {
    const report = validateDefinition(validDef({ initial: "Missing" }));
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.code === "ST001")).toBe(true);
  });

  // ST002: transitions.from and .to must reference declared states
  it("ST002: errors when transition from references undeclared state", () => {
    const report = validateDefinition(
      validDef({
        transitions: [{ from: "X", to: "A", event: "Bad" }],
      }),
    );
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.code === "ST002")).toBe(true);
  });

  it("ST002: errors when transition to references undeclared state", () => {
    const report = validateDefinition(
      validDef({
        transitions: [{ from: "A", to: "X", event: "Bad" }],
      }),
    );
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.code === "ST002")).toBe(true);
  });

  // ST003: terminal states have no outgoing transitions
  it("ST003: errors when terminal state has outgoing transition", () => {
    const report = validateDefinition(
      validDef({
        states: [
          { name: "A", description: "a" },
          { name: "B", description: "b", terminal: true },
          { name: "C", description: "c" },
        ],
        initial: "A",
        transitions: [
          { from: "A", to: "B", event: "Go" },
          { from: "B", to: "C", event: "Bad" },
        ],
      }),
    );
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.code === "ST003")).toBe(true);
  });

  // ST004: all non-terminal states reachable from initial (warning)
  it("ST004: warns when non-terminal state is unreachable from initial", () => {
    const report = validateDefinition(
      validDef({
        states: [
          { name: "A", description: "a" },
          { name: "B", description: "b", terminal: true },
          { name: "Orphan", description: "unreachable" },
        ],
        initial: "A",
        transitions: [{ from: "A", to: "B", event: "Go" }],
      }),
    );
    expect(report.warnings.some((w) => w.code === "ST004")).toBe(true);
  });

  it("ST004: does not warn when all non-terminal states are reachable", () => {
    const report = validateDefinition(validDef());
    expect(report.warnings.some((w) => w.code === "ST004")).toBe(false);
  });

  // ST005: no duplicate {from, event} pairs
  it("ST005: errors on duplicate from+event combination", () => {
    const report = validateDefinition(
      validDef({
        transitions: [
          { from: "A", to: "B", event: "Go" },
          { from: "A", to: "B", event: "Go" },
        ],
      }),
    );
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.code === "ST005")).toBe(true);
  });

  it("allows same event from different states", () => {
    const report = validateDefinition(
      validDef({
        states: [
          { name: "A", description: "a" },
          { name: "B", description: "b" },
          { name: "C", description: "c", terminal: true },
        ],
        initial: "A",
        transitions: [
          { from: "A", to: "B", event: "Go" },
          { from: "B", to: "C", event: "Go" },
        ],
      }),
    );
    expect(report.valid).toBe(true);
  });

  it("accumulates multiple errors", () => {
    const report = validateDefinition(
      validDef({
        initial: "Missing",
        transitions: [
          { from: "X", to: "Y", event: "Bad" },
        ],
      }),
    );
    expect(report.errors.length).toBeGreaterThanOrEqual(2);
  });
});
