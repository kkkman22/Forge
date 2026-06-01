/**
 *
 * Computes delay seconds based on tier and failure count, selects
 * between ScheduleWakeup (cache-warm) and CronCreate (cache-cold)
 * based on the Anthropic prompt cache 5-minute TTL boundary.
 *
 */
import type { Tier } from "./phase-transitions.js";
/** Scheduler method selection. */
export type SchedulerMethod = "ScheduleWakeup" | "CronCreate";
/** Scheduling decision context. */
export interface SchedulingContext {
    method: SchedulerMethod;
    delaySeconds: number;
    reason: string;
}
/** Maximum scheduling delay (1 hour). */
export declare const MAX_DELAY_SECONDS = 3600;
/**
 * Get the base delay for a tier (no failures).
 */
export declare function getBaseDelay(tier: Tier): number;
/**
 * Compute delay in seconds with linear backoff based on failure count.
 *
 * Formula: `baseDelay × (1 + failureCount)`, capped at MAX_DELAY_SECONDS.
 */
export declare function computeDelay(tier: Tier, consecutiveFailures: number): number;
/**
 * Select the optimal scheduler based on delay duration.
 *
 * - ≤ 300s → ScheduleWakeup (stays within cache TTL)
 * - \> 300s → CronCreate (accepts cache miss for longer waits)
 */
export declare function selectScheduler(delaySeconds: number): {
    method: SchedulerMethod;
};
/**
 * Convert a delay in seconds to a 5-field cron interval expression.
 */
export declare function toCronInterval(delaySeconds: number): string;
/**
 * Build a complete scheduling context with method, delay, and reason.
 */
export declare function buildSchedulingContext(tier: Tier, consecutiveFailures: number, phase: string, loopId: string): SchedulingContext;
