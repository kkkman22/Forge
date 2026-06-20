import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

/**
 * Layered Verify-By grammar (ADR-0006 keystone, Req1).
 *
 * Legal `Verify-By` values carry a `:layer` suffix that names which test-pyramid
 * layer owns the AC. `manual` is the only layer-less value (no automated runner).
 *
 *   vitest:unit       → Layer 1 (pure logic)
 *   vitest:component  → Layer 3 (isolated component + MSW)
 *   bash:contract     → Layer 2 (response-shape contract)
 *   forge_exec:e2e    → Layer 4 (real end-to-end)
 *   manual            → human sign-off
 */
export const LAYERED_VERIFY_BY_WHITELIST = new Set([
  "vitest:unit",
  "vitest:component",
  "bash:contract",
  "forge_exec:e2e",
  "manual",
]);

/** Legacy flat whitelist — retained for grandfathering / migration messaging only. */
const LEGACY_FLAT_WHITELIST = new Set(["vitest", "bash", "forge_git", "forge_exec", "manual"]);

export type Layer = "unit" | "component" | "contract" | "e2e" | "manual";

const TOOL_LAYER_TO_LAYER: Record<string, Layer> = {
  "vitest:unit": "unit",
  "vitest:component": "component",
  "bash:contract": "contract",
  "forge_exec:e2e": "e2e",
  manual: "manual",
};

const LEGAL_VALUES_LIST = [...LAYERED_VERIFY_BY_WHITELIST].join(" / ");

const EVIDENCE_PLACEHOLDERS = new Set(["tbd", "待补", "todo", "pending", "n/a", "—"]);

export interface AcceptanceCriterion {
  id: string;
  text: string;
  verifyBy: string;
  evidence: string;
}

export interface ContractValidationError {
  acId: string;
  field: "Verify-By" | "Evidence";
  reason: string;
}

export interface ContractValidationOptions {
  /**
   * Project root used to resolve Evidence paths for existence checks (AC7).
   * When omitted, Evidence-existence checks are skipped (back-compat).
   */
  projectRoot?: string;
  /**
   * Toggle the Evidence-file-on-disk check (AC7). Defaults to true when
   * `projectRoot` is provided.
   */
  checkEvidenceExists?: boolean;
}

export interface ContractValidationResult {
  valid: boolean;
  errors: string[];
  legacySkipped?: boolean;
}

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---/;
// Accept three in-the-wild Verify-By formats so specs can dogfood their own gate:
//   **Verify-By**: vitest:unit   (bold, most common)
//   - Verify-By: vitest:unit      (list item)
//   > Verify-By: vitest:unit      (block quote, used by feature specs)
const VB_RE = /(?:\*\*Verify-By\*\*|^\s*[->]\s*Verify-By):[^\S\n]*(.*)/m;
const EV_RE = /\*\*Evidence\*\*:[^\S\n]*(.*)/;

/**
 * Parse a `Verify-By` field into its pyramid layer (Req1 keystone, pure fn).
 * Returns `null` when the value is not one of the 5 legal layered values
 * (i.e. lacks a valid `:layer` suffix, or is not `manual`).
 */
export function parseVerifyByLayer(verifyBy: string): Layer | null {
  const value = verifyBy.trim();
  if (value === "manual") return "manual";
  const sepIdx = value.indexOf(":");
  if (sepIdx === -1) return null;
  const tool = value.slice(0, sepIdx).trim();
  const layer = value.slice(sepIdx + 1).trim();
  if (!tool || !layer) return null;
  return TOOL_LAYER_TO_LAYER[`${tool}:${layer}`] ?? null;
}

/**
 * Validate a single `Verify-By` field value against the layered grammar.
 * Returns `null` when valid, or an error message listing the legal values.
 */
export function validateVerifyBy(verifyBy: string): string | null {
  const value = verifyBy.trim();
  if (!value) {
    return `Verify-By missing — legal values: ${LEGAL_VALUES_LIST}`;
  }
  if (LAYERED_VERIFY_BY_WHITELIST.has(value)) return null;
  if (LEGACY_FLAT_WHITELIST.has(value)) {
    return `Verify-By "${value}" uses legacy flat grammar — add ':layer' suffix (legal values: ${LEGAL_VALUES_LIST})`;
  }
  return `Verify-By "${value}" not in layered whitelist (legal values: ${LEGAL_VALUES_LIST})`;
}

export function extractAcceptanceCriteria(specMarkdown: string): AcceptanceCriterion[] {
  const results: AcceptanceCriterion[] = [];
  const frontmatter = FRONTMATTER_PATTERN.exec(specMarkdown);

  let body = specMarkdown;
  if (frontmatter) {
    body = specMarkdown.slice(frontmatter.index + frontmatter[0].length);
  }

  const acSection = body.match(/##?\s*Acceptance Criteria([\s\S]*?)(?=##|$)/i);
  if (!acSection) return results;

  const acText = acSection[1];

  const numberedItems = acText.match(
    /\d+\.\d+\.\s+WHEN[\s\S]*?(?=\n\d+\.\d+\.\s+WHEN|\n\d+\.\s+WHEN|\n#{1,3}\s|$)/g,
  );

  if (!numberedItems) {
    const simpleItems = acText.match(/\d+\.\s+WHEN[\s\S]*?(?=\n\d+\.\s+WHEN|\n#{1,3}\s|$)/g);
    if (!simpleItems) return results;

    for (const item of simpleItems) {
      const idMatch = item.match(/(\d+)\.\s/);
      const vbMatch = VB_RE.exec(item);
      const evMatch = EV_RE.exec(item);
      results.push({
        id: idMatch ? idMatch[1] : "unknown",
        text: item.trim(),
        verifyBy: vbMatch ? vbMatch[1].trim() : "",
        evidence: evMatch ? evMatch[1].trim() : "",
      });
    }
    return results;
  }

  for (const item of numberedItems) {
    const idMatch = item.match(/(\d+\.\d+)\./);
    const vbMatch = VB_RE.exec(item);
    const evMatch = EV_RE.exec(item);
    results.push({
      id: idMatch ? idMatch[1] : "unknown",
      text: item.trim(),
      verifyBy: vbMatch ? vbMatch[1].trim() : "",
      evidence: evMatch ? evMatch[1].trim() : "",
    });
  }

  return results;
}

/**
 * Heuristic: does an Evidence token look like a repo-relative file path
 * (as opposed to a descriptive sentence, command, or free-form note)?
 *
 * Existing Forge specs use highly varied Evidence prose
 * ("test passes", "npm run test:coverage exit 0", Chinese descriptions, …).
 * AC7 must only validate path-shaped tokens, never free-form text — otherwise
 * every legacy spec would be blocked on lock.
 */
const PATH_LIKE_RE = /^(?:\.\/)?[\w@./-]+(?:\.[a-z0-9]+)+(?:\([^)]*\))?$/i;

/** Exported for testing — true when an Evidence token looks like a file path. */
export function looksLikeFilePath(token: string): boolean {
  const cleaned = token.replace(/\([^)]*\)/g, "").trim();
  if (!cleaned) return false;
  // Reject tokens containing spaces / CJK / shell metacharacters (sentences, commands).
  if (/[\s\u4e00-\u9fff;&|<>$`]/.test(cleaned)) return false;
  return PATH_LIKE_RE.test(cleaned);
}

/**
 * Split a comma-separated Evidence string into raw path tokens.
 * Parenthetical notes (e.g. "foo.ts (合法/非法值)") are stripped first.
 */
function splitEvidencePaths(evidence: string): string[] {
  return evidence
    .split(",")
    .map((p) => p.replace(/\([^)]*\)/g, "").trim())
    .filter((p) => p.length > 0);
}

function resolveEvidencePath(raw: string, projectRoot: string): string {
  return isAbsolute(raw) ? resolve(raw) : resolve(join(projectRoot, raw));
}

export function validateContract(
  specMarkdown: string,
  options: ContractValidationOptions = {},
): ContractValidationResult {
  const frontmatter = FRONTMATTER_PATTERN.exec(specMarkdown);
  if (frontmatter?.[1].includes("contract_legacy: true")) {
    return { valid: true, errors: [], legacySkipped: true };
  }

  const checkEvidenceExists = options.checkEvidenceExists ?? options.projectRoot !== undefined;

  const criteria = extractAcceptanceCriteria(specMarkdown);
  const errors: string[] = [];

  for (const ac of criteria) {
    const vbError = validateVerifyBy(ac.verifyBy);
    if (vbError) {
      errors.push(`AC ${ac.id}: ${vbError}`);
    }

    if (!ac.evidence || ac.evidence.trim() === "") {
      errors.push(`AC ${ac.id}: missing Evidence field`);
    } else if (EVIDENCE_PLACEHOLDERS.has(ac.evidence.trim().toLowerCase())) {
      errors.push(`AC ${ac.id}: Evidence contains placeholder "${ac.evidence}"`);
    } else if (checkEvidenceExists && options.projectRoot) {
      // AC7: only validate path-shaped Evidence tokens. Free-form prose
      // Evidence ("test passes", commands, CJK descriptions) is left alone so
      // legacy specs are not blocked on lock (brownfield back-compat, NFR-2).
      const paths = splitEvidencePaths(ac.evidence).filter((p) => looksLikeFilePath(p));
      for (const raw of paths) {
        const abs = resolveEvidencePath(raw, options.projectRoot);
        if (!existsSync(abs)) {
          errors.push(`AC ${ac.id}: Evidence file not found: ${raw}`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
