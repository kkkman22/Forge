import { describe, it, expect } from "vitest";
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
    expect(() =>
      loadStateMachineDefinition("not: yaml", "reservation.yaml"),
    ).toThrow(/reservation\.yaml/);
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
});
