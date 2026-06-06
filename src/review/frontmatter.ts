/**
 * Frontmatter atomic rewrite for review progress files.
 *
 * @module review/frontmatter
 */

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

interface ReviewProgressFrontmatter {
  topic: string;
  reviewers: string[];
  layers_status: Record<string, string>;
  created_at: string | null;
  completed_at: string | null;
  [key: string]: unknown;
}

export function splitFrontmatterAndBody(content: string): {
  fmText: string;
  body: string;
  fm: Record<string, unknown>;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return { fmText: "", body: content, fm: {} };
  }
  const fm = parseYaml(match[1]) ?? {};
  const body = content.slice(match[0].length);
  return { fmText: match[1], body, fm };
}

export function renderWithFrontmatter(fm: Record<string, unknown>, body: string): string {
  const yamlStr = stringifyYaml(fm, { lineWidth: 0 }).trim();
  return `---\n${yamlStr}\n---${body}`;
}

/**
 * Initialize a review progress file with frontmatter (R15.1).
 */
export function initReviewFrontmatter(filePath: string, topic: string, reviewers: string[]): void {
  const layersStatus: Record<string, string> = {};
  for (const r of reviewers) {
    layersStatus[r.replace(/-/g, "_")] = "pending";
  }

  const fm: ReviewProgressFrontmatter = {
    topic,
    reviewers,
    layers_status: layersStatus,
    created_at: new Date().toISOString(),
    completed_at: null,
  };

  const body = "\n\n# Review Report\n";
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, renderWithFrontmatter(fm as unknown as Record<string, unknown>, body));
  renameSync(tmpPath, filePath);
}

/**
 * Update a single layer's status in the review frontmatter (R15.2, R15.3).
 */
export function markLayerStatus(filePath: string, layerName: string, status: string): void {
  atomicUpdateFrontmatter(filePath, (fm) => {
    if (!fm.layers_status) fm.layers_status = {};
    (fm.layers_status as Record<string, string>)[layerName] = status;

    const layers = Object.values(fm.layers_status as Record<string, string>);
    if (layers.length > 0 && layers.every((s) => s === "done")) {
      fm.completed_at = new Date().toISOString();
    }
  });
}

/**
 * Atomically update the YAML frontmatter of a file (R15.4, R15.5).
 */
export function atomicUpdateFrontmatter(
  filePath: string,
  mutator: (fm: Record<string, unknown>) => void,
): void {
  const content = readFileSync(filePath, "utf-8");
  const { fm, body } = splitFrontmatterAndBody(content);

  mutator(fm);

  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, renderWithFrontmatter(fm, body));
  renameSync(tmpPath, filePath);
}
