export interface CommandEntry {
  cmd: string;
  exit_code: number;
}

export interface HandoffBlock {
  task_id: string;
  completed: string[];
  not_completed: string[];
  commands_executed: CommandEntry[];
  issues_found: string[];
  procedure_compliance: string;
}

export interface HandoffValidationResult {
  valid: boolean;
  errors: string[];
}

type Maybe<T> = T | null;

interface RawFields {
  task_id: Maybe<string>;
  completed: Maybe<string[]>;
  not_completed: Maybe<string[]>;
  commands_executed: Maybe<CommandEntry[]>;
  issues_found: Maybe<string[]>;
  procedure_compliance: Maybe<string>;
}

const TDD_KEYWORDS = ["RED", "GREEN", "REFACTOR"];
const REQUIRED_FIELDS: (keyof HandoffBlock)[] = [
  "task_id", "completed", "not_completed", "commands_executed", "issues_found", "procedure_compliance",
];
const LIGHT_REQUIRED: (keyof HandoffBlock)[] = ["task_id", "commands_executed", "procedure_compliance"];

export function parseHandoffBlock(block: string): HandoffBlock {
  const codeMatch = block.match(/```(?:yaml[ \t]+handoff|yaml|handoff)\s*\n([\s\S]*?)```/);
  if (!codeMatch) throw new Error("No fenced code block found");

  const lines = codeMatch[1].split("\n");
  const fields = parseYamlLines(lines);

  for (const name of REQUIRED_FIELDS) {
    if (fields[name] === null) throw new Error(`Missing required field: ${name}`);
  }

  return fields as unknown as HandoffBlock;
}

function parseYamlLines(lines: string[]): RawFields {
  const result: RawFields = {
    task_id: null,
    completed: null,
    not_completed: null,
    commands_executed: null,
    issues_found: null,
    procedure_compliance: null,
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^task_id:\s/.test(line)) {
      result.task_id = line.replace(/^task_id:\s*/, "").trim();
      i++;
    } else if (/^completed:\s*$/.test(line)) {
      const { values, nextI } = readList(lines, i + 1);
      result.completed = values;
      i = nextI;
    } else if (/^completed:\s*\[/.test(line)) {
      result.completed = parseInlineArray(line);
      i++;
    } else if (/^not_completed:\s*$/.test(line)) {
      const { values, nextI } = readList(lines, i + 1);
      result.not_completed = values;
      i = nextI;
    } else if (/^not_completed:\s*\[/.test(line)) {
      result.not_completed = parseInlineArray(line);
      i++;
    } else if (/^commands_executed:\s*$/.test(line)) {
      result.commands_executed = readCommands(lines, i + 1).entries;
      i = readCommands(lines, i + 1).nextI;
    } else if (/^issues_found:\s*$/.test(line)) {
      const { values, nextI } = readList(lines, i + 1);
      result.issues_found = values;
      i = nextI;
    } else if (/^issues_found:\s*\[/.test(line)) {
      result.issues_found = parseInlineArray(line);
      i++;
    } else if (/^procedure_compliance:\s*\|?\s*$/.test(line)) {
      const { text, nextI } = readMultiline(lines, i + 1);
      result.procedure_compliance = text;
      i = nextI;
    } else {
      i++;
    }
  }

  return result;
}

function readList(lines: string[], start: number): { values: string[]; nextI: number } {
  const values: string[] = [];
  let i = start;
  while (i < lines.length && /^\s+- /.test(lines[i])) {
    values.push(lines[i].replace(/^\s*- /, "").trim());
    i++;
  }
  return { values, nextI: i };
}

function parseInlineArray(line: string): string[] {
  const m = line.match(/\[([^\]]*)\]/);
  if (!m || m[1].trim() === "") return [];
  return m[1].split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
}

function readCommands(lines: string[], start: number): { entries: CommandEntry[]; nextI: number } {
  const entries: CommandEntry[] = [];
  let i = start;
  let currentCmd = "";
  let currentExit: number | undefined;

  while (i < lines.length) {
    const cmdMatch = lines[i].match(/^\s*- cmd:\s*"?(.*?)"?\s*$/);
    if (cmdMatch) {
      if (currentCmd || currentExit !== undefined) {
        entries.push({ cmd: currentCmd, exit_code: currentExit ?? 0 });
      }
      currentCmd = cmdMatch[1];
      currentExit = undefined;
      i++;
      continue;
    }
    const exitMatch = lines[i].match(/^\s*exit_code:\s*(\d+)/);
    if (exitMatch) {
      currentExit = Number(exitMatch[1]);
      i++;
      continue;
    }
    if (/^\s*$/.test(lines[i])) { i++; continue; }
    if (/^\s{2,4}\S/.test(lines[i])) { i++; continue; }
    break;
  }

  if (currentCmd || currentExit !== undefined) {
    entries.push({ cmd: currentCmd, exit_code: currentExit ?? 0 });
  }

  return { entries, nextI: i };
}

function readMultiline(lines: string[], start: number): { text: string; nextI: number } {
  const parts: string[] = [];
  let i = start;
  while (i < lines.length && /^\s/.test(lines[i])) {
    parts.push(lines[i].trim());
    i++;
  }
  return { text: parts.join("\n"), nextI: i };
}

export function validateHandoff(
  handoff: HandoffBlock,
  options: { tier?: "light" | "standard" | "full" } = {},
): HandoffValidationResult {
  const { tier = "standard" } = options;
  const errors: string[] = [];
  const required = tier === "light" ? LIGHT_REQUIRED : REQUIRED_FIELDS;

  for (const field of required) {
    if (!(field in handoff) || (handoff as unknown as Record<string, unknown>)[field] === undefined) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (tier !== "light") {
    if (Array.isArray(handoff.commands_executed)) {
      for (const entry of handoff.commands_executed) {
        if (!entry.cmd || entry.cmd.trim() === "") {
          errors.push("commands_executed entry missing cmd field");
        }
        if (entry.exit_code === undefined || entry.exit_code === null) {
          errors.push("commands_executed entry missing exit_code field");
        }
      }
    }

    const pc = handoff.procedure_compliance;
    if (pc && pc !== "skipped" && !TDD_KEYWORDS.some((kw) => pc.includes(kw))) {
      errors.push("procedure_compliance must contain RED/GREEN/REFACTOR keywords or 'skipped'");
    }
  }

  return { valid: errors.length === 0, errors };
}

export function serializeHandoff(handoff: HandoffBlock): string {
  const lines: string[] = ["```yaml handoff"];
  lines.push(`task_id: ${handoff.task_id}`);
  lines.push("completed:");
  for (const c of handoff.completed) lines.push(`  - ${c}`);
  lines.push("not_completed:");
  for (const c of handoff.not_completed) lines.push(`  - ${c}`);
  lines.push("commands_executed:");
  for (const e of handoff.commands_executed) {
    lines.push(`  - cmd: "${e.cmd}"`);
    lines.push(`    exit_code: ${e.exit_code}`);
  }
  lines.push("issues_found:");
  for (const item of handoff.issues_found) lines.push(`  - ${item}`);
  lines.push("procedure_compliance: |");
  for (const line of handoff.procedure_compliance.split("\n")) {
    lines.push(`  ${line}`);
  }
  lines.push("```");
  return lines.join("\n");
}
