import { formatDiagnostics, formatGitHubAnnotations, formatNdjson, } from "../reporter/diagnostic.js";
import { severityToExitCode } from "../reporter/exit-code.js";
import { ExitCode } from "../types.js";
export function computeExitResult(main) {
    let diagnostics = [];
    try {
        diagnostics = main();
    }
    catch (err) {
        return {
            exitCode: ExitCode.INTERNAL, // 3 — overrides any severity
            diagnostics,
            error: err instanceof Error ? err : new Error(String(err)),
        };
    }
    return {
        exitCode: severityToExitCode(diagnostics),
        diagnostics,
    };
}
export async function run(main, options) {
    let diagnostics = [];
    try {
        diagnostics = await main();
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`${msg}\n`);
        process.exit(ExitCode.INTERNAL);
    }
    if (options?.json) {
        process.stdout.write(`${formatNdjson(diagnostics)}\n`);
    }
    else {
        const output = formatDiagnostics(diagnostics);
        process.stdout.write(`${output}\n`);
    }
    if (process.env.CI === "true") {
        const annotations = formatGitHubAnnotations(diagnostics);
        if (annotations)
            process.stdout.write(`${annotations}\n`);
    }
    process.exit(severityToExitCode(diagnostics));
}
//# sourceMappingURL=_runtime.js.map