/** SDK Driver — thin orchestrating shell that delegates to extracted modules. */
import type { EffectExecutorInterface } from "./effect-executor.js";
import type { AgentInterface } from "./loop-types.js";
export type { SdkDriverConfig, SdkDriverResult } from "./sdk-driver-types.js";
export { validateHooksPresence } from "./sdk-hooks-validation.js";
export { detectSkillAwareMode } from "./sdk-skill-detection.js";
import type { SdkDriverConfig, SdkDriverResult } from "./sdk-driver-types.js";
/**
 * Core autonomous loop driver — bridges the state machine with real I/O.
 * @public
 */
export declare class SdkDriver {
    private readonly config;
    private readonly effectExecutor;
    private readonly agentAdapter;
    private orchestratorState;
    private notesDocument;
    private notesContent;
    /** The most recent set of effects from the last transition. */
    private lastEffects;
    /** AbortController for the current iteration's agent invocation. */
    private currentAbortController;
    /** Flag indicating requestStop() has been called. */
    private stopRequested;
    /** Cleanup promise from requestStop(), awaitable by callers. */
    private stopPromise;
    /** Counter for consecutive review-fix loop iterations (skill-aware mode). */
    private reviewFixAttempts;
    /** Tracks whether the loop completed normally (SkillScheduler returned "completed"). */
    private loopCompletedNormally;
    /** PUA state manager (only instantiated when puaEnabled is true). */
    private readonly puaStateManager;
    /** StatusFile I/O interface for delegating to helper functions. */
    private readonly statusFileIO;
    /** Structured logger for observability. */
    private readonly logger;
    /** Performance tracker for iteration/subagent timing and degradation detection. */
    private readonly perfTracker;
    /** Events_NDJSON log path (cmux integration). */
    private readonly eventsPath;
    constructor(config: SdkDriverConfig, effectExecutor: EffectExecutorInterface, agentAdapter: AgentInterface);
    /** Translation helper — falls back to key when no t() is configured. */
    private t;
    /** Append an event to the NDJSON log (cmux integration). */
    private emitEvent;
    /** Run the autonomous loop until a termination condition is met. */
    run(): Promise<SdkDriverResult>;
    /** Signal the driver to stop gracefully. */
    requestStop(): void;
    /** Returns the cleanup promise from the last requestStop() call. */
    getStopPromise(): Promise<void> | null;
    private isLoopActive;
    /** Check if a specific effect type exists in an effects array. */
    private hasEffect;
    /** Dispatch iteration to skill-aware or generic path. */
    private executeIteration;
    /** Generic iteration — delegates to extracted function. */
    private executeGenericIteration;
    /** Build an IterationContext from current driver state. */
    private buildIterationContext;
    /** Apply state mutations from an extracted iteration function. */
    private applyIterationResult;
    /** Emit commit or rollback event based on iteration result. */
    private emitIterResultEvent;
    /** Skill-aware iteration — delegates to extracted function. */
    private executeSkillAwareIteration;
    /** Build a SkillIterationContext extending the base context. */
    private buildSkillIterationContext;
    private executeEffects;
    /** Write an audit flag file when --force-no-hooks is used. */
    private writeForceNoHooksFlag;
    private buildResult;
}
