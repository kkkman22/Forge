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
/**
 * 创建双写 LogSink：将每条日志同时发送到两个 LogSink。
 * 用于 --log-file 场景：stdout + 文件同时输出。
 *
 * 如果 secondary（文件写入）抛出异常，primary（stdout）不受影响，
 * secondary 异常降级为 stderr 警告。
 */
export function createDualSink(primary, secondary) {
    return {
        log(entry) {
            primary.log(entry);
            try {
                secondary.log(entry);
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`[WARN] Secondary log sink failed: ${message}`);
            }
        },
        getConfig() {
            return primary.getConfig();
        },
    };
}
//# sourceMappingURL=log-sink.js.map