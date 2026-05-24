/**
 * SDK Skill-Aware Iteration — extracted skill-aware iteration logic from SdkDriver.
 *
 * Contains the `executeSkillAwareIteration` standalone async function that was
 * previously the `SdkDriver.executeSkillAwareIteration()` private method (~330 lines).
 *
 * The function accepts a `SkillIterationContext` parameter (bundling all dependencies)
 * and returns a `Promise<IterationResult>` describing the state mutations the
 * caller should apply.
 *
 * Design reference: sdk-driver-decomposition § design.md
 * **Validates: Requirements 4.1, 4.2, 10.6**
 */
import type { IterationResult, SkillIterationContext } from "./sdk-driver-types.js";
/**
 * Read file content via a configured callback.
 * Returns null if no callback is configured or if reading fails.
 */
export declare function readFileContent(reader: (() => string) | undefined): string | null;
/**
 * Execute a single skill-aware iteration of the autonomous loop.
 *
 * This function encapsulates the full lifecycle of one skill-aware iteration:
 * 1. Read StatusFile to determine next skill phase via `determineNextSkill`
 * 2. Restore PUA context when PUA is enabled
 * 3. Build a skill-aware prompt via `buildSkillAwarePrompt`
 * 4. Invoke the agent adapter
 * 5. Evaluate quality gates for the completed phase
 * 6. Dispatch the resulting event to the orchestrator state machine
 * 7. Apply skill-aware commit strategy (replace/remove commit effects)
 * 8. Execute the resulting effects
 * 9. Handle PUA success/failure paths
 * 10. Append the iteration entry to notes and persist
 * 11. Record performance timing
 *
 * All state mutations are tracked locally and returned in the `IterationResult`.
 * The caller (`SdkDriver`) applies them to its private fields.
 *
 * @param ctx - The skill iteration context bundling all dependencies.
 * @returns The iteration result describing state mutations.
 */
export declare function executeSkillAwareIteration(ctx: SkillIterationContext): Promise<IterationResult>;
