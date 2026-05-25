import * as yaml from "yaml";
const DEFAULT_ROOT_WHITELIST = [
    "README.md",
    "CHANGELOG.md",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "ROADMAP.md",
    "AGENTS.md",
    "CLAUDE.md",
    "LICENSE.md",
];
const DEFAULT_SSOT_SOURCES = [
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
];
const DEFAULTS = {
    docs: {
        max_count: 30,
        root_whitelist: DEFAULT_ROOT_WHITELIST,
        ssot_sources: DEFAULT_SSOT_SOURCES,
    },
    staleness: {
        warning_days: 90,
        critical_days: 180,
        exempt_paths: ["LICENSE.md", "ROADMAP.md"],
        warning_log_cap: 50,
    },
};
function makeWarning(field, reason, fallback) {
    return {
        script: "config",
        severity: "warning",
        file: ".forge/config.md",
        message: `Field "${field}" ${reason}; falling back to ${fallback}`,
        code: "CONFIG_FIELD_INVALID",
    };
}
function clampInt(raw, field, min, max, def, diags) {
    if (raw === undefined || raw === null)
        return def;
    const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n < min || n > max) {
        diags.push(makeWarning(field, `out of range [${min}, ${max}]`, `${def}`));
        return def;
    }
    return n;
}
function toStringArray(raw, field, def, diags) {
    if (!Array.isArray(raw)) {
        diags.push(makeWarning(field, "is not an array", `default ${def.length} items`));
        return def;
    }
    return raw.map(String);
}
function parseSsotSources(raw, diags) {
    if (!Array.isArray(raw)) {
        diags.push(makeWarning("docs.ssot_sources", "is missing or not an array", "4 default entries"));
        return DEFAULTS.docs.ssot_sources;
    }
    const entries = [];
    for (const item of raw) {
        if (typeof item === "object" &&
            item !== null &&
            typeof item.topic === "string" &&
            typeof item.source === "string" &&
            typeof item.renderer === "string") {
            const r = item;
            // Validate source path: reject absolute and traversal paths
            if (r.source.startsWith("/") || r.source.includes("..")) {
                diags.push(makeWarning("docs.ssot_sources", `source "${r.source}" is invalid (must be relative, no ..)`, "entry skipped"));
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
export function loadConfigWithDefaults(raw) {
    const diags = [];
    if (!raw?.trim()) {
        diags.push(makeWarning("config", "is empty", "all defaults"));
        return {
            docs: { ...DEFAULTS.docs },
            staleness: { ...DEFAULTS.staleness },
            diagnosticsFromConfigLoad: diags,
        };
    }
    let parsed = {};
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
    }
    catch {
        diags.push(makeWarning("config", "failed to parse YAML", "all defaults"));
        return {
            docs: { ...DEFAULTS.docs },
            staleness: { ...DEFAULTS.staleness },
            diagnosticsFromConfigLoad: diags,
        };
    }
    const docs = (parsed.docs ?? {});
    const staleness = (parsed.staleness ?? {});
    return {
        docs: {
            max_count: clampInt(docs.max_count, "docs.max_count", 1, 1000, DEFAULTS.docs.max_count, diags),
            root_whitelist: toStringArray(docs.root_whitelist, "docs.root_whitelist", DEFAULTS.docs.root_whitelist, diags),
            ssot_sources: parseSsotSources(docs.ssot_sources, diags),
            grace_period_until: typeof docs.grace_period_until === "string" ? docs.grace_period_until : undefined,
        },
        staleness: {
            warning_days: clampInt(staleness.warning_days, "staleness.warning_days", 1, 365, DEFAULTS.staleness.warning_days, diags),
            critical_days: clampInt(staleness.critical_days, "staleness.critical_days", 1, 730, DEFAULTS.staleness.critical_days, diags),
            exempt_paths: toStringArray(staleness.exempt_paths, "staleness.exempt_paths", DEFAULTS.staleness.exempt_paths, diags),
            warning_log_cap: clampInt(staleness.warning_log_cap, "staleness.warning_log_cap", 1, 1000, DEFAULTS.staleness.warning_log_cap, diags),
        },
        diagnosticsFromConfigLoad: diags,
    };
}
//# sourceMappingURL=config.js.map