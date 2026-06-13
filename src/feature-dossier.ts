import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StageName =
  | "decisions"
  | "specs"
  | "plans"
  | "reviews"
  | "progress"
  | "findings"
  | "debug";

export interface StageFileEntry {
  path: string;
  mtime: string;
  frontmatter: Record<string, unknown>;
  firstSection: string;
  kind?: "dated" | "adr";
  adrId?: string;
}

export interface StageScanResult {
  topic: string;
  forgeRoot: string;
  stages: Record<StageName, StageFileEntry[]>;
}

export interface DossierFrontmatter {
  topic: string;
  generated_at: string;
  auto_generated: true;
  stage_count: number;
  total_files: number;
}

export interface DossierDocument {
  frontmatter: DossierFrontmatter;
  body: string;
}

export interface TopicDiscoveryResult {
  topics: string[];
  drifts: Array<{
    topicA: string;
    topicB: string;
    reason: "trailing-digit" | "plural-form" | "substring" | "separator";
  }>;
  emptySpecDirs: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STAGE_NAMES: StageName[] = [
  "decisions",
  "specs",
  "plans",
  "reviews",
  "progress",
  "findings",
  "debug",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyStages(): Record<StageName, StageFileEntry[]> {
  return {
    decisions: [],
    specs: [],
    plans: [],
    reviews: [],
    progress: [],
    findings: [],
    debug: [],
  };
}

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// deriveTopicFromPath — reverse mapping (Hook → Topic_Key)
// ---------------------------------------------------------------------------

export function deriveTopicFromPath(relPath: string): string | null {
  if (!relPath) return null;

  // decisions/<date>-<topic>.md
  let m = relPath.match(/^decisions\/\d{4}-\d{2}-\d{2}-(.+)\.md$/);
  if (m) return m[1];

  // decisions/ADR-<NNNN>-<topic>.md
  m = relPath.match(/^decisions\/ADR-\d{4}-(.+)\.md$/);
  if (m) return m[1];

  // specs/<topic>/spec.md
  m = relPath.match(/^specs\/([^/]+)\/spec\.md$/);
  if (m) return m[1];

  // specs/<topic>/{requirements|design|tasks|bugfix}.md (three-file / bugfix layout)
  m = relPath.match(/^specs\/([^/]+)\/(requirements|design|tasks|bugfix)\.md$/);
  if (m) return m[1];

  // plans|reviews|progress|findings|debug/<topic>.md
  m = relPath.match(/^(plans|reviews|progress|findings|debug)\/(.+)\.md$/);
  if (m) return m[2];

  return null;
}

// ---------------------------------------------------------------------------
// matchStageFiles — forward pattern matching (pure function)
// ---------------------------------------------------------------------------

export function matchStageFiles(stage: StageName, topic: string, files: string[]): string[] {
  const escaped = escapeRegExp(topic);

  if (stage === "decisions") {
    const dateRe = new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${escaped}\\.md$`);
    const adrRe = new RegExp(`^ADR-\\d{4}-${escaped}\\.md$`);
    return files.filter((f) => dateRe.test(f) || adrRe.test(f));
  }

  if (stage === "specs") {
    // specs uses directory matching; files are from inside specs/<topic>/
    // Match legacy spec.md and three-file layout (requirements/design/tasks/bugfix)
    const specFiles = ["spec.md", "requirements.md", "design.md", "tasks.md", "bugfix.md"];
    return files.filter((f) => specFiles.includes(f));
  }

  // Exact match for plans, reviews, progress, findings, debug
  const exactRe = new RegExp(`^${escaped}\\.md$`);
  return files.filter((f) => exactRe.test(f));
}

// ---------------------------------------------------------------------------
// scanStagesForTopic
// ---------------------------------------------------------------------------

export function scanStagesForTopic(topic: string, forgeRoot: string): StageScanResult {
  // Path traversal defense: reject topic with path separators or traversal
  if (topic.includes("/") || topic.includes("\\") || topic.includes("..")) {
    return { topic, forgeRoot, stages: emptyStages() };
  }

  const stages: Record<StageName, StageFileEntry[]> = {
    decisions: [],
    specs: [],
    plans: [],
    reviews: [],
    progress: [],
    findings: [],
    debug: [],
  };

  for (const stage of STAGE_NAMES) {
    const stageDir = path.join(forgeRoot, stage);
    let entries: string[];
    try {
      entries = fs.readdirSync(stageDir);
    } catch (_: unknown) {
      continue;
    }

    if (stage === "specs") {
      // specs/<topic>/ — legacy spec.md and/or three-file layout
      const specDir = path.join(stageDir, topic);
      try {
        const specFiles = fs.readdirSync(specDir);
        const matched = matchStageFiles("specs", topic, specFiles);
        for (const name of matched) {
          stages.specs.push(readStageFile(stageDir, `${topic}/${name}`, stage));
        }
      } catch (_err: unknown) {
        // directory doesn't exist, skip
      }
      continue;
    }

    const matched = matchStageFiles(stage, topic, entries);
    for (const name of matched) {
      stages[stage].push(readStageFile(stageDir, name, stage));
    }
  }

  return { topic, forgeRoot, stages };
}

function readStageFile(stageDir: string, relativeName: string, stage: StageName): StageFileEntry {
  const fullPath = path.join(stageDir, relativeName);
  let content: string;
  let mtime: string;
  try {
    content = fs.readFileSync(fullPath, "utf-8");
    mtime = fs.statSync(fullPath).mtime.toISOString();
  } catch (_err: unknown) {
    return {
      path: path.join(path.basename(stageDir), relativeName),
      mtime: "",
      frontmatter: {},
      firstSection: "",
    };
  }

  const parsed = parseFrontmatter(content);
  const frontmatter: Record<string, unknown> = {};
  if (parsed?.raw) {
    for (const line of parsed.raw.split("\n")) {
      const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
      if (kv) {
        const val = kv[2].trim().replace(/^"(.*)"$/, "$1");
        frontmatter[kv[1]] = val || true;
      }
    }
  }

  // Extract first section (from first ## to next ## or EOF, max 500 chars)
  let firstSection = "";
  const body = parsed?.body ?? content;
  const firstH2 = body.indexOf("\n## ");
  if (firstH2 !== -1) {
    const afterH2 = body.indexOf("\n", firstH2 + 1);
    const sectionStart = afterH2 !== -1 ? afterH2 + 1 : firstH2 + 4;
    const nextH2 = body.indexOf("\n## ", sectionStart);
    const sectionEnd = nextH2 !== -1 ? nextH2 : body.length;
    firstSection = body.slice(sectionStart, sectionEnd).trim().slice(0, 500);
  }

  const entry: StageFileEntry = {
    path: path.join(path.basename(stageDir), relativeName),
    mtime,
    frontmatter,
    firstSection,
  };

  // Decision kind detection
  if (stage === "decisions") {
    const baseName = path.basename(relativeName);
    if (/^\d{4}-\d{2}-\d{2}-/.test(baseName)) {
      entry.kind = "dated";
    } else if (/^ADR-\d{4}-/.test(baseName)) {
      entry.kind = "adr";
      const adrMatch = baseName.match(/^ADR-(\d{4})-/);
      if (adrMatch) entry.adrId = adrMatch[1];
    }
  }

  return entry;
}

// ---------------------------------------------------------------------------
// buildDossier — pure function
// ---------------------------------------------------------------------------

export function buildDossier(input: {
  topic: string;
  forgeRoot: string;
  stageScan: StageScanResult;
}): DossierDocument {
  const { topic, stageScan } = input;
  const stageLabels: Array<{ name: StageName; label: string }> = [
    { name: "decisions", label: "Decide" },
    { name: "specs", label: "Spec" },
    { name: "plans", label: "Plan" },
    { name: "progress", label: "Build" },
    { name: "reviews", label: "Review" },
    { name: "findings", label: "Findings" },
    { name: "debug", label: "Debug" },
  ];

  let totalFiles = 0;
  let nonEmptyStages = 0;

  for (const stage of STAGE_NAMES) {
    const files = stageScan.stages[stage];
    if (files.length > 0) {
      nonEmptyStages++;
      totalFiles += files.length;
    }
  }

  // Build stage index table
  const tableRows = stageLabels.map(({ name, label }) => {
    const files = stageScan.stages[name];
    if (files.length === 0) {
      return `| ${label} | — | — | — |`;
    }
    const fileLinks = files
      .map((f) => {
        const rel = `../${f.path}`;
        const display = path.basename(f.path);
        return `[${display}](${rel})`;
      })
      .join("<br>");
    const status = extractStatus(files[0].frontmatter) ?? "(no status)";
    const latestMtime = files.reduce((latest, f) => (f.mtime > latest ? f.mtime : latest), "");
    const date = latestMtime ? latestMtime.slice(0, 10) : "—";
    return `| ${label} | ${fileLinks} | ${escapeTableCell(status)} | ${date} |`;
  });

  // Build summary bullets
  const summaryLines: string[] = [];
  for (const { name, label } of stageLabels) {
    const files = stageScan.stages[name];
    if (files.length === 0) continue;
    const status = extractStatus(files[0].frontmatter) ?? "unknown";
    const date = files[0].mtime ? files[0].mtime.slice(0, 10) : "—";
    const summary = files[0].firstSection ? truncate(files[0].firstSection, 150) : "";
    let line = `- **${label}** (${escapeTableCell(status)}, ${date})`;
    if (summary) line += `：${escapeTableCell(summary)}`;
    summaryLines.push(line);
  }

  // Build ADR section
  const adrFiles = stageScan.stages.decisions.filter((f) => f.kind === "adr");
  let adrSection = "";
  if (adrFiles.length > 0) {
    const adrLines = adrFiles.map((f) => {
      const title = f.frontmatter.title ?? topic;
      const id = f.adrId ?? "????";
      return `- [ADR-${id} ${escapeTableCell(String(title))}](../${f.path})`;
    });
    adrSection = `\n## 关联 ADR\n\n${adrLines.join("\n")}\n`;
  }

  // Assemble body
  let body = `# Feature: ${topic}\n\n`;
  body += `## 阶段索引\n\n`;
  body += `| 阶段 | 文件 | 状态 | 最近更新 |\n`;
  body += `|------|------|------|---------|\n`;
  body += `${tableRows.join("\n")}\n\n`;
  body += `## 摘要\n\n${summaryLines.join("\n")}\n`;
  body += adrSection;

  return {
    frontmatter: {
      topic,
      generated_at: "",
      auto_generated: true,
      stage_count: nonEmptyStages,
      total_files: totalFiles,
    },
    body,
  };
}

export function extractStatus(fm: Record<string, unknown>): string | null {
  if (typeof fm.status === "string") return fm.status;
  return null;
}

export function escapeTableCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 3)}...`;
}

// ---------------------------------------------------------------------------
// discoverTopics
// ---------------------------------------------------------------------------

export function discoverTopics(forgeRoot: string): TopicDiscoveryResult {
  const topicSet = new Set<string>();
  const emptySpecDirs: string[] = [];

  for (const stage of STAGE_NAMES) {
    const stageDir = path.join(forgeRoot, stage);
    let entries: string[];
    try {
      entries = fs.readdirSync(stageDir);
    } catch (_: unknown) {
      continue;
    }

    if (stage === "specs") {
      for (const entry of entries) {
        const entryPath = path.join(stageDir, entry);
        let stat: fs.Stats;
        try {
          stat = fs.statSync(entryPath);
        } catch (_: unknown) {
          continue;
        }
        if (!stat.isDirectory()) continue;
        const subFiles = fs.readdirSync(entryPath);
        const hasLegacy = subFiles.includes("spec.md");
        const hasThreeFile =
          subFiles.includes("requirements.md") ||
          subFiles.includes("design.md") ||
          subFiles.includes("tasks.md") ||
          subFiles.includes("bugfix.md");
        if (hasLegacy || hasThreeFile) {
          topicSet.add(entry);
        } else {
          topicSet.add(entry);
          emptySpecDirs.push(entry);
        }
      }
      continue;
    }

    for (const file of entries) {
      if (!file.endsWith(".md")) continue;
      const rel = `${stage}/${file}`;
      const topic = deriveTopicFromPath(rel);
      if (topic) topicSet.add(topic);
    }
  }

  const topics = [...topicSet].sort();
  const drifts = detectDrifts(topics);

  return { topics, drifts, emptySpecDirs };
}

/** @internal — exported for testing */
export function detectDrifts(topics: string[]): TopicDiscoveryResult["drifts"] {
  const drifts: TopicDiscoveryResult["drifts"] = [];

  // Group topics by their normalized forms for O(n) matching
  // instead of O(n²) pairwise comparison
  const trailingGroups = new Map<string, string[]>();
  const pluralGroups = new Map<string, string[]>();
  const separatorGroups = new Map<string, string[]>();

  const stripTrailing = (s: string) => s.replace(/[-.]?v?\d+$/, "");
  const stripPlural = (s: string) => s.replace(/s$/, "");
  const normSep = (s: string) => s.replace(/_/g, "-");

  for (const topic of topics) {
    // Group by trailing-digit-stripped form
    const tk = stripTrailing(topic);
    let g1 = trailingGroups.get(tk);
    if (!g1) {
      g1 = [];
      trailingGroups.set(tk, g1);
    }
    g1.push(topic);

    // Group by plural-stripped form
    const pk = stripPlural(topic);
    let g2 = pluralGroups.get(pk);
    if (!g2) {
      g2 = [];
      pluralGroups.set(pk, g2);
    }
    g2.push(topic);

    // Group by separator-normalized form
    const sk = normSep(topic);
    let g3 = separatorGroups.get(sk);
    if (!g3) {
      g3 = [];
      separatorGroups.set(sk, g3);
    }
    g3.push(topic);
  }

  // Collect drifts from each group (pairs within same group)
  const seen = new Set<string>();

  const addDrift = (
    a: string,
    b: string,
    reason: TopicDiscoveryResult["drifts"][number]["reason"],
  ) => {
    const key = `${a}::${b}`;
    if (!seen.has(key)) {
      seen.add(key);
      drifts.push({ topicA: a, topicB: b, reason });
    }
  };

  for (const group of trailingGroups.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (group[i] !== group[j]) {
          addDrift(group[i], group[j], "trailing-digit");
        }
      }
    }
  }

  for (const group of pluralGroups.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (group[i] !== group[j]) {
          addDrift(group[i], group[j], "plural-form");
        }
      }
    }
  }

  for (const group of separatorGroups.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (group[i] !== group[j]) {
          addDrift(group[i], group[j], "separator");
        }
      }
    }
  }

  // Substring drift: sort topics and check neighbors
  // Two topics with a prefix/suffix relationship and length diff <= 5
  const sorted = [...topics].sort();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (a === b) continue;
      // Since sorted, if b doesn't start with a, no further j will either
      if (!b.startsWith(a)) break;
      if (Math.abs(a.length - b.length) <= 5) {
        // Only add if not already detected by another drift type
        const key = `${a}::${b}`;
        if (!seen.has(key)) {
          seen.add(key);
          drifts.push({ topicA: a, topicB: b, reason: "substring" });
        }
      }
    }
  }

  return drifts;
}
