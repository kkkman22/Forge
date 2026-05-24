interface HeadingEntry {
  text: string;
  anchor: string;
}

interface ExtractedLink {
  target: string;
  line: number;
  raw: string;
}

export function gfmAnchor(text: string): string {
  // Strip code spans
  let s = text.replace(/`[^`]+`/g, "");
  const out: string[] = [];
  for (const ch of s) {
    if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) {
      out.push(ch);
    } else if (ch >= "A" && ch <= "Z") {
      out.push(ch.toLowerCase());
    } else if (ch === " " || ch === "\t") {
      out.push("-");
    } else if (ch === "-" || ch === "_") {
      out.push(ch);
    } else if (ch >= "一" && ch <= "鿿") {
      // CJK Unified Ideographs — keep as-is
      out.push(ch);
    } else if (ch >= "㐀" && ch <= "䶿") {
      // CJK Extension A
      out.push(ch);
    }
    // else: skip (ASCII punctuation except dash/underscore)
  }
  return collapseDashes(out.join(""));
}

function collapseDashes(s: string): string {
  return s.replace(/-{2,}/g, (m) => "-".repeat(m.length));
}

export function dedupAnchorsInDoc(headings: HeadingEntry[]): void {
  const seen = new Map<string, number>();
  for (const h of headings) {
    const base = gfmAnchor(h.text);
    const n = seen.get(base) ?? 0;
    h.anchor = n === 0 ? base : `${base}-${n}`;
    seen.set(base, n + 1);
  }
}

export function extractLinks(text: string): ExtractedLink[] {
  const lines = text.split("\n");
  const links: ExtractedLink[] = [];
  let inFencedCode = false;
  let inIndentedCode = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track fenced code blocks
    if (line.trimStart().startsWith("```")) {
      inFencedCode = !inFencedCode;
      continue;
    }
    if (inFencedCode) continue;

    // Track indented code blocks (4 spaces)
    if (line.startsWith("    ") && line.trim().length > 0) continue;

    // Inline links: [text](target)
    const inlineRe = /\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = inlineRe.exec(line)) !== null) {
      const target = match[2].trim();
      if (isExternalLink(target)) continue;
      links.push({ target, line: i + 1, raw: match[0] });
    }

    // Image links: ![alt](src)
    const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
    while ((match = imgRe.exec(line)) !== null) {
      const target = match[2].trim();
      if (isExternalLink(target)) continue;
      // Already captured by inline regex above, skip dedup by checking
      if (!links.some((l) => l.raw === match[0] && l.line === i + 1)) {
        links.push({ target, line: i + 1, raw: match[0] });
      }
    }

    // Reference-style definitions: [ref]: target
    const refDefRe = /^\[([^\]]+)\]:\s+(\S+)/;
    const refMatch = refDefRe.exec(line.trim());
    if (refMatch) {
      const target = refMatch[2];
      if (!isExternalLink(target)) {
        links.push({ target, line: i + 1, raw: refMatch[0] });
      }
    }
  }

  return links;
}

function isExternalLink(target: string): boolean {
  return /^(https?:\/\/|mailto:|tel:|#|\/)/.test(target);
}
