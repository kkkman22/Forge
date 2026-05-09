/**
 * State machine definition validator.
 *
 * Checks a StateMachineDefinition against rules ST001-ST005:
 *   - ST001: initial state exists in states list
 *   - ST002: all transition from/to reference declared states
 *   - ST003: terminal states have no outgoing transitions
 *   - ST004: all non-terminal states reachable from initial (warning)
 *   - ST005: no duplicate {from, event} combinations
 *
 * @public
 */

import type { StateMachineDefinition, ValidationReport, ValidationEntry } from "./types.js";

/**
 * Validate a state machine definition.
 *
 * @param def - The definition to validate
 * @returns ValidationReport with errors (blocking) and warnings (non-blocking)
 *
 * @example
 * ```ts
 * const report = validateDefinition(def);
 * if (!report.valid) {
 *   report.errors.forEach(e => console.error(e.code, e.message));
 * }
 * ```
 * @public
 */
export function validateDefinition(def: StateMachineDefinition): ValidationReport {
  const errors: ValidationEntry[] = [];
  const warnings: ValidationEntry[] = [];

  const stateNames = new Set(def.states.map((s) => s.name));
  const terminalStates = new Set(
    def.states.filter((s) => s.terminal).map((s) => s.name),
  );

  // ST001: initial must be in states
  if (!stateNames.has(def.initial)) {
    errors.push({
      code: "ST001",
      message: `Initial state "${def.initial}" is not declared in states`,
    });
  }

  // ST002: all transitions reference declared states
  for (const t of def.transitions) {
    if (!stateNames.has(t.from)) {
      errors.push({
        code: "ST002",
        message: `Transition from "${t.from}" (event: ${t.event}) references undeclared state`,
      });
    }
    if (!stateNames.has(t.to)) {
      errors.push({
        code: "ST002",
        message: `Transition to "${t.to}" (event: ${t.event}) references undeclared state`,
      });
    }
  }

  // ST003: terminal states have no outgoing transitions
  for (const t of def.transitions) {
    if (terminalStates.has(t.from)) {
      errors.push({
        code: "ST003",
        message: `Terminal state "${t.from}" has outgoing transition (event: ${t.event})`,
      });
    }
  }

  // ST004: all non-terminal states reachable from initial (warning)
  const reachable = new Set<string>();
  const queue = [def.initial];
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const t of def.transitions) {
      if (t.from === current && !reachable.has(t.to)) {
        queue.push(t.to);
      }
    }
  }
  for (const s of def.states) {
    if (!s.terminal && !reachable.has(s.name) && stateNames.has(def.initial)) {
      warnings.push({
        code: "ST004",
        message: `Non-terminal state "${s.name}" is unreachable from initial "${def.initial}"`,
      });
    }
  }

  // ST005: no duplicate {from, event} pairs
  const seen = new Map<string, string>();
  for (const t of def.transitions) {
    const key = `${t.from}::${t.event}`;
    if (seen.has(key)) {
      errors.push({
        code: "ST005",
        message: `Duplicate transition from "${t.from}" with event "${t.event}" (also goes to "${seen.get(key)}")`,
      });
    } else {
      seen.set(key, t.to);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
