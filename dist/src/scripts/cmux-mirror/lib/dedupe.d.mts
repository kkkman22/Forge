/**
 * Check dedupe state and record the current timestamp (R6.2).
 * Returns { notify: true } if within-window notification should be sent.
 * Returns { notify: false } if already notified within the window.
 * Fallback: if dedupe dir doesn't exist, returns { notify: true } (R13.11).
 */
export function checkAndRecord(filePath: any, dedupeDir: any, windowMs: any): {
    notify: boolean;
};
