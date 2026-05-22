export const PHASE_TO_ICON = Object.freeze({
    decide: "brain",
    spec: "doc.text",
    plan: "list.bullet",
    build: "hammer",
    review: "checkmark.seal",
    test: "testtube.2",
    ship: "paperplane",
    learn: "book",
    debug: "ant",
    idle: "circle",
});
export const DEFAULT_ICON = "circle";
export const TIER_TO_COLOR = Object.freeze({
    light: "#22c55e",
    standard: "#3b82f6",
    full: "#ef4444",
});
export const LOOP_STATE_TO_ICON = Object.freeze({
    running: { icon: "arrow.triangle.2.circlepath", color: "#3b82f6" },
    interrupted: { icon: "xmark.octagon", color: "#ef4444" },
    terminated: { icon: "checkmark.circle", color: "#22c55e" },
});
export function phaseToIcon(phase) {
    return Object.hasOwn(PHASE_TO_ICON, phase) ? PHASE_TO_ICON[phase] : DEFAULT_ICON;
}
export function tierToColor(tier) {
    return Object.hasOwn(TIER_TO_COLOR, tier) ? TIER_TO_COLOR[tier] : null;
}
//# sourceMappingURL=payload.mjs.map