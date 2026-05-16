type PhaseType =
  | "plan"
  | "build"
  | "review"
  | "test"
  | "ship"
  | "learn"
  | "decide"
  | "spec"
  | "debug";

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

const VALID_PHASES = new Set<string>([
  "plan",
  "build",
  "review",
  "test",
  "ship",
  "learn",
  "decide",
  "spec",
  "debug",
]);

export function parseEventsNdjson(content: string): PhaseEvent[] {
  const events: PhaseEvent[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (!isValidEvent(parsed)) continue;
    events.push(parsed as PhaseEvent);
  }

  return events;
}

function isValidEvent(obj: unknown): boolean {
  if (typeof obj !== "object" || obj === null) return false;
  const e = obj as Record<string, unknown>;

  if (e.type !== "phase_start" && e.type !== "phase_end") return false;
  if (typeof e.ts !== "string") return false;
  if (!VALID_PHASES.has(e.phase as string)) return false;
  if (typeof e.iteration !== "number") return false;
  if (typeof e.session_id !== "string" || !(e.session_id as string)) return false;
  if (typeof e.wall_clock_elapsed_seconds !== "number") return false;
  if (typeof e.token_budget_used !== "number") return false;

  if (e.type === "phase_end" && typeof e.exit_code !== "number") return false;

  return true;
}

export function extractLatestCursor(events: PhaseEvent[]): PhaseEvent | undefined {
  if (events.length === 0) return undefined;
  return events[events.length - 1];
}
