/**
 * @non-production NOT FOR PRODUCTION — in-repo dogfood reference domain.
 *
 * ReservationMachine — a thin adapter the generated state-property tests
 * (REQ-09) drive. It wraps the state-machine engine so deriveStatePropertyTests
 * output can be committed verbatim (only the import path + this adapter are
 * the integration seam). This is NOT application code — it exists to make the
 * engine's derived property tests runnable against the reservation definition.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStateMachineDefinition } from "../../state-machine/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const yamlPath = resolve(here, "../../../packs/pms/state-machines/reservation.yaml");
const def = loadStateMachineDefinition(readFileSync(yamlPath, "utf-8"), yamlPath);

const TERMINAL = new Set(def.states.filter((s) => s.terminal).map((s) => s.name));

export class ReservationMachine {
  /** All state names in the definition. */
  static readonly states: Record<string, string> = Object.fromEntries(
    def.states.map((s) => [s.name.toLowerCase(), s.name]),
  );

  /** Non-terminal state names (those with outgoing transitions allowed). */
  static readonly nonTerminalStates: string[] = def.states
    .filter((s) => !s.terminal)
    .map((s) => s.name);

  private state: string;

  constructor(initial: string) {
    this.state = initial;
  }

  /** Attempt a transition by event; throws if none legal from current state. */
  transition(event: string): string {
    const t = def.transitions.find((tr) => tr.from === this.state && tr.event === event);
    if (!t) {
      if (TERMINAL.has(this.state)) {
        throw new Error(`terminal state ${this.state}: no outgoing transition`);
      }
      throw new Error(`no transition from ${this.state} on ${event}`);
    }
    this.state = t.to;
    return this.state;
  }

  /** Whether any transition path reaches `target` from `from`. */
  canTransitionTo(target: string, from: string): boolean {
    return def.transitions.some((tr) => tr.from === from && tr.to === target);
  }

  /** Whether the outgoing transitions from current state require `condition`. */
  hasCondition(condition: string): boolean {
    return def.transitions
      .filter((tr) => tr.from === this.state)
      .some((tr) => (tr.guards ?? []).some((g) => g.includes(condition)));
  }
}
