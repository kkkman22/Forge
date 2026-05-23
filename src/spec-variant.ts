/**
 * Workflow variant auto-detection — resolveSpecVariant, scoreTaskDescription.
 *
 * Pure functions. No IO, no process.argv, no filesystem.
 *
 * Validates: Requirements 2, 8, 13
 */

import type { WorkflowVariant } from "./spec-bundle.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VariantInput {
  tier: "Light" | "Standard" | "Full";
  behaviorScore: number;
  architectureScore: number;
  defaultVariant?: WorkflowVariant;
}

export interface VariantResult {
  variant: WorkflowVariant;
  source: "auto" | "auto-tied-fallback";
}

export interface ScoreResult {
  behaviorScore: number;
  architectureScore: number;
}

// ---------------------------------------------------------------------------
// Keyword dictionaries
// ---------------------------------------------------------------------------

const BEHAVIOR_KEYWORDS = [
  // Chinese
  "用户", "应当", "显示", "返回", "登录", "注册", "点击", "提交", "搜索", "查看",
  "下载", "上传", "编辑", "删除", "创建", "列表", "详情", "表单", "验证",
  // English
  "user", "should", "display", "return", "show", "click", "submit", "search",
  "login", "register", "upload", "download", "edit", "delete", "create", "list",
  "form", "validate", "view", "page", "button", "input", "select",
];

const ARCHITECTURE_KEYWORDS = [
  // Chinese
  "基于", "服务", "数据库", "缓存", "队列", "中间件", "延迟", "吞吐", "性能",
  "Lambda", "Postgres", "Redis", "Kafka", "API", "REST", "gRPC", "GraphQL",
  "微服务", "容器", "部署", "监控", "日志",
  // English
  "service", "database", "cache", "queue", "middleware", "latency", "throughput",
  "performance", "lambda", "postgres", "redis", "kafka", "grpc", "graphql",
  "microservice", "container", "deploy", "monitor", "infrastructure", "docker",
  "kubernetes", "serverless", "cdn", "oauth", "jwt", "auth",
];

// ---------------------------------------------------------------------------
// scoreTaskDescription
// ---------------------------------------------------------------------------

export function scoreTaskDescription(text: string): ScoreResult {
  const lower = text.toLowerCase();

  let behaviorScore = 0;
  for (const kw of BEHAVIOR_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) behaviorScore++;
  }

  let architectureScore = 0;
  for (const kw of ARCHITECTURE_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) architectureScore++;
  }

  return { behaviorScore, architectureScore };
}

// ---------------------------------------------------------------------------
// resolveSpecVariant
// ---------------------------------------------------------------------------

const VALID_VARIANTS: WorkflowVariant[] = ["requirements-first", "design-first", "quick-plan"];

export function resolveSpecVariant(input: VariantInput): VariantResult {
  // Forced rules (not overridable by config)
  if (input.tier === "Light") {
    return { variant: "quick-plan", source: "auto" };
  }

  if (input.tier === "Full") {
    return { variant: "requirements-first", source: "auto" };
  }

  // Standard tier — score-based decision
  const ratio = input.architectureScore / Math.max(input.behaviorScore, 1);

  if (ratio > 1.5) {
    return { variant: "design-first", source: "auto" };
  }

  if (ratio < 0.67) {
    return { variant: "requirements-first", source: "auto" };
  }

  // Tied range [0.67, 1.5]
  const fallback = input.defaultVariant;
  if (fallback && VALID_VARIANTS.includes(fallback)) {
    return { variant: fallback, source: "auto-tied-fallback" };
  }

  return { variant: "requirements-first", source: "auto" };
}
