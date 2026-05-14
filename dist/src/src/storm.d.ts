/**
 * Storm — Event Storming session state management for forge-storm skill.
 *
 * Manages loading, saving, and serialization of Event Storming state stored
 * as Markdown files with YAML frontmatter.
 */
export interface StormItem {
    name: string;
    description: string;
    source?: string;
}
export interface StormState {
    context: string;
    startedAt: string;
    lastUpdated: string;
    phaseCompleted: "none" | "events" | "commands" | "aggregates" | "policies" | "read_models";
    items: {
        events: StormItem[];
        commands: StormItem[];
        aggregates: StormItem[];
        policies: StormItem[];
        readModels: StormItem[];
    };
}
export declare function nextPhase(current: StormState["phaseCompleted"]): StormState["phaseCompleted"] | null;
export declare function serializeStormMarkdown(state: StormState): string;
export declare function saveStormState(state: StormState, filePath: string): void;
export declare function loadStormState(filePath: string): StormState | null;
