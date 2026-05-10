import { execFile } from "node:child_process";
let cachedMethods = null;
const CAPABILITY_MAP = {
    "set_status": "set_status",
    "set-progress": "set_progress",
    "set_progress": "set_progress",
    "log": "log",
    "notify": "notification.create",
    "sidebar_state": "sidebar_state",
    "browser.open": "browser.open",
    "browser.identify": "browser.identify",
    "browser.snapshot": "browser.snapshot",
    "browser.click": "browser.click",
    "browser.fill": "browser.fill",
    "browser.wait": "browser.wait",
};
const TIMEOUT_MS = 2000;
/**
 * Load capabilities from cmux CLI. Caches result for process lifetime (R13.5).
 */
export function loadCapabilities(cmuxBin = "cmux") {
    if (cachedMethods !== null)
        return Promise.resolve(cachedMethods);
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            cachedMethods = [];
            resolve([]);
        }, TIMEOUT_MS);
        execFile(cmuxBin, ["capabilities", "--json"], { timeout: TIMEOUT_MS }, (err, stdout) => {
            clearTimeout(timeout);
            if (err) {
                cachedMethods = [];
                resolve([]);
                return;
            }
            try {
                const parsed = JSON.parse(stdout);
                cachedMethods = parsed.methods ?? [];
            }
            catch {
                cachedMethods = [];
            }
            resolve(cachedMethods);
        });
    });
}
/**
 * Check if a capability is available (R13.5).
 * Maps from user-facing names to cmux method names.
 */
export function hasCapability(name) {
    if (!cachedMethods)
        return false;
    const mapped = CAPABILITY_MAP[name] ?? name;
    return cachedMethods.includes(mapped);
}
export function __resetForTest() {
    cachedMethods = null;
}
export function __setCapabilitiesForTest(methods) {
    cachedMethods = methods;
}
//# sourceMappingURL=capabilities.mjs.map