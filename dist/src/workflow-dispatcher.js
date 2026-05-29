import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
// ---------------------------------------------------------------------------
// probeL0Eligibility — 5-step probe
// ---------------------------------------------------------------------------
export function probeL0Eligibility(ctx) {
    // Step 1: env check
    if (process.env.CLAUDE_CODE_WORKFLOWS !== "1") {
        return { eligible: false, reason: "env_unset" };
    }
    // Step 2: mode check
    if (ctx.mode !== "interactive") {
        return { eligible: false, reason: "non_interactive" };
    }
    // Step 3: workflow file exists + syntax check
    const workflowFile = join(ctx.pluginRoot, "workflows", `${ctx.subcommand}.js`);
    if (!existsSync(workflowFile)) {
        return { eligible: false, reason: "workflow_missing" };
    }
    try {
        execFileSync("node", ["--check", workflowFile], { stdio: "pipe" });
    }
    catch {
        return { eligible: false, reason: "workflow_syntax_error" };
    }
    // Step 4 & 5: concurrency bridge probe
    const concurrencyFile = join(ctx.pluginRoot, "workflows", "lib", "concurrency.js");
    if (!existsSync(concurrencyFile)) {
        return { eligible: false, reason: "concurrency_uncontrolled" };
    }
    try {
        execFileSync("node", ["--check", concurrencyFile], { stdio: "pipe" });
    }
    catch {
        return { eligible: false, reason: "concurrency_uncontrolled" };
    }
    const workflowSrc = readFileSync(workflowFile, "utf-8");
    if (!workflowSrc.includes("from './lib/concurrency") &&
        !workflowSrc.includes('from "./lib/concurrency')) {
        return { eligible: false, reason: "concurrency_uncontrolled" };
    }
    return { eligible: true };
}
// ---------------------------------------------------------------------------
// classifyL0Failure
// ---------------------------------------------------------------------------
export function classifyL0Failure(err) {
    const msg = err.message.toLowerCase();
    if (msg.includes("frozenzone") || msg.includes("frozen_zone"))
        return "frozen_zone_blocked";
    if (msg.includes("schema validation"))
        return "schema_validation_failed";
    if (msg.includes("stuck timeout") || msg.includes("stuck_timeout"))
        return "stuck_timeout";
    if (msg.includes("subprocess") || msg.includes("exit code") || msg.includes("crash"))
        return "subprocess_crash";
    return "bp_exception";
}
// ---------------------------------------------------------------------------
// readWorkflowVersion — extract meta.version from workflow file
// ---------------------------------------------------------------------------
export function readWorkflowVersion(ctx) {
    const workflowFile = join(ctx.pluginRoot, "workflows", `${ctx.subcommand}.js`);
    try {
        const src = readFileSync(workflowFile, "utf-8");
        const match = src.match(/version\s*:\s*['"]([^'"]+)['"]/);
        return match?.[1] ?? "unknown";
    }
    catch {
        return "unknown";
    }
}
// ---------------------------------------------------------------------------
// computeExitCode — map dispatch result to exit code
// ---------------------------------------------------------------------------
export function computeExitCode(result) {
    if (result.chosenLevel === "L3")
        return 2;
    if (result.chosenLevel === "L0")
        return 0;
    if (result.chosenLevel === "L1" && result.l0FailureSignature)
        return 1;
    return 0;
}
// ---------------------------------------------------------------------------
// dispatch — L0 try + L1 fallback + 14-field auto-fill
// ---------------------------------------------------------------------------
export async function dispatch(ctx, deps = {}) {
    const startTime = Date.now();
    const probe = probeL0Eligibility(ctx);
    const gateEnabled = process.env.CLAUDE_CODE_WORKFLOWS === "1";
    const workflowAvailable = probe.eligible;
    const workflowVersion = readWorkflowVersion(ctx);
    let result;
    let frozenZoneBlocked = false;
    if (!probe.eligible) {
        // L1 path
        if (deps.allFallbacksFailed) {
            result = { chosenLevel: "L3", result: "blocked" };
        }
        else {
            const fallbackResult = deps.runFallback
                ? await deps.runFallback(ctx)
                : { output: "subagent fallback", methodology: "subagent-parallel" };
            result = {
                chosenLevel: "L1",
                l1TriggerReason: probe.reason ?? "unmatched_state",
                methodology: fallbackResult?.methodology ?? "subagent-parallel",
                payload: fallbackResult,
            };
        }
    }
    else {
        // L0 path — try workflow
        try {
            const l0Result = deps.tryL0 ? await deps.tryL0(ctx) : { output: "workflow result" };
            result = {
                chosenLevel: "L0",
                methodology: "workflow",
                payload: l0Result,
            };
        }
        catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            const signature = classifyL0Failure(error);
            // Isolate partial findings (R2.8)
            const runDir = join(ctx.forgeRoot, "runs", ctx.runId);
            const partialPath = isolatePartialFindings(runDir, ctx.subcommand, error.message);
            // Fallback to L1, passing precursor_partial cross-reference (R2.8)
            if (deps.allFallbacksFailed) {
                result = { chosenLevel: "L3", result: "blocked" };
            }
            else {
                const fallbackResult = deps.runFallback
                    ? await deps.runFallback(ctx, { precursorPartial: partialPath })
                    : {
                        output: "subagent fallback after L0 failure",
                        methodology: "workflow-then-subagent",
                        precursor_partial: partialPath,
                    };
                result = {
                    chosenLevel: "L1",
                    l0FailureSignature: signature,
                    methodology: "workflow-then-subagent",
                    payload: {
                        ...(fallbackResult ?? {}),
                        precursor_partial: fallbackResult?.precursor_partial ?? partialPath,
                    },
                };
            }
        }
    }
    // Call audit writer (if provided) for non-L3 results
    if (result.chosenLevel !== "L3" && deps.auditWriter && deps.topic) {
        try {
            await deps.auditWriter.write({
                subcommand: ctx.subcommand,
                runId: ctx.runId,
                topic: deps.topic,
                payload: result.payload ?? {},
            });
        }
        catch (err) {
            if (err instanceof Error &&
                (err.constructor.name === "FrozenZoneViolation" || err.message.includes("FrozenZone"))) {
                frozenZoneBlocked = true;
            }
            else {
                throw err;
            }
        }
    }
    // R2.6: when L3 (all fallbacks exhausted), write blocked audit record so
    // forge-ship and downstream consumers see a blocked stub via standard reads.
    if (result.chosenLevel === "L3" && deps.topic) {
        try {
            writeBlockedAuditRecord(ctx.forgeRoot, ctx.subcommand, deps.topic, ctx.runId);
        }
        catch {
            // Audit-write failure must not mask the L3 blocked state itself
        }
    }
    // Build and persist the 14-field dispatch record
    const exitCode = computeExitCode(result);
    const stateId = `wsid_${ctx.runId}_${ctx.subcommand}_${Date.now()}`;
    const record = {
        subcommand: ctx.subcommand,
        mode: ctx.mode,
        run_id: ctx.runId,
        session_id: ctx.sessionId,
        workflow_state_id: stateId,
        workflow_version: workflowVersion,
        gate_enabled: gateEnabled,
        workflow_available: workflowAvailable,
        chosen_level: result.chosenLevel,
        l1_trigger_reason: result.l1TriggerReason,
        l0_failure_signature: result.l0FailureSignature,
        exit_code: exitCode,
        duration_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        frozen_zone_blocked: frozenZoneBlocked,
    };
    const runDir = join(ctx.forgeRoot, "runs", ctx.runId);
    writeDispatchRecord(runDir, record);
    updateStatusMd(join(ctx.forgeRoot, "status.md"), {
        dispatch_chosen_level: result.chosenLevel,
        dispatch_subcommand: ctx.subcommand,
        dispatch_run_id: ctx.runId,
        // R2.6: blocked phase only on L3 (do not overwrite phase on success paths)
        phase: result.chosenLevel === "L3" ? `${ctx.subcommand}-blocked` : undefined,
    });
    return { ...result, record };
}
// ---------------------------------------------------------------------------
// writeDispatchRecord — 14-field JSONL
// ---------------------------------------------------------------------------
export function writeDispatchRecord(runDir, record) {
    mkdirSync(runDir, { recursive: true });
    const line = `${JSON.stringify(record)}\n`;
    appendFileSync(join(runDir, "dispatch.jsonl"), line, "utf-8");
}
// ---------------------------------------------------------------------------
// updateStatusMd — 3 dispatch fields
// ---------------------------------------------------------------------------
export function updateStatusMd(statusPath, fields) {
    let content;
    try {
        content = readFileSync(statusPath, "utf-8");
    }
    catch (err) {
        if (err.code !== "ENOENT")
            throw err;
        content = "---\n---\n";
    }
    // Inject into frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
        let fm = fmMatch[1];
        // Remove existing dispatch fields
        fm = fm.replace(/^dispatch_chosen_level:.*\n?/m, "");
        fm = fm.replace(/^dispatch_subcommand:.*\n?/m, "");
        fm = fm.replace(/^dispatch_run_id:.*\n?/m, "");
        if (fields.phase !== undefined) {
            fm = fm.replace(/^phase:.*\n?/m, "");
        }
        fm += `\ndispatch_chosen_level: ${fields.dispatch_chosen_level}`;
        fm += `\ndispatch_subcommand: ${fields.dispatch_subcommand}`;
        fm += `\ndispatch_run_id: ${fields.dispatch_run_id}`;
        if (fields.phase !== undefined) {
            fm += `\nphase: ${fields.phase}`;
        }
        content = content.replace(fmMatch[0], `---\n${fm}\n---`);
    }
    else {
        const phaseLine = fields.phase !== undefined ? `\nphase: ${fields.phase}` : "";
        content = `---\ndispatch_chosen_level: ${fields.dispatch_chosen_level}\ndispatch_subcommand: ${fields.dispatch_subcommand}\ndispatch_run_id: ${fields.dispatch_run_id}${phaseLine}\n---\n${content}`;
    }
    writeFileSync(statusPath, content, "utf-8");
}
// ---------------------------------------------------------------------------
// isolatePartialFindings — returns absolute path of the partial file (R2.8)
// ---------------------------------------------------------------------------
export function isolatePartialFindings(runDir, subcommand, content) {
    const partialDir = join(runDir, "l0-partial");
    mkdirSync(partialDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${subcommand}-${ts}.md`;
    const fullPath = join(partialDir, filename);
    writeFileSync(fullPath, content, "utf-8");
    return fullPath;
}
// ---------------------------------------------------------------------------
// writeBlockedAuditRecord — R2.6: when chosenLevel = L3, write a blocked
// stub into the audit zone so forge-ship can find it via standard read paths.
// Uses append-only semantics consistent with WorkflowAuditWriter.
// ---------------------------------------------------------------------------
export function writeBlockedAuditRecord(forgeRoot, subcommand, topic, runId) {
    const filename = subcommand === "review" ? `${topic}.md` : `${runId}-blocked.md`;
    const subdir = subcommand === "review"
        ? "reviews"
        : subcommand === "decide"
            ? "decisions"
            : join("knowledge", "sessions");
    const destDir = join(forgeRoot, subdir);
    mkdirSync(destDir, { recursive: true });
    const destPath = join(destDir, filename);
    const stub = [
        "",
        "---",
        `# ${subcommand} (${runId}) — blocked`,
        "",
        "result: blocked",
        "methodology: unavailable",
        "",
        `All fallback levels exhausted. See .forge/runs/${runId}/dispatch.jsonl for details.`,
        "",
    ].join("\n");
    appendFileSync(destPath, stub, "utf-8");
    return destPath;
}
//# sourceMappingURL=workflow-dispatcher.js.map