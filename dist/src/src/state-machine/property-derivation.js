/**
 * State machine property test derivation engine.
 *
 * Generates fast-check property test code fragments from invariant DSL expressions.
 * Recognizes 4 template patterns; unrecognized invariants get TODO placeholders.
 *
 * @public
 */
/** Match an expression to a template type. */
function classifyInvariant(expression) {
    if (expression === "terminal_state_has_no_outgoing_transitions") {
        return "terminal_no_outgoing";
    }
    if (/^.+_before_.+_only$/.test(expression)) {
        return "state_before_state_only";
    }
    if (/^no_.+_requires_.+_passed$/.test(expression)) {
        return "no_state_requires_condition";
    }
    if (/^.+_requires_.+$/.test(expression)) {
        return "state_requires_condition";
    }
    return null;
}
/** Extract state/condition parts from expression. */
function parseParts(expression, type) {
    switch (type) {
        case "state_before_state_only": {
            const m = expression.match(/^(.+)_before_(.+)_only$/);
            if (!m)
                return {};
            return { state: m[1], before: m[2] };
        }
        case "no_state_requires_condition": {
            const m = expression.match(/^no_(.+)_requires_(.+)_passed$/);
            if (!m)
                return {};
            return { state: m[1], condition: m[2] };
        }
        case "state_requires_condition": {
            const m = expression.match(/^(.+)_requires_(.+)$/);
            if (!m)
                return {};
            return { state: m[1], condition: m[2] };
        }
        default:
            return {};
    }
}
/** PascalCase a snake_case string. */
function toPascal(s) {
    return s.replace(/(^|_)(\w)/g, (_, _sep, c) => c.toUpperCase());
}
/**
 * Derive fast-check property test code from a state machine definition.
 *
 * @param def - The state machine definition with invariants
 * @returns TypeScript code string (not auto-executed)
 *
 * @example
 * ```ts
 * const code = deriveStatePropertyTests(reservationDef);
 * // Paste code into project test file
 * ```
 * @public
 */
export function deriveStatePropertyTests(def) {
    const machineName = toPascal(def.name);
    const terminalStates = def.states.filter((s) => s.terminal).map((s) => s.name);
    const lines = [
        `import fc from "fast-check";`,
        `import { ${machineName}Machine } from "./${def.name}-machine";`,
        ``,
        `describe("${machineName} State Machine — derived properties", () => {`,
    ];
    for (const inv of def.invariants) {
        const templateType = classifyInvariant(inv.expression);
        if (templateType === null) {
            lines.push(`  // TODO: manually implement test for: ${inv.description}`, `  // Expression: ${inv.expression}`);
            continue;
        }
        const parts = parseParts(inv.expression, templateType);
        switch (templateType) {
            case "terminal_no_outgoing": {
                const stateList = terminalStates.map((s) => `"${s}"`).join(", ");
                lines.push(`  it("${inv.description}", () => {`, `    fc.assert(fc.property(`, `      fc.constantFrom<string>(${stateList}),`, `      (state) => {`, `        const m = new ${machineName}Machine(state as any);`, `        expect(() => m.transition("Any" as any))`, `          .toThrow(/terminal|no.*transition/i);`, `      },`, `    ));`, `  });`);
                break;
            }
            case "state_before_state_only": {
                lines.push(`  it("${inv.description}", () => {`, `    // Verify ${parts.state} is only reachable from ${parts.before} states`, `    fc.assert(fc.property(`, `      fc.constantFrom(...Object.values(m.states)),`, `      (fromState) => {`, `        if (fromState === "${parts.before}") return;`, `        const canReach = m.canTransitionTo("${parts.state}", fromState);`, `        expect(canReach).toBe(false);`, `      },`, `    ));`, `  });`);
                break;
            }
            case "no_state_requires_condition": {
                lines.push(`  it("${inv.description}", () => {`, `    fc.assert(fc.property(`, `      fc.constantFrom(...m.nonTerminalStates),`, `      (fromState) => {`, `        const m = new ${machineName}Machine(fromState);`, `        if (!m.hasCondition("${parts.condition}")) {`, `          expect(() => m.transition("To${toPascal(parts.state)}" as any))`, `            .toThrow(/${parts.condition}/i);`, `        }`, `      },`, `    ));`, `  });`);
                break;
            }
            case "state_requires_condition": {
                lines.push(`  it("${inv.description}", () => {`, `    fc.assert(fc.property(`, `      fc.constantFrom(...m.nonTerminalStates),`, `      (fromState) => {`, `        const m = new ${machineName}Machine(fromState);`, `        if (!m.hasCondition("${parts.condition}")) {`, `          expect(() => m.transition("To${toPascal(parts.state)}" as any))`, `            .toThrow(/${parts.condition}/i);`, `        }`, `      },`, `    ));`, `  });`);
                break;
            }
        }
    }
    lines.push(`});`);
    return lines.join("\n");
}
//# sourceMappingURL=property-derivation.js.map