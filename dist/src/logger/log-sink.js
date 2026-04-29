const LEVEL_ORDER = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape detection requires matching ESC
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
const CRLF_RE = /[\r\n]/g;
function sanitizeText(input) {
    return input.replace(ANSI_RE, "").replace(CRLF_RE, " ");
}
export function shouldLog(entryLevel, configLevel) {
    return LEVEL_ORDER[entryLevel] >= LEVEL_ORDER[configLevel];
}
export function formatAsJson(entry) {
    return JSON.stringify(entry);
}
export function formatAsText(entry) {
    const prefix = `[${entry.level.toUpperCase()}]`;
    const ctx = entry.iteration !== undefined ? ` (iter ${entry.iteration})` : "";
    return `${prefix} ${sanitizeText(entry.event)}${ctx}: ${sanitizeText(entry.message)}`;
}
export function formatEntry(entry, config) {
    if (config.format === "json") {
        return formatAsJson(entry);
    }
    return formatAsText(entry);
}
export function createLogSink(config, output = console.log) {
    return {
        log(entry) {
            if (!shouldLog(entry.level, config.level))
                return;
            output(formatEntry(entry, config));
        },
        getConfig() {
            return config;
        },
    };
}
//# sourceMappingURL=log-sink.js.map