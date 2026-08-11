import * as yaml from "yaml";
import type { Config, DiagnosticRecord, DocPath, SsotRegistryEntry } from "./types.js";

const DEFAULT_ROOT_WHITELIST = [
  "README.md",
  "CHANGELOG.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "ROADMAP.md",
  "AGENTS.md",
  "CLAUDE.md",
  "LICENSE.md",
] as const;

const DEFAULT_SSOT_SOURCES: readonly SsotRegistryEntry[] = [
  { topic: "commands", source: "docs/_ssot/commands.json", renderer: "commands-table" },
  {
    topic: "routing",
    source: "docs/_ssot/routing.json",
    renderer: "routing-table",
  },
  {
    topic: "security-tiers",
    source: "docs/_ssot/security-tiers.json",
    renderer: "security-tiers",
  },
  {
    topic: "gate-skills",
    source: "docs/_ssot/gate-skills.json",
    renderer: "json-list",
  },
] as const;

const DEFAULTS = {
  docs: {
    max_count: 30,
    root_whitelist: DEFAULT_ROOT_WHITELIST,
    ssot_sources: DEFAULT_SSOT_SOURCES,
  },
  staleness: {
    warning_days: 90,
    critical_days: 180,
    exempt_paths: ["LICENSE.md", "ROADMAP.md"] as const,
    warning_log_cap: 50,
  },
} as const;

function makeWarning(field: string, reason: string, fallback: string): DiagnosticRecord {
  return {
    script: "config",
    severity: "warning",
    file: ".tinkerman/config.md" as DocPath,
    message: `Field "${field}" ${reason}; falling back to ${fallback}`,
    code: "CONFIG_FIELD_INVALID",
  };
}

function clampInt(
  raw: unknown,
  field: string,
  min: number,
  max: number,
  def: number,
  diags: DiagnosticRecord[],
): number {
  if (raw === undefined || raw === null) return def;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < min || n > max) {
    diags.push(makeWarning(field, `out of range [${min}, ${max}]`, `${def}`));
    return def;
  }
  return n;
}

function toStringArray(
  raw: unknown,
  field: string,
  def: readonly string[],
  diags: DiagnosticRecord[],
): readonly string[] {
  if (!Array.isArray(raw)) {
    diags.push(makeWarning(field, "is not an array", `default ${def.length} items`));
    return def;
  }
  return raw.map(String);
}

function parseSsotSources(raw: unknown, diags: DiagnosticRecord[]): readonly SsotRegistryEntry[] {
  if (!Array.isArray(raw)) {
    diags.push(makeWarning("docs.ssot_sources", "is missing or not an array", "4 default entries"));
    return DEFAULTS.docs.ssot_sources;
  }
  const entries: SsotRegistryEntry[] = [];
  for (const item of raw) {
    if (
      typeof item === "object" &&
      item !== null &&
      typeof (item as Record<string, unknown>).topic === "string" &&
      typeof (item as Record<string, unknown>).source === "string" &&
      typeof (item as Record<string, unknown>).renderer === "string"
    ) {
      const r = item as Record<string, string>;
      // Validate source path: reject absolute and traversal paths
      if (r.source.startsWith("/") || r.source.includes("..")) {
        diags.push(
          makeWarning(
            "docs.ssot_sources",
            `source "${r.source}" is invalid (must be relative, no ..)`,
            "entry skipped",
          ),
        );
        continue;
      }
      entries.push({ topic: r.topic, source: r.source, renderer: r.renderer });
    }
  }
  if (entries.length === 0) {
    diags.push(makeWarning("docs.ssot_sources", "has no valid entries", "4 default entries"));
    return DEFAULTS.docs.ssot_sources;
  }
  return entries;
}

export function loadConfigWithDefaults(raw: string): Config {
  const diags: DiagnosticRecord[] = [];

  if (!raw?.trim()) {
    diags.push(makeWarning("config", "is empty", "all defaults"));
    return {
      docs: { ...DEFAULTS.docs },
      staleness: { ...DEFAULTS.staleness },
      diagnosticsFromConfigLoad: diags,
    };
  }

  let parsed: Record<string, unknown> = {};
  try {
    // Strip optional frontmatter delimiters
    let content = raw;
    if (content.startsWith("---")) {
      const secondDash = content.indexOf("---", 3);
      if (secondDash !== -1) {
        content = content.slice(3, secondDash);
      }
    }
    parsed = yaml.parse(content) ?? {};
  } catch (_err: unknown) {
    diags.push(makeWarning("config", "failed to parse YAML", "all defaults"));
    return {
      docs: { ...DEFAULTS.docs },
      staleness: { ...DEFAULTS.staleness },
      diagnosticsFromConfigLoad: diags,
    };
  }

  const docs = (parsed.docs ?? {}) as Record<string, unknown>;
  const staleness = (parsed.staleness ?? {}) as Record<string, unknown>;

  return {
    docs: {
      max_count: clampInt(
        docs.max_count,
        "docs.max_count",
        1,
        1000,
        DEFAULTS.docs.max_count,
        diags,
      ),
      root_whitelist: toStringArray(
        docs.root_whitelist,
        "docs.root_whitelist",
        DEFAULTS.docs.root_whitelist,
        diags,
      ),
      ssot_sources: parseSsotSources(docs.ssot_sources, diags),
      grace_period_until:
        typeof docs.grace_period_until === "string" ? docs.grace_period_until : undefined,
    },
    staleness: {
      warning_days: clampInt(
        staleness.warning_days,
        "staleness.warning_days",
        1,
        365,
        DEFAULTS.staleness.warning_days,
        diags,
      ),
      critical_days: clampInt(
        staleness.critical_days,
        "staleness.critical_days",
        1,
        730,
        DEFAULTS.staleness.critical_days,
        diags,
      ),
      exempt_paths: toStringArray(
        staleness.exempt_paths,
        "staleness.exempt_paths",
        DEFAULTS.staleness.exempt_paths,
        diags,
      ),
      warning_log_cap: clampInt(
        staleness.warning_log_cap,
        "staleness.warning_log_cap",
        1,
        1000,
        DEFAULTS.staleness.warning_log_cap,
        diags,
      ),
    },
    diagnosticsFromConfigLoad: diags,
  };
}
