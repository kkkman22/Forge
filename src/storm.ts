/**
 * Storm — Event Storming session state management for forge-storm skill.
 *
 * Manages loading, saving, and serialization of Event Storming state stored
 * as Markdown files with YAML frontmatter.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PHASE_ORDER: StormState["phaseCompleted"][] = [
  "none",
  "events",
  "commands",
  "aggregates",
  "policies",
  "read_models",
];

const SECTION_KEYS = ["events", "commands", "aggregates", "policies", "readModels"] as const;

const SECTION_HEADERS: Record<string, string> = {
  events: "## Events",
  commands: "## Commands",
  aggregates: "## Aggregates",
  policies: "## Policies",
  readModels: "## Read Models",
};

// ---------------------------------------------------------------------------
// nextPhase
// ---------------------------------------------------------------------------

export function nextPhase(
  current: StormState["phaseCompleted"],
): StormState["phaseCompleted"] | null {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx < 0 || idx >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

// ---------------------------------------------------------------------------
// serializeStormMarkdown
// ---------------------------------------------------------------------------

export function serializeStormMarkdown(state: StormState): string {
  const lines: string[] = [];

  // YAML frontmatter
  lines.push("---");
  lines.push(`context: ${state.context}`);
  lines.push(`started_at: "${state.startedAt}"`);
  lines.push(`last_updated: "${state.lastUpdated}"`);
  lines.push(`phase_completed: ${state.phaseCompleted}`);
  lines.push("---");

  // Sections
  for (const key of SECTION_KEYS) {
    const header = SECTION_HEADERS[key];
    const items = state.items[key];
    lines.push("");
    lines.push(header);
    for (const item of items) {
      let line = `- **${item.name}** — ${item.description}`;
      if (item.source) {
        line += ` (source: ${item.source})`;
      }
      lines.push(line);
    }
  }

  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// saveStormState
// ---------------------------------------------------------------------------

export function saveStormState(state: StormState, filePath: string): void {
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  if (dir) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, serializeStormMarkdown(state), "utf8");
}

// ---------------------------------------------------------------------------
// loadStormState
// ---------------------------------------------------------------------------

export function loadStormState(filePath: string): StormState | null {
  if (!existsSync(filePath)) return null;

  const content = readFileSync(filePath, "utf8");
  return parseStormMarkdown(content);
}

// ---------------------------------------------------------------------------
// Internal: parse storm markdown
// ---------------------------------------------------------------------------

function parseStormMarkdown(content: string): StormState {
  // Extract YAML frontmatter
  const firstDash = content.indexOf("---");
  const secondDash = content.indexOf("---", firstDash + 3);
  const yamlBlock = content.slice(firstDash + 3, secondDash).trim();

  const context = extractYamlValue(yamlBlock, "context");
  const startedAt = extractYamlValue(yamlBlock, "started_at").replace(/^"|"$/g, "");
  const lastUpdated = extractYamlValue(yamlBlock, "last_updated").replace(/^"|"$/g, "");
  const phaseCompleted = extractYamlValue(
    yamlBlock,
    "phase_completed",
  ) as StormState["phaseCompleted"];

  const body = content.slice(secondDash + 3);

  const items = {
    events: parseSection(body, "## Events"),
    commands: parseSection(body, "## Commands"),
    aggregates: parseSection(body, "## Aggregates"),
    policies: parseSection(body, "## Policies"),
    readModels: parseSection(body, "## Read Models"),
  };

  return { context, startedAt, lastUpdated, phaseCompleted, items };
}

function extractYamlValue(yaml: string, key: string): string {
  const line = yaml.split("\n").find((l) => l.trimStart().startsWith(`${key}:`));
  if (!line) return "";
  const value = line.substring(line.indexOf(":") + 1).trim();
  return value;
}

function parseSection(body: string, header: string): StormItem[] {
  const headerIdx = body.indexOf(header);
  if (headerIdx < 0) return [];

  const afterHeader = body.slice(headerIdx + header.length);
  // Find the next ## header (if any)
  const nextHeaderMatch = afterHeader.match(/\n## /);
  const sectionText = nextHeaderMatch ? afterHeader.slice(0, nextHeaderMatch.index) : afterHeader;

  const items: StormItem[] = [];
  for (const line of sectionText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- **")) continue;

    // Parse: - **Name** — Description (source: xxx)
    const nameEnd = trimmed.indexOf("**", 4);
    if (nameEnd < 0) continue;
    const name = trimmed.slice(4, nameEnd);

    const rest = trimmed.slice(nameEnd + 2).trim();
    // rest starts with "— " (em dash) or "- " (hyphen-minus dash)
    let descPart = rest;
    // Strip leading dash separator (em dash or hyphen + space)
    const dashMatch = descPart.match(/^[—–-]\s*/);
    if (dashMatch) {
      descPart = descPart.slice(dashMatch[0].length);
    }

    // Check for trailing source
    let source: string | undefined;
    const sourceMatch = descPart.match(/\(source:\s*([^)]+)\)\s*$/);
    if (sourceMatch) {
      source = sourceMatch[1].trim();
      descPart = descPart.slice(0, sourceMatch.index).trim();
    }

    items.push({ name, description: descPart, ...(source ? { source } : {}) });
  }

  return items;
}
