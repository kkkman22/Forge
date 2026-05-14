/**
 * Read Forge state from a .forge/ directory.
 * Returns CanonicalSidebarPayload.
 */
export function readForgeState(forgeDir: any): {
    phase: any;
    tier: any;
    task: any;
    progress: {
        total: number;
        done: number;
        in_progress: number;
        pending: number;
    };
    review: {
        completed: boolean;
        layers: any;
    } | null;
};
