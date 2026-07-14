/**
 * Shared session-data types — extracted to break the learn ↔ glossary-hook
 * barrel cycle (P3-2).
 *
 * Previously `SessionData` lived in `learn.ts`, and `glossary-hook.ts`
 * imported it via `import type`. Meanwhile `learn.ts` value-re-exports
 * `renderGlossaryConflictPrompt`/`runGlossaryCheck` from `glossary-hook.ts`,
 * forming a static cycle (benign — the reverse edge is type-only and erased
 * at compile time — but flagged for cleanup). Moving the shared type here
 * removes the back-edge entirely: both modules import from this leaf file,
 * which imports nothing.
 */

/** Raw session artifact paths/strings collected for a single learn pass. */
export interface SessionData {
  decisions?: string[];
  findings?: string[];
  reviews?: string[];
  progress?: string[];
  sessions?: string[];
}
