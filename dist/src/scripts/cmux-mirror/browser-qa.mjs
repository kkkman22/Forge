#!/usr/bin/env node
/**
 * browser-qa.mjs — Browser QA fallback using cmux browser commands (R8).
 * Drives end-to-end QA via `cmux browser` command set.
 * Three-state verdict: pass / fail / inconclusive.
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cmuxAvailable } from "./lib/availability.mjs";
import { runCli } from "./lib/cli.mjs";
const QA_STEPS = [
    { name: "navigate", args: ["browser", "navigate", "about:blank"] },
    { name: "evaluate", args: ["browser", "evaluate", "document.readyState"] },
    { name: "screenshot", args: ["browser", "screenshot"] },
];
/**
 * Run browser QA sequence (R8.1–R8.9).
 * Returns { verdict, failures, steps, timestamp }.
 * Never throws (R8.8).
 */
export async function runBrowserQa({ forgeDir = ".forge", writeArtifact = false, steps = QA_STEPS, } = {}) {
    const result = {
        verdict: "inconclusive" /* pass | fail | inconclusive */,
        failures: [],
        steps: [],
        timestamp: new Date().toISOString(),
    };
    try {
        // R8.1: cmux unavailable → inconclusive
        if (!cmuxAvailable()) {
            return result;
        }
        for (const step of steps) {
            const stepResult = { name: step.name, status: "pending" };
            try {
                const cliResult = await runCli(step.args, { timeoutMs: 10000 });
                // R8.6: EPIPE / null result → inconclusive
                if (cliResult === null) {
                    result.verdict = "inconclusive";
                    stepResult.status = "skipped";
                    result.steps.push(stepResult);
                    return result;
                }
                if (cliResult.exitCode === 0) {
                    stepResult.status = "pass";
                }
                else {
                    // R8.2: "unknown command" in stderr means browser unsupported → inconclusive
                    const errText = (cliResult.stderr ?? "") + (cliResult.stdout ?? "");
                    if (/unknown command|not found|unsupported/i.test(errText)) {
                        result.verdict = "inconclusive";
                        stepResult.status = "skipped";
                        result.steps.push(stepResult);
                        return result;
                    }
                    stepResult.status = "fail";
                    result.verdict = "fail";
                    result.failures.push({
                        step: step.name,
                        stderr: (cliResult.stderr ?? "").slice(0, 200),
                    });
                }
            }
            catch {
                stepResult.status = "error";
                result.verdict = "inconclusive";
            }
            result.steps.push(stepResult);
            if (result.verdict === "fail")
                break;
        }
        // R8.3: all passed
        if (result.verdict !== "fail" && result.steps.every((s) => s.status === "pass")) {
            result.verdict = "pass";
        }
        // R8.5: write verdict artifact
        if (writeArtifact && existsSync(forgeDir)) {
            const artifactPath = join(forgeDir, ".cmux-browser-qa.json");
            writeFileSync(artifactPath, JSON.stringify(result, null, 2));
        }
    }
    catch {
        // R8.8: never throw
        result.verdict = "inconclusive";
    }
    return result;
}
// CLI entry point
const args = process.argv.slice(2);
if (args.length > 0 && args[0] !== "--test") {
    const forgeDir = args[0] || ".forge";
    if (forgeDir.includes("..")) {
        process.exit(1);
    }
    runBrowserQa({ forgeDir, writeArtifact: true })
        .then((result) => {
        console.log(JSON.stringify(result));
        process.exit(result.verdict === "pass" ? 0 : 1);
    })
        .catch(() => process.exit(1));
}
//# sourceMappingURL=browser-qa.mjs.map