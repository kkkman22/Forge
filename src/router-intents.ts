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

// P3-2: import shared type from the leaf module (was from router.js, which
// created a router ↔ intents back-edge).
import type { RouteHint } from "./router-types.js";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANCEL_KEYWORDS = [
  "取消",
  "忽略",
  "不要",
  "跳过",
  "撤销",
  "cancel",
  "skip",
  "no intent",
  "ignore",
];

// ---------------------------------------------------------------------------
// Dictionary parser
// ---------------------------------------------------------------------------

function normalizeWord(word: string): string {
  return word.trim().toLocaleLowerCase();
}

/**
 * Parse an intent dictionary from YAML content string.
 * Validates schema constraints (R3-1 / R3-4 / R3-5 / R3-6).
 *
 * Uses lightweight YAML parsing (no dependency) since the schema is flat
 * key-value with string arrays and objects.
 */
export function parseIntentDictionary(yamlContent: string): IntentDefinition[] {
  if (!yamlContent?.trim()) {
    throw new Error("Intent dictionary is empty");
  }

  const definitions: IntentDefinition[] = [];
  const triggerRegistry = new Map<string, string>();

  // Split into intent blocks (top-level keys ending with `:`)
  const lines = yamlContent.split("\n");
  let currentName: string | null = null;
  let currentDesc = "";
  let currentTriggers: string[] = [];
  let currentHints: { command: string; tag: string; description: string }[] = [];
  let inTriggers = false;
  let inHints = false;

  for (const rawLine of lines) {
    const line = rawLine;

    // Detect top-level intent key (no leading space, ends with `:`)
    const topLevelMatch = line.match(/^([a-z][a-z0-9-]*):\s*$/);
    if (topLevelMatch) {
      // Flush previous intent
      if (currentName !== null) {
        definitions.push(flushIntent(currentName, currentDesc, currentTriggers, currentHints));
      }
      currentName = topLevelMatch[1];
      currentDesc = "";
      currentTriggers = [];
      currentHints = [];
      inTriggers = false;
      inHints = false;
      continue;
    }

    if (currentName === null) continue;

    // Detect description field
    const descMatch = line.match(/^\s+description:\s*["']?(.+?)["']?\s*$/);
    if (descMatch) {
      currentDesc = descMatch[1];
      inTriggers = false;
      inHints = false;
      continue;
    }

    // Detect triggers array start
    if (/^\s+triggers:\s*$/.test(line)) {
      inTriggers = true;
      inHints = false;
      continue;
    }

    // Detect emit_hints array start
    if (/^\s+emit_hints:\s*$/.test(line)) {
      inTriggers = false;
      inHints = true;
      continue;
    }

    // Parse trigger items
    if (inTriggers) {
      const triggerMatch = line.match(/^\s+-\s+(.+)$/);
      if (triggerMatch) {
        currentTriggers.push(normalizeWord(triggerMatch[1]));
        continue;
      }
      // If not a list item, we've left the triggers block
      inTriggers = false;
    }

    // Parse hint items
    if (inHints) {
      const hintMatch = line.match(
        /^\s+-\s*\{\s*command:\s*(\S+)\s*,\s*tag:\s*(\S+)\s*,\s*description:\s*["'](.+?)["']\s*\}\s*$/,
      );
      if (hintMatch) {
        currentHints.push({
          command: hintMatch[1],
          tag: hintMatch[2],
          description: hintMatch[3],
        });
        continue;
      }
      // If not a hint item, we've left the hints block
      inHints = false;
    }
  }

  // Flush last intent
  if (currentName !== null) {
    definitions.push(flushIntent(currentName, currentDesc, currentTriggers, currentHints));
  }

  if (definitions.length === 0) {
    throw new Error("No intent definitions found in dictionary");
  }

  // R6-1: Soft warning when dictionary exceeds 8 intents
  if (definitions.length > 8) {
    process.stderr.write(
      `[intent_dict_warning] Dictionary has ${definitions.length} intents (threshold: 8). Consider merging or retiring low-usage entries.\n`,
    );
  }

  // R6-2: Soft warning when single intent has > 20 triggers
  for (const def of definitions) {
    if (def.triggers.length > 20) {
      process.stderr.write(
        `[intent_dict_warning] Intent "${def.name}" has ${def.triggers.length} triggers (threshold: 20). Consider splitting.\n`,
      );
    }
  }

  // Validate duplicate triggers (R3-4)
  for (const def of definitions) {
    for (const trigger of def.triggers) {
      const existing = triggerRegistry.get(trigger);
      if (existing) {
        throw new Error(
          `Duplicate trigger "${trigger}" found in intents "${existing}" and "${def.name}"`,
        );
      }
      triggerRegistry.set(trigger, def.name);
    }
  }

  return definitions;
}

function flushIntent(
  name: string,
  description: string,
  triggers: string[],
  emit_hints: { command: string; tag: string; description: string }[],
): IntentDefinition {
  if (triggers.length === 0) {
    throw new Error(`Intent "${name}": triggers must not be empty (R3-5)`);
  }
  if (emit_hints.length === 0) {
    throw new Error(`Intent "${name}": emit_hints must not be empty (R3-6)`);
  }
  return {
    name,
    description,
    triggers: Object.freeze(triggers),
    emit_hints: Object.freeze(emit_hints),
  };
}

// ---------------------------------------------------------------------------
// Intent matching
// ---------------------------------------------------------------------------

/**
 * Match intents against a task description using case-insensitive,
 * NFC-normalized whole-word matching (R3-2).
 */
export function matchIntents(
  description: string,
  dictionary: readonly IntentDefinition[],
): readonly IntentDefinition[] {
  if (!description) return [];

  const normalized = description.toLocaleLowerCase();

  // Collect (firstPosition, intent) pairs, then sort by position
  const hits: { pos: number; intent: IntentDefinition }[] = [];
  const seen = new Set<string>();

  for (const intent of dictionary) {
    for (const trigger of intent.triggers) {
      const triggerNorm = trigger.toLocaleLowerCase();
      const pos = findWholeWordMatch(normalized, triggerNorm);
      if (pos !== -1 && !seen.has(intent.name)) {
        hits.push({ pos, intent });
        seen.add(intent.name);
        break;
      }
    }
  }

  hits.sort((a, b) => a.pos - b.pos);
  return hits.map((h) => h.intent);
}

function isWholeWordMatch(text: string, word: string): boolean {
  return findWholeWordMatch(text, word) !== -1;
}

function findWholeWordMatch(text: string, word: string): number {
  const idx = text.indexOf(word);
  if (idx === -1) return -1;

  const before = idx === 0 ? "" : text[idx - 1];
  const after = idx + word.length >= text.length ? "" : text[idx + word.length];

  const isWordChar = (ch: string) => /[\p{L}\p{N}_]/u.test(ch);
  const isCJK = (ch: string) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(ch);

  // For CJK characters on the boundary, don't enforce word boundaries
  // (CJK doesn't use spaces; characters naturally form word boundaries).
  // For Latin/numeric boundaries, enforce whole-word matching to prevent
  // "ultrathink" matching inside "ultrathinking".
  const firstChar = word[0] ?? "";
  const lastChar = word[word.length - 1] ?? "";

  const boundaryBeforeOk = idx === 0 || isCJK(firstChar) || !isWordChar(before);
  const boundaryAfterOk = idx + word.length >= text.length || isCJK(lastChar) || !isWordChar(after);

  if (boundaryBeforeOk && boundaryAfterOk) return idx;
  return -1;
}

// ---------------------------------------------------------------------------
// Intent → RouteHint conversion
// ---------------------------------------------------------------------------

/**
 * Convert matched intents to RouteHint[] with source='intent'.
 * Does not filter by reachability — caller handles that.
 */
export function intentsToHints(matched: readonly IntentDefinition[]): RouteHint[] {
  const hints: RouteHint[] = [];
  for (const intent of matched) {
    for (const eh of intent.emit_hints) {
      hints.push({
        command: eh.command,
        tag: eh.tag,
        description: eh.description,
        source: "intent",
      });
    }
  }
  return hints;
}

// ---------------------------------------------------------------------------
// Intent cancellation detection
// ---------------------------------------------------------------------------

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
export function detectIntentCancellation(
  userResponse: string,
  knownIntents: readonly string[],
): CancellationResult {
  if (!userResponse) return { cancelAll: false, cancelByName: [] };

  const normalized = userResponse.toLocaleLowerCase().trim();

  // Check for cancel keywords
  const hasCancelKeyword = CANCEL_KEYWORDS.some((kw) => {
    const kwNorm = kw.toLocaleLowerCase();
    return isWholeWordMatch(normalized, kwNorm);
  });

  if (!hasCancelKeyword) {
    return { cancelAll: false, cancelByName: [] };
  }

  // Check for specific intent names in the response
  const namedCancellations: string[] = [];
  for (const intentName of knownIntents) {
    if (isWholeWordMatch(normalized, intentName.toLocaleLowerCase())) {
      namedCancellations.push(intentName);
    }
  }

  if (namedCancellations.length > 0) {
    return { cancelAll: false, cancelByName: namedCancellations };
  }

  return { cancelAll: true, cancelByName: [] };
}
