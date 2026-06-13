import { describe, expect, it } from "vitest";
import { loadStateMachineDefinition } from "../../src/state-machine/loader.js";

const VALID_YAML = `
name: reservation
description: 预订聚合的生命周期状态机
states:
  - name: Booked
    description: 预订已创建
  - name: Confirmed
    description: 预订已确认
  - name: CheckedOut
    description: 客人已退房
    terminal: true
initial: Booked
transitions:
  - from: Booked
    to: Confirmed
    event: ConfirmReservation
    guards:
      - payment_captured
invariants:
  - expression: terminal_state_has_no_outgoing_transitions
    description: 终态不得有出边
`;

describe("loadStateMachineDefinition", () => {
  it("parses valid YAML into StateMachineDefinition", () => {
    const def = loadStateMachineDefinition(VALID_YAML);
    expect(def.name).toBe("reservation");
    expect(def.states).toHaveLength(3);
    expect(def.initial).toBe("Booked");
    expect(def.transitions).toHaveLength(1);
    expect(def.invariants).toHaveLength(1);
    expect(def.states[2].terminal).toBe(true);
  });

  it("throws on missing required field 'name'", () => {
    const yaml = `
description: no name
states:
  - name: A
    description: a
initial: A
transitions: []
invariants: []
`;
    expect(() => loadStateMachineDefinition(yaml)).toThrow(/name/);
  });

  it("throws on missing 'states'", () => {
    const yaml = `
name: test
description: no states
initial: A
transitions: []
invariants: []
`;
    expect(() => loadStateMachineDefinition(yaml)).toThrow(/states/);
  });

  it("throws on missing 'initial'", () => {
    const yaml = `
name: test
description: no initial
states:
  - name: A
    description: a
transitions: []
invariants: []
`;
    expect(() => loadStateMachineDefinition(yaml)).toThrow(/initial/);
  });

  it("throws on missing 'transitions'", () => {
    const yaml = `
name: test
description: no transitions
states:
  - name: A
    description: a
initial: A
invariants: []
`;
    expect(() => loadStateMachineDefinition(yaml)).toThrow(/transitions/);
  });

  it("throws on empty states array", () => {
    const yaml = `
name: test
description: empty
states: []
initial: A
transitions: []
invariants: []
`;
    expect(() => loadStateMachineDefinition(yaml)).toThrow(/states/);
  });

  it("includes filePath in error messages when provided", () => {
    expect(() => loadStateMachineDefinition("not: yaml", "reservation.yaml")).toThrow(
      /reservation\.yaml/,
    );
  });

  it("parses guards and side_effects on transitions", () => {
    const yaml = `
name: test
description: test
states:
  - name: A
    description: a
  - name: B
    description: b
initial: A
transitions:
  - from: A
    to: B
    event: Go
    guards:
      - guard1
    side_effects:
      - effect1
invariants: []
`;
    const def = loadStateMachineDefinition(yaml);
    expect(def.transitions[0].guards).toEqual(["guard1"]);
    expect(def.transitions[0].sideEffects).toEqual(["effect1"]);
  });

  it("defaults guards and side_effects to undefined when absent", () => {
    const yaml = `
name: test
description: test
states:
  - name: A
    description: a
  - name: B
    description: b
initial: A
transitions:
  - from: A
    to: B
    event: Go
invariants: []
`;
    const def = loadStateMachineDefinition(yaml);
    expect(def.transitions[0].guards).toBeUndefined();
    expect(def.transitions[0].sideEffects).toBeUndefined();
  });

  // --- P2 CRITICAL FIX: robustness on missing/mal-typed fields ---
  it("treats missing `invariants` as empty (does not crash)", () => {
    // `invariants` is optional; omitting it must NOT throw a TypeError.
    const yaml = `
name: test
description: no invariants key at all
states:
  - name: A
    description: a
initial: A
transitions: []
`;
    const def = loadStateMachineDefinition(yaml);
    expect(def.invariants).toEqual([]);
  });

  it("accepts null `invariants` as empty", () => {
    const yaml = `
name: test
description: null invariants
states:
  - name: A
    description: a
initial: A
transitions: []
invariants: null
`;
    const def = loadStateMachineDefinition(yaml);
    expect(def.invariants).toEqual([]);
  });

  it("throws a structured error (not TypeError) when `transitions` is non-array", () => {
    const yaml = `
name: test
description: transitions is a string
states:
  - name: A
    description: a
initial: A
transitions: not-an-array
invariants: []
`;
    let thrown: unknown;
    try {
      loadStateMachineDefinition(yaml);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(TypeError);
    expect((thrown as Error).message).toMatch(/transitions/);
  });

  it("throws a structured error (not TypeError) when `invariants` is non-array", () => {
    const yaml = `
name: test
description: invariants is a number
states:
  - name: A
    description: a
initial: A
transitions: []
invariants: 42
`;
    let thrown: unknown;
    try {
      loadStateMachineDefinition(yaml);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(TypeError);
    expect((thrown as Error).message).toMatch(/invariants/);
  });
});
