export const meta = {
  name: "forge-review",
  version: "1.0.0",
  description:
    "Forge saved workflow for multi-layer review: scan changed files, run independent spec/quality/security review, then synthesize bounded findings.",
  whenToUse: "Use as the L0 backend for /forge review when saved workflows are enabled.",
  phases: [
    { title: "Scan", detail: "Detect changed files and review scope" },
    { title: "Review", detail: "Run spec, quality, and security reviewers in parallel" },
    { title: "Synthesize", detail: "Merge findings into a bounded package/feature-scoped summary" },
  ],
};

const FINDING_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          severity: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
          file: { type: "string" },
          description: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["id", "title", "severity", "file", "description", "confidence"],
      },
    },
  },
  required: ["findings"],
};

export async function run() {
  phase("Scan");
  const scan = await agent(
    "Summarize current branch review scope. Return changed files, diff size, and whether this is package-scoped or feature-scoped. Do not include raw diff output.",
    {
      label: "forge-review:scan",
      schema: {
        type: "object",
        properties: {
          changed_files: { type: "array", items: { type: "string" } },
          has_changes: { type: "boolean" },
          scope: { type: "string" },
        },
        required: ["changed_files", "has_changes"],
      },
    },
  );

  if (!scan?.has_changes) {
    return { summary: "No changes to review.", findings: [], ship_ready: true };
  }

  phase("Review");
  const reviewers = [
    ["spec-check", "Review implementation against locked Forge spec and package scope."],
    ["quality-check", "Review maintainability, tests, errors, performance, and duplication."],
    ["security-check", "Review security, secrets, injection, authz/authn, and sensitive data risk."],
  ];

  const results = await parallel(
    reviewers.map(([agentType, prompt]) => () =>
      agent(`${prompt}\nChanged files:\n${scan.changed_files.join("\n")}`, {
        label: `forge-review:${agentType}`,
        agentType,
        schema: FINDING_SCHEMA,
      }),
    ),
  );

  phase("Synthesize");
  const findings = results.flatMap((result) => result?.findings ?? []);
  const p0 = findings.filter((finding) => finding.severity === "P0").length;
  const p1 = findings.filter((finding) => finding.severity === "P1").length;

  return {
    summary: `Forge review completed for ${scan.changed_files.length} file(s). P0=${p0}, P1=${p1}.`,
    findings,
    ship_ready: p0 === 0 && p1 === 0,
    report_hint: "Write complete details to .forge/reviews/<run-id>/ and keep conversation summary bounded.",
  };

}
