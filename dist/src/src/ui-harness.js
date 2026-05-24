/**
 * UI harness orchestrator — selects and runs the appropriate tier.
 *
 * 4-tier priority: project > cmux-browser > playwright > cdp
 * All tiers fail → INCONCLUSIVE [R6.8]
 *
 * **Validates: Requirements R6.2, R6.5, R6.6, R6.8**
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCdpHarness } from "./harness-cdp.js";
import { runCmuxBrowserHarness } from "./harness-cmux-browser.js";
import { detectCmuxAvailable, detectProjectHarness } from "./harness-detector.js";
import { runPlaywrightHarness } from "./harness-playwright.js";
export async function runUiHarness(opts) {
    const attempted = [];
    const forgeDir = opts.forgeDir ?? join(process.cwd(), ".forge");
    const artifactsDir = join(forgeDir, "findings", opts.topic, "ui-harness");
    // Tier 1: Project harness
    const projectHarness = await detectProjectHarness("ui");
    if (projectHarness) {
        attempted.push({ tier: "project", reason: `Found: ${projectHarness}` });
        return writeResult(artifactsDir, {
            verdict: "INCONCLUSIVE",
            controllerUsed: "project",
            controllersAttempted: attempted,
            artifactsDir,
        });
    }
    attempted.push({ tier: "project", reason: "No project UI harness found" });
    // Tier 2: cmux-browser
    const cmuxAvailable = await detectCmuxAvailable();
    if (cmuxAvailable) {
        const result = await runCmuxBrowserHarness({
            appUrl: opts.appUrl,
            designerSpecPath: opts.designerSpecPath,
        });
        if (result.ok) {
            return writeResult(artifactsDir, {
                verdict: "VERIFIED",
                controllerUsed: "cmux-browser",
                controllersAttempted: attempted,
                artifactsDir,
            });
        }
        attempted.push({
            tier: "cmux-browser",
            reason: result.reason ?? "cmux browser execution failed",
        });
    }
    else {
        attempted.push({ tier: "cmux-browser", reason: "cmux not available" });
    }
    // Tier 3: playwright
    const pwResult = await runPlaywrightHarness({
        appUrl: opts.appUrl,
        designerSpecPath: opts.designerSpecPath,
    });
    if (pwResult.ok) {
        return writeResult(artifactsDir, {
            verdict: "VERIFIED",
            controllerUsed: "playwright",
            controllersAttempted: attempted,
            artifactsDir,
        });
    }
    attempted.push({ tier: "playwright", reason: pwResult.reason ?? "Playwright execution failed" });
    // Tier 4: CDP
    const cdpResult = await runCdpHarness({ appUrl: opts.appUrl });
    if (cdpResult.ok) {
        return writeResult(artifactsDir, {
            verdict: "VERIFIED",
            controllerUsed: "cdp",
            controllersAttempted: attempted,
            artifactsDir,
        });
    }
    attempted.push({ tier: "cdp", reason: cdpResult.reason ?? "CDP connection failed" });
    // All tiers failed [R6.8]
    return writeResult(artifactsDir, {
        verdict: "INCONCLUSIVE",
        controllerUsed: null,
        controllersAttempted: attempted,
        artifactsDir,
    });
}
function writeResult(artifactsDir, verdict) {
    try {
        mkdirSync(artifactsDir, { recursive: true });
        writeFileSync(join(artifactsDir, "controllers-attempted.json"), JSON.stringify(verdict.controllersAttempted, null, 2));
        writeFileSync(join(artifactsDir, "verdict.md"), `---\nverdict: ${verdict.verdict}\ncontroller: ${verdict.controllerUsed ?? "none"}\n---\n`);
    }
    catch {
        // Artifact write failure is non-fatal
    }
    return verdict;
}
//# sourceMappingURL=ui-harness.js.map