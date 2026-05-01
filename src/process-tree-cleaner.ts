import { execFileSync } from "node:child_process";

export interface ProcessTreeNode {
  pid: number;
  command: string;
  children: ProcessTreeNode[];
}

export async function getDescendants(pid: number): Promise<ProcessTreeNode[]> {
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

    const nodes: ProcessTreeNode[] = [];
    for (const childPid of childPids) {
      let command = "";
      try {
        command = execFileSync("ps", ["-p", String(childPid), "-o", "comm="], {
          encoding: "utf-8",
        }).trim();
      } catch {
        // Process may have exited
      }
      const children = await getDescendants(childPid);
      nodes.push({ pid: childPid, command, children });
    }
    return nodes;
  } catch {
    return [];
  }
}

export async function killProcessTree(
  pid: number,
  signal: NodeJS.Signals = "SIGTERM",
  timeoutMs = 3000,
): Promise<{ killed: number[]; failed: number[] }> {
  const killed: number[] = [];
  const failed: number[] = [];

  // Collect all PIDs in leaf-to-root order
  const allPids = await collectPidsLeafToRoot(pid);

  // Send signal to all (leaf to root)
  for (const p of allPids) {
    try {
      process.kill(p, signal);
      killed.push(p);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ESRCH") {
        failed.push(p);
      } else {
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
      } catch {
        // Already exited
      }
    }
  }

  return { killed, failed };
}

async function collectPidsLeafToRoot(pid: number): Promise<number[]> {
  const descendants = await getDescendants(pid);
  const result: number[] = [];

  function flattenLeavesFirst(nodes: ProcessTreeNode[]): void {
    for (const node of nodes) {
      flattenLeavesFirst(node.children);
      result.push(node.pid);
    }
  }

  flattenLeavesFirst(descendants);
  result.push(pid); // Root last
  return result;
}

export function killProcessGroup(pgid: number, signal: NodeJS.Signals = "SIGTERM"): boolean {
  try {
    process.kill(-pgid, signal);
    return true;
  } catch {
    return false;
  }
}
