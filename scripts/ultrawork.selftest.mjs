import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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
  AUTHORITY_MODES,
  authorityProfileFor,
  authorizeExecution,
  subagentTaskPacket,
  validateSubagentTaskPacket,
  proResearchJob,
  importProResearchReport,
  proResearchPromotionGate,
  ProResearchPromotionError,
  backendCapabilityProfile,
  authorityLabel,
  costReportKey,
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
assert.equal(config.TIERS.copilot.model, "gpt-5.5");
assert.equal(config.TIERS["T1-copilot"].model, "gpt-5.5");
assert.equal(config.TIERS["chatgpt-pro-consult"].model, "gpt-5.5");
assert.equal(config.COST_PER_MTOK["chatgpt-pro-consult"], 12);
assert.equal(config.PRO_FAST_CONSULT_TIER, "consultant");
assert.equal(config.TIERS[config.PRO_FAST_CONSULT_TIER].model, "gpt-5.5");
assert(config.MAX_CHILD_OUTPUT_BYTES > 0);
assert.throws(() => setBudget("not-a-number"), TypeError);
assert.equal(profileForTask("ultrawork:max mission critical gateway migration").id, "mission-critical-max");
assert.equal(profileForTask("frontend UI style exploration").id, "ui");
assert.equal(profileForTask("security review of auth diff").id, "security");
assert.equal(profileForTask("trading strategy backtest with Hermes").id, "trading");
assert.equal(profileForTask("edit an existing skill and improve docs").id, "memory");
assert.equal(profileForTask("academic source-grounded code review and paper-style evidence audit").id, "academic");
const academicPlan = budgetPlan("academic", { minimaxPlanConfirmed: true, maxRounds: 2 });
assert.equal(academicPlan.primary, "gpt-5.5");
assert(academicPlan.researchOffload.includes("chatgpt_pro_research_mcp"));
assert(academicPlan.subscriptionLanes.some((lane) => lane.executor === "chatgpt-pro-mcp-web-adapter"));
assert(academicPlan.verification.some((v) => /claim.*evidence|citation|rebuttal/i.test(v)));
assert.equal(academicPlan.maxOutputTokensPerAgent <= 1200, true);
const acPacket = academicContinuityPacket({
  planId: "pro-academic-smoke",
  question: "Does the ChatGPT Pro lane preserve enough context for code-health review?",
  constraints: ["Codex executes side effects only", "No local secrets in public packet"],
  claims: [{ id: "c1", text: "gpt-5.5 is the fast consult lane; chatgpt-pro-consult is only a hidden compatibility alias", evidence: ["runtime/server.js:gptPassthroughBodyText"], status: "observed" }],
  decisions: ["Use explicit continuity packet for open-ultrawork isolated agents"],
  openQuestions: ["Should advisory mode strip tool schemas?"],
  verificationCommands: ["npm test --prefix runtime"],
  verificationReceipts: ["npm test --prefix runtime: pass"],
  artifactRefs: ["commit:c80a426"],
});
assert.equal(acPacket.kind, "AcademicContinuityPacketV1");
assert.match(acPacket.content_hash, /^[a-f0-9]{64}$/);
assert.equal(acPacket.claims[0].evidence[0], "runtime/server.js:gptPassthroughBodyText");
assert.equal(acPacket.verification_receipts[0], "npm test --prefix runtime: pass");
assert(!JSON.stringify(acPacket).includes("/Users/"));
const acPrompt = proAcademicPrompt(acPacket);
assert.match(acPrompt, /PRO_ACADEMIC_REVIEW/);
assert.match(acPrompt, /claim.*evidence/i);
assert.match(acPrompt, /unsupported|rebuttal/i);
assert.equal(ACADEMIC_REVIEW_SCHEMA.verdict, "string");
const acWorkflow = academicCollaborationPlan({ task: "high risk architecture review", packet: acPacket });
assert.equal(acWorkflow.primaryTier, "consultant");
assert.equal(acWorkflow.primaryModel, "gpt-5.5");
assert.equal(acWorkflow.researchLane, "chatgpt_pro_research_mcp");
assert(acWorkflow.steps.some((step) => /claim ledger/i.test(step)));
assert(acWorkflow.steps.some((step) => /submit_deep_research|fetch_deep_research_result/i.test(step)));
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
assert.equal(uiPlan.primary, "gpt-5.5");
assert.equal(uiPlan.economyLane, "bulk");
assert(uiPlan.maxAgents >= 8);
assert(uiPlan.stopConditions.length > 0);

const tradingPlan = budgetPlan("trading", { minimaxPlanConfirmed: true, maxRounds: 1 });
assert.equal(tradingPlan.profile, "trading");
assert(tradingPlan.maxAgents <= 24);
assert(tradingPlan.verification.some((v) => /Time Room|Hermes/.test(v)));
assert(tradingPlan.researchOffload.includes("chatgpt_pro_research_mcp"));
assert(tradingPlan.subscriptionLanes.some((lane) => lane.id === "chatgpt_pro_research_mcp"));
assert(tradingPlan.apiFanoutExcludes.includes("chatgpt_pro_research_mcp"));
assert.equal(tradingPlan.subscriptionLanes[0].hotPath, false);
assert.equal(tradingPlan.subscriptionLanes[0].apiFanout, false);
assert(tradingPlan.subscriptionLanes[0].forbidden.some((item) => /live order|leverage|secrets|API keys|raw browser/i.test(item)));

const deepResearch = deepResearchPlanForTask("Hermes AI 自動化交易 orderbook funding on-chain pump detection 套利");
assert.equal(deepResearch.use, true);
assert.equal(deepResearch.countsAsApiFanout, false);
assert.equal(deepResearch.lane.id, "chatgpt_pro_research_mcp");
assert.equal(deepResearch.lane.executor, "chatgpt-pro-mcp-web-adapter");
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
assert.equal(AUTHORITY_MODES.TOOL_INTENT_BRIDGE, "tool_intent_bridge");
assert.equal(
  costReportKey({
    tier: "judge",
    backend: "gateway",
    model: "transport-wrapper",
    author_model: "opus-4-8",
    executor_host: "codex-app",
    authority_mode: "tool_intent_bridge",
  }),
  "judge:opus-4-8",
);
assert.match(
  authorityLabel({
    model: "transport-wrapper",
    author_model: "opus-4-8",
    executor_host: "codex-app",
    authority_mode: "tool_intent_bridge",
  }),
  /author=opus-4-8 executor=codex-app mode=tool_intent_bridge/,
);
const opusAuthority = authorityProfileFor({ backend: "gateway", model: "opus-4-8", surface: "codex-app" });
assert.equal(opusAuthority.author_model, "opus-4-8");
assert.equal(opusAuthority.decision_model, "opus-4-8");
assert.equal(opusAuthority.executor_host, "codex-app");
assert.equal(opusAuthority.authority_mode, "tool_intent_bridge");
assert.equal(opusAuthority.patch_proposal, true);
assert.equal(authorizeExecution({ writes: true, author_model: "opus-4-8", executor_host: "codex-app", authority_mode: "tool_intent_bridge" }), true);
assert.throws(() => authorizeExecution({ writes: true, author_model: "opus-4-8", executor_host: "minimax-m3", authority_mode: "brain_only" }), ExecutorBoundaryError);
assert.throws(() => authorizeExecution({ writes: true, author_model: "claude-opus-4-8[1m]", executor_host: "codex-app", authority_mode: "patch_proposal" }), ExecutorBoundaryError);
const claudeBrain = backendCapabilityProfile({ backend: "claude", model: "claude-opus-4-8[1m]" });
assert.equal(claudeBrain.native_dynamic_workflow, false);
assert.equal(claudeBrain.backend_mode, "claude_print_json_tools_off");
assert.equal(claudeBrain.authority_mode, "brain_only");
const claudeAuthority = authorityProfileFor({ backend: "claude", model: "claude-opus-4-8[1m]" });
assert.equal(claudeAuthority.author_model, "claude-opus-4-8[1m]");
assert.equal(claudeAuthority.authority_mode, "patch_proposal");
assert.throws(() => authorizeExecution({ writes: true, executor_host: "codex-cli", authority_mode: claudeAuthority.authority_mode }), ExecutorBoundaryError);
const claudeSandboxDescriptor = backendCapabilityProfile({ backend: "claude-code-sandbox", model: "claude-opus-4-8[1m]" });
assert.equal(claudeSandboxDescriptor.native_dynamic_workflow, true);
assert.equal(claudeSandboxDescriptor.spawnable, false);
const taskPacket = subagentTaskPacket({
  objective: "Review the gateway authority metadata without touching secrets.",
  allowedRoots: ["runtime/server.js"],
  deniedPaths: ["auth.json", "state_5.sqlite"],
  allowedCommands: ["node --test test/*.test.js"],
  writePolicy: "patch_proposal_only",
  maxRuntimeMs: 60000,
  budget: { maxAgents: 2, maxUsd: 0.05 },
  expectedArtifactSchema: "PatchProposalArtifactV1",
  stopCondition: "first actionable patch proposal or no findings",
  authorModel: "grok-build",
  executorHost: "codex-app",
});
assert.equal(taskPacket.kind, "SubagentTaskPacketV1");
assert.equal(taskPacket.author_model, "grok-build");
assert.equal(taskPacket.executor_host, "codex-app");
assert.equal(validateSubagentTaskPacket(taskPacket).ok, true);
const badAuthorityPacket = subagentTaskPacket({
  objective: "A non-executor model must not claim sandbox execution authority.",
  authorModel: "chatgpt-pro-web",
  executorHost: "codex-app",
  authorityMode: AUTHORITY_MODES.SANDBOX_EXECUTOR,
  allowedRoots: ["runtime/server.js"],
  deniedPaths: ["auth.json"],
  allowedCommands: ["npm test"],
  budget: { maxAgents: 1 },
  expectedArtifactSchema: "PatchProposalArtifactV1",
  stopCondition: "no side effects",
});
assert.equal(validateSubagentTaskPacket(badAuthorityPacket).ok, false);
const badClaudeAuthorityPacket = subagentTaskPacket({
  objective: "Claude -p brain output must not claim sandbox execution authority.",
  authorModel: "claude-opus-4-8[1m]",
  executorHost: "codex-app",
  authorityMode: AUTHORITY_MODES.SANDBOX_EXECUTOR,
  allowedRoots: ["scripts/ultrawork.mjs"],
  deniedPaths: ["auth.json"],
  allowedCommands: ["node scripts/ultrawork.selftest.mjs"],
  budget: { maxAgents: 1 },
  expectedArtifactSchema: "PatchProposalArtifactV1",
  stopCondition: "no direct sandbox side effects",
});
assert.equal(validateSubagentTaskPacket(badClaudeAuthorityPacket).ok, false);
const sandboxDescriptorPacket = subagentTaskPacket({
  objective: "Represent a future Claude Code sandbox lane without claiming it is currently spawnable.",
  authorModel: "claude-opus-4-8[1m]",
  executorHost: "claude-code-sandbox",
  authorityMode: AUTHORITY_MODES.SANDBOX_EXECUTOR,
  allowedRoots: ["scripts/ultrawork.mjs"],
  deniedPaths: ["auth.json"],
  allowedCommands: ["node scripts/ultrawork.selftest.mjs"],
  budget: { maxAgents: 1 },
  expectedArtifactSchema: "PatchProposalArtifactV1",
  stopCondition: "descriptor only until a real sandbox backend exists",
});
const sandboxDescriptorCheck = validateSubagentTaskPacket(sandboxDescriptorPacket);
assert.equal(sandboxDescriptorCheck.ok, true);
assert(sandboxDescriptorCheck.warnings.some((warning) => /not yet spawnable|descriptor/i.test(warning)));
const proJob = proResearchJob({
  question: "What primary-source evidence is required before claiming chatgpt-pro-mcp produced confirmed Deep Research?",
  constraints: ["Do not include secrets", "Prefer official docs"],
  sourceRequirements: ["OpenAI help/docs", "primary sources only"],
  expectedClaims: ["Deep Research is asynchronous and sourced"],
});
assert.equal(proJob.kind, "ProResearchJobV1");
assert.equal(proJob.sync_responses_model, false);
assert.equal(proJob.executor, "chatgpt-pro-mcp-web-adapter");
assert.equal(proJob.authority.author_model, "chatgpt-pro-web");
assert.equal(proJob.deep_research_confirmed, false);
assert.equal(proJob.submit_tool, "submit_deep_research");
assert.equal(proJob.fetch_tool, "fetch_deep_research_result");
assert.match(proJob.prompt, /Deep Research/i);
const mcpImportedReport = importProResearchReport({
  job: proJob,
  taskId: "job_public_safe_001",
  taskStatus: "completed",
  deepResearchConfirmed: false,
  researchMode: { enabled: false, observation: "research mode button not confirmed" },
  reportText: "Claim: The async lane can return sourced memos for Codex verification.",
  sourceLinks: [
    "https://help.openai.com/en/articles/10500283-deep-research",
    "https://chatgpt.com/c/private-thread-id",
  ],
  claims: [
    { id: "c0", text: "MCP task metadata can replace a human-run timestamp for provenance.", evidence: ["https://help.openai.com/en/articles/10500283-deep-research"] },
  ],
});
assert.equal(mcpImportedReport.provenance_ok, true);
assert.equal(mcpImportedReport.deep_research_confirmed, false);
assert.equal(mcpImportedReport.mcp_task_id, "job_public_safe_001");
assert(!mcpImportedReport.source_links.some((link) => /chatgpt\.com\/c\//.test(link)));
const importedReport = importProResearchReport({
  job: proJob,
  researchRanAt: "2026-06-18T00:00:00Z",
  reportText: "Claim: Deep Research returns sourced reports. Source: https://help.openai.com/en/articles/10500283-deep-research",
  sourceLinks: ["https://help.openai.com/en/articles/10500283-deep-research"],
  claims: [
    { id: "c1", text: "Deep Research returns sourced reports.", evidence: ["https://help.openai.com/en/articles/10500283-deep-research"] },
    { id: "c2", text: "Unsourced local claim." },
  ],
});
assert.equal(importedReport.kind, "ProResearchImportArtifactV1");
assert.equal(importedReport.supported_claims.length, 1);
assert.equal(importedReport.unsupported_claims.length, 1);
assert.equal(importedReport.provenance_ok, true);
assert.equal(importedReport.promotion_allowed, false);
assert.throws(() => proResearchPromotionGate(importedReport), ProResearchPromotionError);
const incompleteProImport = importProResearchReport({
  job: proJob,
  reportText: "Claim: Deep Research returns sourced reports.",
  claims: [{ id: "c1", text: "Deep Research returns sourced reports.", evidence: ["https://help.openai.com/en/articles/10500283-deep-research"] }],
});
assert.equal(incompleteProImport.promotion_allowed, false);
assert(incompleteProImport.provenance_errors.some((error) => /research_ran_at/.test(error)));
assert(incompleteProImport.provenance_errors.some((error) => /source_links/.test(error)));
const cleanProImport = importProResearchReport({
  job: proJob,
  researchRanAt: "2026-06-18T00:00:00Z",
  reportText: "Claim: Deep Research returns sourced reports. Source: https://help.openai.com/en/articles/10500283-deep-research",
  sourceLinks: ["https://help.openai.com/en/articles/10500283-deep-research"],
  claims: [{ id: "c1", text: "Deep Research returns sourced reports.", evidence: ["https://help.openai.com/en/articles/10500283-deep-research"] }],
});
assert.equal(proResearchPromotionGate(cleanProImport).ok, true);
const fakePath = "/" + "Users" + "/alice/project";
const fakeTmpPath = "/" + "tmp" + "/secret-project/file.txt";
const fakeTildePath = "~" + "/secret-project/file.txt";
const fakeWindowsPath = "C:" + "\\Users\\alice\\secret.txt";
const fakeToken = "g" + "hp_" + "abcdefghijklmnopqrstuvwxyz123";
const fakeXaiToken = "xai-" + "abcdefghijklmnopqrstuvwxyz123";
const fakeEmail = "a" + "@" + "example.com";
const fakeId = "0123456789abcdef" + "0123456789abcdef";
const contentHash = "a".repeat(64);
const redacted = redactPublic(`${fakePath} ${fakeTmpPath} ${fakeTildePath} ${fakeWindowsPath} token ${fakeToken} ${fakeXaiToken} email ${fakeEmail} thread_id=${fakeId} content_hash=${contentHash}`);
assert(!redacted.includes(fakePath));
assert(!redacted.includes(fakeTmpPath));
assert(!redacted.includes(fakeTildePath));
assert(!redacted.includes(fakeWindowsPath));
assert(!redacted.includes(fakeToken));
assert(!redacted.includes(fakeXaiToken));
assert(!redacted.includes(fakeEmail));
assert(!redacted.includes(fakeId));
assert(redacted.includes(`content_hash=${contentHash}`));
const flowLevelsSource = fs.readFileSync(path.join(import.meta.dirname, "flow-levels.mjs"), "utf8");
assert.match(flowLevelsSource, /ok:\s*v\.confirmed/);
assert.doesNotMatch(flowLevelsSource, /ok:\s*v\.verdict/);
assert.throws(() => runMissionCriticalMax(), /not implemented/);
const premiumPlan = budgetPlan("mission-critical-max", { minimaxPlanConfirmed: true, maxRounds: 3 });
assert.equal(premiumPlan.profile, "mission-critical-max");
assert.equal(premiumPlan.primary, "fable-5");
assert.equal(premiumPlan.premiumAuthRequired, true);
assert.equal(premiumPlan.budgetFloorPct, 15);

console.log("ultrawork selftest ok");
