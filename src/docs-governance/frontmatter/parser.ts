import { parse as parseYaml } from "yaml";
import { frontmatterSchema } from "./schema.js";
import type { Frontmatter, DiagnosticRecord, DocPath, Severity } from "../types.js";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface ParseResult {
  frontmatter: Frontmatter | null;
  body: string;
  diagnostics: DiagnosticRecord[];
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const BOM = "﻿";
const DELIMITER = "---";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function makeDiagnostic(
  message: string,
  severity: Severity = "error",
  extra?: Record<string, string | number | boolean>,
): DiagnosticRecord {
  return {
    script: "frontmatter-parser",
    severity,
    file: "" as DocPath, // caller should fill in file path
    message,
    ...(extra ? { extra } : {}),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reject parsed YAML if it contains nested maps as values. */
function hasNestedMaps(obj: Record<string, unknown>): boolean {
  return Object.values(obj).some(
    (v) => isPlainObject(v) || (Array.isArray(v) && v.some(isPlainObject)),
  );
}

// ─────────────────────────────────────────────────────────────
// parseFrontmatter
// ─────────────────────────────────────────────────────────────
export function parseFrontmatter(text: string): ParseResult {
  const diagnostics: DiagnosticRecord[] = [];

  // Strip leading BOM
  let src = text;
  if (src.startsWith(BOM)) {
    src = src.slice(BOM.length);
  }

  // Frontmatter block must start with --- on the very first line
  const lines = src.split("\n");
  if (lines.length === 0 || lines[0]!.trim() !== DELIMITER) {
    return {
      frontmatter: null,
      body: src,
      diagnostics: [makeDiagnostic("No frontmatter block found")],
    };
  }

  // Find closing ---
  let closeIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === DELIMITER) {
      closeIndex = i;
      break;
    }
  }

  if (closeIndex === -1) {
    return {
      frontmatter: null,
      body: src,
      diagnostics: [makeDiagnostic("Frontmatter block not closed (missing closing ---)")],
    };
  }

  const yamlText = lines.slice(1, closeIndex).join("\n");
  const body = lines.slice(closeIndex + 1).join("\n");

  // Empty YAML block
  if (yamlText.trim().length === 0) {
    return {
      frontmatter: null,
      body,
      diagnostics: [makeDiagnostic("Empty frontmatter block")],
    };
  }

  // Parse YAML
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText);
  } catch (err) {
    return {
      frontmatter: null,
      body,
      diagnostics: [
        makeDiagnostic(
          `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
        ),
      ],
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      frontmatter: null,
      body,
      diagnostics: [makeDiagnostic("Frontmatter must be a flat YAML map")],
    };
  }

  // Reject nested maps before schema validation (better error message)
  if (hasNestedMaps(parsed)) {
    return {
      frontmatter: null,
      body,
      diagnostics: [makeDiagnostic("Nested maps are not allowed in frontmatter")],
    };
  }

  // Validate with Zod schema
  const result = frontmatterSchema.safeParse(parsed);
  if (!result.success) {
    const messages = result.error.issues.map(
      (iss) => `${iss.path.join(".")}: ${iss.message}`,
    );
    return {
      frontmatter: null,
      body,
      diagnostics: messages.map((msg) => makeDiagnostic(msg)),
    };
  }

  return {
    frontmatter: result.data as Frontmatter,
    body,
    diagnostics,
  };
}
