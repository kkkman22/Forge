import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LivingDocScenario {
  title: string;
  tags: string[];
  lastVerdict: "pass" | "fail" | "pending" | "skip";
  lastRunAt: string | null;
  sourceLine: number;
  acceptanceReportPath: string | null;
}

export interface LivingDocContext {
  name: string;
  specs: Array<{
    topic: string;
    scenarios: LivingDocScenario[];
    specPath: string;
    workflowVariant?: string;
  }>;
  stats: { total: number; pass: number; fail: number; pending: number };
}

export interface LivingDocData {
  generatedAt: string;
  contexts: Map<string, LivingDocContext>;
  globalStats: {
    totalScenarios: number;
    pass: number;
    fail: number;
    pending: number;
  };
}

export type Verdict = "pass" | "fail" | "pending" | "skip";

export interface VerdictEntry {
  verdict: Verdict;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// parseSpecScenarios
// ---------------------------------------------------------------------------

export function parseSpecScenarios(
  specContent: string,
  _specPath: string,
): {
  context: string | null;
  scenarios: Array<{ title: string; tags: string[]; sourceLine: number }>;
} {
  const lines = specContent.split("\n");
  let context: string | null = null;
  const scenarios: Array<{ title: string; tags: string[]; sourceLine: number }> = [];

  // 1. Extract context from frontmatter (between --- markers)
  let inFrontmatter = false;
  let frontmatterEnded = false;
  for (const line of lines) {
    if (line.trim() === "---") {
      if (!inFrontmatter && !frontmatterEnded) {
        inFrontmatter = true;
        continue;
      }
      if (inFrontmatter) {
        frontmatterEnded = true;
        break;
      }
    }
    if (inFrontmatter) {
      const match = line.match(/^context:\s*(.+)$/);
      if (match) {
        context = match[1].trim();
      }
    }
  }

  // 2. Find "## Scenarios" section
  let inScenariosSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^##\s+Scenarios/.test(line)) {
      inScenariosSection = true;
      continue;
    }

    // Stop if we hit another ## heading that is not Scenarios
    if (inScenariosSection && /^##\s+/.test(line) && !/^##\s+Scenarios/.test(line)) {
      inScenariosSection = false;
      continue;
    }

    if (!inScenariosSection) continue;

    // 3. Match scenario headings: "### Scenario N: <title>" or "### <title>"
    const scenarioWithNumber = line.match(/^###\s+Scenario\s+\d+:\s*(.+)$/);
    const scenarioBare = line.match(/^###\s+(.+)$/);

    let rawTitle: string | null = null;
    if (scenarioWithNumber) {
      rawTitle = scenarioWithNumber[1];
    } else if (scenarioBare) {
      rawTitle = scenarioBare[1];
    }

    if (rawTitle !== null) {
      // 4. Extract tags from [tag] markers
      const tags: string[] = [];
      const tagRegex = /\[([^\]]+)\]/g;
      let tagMatch: RegExpExecArray | null = tagRegex.exec(rawTitle);
      while (tagMatch !== null) {
        tags.push(tagMatch[1]);
        tagMatch = tagRegex.exec(rawTitle);
      }
      // Remove tags from title
      const title = rawTitle.replace(/\s*\[[^\]]+\]\s*/g, " ").trim();

      scenarios.push({
        title,
        tags,
        sourceLine: i + 1, // 1-based line number
      });
    }
  }

  return { context, scenarios };
}

// ---------------------------------------------------------------------------
// parseAcceptanceVerdicts
// ---------------------------------------------------------------------------

const VERDICT_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  verdict: Verdict;
}> = [
  { pattern: /✅\s*PASS/, verdict: "pass" },
  { pattern: /❌\s*FAIL/, verdict: "fail" },
  { pattern: /⏳\s*PENDING/, verdict: "pending" },
  { pattern: /⏭\s*SKIP/, verdict: "skip" },
];

export function parseAcceptanceVerdicts(
  reportContent: string,
  _reportPath: string,
): Map<string, VerdictEntry> {
  const result = new Map<string, VerdictEntry>();

  if (!reportContent) return result;

  const timestamp = new Date().toISOString();
  const lines = reportContent.split("\n");

  for (const line of lines) {
    // Match: - **Scenario**: <title> — <emoji> <STATUS>
    const match = line.match(/^-\s+\*\*Scenario\*\*:\s*(.+?)\s*—\s*(.+)$/);
    if (match) {
      const title = match[1].trim();
      const statusPart = match[2];

      for (const { pattern, verdict } of VERDICT_PATTERNS) {
        if (pattern.test(statusPart)) {
          result.set(title, { verdict, timestamp });
          break;
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// generateLivingDoc
// ---------------------------------------------------------------------------

export function generateLivingDoc(specsDir: string, acceptanceDir: string | null): LivingDocData {
  const globalStats = { totalScenarios: 0, pass: 0, fail: 0, pending: 0 };
  const contexts = new Map<string, LivingDocContext>();

  // 3. Parse acceptance reports if directory provided
  const allVerdicts = new Map<string, VerdictEntry & { reportPath: string }>();

  if (acceptanceDir && fs.existsSync(acceptanceDir)) {
    const reportFiles = fs.readdirSync(acceptanceDir).filter((f) => f.endsWith(".md"));

    for (const reportFile of reportFiles) {
      const reportPath = path.join(acceptanceDir, reportFile);
      const content = fs.readFileSync(reportPath, "utf-8");
      const verdicts = parseAcceptanceVerdicts(content, reportPath);

      for (const [title, entry] of verdicts) {
        // Later reports overwrite earlier ones for same scenario title
        allVerdicts.set(title, {
          verdict: entry.verdict,
          timestamp: entry.timestamp,
          reportPath,
        });
      }
    }
  }

  // 1-2. List spec files and parse them (flat .md files AND three-file topic dirs)
  const DEFAULT_CONTEXT = "default";

  // Collect spec entries: flat .md files and three-file topic dirs
  const specEntries: Array<{
    specPath: string;
    specContent: string;
    topic: string;
    workflowVariant?: string;
  }> = [];

  if (fs.existsSync(specsDir)) {
    const entries = fs.readdirSync(specsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const specPath = path.join(specsDir, entry.name);
        const content = fs.readFileSync(specPath, "utf-8");
        specEntries.push({
          specPath,
          specContent: content,
          topic: entry.name.replace(/\.md$/, ""),
        });
      } else if (entry.isDirectory()) {
        // Three-file layout: specs/<topic>/requirements.md (or spec.md)
        const topicDir = path.join(specsDir, entry.name);
        const threeFile = ["requirements.md", "spec.md"].find((f) => {
          try {
            return fs.statSync(path.join(topicDir, f)).isFile();
          } catch (_err: unknown) {
            return false;
          }
        });
        if (threeFile) {
          const specPath = path.join(topicDir, threeFile);
          const content = fs.readFileSync(specPath, "utf-8");
          // Extract workflow_variant from frontmatter
          const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
          let workflowVariant: string | undefined;
          if (fmMatch) {
            const wvMatch = fmMatch[1].match(/workflow_variant:\s*(.+)/);
            if (wvMatch) workflowVariant = wvMatch[1].trim();
          }
          specEntries.push({ specPath, specContent: content, topic: entry.name, workflowVariant });
        }
      }
    }
  }

  for (const specEntry of specEntries) {
    const { specPath, specContent, workflowVariant } = specEntry;
    const parsed = parseSpecScenarios(specContent, specPath);

    const contextName = parsed.context ?? DEFAULT_CONTEXT;

    // 4-5. Merge verdicts and build scenarios
    const scenarios: LivingDocScenario[] = parsed.scenarios.map((s) => {
      const verdictEntry = allVerdicts.get(s.title);
      let lastVerdict: LivingDocScenario["lastVerdict"] = "pending";
      let lastRunAt: string | null = null;
      let acceptanceReportPath: string | null = null;

      if (verdictEntry) {
        lastVerdict = verdictEntry.verdict;
        lastRunAt = verdictEntry.timestamp;
        acceptanceReportPath = verdictEntry.reportPath;
      }

      return {
        title: s.title,
        tags: s.tags,
        lastVerdict,
        lastRunAt,
        sourceLine: s.sourceLine,
        acceptanceReportPath,
      };
    });

    // 5. Group by context
    if (!contexts.has(contextName)) {
      contexts.set(contextName, {
        name: contextName,
        specs: [],
        stats: { total: 0, pass: 0, fail: 0, pending: 0 },
      });
    }

    const ctx = contexts.get(contextName);
    if (!ctx) continue;
    ctx.specs.push({
      topic: specEntry.topic,
      scenarios,
      specPath,
      workflowVariant,
    });

    // 6. Calculate context stats
    for (const s of scenarios) {
      ctx.stats.total++;
      globalStats.totalScenarios++;
      switch (s.lastVerdict) {
        case "pass":
          ctx.stats.pass++;
          globalStats.pass++;
          break;
        case "fail":
          ctx.stats.fail++;
          globalStats.fail++;
          break;
        case "pending":
          ctx.stats.pending++;
          globalStats.pending++;
          break;
        case "skip":
          // skip does not count toward pass/fail/pending
          break;
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    contexts,
    globalStats,
  };
}
