#!/usr/bin/env node
// category: internal-only
/**
 * zcode-p1-verify.mjs — Aggregate P1 verification entry (R6.3 / R6.4).
 *
 * Runs all P1 regression groups in sequence, prints a per-item PASS/FAIL with
 * the judgement criterion, and exits non-zero if any group failed.
 *
 * Groups:
 *   R3  evolved-rules injection    → test/inject-evolved-rules.test.ts
 *   R5  agent load (24 roles)      → test/agent-load-zcode.test.ts
 *   R6  dual-platform transparency → test/zcode-p1-transparency.test.ts
 *   R2  platform prune (unit)      → test/scripts/zcode-platform.test.ts
 *   R2  stop-additional-context    → test/stop-additional-context.test.ts
 *   R4  template-var expansion     → zcode-template-var-check.mjs (sim layer)
 *
 * R4's real ZCode-host expansion cannot run in CI (host behavior); this script
 * runs the simulation layer and prints the manual-verification reminder.
 */
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const groups = [
  {
    name: "R3 evolved-rules injection",
    criterion: "inject-evolved-rules.test.ts all pass (file-missing silent, file-present injects, ZCode prune)",
    run: () => runVitest("test/inject-evolved-rules.test.ts"),
  },
  {
    name: "R5 agent load (24 roles)",
    criterion: "agent-load-zcode.test.ts: count==24, frontmatter+name+desc, no CLAUDE_AGENTS_DIR dep",
    run: () => runVitest("test/agent-load-zcode.test.ts"),
  },
  {
    name: "R6 dual-platform transparency",
    criterion: "zcode-p1-transparency.test.ts: Claude byte-equal + no-mutation + fail-safe",
    run: () => runVitest("test/zcode-p1-transparency.test.ts"),
  },
  {
    name: "R2 platform prune (unit)",
    criterion: "zcode-platform.test.ts: detection + whitelist + unknown-event fallback",
    run: () => runVitest("test/scripts/zcode-platform.test.ts"),
  },
  {
    name: "R2 stop-additional-context (ZCode output shape)",
    criterion: "stop-additional-context.test.ts: top-level additionalContext on ZCode, hookSpecificOutput on Claude",
    run: () => runVitest("test/stop-additional-context.test.ts"),
  },
  {
    name: "R4 template-var expansion (sim layer)",
    criterion: "zcode-template-var-check.mjs: sim assertions pass (real ZCode host expansion = manual, see evidence doc)",
    run: () => runScript("scripts/zcode-template-var-check.mjs"),
  },
];

function runVitest(testFile) {
  try {
    execFileSync("npx", ["vitest", "run", testFile], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 60000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: (e.stdout || e.stderr || e.message).split("\n").slice(-8).join("\n") };
  }
}

function runScript(scriptPath) {
  try {
    const out = execFileSync("node", [resolve(ROOT, scriptPath)], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 30000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, detail: out.split("\n").slice(-3).join("\n") };
  } catch (e) {
    return { ok: false, detail: (e.stdout || e.stderr || e.message).split("\n").slice(-8).join("\n") };
  }
}

let failures = 0;
console.log("═══ Forge × ZCode P1 aggregate verification ═══\n");
for (const g of groups) {
  const res = g.run();
  const tag = res.ok ? "✅ PASS" : "❌ FAIL";
  console.log(`${tag}  ${g.name}`);
  console.log(`        criterion: ${g.criterion}`);
  if (!res.ok) {
    failures++;
    console.log(`        detail:\n${res.detail}`);
  }
}
console.log("\n───────────────────────────────────");
if (failures === 0) {
  console.log("✅ All P1 regression groups passed.");
  console.log("\nℹ️  R4 note: template-var expansion sim layer passed. Real ZCode-host");
  console.log("   expansion must be verified manually in a ZCode client — see");
  console.log("   .forge/specs/zcode-p1-base-integration/evidence-r4-template-vars.md");
  process.exit(0);
} else {
  console.log(`❌ ${failures} group(s) failed.`);
  process.exit(1);
}
