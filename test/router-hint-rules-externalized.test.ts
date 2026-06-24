/**
 * Equivalence regression test for HINT_RULES externalisation [REQ-07].
 *
 * The HINT_RULES array was moved out of router.ts into a dedicated data module.
 * This test locks the observable behaviour of `generateHints` to a golden
 * snapshot taken BEFORE the move, so any drift introduced during externalisation
 * (dropped rule, altered hint, broken match logic) is caught.
 *
 * If the rules legitimately change, regenerate the snapshot:
 *   npx tsx -e '<see plan>' > test/__fixtures__/hint-rules-golden.json
 *
 * **Validates: Requirement REQ-07** — HINT_RULES externalised, behaviour preserved.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { generateHints, type ProjectPhase, type TaskType } from "../src/router.js";

const GOLDEN = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "__fixtures__", "hint-rules-golden.json"), "utf-8"),
) as Record<string, ReturnType<typeof generateHints>>;

const TASK_TYPES: TaskType[] = ["frontend", "backend", "fullstack", "data", "infra", "docs"];
const PHASES: ProjectPhase[] = ["greenfield", "iteration", "refactor", "bugfix"];
const ALL_COMMANDS = ["build", "review", "test", "ship", "plan", "decide", "spec", "learn"];

describe("HINT_RULES externalisation preserves generateHints output [REQ-07]", () => {
  it("single-command output matches golden snapshot for every type×phase×command", () => {
    for (const tt of TASK_TYPES) {
      for (const ph of PHASES) {
        for (const cmd of ALL_COMMANDS) {
          const key = `${tt}|${ph}|${cmd}`;
          const actual = generateHints(tt, ph, [cmd]);
          const expected = GOLDEN[key] ?? [];
          expect(actual, key).toEqual(expected);
        }
      }
    }
  });

  it("full-sequence output matches golden snapshot for every type×phase", () => {
    for (const tt of TASK_TYPES) {
      for (const ph of PHASES) {
        const key = `${tt}|${ph}|ALL`;
        const actual = generateHints(tt, ph, ALL_COMMANDS);
        const expected = GOLDEN[key] ?? [];
        expect(actual, key).toEqual(expected);
      }
    }
  });

  it("hints remain ADDITIVE (empty command sequence → no hints dropped from full)", () => {
    // Invariant from router.ts: hints never remove commands. A superset command
    // sequence must produce a superset of hints.
    const frontendHintsSingle = generateHints("frontend", "greenfield", ["review"]);
    const frontendHintsAll = generateHints("frontend", "greenfield", ALL_COMMANDS);
    const allTags = new Set(frontendHintsAll.map((h) => h.tag));
    for (const h of frontendHintsSingle) {
      expect(allTags.has(h.tag)).toBe(true);
    }
  });
});
