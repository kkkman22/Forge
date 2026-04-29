export function createLogEntry(event, level, message, context = {}, metadata) {
    return {
        timestamp: new Date().toISOString(),
        level,
        event,
        message,
        ...context,
        ...(metadata !== undefined ? { metadata } : {}),
    };
}
//# sourceMappingURL=log-entry.js.map