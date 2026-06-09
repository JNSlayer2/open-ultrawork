import assert from "node:assert/strict";
import {
  PremiumAuthError,
  BudgetExceeded,
  ExecutorBoundaryError,
  profileForTask,
  companionSkillsFor,
  shouldUseUltrawork,
  budgetPlan,
  resolveTier,
  requirePremiumAuth,
  budgetGuard,
  executorOnly,
  redactPublic,
  runMissionCriticalMax,
  config,
} from "./ultrawork.mjs";

assert.equal(config.TIERS.premium.model, "fable-5");
assert.equal(config.TIERS["T0-premium"].model, "fable-5");
assert.equal(profileForTask("ultrawork:max mission critical gateway migration").id, "mission-critical-max");
assert.equal(profileForTask("frontend UI style exploration").id, "ui");
assert.equal(profileForTask("security review of auth diff").id, "security");
assert.equal(profileForTask("edit an existing skill and improve docs").id, "memory");

const companions = companionSkillsFor({ taskType: "security", hasDiff: true, wantsProjectMap: true, skillAuthoring: true });
assert(companions.some((s) => s.id === "gitnexus:gitnexus"));
assert(companions.some((s) => s.id === "codex-security:security-diff-scan"));
assert(companions.some((s) => s.id === "superpowers:writing-skills"));

const noNeed = shouldUseUltrawork({ task: "translate one sentence", fileCount: 0, risk: "low", needsParallelism: false });
assert.equal(noNeed.use, false);
assert.match(noNeed.reminder, /single-model|不需要|coordination/i);

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
