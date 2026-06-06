/**
 * Error Recovery Strategy — re-exports from sub-modules for backward compatibility.
 *
 * All public exports from sub-modules are re-exported here so existing
 * `import { ... } from "./error-recovery.js"` continues to work unchanged.
 *
 * Sub-modules (extracted for independent testability):
 *   - error-recovery/types.ts            — Type definitions and constants
 *   - error-recovery/git-scanner.ts      — Git commit parsing and matching
 *   - error-recovery/change-detector.ts  — Uncommitted change detection
 *   - error-recovery/reconciler.ts       — Progress and phase reconciliation
 *   - error-recovery/classifier.ts       — Interruption classification
 *   - error-recovery/engine.ts           — Recovery report builder
 *   - error-recovery/serde.ts            — Serialization / deserialization
 */
export * from "./error-recovery/index.js";
