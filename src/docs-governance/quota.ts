import type { Config, DiagnosticRecord, DocPath } from "./types.js";

export interface QuotaOptions {
  allowGrow?: string;
}

export function countDocPairs(files: string[]): {
  count: number;
  distribution: Record<string, number>;
} {
  // Exclude INDEX*.md, README.md, .mdx
  const excluded = (name: string) =>
    name.startsWith("INDEX") || name === "README.md" || name.endsWith(".mdx");

  const filtered = files.filter((f) => {
    const parts = f.split("/");
    const name = parts[parts.length - 1];
    return !excluded(name);
  });

  // Pair by slug (strip .md / .en.md)
  const seen = new Map<string, number>();
  for (const f of filtered) {
    const parts = f.split("/");
    const name = parts[parts.length - 1];
    const slug = name.replace(/\.en\.md$/, "").replace(/\.md$/, "");
    if (!seen.has(slug)) {
      seen.set(slug, 1);
    }
  }

  const distribution: Record<string, number> = {};
  for (const f of filtered) {
    const parts = f.split("/");
    const dir = parts.slice(0, -1).join("/") || "docs";
    distribution[dir] = (distribution[dir] ?? 0) + 1;
  }

  return { count: seen.size, distribution };
}

export function checkQuota(
  files: string[],
  config: Config,
  options?: QuotaOptions,
): DiagnosticRecord[] {
  const diags: DiagnosticRecord[] = [];
  const { count } = countDocPairs(files);
  const maxCount = config.docs.max_count;

  if (count >= maxCount) {
    if (options?.allowGrow) {
      // Must be a path under .tinkerman/decisions/
      const adrPath = options.allowGrow;
      if (!adrPath.startsWith(".tinkerman/decisions/") || !adrPath.endsWith(".md")) {
        diags.push({
          script: "check-docs-quota",
          severity: "error",
          file: ".tinkerman/config.md" as DocPath,
          message: `--allow-grow requires a valid ADR path under .tinkerman/decisions/, got: ${adrPath}`,
          code: "QUOTA_ALLOW_GROW_NO_ADR",
        });
      }
      // With valid ADR, allow growth but warn
      diags.push({
        script: "check-docs-quota",
        severity: "warning",
        file: ".tinkerman/config.md" as DocPath,
        message: `Doc count ${count} exceeds quota ${maxCount}, but --allow-grow is active with ADR`,
      });
    } else {
      diags.push({
        script: "check-docs-quota",
        severity: "error",
        file: ".tinkerman/config.md" as DocPath,
        message: `Doc count ${count} >= max_count ${maxCount}. Use --allow-grow with an ADR to raise the limit.`,
        code: "QUOTA_EXCEEDED",
      });
    }
  } else if (count === maxCount - 1) {
    diags.push({
      script: "check-docs-quota",
      severity: "warning",
      file: ".tinkerman/config.md" as DocPath,
      message: `Doc count ${count} is 1 below max_count ${maxCount}. Approaching limit.`,
    });
  }

  return diags;
}
