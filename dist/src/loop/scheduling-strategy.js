/**
 *
 * Computes delay seconds based on tier and failure count, selects
 * between ScheduleWakeup (cache-warm) and CronCreate (cache-cold)
 * based on the Anthropic prompt cache 5-minute TTL boundary.
 *
 */
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Base delay per tier (seconds). */
const BASE_DELAY = {
    light: 60,
    standard: 120,
    full: 180,
};
/** Anthropic prompt-cache TTL boundary (5 minutes). */
const CACHE_TTL_SECONDS = 300;
/** Maximum scheduling delay (1 hour). */
export const MAX_DELAY_SECONDS = 3600;
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Get the base delay for a tier (no failures).
 */
export function getBaseDelay(tier) {
    return BASE_DELAY[tier];
}
/**
 * Compute delay in seconds with linear backoff based on failure count.
 *
 * Formula: `baseDelay × (1 + failureCount)`, capped at MAX_DELAY_SECONDS.
 */
export function computeDelay(tier, consecutiveFailures) {
    const base = BASE_DELAY[tier];
    const raw = base * (1 + consecutiveFailures);
    return Math.min(raw, MAX_DELAY_SECONDS);
}
/**
 * Select the optimal scheduler based on delay duration.
 *
 * - ≤ 300s → ScheduleWakeup (stays within cache TTL)
 * - \> 300s → CronCreate (accepts cache miss for longer waits)
 */
export function selectScheduler(delaySeconds) {
    if (delaySeconds <= CACHE_TTL_SECONDS) {
        return { method: "ScheduleWakeup" };
    }
    return { method: "CronCreate" };
}
/**
 * Convert a delay in seconds to a 5-field cron interval expression.
 */
export function toCronInterval(delaySeconds) {
    const minutes = Math.max(1, Math.round(delaySeconds / 60));
    // Exact hour boundary
    if (minutes === 60) {
        return "0 * * * *";
    }
    return `*/${minutes} * * * *`;
}
/**
 * Build a complete scheduling context with method, delay, and reason.
 */
export function buildSchedulingContext(tier, consecutiveFailures, phase, loopId) {
    const delaySeconds = computeDelay(tier, consecutiveFailures);
    const { method } = selectScheduler(delaySeconds);
    const reason = `Loop ${loopId}: next ${phase} iteration after ${delaySeconds}s delay (${consecutiveFailures} failures)`;
    return { method, delaySeconds, reason };
}
//# sourceMappingURL=scheduling-strategy.js.map