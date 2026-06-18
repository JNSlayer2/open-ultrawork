import assert from "node:assert/strict";
import {
  profileForTask,
  companionSkillsFor,
  shouldUseUltrawork,
  budgetPlan,
  deepResearchPlanForTask,
  ACADEMIC_REVIEW_SCHEMA,
  academicContinuityPacket,
  proAcademicPrompt,
  academicCollaborationPlan,
  academicPromotionGate,
  academicReviewArtifact,
  AcademicPromotionError,
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
assert.equal(profileForTask("academic source-grounded code review and paper-style evidence audit").id, "academic");
const academicPlan = budgetPlan("academic", { minimaxPlanConfirmed: true, maxRounds: 2 });
assert.equal(academicPlan.primary, "chatgpt-pro-consult");
assert(academicPlan.verification.some((v) => /claim.*evidence|citation|rebuttal/i.test(v)));
assert.equal(academicPlan.maxOutputTokensPerAgent <= 1200, true);
const acPacket = academicContinuityPacket({
  planId: "pro-academic-smoke",
  question: "Does the ChatGPT Pro lane preserve enough context for code-health review?",
  constraints: ["Codex executes side effects only", "No local secrets in public packet"],
  claims: [{ id: "c1", text: "chatgpt-pro-consult rewrites only the model field", evidence: ["runtime/server.js:gptPassthroughBodyText"], status: "observed" }],
  decisions: ["Use explicit continuity packet for open-ultrawork isolated agents"],
  openQuestions: ["Should advisory mode strip tool schemas?"],
  verificationCommands: ["npm test --prefix runtime"],
  artifactRefs: ["commit:c80a426"],
});
assert.equal(acPacket.kind, "AcademicContinuityPacketV1");
assert.match(acPacket.content_hash, /^[a-f0-9]{64}$/);
assert.equal(acPacket.claims[0].evidence[0], "runtime/server.js:gptPassthroughBodyText");
assert(!JSON.stringify(acPacket).includes("/Users/"));
const acPrompt = proAcademicPrompt(acPacket);
assert.match(acPrompt, /PRO_ACADEMIC_REVIEW/);
assert.match(acPrompt, /claim.*evidence/i);
assert.match(acPrompt, /unsupported|rebuttal/i);
assert.equal(ACADEMIC_REVIEW_SCHEMA.verdict, "string");
const acWorkflow = academicCollaborationPlan({ task: "high risk architecture review", packet: acPacket });
assert.equal(acWorkflow.primaryTier, "chatgpt-pro-consult");
assert(acWorkflow.steps.some((step) => /claim ledger/i.test(step)));
const hypothesisPacket = academicContinuityPacket({
  planId: "hypothesis-smoke",
  question: "Is an unsupported claim prevented from promotion?",
  claims: [{ id: "u1", text: "This unsupported claim must not be promoted" }],
});
assert.equal(hypothesisPacket.claims[0].status, "hypothesis");
assert.throws(() => academicPromotionGate({
  verdict: "ship",
  supported_claims: [],
  unsupported_claims: [{ id: "u1", reason: "no evidence" }],
  rebuttals: [{ target: "u1", objection: "unsupported", severity: "P1" }],
  next_tests: [],
}), AcademicPromotionError);
const promoted = academicPromotionGate({
  verdict: "ship-with-follow-up",
  supported_claims: [{ id: "c1", reason: "code evidence", evidence_used: ["runtime/server.js"] }],
  unsupported_claims: [],
  rebuttals: [{ target: "c1", objection: "minor caveat", severity: "P3" }],
  next_tests: ["npm test"],
});
assert.equal(promoted.ok, true);
assert.equal(promoted.promoted_claim_ids[0], "c1");
const acArtifact = academicReviewArtifact({ packet: acPacket, review: {
  verdict: "ship-with-follow-up",
  supported_claims: [{ id: "c1", reason: "code evidence", evidence_used: ["runtime/server.js"] }],
  unsupported_claims: [],
  rebuttals: [],
  next_tests: ["npm test"],
}, promotion: promoted });
assert.equal(acArtifact.kind, "AcademicReviewArtifactV1");
assert.equal(acArtifact.packet_hash, acPacket.content_hash);
assert.match(acArtifact.review_hash, /^[a-f0-9]{64}$/);
assert.equal(acArtifact.promotion.ok, true);

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
