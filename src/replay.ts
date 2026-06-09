import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { type EvidenceArtifact, queryEvidenceArtifacts } from "./evidence-artifact.js";
import { type StageFileEntry, type StageName, scanStagesForTopic } from "./feature-dossier.js";

export type ReplayStage =
  | "decide"
  | "spec"
  | "plan"
  | "build"
  | "review"
  | "findings"
  | "debug"
  | "ship"
  | "artifact";

export type ReplayEntrySource = "document" | "artifact" | "inference" | "missing";

export interface ReplayEntry {
  stage: ReplayStage;
  timestamp: string | null;
  source: ReplayEntrySource;
  path?: string;
  artifactId?: string;
  artifactKind?: string;
  result?: string;
  summary: string;
  superseded?: boolean;
  supersedes?: string;
}

export interface EvidenceReplay {
  topic: string;
  entries: ReplayEntry[];
}

const STAGE_LABELS: Record<ReplayStage, string> = {
  decide: "Decide",
  spec: "Spec",
  plan: "Plan",
  build: "Build",
  review: "Review",
  findings: "Findings",
  debug: "Debug",
  ship: "Ship",
  artifact: "Artifact",
};

const STAGE_MAP: Array<{ source: StageName; replay: ReplayStage; missingLabel: string }> = [
  { source: "decisions", replay: "decide", missingLabel: "decisions" },
  { source: "specs", replay: "spec", missingLabel: "specs" },
  { source: "plans", replay: "plan", missingLabel: "plans" },
  { source: "progress", replay: "build", missingLabel: "progress" },
  { source: "reviews", replay: "review", missingLabel: "reviews" },
  { source: "findings", replay: "findings", missingLabel: "findings" },
  { source: "debug", replay: "debug", missingLabel: "debug notes" },
];

export function buildEvidenceReplay(topic: string, forgeRoot: string): EvidenceReplay {
  const projectRoot = path.dirname(forgeRoot);
  const scan = scanStagesForTopic(topic, forgeRoot);
  const entries: ReplayEntry[] = [];

  for (const stage of STAGE_MAP) {
    const files = scan.stages[stage.source];
    if (files.length === 0) {
      entries.push({
        stage: stage.replay,
        timestamp: null,
        source: "missing",
        summary: `No ${stage.missingLabel} evidence found for ${topic}`,
      });
      continue;
    }
    for (const file of files) {
      entries.push(stageFileToEntry(stage.replay, file));
    }
  }

  const shipEntries = scanShipRecords(topic, forgeRoot);
  entries.push(
    ...(shipEntries.length > 0
      ? shipEntries
      : [
          {
            stage: "ship" as const,
            timestamp: null,
            source: "missing" as const,
            summary: `No ship evidence found for ${topic}`,
          },
        ]),
  );

  entries.push(...artifactEntries(projectRoot, topic));

  return { topic, entries: sortReplayEntries(entries) };
}

export function renderReplayTimeline(replay: EvidenceReplay): string {
  const lines = [`# Evidence Replay: ${replay.topic}`, ""];

  for (const entry of replay.entries) {
    const marker =
      entry.source === "missing" ? "missing" : entry.source === "inference" ? "inference" : "fact";
    const label = STAGE_LABELS[entry.stage];
    const target =
      entry.artifactId && entry.artifactKind
        ? `${entry.artifactId} ${entry.artifactKind}`
        : (entry.artifactId ?? entry.path ?? "");
    const result = entry.result ? ` ${entry.result}` : "";
    const superseded = entry.superseded ? " (superseded)" : "";
    const supersedes = entry.supersedes ? `; supersedes ${entry.supersedes}` : "";
    const targetText = target ? ` ${target}` : "";
    lines.push(
      `- [${marker}] ${label}${targetText}${result}${superseded}: ${entry.summary}${supersedes}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

function stageFileToEntry(stage: ReplayStage, file: StageFileEntry): ReplayEntry {
  const status = typeof file.frontmatter.status === "string" ? file.frontmatter.status : undefined;
  const artifactId =
    typeof file.frontmatter.artifact_id === "string" ? file.frontmatter.artifact_id : undefined;
  const summary = file.firstSection || `${STAGE_LABELS[stage]} evidence found`;
  return {
    stage,
    timestamp: file.mtime || null,
    source: "document",
    path: file.path,
    artifactId,
    result: status,
    summary,
  };
}

function artifactEntries(projectRoot: string, topic: string): ReplayEntry[] {
  const artifacts = queryEvidenceArtifacts(projectRoot, { topic });
  const supersededIds = new Set(
    artifacts
      .map((artifact) => artifact.supersedes)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );

  return artifacts.map((artifact) => artifactToEntry(artifact, supersededIds));
}

function artifactToEntry(artifact: EvidenceArtifact, supersededIds: Set<string>): ReplayEntry {
  return {
    stage: "artifact",
    timestamp: artifact.created_at,
    source: "artifact",
    artifactId: artifact.artifact_id,
    artifactKind: artifact.kind,
    result: artifact.result,
    summary: `${artifact.kind} artifact from ${artifact.producer} at ${artifact.commit}`,
    superseded: supersededIds.has(artifact.artifact_id),
    supersedes: artifact.supersedes,
  };
}

function scanShipRecords(topic: string, forgeRoot: string): ReplayEntry[] {
  const shipDir = path.join(forgeRoot, "ship");
  let names: string[];
  try {
    names = readdirSync(shipDir);
  } catch (_err: unknown) {
    return [];
  }

  const entries: ReplayEntry[] = [];
  for (const name of names.filter((candidate) => candidate.includes(topic))) {
    const fullPath = path.join(shipDir, name);
    let result: string | undefined;
    try {
      const parsed: unknown = JSON.parse(readFileSync(fullPath, "utf-8"));
      if (typeof parsed === "object" && parsed !== null && "allPassed" in parsed) {
        result = (parsed as { allPassed?: boolean }).allPassed ? "pass" : "fail";
      }
    } catch (_err: unknown) {
      result = undefined;
    }

    entries.push({
      stage: "ship",
      timestamp: safeMtime(fullPath),
      source: "document",
      path: path.join("ship", name),
      result,
      summary: result ? `Ship gate result: ${result}` : "Ship evidence found",
    });
  }
  return entries;
}

function safeMtime(filePath: string): string | null {
  try {
    return statSync(filePath).mtime.toISOString();
  } catch (_err: unknown) {
    return null;
  }
}

function sortReplayEntries(entries: ReplayEntry[]): ReplayEntry[] {
  return [...entries].sort((a, b) => {
    if (a.timestamp === null && b.timestamp === null)
      return stageRank(a.stage) - stageRank(b.stage);
    if (a.timestamp === null) return -1;
    if (b.timestamp === null) return 1;
    const timeCompare = a.timestamp.localeCompare(b.timestamp);
    return timeCompare === 0 ? stageRank(a.stage) - stageRank(b.stage) : timeCompare;
  });
}

function stageRank(stage: ReplayStage): number {
  const order: ReplayStage[] = [
    "decide",
    "spec",
    "plan",
    "build",
    "review",
    "findings",
    "debug",
    "ship",
    "artifact",
  ];
  return order.indexOf(stage);
}
