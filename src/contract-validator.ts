const VERIFY_BY_WHITELIST = new Set(["vitest", "bash", "forge_git", "forge_exec", "manual"]);

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

export interface ContractValidationResult {
  valid: boolean;
  errors: string[];
  legacySkipped?: boolean;
}

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---/;
const VB_RE = /\*\*Verify-By\*\*:[^\S\n]*(.*)/;
const EV_RE = /\*\*Evidence\*\*:[^\S\n]*(.*)/;

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

export function validateContract(specMarkdown: string): ContractValidationResult {
  const frontmatter = FRONTMATTER_PATTERN.exec(specMarkdown);
  if (frontmatter?.[1].includes("contract_legacy: true")) {
    return { valid: true, errors: [], legacySkipped: true };
  }

  const criteria = extractAcceptanceCriteria(specMarkdown);
  const errors: string[] = [];

  for (const ac of criteria) {
    if (!ac.verifyBy || ac.verifyBy.trim() === "") {
      errors.push(`AC ${ac.id}: missing Verify-By field`);
    } else if (!VERIFY_BY_WHITELIST.has(ac.verifyBy)) {
      errors.push(
        `AC ${ac.id}: Verify-By "${ac.verifyBy}" not in whitelist (vitest/bash/forge_git/forge_exec/manual)`,
      );
    }

    if (!ac.evidence || ac.evidence.trim() === "") {
      errors.push(`AC ${ac.id}: missing Evidence field`);
    } else if (EVIDENCE_PLACEHOLDERS.has(ac.evidence.trim().toLowerCase())) {
      errors.push(`AC ${ac.id}: Evidence contains placeholder "${ac.evidence}"`);
    }
  }

  return { valid: errors.length === 0, errors };
}
