import type { DocPath, RenderInput, RenderResult } from "../../types.js";

interface TierEntry {
  level: number;
  name: string;
  capabilities: string[];
  constraints: string[];
}

export function securityTiersRenderer(input: RenderInput): RenderResult {
  const source = input.source as TierEntry[];
  if (!Array.isArray(source)) {
    return {
      markdown: "",
      diagnostics: [
        {
          script: "security-tiers",
          severity: "error",
          file: "" as DocPath,
          message: "Source must be an array",
        },
      ],
    };
  }

  // Deduplicate by level, sort by level ascending
  const seen = new Set<number>();
  const unique: TierEntry[] = [];
  for (const item of source) {
    const level = Number(item.level ?? 0);
    if (!seen.has(level)) {
      seen.add(level);
      unique.push({
        level,
        name: String(item.name ?? ""),
        capabilities: Array.isArray(item.capabilities) ? item.capabilities.map(String) : [],
        constraints: Array.isArray(item.constraints) ? item.constraints.map(String) : [],
      });
    }
  }
  unique.sort((a, b) => a.level - b.level);

  if (unique.length === 0) {
    return { markdown: "_No security tiers._", diagnostics: [] };
  }

  const lines: string[] = [];
  for (const tier of unique) {
    lines.push(`### Level ${tier.level}: ${tier.name}`);
    lines.push("");
    lines.push("**Capabilities:**");
    for (const cap of tier.capabilities) {
      lines.push(`- ${cap}`);
    }
    lines.push("");
    lines.push("**Constraints:**");
    for (const con of tier.constraints) {
      lines.push(`- ${con}`);
    }
    lines.push("");
  }

  return { markdown: lines.join("\n").trimEnd(), diagnostics: [] };
}
