import { execFileSync } from "node:child_process";
/** @internal */
export async function getDescendants(pid) {
    try {
        const output = execFileSync("pgrep", ["-P", String(pid)], {
            encoding: "utf-8",
            timeout: 5000,
        });
        const childPids = output
            .trim()
            .split("\n")
            .filter(Boolean)
            .map(Number)
            .filter((p) => Number.isFinite(p) && p > 0 && Number.isInteger(p));
        const nodes = [];
        for (const childPid of childPids) {
            let command = "";
            try {
                command = execFileSync("ps", ["-p", String(childPid), "-o", "comm="], {
                    encoding: "utf-8",
                }).trim();
            }
            catch {
                // Process may have exited
            }
            const children = await getDescendants(childPid);
            nodes.push({ pid: childPid, command, children });
        }
        return nodes;
    }
    catch {
        return [];
    }
}
/** @internal */
export async function killProcessTree(pid, signal = "SIGTERM", timeoutMs = 3000) {
    const killed = [];
    const failed = [];
    // Collect all PIDs in leaf-to-root order
    const allPids = await collectPidsLeafToRoot(pid);
    // Send signal to all (leaf to root)
    for (const p of allPids) {
        try {
            process.kill(p, signal);
            killed.push(p);
        }
        catch (err) {
            if (err.code !== "ESRCH") {
                failed.push(p);
            }
            else {
                killed.push(p); // Already exited
            }
        }
    }
    // Wait and escalate to SIGKILL for those still alive
    if (signal !== "SIGKILL" && timeoutMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, timeoutMs));
        for (const p of killed) {
            try {
                process.kill(p, 0); // Check if still alive
                process.kill(p, "SIGKILL");
            }
            catch {
                // Already exited
            }
        }
    }
    return { killed, failed };
}
async function collectPidsLeafToRoot(pid) {
    const descendants = await getDescendants(pid);
    const result = [];
    function flattenLeavesFirst(nodes) {
        for (const node of nodes) {
            flattenLeavesFirst(node.children);
            result.push(node.pid);
        }
    }
    flattenLeavesFirst(descendants);
    result.push(pid); // Root last
    return result;
}
/** @internal */
export function killProcessGroup(pgid, signal = "SIGTERM") {
    try {
        process.kill(-pgid, signal);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=process-tree-cleaner.js.map