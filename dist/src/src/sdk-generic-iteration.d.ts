/**
 * SDK Generic Iteration — extracted non-skill-aware iteration logic from SdkDriver.
 *
 * Contains the `executeGenericIteration` standalone async function that was
 * previously the `SdkDriver.executeGenericIteration()` private method (~210 lines).
 *
 * The function accepts an `IterationContext` parameter (bundling all dependencies)
 * and returns a `Promise<IterationResult>` describing the state mutations the
 * caller should apply.
 *
 * Design reference: sdk-driver-decomposition § design.md
 * **Validates: Requirements 3.1, 3.2, 10.5**
 */
import type { IterationContext, IterationResult } from "./sdk-driver-types.js";
/**
 * Execute a single generic (non-skill-aware) iteration of the autonomous loop.
 *
 * This function encapsulates the full lifecycle of one iteration:
 * 1. Build the iteration prompt from current notes content
 * 2. Invoke the agent adapter
 * 3. Dispatch the resulting event to the orchestrator state machine
 * 4. Execute the resulting effects (commit/rollback, schedule_iteration, etc.)
 * 5. Append the iteration entry to notes and persist
 * 6. Record performance timing
 *
 * All state mutations are tracked locally and returned in the `IterationResult`.
 * The caller (`SdkDriver`) applies them to its private fields.
 *
 * @param ctx - The iteration context bundling all dependencies.
 * @returns The iteration result describing state mutations.
 */
export declare function executeGenericIteration(ctx: IterationContext): Promise<IterationResult>;
