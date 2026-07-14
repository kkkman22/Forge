/**
 * Three-file markdown parsers for Kiro-style spec layout.
 *
 * Pure functions: parseRequirementsMarkdown, parseDesignMarkdown, parseTasksMarkdown.
 * Each returns either a parsed document or a list of ParseError.
 *
 * Validates: Requirement 1
 */

import type {
  DesignDocument,
  EarsClause,
  GlossaryEntry,
  RequirementsDocument,
  SpecFileFrontmatter,
  TaskSeed,
  TasksSeedDocument,
  UserStory,
  Wave,
  WorkflowVariant,
} from "./spec-bundle.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum body size in characters before truncation to prevent regex backtracking. */
const MAX_BODY_SIZE = 1_000_000; // ~1MB

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ParseError {
  line?: number;
  message: string;
}

export interface ParseResult<T> {
  doc?: T;
  errors?: ParseError[];
}

// ---------------------------------------------------------------------------
// Internal: frontmatter parser
// ---------------------------------------------------------------------------

/**
 * Extract the raw YAML text between `---` delimiters (P2-4 shared helper).
 * Returns null if no valid frontmatter block is found. Shared by spec-parser
 * and spec-bugfix (was duplicated as `text.match(/^---\n([\s\S]*?)\n---/)`).
 * @public
 */
export function extractSpecFrontmatterYaml(text: string): string | null {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : null;
}

/**
 * Extract a single string field from raw spec YAML (P2-4 shared helper).
 * Regex-escapes the key (the prior inline clones did not — latent bug fixed).
 * @public
 */
export function extractSpecField(yaml: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = yaml.match(new RegExp(`^${escaped}:\\s*(.+)$`, "m"));
  return m?.[1]?.trim();
}

function parseFrontmatter(text: string): SpecFileFrontmatter | ParseError[] {
  const yaml = extractSpecFrontmatterYaml(text);
  if (yaml === null) {
    return [{ message: "Missing YAML frontmatter" }];
  }

  const getValue = (key: string): string | undefined => extractSpecField(yaml, key);

  const feature = getValue("feature");
  const status = getValue("status");
  const date = getValue("date");
  const workflow_variant = getValue("workflow_variant");

  const errors: ParseError[] = [];
  if (!feature) errors.push({ message: "Missing 'feature' in frontmatter" });
  if (!status) errors.push({ message: "Missing 'status' in frontmatter" });
  if (!date) errors.push({ message: "Missing 'date' in frontmatter" });

  if (errors.length > 0) return errors;

  const validStatuses = ["draft", "locked"];
  const validVariants: WorkflowVariant[] = ["requirements-first", "design-first", "quick-plan"];

  // After the early return above, feature / status / date are guaranteed non-empty.
  // Use explicit guards instead of `!` to satisfy lint/style/noNonNullAssertion.
  if (!feature || !status || !date) {
    return [{ message: "internal: required frontmatter fields missing after validation" }];
  }

  if (!validStatuses.includes(status)) {
    errors.push({ message: `Invalid status '${status}', expected draft|locked` });
  }

  const wv = workflow_variant ?? "requirements-first";
  if (!validVariants.includes(wv as WorkflowVariant)) {
    errors.push({ message: `Invalid workflow_variant '${wv}'` });
  }

  if (errors.length > 0) return errors;

  return {
    feature,
    status: status as "draft" | "locked",
    date,
    workflow_variant: wv as WorkflowVariant,
    brownfield: getValue("brownfield") === "true",
    kind: getValue("kind") as "feature" | "bugfix" | undefined,
    migrated_from: getValue("migrated_from"),
    import_source: getValue("import_source"),
    contract_legacy: getValue("contract_legacy") === "true",
  };
}

// ---------------------------------------------------------------------------
// Internal: body section extractor
// ---------------------------------------------------------------------------

function extractSection(body: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // No 'm' flag: ^ matches start-of-string, $ matches end-of-string
  // \n## stops at next section heading
  const regex = new RegExp(`(?:^|\\n)## ${escaped}[ \\t]*\\n([\\s\\S]*?)(?=\\n## |$)`, "");
  const match = body.match(regex);
  return match?.[1]?.trim() ?? "";
}

function extractSubsection(body: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?:^|\\n)#{3,4} ${escaped}[ \\t]*\\n([\\s\\S]*?)(?=\\n#{2,4} |$)`, "");
  const match = body.match(regex);
  return match?.[1]?.trim() ?? "";
}

function extractListItems(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l.length > 0);
}

// ---------------------------------------------------------------------------
// Internal: EARS clause extraction
// ---------------------------------------------------------------------------

export function extractEarsClauses(text: string): EarsClause[] {
  const clauses: EarsClause[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Match "- 当 X 时 系统应当 Y" or "- 当 X 则 Y"
    const fullMatch = line.match(/^[-*]\s*当\s+(.+?)\s+时\s+系统(?:应当)?\s+(.+)$/);
    if (fullMatch) {
      const raw = line.replace(/^[-*]\s*/, "");
      const { verifyBy, evidence, cleanedShall } = extractAnnotations(fullMatch[2].trim());
      clauses.push({
        line: i + 1,
        when: fullMatch[1].trim(),
        shall: cleanedShall,
        raw: stripAnnotations(raw),
        ...(verifyBy ? { verifyBy: verifyBy as EarsClause["verifyBy"] } : {}),
        ...(evidence ? { evidence } : {}),
      });
      continue;
    }

    // Legacy: "当 X 则 Y"
    const legacyMatch = line.match(/^[-*]\s*当\s+(.+?)\s*则\s+(.+)$/);
    if (legacyMatch) {
      const raw = line.replace(/^[-*]\s*/, "");
      const { verifyBy, evidence, cleanedShall } = extractAnnotations(legacyMatch[2].trim());
      clauses.push({
        line: i + 1,
        when: legacyMatch[1].trim(),
        shall: cleanedShall,
        raw: stripAnnotations(raw),
        ...(verifyBy ? { verifyBy: verifyBy as EarsClause["verifyBy"] } : {}),
        ...(evidence ? { evidence } : {}),
      });
    }
  }

  return clauses;
}

const VERIFY_BY_RE = /\[Verify-By:\s*(\w+)\]/i;
const EVIDENCE_RE = /\[Evidence:\s*([^\]]+)\]/i;

export function extractAnnotations(shall: string): {
  verifyBy: string | undefined;
  evidence: string | undefined;
  cleanedShall: string;
} {
  const vbMatch = shall.match(VERIFY_BY_RE);
  const evMatch = shall.match(EVIDENCE_RE);
  let cleaned = shall;
  cleaned = cleaned.replace(VERIFY_BY_RE, "").replace(EVIDENCE_RE, "").trim();
  return {
    verifyBy: vbMatch?.[1]?.toLowerCase(),
    evidence: evMatch?.[1]?.trim(),
    cleanedShall: cleaned,
  };
}

function stripAnnotations(raw: string): string {
  return raw.replace(VERIFY_BY_RE, "").replace(EVIDENCE_RE, "").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Internal: glossary extraction
// ---------------------------------------------------------------------------

function extractGlossary(text: string): GlossaryEntry[] {
  return extractListItems(text)
    .map((item) => {
      const match = item.match(/^\*\*(.+?)\*\*:\s*(.+)$/);
      if (match) return { term: match[1], definition: match[2] };
      return null;
    })
    .filter((e): e is GlossaryEntry => e !== null);
}

// ---------------------------------------------------------------------------
// parseRequirementsMarkdown
// ---------------------------------------------------------------------------

export function parseRequirementsMarkdown(text: string): ParseResult<RequirementsDocument> {
  if (!text || text.trim().length === 0) {
    return { errors: [{ message: "Empty input" }] };
  }

  const truncated = text.length > MAX_BODY_SIZE ? text.slice(0, MAX_BODY_SIZE) : text;
  const fmResult = parseFrontmatter(truncated);
  if (Array.isArray(fmResult)) {
    return { errors: fmResult };
  }
  const frontmatter = fmResult as SpecFileFrontmatter;

  const body = truncated.replace(/^---[\s\S]*?---\n*/, "");
  const intro = extractSection(body, "Introduction");
  const glossaryText = extractSection(body, "Glossary");
  const glossary = extractGlossary(glossaryText);
  const nfrText = extractSection(body, "Non-functional Requirements");
  const nonFunctional = extractListItems(nfrText);
  const oosText = extractSection(body, "Out of Scope");
  const outOfScope = extractListItems(oosText);

  // Extract requirements and their acceptance criteria
  const userStories: UserStory[] = [];
  const earsCriteria: EarsClause[] = [];

  const reqRegex = /### Requirement \d+: (.+)/g;
  const reqBlocks: { title: string; start: number }[] = [];

  for (const reqMatch of body.matchAll(reqRegex)) {
    reqBlocks.push({ title: reqMatch[1], start: reqMatch.index });
  }

  for (let i = 0; i < reqBlocks.length; i++) {
    const block = reqBlocks[i];
    const nextStart = reqBlocks[i + 1]?.start ?? body.length;
    const blockText = body.slice(block.start, nextStart);

    const acText = extractSubsection(blockText, "Acceptance Criteria");
    const clauses = extractEarsClauses(acText);
    earsCriteria.push(...clauses);

    const descMatch = blockText.match(/\*\*User Story:\*\*\s*(.+)/);
    userStories.push({
      title: block.title,
      description: descMatch?.[1] ?? "",
      earsCriteria: clauses,
    });
  }

  // Delta section (optional, brownfield)
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

  return {
    doc: {
      frontmatter,
      intro,
      glossary,
      userStories,
      earsCriteria,
      nonFunctional,
      outOfScope,
      ...(delta ? { delta } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// parseDesignMarkdown
// ---------------------------------------------------------------------------

export function parseDesignMarkdown(text: string): ParseResult<DesignDocument> {
  if (!text || text.trim().length === 0) {
    return { errors: [{ message: "Empty input" }] };
  }

  const truncated = text.length > MAX_BODY_SIZE ? text.slice(0, MAX_BODY_SIZE) : text;
  const fmResult = parseFrontmatter(truncated);
  if (Array.isArray(fmResult)) {
    return { errors: fmResult };
  }
  const frontmatter = fmResult as SpecFileFrontmatter;

  const body = truncated.replace(/^---[\s\S]*?---\n*/, "");
  const overview = extractSection(body, "Overview");
  const architecture = extractSection(body, "Architecture");
  const ciText = extractSection(body, "Components and Interfaces");
  const componentInterfaces = extractListItems(ciText);
  const dataModel =
    extractSection(body, "Data Models") || extractSection(body, "Components and Interfaces");
  const errorHandling = extractSection(body, "Error Handling");
  const testingStrategy = extractSection(body, "Testing Strategy");
  const rollout = extractSection(body, "Rollout");
  const oqText = extractSection(body, "Open Questions");
  const openQuestions = extractListItems(oqText).map((q) => q.replace(/^\d+\.\s*/, ""));

  // Brownfield optional sections
  const currentState = extractSection(body, "Current State") || undefined;
  const proposedChange = extractSection(body, "Proposed Change") || undefined;
  const reversibility = extractSection(body, "Reversibility") || undefined;

  // Use dedicated data model section if exists
  const dmSection = extractSection(body, "Data Models");

  return {
    doc: {
      frontmatter,
      overview,
      architecture,
      componentInterfaces,
      dataModel: dmSection || dataModel,
      errorHandling,
      testingStrategy,
      rollout,
      openQuestions: openQuestions.filter((q) => q.length > 0),
      ...(currentState ? { currentState } : {}),
      ...(proposedChange ? { proposedChange } : {}),
      ...(reversibility ? { reversibility } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// parseTasksMarkdown
// ---------------------------------------------------------------------------

export function parseTasksMarkdown(text: string): ParseResult<TasksSeedDocument> {
  if (!text || text.trim().length === 0) {
    return { errors: [{ message: "Empty input" }] };
  }

  const truncated = text.length > MAX_BODY_SIZE ? text.slice(0, MAX_BODY_SIZE) : text;
  const fmResult = parseFrontmatter(truncated);
  if (Array.isArray(fmResult)) {
    return { errors: fmResult };
  }
  const frontmatter = fmResult as SpecFileFrontmatter;

  const body = truncated.replace(/^---[\s\S]*?---\n*/, "");

  // Extract waves from JSON code fence
  let waves: Wave[] | undefined;
  const waveMatch = body.match(/```json\s*\n([\s\S]*?)\n```/);
  if (waveMatch) {
    try {
      const parsed = JSON.parse(waveMatch[1]);
      if (parsed.waves && Array.isArray(parsed.waves)) {
        waves = parsed.waves as Wave[];
      }
    } catch (_err: unknown) {
      // Invalid JSON — waves remain undefined
    }
  }

  // Extract tasks
  const tasks: TaskSeed[] = [];
  const taskRegex = /### (T-\d+(?:\.\d+)?)\s+(.+)/g;
  const taskBlocks: { id: string; title: string; start: number }[] = [];

  for (const taskMatch of body.matchAll(taskRegex)) {
    taskBlocks.push({
      id: taskMatch[1],
      title: taskMatch[2],
      start: taskMatch.index,
    });
  }

  for (let i = 0; i < taskBlocks.length; i++) {
    const block = taskBlocks[i];
    const nextStart = taskBlocks[i + 1]?.start ?? body.length;
    const blockText = body.slice(block.start, nextStart);

    const goalMatch = blockText.match(/[-*]\s*目标[：:]\s*(.+)/);
    const reqMatch = blockText.match(/[-*]\s*关联需求[：:]\s*(.+)/);
    const depMatch = blockText.match(/[-*]\s*depends_on:\s*(.+)/);
    const catMatch = blockText.match(/[-*]\s*category:\s*(.+)/);
    const verMatch = blockText.match(/[-*]\s*verification:\s*(.+)/);

    const relatedReqs = reqMatch ? reqMatch[1].split(/[,，]/).map((s: string) => s.trim()) : [];

    const task: TaskSeed = {
      id: block.id,
      title: block.title,
      goal: goalMatch?.[1]?.trim() ?? "",
      related_requirements: relatedReqs,
      status: "pending",
      ...(depMatch ? { depends_on: depMatch[1].split(/[,，\s]+/).filter(Boolean) } : {}),
      ...(catMatch ? { category: catMatch[1].trim() as TaskSeed["category"] } : {}),
      ...(verMatch ? { verification: verMatch[1].trim() as TaskSeed["verification"] } : {}),
    };

    tasks.push(task);
  }

  return {
    doc: {
      frontmatter,
      tasks,
      ...(waves ? { waves } : {}),
    },
  };
}
