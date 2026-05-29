/**
 * WarmUpRunner — replaces the agent-sdk `startup()` warm-query by spawning
 * `claude --print --output-format stream-json --max-turns 1` with a tiny
 * prompt before the main loop. Triggers session creation, model cold-start,
 * and credentials validation in a one-turn subprocess that does NOT count
 * against the loop's `--max-tokens` budget (Requirement 9.3).
 *
 * Contract:
 *   - 9.1: invoked once before the main loop (caller responsibility)
 *   - 9.2: args contain `--print`, `--output-format=stream-json`,
 *          `--max-turns 1`; tiny prompt frame ≤ 8 chars
 *   - 9.3: writes `<runDir>/warm-up.json`; tokens.input/output baseline 0
 *          (warm-up consumption is NOT deducted from --max-tokens)
 *   - 9.4: non-zero exit / timeout → reject with original stderr; main loop
 *          MUST NOT proceed
 *   - 9.5: caller passes `skip: true` (from `--no-warmup` flag) → skipped
 *
 * See:
 *   - .kiro/specs/workflows-integration/requirements.md §Requirement 9
 *   - src/cli-subprocess-driver.ts (shared CliSpawnRequest type)
 */
import type { ChildProcess } from "node:child_process";
export interface CliSpawnRequest {
    cmd: string;
    args: string[];
    env: Record<string, string>;
    cwd?: string;
}
export interface WarmUpDeps {
    /** Run identifier — recorded in `warm-up.json`. */
    runId: string;
    /** Directory where `warm-up.json` is written (typically `.forge/runs/<runId>/`). */
    runDir: string;
    /** Spawn injection point — lets tests stub child_process. */
    spawn: (req: CliSpawnRequest) => ChildProcess;
    /** Skip warm-up entirely (driven by `--no-warmup` CLI flag). */
    skip?: boolean;
    /** Timeout in ms; defaults to 30_000 per Requirement 9.4. */
    timeoutMs?: number;
}
export interface WarmUpResult {
    skipped: boolean;
    exitCode: number;
    durationMs: number;
    /** Always false — warm-up tokens do not count toward main-loop budget. */
    deductFromBudget: false;
}
export declare function runWarmUp(deps: WarmUpDeps): Promise<WarmUpResult>;
