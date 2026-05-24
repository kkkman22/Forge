import type { Category, DocPair } from "../types.js";
import { CATEGORY_VALUES } from "../frontmatter/schema.js";

export const CATEGORY_ORDER = CATEGORY_VALUES;

const CATEGORY_LABELS: Record<Category, string> = {
  "getting-started": "Getting Started",
  "daily-use": "Daily Use",
  advanced: "Advanced",
  troubleshooting: "Troubleshooting",
  contributing: "Contributing",
  reference: "Reference",
  audits: "Audits",
};

export function formatEntry(pair: DocPair): string {
  const fm = pair.cn?.frontmatter ?? pair.en?.frontmatter;
  if (!fm) return "";

  const title = fm.title;
  const updated = fm.updated;

  let links: string;
  if (pair.cn && pair.en) {
    // Paired: show both links
    const cnLink = `[${title}](${pair.cn.path})`;
    const enLink = `[${title} (EN)](${pair.en.path})`;
    links = `${cnLink} / ${enLink}`;
  } else if (pair.cn) {
    links = `[${title}](${pair.cn.path})`;
  } else if (pair.en) {
    links = `[${title}](${pair.en.path})`;
  } else {
    links = title;
  }

  return `- ${links} — ${fm.category} — ${updated}`;
}

export function formatCategoryGroup(category: Category, pairs: DocPair[]): string {
  const label = CATEGORY_LABELS[category];
  const entries = pairs.map(formatEntry).filter(Boolean);
  return [`## ${label}`, "", ...entries].join("\n");
}

export function generateIndexFooter(): string {
  return "由 `scripts/build-docs-index.ts` 生成；请勿手动编辑\n";
}
