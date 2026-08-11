#!/usr/bin/env node
/**
 * Evolved Rules Infra_Ref Verifier.
 *
 * Each rule in `.tinkerman/knowledge/evolved-rules.md` declares an `Infra_Ref:`
 * field pointing to the skill/hook/agent/config files that enforce it.
 * This script verifies those references still resolve — if a SKILL.md or
 * hook is refactored, we catch broken landing points before they silently
 * regress a rule.
 *
 * Invocation:
 *   node scripts/verify-evolved-rule-infra-refs.mjs
 *
 * Exit codes:
 *   0 — all Infra_Ref resolve, or no rules with Infra_Ref
 *   1 — one or more broken refs (file missing / section missing)
 *
 * Intended for `npm run check` / CI.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
    parseInfraRefs,
    validateInfraRefs,
} from "../dist/src/evolved-rules-infra-refs.js";

const RULES_FILE = path.join(process.cwd(), ".tinkerman", "knowledge", "evolved-rules.md");
const PROJECT_ROOT = process.cwd();

function main() {
  if (!existsSync(RULES_FILE)) {
    console.log("[infra-refs] No evolved-rules.md — nothing to verify.");
    return 0;
  }

  const content = readFileSync(RULES_FILE, "utf-8");
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    console.error("[infra-refs] Could not parse frontmatter");
    return 1;
  }

  const body = fmMatch[1];
  const refs = parseInfraRefs(body);

  if (refs.length === 0) {
    console.log("[infra-refs] No Infra_Ref fields to verify.");
    return 0;
  }

  const verdicts = validateInfraRefs(refs, {
    fileExists: (p) => existsSync(path.resolve(PROJECT_ROOT, p)),
    readFile: (p) => {
      try {
        return readFileSync(path.resolve(PROJECT_ROOT, p), "utf-8");
      } catch {
        return "";
      }
    },
  });

  const broken = verdicts.filter((v) => !v.valid);
  const passed = verdicts.length - broken.length;

  if (broken.length === 0) {
    console.log(`[infra-refs] OK — ${passed}/${verdicts.length} Infra_Ref resolved.`);
    return 0;
  }

  console.error(`[infra-refs] FAIL — ${broken.length} broken reference(s):`);
  for (const { ref, reason } of broken) {
    const loc = ref.section ? `${ref.path} §${ref.section}` : ref.path;
    console.error(`  - ${ref.ruleId}: \`${loc}\` — ${reason}`);
  }
  console.error("");
  console.error("Either update the rule's Infra_Ref to match new landing location,");
  console.error("or restore the referenced infrastructure. If the rule has been");
  console.error("retired, move it to .tinkerman/knowledge/solutions/evolved-rules-retired.md");
  console.error("and remove the corresponding entry from evolved-rules.md.");
  return 1;
}

process.exit(main());
