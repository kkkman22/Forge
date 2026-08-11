/**
 * Auto migration logic — spec.md → three files.
 *
 * migrateLegacySpec: detects legacy spec.md, splits into three files,
 * renames original to spec.legacy.md, writes migrated_from frontmatter.
 * Also handles .tinkerman/plans/<topic>.md migration.
 * Includes rollback on failure.
 *
 * Validates: Requirements 7, 8, 9
 */

import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeEvent } from "./event-writer.js";
import { analyzeRequirements } from "./spec-analyze.js";
import type {
  DesignDocument,
  EarsClause,
  RequirementsDocument,
  SpecFileFrontmatter,
  TasksSeedDocument,
} from "./spec-bundle.js";
import {
  renderDesignMarkdown,
  renderRequirementsMarkdown,
  renderTasksMarkdown,
} from "./spec-render.js";

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

export function migrateLegacySpec(featureDir: string, eventsPath?: string): MigrationResult {
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

  // Track files written for rollback
  const writtenFiles: string[] = [];
  // Track the actual legacy plans path returned by migratePlansFile so
  // rollback can rename it back regardless of feature/dirname mismatch.
  let plansLegacyRenamed: string | null = null;

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
    const reqBlocks: { title: string; start: number }[] = [];

    for (const reqMatch of body.matchAll(reqRegex)) {
      reqBlocks.push({ title: reqMatch[1].trim(), start: reqMatch.index ?? 0 });
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
    const outOfScope = exclText
      .split("\n")
      .map((l) => l.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);

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
    const reqFile = join(featureDir, "requirements.md");
    const desFile = join(featureDir, "design.md");
    const taskFile = join(featureDir, "tasks.md");

    writeFileSync(reqFile, renderRequirementsMarkdown(reqDoc));
    writtenFiles.push(reqFile);
    writeFileSync(desFile, renderDesignMarkdown(designDoc));
    writtenFiles.push(desFile);
    writeFileSync(taskFile, renderTasksMarkdown(tasksDoc));
    writtenFiles.push(taskFile);

    // Rename original
    renameSync(specPath, join(featureDir, "spec.legacy.md"));

    // Migrate .tinkerman/plans/<feature>.md → .tinkerman/specs/<feature>/tasks.md.
    // Capture the actual renamed path so rollback can restore it accurately
    // even when frontmatter `feature` differs from the directory name.
    plansLegacyRenamed = migratePlansFile(featureDir, feature);

    // P0-only Analyze fallback: if migrated requirements have P0 issues,
    // roll back to legacy state so the user can retry without losing data.
    const analyzeResult = analyzeRequirements(reqDoc);
    const p0Findings = analyzeResult.findings.filter((f) => f.severity === "P0");
    if (p0Findings.length > 0) {
      throw new Error(
        `Post-migration Analyze surfaced ${p0Findings.length} P0 finding(s); rolling back. ` +
          `First issue: ${p0Findings[0].rule} — ${p0Findings[0].message}`,
      );
    }

    return { success: true };
  } catch (err) {
    // Emit failure event
    // REQ-03 (audit-remediate-0619): use a static import instead of require().
    // The previous `require("./event-writer.js")` threw ReferenceError in
    // native ESM at runtime, so the failure event was never emitted.
    if (eventsPath) {
      try {
        writeEvent(eventsPath, "spec_migration_failed", { error: String(err) });
      } catch (_err: unknown) {
        /* best effort */
      }
    }
    // Rollback: delete any written files, restore spec.md if renamed
    for (const f of writtenFiles) {
      try {
        unlinkSync(f);
      } catch (_err: unknown) {
        /* best effort */
      }
    }
    const legacyPath = join(featureDir, "spec.legacy.md");
    if (!existsSync(specPath) && existsSync(legacyPath)) {
      try {
        renameSync(legacyPath, specPath);
      } catch (_err: unknown) {
        /* best effort */
      }
    }
    // Rollback plans file using the actual renamed path captured during
    // forward migration. This is correct even when frontmatter `feature`
    // does not match the directory name (P2-B audit fix).
    if (plansLegacyRenamed && existsSync(plansLegacyRenamed)) {
      try {
        renameSync(plansLegacyRenamed, plansLegacyRenamed.replace(/\.legacy$/, ""));
      } catch (_err: unknown) {
        /* best effort */
      }
    }
    return { success: false, error: String(err) };
  }
}

/**
 * Migrate legacy .tinkerman/plans/<feature>.md to the specs directory.
 * Parses plan task entries and merges them into the generated tasks.md.
 *
 * @returns The path of the renamed `.legacy` plans file (so the caller can
 *   undo the rename during rollback), or `null` when no plans file existed.
 */
function migratePlansFile(featureDir: string, feature: string): string | null {
  // featureDir is .tinkerman/specs/<feature>/, plans are at .tinkerman/plans/<feature>.md
  const specRoot = join(featureDir, "..");
  const plansPath = join(specRoot, "..", "plans", `${feature}.md`);
  if (!existsSync(plansPath)) return null;

  const planText = readFileSync(plansPath, "utf-8");

  // Parse task entries from the plan
  const taskMatches = [...planText.matchAll(/###\s*(T-\d+(?:\.\d+)?)\s+(.+)/g)];
  if (taskMatches.length > 0) {
    const tasksPath = join(featureDir, "tasks.md");

    // Parse existing tasks.md if it exists
    let existingContent = "";
    if (existsSync(tasksPath)) {
      existingContent = readFileSync(tasksPath, "utf-8");
    }

    // Extract existing task IDs to avoid duplicates
    const existingIds = new Set(
      [...existingContent.matchAll(/###\s*(T-\d+(?:\.\d+)?)\s+/g)].map((m) => m[1]),
    );

    // Build merged task entries
    const mergedTasks: string[] = [];
    for (const match of taskMatches) {
      const id = match[1];
      const title = match[2].trim();
      if (!existingIds.has(id)) {
        mergedTasks.push(
          `### ${id} ${title}\n\n- 目标：${title}\n- 关联需求：\n- status: pending\n`,
        );
      }
    }

    if (mergedTasks.length > 0) {
      const appended = `\n\n<!-- Migrated from plans/${feature}.md -->\n\n${mergedTasks.join("\n")}`;
      writeFileSync(tasksPath, existingContent + appended);
    }
  }

  // Rename plans file as legacy
  const legacyPlansPath = `${plansPath}.legacy`;
  renameSync(plansPath, legacyPlansPath);
  return legacyPlansPath;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export function extractSection(body: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?:^|\\n)## ${escaped}[ \\t]*\\n([\\s\\S]*?)(?=\\n## |$)`, "");
  const match = body.match(regex);
  return match?.[1]?.trim() ?? "";
}

export function extractSubsection(text: string, heading: string): string {
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
