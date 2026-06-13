import type { Category, DocPair } from "../types.js";
import { CATEGORY_ORDER, formatCategoryGroup, generateIndexFooter } from "./format.js";

export function buildIndex(pairs: DocPair[]): { cn: string; en: string } {
  // Group by category
  const groups = new Map<Category, DocPair[]>();
  for (const pair of pairs) {
    const fm = pair.cn?.frontmatter ?? pair.en?.frontmatter;
    if (!fm) continue;
    const cat = fm.category;
    const existing = groups.get(cat) ?? [];
    existing.push(pair);
    groups.set(cat, existing);
  }

  // Sort within each group by title (unicode code points), then by path
  for (const [cat, g] of groups) {
    g.sort((a, b) => {
      const titleA = a.cn?.frontmatter?.title ?? a.en?.frontmatter?.title ?? "";
      const titleB = b.cn?.frontmatter?.title ?? b.en?.frontmatter?.title ?? "";
      const cmp = titleA < titleB ? -1 : titleA > titleB ? 1 : 0;
      if (cmp !== 0) return cmp;
      const pathA = a.cn?.path ?? a.en?.path ?? "";
      const pathB = b.cn?.path ?? b.en?.path ?? "";
      return pathA < pathB ? -1 : pathA > pathB ? 1 : 0;
    });
    groups.set(cat, g);
  }

  // Build output in fixed category order, omitting empty groups
  const sections: string[] = [];
  for (const cat of CATEGORY_ORDER) {
    const g = groups.get(cat);
    if (!g || g.length === 0) continue;
    sections.push(formatCategoryGroup(cat, g));
  }

  const cn = `[English Version](./INDEX.en.md)\n\n${sections.join("\n\n")}\n\n${generateIndexFooter()}`;

  // Generate English version (INDEX.en.md)
  const en = buildEnglishIndex(groups);

  return { cn, en };
}

function buildEnglishIndex(groups: Map<Category, DocPair[]>): string {
  const sections: string[] = [];
  for (const cat of CATEGORY_ORDER) {
    const g = groups.get(cat);
    if (!g || g.length === 0) continue;
    const entries = g.map((pair) => formatEnglishEntry(pair)).filter(Boolean);
    const label = catLabelEn(cat);
    sections.push([`## ${label}`, "", ...entries].join("\n"));
  }
  return `[← INDEX (中文)](./INDEX.md)\n\n${sections.join("\n\n")}\n\n${generateIndexFooter()}`;
}

function formatEnglishEntry(pair: DocPair): string {
  const fm = pair.cn?.frontmatter ?? pair.en?.frontmatter;
  if (!fm) return "";
  const title = fm.title;
  const updated = fm.updated;

  let links: string;
  if (pair.cn && pair.en) {
    // EN first, then CN
    const enLink = `[${title} (EN)](${pair.en.path})`;
    const cnLink = `[${title} (中)](${pair.cn.path})`;
    links = `${enLink} / ${cnLink}`;
  } else if (pair.en) {
    links = `[${title}](${pair.en.path})`;
  } else if (pair.cn) {
    links = `[${title}](${pair.cn.path})`;
  } else {
    links = title;
  }

  return `- ${links} — ${updated}`;
}

export function catLabelEn(cat: Category): string {
  const labels: Record<Category, string> = {
    "getting-started": "Getting Started",
    "daily-use": "Daily Use",
    advanced: "Advanced",
    troubleshooting: "Troubleshooting",
    contributing: "Contributing",
    reference: "Reference",
    audits: "Audits",
  };
  return labels[cat];
}
