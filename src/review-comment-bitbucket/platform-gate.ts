import type { GateInput, GateResult } from "./types.js";

/**
 * Check if a URL host contains "bitbucket." subdomain
 */
export function isBitbucketUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    // Handle SCP-style URLs (git@host:path)
    if (url.startsWith("git@")) {
      const atIdx = url.indexOf("@");
      const colonIdx = url.indexOf(":");
      if (atIdx !== -1 && colonIdx !== -1 && colonIdx > atIdx) {
        const host = url.substring(atIdx + 1, colonIdx).toLowerCase();
        return host.includes("bitbucket.");
      }
    }

    // Handle HTTP/HTTPS URLs
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.toLowerCase().includes("bitbucket.");
  } catch {
    return false;
  }
}

/**
 * Parse a remote URL to extract host and port
 * Supports HTTPS, SSH (git@host:path), and IPv6 URLs
 */
export function parseRemoteUrl(url: string): { host: string; port: number | null } | null {
  if (!url) return null;

  try {
    // Handle SCP-style URLs: git@host:path
    if (url.startsWith("git@")) {
      const atIdx = url.indexOf("@");
      const colonIdx = url.indexOf(":");
      if (atIdx !== -1 && colonIdx !== -1 && colonIdx > atIdx) {
        let hostPort = url.substring(atIdx + 1, colonIdx);

        // Handle IPv6: [::1] or [::1]:port
        if (hostPort.startsWith("[")) {
          const closeBracket = hostPort.indexOf("]");
          if (closeBracket === -1) return null;

          const host = hostPort.substring(1, closeBracket).toLowerCase();
          let port: number | null = null;

          if (closeBracket + 1 < hostPort.length && hostPort[closeBracket + 1] === ":") {
            const portStr = hostPort.substring(closeBracket + 2);
            port = parseInt(portStr, 10);
            if (isNaN(port) || port < 1 || port > 65535) return null;
          }

          return { host, port };
        }

        // Regular host:port
        const portColonIdx = hostPort.indexOf(":");
        let host: string;
        let port: number | null = null;

        if (portColonIdx !== -1) {
          host = hostPort.substring(0, portColonIdx).toLowerCase();
          const portStr = hostPort.substring(portColonIdx + 1);
          port = parseInt(portStr, 10);
          if (isNaN(port) || port < 1 || port > 65535) return null;
        } else {
          host = hostPort.toLowerCase();
        }

        return { host, port };
      }
    }

    // Handle HTTP/HTTPS URLs (including IPv6)
    let normalizedUrl = url;
    if (!url.startsWith("http")) {
      normalizedUrl = `https://${url}`;
    }

    const parsed = new URL(normalizedUrl);

    // URL API keeps brackets for IPv6, so strip them manually
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith("[") && host.endsWith("]")) {
      host = host.substring(1, host.length - 1);
    }
    let port: number | null = parsed.port ? parseInt(parsed.port, 10) : null;

    return { host, port };
  } catch {
    return null;
  }
}

/**
 * Compare two URLs to see if they have the same host and port
 * Case-insensitive, ignores scheme, path, query, fragment
 */
export function isSameHost(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const parsedA = parseRemoteUrl(a);
  const parsedB = parseRemoteUrl(b);

  if (!parsedA || !parsedB) return false;

  return parsedA.host === parsedB.host && parsedA.port === parsedB.port;
}

/**
 * Select the best remote URL from a list of remotes
 * Priority: origin > upstream > first same-host > null
 */
export function selectRemoteUrl(
  remotes: Array<{ name: string; url: string }>,
  mcpBaseUrl: string | null
): string | null {
  if (!remotes.length) return null;

  // Check for origin first
  const origin = remotes.find(r => r.name === "origin");
  if (origin) return origin.url;

  // Check for upstream second
  const upstream = remotes.find(r => r.name === "upstream");
  if (upstream) return upstream.url;

  // Find first remote with same host as mcpBaseUrl
  if (mcpBaseUrl) {
    const sameHost = remotes.find(r => isSameHost(r.url, mcpBaseUrl));
    if (sameHost) return sameHost.url;
  }

  return null;
}

/**
 * Check the platform gate based on the decision matrix
 */
export function checkPlatformGate(input: GateInput): GateResult {
  const { remoteUrl, platformOverride, mcpConfigured, mcpBaseUrl } = input;

  // Row 8: override=none → platform-disabled-by-config (highest priority)
  if (platformOverride === "none") {
    return { skip: true, reason: "platform-disabled-by-config" };
  }

  // Rows 5-7: override=bitbucket
  if (platformOverride === "bitbucket") {
    if (!mcpConfigured) {
      // Row 7: override=bitbucket, MCP NOT configured
      return { skip: true, reason: "override-but-mcp-missing" };
    }

    if (mcpBaseUrl && remoteUrl && isSameHost(remoteUrl, mcpBaseUrl)) {
      // Row 5: override=bitbucket, MCP configured, same-host → pass (forced)
      return { skip: false };
    }

    // Row 6: override=bitbucket, MCP configured, NOT same-host
    return { skip: true, reason: "mcp-base-url-mismatch" };
  }

  // Rows 1-4: override=auto
  if (!isBitbucketUrl(remoteUrl)) {
    // Row 4: URL does NOT have bitbucket. (or null)
    return { skip: true, reason: "platform-not-bitbucket" };
  }

  if (!mcpConfigured) {
    // Row 3: URL has bitbucket., MCP NOT configured
    return { skip: true, reason: "mcp-not-configured" };
  }

  // At this point: URL has bitbucket., override=auto, MCP configured
  if (mcpBaseUrl && remoteUrl && isSameHost(remoteUrl, mcpBaseUrl)) {
    // Row 1: same-host → pass
    return { skip: false };
  }

  // Row 2: NOT same-host → mcp-base-url-mismatch
  return { skip: true, reason: "mcp-base-url-mismatch" };
}