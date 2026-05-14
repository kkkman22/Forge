/**
 * Shared types for cmux-mirror test files.
 *
 * These mirror the shapes produced by `scripts/cmux-mirror/mirror.mjs` and
 * sibling JS modules. Because the production code is JavaScript + JSDoc, we
 * cannot import TS types directly; we redeclare the minimum surface needed
 * for test assertions.
 *
 * Why this file exists: replaces ad-hoc `as any` casts in individual test
 * files with structured types. Do NOT use `any` here — if a field shape is
 * unknown, use `unknown` and narrow at the call site.
 */
export {};
//# sourceMappingURL=types.js.map