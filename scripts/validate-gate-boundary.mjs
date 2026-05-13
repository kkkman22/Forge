#!/usr/bin/env node

// validate-gate-boundary.mjs
// Contract test: verify gate skill "Use when" paragraphs exist and are unique.
// Usage: node scripts/validate-gate-boundary.mjs

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const GATE_SKILLS = ["forge-accept", "forge-verify", "forge-ship"];

function extractUseWhen(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const match = content.match(/\*\*Use when\*\*\s+(.+?)(?=\n\n|\n>)/s);
  if (!match) return null;
  // Only check core description (first sentence before "Do not confuse")
  const firstSentence = match[1].split(/Do not confuse/)[0].trim();
  return firstSentence;
}

function jaccardSimilarity(a, b) {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

const paragraphs = [];
let ok = true;

// 1. Existence check
for (const skill of GATE_SKILLS) {
  const filePath = join(ROOT, "skills", skill, "SKILL.md");
  const useWhen = extractUseWhen(filePath);
  if (!useWhen) {
    console.error(`FAIL: ${skill} missing "Use when" paragraph`);
    ok = false;
  } else {
    paragraphs.push({ skill, text: useWhen });
  }
}

if (paragraphs.length < 3) {
  process.exit(1);
}

// 2. Pairwise Jaccard similarity < 0.5
for (let i = 0; i < paragraphs.length; i++) {
  for (let j = i + 1; j < paragraphs.length; j++) {
    const sim = jaccardSimilarity(paragraphs[i].text, paragraphs[j].text);
    if (sim >= 0.5) {
      console.error(
        `FAIL: ${paragraphs[i].skill} and ${paragraphs[j].skill} "Use when" too similar (Jaccard=${sim.toFixed(2)})`,
      );
      ok = false;
    }
  }
}

// 3. Trigger keyword mutual exclusion
const TRIGGERS = {
  "forge-accept": ["acceptance", "scenario", "behavioral"],
  "forge-verify": ["verdict", "evidence", "three-state", "VERIFIED"],
  "forge-ship": ["merge", "release", "delivery", "ship"],
};

for (let i = 0; i < paragraphs.length; i++) {
  const ownTriggers = TRIGGERS[paragraphs[i].skill] || [];
  for (let j = 0; j < paragraphs.length; j++) {
    if (i === j) continue;
    const otherText = paragraphs[j].text.toLowerCase();
    const leaked = ownTriggers.filter((t) => otherText.includes(t.toLowerCase()));
    if (leaked.length > 1) {
      console.error(
        `FAIL: ${paragraphs[j].skill} "Use when" leaks ${paragraphs[i].skill} trigger keywords: ${leaked.join(", ")}`,
      );
      ok = false;
    }
  }
}

if (ok) {
  console.log("OK: gate skill boundaries are distinct and well-defined");
}

process.exit(ok ? 0 : 1);
