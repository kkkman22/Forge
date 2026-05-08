export type ScriptCategory = "user-facing" | "internal-only" | "one-off" | "unclear";

export interface ScriptAuditEntry {
  path: string;
  category: ScriptCategory;
  hasHelpBranch: boolean;
  helpOutputValid: boolean;
  errors: string[];
}

const CATEGORY_RE = /#\s*category:\s*(user-facing|internal-only|one-off)/;

export function parseScriptCategory(fileContent: string): ScriptCategory {
  const match = CATEGORY_RE.exec(fileContent);
  if (!match) return "unclear";
  return match[1] as ScriptCategory;
}

export function parseHelpOutput(output: string): { valid: boolean; reason?: string } {
  if (output.includes("Usage:")) {
    return { valid: true };
  }
  return { valid: false, reason: "missing 'Usage:' in --help output" };
}

export function parseHelpExempt(content: string): readonly string[] {
  return content
    .split("\n")
    .map((line) => {
      const stripped = line.trim();
      if (stripped === "" || stripped.startsWith("#")) return null;
      const withoutInline = stripped.split("#")[0].trim();
      return withoutInline || null;
    })
    .filter((entry): entry is string => entry !== null);
}

export function auditScript(path: string, content: string, helpOutput?: string): ScriptAuditEntry {
  const category = parseScriptCategory(content);
  const hasHelpBranch =
    content.includes('"--help"') ||
    content.includes("'--help'") ||
    content.includes("$1") ||
    content.includes("process.argv");

  const errors: string[] = [];

  if (category === "user-facing") {
    if (helpOutput === undefined || helpOutput === "") {
      errors.push("user-facing script missing --help output");
      return { path, category, hasHelpBranch, helpOutputValid: false, errors };
    }
    const parsed = parseHelpOutput(helpOutput);
    if (!parsed.valid) {
      errors.push(`user-facing script --help invalid: ${parsed.reason}`);
    }
    return { path, category, hasHelpBranch, helpOutputValid: parsed.valid, errors };
  }

  return { path, category, hasHelpBranch, helpOutputValid: true, errors };
}
