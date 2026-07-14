/**
 * Shared router types — extracted to break the router ↔ {hint-rules,intents}
 * barrel cycle (P3-2).
 *
 * Previously these types lived in `router.ts`. `router-hint-rules.ts` and
 * `router-intents.ts` imported them via `import type`, while `router.ts`
 * imported VALUES (HINT_RULES, intentsToHints, matchIntents) from them — a
 * static cycle (benign since the back-edge is type-only/erased, but flagged).
 * Moving the shared types here removes the back-edge: all three modules import
 * from this leaf, which imports nothing.
 */

export type TaskType = "frontend" | "backend" | "fullstack" | "data" | "infra" | "docs";

export type ProjectPhase = "greenfield" | "iteration" | "refactor" | "bugfix";

export interface RouteHint {
  /** Which command this hint applies to. */
  command: string;
  /** Short machine-readable tag for the hint. */
  tag: string;
  /** Human-readable description of the behavioral adjustment. */
  description: string;
  /** Origin of this hint. Defaults to 'taskType' when serialized. */
  source?: "taskType" | "projectPhase" | "workNature" | "intent";
}
