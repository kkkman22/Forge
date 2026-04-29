import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface PidFileContent {
  sessionPid: number;
  sessionPgid: number;
  sessionStartTime: number;
  processes: Array<{ pid: number; source: string }>;
}

export interface OrphanProcess {
  pid: number;
  command: string;
  elapsedSeconds: number;
  source: "pid-file" | "ppid-detection";
}

export function writePidFile(sessionId: string, content: PidFileContent, baseDir: string): void {
  const dir = join(baseDir, ".pids");
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // Directory may already exist
  }
  const filePath = join(dir, `session-${sessionId}.pid`);
  try {
    writeFileSync(filePath, JSON.stringify(content, null, 2), "utf-8");
  } catch (err: any) {
    console.warn(`Failed to write PID file: ${err.message}`);
  }
}

export function readPidFile(filePath: string): PidFileContent | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    if (
      typeof parsed.sessionPid === "number" &&
      typeof parsed.sessionPgid === "number" &&
      typeof parsed.sessionStartTime === "number" &&
      Array.isArray(parsed.processes)
    ) {
      return parsed as PidFileContent;
    }
    return null;
  } catch {
    return null;
  }
}

export function deletePidFile(sessionId: string, baseDir: string): void {
  const filePath = join(baseDir, ".pids", `session-${sessionId}.pid`);
  try {
    unlinkSync(filePath);
  } catch {
    // File may not exist
  }
}

export async function cleanupStaleSessions(baseDir: string): Promise<OrphanProcess[]> {
  const orphans: OrphanProcess[] = [];
  const dir = join(baseDir, ".pids");

  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.startsWith("session-") && f.endsWith(".pid"));
  } catch {
    return orphans;
  }

  for (const file of files) {
    const filePath = join(dir, file);
    const content = readPidFile(filePath);
    if (!content) {
      try {
        unlinkSync(filePath);
      } catch {
        // Ignore
      }
      continue;
    }

    // Check if session process is still alive
    try {
      process.kill(content.sessionPid, 0);
      continue; // Session still running
    } catch {
      // Session is dead — check child processes
    }

    for (const proc of content.processes) {
      try {
        process.kill(proc.pid, 0); // Check if alive
        process.kill(proc.pid, "SIGTERM");
        orphans.push({
          pid: proc.pid,
          command: `session-${content.sessionPid}`,
          elapsedSeconds: Math.floor((Date.now() - content.sessionStartTime) / 1000),
          source: "pid-file",
        });
      } catch {
        // Already exited
      }
    }

    try {
      unlinkSync(filePath);
    } catch {
      // Ignore
    }
  }

  return orphans;
}

export async function detectPpidOrphans(
  patterns: string[],
  maxAgeSeconds: number,
): Promise<OrphanProcess[]> {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    return [];
  }

  const orphans: OrphanProcess[] = [];
  let output: string;
  try {
    output = execSync("ps -eo pid,ppid,etime,command", { encoding: "utf-8", timeout: 5000 });
  } catch {
    return orphans;
  }

  const lines = output.trim().split("\n").slice(1); // Skip header
  for (const line of lines) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
    if (!match) continue;

    const [, pidStr, ppidStr, etime, command] = match;
    const ppid = Number(ppidStr);
    const pid = Number(pidStr);

    if (ppid !== 1) continue;

    const matchesPattern = patterns.some((p) => command.includes(p));
    if (!matchesPattern) continue;

    const elapsedSeconds = parseEtimeToSeconds(etime);
    if (elapsedSeconds < maxAgeSeconds) continue;

    orphans.push({ pid, command: command.trim(), elapsedSeconds, source: "ppid-detection" });
  }

  return orphans;
}

export function cleanupOrphans(
  orphans: OrphanProcess[],
  autoKillThresholdSeconds: number,
): { killed: number[]; warned: number[] } {
  const killed: number[] = [];
  const warned: number[] = [];

  for (const orphan of orphans) {
    if (orphan.elapsedSeconds > autoKillThresholdSeconds) {
      try {
        process.kill(orphan.pid, "SIGTERM");
        killed.push(orphan.pid);
      } catch {
        // Already exited
      }
    } else {
      console.warn(
        `Orphan process detected (PID ${orphan.pid}, running ${orphan.elapsedSeconds}s): ${orphan.command}`,
      );
      warned.push(orphan.pid);
    }
  }

  return { killed, warned };
}

function parseEtimeToSeconds(etime: string): number {
  // Format: "MM:SS" or "HH:MM:SS" or "D-HH:MM:SS" or "D-" for days
  if (etime.includes("-")) {
    const parts = etime.split("-");
    const days = Number(parts[0]);
    const timeParts = parts[1].split(":").map(Number);
    return days * 86400 + timeParts[0] * 3600 + (timeParts[1] || 0) * 60 + (timeParts[2] || 0);
  }
  const parts = etime.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}
