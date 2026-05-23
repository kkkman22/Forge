/**
 * External spec import — parseSpecArgs, parseExternalSpec, scoreImportedContent, runImportMode.
 *
 * Validates: Requirement 10
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type {
  DesignDocument,
  EarsClause,
  RequirementsDocument,
  SpecFileFrontmatter,
  TasksSeedDocument,
  WorkflowVariant,
} from "./spec-bundle.js";
import {
  renderDesignMarkdown,
  renderRequirementsMarkdown,
  renderTasksMarkdown,
} from "./spec-render.js";

// ---------------------------------------------------------------------------
// parseSpecArgs
// ---------------------------------------------------------------------------

export interface ParseSpecArgsResult {
  mode: "feature" | "import" | "default";
  feature?: string;
  path?: string;
}

export function parseSpecArgs(argv: string[]): ParseSpecArgsResult {
  if (argv.length === 0) return { mode: "default" };

  const arg = argv[0];
  if (existsSync(arg)) {
    return { mode: "import", path: arg };
  }

  return { mode: "feature", feature: arg };
}

// ---------------------------------------------------------------------------
// parseExternalSpec
// ---------------------------------------------------------------------------

export interface ExternalSpecContent {
  purpose: string;
  earsCriteria: EarsClause[];
  nonFunctional: string[];
  outOfScope: string[];
}

export function parseExternalSpec(text: string): ExternalSpecContent {
  const purpose = text.match(/^#\s+(.+)/m)?.[1] ?? "";

  // Extract EARS clauses
  const earsCriteria: EarsClause[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(/^[-*]\s*当\s+(.+?)\s+时\s+系统(?:应当)?\s+(.+)$/);
    if (match) {
      earsCriteria.push({
        line: i + 1,
        when: match[1].trim(),
        shall: match[2].trim(),
        raw: line.replace(/^[-*]\s*/, ""),
      });
      continue;
    }
    const legacyMatch = line.match(/^[-*]\s*当\s+(.+?)\s*则\s+(.+)$/);
    if (legacyMatch) {
      earsCriteria.push({
        line: i + 1,
        when: legacyMatch[1].trim(),
        shall: legacyMatch[2].trim(),
        raw: line.replace(/^[-*]\s*/, ""),
      });
    }
  }

  // Extract NFR
  const nfrMatch = text.match(/##\s*Non-?functional[\s\S]*?\n([\s\S]*?)(?=\n## |$)/i);
  const nonFunctional = (nfrMatch?.[1] ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);

  return { purpose, earsCriteria, nonFunctional, outOfScope: [] };
}

// ---------------------------------------------------------------------------
// scoreImportedContent
// ---------------------------------------------------------------------------

export function scoreImportedContent(input: {
  earsCriteria: EarsClause[];
  hasArchitecture: boolean;
}): WorkflowVariant {
  if (input.earsCriteria.length > 0 && !input.hasArchitecture) {
    return "requirements-first";
  }
  if (input.hasArchitecture && input.earsCriteria.length === 0) {
    return "design-first";
  }
  if (input.earsCriteria.length === 0 && !input.hasArchitecture) {
    return "quick-plan";
  }
  // Both present: default RF
  return "requirements-first";
}

// ---------------------------------------------------------------------------
// runImportMode
// ---------------------------------------------------------------------------

export interface ImportModeResult {
  success: boolean;
  feature: string;
  variant: WorkflowVariant;
  outputPath: string;
  error?: string;
}

/**
 * Import an external spec file and convert it into Forge three-file layout.
 * Returns the output directory path.
 */
export function runImportMode(
  inputPath: string,
  outputDir: string,
  eventsPath?: string,
): ImportModeResult {
  if (!existsSync(inputPath)) {
    return {
      success: false,
      feature: "",
      variant: "requirements-first",
      outputPath: "",
      error: `Input file not found: ${inputPath}`,
    };
  }

  try {
    const text = readFileSync(inputPath, "utf-8");
    const content = parseExternalSpec(text);
    const variant = scoreImportedContent({
      earsCriteria: content.earsCriteria,
      hasArchitecture: /##\s*(?:Architecture|架构)/.test(text),
    });

    const feature =
      inputPath
        .replace(/\.\w+$/, "")
        .split("/")
        .pop() ?? "imported";
    const fm: SpecFileFrontmatter = {
      feature,
      status: "draft",
      date: new Date().toISOString().slice(0, 10),
      workflow_variant: variant,
      import_source: inputPath,
    };

    const reqDoc: RequirementsDocument = {
      frontmatter: fm,
      intro: content.purpose,
      glossary: [],
      userStories: content.earsCriteria.map((c, i) => ({
        title: `Imported Requirement ${i + 1}`,
        description: c.raw,
        earsCriteria: [c],
      })),
      earsCriteria: content.earsCriteria,
      nonFunctional: content.nonFunctional,
      outOfScope: content.outOfScope,
    };

    const outputPath = join(outputDir, feature);
    if (!existsSync(outputPath)) {
      mkdirSync(outputPath, { recursive: true });
    }
    writeFileSync(join(outputPath, "requirements.md"), renderRequirementsMarkdown(reqDoc));

    // Generate design.md
    const designDoc: DesignDocument = {
      frontmatter: { ...fm },
      overview: content.purpose,
      architecture: "",
      componentInterfaces: [],
      dataModel: "",
      errorHandling: "",
      testingStrategy: "",
      rollout: "",
      openQuestions: [],
    };
    writeFileSync(join(outputPath, "design.md"), renderDesignMarkdown(designDoc));

    // Generate tasks.md
    const tasksDoc: TasksSeedDocument = {
      frontmatter: { ...fm, status: "draft" },
      tasks: content.earsCriteria.map((c, i) => ({
        id: `T-${String(i + 1).padStart(2, "0")}`,
        title: `Implement: ${c.when}`,
        goal: `Verify: 当 ${c.when} 时 系统应当 ${c.shall}`,
        related_requirements: [`Requirement ${i + 1}`],
        status: "pending" as const,
      })),
    };
    writeFileSync(join(outputPath, "tasks.md"), renderTasksMarkdown(tasksDoc));

    return { success: true, feature, variant, outputPath };
  } catch (err) {
    if (eventsPath) {
      import("./event-writer.js").then(({ writeEvent }) => {
        writeEvent(eventsPath, "spec_import_failed", { error: String(err) });
      });
    }
    return {
      success: false,
      feature: "",
      variant: "requirements-first",
      outputPath: "",
      error: String(err),
    };
  }
}
