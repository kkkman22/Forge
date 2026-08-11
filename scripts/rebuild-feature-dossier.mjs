#!/usr/bin/env node
// rebuild-feature-dossier.mjs — CLI for Feature Dossier Index
//
// Modes:
//   node rebuild-feature-dossier.mjs <topic>         — rebuild single
//   node rebuild-feature-dossier.mjs --all            — bulk rebuild
//   node rebuild-feature-dossier.mjs --from-path <p>  — Hook mode (silent)
//
// Exit codes: 0 success / 1 failure / 2 no .tinkerman/

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Locate src/ relative to this script
// ---------------------------------------------------------------------------

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..");

// Dynamic import of compiled TS (from dist/src/)
const modPath = join(
	projectRoot,
	"dist",
	"src",
	"feature-dossier.js",
);

/** @type {import('../dist/src/feature-dossier.js')} */
let mod;
try {
	mod = await import(modPath);
} catch {
	// Fallback: try src/ directly (dev mode with tsx or similar)
	console.error(`Error: Cannot load feature-dossier module from ${modPath}`);
	console.error("Run 'npm run build' or ensure dist/ is up to date.");
	process.exit(1);
}

const {
	scanStagesForTopic,
	buildDossier,
	discoverTopics,
	deriveTopicFromPath,
} = mod;

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.length === 0) {
	console.log("Usage:");
	console.log("  node rebuild-feature-dossier.mjs <topic>");
	console.log("  node rebuild-feature-dossier.mjs --all");
	console.log("  node rebuild-feature-dossier.mjs --from-path <path>");
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Locate .tinkerman/
// ---------------------------------------------------------------------------

const forgeRoot = findForgeRoot();
if (!forgeRoot) {
	console.error("Error: No .tinkerman/ directory found. Run 'forge init' first.");
	process.exit(2);
}

const featuresDir = join(forgeRoot, "features");

// ---------------------------------------------------------------------------
// Validate topic name (shell injection protection)
// ---------------------------------------------------------------------------

function validateTopic(topic) {
	if (!/^[a-z0-9][a-z0-9.-]*$/.test(topic)) {
		console.error(
			`Error: Invalid topic name '${topic}'. Use lowercase kebab-case (a-z, 0-9, -, .).`,
		);
		process.exit(1);
	}
	// Path traversal defense: reject if normalized path would escape forgeRoot
	if (topic.includes("..") || topic.includes("/") || topic.includes("\\")) {
		console.error(`Error: Invalid topic name '${topic}'.`);
		process.exit(1);
	}
}

// ---------------------------------------------------------------------------
// Rebuild single topic
// ---------------------------------------------------------------------------

function rebuildTopic(topic, silent = false) {
	validateTopic(topic);

	const scan = scanStagesForTopic(topic, forgeRoot);
	const doc = buildDossier({ topic, forgeRoot, stageScan: scan });

	// Stamp generated_at
	doc.frontmatter.generated_at = new Date().toISOString();

	// Write file
	mkdirSync(featuresDir, { recursive: true });
	const outPath = join(featuresDir, `${topic}.md`);
	const content = serializeDossier(doc);
	writeFileSync(outPath, content, "utf-8");

	if (!silent) {
		console.log(
			`dossier: wrote .tinkerman/features/${topic}.md (${doc.frontmatter.stage_count} stages, ${doc.frontmatter.total_files} files)`,
		);
	}

	return doc;
}

// ---------------------------------------------------------------------------
// Serialize DossierDocument to markdown
// ---------------------------------------------------------------------------

function serializeDossier(doc) {
	const fm = doc.frontmatter;
	const lines = [
		"---",
		`topic: ${fm.topic}`,
		`generated_at: ${fm.generated_at}`,
		`auto_generated: ${fm.auto_generated}`,
		`stage_count: ${fm.stage_count}`,
		`total_files: ${fm.total_files}`,
		"---",
		"",
		doc.body,
	];
	// Ensure trailing newline
	if (!lines[lines.length - 1].endsWith("\n")) {
		lines.push("");
	}
	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Find .tinkerman/ root
// ---------------------------------------------------------------------------

function findForgeRoot() {
	// Check CWD and parents
	let dir = process.cwd();
	for (let i = 0; i < 10; i++) {
		if (existsSync(join(dir, ".tinkerman"))) {
			return join(dir, ".tinkerman");
		}
		const parent = resolve(dir, "..");
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Main dispatch
// ---------------------------------------------------------------------------

if (args[0] === "--from-path" || process.env.TOOL_INPUT_FILE) {
	// Hook mode: derive topic from path, rebuild silently
	const inputPath = process.env.TOOL_INPUT_FILE || args[1];
	if (!inputPath) {
		process.exit(0);
	}

	// Normalize: strip leading .tinkerman/ if present
	const relPath = inputPath
		.replace(/^\.forge\//, "")
		.replace(/^\.\/\.forge\//, "");

	// Prevent infinite loop: if path is under features/, exit
	if (relPath.startsWith("features/")) {
		process.exit(0);
	}

	const topic = deriveTopicFromPath(relPath);
	if (!topic) {
		process.exit(0);
	}

	try {
		rebuildTopic(topic, true);
	} catch {
		// Fail-silent for hook mode
	}
	process.exit(0);
}

if (args[0] === "--all") {
	// Bulk rebuild
	const discovery = discoverTopics(forgeRoot);
	let rebuilt = 0;
	let failed = 0;

	for (const topic of discovery.topics) {
		try {
			rebuildTopic(topic, false);
			rebuilt++;
		} catch (e) {
			console.error(`failed: ${topic} — ${e.message}`);
			failed++;
		}
	}

	console.log(
		`dossier: rebuilt ${rebuilt} dossiers (${discovery.topics.length} topics across 7 stages)`,
	);
	if (failed > 0) {
		console.error(`dossier: ${failed} topics failed`);
	}
	process.exit(0);
}

// Single topic mode
const topic = args[0];
try {
	rebuildTopic(topic, false);
} catch (e) {
	console.error(`Error: ${e.message}`);
	process.exit(1);
}
