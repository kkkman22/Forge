import type { Config, DiagnosticRecord, SsotRegistryEntry } from "../types.js";
export declare function loadSsotRegistry(config: Config, knownRenderers?: ReadonlySet<string>): {
    entries: SsotRegistryEntry[];
    diagnostics: DiagnosticRecord[];
};
