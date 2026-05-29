declare const DocPathBrand: unique symbol;
export type DocPath = string & {
    readonly [DocPathBrand]: undefined;
};
export type Domain = "A" | "B" | "C" | "D" | "EXCLUDED";
export type Category = "getting-started" | "daily-use" | "advanced" | "troubleshooting" | "contributing" | "reference" | "audits";
export type Audience = "new-user" | "daily-developer" | "advanced-user" | "contributor" | "maintainer" | "auditor";
export interface Frontmatter {
    readonly title: string;
    readonly category: Category;
    readonly audience: readonly Audience[];
    readonly updated: string;
    readonly owner: string;
    readonly mirror_of?: string;
}
export interface Doc {
    readonly path: DocPath;
    readonly domain: Domain;
    readonly frontmatter: Frontmatter;
    readonly bodyHash: string;
}
export type PairState = "paired" | "cn-only" | "en-only" | "orphan_mirror";
export interface DocPair {
    readonly slug: string;
    readonly directory: DocPath;
    readonly cn?: Doc;
    readonly en?: Doc;
    readonly state: PairState;
}
export type Severity = "critical" | "error" | "warning" | "notice" | "info";
export interface DiagnosticRecord {
    readonly script: string;
    readonly severity: Severity;
    readonly file: DocPath;
    readonly message: string;
    readonly line?: number;
    readonly column?: number;
    readonly code?: string;
    readonly extra?: Readonly<Record<string, string | number | boolean>>;
}
export declare const ExitCode: {
    readonly OK: 0;
    readonly ERROR: 1;
    readonly CRITICAL: 2;
    readonly INTERNAL: 3;
};
export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
export interface SsotRegistryEntry {
    readonly topic: string;
    readonly source: string;
    readonly renderer: string;
}
export interface EmbedDirective {
    readonly file: DocPath;
    readonly topic: string;
    readonly render: string;
    readonly args: Readonly<Record<string, string>>;
    readonly beginLine: number;
    readonly endLine: number;
    readonly innerContent: string;
    readonly kind: "ssot-block" | "file-embed";
}
export interface RenderInput {
    readonly topic: string;
    readonly renderer: string;
    readonly args: Readonly<Record<string, string>>;
    readonly source: unknown;
}
export interface RenderResult {
    readonly markdown: string;
    readonly diagnostics: readonly DiagnosticRecord[];
}
export type RendererFn = (input: RenderInput) => RenderResult;
export interface RendererRegistry {
    register(name: string, fn: RendererFn): void;
    resolve(name: string): RendererFn | undefined;
    list(): readonly string[];
}
export interface Config {
    readonly docs: {
        readonly max_count: number;
        readonly root_whitelist: readonly string[];
        readonly ssot_sources: readonly SsotRegistryEntry[];
        readonly grace_period_until?: string;
    };
    readonly staleness: {
        readonly warning_days: number;
        readonly critical_days: number;
        readonly exempt_paths: readonly string[];
        readonly warning_log_cap: number;
    };
    readonly diagnosticsFromConfigLoad: readonly DiagnosticRecord[];
}
export {};
