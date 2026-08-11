/**
 * SpecBundle filesystem I/O — load and write three-file / legacy-single bundles.
 *
 * Provides:
 *   - loadSpecBundle(featureDir): reads .tinkerman/specs/<feature>/ and returns SpecBundle
 *   - writeSpecBundle(bundle, featureDir): writes SpecBundle to disk
 *
 * Validates: Requirements 1, 6
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Requirement, SpecDocument, SpecFrontmatter } from "./spec.js";
import type {
  DesignDocument,
  RequirementsDocument,
  SpecBundle,
  SpecFileFrontmatter,
  TasksSeedDocument,
} from "./spec-bundle.js";
import { specDocumentToBundle } from "./spec-bundle.js";
// P2-4: shared spec-frontmatter helpers (was inlined regex here).
import {
  extractSpecField,
  extractSpecFrontmatterYaml,
  parseDesignMarkdown,
  parseRequirementsMarkdown,
  parseTasksMarkdown,
} from "./spec-parser.js";
import {
  renderDesignMarkdown as specRenderRenderDesignMarkdown,
  renderRequirementsMarkdown as specRenderRenderRequirementsMarkdown,
  renderTasksMarkdown as specRenderRenderTasksMarkdown,
} from "./spec-render.js";
import { pathReadable } from "./utils/fs.js";

// ---------------------------------------------------------------------------
// Internal: legacy spec.md parser
// ---------------------------------------------------------------------------

export function parseLegacySpec(text: string): SpecDocument {
  // P2-4: delegate delimiter split + field extraction to shared helpers.
  const yaml = extractSpecFrontmatterYaml(text);
  const fm: SpecFrontmatter = yaml
    ? {
        feature: extractSpecField(yaml, "feature") ?? "unknown",
        status: (extractSpecField(yaml, "status") as "draft" | "locked") ?? "draft",
        date: extractSpecField(yaml, "date") ?? "",
      }
    : { feature: "unknown", status: "draft", date: "" };

  const body = text.replace(/^---[\s\S]*?---\n*/, "");

  // Extract purpose (目的)
  const purposeMatch = body.match(/#\s*目的\s*\n([\s\S]*?)(?=\n## |$)/);
  const purpose = purposeMatch?.[1]?.trim() ?? "";

  // Extract requirements (需求)
  const requirements: Requirement[] = [];
  const reqRegex = /###\s*需求\s*\d+[:：]\s*(.+)/g;
  // Two-pass parsing: first collect heading positions, then slice block bodies.
  const reqHeadings: { title: string; restStart: number }[] = [];
  for (const m of body.matchAll(reqRegex)) {
    reqHeadings.push({
      title: m[1].trim(),
      restStart: (m.index ?? 0) + m[0].length,
    });
  }
  for (let i = 0; i < reqHeadings.length; i++) {
    const heading = reqHeadings[i];
    const restEnd = reqHeadings[i + 1]?.restStart ?? body.length;
    const blockText = body.slice(heading.restStart, restEnd);

    const scenarios = blockText
      .split("\n")
      .filter((l) => l.trim().startsWith("-") && l.includes("当"))
      .map((l) => l.replace(/^[-*]\s*/, "").trim());

    requirements.push({ title: heading.title, description: "", scenarios });
  }

  // Extract exclusions (不做什么)
  const exclMatch = body.match(/##\s*不做什么\s*\n([\s\S]*?)(?=\n## |$)/);
  const exclusions = (exclMatch?.[1] ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l.length > 0);

  // Detect brownfield (Delta section)
  const hasDelta = /##\s*Delta/.test(body);
  let delta: SpecDocument["delta"];
  if (hasDelta) {
    const added: string[] = [];
    const modified: string[] = [];
    const unchanged: string[] = [];
    const deltaMatch = body.match(/##\s*Delta\s*\n([\s\S]*?)(?=\n## |$)/);
    if (deltaMatch) {
      const dt = deltaMatch[1];
      const addMatch = dt.match(/###\s*新增\s*\n([\s\S]*?)(?=###|$)/);
      const modMatch = dt.match(/###\s*修改\s*\n([\s\S]*?)(?=###|$)/);
      const unchMatch = dt.match(/###\s*不变\s*\n([\s\S]*?)(?=###|$)/);
      if (addMatch) added.push(...extractListItems(addMatch[1]));
      if (modMatch) modified.push(...extractListItems(modMatch[1]));
      if (unchMatch) unchanged.push(...extractListItems(unchMatch[1]));
    }
    delta = { added, modified, unchanged };
  }

  return {
    frontmatter: fm,
    purpose,
    requirements,
    exclusions,
    isBrownfield: !!delta,
    delta,
  };
}

export function extractListItems(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l.length > 0);
}

// ---------------------------------------------------------------------------
// loadSpecBundle
// ---------------------------------------------------------------------------

export interface LoadSpecBundleOptions {
  migrationHint?: boolean;
}

export async function loadSpecBundle(
  featureDir: string,
  _options?: LoadSpecBundleOptions,
): Promise<SpecBundle & { migrationHint?: boolean }> {
  const reqPath = join(featureDir, "requirements.md");
  const designPath = join(featureDir, "design.md");
  const tasksPath = join(featureDir, "tasks.md");
  const specPath = join(featureDir, "spec.md");

  const hasThreeFile = await pathReadable(reqPath);
  const hasLegacy = await pathReadable(specPath);

  // Three-file takes priority
  if (hasThreeFile) {
    const reqResult = parseRequirementsMarkdown(await readFile(reqPath, "utf-8"));
    if (reqResult.errors) {
      throw new Error(
        `Parse error in requirements.md: ${reqResult.errors.map((e) => e.message).join(", ")}`,
      );
    }

    let design: DesignDocument | undefined;
    if (await pathReadable(designPath)) {
      const designResult = parseDesignMarkdown(await readFile(designPath, "utf-8"));
      if (designResult.errors) {
        throw new Error(
          `Parse error in design.md: ${designResult.errors.map((e) => e.message).join(", ")}`,
        );
      }
      design = designResult.doc;
    }

    let tasks: TasksSeedDocument | undefined;
    if (await pathReadable(tasksPath)) {
      const tasksResult = parseTasksMarkdown(await readFile(tasksPath, "utf-8"));
      if (tasksResult.errors) {
        throw new Error(
          `Parse error in tasks.md: ${tasksResult.errors.map((e) => e.message).join(", ")}`,
        );
      }
      tasks = tasksResult.doc;
    }

    const requirementsDoc = reqResult.doc;
    if (!requirementsDoc) {
      throw new Error("internal: requirements.md parsed without errors but doc is missing");
    }
    const frontmatter = requirementsDoc.frontmatter;

    return {
      feature: frontmatter.feature,
      kind: frontmatter.kind ?? "feature",
      layout: "three-file",
      variant: frontmatter.workflow_variant,
      primary: requirementsDoc,
      ...(design ? { design } : {}),
      ...(tasks ? { tasks } : {}),
      ...(hasLegacy ? { migrationHint: true } : {}),
    };
  }

  // Legacy single-file fallback
  if (hasLegacy) {
    const specText = await readFile(specPath, "utf-8");
    const spec = parseLegacySpec(specText);
    const bundle = specDocumentToBundle(spec);

    return {
      ...bundle,
      layout: "legacy-single",
    };
  }

  throw new Error(`No spec files found in ${featureDir}`);
}

// ---------------------------------------------------------------------------
// writeSpecBundle
// ---------------------------------------------------------------------------

export function renderFrontmatter(fm: SpecFileFrontmatter): string {
  const lines = ["---"];
  lines.push(`feature: ${fm.feature}`);
  lines.push(`status: ${fm.status}`);
  lines.push(`date: ${fm.date}`);
  lines.push(`workflow_variant: ${fm.workflow_variant}`);
  if (fm.kind) lines.push(`kind: ${fm.kind}`);
  if (fm.brownfield) lines.push(`brownfield: true`);
  if (fm.migrated_from) lines.push(`migrated_from: ${fm.migrated_from}`);
  if (fm.import_source) lines.push(`import_source: ${fm.import_source}`);
  if (fm.contract_legacy) lines.push(`contract_legacy: true`);
  lines.push("---");
  return lines.join("\n");
}

export function renderRequirementsMarkdown(req: RequirementsDocument): string {
  // REQ-04 (audit-remediate-0619): delegate to the SSOT in spec-render.ts.
  // Previously this was a hand-maintained duplicate that had drifted — it
  // omitted `enforceEarsSyntax` (which the SSOT applies) — so tests that
  // exercised this path were green on incorrect output. Delegation removes
  // the drift surface entirely.
  return specRenderRenderRequirementsMarkdown(req);
}

export function renderDesignMarkdown(doc: DesignDocument): string {
  // REQ-04 (audit-remediate-0619): delegate to the SSOT in spec-render.ts.
  // The local copy had drifted (open questions were numbered `1. ${q}` for
  // every entry — invalid markdown). Delegation fixes the numbering bug.
  return specRenderRenderDesignMarkdown(doc);
}

export function renderTasksMarkdown(doc: TasksSeedDocument): string {
  // REQ-04 (audit-remediate-0619): delegate to the SSOT in spec-render.ts.
  // The local copy omitted `execution_packages` rendering that the SSOT has.
  return specRenderRenderTasksMarkdown(doc);
}

export async function writeSpecBundle(bundle: SpecBundle, featureDir: string): Promise<void> {
  await mkdir(featureDir, { recursive: true });

  if (bundle.layout === "three-file") {
    await writeFile(
      join(featureDir, "requirements.md"),
      renderRequirementsMarkdown(bundle.primary as RequirementsDocument),
    );

    if (bundle.design) {
      await writeFile(
        join(featureDir, "design.md"),
        renderDesignMarkdown(bundle.design as DesignDocument),
      );
    }

    if (bundle.tasks) {
      await writeFile(join(featureDir, "tasks.md"), renderTasksMarkdown(bundle.tasks));
    }
  }

  // legacy-single layout does not write individual files
  // (kept for backward compatibility; writing is only for three-file)
}
