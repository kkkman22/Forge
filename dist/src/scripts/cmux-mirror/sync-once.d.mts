#!/usr/bin/env node
/**
 * Run a one-shot sync from .forge/ state to cmux (R2.7).
 * Returns { synced: boolean, commandsEmitted: number, reason?: string }.
 */
export function syncOnce({ forgeDir, snapshotDir, }?: {
    forgeDir?: string | undefined;
    snapshotDir?: string | undefined;
}): Promise<{
    synced: boolean;
    commandsEmitted: number;
    reason: string;
} | {
    synced: boolean;
    commandsEmitted: number;
    reason?: undefined;
}>;
/**
 * Check respawn budget and optionally trigger mirror restart (R13.12).
 */
export function syncOnceWithRespawn(opts?: {}): Promise<{
    synced: boolean;
    commandsEmitted: number;
    reason: string;
} | {
    synced: boolean;
    commandsEmitted: number;
    reason?: undefined;
} | {
    respawnRecommended: boolean;
    synced: boolean;
    commandsEmitted: number;
    reason: string;
} | {
    respawnRecommended: boolean;
    synced: boolean;
    commandsEmitted: number;
    reason?: undefined;
}>;
