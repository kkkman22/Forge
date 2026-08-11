#!/usr/bin/env node
/**
 * Lint evolved-rules.md for consistency.
 *
 * Checks that frontmatter `rule_count` matches the actual number
 * of `### R<N>:` headings in the document body.
 */
import fs from "node:fs";
import path from "node:path";

const RULES_FILE = path.join(import.meta.dirname, "..", ".tinkerman", "knowledge", "evolved-rules.md");

function main() {
  if (!fs.existsSync(RULES_FILE)) {
    console.error(`Error: ${RULES_FILE} not found`);
    process.exit(1);
  }

  const content = fs.readFileSync(RULES_FILE, "utf-8");

  // Extract frontmatter rule_count
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    console.error("Error: No frontmatter found");
    process.exit(1);
  }

  const frontmatter = frontmatterMatch[1];
  const ruleCountMatch = frontmatter.match(/rule_count:\s*(\d+)/);
  if (!ruleCountMatch) {
    console.error("Error: No rule_count field in frontmatter");
    process.exit(1);
  }
  const declaredCount = Number.parseInt(ruleCountMatch[1], 10);

  // Count actual rule headings
  const headingMatches = content.match(/^### R\d+:/gm);
  const actualCount = headingMatches ? headingMatches.length : 0;

  if (declaredCount !== actualCount) {
    console.error(`Error: rule_count (${declaredCount}) does not match actual rule headings (${actualCount})`);
    process.exit(1);
  }

  console.log(`OK: ${actualCount} rules declared and found`);
}

main();
