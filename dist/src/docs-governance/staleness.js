export function classifyStaleness(fm, today, config, filePath) {
    // Check exempt paths
    if (filePath && config.exempt_paths.includes(filePath)) {
        return "fresh";
    }
    const updated = fm.updated;
    if (!updated)
        return "invalid";
    // Validate YYYY-MM-DD format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(updated))
        return "invalid";
    const updatedDate = new Date(`${updated}T00:00:00Z`);
    if (Number.isNaN(updatedDate.getTime()))
        return "invalid";
    const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    // Future date → invalid
    if (updatedDate > todayUtc)
        return "invalid";
    const diffMs = todayUtc.getTime() - updatedDate.getTime();
    const daysDiff = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (daysDiff > config.critical_days)
        return "critical";
    if (daysDiff > config.warning_days)
        return "warning";
    return "fresh";
}
//# sourceMappingURL=staleness.js.map