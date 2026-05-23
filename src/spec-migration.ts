/**
 * Auto migration logic — spec.md → three files.
 *
 * migrateLegacySpec: detects legacy spec.md, splits into three files,
 * renames original to spec.legacy.md, writes migrated_from frontmatter.
 *
 * Validates: Requirements 7, 8, 9
 */

import { existsSync, renameSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { SpecFileFrontmatter, RequirementsDocument, DesignDocument, TasksSeedDocument, EarsClause } from "./spec-bundle.js";
import { renderRequirementsMarkdown, renderDesignMarkdown, renderTasksMarkdown } from "./spec-render.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MigrationResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// migrateLegacySpec
// ---------------------------------------------------------------------------

export function migrateLegacySpec(featureDir: string): MigrationResult {
  const specPath = join(featureDir, "spec.md");
  const reqPath = join(featureDir, "requirements.md");

  // Skip if three files already exist
  if (existsSync(reqPath)) {
    return { success: true, skipped: true };
  }

  // Skip if no legacy spec
  if (!existsSync(specPath)) {
    return { success: true, skipped: true };
  }

  try {
    const specText = readFileSync(specPath, "utf-8");

    // Parse frontmatter
    const fmMatch = specText.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) {
      return { success: false, error: "No YAML frontmatter found" };
    }

    const yaml = fmMatch[1];
    const feature = yaml.match(/feature:\s*(.+)/)?.[1]?.trim() ?? "unknown";
    const status = yaml.match(/status:\s*(.+)/)?.[1]?.trim() ?? "draft";
    const date = yaml.match(/date:\s*(.+)/)?.[1]?.trim() ?? "";

    const body = specText.replace(/^---[\s\S]*?---\n*/, "");

    // Parse sections
    const purpose = extractSection(body, "目的") || extractSection(body, "Introduction") || "";

    // Parse requirements (需求)
    const earsCriteria: EarsClause[] = [];
    const userStories: { title: string; description: string; earsCriteria: EarsClause[] }[] = [];

    const reqRegex = /###\s*需求\s*\d+[:：]\s*(.+)/g;
    let reqMatch: RegExpExecArray | null;
    const reqBlocks: { title: string; start: number }[] = [];

    while ((reqMatch = reqRegex.exec(body)) !== null) {
      reqBlocks.push({ title: reqMatch[1].trim(), start: reqMatch.index });
    }

    for (let i = 0; i < reqBlocks.length; i++) {
      const block = reqBlocks[i];
      const nextStart = reqBlocks[i + 1]?.start ?? body.length;
      const blockText = body.slice(block.start, nextStart);

      const clauses: EarsClause[] = [];
      const lines = blockText.split("\n");
      for (let j = 0; j < lines.length; j++) {
        const line = lines[j].trim();
        const fullMatch = line.match(/^[-*]\s*当\s+(.+?)\s+时\s+系统(?:应当)?\s+(.+)$/);
        if (fullMatch) {
          clauses.push({
            line: j + 1,
            when: fullMatch[1].trim(),
            shall: fullMatch[2].trim(),
            raw: line.replace(/^[-*]\s*/, ""),
          });
          continue;
        }
        const legacyMatch = line.match(/^[-*]\s*当\s+(.+?)\s*则\s+(.+)$/);
        if (legacyMatch) {
          clauses.push({
            line: j + 1,
            when: legacyMatch[1].trim(),
            shall: legacyMatch[2].trim(),
            raw: line.replace(/^[-*]\s*/, ""),
          });
        }
      }

      earsCriteria.push(...clauses);
      userStories.push({ title: block.title, description: "", earsCriteria: clauses });
    }

    // Parse exclusions (不做什么)
    const exclText = extractSection(body, "不做什么") || extractSection(body, "Out of Scope");
    const outOfScope = exclText.split("\n").map((l) => l.replace(/^[-*]\s*/, "").trim()).filter(Boolean);

    // Parse Delta (brownfield)
    let delta: RequirementsDocument["delta"];
    const deltaText = extractSection(body, "Delta");
    if (deltaText) {
      const added = extractListItems(extractSubsection(deltaText, "新增"));
      const modified = extractListItems(extractSubsection(deltaText, "修改"));
      const unchanged = extractListItems(extractSubsection(deltaText, "不变"));
      if (added.length > 0 || modified.length > 0 || unchanged.length > 0) {
        delta = { added, modified, unchanged };
      }
    }

    // Build frontmatter
    const fm: SpecFileFrontmatter = {
      feature,
      status: status as "draft" | "locked",
      date,
      workflow_variant: "requirements-first",
      migrated_from: "spec.md",
      brownfield: !!delta,
    };

    // Build requirements document
    const reqDoc: RequirementsDocument = {
      frontmatter: fm,
      intro: purpose,
      glossary: [],
      userStories,
      earsCriteria,
      nonFunctional: [],
      outOfScope,
      ...(delta ? { delta } : {}),
    };

    // Build design document (minimal — legacy specs don't have design sections)
    const designDoc: DesignDocument = {
      frontmatter: { ...fm },
      overview: `Migrated from spec.md. Original purpose: ${purpose}`,
      architecture: "To be defined during design phase.",
      componentInterfaces: [],
      dataModel: "",
      errorHandling: "",
      testingStrategy: "",
      rollout: "",
      openQuestions: [],
    };

    // Build tasks document (seed from requirements)
    const tasksDoc: TasksSeedDocument = {
      frontmatter: { ...fm, status: "draft" },
      tasks: userStories.map((us, i) => ({
        id: `T-${String(i + 1).padStart(2, "0")}`,
        title: us.title,
        goal: `Implement: ${us.title}`,
        related_requirements: [`Requirement ${i + 1}`],
        status: "pending" as const,
      })),
    };

    // Write three files
    writeFileSync(join(featureDir, "requirements.md"), renderRequirementsMarkdown(reqDoc));
    writeFileSync(join(featureDir, "design.md"), renderDesignMarkdown(designDoc));
    writeFileSync(join(featureDir, "tasks.md"), renderTasksMarkdown(tasksDoc));

    // Rename original
    renameSync(specPath, join(featureDir, "spec.legacy.md"));

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractSection(body: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?:^|\\n)## ${escaped}[ \\t]*\\n([\\s\\S]*?)(?=\\n## |$)`, "");
  const match = body.match(regex);
  return match?.[1]?.trim() ?? "";
}

function extractSubsection(text: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?:^|\\n)### ${escaped}[ \\t]*\\n([\\s\\S]*?)(?=\\n#{2,3} |$)`, "");
  const match = text.match(regex);
  return match?.[1]?.trim() ?? "";
}

function extractListItems(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l.length > 0);
}
