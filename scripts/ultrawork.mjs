// ultrawork.mjs — portable cost-tiered multi-model subagent orchestrator (no deps, Node ESM).
//
// This is the *runtime* the ultrawork-claude skill was missing, and it is built
// to BEAT a single-vendor Workflow tool on the two axes a multi-AI setup wins:
//
//   1. COST TIERING — bulk fan-out runs on near-free economy models (MiniMax M3,
//      gpt-5.4-mini) while only synthesis/verification spends premium Opus/GPT-5.5.
//      An all-Claude Workflow burns premium quota on every subagent; this does not.
//   2. VENDOR-DIVERSE VERIFICATION — adversarial checks use genuinely different
//      models (Claude + GPT + Grok + MiniMax), catching failure modes that N
//      identical skeptics share.
//   3. SUBSCRIPTION RESEARCH OFFLOAD — ChatGPT Pro Deep Research can be used by
//      the human as a quota-separated research lane. It returns sourced reports
//      for Codex to verify/structure, never live execution authority.
//
// Each agent() = one subprocess / HTTP call with a FRESH context (no shared
// history), so the controller's own context stays small.
//
//   import { agent, parallel, pipeline, verify, log, costReport } from "./ultrawork.mjs";
//   const drafts = await parallel(files.map(f => () => agent(`review ${f}`, { tier: "economy" })));
//   const merged = await agent("merge:\n" + drafts.join("\n---\n"), { tier: "heavy" });
//   const v = await verify("the merge is correct", { tiers: ["fast","economy","standard"] });
//   log(costReport());
//
//   $ node my-workflow.mjs
//
// Backends (all isolated context):
//   gateway -> POST $UW_GATEWAY_URL/v1/responses (any slug: minimax-m3 / grok-build / opus-4-8 ...)
//   claude  -> claude -p   (JSON, no session, no tools/MCP)
//   codex   -> codex exec  (economy GPT, read-only sandbox, MCP off)
//
// Tiers map intent -> (backend, model) and are the recommended way to call agent():
//   economy  cheapest capable    -> gateway minimax-m3      (bulk fan-out, drafts, extraction)
//   fast     cheap + quick        -> codex   gpt-5.4-mini    (local economy, sandboxed)
//   standard mid                  -> gateway grok-build      (reasoning without premium cost)
//   heavy    best reasoning       -> claude  claude-opus-4-8[1m]  (synthesis, hard problems)
//   judge    premium verification -> gateway opus-4-8        (final adjudication)
//
// Env: CLAUDE_COMMAND CODEX_COMMAND CODEX_HOME UW_GATEWAY_URL UW_CONCURRENCY
//      UW_JOURNAL UW_RESUME UW_BUDGET_USD UW_TIMEOUT_MS UW_TIER_<NAME>="backend:model"

import { spawn } from "node:child_process";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const HOME = os.homedir();
const CLAUDE_COMMAND = process.env.CLAUDE_COMMAND || "claude";
const CODEX_COMMAND = process.env.CODEX_COMMAND || "codex";
const MAIN_CODEX_HOME = path.join(HOME, ".codex");
const SUB_CODEX_HOME = path.join(HOME, ".codex-sub");

function codexHomeHasModelGateway(homeDir) {
  try {
    const cfg = fs.readFileSync(path.join(homeDir, "config.toml"), "utf8");
    return /^\s*model_provider\s*=\s*["']model_gateway["']/m.test(cfg);
  } catch {
    return false;
  }
}

// Prefer a dedicated SSD sub-home only when it is configured for model_gateway.
// A bare ~/.codex-sub with just auth.json makes codex exec fall back to provider=openai,
// where gateway slugs like chatgpt-pro-consult are rejected. Falls back to ~/.codex.
const CODEX_HOME = process.env.UW_CODEX_HOME
  || (fs.existsSync(SUB_CODEX_HOME) && codexHomeHasModelGateway(SUB_CODEX_HOME) ? SUB_CODEX_HOME : MAIN_CODEX_HOME);
const GATEWAY_URL = (process.env.UW_GATEWAY_URL || "http://127.0.0.1:4177").replace(/\/+$/, "");
const TIMEOUT_MS = Number(process.env.UW_TIMEOUT_MS || 600000);
const CONCURRENCY = Number(process.env.UW_CONCURRENCY || Math.max(2, Math.min(8, os.cpus().length - 2)));
const JOURNAL = process.env.UW_JOURNAL || "";
const RESUME = process.env.UW_RESUME === "1" && !!JOURNAL;
const MAX_CHILD_OUTPUT_BYTES = normalizePositiveBytes(process.env.UW_MAX_CHILD_OUTPUT_BYTES || 8 * 1024 * 1024, "UW_MAX_CHILD_OUTPUT_BYTES");
let BUDGET_USD = process.env.UW_BUDGET_USD ? normalizeBudgetUsd(process.env.UW_BUDGET_USD) : Infinity;

function normalizePositiveBytes(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new TypeError(`${name} must be a finite positive number, got: ${value}`);
  return n;
}

// Rough $/1M tokens (blended in/out) — used only for budget signalling, not billing.
// Tune freely; economy tiers are ~free relative to premium.
export const COST_PER_MTOK = {
  "minimax-m3": 0.3,
  "gpt-5.4-mini": 0.4,
  "grok-build": 2,
  "claude-haiku-4-5": 1,
  "claude-sonnet-4-6": 4,
  "claude-opus-4-8": 20,
  "claude-opus-4-8[1m]": 20,
  "opus-4-8": 20,
  "fable-5": 50,
  "claude-fable-5": 50,
  "gpt-5.5": 12,
  "chatgpt-pro-consult": 12,
};
const DEFAULT_COST = 3;

// Tier -> backend:model. Override any tier via env UW_TIER_ECONOMY="claude:haiku" etc.
export const TIERS = {
  economy: { backend: "gateway", model: "minimax-m3" },
  fast: { backend: "codex", model: "gpt-5.4-mini" },
  standard: { backend: "gateway", model: "grok-build" },
  heavy: { backend: "claude", model: "claude-opus-4-8[1m]" },
  judge: { backend: "gateway", model: "opus-4-8" },
  premium: { backend: "gateway", model: "fable-5" },
  consultant: { backend: "codex", model: "chatgpt-pro-consult" },
  "chatgpt-pro-consult": { backend: "codex", model: "chatgpt-pro-consult" },
  copilot: { backend: "codex", model: "chatgpt-pro-consult" },
  "T0-premium": { backend: "gateway", model: "fable-5" },
  "T1-copilot": { backend: "codex", model: "chatgpt-pro-consult" },
  "T2-judge": { backend: "gateway", model: "opus-4-8" },
  "T3-scout": { backend: "gateway", model: "minimax-m3" },
};
function tierEnvName(name) {
  return `UW_TIER_${String(name).toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}
for (const name of Object.keys(TIERS)) {
  const ov = process.env[tierEnvName(name)] || process.env[`UW_TIER_${name.toUpperCase()}`];
  if (ov && ov.includes(":")) {
    const [backend, ...rest] = ov.split(":");
    TIERS[name] = { backend, model: rest.join(":") };
  }
}


export const DEEP_RESEARCH_LANE = Object.freeze({
  id: "chatgpt_pro_deep_research",
  quotaType: "chatgpt_pro_subscription",
  apiFanout: false,
  hotPath: false,
  executor: "human_in_chatgpt_pro",
  role: "subscription research offload for sourced reports",
  workflow: [
    "Codex drafts a bounded research prompt and source requirements",
    "Human runs Deep Research in ChatGPT Pro and exports Markdown/PDF/source links",
    "Codex cross-checks primary sources and converts findings into hashed artifacts",
  ],
  forbidden: [
    "secrets or API keys",
    "exchange write permissions",
    "live order placement",
    "leverage, stop-loss, or position-size mutation",
    "automated UI abuse or unattended ChatGPT browsing",
  ],
  importContract: [
    "original_prompt",
    "research_ran_at",
    "report_text_or_file",
    "source_links",
    "limitations",
    "claims",
    "artifact_mapping",
    "content_hash",
  ],
});

function cloneDeepResearchLane() {
  return {
    ...DEEP_RESEARCH_LANE,
    workflow: [...DEEP_RESEARCH_LANE.workflow],
    forbidden: [...DEEP_RESEARCH_LANE.forbidden],
    importContract: [...DEEP_RESEARCH_LANE.importContract],
  };
}

// Task profiles encode the *shape* of useful multi-model collaboration. They are
// deliberately advisory: callers still decide scope, budget, and whether the
// current task is too small to justify ultrawork at all.
export const TASK_PROFILES = Object.freeze({
  "mission-critical-max": {
    id: "mission-critical-max",
    aliases: ["mission-critical-max", "mission critical", "ultrawork:max", "fable5", "fable-5"],
    level: "XL",
    primary: "fable-5",
    economy: ["minimax-m3", "grok-build", "haiku-4-6"],
    heavy: ["fable-5", "chatgpt-pro-consult", "opus-4-8"],
    maxAgents: 48,
    companionSkills: [],
    requiresPremiumAuth: true,
    budgetFloorPct: 15,
    stopConditions: ["literal opt-in keyword ultrawork:max is present", "hard budget ceiling and budget floor are declared", "refute-biased judge gate approves before side effects", "two dry rounds or two judge refutations stop the run", "any executor-boundary or redaction violation halts the run"],
    verification: ["Fable5 candidate plan/synthesis", "ChatGPT Pro Consult copilot critique", "Opus 4.8 refute-biased judge gate", "Codex-grounded diff/test/runtime evidence before execution"],
  },
  ui: {
    id: "ui",
    aliases: ["ui", "frontend", "design", "style", "moodboard", "component"],
    level: "L",
    primary: "chatgpt-pro-consult",
    economy: ["minimax-m3"],
    heavy: ["opus-4-8"],
    maxAgents: 24,
    companionSkills: [],
    stopConditions: ["top-N candidates converge to 2-3 directions", "no new visual direction after 2 rounds"],
    verification: ["screenshot or prototype evidence", "brand/accessibility checklist"],
  },
  review: {
    id: "review",
    aliases: ["review", "pr", "code review", "diff", "lint", "test"],
    level: "M",
    primary: "chatgpt-pro-consult",
    economy: ["minimax-m3"],
    heavy: ["opus-4-8"],
    maxAgents: 12,
    companionSkills: [],
    stopConditions: ["every diff-scoped file has a receipt", "false positives pruned by reviewer"],
    verification: ["git diff", "tests/lint", "reviewer risk pass"],
  },
  env: {
    id: "env",
    aliases: ["env", "environment", "gateway", "openclaw", "setup", "install", "runtime", "launchagent"],
    level: "M",
    primary: "chatgpt-pro-consult",
    economy: ["minimax-m3"],
    heavy: ["opus-4-8"],
    maxAgents: 16,
    companionSkills: ["gitnexus:gitnexus"],
    stopConditions: ["health endpoint verified", "rollback path recorded", "secrets redacted"],
    verification: ["process/port", "config path", "health probe", "rollback evidence"],
  },
  security: {
    id: "security",
    aliases: ["security", "auth", "secret", "vulnerability", "attack", "threat", "permission"],
    level: "L",
    primary: "chatgpt-pro-consult",
    economy: ["minimax-m3", "grok-build"],
    heavy: ["opus-4-8"],
    maxAgents: 32,
    companionSkills: ["codex-security:security-diff-scan"],
    stopConditions: ["diff scope exhausted", "candidate ledgers validated", "attack path accepted or suppressed"],
    verification: ["source-to-sink evidence", "exploitability validation", "no secret leakage"],
  },
  trading: {
    id: "trading",
    aliases: ["trading", "trade", "backtest", "strategy", "hermes", "time-room", "router", "portfolio", "交易", "回測", "策略", "風控", "情境權重", "精神時光屋"],
    level: "L",
    primary: "chatgpt-pro-consult",
    economy: ["minimax-m3"],
    heavy: ["opus-4-8", "claude-opus-4-8[1m]"],
    researchOffload: ["chatgpt_pro_deep_research"],
    maxAgents: 24,
    companionSkills: ["trading-training"],
    stopConditions: [
      "ChatGPT Pro Deep Research reports imported with prompt/source/provenance when external research is used",
      "boundary/gate/data split recorded before exploration",
      "candidate pool pruned to top-N before expensive review",
      "no-go reasons and failed experiments preserved",
    ],
    verification: [
      "Time Room/Hermes run evidence",
      "validation gates: trade count/DD/monthly survival/leakage/cost stress",
      "Claude trade-review for live_blocked/leverage/order-risk changes",
    ],
  },
  migration: {
    id: "migration",
    aliases: ["migration", "refactor", "architecture", "large", "multi-file", "rewrite"],
    level: "L",
    primary: "chatgpt-pro-consult",
    economy: ["minimax-m3"],
    heavy: ["opus-4-8", "claude-opus-4-8[1m]"],
    maxAgents: 32,
    companionSkills: ["gitnexus:gitnexus"],
    stopConditions: ["impact map stable", "checkpoint and rollback recorded", "test matrix green enough for phase"],
    verification: ["GitNexus/grep impact evidence", "tests", "diff review"],
  },
  memory: {
    id: "memory",
    aliases: ["memory", "skill", "skills", "gbrain", "distill", "documentation", "superpowers"],
    level: "M",
    primary: "chatgpt-pro-consult",
    economy: ["minimax-m3"],
    heavy: ["opus-4-8"],
    maxAgents: 8,
    companionSkills: ["superpowers:writing-skills"],
    stopConditions: ["stable lesson distilled", "raw/private state excluded", "skill body remains actionable"],
    verification: ["self-test or pressure scenario", "diff review", "trigger wording check"],
  },
});

const PROFILE_ALIAS = new Map();
for (const p of Object.values(TASK_PROFILES)) {
  PROFILE_ALIAS.set(p.id, p.id);
  for (const a of p.aliases || []) PROFILE_ALIAS.set(String(a).toLowerCase(), p.id);
}

export function profile(name = "env") {
  const key = PROFILE_ALIAS.get(String(name).toLowerCase()) || "env";
  return {
    ...TASK_PROFILES[key],
    aliases: [...TASK_PROFILES[key].aliases],
    economy: [...TASK_PROFILES[key].economy],
    heavy: [...TASK_PROFILES[key].heavy],
    researchOffload: [...(TASK_PROFILES[key].researchOffload || [])],
    companionSkills: [...TASK_PROFILES[key].companionSkills],
    stopConditions: [...TASK_PROFILES[key].stopConditions],
    verification: [...TASK_PROFILES[key].verification],
  };
}

export function profileForTask(task = "") {
  const text = typeof task === "string" ? task : [task.task, task.taskType, task.domain, task.goal].filter(Boolean).join(" ");
  const lower = text.toLowerCase();
  // Prefer higher-risk/specialized profiles when generic words like "review" or
  // "diff" co-occur with security or migration terms.
  const priority = ["mission-critical-max", "security", "trading", "migration", "env", "ui", "memory", "review"];
  for (const id of priority) {
    const p = TASK_PROFILES[id];
    if (p.aliases.some((a) => lower.includes(String(a).toLowerCase()))) return profile(p.id);
  }
  return profile("env");
}

export function companionSkillsFor(opts = {}) {
  const taskText = typeof opts === "string" ? opts : [opts.task, opts.taskType, opts.domain, opts.goal].filter(Boolean).join(" ");
  const p = profileForTask(taskText || opts.taskType || "");
  const found = new Map();
  const add = (id, when, mode = "use-when-triggered") => found.set(id, { id, when, mode });

  for (const id of p.companionSkills || []) add(id, `profile:${p.id}`);
  if (opts.wantsProjectMap || opts.impactRange || /gitnexus|project map|專案地圖|入口|影響範圍|impact/i.test(taskText)) {
    add("gitnexus:gitnexus", "project map / entrypoints / impact range requested", "passive-explicit-trigger");
  }
  if (opts.securitySensitive || opts.hasDiff || /security|vulnerability|auth|secret|permission|安全|漏洞|權限|diff|PR/i.test(taskText)) {
    add("codex-security:security-diff-scan", "security-sensitive diff or review", "route-to-plugin-skill");
  }
  if (opts.skillAuthoring || /skill|skills|superpowers|TDD|process documentation|技能/i.test(taskText)) {
    add("superpowers:writing-skills", "skill authoring or process-doc improvement", "route-to-plugin-skill");
  }
  return [...found.values()];
}

export function deepResearchPlanForTask(task = "", opts = {}) {
  const taskText = typeof task === "string"
    ? task
    : [task.task, task.taskType, task.domain, task.goal, task.profile, task.profileId].filter(Boolean).join(" ");
  const profileId = opts.profile || opts.profileId || (task && typeof task === "object" && (task.profile || task.profileId)) || profileForTask(taskText || "").id;
  const p = profile(profileId);
  const explicitlyUseful = Boolean(
    opts.force
      || opts.needsExternalResearch
      || opts.deepResearch
      || /deep research|chatgpt pro|external research|來源|官方|研究|鏈上|on-chain|orderbook|funding|portfolio margin|套利/i.test(taskText),
  );
  const use = p.researchOffload.includes(DEEP_RESEARCH_LANE.id) || explicitlyUseful;
  const lane = cloneDeepResearchLane();
  const promptPackages = p.id === "trading"
    ? [
        {
          id: "market-microstructure-sources",
          title: "Market regime / orderbook / OI / funding / liquidation / on-chain / pump detection sources",
          outputFields: ["data_source", "latency", "coverage", "failure_modes", "router_feature_mapping"],
        },
        {
          id: "bybit-portfolio-margin-arbitrage",
          title: "Bybit Portfolio Margin spot/perp arbitrage: fee, funding, MMR, paired-leg execution, broken-hedge repair",
          outputFields: ["official_rule", "cashflow_term", "guardrail", "break_even_condition", "primary_source_url"],
        },
        {
          id: "ai-router-audit-architecture",
          title: "AI trading router architecture with LLM off-hot-path, deterministic guards, and auditable artifacts",
          outputFields: ["pattern", "artifact_schema", "deterministic_guard", "risk_case", "source"],
        },
      ]
    : [
        {
          id: "external-source-map",
          title: "External research source map and current best practices",
          outputFields: ["claim", "source_url", "date", "limitation", "implementation_hint"],
        },
      ];
  return {
    use,
    profile: p.id,
    lane,
    budgetBucket: lane.quotaType,
    countsAsApiFanout: false,
    promptPackages,
    importRule: "Only import sourced claims; Codex must verify primary sources before turning findings into runtime/router artifacts.",
  };
}

export class PremiumAuthError extends Error { constructor(message = "Premium tier requires explicit mission-critical authorization.") { super(message); this.name = "PremiumAuthError"; } }
export class BudgetExceeded extends Error { constructor(message = "Budget floor reached.") { super(message); this.name = "BudgetExceeded"; } }
export class ExecutorBoundaryError extends Error { constructor(message = "Only the Codex executor may perform side effects.") { super(message); this.name = "ExecutorBoundaryError"; } }
export function requirePremiumAuth(ctx = {}) { const ok = ctx.mission_critical === true && ctx.authorized === true && ctx.optInKeyword === "ultrawork:max" && typeof ctx.budget === "number" && ctx.budget > 0; if (!ok) throw new PremiumAuthError(); return true; }
export function resolveTier(taskMeta = {}) { if (taskMeta.requestedTier === "T0-premium" || taskMeta.requestedTier === "premium") { requirePremiumAuth(taskMeta); return "T0-premium"; } if (taskMeta.risk === "high" || taskMeta.needsJudge) return "T2-judge"; if (taskMeta.needsCopilot) return "T1-copilot"; return "T3-scout"; }
export function budgetGuard(budget, { floorPct = 15 } = {}) { if (!budget || typeof budget.limit !== "number") throw new TypeError("budget.limit is required."); const floor = budget.limit * (floorPct / 100); return { assertCanContinue() { const remaining = budget.limit - (budget.spent ?? 0); if (remaining <= floor) throw new BudgetExceeded(`Budget floor reached: remaining=${remaining}, floor=${floor}`); return { remaining, floor, floorPct }; } }; }
export function executorOnly(step = {}) { const sideEffect = step.writes === true || step.shell === true || step.deploy === true || step.destructive === true || step.sideEffect === true; if (sideEffect && step.executor !== "codex") throw new ExecutorBoundaryError(); return true; }
export function redactPublic(value) { return String(value).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted-email]").replace(/(?:sk|pk|ghp|github_pat|xox[baprs])-?[A-Za-z0-9_=-]{12,}/g, "[redacted-token]").replace(/(?:\/Users|\/Volumes|\/home)\/[^\s"'`]+/g, "[redacted-path]").replace(/[A-Fa-f0-9]{32,}/g, "[redacted-id]"); }
export function runMissionCriticalMax() { throw new Error("mission-critical-max orchestration is not implemented; this helper currently provides guardrails only."); }

export function shouldUseUltrawork(opts = {}) {
  const text = typeof opts === "string" ? opts : String(opts.task || opts.goal || "");
  const fileCount = Number(opts.fileCount || 0);
  const risk = String(opts.risk || "").toLowerCase();
  const needsParallelism = Boolean(opts.needsParallelism || opts.multiModel || opts.adversarial || opts.needsReview);
  const small = fileCount <= 1 && !needsParallelism && !/(security|migration|architecture|trading|gateway|multi|review|大量|多模型|架構|安全)/i.test(text);
  if (small && (risk === "" || risk === "low" || risk === "低")) {
    return {
      use: false,
      level: "S",
      reminder: "This looks like a single-model task; remind the human that ultrawork may add coordination overhead and ask/continue with the simpler path.",
    };
  }
  const p = profileForTask(text || opts.taskType || "");
  return { use: true, level: p.level, profile: p.id, reminder: "Use the lowest profile that covers the risk; avoid L/XL fan-out without explicit authorization." };
}

export function budgetPlan(name = "env", opts = {}) {
  const p = profile(name);
  const minimaxPlanConfirmed = Boolean(opts.minimaxPlanConfirmed || process.env.UW_MINIMAX_PLAN_CONFIRMED === "1");
  const scale = opts.scale || p.level;
  const maxAgents = Number(opts.maxAgents || (minimaxPlanConfirmed ? p.maxAgents : Math.min(p.maxAgents, 4)));
  const subscriptionLanes = p.researchOffload.includes(DEEP_RESEARCH_LANE.id) ? [cloneDeepResearchLane()] : [];
  return {
    profile: p.id,
    level: scale,
    primary: p.primary,
    economy: p.economy,
    heavy: p.heavy,
    researchOffload: [...p.researchOffload],
    subscriptionLanes,
    economyLane: minimaxPlanConfirmed ? "bulk" : "metered-or-unconfirmed",
    premiumAuthRequired: Boolean(p.requiresPremiumAuth),
    budgetFloorPct: p.budgetFloorPct || 0,
    apiFanoutExcludes: subscriptionLanes.map((lane) => lane.id),
    maxAgents,
    maxRounds: Number(opts.maxRounds || (scale === "XL" ? 3 : scale === "L" ? 2 : 1)),
    maxOutputTokensPerAgent: Number(opts.maxOutputTokensPerAgent || 1200),
    stopConditions: [...p.stopConditions, "hard budget reached", "human stop"],
    verification: p.verification,
  };
}

const QUIET = process.env.UW_QUIET === "1";
let AGENT_SEQ = 0;
const startedAt = Date.now();
const ledger = []; // { tier, backend, model, tokens, usd, ms, ok }
const transcript = []; // { id, label, tier, backend, model, ms, usd, ok, text, error }
const resumeCache = new Map();
if (RESUME) {
  try {
    for (const line of fs.readFileSync(JOURNAL, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      if (r.ok && r.key && r.result !== undefined) resumeCache.set(r.key, r.result);
    }
  } catch {}
}

function stamp() {
  return `+${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}
export function log(msg) {
  if (QUIET) return;
  process.stderr.write(`[ultrawork ${stamp()}] ${msg}\n`);
}

/**
 * Write a full run report (all subagent outputs + cost) to a file and print
 * only ONE line to stdout — so a controller (e.g. Codex App on GPT) absorbs a
 * pointer, not the sum of every subagent's context. Read the file on demand.
 * @param {{file?:string, summary?:string, result?:any, maxChars?:number}} [opts]
 * @returns {string} report file path
 */
export function report(opts = {}) {
  const file = opts.file || path.join(os.tmpdir(), `uw-report-${Date.now()}.md`);
  const ok = transcript.filter((t) => t.ok).length;
  const L = [
    `# ultrawork run report`,
    `- elapsed: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
    `- subagents: ${transcript.length} (ok ${ok}, failed ${transcript.length - ok})`,
    `- est cost: ~$${spentUSD().toFixed(4)}`,
    ``, `## cost`, "```", costReport(), "```",
    ``, `## subagents`,
  ];
  for (const t of transcript) {
    L.push(`### ${t.label} — ${t.model} (${(t.ms / 1000).toFixed(1)}s, ~$${(t.usd || 0).toFixed(4)})`);
    if (!t.ok) { L.push(`**failed:** ${t.error || ""}`, ``); continue; }
    L.push("```", String(t.text || "").slice(0, opts.maxChars || 20000), "```", ``);
  }
  if (opts.result !== undefined) {
    L.push(`## result`, typeof opts.result === "string" ? opts.result : "```json\n" + JSON.stringify(opts.result, null, 2) + "\n```");
  }
  fs.writeFileSync(file, L.join("\n"));
  const summary = opts.summary || `${transcript.length} subagents, ~$${spentUSD().toFixed(4)}`;
  process.stdout.write(`✅ ultrawork done: ${summary} → report: ${file}\n`);
  return file;
}
function journal(rec) {
  if (!JOURNAL) return;
  try {
    fs.appendFileSync(JOURNAL, JSON.stringify(rec) + "\n");
  } catch {}
}
export function setBudget(usd) {
  BUDGET_USD = normalizeBudgetUsd(usd);
}
function normalizeBudgetUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new TypeError(`budget must be a finite non-negative number, got: ${value}`);
  return n;
}
function estTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}
function recordCost(model, tokens) {
  const rate = COST_PER_MTOK[model] ?? DEFAULT_COST;
  return (tokens / 1_000_000) * rate;
}
function assertBudgetCanStart(label, model, prompt) {
  if (!Number.isFinite(BUDGET_USD)) return;
  const promptUsd = recordCost(model, estTokens(prompt));
  const projected = spentUSD() + promptUsd;
  if (projected > BUDGET_USD) {
    throw new BudgetExceeded(`budget would be exceeded before ${label}: projected prompt-only ~$${projected.toFixed(4)} > $${BUDGET_USD}`);
  }
}
function assertBudgetAfterCall(label) {
  if (!Number.isFinite(BUDGET_USD)) return;
  const spent = spentUSD();
  if (spent > BUDGET_USD) {
    throw new BudgetExceeded(`budget exhausted after ${label}: ~$${spent.toFixed(4)} > $${BUDGET_USD}`);
  }
}
export function spentUSD() {
  return ledger.reduce((s, e) => s + (e.usd || 0), 0);
}
export function costReport() {
  const byModel = {};
  for (const e of ledger) {
    const k = `${e.tier || e.backend}:${e.model}`;
    byModel[k] = byModel[k] || { calls: 0, tokens: 0, usd: 0 };
    byModel[k].calls++;
    byModel[k].tokens += e.tokens || 0;
    byModel[k].usd += e.usd || 0;
  }
  const lines = Object.entries(byModel)
    .sort((a, b) => b[1].usd - a[1].usd)
    .map(([k, v]) => `  ${k}: ${v.calls} calls, ~${v.tokens} tok, ~$${v.usd.toFixed(4)}`);
  return `cost report (estimates):\n${lines.join("\n")}\n  TOTAL ~$${spentUSD().toFixed(4)}`;
}

function run(cmd, args, { input = "", env = process.env, timeoutMs = TIMEOUT_MS, maxOutputBytes = MAX_CHILD_OUTPUT_BYTES } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { env, stdio: ["pipe", "pipe", "pipe"] });
    } catch (err) {
      return resolve({ ok: false, code: null, stdout: "", stderr: `spawn failed: ${err.message}` });
    }
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const finish = (r) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const appendBounded = (streamName, chunk) => {
      const text = String(chunk);
      const bytes = Buffer.byteLength(text);
      if (streamName === "stdout") {
        stdoutBytes += bytes;
        stdout += text;
      } else {
        stderrBytes += bytes;
        stderr += text;
      }
      if (Number.isFinite(maxOutputBytes) && maxOutputBytes > 0 && (stdoutBytes + stderrBytes) > maxOutputBytes) {
        const msg = `\n[${cmd} output exceeded UW_MAX_CHILD_OUTPUT_BYTES=${maxOutputBytes}; terminated to protect controller memory]`;
        try { child.kill("SIGTERM"); } catch {}
        setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 2000).unref();
        finish({ ok: false, code: null, stdout, stderr: stderr + msg });
      }
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000).unref();
      finish({ ok: false, code: null, stdout, stderr: stderr + `\n[timeout ${timeoutMs}ms]` });
    }, timeoutMs);
    timer.unref();
    child.stdout.on("data", (d) => appendBounded("stdout", d));
    child.stderr.on("data", (d) => appendBounded("stderr", d));
    child.on("error", (err) => finish({ ok: false, code: null, stdout, stderr: `${stderr}\n${err.message}` }));
    child.on("close", (code) => finish({ ok: code === 0, code, stdout, stderr }));
    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

// Derive a bare family alias (opus/sonnet/haiku) as a last-resort claude fallback.
function claudeFamily(model) {
  const m = /opus|sonnet|haiku/i.exec(model || "");
  return m ? m[0].toLowerCase() : null;
}

async function backendClaude(prompt, model, timeoutMs) {
  const tryModel = async (mdl) => {
    const args = [
      "-p", "--model", mdl,
      "--output-format", "json",
      "--no-session-persistence",
      "--mcp-config", '{"mcpServers":{}}',
      "--strict-mcp-config",
      "--disable-slash-commands",
      "--disallowedTools", "*",
    ];
    const r = await run(CLAUDE_COMMAND, args, { input: prompt, timeoutMs });
    let j = null;
    try { j = JSON.parse(r.stdout); } catch {}
    return { r, j };
  };
  const wanted = model || "claude-opus-4-8[1m]";
  let { r, j } = await tryModel(wanted);
  // 404 / unknown-model -> fall back to bare family alias once.
  if (j?.is_error && /404|model|not found|invalid/i.test(String(j.result || ""))) {
    const fam = claudeFamily(wanted);
    if (fam && fam !== wanted) ({ r, j } = await tryModel(fam));
  }
  const usage = j?.usage ? (j.usage.input_tokens || 0) + (j.usage.output_tokens || 0) : null;
  if (j) {
    if (j.is_error) throw new Error(`claude is_error: ${String(j.result || "").slice(0, 400)}`);
    return { text: String(j.result ?? ""), tokens: usage };
  }
  throw new Error(`claude backend failed (code ${r.code}): ${(r.stderr || r.stdout).trim().slice(0, 400)}`);
}

async function backendCodex(prompt, model, timeoutMs) {
  const out = path.join(os.tmpdir(), `uw-codex-${crypto.randomBytes(6).toString("hex")}.txt`);
  const args = [
    "exec", "-m", model || "gpt-5.4-mini",
    "--sandbox", "read-only",
    "--skip-git-repo-check",
    "-c", "mcp_servers={}",
    "-C", os.tmpdir(),
    "-o", out,
  ];
  const env = { ...process.env, CODEX_HOME };
  const r = await run(CODEX_COMMAND, args, { input: prompt, env, timeoutMs });
  let text = "";
  try { text = fs.readFileSync(out, "utf8").trim(); fs.unlinkSync(out); } catch {}
  if (!text && !r.ok) throw new Error(`codex backend failed (code ${r.code}): ${r.stderr.trim().slice(0, 400)}`);
  const m = /tokens used[\s\S]*?([\d,]+)/i.exec(r.stdout + r.stderr);
  const tokens = m ? Number(m[1].replace(/,/g, "")) : null;
  return { text, tokens };
}

async function backendGateway(prompt, model, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: model || "minimax-m3",
        stream: false,
        input: [{ type: "message", role: "user", content: [{ type: "input_text", text: prompt }] }],
      }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`gateway ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
    const text = String(j.output_text ?? j.output?.[0]?.content?.[0]?.text ?? "");
    const tokens = j.usage ? (j.usage.input_tokens || 0) + (j.usage.output_tokens || 0) : null;
    return { text, tokens };
  } finally {
    clearTimeout(t);
  }
}

const BACKENDS = { claude: backendClaude, codex: backendCodex, gateway: backendGateway };

function resolve(opts) {
  let backend = opts.backend;
  let model = opts.model;
  if (opts.tier) {
    const t = TIERS[opts.tier];
    if (!t) throw new Error(`unknown tier: ${opts.tier} (${Object.keys(TIERS).join("|")})`);
    backend = backend || t.backend;
    model = model || t.model;
  }
  backend = backend || "gateway";
  return { backend, model };
}

/**
 * Spawn one isolated-context subagent.
 * @param {string} prompt
 * @param {{tier?:string, backend?:string, model?:string, label?:string, schema?:object,
 *          retries?:number, timeoutMs?:number}} [opts]
 * @returns {Promise<string|object>} text, or parsed object when schema is given
 */
export async function agent(prompt, opts = {}) {
  const id = ++AGENT_SEQ;
  const { backend, model } = resolve(opts);
  const fn = BACKENDS[backend];
  if (!fn) throw new Error(`unknown backend: ${backend} (claude|codex|gateway)`);
  const label = opts.label || `${opts.tier || backend}#${id}`;
  let fullPrompt = prompt;
  if (opts.schema) {
    fullPrompt =
      `${prompt}\n\nRespond with ONLY one raw JSON object matching this shape (no prose, no code fence):\n` +
      JSON.stringify(opts.schema);
  }
  const key = crypto.createHash("sha1").update(`${backend}|${model}|${fullPrompt}`).digest("hex");
  if (RESUME && resumeCache.has(key)) {
    log(`⤿ ${label} (resumed from journal)`);
    return resumeCache.get(key);
  }
  if (spentUSD() >= BUDGET_USD) {
    throw new BudgetExceeded(`budget exhausted: ~$${spentUSD().toFixed(4)} >= $${BUDGET_USD}`);
  }
  assertBudgetCanStart(label, model, fullPrompt);
  const retries = opts.retries ?? 1;
  const t0 = Date.now();
  log(`▶ ${label} (${model || "default"})`);
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { text, tokens } = await fn(fullPrompt, model, opts.timeoutMs || TIMEOUT_MS);
      const tok = tokens ?? estTokens(fullPrompt) + estTokens(text);
      const usd = recordCost(model, tok);
      ledger.push({ tier: opts.tier, backend, model, tokens: tok, usd, ms: Date.now() - t0, ok: true });
      let value = opts.schema ? parseJsonLoose(text, label) : text;
      transcript.push({ id, label, tier: opts.tier, backend, model, ms: Date.now() - t0, usd, ok: true, text });
      journal({ id, key, label, backend, model, tokens: tok, usd, ms: Date.now() - t0, ok: true, result: value });
      assertBudgetAfterCall(label);
      log(`✓ ${label} (${((Date.now() - t0) / 1000).toFixed(1)}s, ~$${usd.toFixed(4)})`);
      return value;
    } catch (err) {
      if (err instanceof BudgetExceeded) throw err;
      lastErr = err;
      if (attempt < retries) log(`↻ ${label} retry ${attempt + 1}/${retries}: ${err.message.slice(0, 120)}`);
    }
  }
  // Cross-vendor auth fallback: a stale/invalidated codex OAuth session (401,
  // "token has been invalidated", refresh-token rotation race) kills the whole
  // copilot lane otherwise. Degrade once to a gateway model from another vendor
  // instead of failing the workflow. Opt out with UW_AUTH_FALLBACK_MODEL=off.
  const authErr = /\b401\b|unauthorized|invalidated|not authenticated|token.{0,20}(expired|revoked)/i.test(lastErr?.message || "");
  const fbModel = process.env.UW_AUTH_FALLBACK_MODEL || "grok-build";
  if (backend === "codex" && authErr && fbModel !== "off" && opts._authFallback !== true) {
    log(`⚠ ${label}: codex auth failure (re-login needed) → falling back to gateway:${fbModel}`);
    return agent(prompt, { ...opts, tier: undefined, backend: "gateway", model: fbModel, label: `${label}→fb:${fbModel}`, _authFallback: true });
  }
  ledger.push({ tier: opts.tier, backend, model, ms: Date.now() - t0, ok: false });
  transcript.push({ id, label, tier: opts.tier, backend, model, ms: Date.now() - t0, ok: false, error: lastErr?.message });
  journal({ id, key, label, backend, model, ms: Date.now() - t0, ok: false, error: lastErr?.message });
  log(`✗ ${label}: ${lastErr?.message}`);
  throw lastErr;
}

function parseJsonLoose(text, label) {
  const m = text.match(/\{[\s\S]*\}/);
  const raw = m ? m[0] : text;
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`${label} structured-output parse failed: ${e.message}`);
  }
}

/**
 * Vendor-diverse adversarial verification: run the claim past several DIFFERENT
 * models, each asked to refute. Returns {confirmed, votes, refuted}.
 * @param {string} claim
 * @param {{tiers?:string[], threshold?:number, context?:string}} [opts]
 */
export async function verify(claim, opts = {}) {
  const tiers = opts.tiers || ["fast", "economy", "standard"];
  const ctx = opts.context ? `\n\nContext:\n${opts.context}` : "";
  const votes = await parallel(
    tiers.map((tier, i) => () =>
      agent(
        `Try hard to REFUTE this claim. If you find any flaw, it is refuted. Default to refuted=true when uncertain.\n\nClaim: ${claim}${ctx}`,
        { tier, label: `verify:${tier}`, schema: { refuted: "boolean", reason: "string" } },
      ).catch(() => null),
    ),
  );
  const valid = votes.filter(Boolean);
  const failed = tiers.length - valid.length;
  const refuted = valid.filter((v) => v.refuted === true || String(v.refuted).toLowerCase() === "true").length;
  // Quorum: a majority of the REQUESTED verifiers must have actually returned a vote,
  // else the verdict is untrusted (never confirm on one lucky non-refute when the rest failed).
  const quorum = Math.floor(tiers.length / 2) + 1;
  // Refutes-to-veto threshold counts against ALL requested verifiers; failed votes are
  // treated as uncertain (count toward not-confirmed), never as silent passes.
  const threshold = opts.threshold ?? Math.floor(tiers.length / 2) + 1;
  const confirmed = valid.length >= quorum && refuted + failed < threshold;
  return { confirmed, refuted, failed, total: tiers.length, valid: valid.length, votes: valid };
}

/**
 * Run thunks concurrently with a bounded pool. A throwing thunk resolves to null.
 * @param {Array<() => Promise<any>>} thunks
 * @param {{concurrency?:number}} [opts]
 */
export async function parallel(thunks, opts = {}) {
  const cap = Math.max(1, opts.concurrency || CONCURRENCY);
  const results = new Array(thunks.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= thunks.length) return;
      try {
        results[i] = await thunks[i]();
      } catch {
        results[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(cap, thunks.length) }, worker));
  return results;
}

/**
 * Push each item through all stages independently (no barrier between stages).
 * Each stage gets (prevResult, originalItem, index).
 * @param {any[]} items
 * @param {...((prev:any, item:any, i:number) => Promise<any>)} stages
 */
export async function pipeline(items, ...stages) {
  return parallel(
    items.map((item, i) => async () => {
      let acc = item;
      for (const stage of stages) acc = await stage(acc, item, i);
      return acc;
    }),
  );
}

export const config = { CLAUDE_COMMAND, CODEX_COMMAND, CODEX_HOME, GATEWAY_URL, CONCURRENCY, TIMEOUT_MS, MAX_CHILD_OUTPUT_BYTES, TIERS, COST_PER_MTOK, TASK_PROFILES, DEEP_RESEARCH_LANE };
