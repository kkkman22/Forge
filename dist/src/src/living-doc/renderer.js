import * as fs from "node:fs";
import * as path from "node:path";
// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------
export function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
// ---------------------------------------------------------------------------
// Verdict helpers
// ---------------------------------------------------------------------------
function verdictEmoji(verdict) {
    switch (verdict) {
        case "pass":
            return "✅";
        case "fail":
            return "❌";
        case "pending":
            return "⏳";
        case "skip":
            return "⏭";
        default:
            return "⏳";
    }
}
function verdictLabel(verdict) {
    switch (verdict) {
        case "pass":
            return "Pass";
        case "fail":
            return "Fail";
        case "pending":
            return "Pending";
        case "skip":
            return "Skip";
        default:
            return "Pending";
    }
}
function passRateClass(pass, total) {
    const rate = total > 0 ? ((pass / total) * 100).toFixed(0) : "0";
    const cls = Number(rate) >= 80 ? "high" : Number(rate) >= 50 ? "mid" : "low";
    return { rate, cls };
}
// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------
function renderStyles() {
    return `/* Forge Living Documentation — self-contained styles */
*,*::before,*::after{box-sizing:border-box}
:root{
  --color-pass:#16a34a;
  --color-fail:#dc2626;
  --color-pending:#d97706;
  --color-skip:#6b7280;
  --bg:#f9fafb;
  --surface:#fff;
  --text:#111827;
  --text-muted:#6b7280;
  --border:#e5e7eb;
  --radius:8px;
}
html{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:var(--text);background:var(--bg)}
body{margin:0;padding:2rem;max-width:72rem}
h1{margin:0 0 .5rem;font-size:1.5rem}
h2{margin:1.5rem 0 .75rem;font-size:1.25rem}
a{color:#2563eb;text-decoration:none}
a:hover{text-decoration:underline}

.stats{display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:.75rem 1.25rem;min-width:6rem}
.stat .label{font-size:.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em}
.stat .value{font-size:1.5rem;font-weight:700}

.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(16rem,1fr));gap:1rem;margin:1rem 0}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem 1.25rem;transition:box-shadow .15s}
.card:hover{box-shadow:0 2px 8px rgba(0,0,0,.08)}
.card h3{margin:0 0 .5rem;font-size:1rem}
.card .meta{font-size:.875rem;color:var(--text-muted)}
.rate{font-weight:600}
.rate.high{color:var(--color-pass)}
.rate.mid{color:var(--color-pending)}
.rate.low{color:var(--color-fail)}

table{width:100%;border-collapse:collapse;margin:1rem 0}
th,td{text-align:left;padding:.5rem .75rem;border-bottom:1px solid var(--border)}
th{font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);background:var(--bg)}
tr:hover td{background:#f3f4f6}

.back{display:inline-block;margin-bottom:1rem;font-size:.875rem}

footer{margin-top:2rem;font-size:.75rem;color:var(--text-muted)}

@media print{
  body{max-width:100%;padding:0}
  .card:hover{box-shadow:none}
  a{color:var(--text);text-decoration:underline}
}
`;
}
// ---------------------------------------------------------------------------
// renderIndexPage
// ---------------------------------------------------------------------------
export function renderIndexPage(data) {
    const { globalStats, generatedAt, contexts } = data;
    const contextCards = Array.from(contexts.entries())
        .map(([name, ctx]) => {
        const { rate, cls } = passRateClass(ctx.stats.pass, ctx.stats.total);
        return `      <a href="${escapeHtml(name)}.html" class="card">
        <h3>${escapeHtml(name)}</h3>
        <p class="meta">${ctx.stats.total} scenarios</p>
        <p class="meta">Pass rate: <span class="rate ${cls}">${rate}%</span></p>
      </a>`;
    })
        .join("\n");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Forge Living Documentation</title>
  <link rel="stylesheet" href="assets/styles.css">
</head>
<body>
  <h1>Forge Living Documentation</h1>
  <p class="meta">Generated at ${escapeHtml(generatedAt)}</p>

  <h2>Global Statistics</h2>
  <div class="stats">
    <div class="stat"><div class="label">Total</div><div class="value">${globalStats.totalScenarios}</div></div>
    <div class="stat"><div class="label">Pass</div><div class="value" style="color:var(--color-pass)">${globalStats.pass}</div></div>
    <div class="stat"><div class="label">Fail</div><div class="value" style="color:var(--color-fail)">${globalStats.fail}</div></div>
    <div class="stat"><div class="label">Pending</div><div class="value" style="color:var(--color-pending)">${globalStats.pending}</div></div>
  </div>

  <h2>Contexts</h2>
  <div class="grid">
${contextCards}
  </div>

  <footer>Forge Living Documentation</footer>
</body>
</html>`;
}
// ---------------------------------------------------------------------------
// renderContextPage
// ---------------------------------------------------------------------------
export function renderContextPage(context, contextName, generatedAt) {
    const rows = [];
    for (const spec of context.specs) {
        for (const scenario of spec.scenarios) {
            const emoji = verdictEmoji(scenario.lastVerdict);
            const label = verdictLabel(scenario.lastVerdict);
            const lastRun = scenario.lastRunAt ? new Date(scenario.lastRunAt).toLocaleString() : "—";
            const specLink = escapeHtml(spec.specPath);
            rows.push(`        <tr>
          <td>${escapeHtml(scenario.title)}</td>
          <td>${emoji} ${label}</td>
          <td>${escapeHtml(lastRun)}</td>
          <td><a href="${specLink}#L${scenario.sourceLine}">${escapeHtml(spec.specPath)}</a></td>
        </tr>`);
        }
    }
    const { rate: ctxRate, cls: ctxRateClass } = passRateClass(context.stats.pass, context.stats.total);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Context: ${escapeHtml(contextName)}</title>
  <link rel="stylesheet" href="assets/styles.css">
</head>
<body>
  <a href="index.html" class="back">&larr; Back to index</a>
  <h1>Context: ${escapeHtml(contextName)}</h1>
  <p class="meta">Generated at ${escapeHtml(generatedAt)}</p>

  <h2>Statistics</h2>
  <div class="stats">
    <div class="stat"><div class="label">Total</div><div class="value">${context.stats.total}</div></div>
    <div class="stat"><div class="label">Pass</div><div class="value" style="color:var(--color-pass)">${context.stats.pass}</div></div>
    <div class="stat"><div class="label">Fail</div><div class="value" style="color:var(--color-fail)">${context.stats.fail}</div></div>
    <div class="stat"><div class="label">Pending</div><div class="value" style="color:var(--color-pending)">${context.stats.pending}</div></div>
    <div class="stat"><div class="label">Pass rate</div><div class="value rate ${ctxRateClass}">${ctxRate}%</div></div>
  </div>

  <h2>Scenarios</h2>
  <table>
    <thead>
      <tr>
        <th>Title</th>
        <th>Verdict</th>
        <th>Last Run</th>
        <th>Spec</th>
      </tr>
    </thead>
    <tbody>
${rows.join("\n")}
    </tbody>
  </table>

  <footer>Forge Living Documentation</footer>
</body>
</html>`;
}
// ---------------------------------------------------------------------------
// renderLivingDoc
// ---------------------------------------------------------------------------
export function renderLivingDoc(data, outputDir) {
    // 1. Create output directories
    const assetsDir = path.join(outputDir, "assets");
    fs.mkdirSync(assetsDir, { recursive: true });
    // 2. Write styles
    fs.writeFileSync(path.join(assetsDir, "styles.css"), renderStyles(), "utf-8");
    // 3. Write index.html
    fs.writeFileSync(path.join(outputDir, "index.html"), renderIndexPage(data), "utf-8");
    // 4. Write per-context pages
    for (const [contextName, context] of data.contexts) {
        const fileName = `${contextName}.html`;
        fs.writeFileSync(path.join(outputDir, fileName), renderContextPage(context, contextName, data.generatedAt), "utf-8");
    }
}
//# sourceMappingURL=renderer.js.map