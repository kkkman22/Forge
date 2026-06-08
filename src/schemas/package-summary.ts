/**
 * Zod schema for execution package summaries.
 */

import { z } from "zod";

export const PackageSummarySchema = z
  .object({
    status: z.enum(["done", "blocked", "failed"]),
    package_id: z.string().min(1),
    tasks_completed: z.array(z.string()).max(20),
    changed_files: z.object({
      items: z.array(z.string()).max(5),
      overflow_count: z.number().int().min(0),
    }),
    commands: z
      .array(
        z.object({
          cmd: z.string().min(1),
          result: z.enum(["pass", "fail", "skipped"]),
          evidence_path: z.string().min(1),
        }),
      )
      .max(3),
    findings: z.object({
      p0: z.number().int().min(0),
      p1: z.number().int().min(0),
      highest_risk: z.string().min(1),
    }),
    blockers: z
      .array(
        z.object({
          reason: z.string().min(1),
          evidence_path: z.string().min(1),
        }),
      )
      .max(3),
    report_path: z.string().min(1),
    next_action: z.string().min(1),
  })
  .strict();

export type PackageSummary = z.infer<typeof PackageSummarySchema>;

export function formatPackageSummary(input: PackageSummary): string {
  const summary = PackageSummarySchema.parse(input);
  const changed = `${summary.changed_files.items.length} (+${summary.changed_files.overflow_count} more)`;
  const commands = summary.commands.map(
    (command) => `${command.cmd}: ${command.result} @ ${command.evidence_path}`,
  );

  return [
    `status: ${summary.status}`,
    `package_id: ${summary.package_id}`,
    `tasks_completed: ${summary.tasks_completed.join(",")}`,
    `changed_files: ${changed}`,
    `commands: ${commands.join("; ")}`,
    `findings: P0=${summary.findings.p0} P1=${summary.findings.p1} risk=${summary.findings.highest_risk}`,
    `blockers: ${summary.blockers.length}`,
    `report_path: ${summary.report_path}`,
    `next_action: ${summary.next_action}`,
  ].join("\n");
}
