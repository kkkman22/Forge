#!/usr/bin/env node

// aggregate-metrics.mjs
// Aggregates usage metrics from .tinkerman/.metrics/ ndjson files.
// Usage: node scripts/aggregate-metrics.mjs --window 14d [--skill forge-grill,forge-zoom-out]

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/\//, "/");
const METRICS_DIR = join(ROOT, ".tinkerman", ".metrics");

const args = process.argv.slice(2);
const windowIdx = args.indexOf("--window");
const windowArg = windowIdx >= 0 ? args[windowIdx + 1] : "14d";
const skillIdx = args.indexOf("--skill");
const skillArg = skillIdx >= 0 ? args[skillIdx + 1] : "";
const filterSkills = skillArg ? skillArg.split(",") : null;

const windowDays = Number.parseInt(windowArg, 10) || 14;
const cutoff = new Date(Date.now() - windowDays * 86400000);

if (!existsSync(METRICS_DIR)) {
  console.log(`No metrics data found in ${METRICS_DIR}`);
  process.exit(0);
}

const records = [];
for (const file of readdirSync(METRICS_DIR).filter((f) => f.endsWith(".ndjson"))) {
  const content = readFileSync(join(METRICS_DIR, file), "utf-8");
  for (const line of content.split("\n").filter(Boolean)) {
    try {
      const r = JSON.parse(line);
      if (new Date(r.ts) >= cutoff) {
        if (!filterSkills || filterSkills.includes(r.skill)) {
          records.push(r);
        }
      }
    } catch {
      // skip malformed lines
    }
  }
}

// Aggregate
const bySkill = {};
for (const r of records) {
  if (!bySkill[r.skill]) {
    bySkill[r.skill] = { total: 0, manual: 0, loop: 0, "auto-advance": 0, days: new Set() };
  }
  bySkill[r.skill].total++;
  bySkill[r.skill][r.source] = (bySkill[r.skill][r.source] || 0) + 1;
  bySkill[r.skill].days.add(r.ts.split("T")[0]);
}

// Output markdown report
console.log(`# Usage Metrics Report (${windowDays}-day window)\n`);
console.log("| Skill | Total | Manual | Loop | Auto-advance | Days Active |");
console.log("|-------|-------|--------|------|--------------|-------------|");
for (const [skill, data] of Object.entries(bySkill).sort((a, b) => b[1].total - a[1].total)) {
  console.log(
    `| ${skill} | ${data.total} | ${data.manual || 0} | ${data.loop || 0} | ${data["auto-advance"] || 0} | ${data.days.size} |`,
  );
}
console.log(`\nTotal records: ${records.length}`);
