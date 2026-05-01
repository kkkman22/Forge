export interface ProcessTreeNode {
    pid: number;
    command: string;
    children: ProcessTreeNode[];
}
export declare function getDescendants(pid: number): Promise<ProcessTreeNode[]>;
export declare function killProcessTree(pid: number, signal?: NodeJS.Signals, timeoutMs?: number): Promise<{
    killed: number[];
    failed: number[];
}>;
export declare function killProcessGroup(pgid: number, signal?: NodeJS.Signals): boolean;
