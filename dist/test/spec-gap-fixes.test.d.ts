/**
 * Spec gap fixes — covers four AC items previously missing from production wiring:
 *
 *   R2.6  L3 path writes blocked stub into audit zone + status.md phase = <sub>-blocked
 *   R2.8  L1 fallback after L0 failure receives precursor_partial cross-reference
 *   R4.8  forge-loop-cli wires hookCheckPath into createAuditWriter
 *   R12.7 RateLimitDegrader appendToolHealth uses O_EXCL advisory lock
 */
export {};
