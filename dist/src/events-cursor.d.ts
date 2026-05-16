export type PhaseType = "plan" | "build" | "review" | "test" | "ship" | "learn" | "decide" | "spec" | "debug";
export interface PhaseStartEvent {
    type: "phase_start";
    ts: string;
    phase: PhaseType;
    iteration: number;
    session_id: string;
    wall_clock_elapsed_seconds: number;
    token_budget_used: number;
}
export interface PhaseEndEvent {
    type: "phase_end";
    ts: string;
    phase: PhaseType;
    iteration: number;
    session_id: string;
    exit_code: number;
    wall_clock_elapsed_seconds: number;
    token_budget_used: number;
}
export type PhaseEvent = PhaseStartEvent | PhaseEndEvent;
export declare function parseEventsNdjson(content: string): PhaseEvent[];
export declare function extractLatestCursor(events: PhaseEvent[]): PhaseEvent | undefined;
