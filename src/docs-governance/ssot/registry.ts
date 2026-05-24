import type { Config, DiagnosticRecord, DocPath, SsotRegistryEntry } from "../types.js";

const RESERVED_PREFIXES = ["internal-", "debug-", "forge-meta-"] as const;

const DEFAULT_SSOT_ENTRIES: readonly SsotRegistryEntry[] = [
  { topic: "commands", source: "docs/_ssot/commands.json", renderer: "commands-table" },
  { topic: "routing", source: "docs/_ssot/routing.json", renderer: "routing-table" },
  { topic: "security-tiers", source: "docs/_ssot/security-tiers.json", renderer: "security-tiers" },
  { topic: "gate-skills", source: "docs/_ssot/gate-skills.json", renderer: "json-list" },
];

function hasReservedPrefix(topic: string): string | false {
  for (const prefix of RESERVED_PREFIXES) {
    if (topic.startsWith(prefix)) return prefix;
  }
  return false;
}

function diag(
  severity: DiagnosticRecord["severity"],
  message: string,
  code?: string,
): DiagnosticRecord {
  return {
    script: "ssot-registry",
    severity,
    file: "" as DocPath,
    message,
    code,
  };
}

export function loadSsotRegistry(
  config: Config,
  knownRenderers?: ReadonlySet<string>,
): { entries: SsotRegistryEntry[]; diagnostics: DiagnosticRecord[] } {
  const diagnostics: DiagnosticRecord[] = [];
  const raw = config.docs.ssot_sources;

  // Missing / empty → defaults + warning
  if (!raw || !Array.isArray(raw) || raw.length === 0) {
    diagnostics.push(
      diag(
        "warning",
        "No ssot_sources configured; using 4 default entries",
        "SSOT_DEFAULT_FALLBACK",
      ),
    );
    return { entries: [...DEFAULT_SSOT_ENTRIES], diagnostics };
  }

  const entries: SsotRegistryEntry[] = [];
  const seenTopics = new Set<string>();

  for (const item of raw) {
    // Reserved prefix check
    const reserved = hasReservedPrefix(item.topic);
    if (reserved) {
      diagnostics.push(
        diag(
          "error",
          `Topic "${item.topic}" uses reserved prefix "${reserved}"`,
          "SSOT_RESERVED_PREFIX",
        ),
      );
      continue;
    }

    // Duplicate check
    if (seenTopics.has(item.topic)) {
      diagnostics.push(
        diag(
          "error",
          `duplicate topic "${item.topic}" — first occurrence kept`,
          "SSOT_DUPLICATE_TOPIC",
        ),
      );
      continue;
    }
    seenTopics.add(item.topic);

    // Renderer validation (only when registry provided)
    if (knownRenderers && !knownRenderers.has(item.renderer)) {
      diagnostics.push(
        diag(
          "error",
          `Renderer "${item.renderer}" for topic "${item.topic}" is not registered`,
          "SSOT_UNKNOWN_RENDERER",
        ),
      );
      continue;
    }

    entries.push(item);
  }

  return { entries, diagnostics };
}
