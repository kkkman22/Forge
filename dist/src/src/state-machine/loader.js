/**
 * State machine YAML loader.
 *
 * Parses a YAML string into a strongly-typed StateMachineDefinition.
 * Validates required fields and throws named errors on missing data.
 *
 * @public
 */
import { parse } from "yaml";
/** Required top-level fields and their human-readable names. */
const REQUIRED_FIELDS = [
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
export function loadStateMachineDefinition(yamlContent, filePath) {
    const prefix = filePath ? `${filePath}: ` : "";
    let parsed;
    try {
        parsed = parse(yamlContent);
    }
    catch (e) {
        throw new Error(`${prefix}Invalid YAML: ${e.message}`);
    }
    if (!parsed || typeof parsed !== "object") {
        throw new Error(`${prefix}YAML must resolve to an object`);
    }
    const obj = parsed;
    for (const { key, label } of REQUIRED_FIELDS) {
        if (obj[key] === undefined || obj[key] === null) {
            throw new Error(`${prefix}Missing required field: ${label}`);
        }
    }
    const states = obj.states;
    if (!Array.isArray(states) || states.length === 0) {
        throw new Error(`${prefix}states must be a non-empty array`);
    }
    return {
        name: obj.name,
        description: obj.description,
        states: states.map((s) => ({
            name: s.name,
            description: s.description,
            terminal: s.terminal ?? false,
        })),
        initial: obj.initial,
        transitions: obj.transitions.map((t) => ({
            from: t.from,
            to: t.to,
            event: t.event,
            guards: t.guards,
            sideEffects: t.side_effects,
        })),
        invariants: obj.invariants.map((inv) => ({
            expression: inv.expression,
            description: inv.description,
        })),
    };
}
//# sourceMappingURL=loader.js.map