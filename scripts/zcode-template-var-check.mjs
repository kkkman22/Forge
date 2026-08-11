#!/usr/bin/env node
// category: internal-only
/**
 * zcode-template-var-check.mjs — R4 template-variable expansion regression (sim layer).
 *
 * The REAL expansion of `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PROJECT_DIR}` is a
 * ZCode host behavior and cannot be unit-tested in isolation. This script covers
 * the parts that CAN be verified without a live ZCode host:
 *
 *   1. The fallback-chain command strings in hooks.json + init's .zcode config
 *      template reference `${CLAUDE_PLUGIN_ROOT:-}` (not a hardcoded path).
 *   2. A node hook reading process.env.CLAUDE_PLUGIN_ROOT receives the value
 *      when the env is set (the mechanism ZCode uses to inject it).
 *
 * Real ZCode-host expansion must be verified manually — see
 * .tinkerman/specs/zcode-p1-base-integration/evidence-r4-template-vars.md.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`  FAIL: ${msg}`);
  }
}

console.log("── R4 template-var expansion (sim layer) ──");

// 1. hooks.json references ${CLAUDE_PLUGIN_ROOT} in commands (not hardcoded)
const hooksJson = JSON.parse(readFileSync(resolve(ROOT, "hooks/hooks.json"), "utf8"));
let commandsUsingVar = 0;
let commandsHardcoded = 0;
for (const groups of Object.values(hooksJson.hooks || {})) {
  for (const g of groups) {
    for (const h of g.hooks || []) {
      const cmd = typeof h === "object" ? h.command || "" : "";
      if (cmd.includes("${CLAUDE_PLUGIN_ROOT")) commandsUsingVar++;
      // A hardcoded absolute /Users/... path to scripts/ would be a regression
      if (/\/Users\/[^"]+\/scripts\//.test(cmd) && !cmd.includes("${CLAUDE_PLUGIN_ROOT")) {
        commandsHardcoded++;
      }
    }
  }
}
assert(commandsUsingVar > 0, `hooks.json should have commands using \${CLAUDE_PLUGIN_ROOT} (found ${commandsUsingVar})`);
assert(commandsHardcoded === 0, `hooks.json should have no hardcoded /Users/.../scripts/ paths (found ${commandsHardcoded})`);

// 2. init.sh .zcode config template uses ${CLAUDE_PLUGIN_ROOT} (read the heredoc)
const initSh = readFileSync(resolve(ROOT, "scripts/init.sh"), "utf8");
const stepZBlock = initSh.slice(initSh.indexOf("Step Z"), initSh.indexOf("Step 3：复制"));
assert(
  stepZBlock.includes('${CLAUDE_PLUGIN_ROOT:-}/scripts/stop-additional-context.mjs'),
  "init.sh Step Z config should reference ${CLAUDE_PLUGIN_ROOT:-} (not hardcoded)",
);

// 3. A node hook reading process.env.CLAUDE_PLUGIN_ROOT gets the value when set
//    (this is the injection mechanism zcode-guide documents)
const probe = execFileSync(
  "node",
  ["-e", "process.stdout.write(process.env.CLAUDE_PLUGIN_ROOT || '')"],
  { encoding: "utf8", env: { ...process.env, CLAUDE_PLUGIN_ROOT: "/sim/forge/3.9.0" } },
);
assert(probe === "/sim/forge/3.9.0", `node env read should get CLAUDE_PLUGIN_ROOT value (got '${probe}')`);

console.log(`\n── result: ${pass} passed, ${fail} failed ──`);
console.log("ℹ️  Sim layer only. Real ZCode-host expansion = manual (see evidence-r4-template-vars.md).");
process.exit(fail === 0 ? 0 : 1);
