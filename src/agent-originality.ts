/**
 * agent-originality.ts — Agent 查重核心逻辑(纯函数,可测)。
 *
 * 移植自 agency-agents check-agent-originality.sh 的算法:
 *   8-gram shingle + Jaccard 相似度 + 实体中性化。
 *
 * 设计见 spec#2 (agency-borrow-02-catalog-governance):
 *   - 实体中性化:agent name + 工具名,防"换名不换内容"
 *   - 默认阈值 WARN 20% / FAIL 40%(agency-agents 184-agent 基线中位数 0%、最差 1.5%)
 *
 * @see scripts/check-agent-originality.mjs (CLI 入口)
 */

/** 默认 FAIL 阈值(0-1),≥ 此值视为重复。 */
export const DEFAULT_FAIL_THRESHOLD = 0.4;
/** 默认 WARN 阈值(0-1),≥ 此值警告。 */
export const DEFAULT_WARN_THRESHOLD = 0.2;
/** shingle 的 n-gram 大小(词数)。 */
export const SHINGLE_K = 8;

/** 实体占位符。 */
const ENTITY_PLACEHOLDER = "__ent__";

/**
 * 剥离 YAML frontmatter(首个 `---...---` 块)。
 */
export function stripFrontmatter(text: string): string {
  if (!text.startsWith("---")) return text;
  const parts = text.split(/^---$/m);
  if (parts.length < 3) return text;
  // parts[0]="" parts[1]=frontmatter parts[2..]=body
  return parts.slice(2).join("---");
}

/**
 * 分词:转小写,非字母数字字符转为空格,按空白分割。
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * 实体中性化:把 entities 集合中的词(大小写不敏感)替换为占位符。
 * 用于防止"换名不换内容"的查重绕过。
 *
 * @param text 原文
 * @param entities 要中性化的实体集合(已转小写)
 */
export function neutralizeEntities(text: string, entities: Set<string>): string {
  if (entities.size === 0) return text;
  // 构建正则:\b(ent1|ent2|...)\b,大小写不敏感
  // 转义正则特殊字符
  const escaped = [...entities].map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  return text.replace(re, ENTITY_PLACEHOLDER);
}

/**
 * 生成 n-gram shingle 集合。
 *
 * @param words 已分词的数组
 * @param k 每个 shingle 的词数(默认 8)
 * @returns shingle 字符串集合("word1 word2 ... wordk")
 */
export function shingles(words: string[], k: number = SHINGLE_K): Set<string> {
  const result = new Set<string>();
  if (words.length < k) return result;
  for (let i = 0; i <= words.length - k; i++) {
    result.add(words.slice(i, i + k).join(" "));
  }
  return result;
}

/**
 * 计算 Jaccard 相似度:|A∩B| / |A∪B|。
 * 任一为空返回 0。
 */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  // 遍历较小的集合
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of small) {
    if (large.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * 预处理 agent 文本为 shingle 集合(供比对)。
 * 流程:剥 frontmatter → 实体中性化 → 分词 → shingle。
 *
 * @param text agent 文件全文
 * @param entities 要中性化的实体集合(转小写)
 */
export function agentToShingles(
  text: string,
  entities: Set<string>
): Set<string> {
  const body = stripFrontmatter(text);
  const neutralized = neutralizeEntities(body, entities);
  return shingles(tokenize(neutralized));
}

/** 单个候选 agent 与库的比对结果。 */
export interface OriginalityResult {
  /** 候选文件路径(相对仓库根)。 */
  file: string;
  /** 最相似的其他 agent 文件路径。 */
  closestFile: string | null;
  /** 最高相似度(0-1)。 */
  bestScore: number;
  /** 判定标签。 */
  verdict: "OK" | "WARN" | "FAIL";
}

/**
 * 从 agent 文件的 `tools` frontmatter 字段提取工具名,用于中性化。
 * 工具名是所有 agent 都会列的,不中性化会系统性拉高基线相似度。
 *
 * @param filesContents Map<文件路径, 文件全文>
 * @returns 工具名集合(转小写)
 */
export function extractToolEntities(
  filesContents: Map<string, string>
): Set<string> {
  const tools = new Set<string>();
  for (const content of filesContents.values()) {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;
    const fm = fmMatch[1];
    const toolsLine = fm.match(/^tools:\s*(.+)$/m);
    if (!toolsLine) continue;
    for (const t of toolsLine[1].split(",")) {
      const trimmed = t.trim().toLowerCase();
      if (trimmed) tools.add(trimmed);
    }
  }
  return tools;
}

/**
 * 从 agent 文件的 `name` frontmatter 提取 agent 名,用于中性化。
 */
export function extractNameEntities(
  filesContents: Map<string, string>
): Set<string> {
  const names = new Set<string>();
  for (const content of filesContents.values()) {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;
    const nameMatch = fmMatch[1].match(/^name:\s*(.+)$/m);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim().replace(/^["']|["']$/g, "").toLowerCase();
    if (name) names.add(name);
  }
  return names;
}
