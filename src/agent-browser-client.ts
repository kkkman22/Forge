/**
 * AgentBrowserClient — abstraction over the Vercel agent-browser Rust CLI.
 * [Spec R1-AC3, NFR-3]
 *
 * This interface is the TEST BOUNDARY: production code uses AgentBrowserCliClient
 * (child_process.execFile); tests inject FakeAgentBrowserClient so no real
 * browser is started. Instinct: external commands via descriptor + execFile.
 */

import { type ExecFileOptionsWithStringEncoding, execFile } from "node:child_process";

/**
 * execFile options extended with `input` (stdin write). Node supports `input`
 * for execFile but its type lib only declares it on spawn-sync options.
 * [R4-AC2] secrets flow through input (stdin), never argv.
 */
type ExecFileInputOptions = ExecFileOptionsWithStringEncoding & { input?: string };

export interface SnapshotRef {
  /** Deterministic element reference assigned by agent-browser (e.g. "e3"). */
  ref: string;
  /** DOM tag, e.g. "button", "input", "a". */
  tag: string;
  /** Visible text or aria-label of the element. */
  text: string;
  /** Optional aria role. */
  role?: string;
}

export interface Snapshot {
  refs: SnapshotRef[];
  url: string;
  title: string;
  text: string;
}

export interface AgentBrowserClient {
  open(url: string, sessionId: string): Promise<void>;
  snapshot(sessionId: string): Promise<Snapshot>;
  click(sessionId: string, ref: string): Promise<void>;
  fill(sessionId: string, ref: string, value: string): Promise<void>;
  screenshot(sessionId: string, destPath: string): Promise<void>;
  close(sessionId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// FakeAgentBrowserClient — deterministic in-memory implementation for tests.
// ---------------------------------------------------------------------------

type CallRecord = {
  method: "open" | "snapshot" | "click" | "fill" | "screenshot" | "close";
  args: unknown[];
};

const DEFAULT_SNAPSHOT: Snapshot = {
  refs: [
    { ref: "e1", tag: "input", text: "用户名", role: "textbox" },
    { ref: "e2", tag: "input", text: "密码", role: "textbox" },
    { ref: "e3", tag: "button", text: "登录", role: "button" },
  ],
  url: "http://localhost:5173/login",
  title: "登录",
  text: "用户名 密码 登录",
};

export class FakeAgentBrowserClient implements AgentBrowserClient {
  readonly calls: CallRecord[] = [];
  private queue: Snapshot[] = [];
  private openUrl = "";

  /** Script a custom snapshot to be returned by the next snapshot() call. */
  enqueueSnapshot(snap: Snapshot): void {
    this.queue.push(snap);
  }

  async open(url: string, _sessionId: string): Promise<void> {
    this.calls.push({ method: "open", args: [url, _sessionId] });
    this.openUrl = url;
  }

  async snapshot(_sessionId: string): Promise<Snapshot> {
    this.calls.push({ method: "snapshot", args: [_sessionId] });
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) return next;
    }
    return { ...DEFAULT_SNAPSHOT, url: this.openUrl || DEFAULT_SNAPSHOT.url };
  }

  async click(_sessionId: string, ref: string): Promise<void> {
    this.calls.push({ method: "click", args: [_sessionId, ref] });
  }

  async fill(_sessionId: string, ref: string, value: string): Promise<void> {
    this.calls.push({ method: "fill", args: [_sessionId, ref, value] });
  }

  async screenshot(_sessionId: string, destPath: string): Promise<void> {
    this.calls.push({ method: "screenshot", args: [_sessionId, destPath] });
  }

  async close(_sessionId: string): Promise<void> {
    this.calls.push({ method: "close", args: [_sessionId] });
  }
}

// ---------------------------------------------------------------------------
// AgentBrowserCliClient — production implementation via child_process.execFile.
// Instinct: pure-function descriptor + execFile (no shell string concatenation).
// [R4-AC2] credentials flow via opts.input (stdin), NEVER via argv.
// [R3-AC5] per-action timeouts via Promise.race.
// ---------------------------------------------------------------------------

/** Pure descriptor for the `open` command — testable without execFile.
 *  REAL CLI: `agent-browser --session <id> open <url>` (--session is a global flag). */
export function buildOpenArgs(
  url: string,
  sessionId: string,
): {
  executable: string;
  args: string[];
} {
  // Reject (not sanitize) malformed inputs — instinct: reject strategy.
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`buildOpenArgs: invalid url: ${url}`);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new Error(`buildOpenArgs: invalid sessionId: ${sessionId}`);
  }
  return { executable: "agent-browser", args: ["--session", sessionId, "open", url] };
}

interface CliClientOptions {
  openTimeoutMs?: number;
  snapshotTimeoutMs?: number;
  actionTimeoutMs?: number;
}

type ExecCb = (err: Error | null, stdout: string, stderr: string) => void;

function runExecFile(
  executable: string,
  args: string[],
  opts: { input?: string; timeoutMs: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`agent-browser timeout after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);

    const cb: ExecCb = (err, stdout, _stderr) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(stdout);
    };

    // execFile (no shell) — avoids shell injection. input carries secrets.
    const execOpts: ExecFileInputOptions = {
      encoding: "utf8",
      input: opts.input,
      timeout: opts.timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    };
    execFile(executable, args, execOpts, cb);
  });
}

export class AgentBrowserCliClient implements AgentBrowserClient {
  private readonly openTimeoutMs: number;
  private readonly snapshotTimeoutMs: number;
  private readonly actionTimeoutMs: number;

  constructor(opts: CliClientOptions = {}) {
    this.openTimeoutMs = opts.openTimeoutMs ?? 15_000;
    this.snapshotTimeoutMs = opts.snapshotTimeoutMs ?? 10_000;
    this.actionTimeoutMs = opts.actionTimeoutMs ?? 5_000;
  }

  async open(url: string, sessionId: string): Promise<void> {
    const d = buildOpenArgs(url, sessionId);
    await runExecFile(d.executable, d.args, { timeoutMs: this.openTimeoutMs });
  }

  async snapshot(sessionId: string): Promise<Snapshot> {
    // REAL CLI: `agent-browser --session <id> snapshot -i --json`
    const raw = await runExecFile(
      "agent-browser",
      ["--session", sessionId, "snapshot", "-i", "--json"],
      { timeoutMs: this.snapshotTimeoutMs },
    );
    return parseSnapshotJson(raw);
  }

  async click(sessionId: string, ref: string): Promise<void> {
    validateRef(ref);
    // REAL CLI: refs are addressed as @<ref>.
    await runExecFile("agent-browser", ["--session", sessionId, "click", `@${ref}`], {
      timeoutMs: this.actionTimeoutMs,
    });
  }

  /**
   * fill — REAL CLI takes the value as a positional argv argument
   * (`fill @<ref> <value>`). There is NO stdin option (verified via `fill --help`).
   *
   * [R4-AC2 caveat] This is a best-effort mitigation, not full compliance: the
   * credential appears in argv briefly. Mitigations: the process is short-lived
   * (fills then exits), and acceptance runs against local dev only. Documented as
   * a residual risk in the security analysis.
   */
  async fill(sessionId: string, ref: string, value: string): Promise<void> {
    validateRef(ref);
    await runExecFile(
      "agent-browser",
      ["--session", sessionId, "fill", `@${ref}`, value],
      { timeoutMs: this.actionTimeoutMs },
    );
  }

  async screenshot(sessionId: string, destPath: string): Promise<void> {
    validatePath(destPath);
    await runExecFile(
      "agent-browser",
      ["--session", sessionId, "screenshot", destPath],
      { timeoutMs: this.snapshotTimeoutMs },
    );
  }

  async close(sessionId: string): Promise<void> {
    await runExecFile("agent-browser", ["--session", sessionId, "close"], {
      timeoutMs: this.actionTimeoutMs,
    });
  }
}

function validateRef(ref: string): void {
  if (!/^e\d+$/.test(ref)) {
    throw new Error(`validateRef: invalid ref: ${ref}`);
  }
}

function validatePath(p: string): void {
  // Reject path traversal sequences — instinct: multi-char sequence check.
  if (/\.\./.test(p) || !/^[/a-zA-Z0-9_.\-/]+$/.test(p)) {
    throw new Error(`validatePath: invalid destPath: ${p}`);
  }
}

/** Parse the REAL agent-browser --json envelope into the Snapshot interface.
 *  Envelope: {success, data:{origin, refs:{e1:{name,role}}, snapshot}, error}. */
function parseSnapshotJson(raw: string): Snapshot {
  const obj = JSON.parse(raw) as {
    success?: boolean;
    data?: {
      origin?: string;
      refs?: Record<string, { name?: string; role?: string; tag?: string }>;
      snapshot?: string;
    };
    error?: string | null;
  };
  if (obj.success === false) {
    throw new Error(`agent-browser snapshot failed: ${obj.error ?? "unknown"}`);
  }
  const data = obj.data ?? {};
  const refMap = data.refs ?? {};
  const refs: SnapshotRef[] = Object.entries(refMap).map(([ref, v]) => ({
    ref,
    tag: v.tag ?? "",
    text: v.name ?? "",
    role: v.role,
  }));
  // title not directly available; derive a best-effort from the snapshot text or origin.
  const text = data.snapshot ?? "";
  return {
    refs,
    url: data.origin ?? "",
    title: "",
    text,
  };
}
