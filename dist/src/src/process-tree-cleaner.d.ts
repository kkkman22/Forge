/** @internal */
export interface ProcessTreeNode {
    pid: number;
    command: string;
    children: ProcessTreeNode[];
}
/** @internal */
export declare function getDescendants(pid: number): Promise<ProcessTreeNode[]>;
/** @internal */
export declare function killProcessTree(pid: number, signal?: NodeJS.Signals, timeoutMs?: number): Promise<{
    killed: number[];
    failed: number[];
}>;
/** @internal */
export declare function killProcessGroup(pgid: number, signal?: NodeJS.Signals): boolean;
