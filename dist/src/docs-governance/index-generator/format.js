import { CATEGORY_VALUES } from "../frontmatter/schema.js";
export const CATEGORY_ORDER = CATEGORY_VALUES;
const CATEGORY_LABELS = {
    "getting-started": "Getting Started",
    "daily-use": "Daily Use",
    advanced: "Advanced",
    troubleshooting: "Troubleshooting",
    contributing: "Contributing",
    reference: "Reference",
    audits: "Audits",
};
export function formatEntry(pair) {
    const fm = pair.cn?.frontmatter ?? pair.en?.frontmatter;
    if (!fm)
        return "";
    const title = fm.title;
    const updated = fm.updated;
    let links;
    if (pair.cn && pair.en) {
        // Paired: show both links
        const cnLink = `[${title}](${pair.cn.path})`;
        const enLink = `[${title} (EN)](${pair.en.path})`;
        links = `${cnLink} / ${enLink}`;
    }
    else if (pair.cn) {
        links = `[${title}](${pair.cn.path})`;
    }
    else if (pair.en) {
        links = `[${title}](${pair.en.path})`;
    }
    else {
        links = title;
    }
    return `- ${links} — ${fm.category} — ${updated}`;
}
export function formatCategoryGroup(category, pairs) {
    const label = CATEGORY_LABELS[category];
    const entries = pairs.map(formatEntry).filter(Boolean);
    return [`## ${label}`, "", ...entries].join("\n");
}
export function generateIndexFooter() {
    return "由 `scripts/build-docs-index.ts` 生成；请勿手动编辑\n";
}
//# sourceMappingURL=format.js.map