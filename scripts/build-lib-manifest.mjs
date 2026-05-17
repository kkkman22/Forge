#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";

const ROOT = resolve(import.meta.dirname, "..");
const LIB_DIR = join(ROOT, "skills", "forge", "lib");
const OUTPUT = join(LIB_DIR, "manifest.json");

function sha256(filePath) {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

function buildManifest() {
  const manifest = {
    version: 1,
    generated_at: new Date().toISOString(),
  };

  const entries = readdirSync(LIB_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const subDir = join(LIB_DIR, entry.name);
    const instrPath = join(subDir, "instructions.md");
    if (!existsSync(instrPath)) continue;

    manifest[entry.name] = {
      sha256: sha256(instrPath),
    };
  }

  return manifest;
}

const manifest = buildManifest();
writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2) + "\n");

const subCount = Object.keys(manifest).filter(
  (k) => k !== "version" && k !== "generated_at",
).length;
console.log(`manifest.json generated with ${subCount} subs`);
