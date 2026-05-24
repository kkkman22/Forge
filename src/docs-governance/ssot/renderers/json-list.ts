import type { DocPath, RenderInput, RenderResult } from "../../types.js";

interface JsonListEntry {
  label: string;
  value: string | number;
}

export function jsonListRenderer(input: RenderInput): RenderResult {
  const source = input.source as JsonListEntry[];
  if (!Array.isArray(source)) {
    return {
      markdown: "",
      diagnostics: [
        {
          script: "json-list",
          severity: "error",
          file: "" as DocPath,
          message: "Source must be an array",
        },
      ],
    };
  }

  // Deduplicate by label, stable sort by label
  const seen = new Set<string>();
  const unique: JsonListEntry[] = [];
  for (const item of source) {
    const label = String(item.label ?? "");
    if (!seen.has(label)) {
      seen.add(label);
      unique.push({ label, value: item.value });
    }
  }
  unique.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));

  if (unique.length === 0) {
    return { markdown: "_No items._", diagnostics: [] };
  }

  const lines = unique.map((e) => `- **${e.label}**: ${e.value}`);

  return { markdown: lines.join("\n"), diagnostics: [] };
}
