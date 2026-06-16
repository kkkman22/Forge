/**
 * Tests for triage MCP adapter — stub contract + graceful degradation shape.
 *
 * NOTE: The adapter is currently a stub (returns null, awaiting real MCP
 * wiring). These tests pin the *stub contract* — that the public surface
 * (option shapes, tool-name mapping, return-null-on-unavailable) is stable
 * for the triage skill to code against. The multi-source degradation chain
 * (parallel fetch, per-source skip, full git fallback) is orchestrated by
 * the triage skill instructions, not by this adapter, and is exercised
 * end-to-end via `/forge triage`, not here.
 *
 * **Pins: loop-engineering-adoption R2 adapter contract.**
 */
export {};
