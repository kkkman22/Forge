#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { globSync } from "glob";

const ROOT = resolve(import.meta.dirname, "..");
const LIB_DIR = join(ROOT, "skills", "tinkerman", "lib");
const OUTPUT = join(LIB_DIR, "manifest.json");

function sha256(filePath) {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

function buildManifest() {
  const subs = {};
  const entries = readdirSync(LIB_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const subDir = join(LIB_DIR, entry.name);
    const instrPath = join(subDir, "instructions.md");
    if (!existsSync(instrPath)) continue;

    const refPattern = join(LIB_DIR, entry.name, "references", "**/*.md");
    const refFiles = globSync(refPattern).sort();

    const references = refFiles.map((refPath) => {
      const rel = refPath.replace(LIB_DIR + "/", "");
      return { path: rel, sha256: sha256(refPath) };
    });

    subs[entry.name] = {
      instructions: {
        path: `${entry.name}/instructions.md`,
        sha256: sha256(instrPath),
      },
      references,
    };
  }

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    subs,
  };
}

const manifest = buildManifest();
writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2) + "\n");

const subCount = Object.keys(manifest.subs).length;
console.log(`manifest.json generated with ${subCount} subs`);
