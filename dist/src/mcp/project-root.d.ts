export interface ResolvedRoot {
    path: string;
    source: "env" | "cwd";
}
export declare function resolveProjectRoot(env?: NodeJS.ProcessEnv): ResolvedRoot;
export declare function logResolvedRoot(resolved: ResolvedRoot): void;
