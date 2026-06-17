/**
 * AgentBrowserClient — abstraction over the Vercel agent-browser Rust CLI.
 * [Spec R1-AC3, NFR-3]
 *
 * This interface is the TEST BOUNDARY: production code uses AgentBrowserCliClient
 * (child_process.execFile); tests inject FakeAgentBrowserClient so no real
 * browser is started. Instinct: external commands via descriptor + execFile.
 */

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
      return this.queue.shift()!;
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
