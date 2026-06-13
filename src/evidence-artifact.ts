import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type EvidenceArtifactKind =
  | "review"
  | "test"
  | "ship_gate"
  | "verify"
  | "mutation"
  | "docs_check"
  | "dist_sync";

export type EvidenceArtifactResult = "pass" | "fail" | "warn" | "blocked" | "inconclusive";

export interface EvidenceArtifact {
  schema_version: 1;
  artifact_id: string;
  kind: EvidenceArtifactKind;
  topic: string;
  run_id: string;
  trace_id: string;
  commit: string;
  command: string;
  exit_code: number;
  stdout_tail?: string;
  stderr_tail?: string;
  input_hash: string;
  result: EvidenceArtifactResult;
  producer: string;
  created_at: string;
  supersedes?: string;
}

export interface EvidenceArtifactDiagnostic {
  code:
    | "INVALID_SCHEMA_VERSION"
    | "MISSING_ARTIFACT_ID"
    | "MISSING_TOPIC"
    | "MISSING_RUN_ID"
    | "MISSING_TRACE_ID"
    | "MISSING_COMMIT"
    | "MISSING_COMMAND"
    | "MISSING_EXIT_CODE"
    | "MISSING_INPUT_HASH"
    | "MISSING_TIMESTAMP"
    | "MISSING_PRODUCER"
    | "INVALID_KIND"
    | "INVALID_RESULT"
    | "UNSAFE_ARTIFACT_ID"
    | "UNSAFE_RUN_ID";
  message: string;
}

export interface ArtifactBackedVerdictDiagnostic {
  code: "MISSING_ARTIFACT_REFERENCE";
  message: string;
}

export type EvidenceWriteResult =
  | { ok: true; path: string; indexPath: string }
  | { ok: false; code: "INVALID_ARTIFACT" | "ARTIFACT_ALREADY_EXISTS"; message: string };

export interface EvidenceArtifactQuery {
  topic?: string;
  kind?: EvidenceArtifactKind;
  commit?: string;
  run_id?: string;
}

export interface ArtifactFreshnessContext {
  changedFiles?: readonly string[];
  inputHash?: string;
}

const VALID_KINDS = new Set<EvidenceArtifactKind>([
  "review",
  "test",
  "ship_gate",
  "verify",
  "mutation",
  "docs_check",
  "dist_sync",
]);

const VALID_RESULTS = new Set<EvidenceArtifactResult>([
  "pass",
  "fail",
  "warn",
  "blocked",
  "inconclusive",
]);

export function validateEvidenceArtifact(artifact: EvidenceArtifact): EvidenceArtifactDiagnostic[] {
  const diagnostics: EvidenceArtifactDiagnostic[] = [];

  if (artifact.schema_version !== 1) {
    diagnostics.push({
      code: "INVALID_SCHEMA_VERSION",
      message: "schema_version must be 1",
    });
  }
  if (!artifact.artifact_id) {
    diagnostics.push({ code: "MISSING_ARTIFACT_ID", message: "artifact_id is required" });
  } else if (!isSafePathSegment(artifact.artifact_id)) {
    diagnostics.push({
      code: "UNSAFE_ARTIFACT_ID",
      message: "artifact_id must be a safe path segment",
    });
  }
  if (!artifact.topic) {
    diagnostics.push({ code: "MISSING_TOPIC", message: "topic is required" });
  }
  if (!artifact.run_id) {
    diagnostics.push({ code: "MISSING_RUN_ID", message: "run_id is required" });
  } else if (!isSafePathSegment(artifact.run_id)) {
    diagnostics.push({ code: "UNSAFE_RUN_ID", message: "run_id must be a safe path segment" });
  }
  if (!artifact.trace_id) {
    diagnostics.push({ code: "MISSING_TRACE_ID", message: "trace_id is required" });
  }
  if (!artifact.commit) {
    diagnostics.push({ code: "MISSING_COMMIT", message: "commit is required" });
  }
  if (!artifact.command) {
    diagnostics.push({ code: "MISSING_COMMAND", message: "command is required" });
  }
  if (typeof artifact.exit_code !== "number" || !Number.isFinite(artifact.exit_code)) {
    diagnostics.push({ code: "MISSING_EXIT_CODE", message: "exit_code is required" });
  }
  if (!artifact.input_hash) {
    diagnostics.push({ code: "MISSING_INPUT_HASH", message: "input_hash is required" });
  }
  if (!artifact.created_at) {
    diagnostics.push({ code: "MISSING_TIMESTAMP", message: "created_at is required" });
  }
  if (!artifact.producer) {
    diagnostics.push({ code: "MISSING_PRODUCER", message: "producer is required" });
  }
  if (!VALID_KINDS.has(artifact.kind)) {
    diagnostics.push({
      code: "INVALID_KIND",
      message: `unsupported artifact kind: ${artifact.kind}`,
    });
  }
  if (!VALID_RESULTS.has(artifact.result)) {
    diagnostics.push({
      code: "INVALID_RESULT",
      message: `unsupported artifact result: ${artifact.result}`,
    });
  }

  return diagnostics;
}

export function hashEvidenceInput(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function writeEvidenceArtifact(
  projectRoot: string,
  artifact: EvidenceArtifact,
): EvidenceWriteResult {
  const diagnostics = validateEvidenceArtifact(artifact);
  if (diagnostics.length > 0) {
    return {
      ok: false,
      code: "INVALID_ARTIFACT",
      message: diagnostics.map((diagnostic) => diagnostic.code).join(", "),
    };
  }

  const artifactDir = join(projectRoot, ".forge", "artifacts", artifact.run_id);
  const artifactPath = join(artifactDir, `${artifact.artifact_id}.json`);
  const indexPath = join(projectRoot, ".forge", "artifacts", "index.jsonl");

  if (existsSync(artifactPath)) {
    return {
      ok: false,
      code: "ARTIFACT_ALREADY_EXISTS",
      message: `Evidence artifact already exists: ${artifact.artifact_id}`,
    };
  }

  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(artifactPath, `${stableJson(artifact)}\n`, "utf-8");
  appendFileSync(indexPath, `${JSON.stringify(indexRecord(artifact, artifactPath))}\n`, "utf-8");

  return { ok: true, path: artifactPath, indexPath };
}

export function queryEvidenceArtifacts(
  projectRoot: string,
  query: EvidenceArtifactQuery = {},
): EvidenceArtifact[] {
  const indexPath = join(projectRoot, ".forge", "artifacts", "index.jsonl");
  let indexContent: string;
  try {
    indexContent = readFileSync(indexPath, "utf-8");
  } catch (_err: unknown) {
    return [];
  }

  const artifacts: EvidenceArtifact[] = [];
  for (const line of indexContent.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const record = safeParseIndexRecord(line);
    if (!record) continue;

    const artifact = readArtifact(record.path);
    if (!artifact) continue;
    if (query.topic && artifact.topic !== query.topic) continue;
    if (query.kind && artifact.kind !== query.kind) continue;
    if (query.commit && artifact.commit !== query.commit) continue;
    if (query.run_id && artifact.run_id !== query.run_id) continue;
    artifacts.push(artifact);
  }

  return artifacts.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function isArtifactFreshForCommit(
  artifact: EvidenceArtifact,
  currentHead: string,
  context: ArtifactFreshnessContext = {},
): { fresh: boolean; reason: string } {
  if (artifact.commit === currentHead) {
    return { fresh: true, reason: "artifact commit matches current HEAD" };
  }
  if (artifact.kind === "review" && context.changedFiles !== undefined) {
    const projectFiles = context.changedFiles.filter((file) => !file.startsWith(".forge/"));
    if (projectFiles.length === 0) {
      return { fresh: true, reason: "review remains fresh because only .forge/ state changed" };
    }
  }
  if (artifact.kind === "test" && context.inputHash && artifact.input_hash === context.inputHash) {
    return { fresh: true, reason: "test input hash matches current command input" };
  }
  return {
    fresh: false,
    reason: `artifact commit ${artifact.commit} does not match current HEAD ${currentHead}`,
  };
}

export function validateArtifactBackedVerdict(content: string): ArtifactBackedVerdictDiagnostic[] {
  if (!hasPassResult(content)) {
    return [];
  }

  if (/(^|\n)\s*(artifact_id|evidence_artifact_id):\s*"?[a-zA-Z0-9._-]+"?\s*(\n|$)/.test(content)) {
    return [];
  }

  return [
    {
      code: "MISSING_ARTIFACT_REFERENCE",
      message: "pass verdicts must reference artifact_id or evidence_artifact_id",
    },
  ];
}

function indexRecord(artifact: EvidenceArtifact, path: string): Record<string, string> {
  return {
    artifact_id: artifact.artifact_id,
    kind: artifact.kind,
    topic: artifact.topic,
    run_id: artifact.run_id,
    commit: artifact.commit,
    result: artifact.result,
    created_at: artifact.created_at,
    path,
  };
}

export function safeParseIndexRecord(line: string): { path: string } | null {
  try {
    const parsed: unknown = JSON.parse(line);
    if (typeof parsed !== "object" || parsed === null) return null;
    const path = (parsed as Record<string, unknown>).path;
    return typeof path === "string" ? { path } : null;
  } catch (_err: unknown) {
    return null;
  }
}

function readArtifact(path: string): EvidenceArtifact | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const artifact = parsed as EvidenceArtifact;
    return validateEvidenceArtifact(artifact).length === 0 ? artifact : null;
  } catch (_err: unknown) {
    return null;
  }
}

export function isSafePathSegment(value: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(value) && !value.includes("..");
}

function hasPassResult(content: string): boolean {
  return /(^|\n)\s*result:\s*"?pass"?\s*(\n|$)/.test(content);
}

function stableJson(value: EvidenceArtifact): string {
  const ordered: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    ordered[key] = value[key as keyof EvidenceArtifact];
  }
  return JSON.stringify(ordered, null, 2);
}
