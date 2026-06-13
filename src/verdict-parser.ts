/**
 * Verdict parser for Forge_Verify Three-State Verdict.
 *
 * Parses `verdict.md` content into a structured `ParsedVerdict`.
 * Total function: any string input produces a valid result with
 * verdict ∈ {"VERIFIED", "NOT_VERIFIED", "INCONCLUSIVE"}.
 *
 * **Validates: Requirements R1.9, R13.3**
 */

/** Valid three-state verdict values. */
export type VerdictValue = "VERIFIED" | "NOT_VERIFIED" | "INCONCLUSIVE";

const VALID_VERDICTS: ReadonlySet<string> = new Set<VerdictValue>([
  "VERIFIED",
  "NOT_VERIFIED",
  "INCONCLUSIVE",
]);

/** Result of parsing a verdict.md file. */
export interface ParsedVerdict {
  /** The three-state verdict. Always one of VERIFIED/NOT_VERIFIED/INCONCLUSIVE. */
  readonly verdict: VerdictValue;
  /** The topic being verified, if extractable. */
  readonly topic: string;
  /** Missing artifact paths, if any. */
  readonly missingArtifacts: readonly string[];
  /** Reason for INCONCLUSIVE, if applicable. */
  readonly inconclusiveReason: string | null;
  /** The raw content that was parsed. */
  readonly raw: string;
}

/**
 * Parse a verdict.md content string into a structured ParsedVerdict.
 *
 * This is a total function: any input (including empty, corrupted, or
 * garbage strings) produces a result with verdict ∈ {VERIFIED, NOT_VERIFIED, INCONCLUSIVE}.
 * Unparseable or invalid inputs default to INCONCLUSIVE.
 */
export function parseVerdict(content: string): ParsedVerdict {
  if (!content || typeof content !== "string") {
    return inconclusive(content, [], "empty or non-string input");
  }

  const frontmatter = extractFrontmatter(content);
  if (!frontmatter) {
    return inconclusive(content, [], "no YAML frontmatter found");
  }

  const verdictRaw = frontmatter.verdict;
  if (typeof verdictRaw !== "string") {
    return inconclusive(content, [], "verdict field is not a string");
  }

  const verdict = normalizeVerdict(verdictRaw);

  const topic = typeof frontmatter.topic === "string" ? frontmatter.topic : "";
  const missingArtifacts = parseStringArray(frontmatter.missing_artifacts);
  const inconclusiveReason =
    typeof frontmatter.inconclusive_reason === "string" ? frontmatter.inconclusive_reason : null;

  return {
    verdict,
    topic,
    missingArtifacts,
    inconclusiveReason,
    raw: content,
  };
}

function inconclusive(
  raw: string,
  missingArtifacts: readonly string[],
  reason: string,
): ParsedVerdict {
  return {
    verdict: "INCONCLUSIVE",
    topic: "",
    missingArtifacts,
    inconclusiveReason: reason,
    raw,
  };
}

function extractFrontmatter(content: string): Record<string, unknown> | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("---")) return null;

  const endIdx = trimmed.indexOf("---", 3);
  if (endIdx === -1) return null;

  const yamlStr = trimmed.slice(3, endIdx).trim();
  if (!yamlStr) return null;

  return parseSimpleYaml(yamlStr);
}

function parseSimpleYaml(yaml: string): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const valueStr = line.slice(colonIdx + 1).trim();

    result[key] = parseYamlValue(valueStr);
  }

  return Object.keys(result).length > 0 ? result : null;
}

export function parseYamlValue(value: string): unknown {
  if (value === "" || value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;

  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    try {
      return JSON.parse(value.replace(/'/g, '"'));
    } catch (_err: unknown) {
      return value;
    }
  }

  return value;
}

export function normalizeVerdict(raw: string): VerdictValue {
  const trimmed = raw.trim().toUpperCase();
  if (VALID_VERDICTS.has(trimmed)) return trimmed as VerdictValue;
  return "INCONCLUSIVE";
}

export function parseStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}
