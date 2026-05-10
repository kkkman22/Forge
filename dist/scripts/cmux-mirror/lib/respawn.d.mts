/**
 * Try to consume one respawn unit. Returns true if within budget (R13.12).
 * Atomic: read → check → write via tmp+rename.
 */
export function tryConsumeRespawn(file: any, maxRespawns: any): boolean;
/**
 * Reset respawn counter (R13.13). Called at session boundaries.
 */
export function resetRespawnCount(file: any): void;
