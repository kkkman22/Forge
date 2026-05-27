// Worker invoked by tool-health-writer.test.ts to exercise true cross-process
// concurrency on a single tool-health.md file. Receives target path,
// subcommand, event, details, count via argv. Loops `count` times so we hit
// the lock contention path multiple times per process.
//
// Loaded via `node --experimental-strip-types` (Node ≥22.6 / 24).
import { appendToolHealthRecord } from "../../src/tool-health-writer.ts";

const [, , path, subcommand, event, details, countStr] = process.argv;
const count = Number(countStr ?? "1");

for (let i = 0; i < count; i++) {
  appendToolHealthRecord(path!, {
    subcommand: subcommand!,
    event: event!,
    details: `${details}#${i}`,
  });
}
