export function phaseToIcon(phase: any): any;
export function tierToColor(tier: any): any;
export const PHASE_TO_ICON: Readonly<{
    decide: "brain";
    spec: "doc.text";
    plan: "list.bullet";
    build: "hammer";
    review: "checkmark.seal";
    test: "testtube.2";
    ship: "paperplane";
    learn: "book";
    debug: "ant";
    idle: "circle";
}>;
export const DEFAULT_ICON: "circle";
export const TIER_TO_COLOR: Readonly<{
    light: "#22c55e";
    standard: "#3b82f6";
    full: "#ef4444";
}>;
export const LOOP_STATE_TO_ICON: Readonly<{
    running: {
        icon: string;
        color: string;
    };
    interrupted: {
        icon: string;
        color: string;
    };
    terminated: {
        icon: string;
        color: string;
    };
}>;
