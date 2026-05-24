/**
 * Router Intent Signals — identifies execution preferences from user input.
 *
 * Pure function module, zero IO. Parses an external intent dictionary,
 * matches intents in task descriptions, and converts matches to RouteHint[]
 * with source='intent'.
 *
 * Design constraints (requirements R3):
 *   - Case-insensitive + NFC-normalized whole-word matching
 *   - NO anti-noise / content stripping (R3-3 CI enforced)
 *   - Duplicate trigger across intents = error (R3-4)
 *   - Empty triggers[] or emit_hints[] = error (R3-5 / R3-6)
 */
import type { RouteHint } from "./router.js";
export interface IntentDefinition {
    name: string;
    description: string;
    triggers: readonly string[];
    emit_hints: readonly {
        command: string;
        tag: string;
        description: string;
    }[];
}
/**
 * Parse an intent dictionary from YAML content string.
 * Validates schema constraints (R3-1 / R3-4 / R3-5 / R3-6).
 *
 * Uses lightweight YAML parsing (no dependency) since the schema is flat
 * key-value with string arrays and objects.
 */
export declare function parseIntentDictionary(yamlContent: string): IntentDefinition[];
/**
 * Match intents against a task description using case-insensitive,
 * NFC-normalized whole-word matching (R3-2).
 */
export declare function matchIntents(description: string, dictionary: readonly IntentDefinition[]): readonly IntentDefinition[];
/**
 * Convert matched intents to RouteHint[] with source='intent'.
 * Does not filter by reachability — caller handles that.
 */
export declare function intentsToHints(matched: readonly IntentDefinition[]): RouteHint[];
export interface CancellationResult {
    cancelAll: boolean;
    cancelByName: readonly string[];
}
/**
 * Detect whether the user's confirmation response includes cancellation
 * semantics for intent signals (R5-2 / R5-3).
 *
 * Rules:
 * - Cancel keyword + no intent name → cancelAll = true
 * - Cancel keyword + intent name(s) → cancelByName = [names], cancelAll = false
 * - No cancel keyword → no cancellation
 */
export declare function detectIntentCancellation(userResponse: string, knownIntents: readonly string[]): CancellationResult;
