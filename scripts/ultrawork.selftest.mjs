import assert from "node:assert/strict";
import {
  profileForTask,
  companionSkillsFor,
  shouldUseUltrawork,
  budgetPlan,
  deepResearchPlanForTask,
  PremiumAuthError,
  BudgetExceeded,
  ExecutorBoundaryError,
  resolveTier,
  requirePremiumAuth,
  budgetGuard,
  executorOnly,
  redactPublic,
  runMissionCriticalMax,
  setBudget,
  config,
} from "./ultrawork.mjs";

assert.equal(config.TIERS.premium.model, "fable-5");
assert.equal(config.TIERS["T0-premium"].model, "fable-5");
assert.equal(config.TIERS.copilot.model, "chatgpt-pro-consult");
assert.equal(config.TIERS["T1-copilot"].model, "chatgpt-pro-consult");
assert.equal(config.TIERS["chatgpt-pro-consult"].model, "chatgpt-pro-consult");
assert.equal(config.COST_PER_MTOK["chatgpt-pro-consult"], 12);
assert(config.MAX_CHILD_OUTPUT_BYTES > 0);
assert.throws(() => setBudget("not-a-number"), TypeError);
assert.equal(profileForTask("ultrawork:max mission critical gateway migration").id, "mission-critical-max");
assert.equal(profileForTask("frontend UI style exploration").id, "ui");
assert.equal(profileForTask("security review of auth diff").id, "security");
assert.equal(profileForTask("trading strategy backtest with Hermes").id, "trading");
assert.equal(profileForTask("edit an existing skill and improve docs").id, "memory");

const companions = companionSkillsFor({ taskType: "security", hasDiff: true, wantsProjectMap: true, skillAuthoring: true });
assert(companions.some((s) => s.id === "gitnexus:gitnexus"));
assert(companions.some((s) => s.id === "codex-security:security-diff-scan"));
assert(companions.some((s) => s.id === "superpowers:writing-skills"));

const envCompanions = companionSkillsFor({ task: "gateway architecture migration" });
assert(envCompanions.some((s) => s.id === "gitnexus:gitnexus"));

const tradingCompanions = companionSkillsFor({ task: "Hermes 交易策略回測與風控副審" });
assert(tradingCompanions.some((s) => s.id === "trading-training"));

const noNeed = shouldUseUltrawork({ task: "translate one sentence", fileCount: 0, risk: "low", needsParallelism: false });
assert.equal(noNeed.use, false);
assert.match(noNeed.reminder, /single-model|不需要|提醒/i);

const unconfirmedPlan = budgetPlan("ui");
assert.equal(unconfirmedPlan.economyLane, "metered-or-unconfirmed");
assert(unconfirmedPlan.maxAgents <= 4);

const uiPlan = budgetPlan("ui", { minimaxPlanConfirmed: true });
assert.equal(uiPlan.primary, "chatgpt-pro-consult");
assert.equal(uiPlan.economyLane, "bulk");
assert(uiPlan.maxAgents >= 8);
assert(uiPlan.stopConditions.length > 0);

const tradingPlan = budgetPlan("trading", { minimaxPlanConfirmed: true, maxRounds: 1 });
assert.equal(tradingPlan.profile, "trading");
assert(tradingPlan.maxAgents <= 24);
assert(tradingPlan.verification.some((v) => /Time Room|Hermes/.test(v)));
assert(tradingPlan.researchOffload.includes("chatgpt_pro_deep_research"));
assert(tradingPlan.subscriptionLanes.some((lane) => lane.id === "chatgpt_pro_deep_research"));
assert(tradingPlan.apiFanoutExcludes.includes("chatgpt_pro_deep_research"));
assert.equal(tradingPlan.subscriptionLanes[0].hotPath, false);
assert.equal(tradingPlan.subscriptionLanes[0].apiFanout, false);
assert(tradingPlan.subscriptionLanes[0].forbidden.some((item) => /live order|leverage|secrets|API keys/i.test(item)));

const deepResearch = deepResearchPlanForTask("Hermes AI 自動化交易 orderbook funding on-chain pump detection 套利");
assert.equal(deepResearch.use, true);
assert.equal(deepResearch.countsAsApiFanout, false);
assert.equal(deepResearch.lane.id, "chatgpt_pro_deep_research");
assert(deepResearch.promptPackages.some((pkg) => pkg.id === "market-microstructure-sources"));
assert(deepResearch.promptPackages.some((pkg) => pkg.id === "bybit-portfolio-margin-arbitrage"));
assert.match(deepResearch.importRule, /Codex must verify primary sources/);

assert.throws(() => resolveTier({ requestedTier: "T0-premium" }), PremiumAuthError);
assert.throws(() => requirePremiumAuth({ mission_critical: true, authorized: true, optInKeyword: "ultrawork:max" }), PremiumAuthError);
assert.equal(resolveTier({ requestedTier: "T0-premium", mission_critical: true, authorized: true, optInKeyword: "ultrawork:max", budget: 100 }), "T0-premium");
assert.equal(resolveTier({ risk: "high" }), "T2-judge");
assert.equal(resolveTier({ needsCopilot: true }), "T1-copilot");
assert.equal(resolveTier({}), "T3-scout");
assert.throws(() => budgetGuard({ limit: 100, spent: 86 }).assertCanContinue(), BudgetExceeded);
assert.deepEqual(budgetGuard({ limit: 100, spent: 80 }).assertCanContinue(), { remaining: 20, floor: 15, floorPct: 15 });
assert.equal(executorOnly({ writes: false, executor: "fable-5" }), true);
assert.throws(() => executorOnly({ writes: true, executor: "fable-5" }), ExecutorBoundaryError);
assert.equal(executorOnly({ shell: true, executor: "codex" }), true);
const fakePath = "/" + "Users" + "/alice/project";
const fakeToken = "g" + "hp_" + "abcdefghijklmnopqrstuvwxyz123";
const fakeEmail = "a" + "@" + "example.com";
const fakeId = "0123456789abcdef" + "0123456789abcdef";
const redacted = redactPublic(`${fakePath} token ${fakeToken} email ${fakeEmail} id ${fakeId}`);
assert(!redacted.includes(fakePath));
assert(!redacted.includes(fakeToken));
assert(!redacted.includes(fakeEmail));
assert(!redacted.includes(fakeId));
assert.throws(() => runMissionCriticalMax(), /not implemented/);
const premiumPlan = budgetPlan("mission-critical-max", { minimaxPlanConfirmed: true, maxRounds: 3 });
assert.equal(premiumPlan.profile, "mission-critical-max");
assert.equal(premiumPlan.primary, "fable-5");
assert.equal(premiumPlan.premiumAuthRequired, true);
assert.equal(premiumPlan.budgetFloorPct, 15);

console.log("ultrawork selftest ok");
