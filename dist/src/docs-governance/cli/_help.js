export function formatHelp(scriptName, description, options) {
    const lines = [`Usage: ${scriptName} [options]`, "", description, "", "Options:"];
    for (const opt of options) {
        lines.push(`  ${opt}`);
    }
    lines.push("");
    return lines.join("\n");
}
const COMMON_OPTIONS = [
    "--json     Output diagnostics as NDJSON",
    "--help     Show this help message",
];
export function commonHelp(scriptName, description) {
    return formatHelp(scriptName, description, COMMON_OPTIONS);
}
//# sourceMappingURL=_help.js.map