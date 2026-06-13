/**
 * State machine YAML loader.
 *
 * Parses a YAML string into a strongly-typed StateMachineDefinition.
 * Validates required fields and throws named errors on missing data.
 *
 * @public
 */

import { parse } from "yaml";
import type { StateMachineDefinition } from "./types.js";

/** Required top-level fields and their human-readable names. */
const REQUIRED_FIELDS: Array<{ key: keyof StateMachineDefinition; label: string }> = [
  { key: "name", label: "name" },
  { key: "description", label: "description" },
  { key: "states", label: "states" },
  { key: "initial", label: "initial" },
  { key: "transitions", label: "transitions" },
];

/**
 * Load and parse a state machine YAML definition.
 *
 * @param yamlContent - Raw YAML string
 * @param filePath - Optional file path for error messages
 * @returns Parsed StateMachineDefinition
 * @throws Error on missing required fields or empty states
 *
 * @example
 * ```ts
 * const def = loadStateMachineDefinition(yamlStr, "reservation.yaml");
 * // def.name === "reservation"
 * ```
 * @public
 */
export function loadStateMachineDefinition(
  yamlContent: string,
  filePath?: string,
): StateMachineDefinition {
  const prefix = filePath ? `${filePath}: ` : "";

  let parsed: unknown;
  try {
    parsed = parse(yamlContent);
  } catch (e) {
    throw new Error(`${prefix}Invalid YAML: ${(e as Error).message}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${prefix}YAML must resolve to an object`);
  }

  const obj = parsed as Record<string, unknown>;

  for (const { key, label } of REQUIRED_FIELDS) {
    if (obj[key] === undefined || obj[key] === null) {
      throw new Error(`${prefix}Missing required field: ${label}`);
    }
  }

  const states = obj.states as Array<{ name: string; description: string; terminal?: boolean }>;
  if (!Array.isArray(states) || states.length === 0) {
    throw new Error(`${prefix}states must be a non-empty array`);
  }

  // `transitions` is a required field (presence checked above), but its type
  // must be validated too — a non-array value (e.g. `transitions: "foo"`)
  // would otherwise crash on `.map()` with an opaque TypeError.
  if (!Array.isArray(obj.transitions)) {
    throw new Error(`${prefix}transitions must be an array`);
  }
  // `invariants` is optional and defaults to empty. A null/missing value is
  // treated as "no invariants"; any other non-array type is a malformed input.
  const rawInvariants = obj.invariants;
  if (rawInvariants !== undefined && rawInvariants !== null && !Array.isArray(rawInvariants)) {
    throw new Error(`${prefix}invariants must be an array when present`);
  }

  return {
    name: obj.name as string,
    description: obj.description as string,
    states: states.map((s) => ({
      name: s.name,
      description: s.description,
      terminal: s.terminal ?? false,
    })),
    initial: obj.initial as string,
    transitions: (obj.transitions as Array<Record<string, unknown>>).map((t) => ({
      from: t.from as string,
      to: t.to as string,
      event: t.event as string,
      guards: t.guards as string[] | undefined,
      sideEffects: t.side_effects as string[] | undefined,
    })),
    invariants: ((rawInvariants ?? []) as Array<{ expression: string; description: string }>).map(
      (inv) => ({
        expression: inv.expression,
        description: inv.description,
      }),
    ),
  };
}
