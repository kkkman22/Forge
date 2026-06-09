import type { DocPath, RenderInput, RenderResult } from "../../types.js";

interface RoutingEntry {
  key?: string;
  tier: string;
  tier_zh?: string;
  condition: string;
  condition_zh?: string;
  sequence: string[];
}

export function routingTableRenderer(input: RenderInput): RenderResult {
  const source = input.source as RoutingEntry[];
  if (!Array.isArray(source)) {
    return {
      markdown: "",
      diagnostics: [
        {
          script: "routing-table",
          severity: "error",
          file: "" as DocPath,
          message: "Source must be an array",
        },
      ],
    };
  }

  const unique = dedupPreserveOrder(source, (e) => e.key ?? e.tier);

  if (unique.length === 0) {
    return { markdown: "_No routing entries._", diagnostics: [] };
  }

  const locale = input.args.locale === "zh" ? "zh" : "en";
  const headers =
    locale === "zh"
      ? ["| 档位 | 判定条件 | 命令序列 |", "|------|---------|----------|"]
      : ["| Tier | Condition | Command Sequence |", "|---|---|---|"];
  const lines = [
    ...headers,
    ...unique.map((e) => {
      const tier = locale === "zh" ? (e.tier_zh ?? e.tier) : e.tier;
      const condition = locale === "zh" ? (e.condition_zh ?? e.condition) : e.condition;
      return `| **${tier}** | ${condition} | \`${e.sequence.join(" → ")}\` |`;
    }),
  ];

  return { markdown: lines.join("\n"), diagnostics: [] };
}

function dedupPreserveOrder<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }
  return unique;
}
