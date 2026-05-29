/**
 * Chat-layer variant override parsing.
 *
 * Extracts a WorkflowVariant from natural language user input.
 * Returns null when no override is detected.
 *
 * Validates: Requirements 2, 8
 */
const ALIASES = [
    {
        variant: "requirements-first",
        patterns: [
            /requirements.?first/i,
            /rf/i,
            /需求优先/,
            /切换[到为].*requirements/i,
            /switch.*to.*requirements/i,
            /use.*requirements/i,
        ],
    },
    {
        variant: "design-first",
        patterns: [
            /design.?first/i,
            /df/i,
            /设计优先/,
            /切换[到为].*design/i,
            /switch.*to.*design/i,
            /use.*design/i,
        ],
    },
    {
        variant: "quick-plan",
        patterns: [
            /quick.?plan/i,
            /qp/i,
            /快速计划/,
            /切换[到为].*quick/i,
            /换成.*quick/i,
            /用.*quick/i,
            /switch.*to.*quick/i,
            /use.*quick/i,
        ],
    },
];
export function parseVariantOverride(text) {
    if (!text || text.trim().length === 0)
        return null;
    const trimmed = text.trim();
    for (const alias of ALIASES) {
        for (const pattern of alias.patterns) {
            if (pattern.test(trimmed)) {
                return alias.variant;
            }
        }
    }
    return null;
}
//# sourceMappingURL=spec-variant-override.js.map