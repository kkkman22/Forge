export function getCachedStatePath(projectName) {
    const sanitized = projectName.replace(/[^a-zA-Z0-9_-]/g, "_");
    return `.forge/cache/login-state-${sanitized}.json`;
}
export function isStateCacheExpired(cookies, expirySafetyDays = 1) {
    const now = Date.now();
    const safetyMs = expirySafetyDays * 24 * 60 * 60 * 1000;
    for (const cookie of cookies) {
        if (cookie.expires === undefined)
            continue;
        if (cookie.expires * 1000 - safetyMs <= now)
            return true;
    }
    return cookies.length === 0;
}
export function promptForManualLogin(surfaceId) {
    return [
        `Login required. Please authenticate in the cmux browser surface ${surfaceId}.`,
        "After logging in, save the state with:",
        `  cmux browser ${surfaceId} state save .forge/cache/login-state-<project>.json`,
        "",
        "Then re-run the frontend check.",
    ].join("\n");
}
//# sourceMappingURL=login-state-cache.js.map