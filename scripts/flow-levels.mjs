// flow-levels.mjs — S/M/L/XL 等級化 ultrawork 模板:強(對抗驗證)、省(economy 扛量
// + heavy 只收斂)、命中核心(schema 短輸出)、穩定(retries + auth fallback + budget 硬上限)。
//
// 用法(主控 Codex/Claude 以 shell 執行,本腳本是它的工具):
//   UW_LEVEL=M UW_TASK="審查 X 的風險" node flow-levels.mjs
//   UW_LEVEL=L UW_TASK="..." UW_JOURNAL=/tmp/uw.jsonl UW_RESUME=1 node flow-levels.mjs
//   UW_LEVEL=XL 需要明確授權:UW_XL_AUTHORIZED=1(對應 skill 的 L/XL opt-in 規範)
//
// 每級遵守 skill 預算表:S 不開 fan-out;M ≤4 sub/1 reviewer;L ≤16 sub + 對抗驗證;
// XL 分批 + loop-until-dry + budget guard。等級不對外加碼:取能完成任務的最低級別。
import {
  agent,
  parallel,
  verify,
  log,
  report,
  setBudget,
  costReport,
  subagentTaskPacket,
  validateSubagentTaskPacket,
} from "./ultrawork.mjs";

const LEVEL = (process.env.UW_LEVEL || "S").toUpperCase();
const TASK = process.env.UW_TASK || "";
if (!TASK) {
  console.error("UW_TASK is required, e.g. UW_TASK='審查 server.js 的資源邊界' UW_LEVEL=M node flow-levels.mjs");
  process.exit(2);
}

// 等級預設:budget 是會 throw 的硬上限;fanout 是同輪 economy subagent 上限。
const PRESETS = {
  S: { budget: 0.05, fanout: 0, rounds: 1, verifyVotes: 0 },
  M: { budget: 0.3, fanout: 4, rounds: 2, verifyVotes: 1 },
  L: { budget: 1.0, fanout: 16, rounds: 2, verifyVotes: 3 },
  XL: { budget: 4.0, fanout: 16, rounds: 3, verifyVotes: 3, batched: true },
};
const P = PRESETS[LEVEL];
if (!P) { console.error(`unknown UW_LEVEL=${LEVEL} (S|M|L|XL)`); process.exit(2); }
if (LEVEL === "XL" && process.env.UW_XL_AUTHORIZED !== "1") {
  console.error("XL fan-out 需要明確授權:設 UW_XL_AUTHORIZED=1(見 skill 授權要求)");
  process.exit(3);
}
setBudget(Number(process.env.UW_BUDGET_USD || P.budget));

// 命中核心:所有 fan-out 一律 schema 化短輸出,可去重、可合併,不讓自由長文淹沒主控。
const FINDING_SCHEMA = {
  findings: [{
    severity: "P0|P1|P2|P3",
    title: "string",
    evidence: "string(一句)",
    suggested_fix: "string(<=120 chars)",
  }],
  refutations: [{ target: "string", reason: "string(一句)" }],
  patch_proposal: "string(optional unified diff or short patch intent; <=1200 chars; empty if not confident)",
  no_findings: "boolean",
};

log(`level=${LEVEL} budget=$${P.budget} fanout<=${P.fanout} rounds<=${P.rounds}`);

const workflowPacket = subagentTaskPacket({
  objective: TASK,
  authorModel: "ultrawork-economy-scout",
  executorHost: "codex-cli",
  allowedRoots: (process.env.UW_ALLOWED_ROOTS || ".").split(",").map((s) => s.trim()).filter(Boolean),
  deniedPaths: (process.env.UW_DENIED_PATHS || "auth.json,state_5.sqlite,.env,.env.local").split(",").map((s) => s.trim()).filter(Boolean),
  allowedCommands: (process.env.UW_ALLOWED_COMMANDS || "").split(",").map((s) => s.trim()).filter(Boolean),
  writePolicy: "patch_proposal_only",
  maxRuntimeMs: Number(process.env.UW_MAX_RUNTIME_MS || 600000),
  budget: { usd: Number(process.env.UW_BUDGET_USD || P.budget), fanout: P.fanout, rounds: P.rounds, verifyVotes: P.verifyVotes },
  expectedArtifactSchema: "FindingArtifactV1+PatchProposalArtifactV1",
  stopCondition: `rounds<=${P.rounds}; dry>=2; budget exhausted; max ${P.fanout} scouts per round; no direct side effects`,
});
const packetCheck = validateSubagentTaskPacket(workflowPacket);
if (!packetCheck.ok) {
  console.error(`invalid task packet: ${packetCheck.errors.join("; ")}`);
  process.exit(4);
}
const WORKFLOW_PACKET_TEXT = JSON.stringify(workflowPacket).slice(0, 2400);

// ---- S:單模型直答,不開 workflow(協調成本 > 收益時的誠實降級)----
if (LEVEL === "S") {
  const out = await agent(`${TASK}\n\n直接回答,結論先行,<=10 行。`, { tier: "economy", label: "solo" });
  report({ summary: "S: solo economy answer", result: out });
  process.exit(0);
}

// ---- M/L/XL:economy 探索 → (對抗驗證) → heavy 收斂 ----
// 視角分工:每個 subagent 問題窄、互不重疊(perspective-diverse,贏過 N 個相同 prompt)。
const ANGLES = [
  "正確性/邏輯漏洞", "邊界條件/資源上限", "錯誤處理/降級路徑", "安全/權限/秘密外洩",
  "效能/成本", "可觀測性/診斷盲區", "相依/版本/環境假設", "回滾/復原能力",
  "並發/競爭條件", "輸入驗證/注入", "文件與實作落差", "測試覆蓋缺口",
  "向後相容", "外部服務故障面", "資料一致性", "使用者可見故障訊息",
].slice(0, P.fanout);

const seen = new Set();
let allFindings = [];
let allRefutations = [];
let patchProposals = [];
let dry = 0;

for (let round = 1; round <= P.rounds && dry < 2; round++) {
  log(`round ${round}: fan-out ${ANGLES.length} economy scouts`);
  const results = await parallel(
    ANGLES.map((angle, i) => () =>
      agent(
        `任務:${TASK}\n你的唯一視角:${angle}。只報告此視角的發現,其他視角會由別的 agent 覆蓋。` +
        `\n任務包:${WORKFLOW_PACKET_TEXT}` +
        `\n輸出要短。若要給 patch_proposal,只在很有把握且範圍很小時給 unified diff 或 patch intent；不要長文。` +
        (round > 1 ? `\n已知發現(不要重複):${[...seen].join("; ").slice(0, 2000)}` : ""),
        { tier: "economy", label: `scout:${angle}#r${round}`, schema: FINDING_SCHEMA, retries: 1 },
      ).catch(() => null),
    ),
  );
  const validResults = results.filter(Boolean);
  allRefutations.push(...validResults.flatMap((r) => r.refutations || [])
    .filter((r) => r && r.target && r.reason));
  patchProposals.push(...validResults.map((r) => String(r.patch_proposal || "").trim())
    .filter(Boolean)
    .map((text) => text.slice(0, 1200)));
  const fresh = validResults.flatMap((r) => r.findings || [])
    .filter((f) => f && f.title && !seen.has(f.title));
  if (!fresh.length) { dry++; continue; }
  dry = 0;
  fresh.forEach((f) => seen.add(f.title)); // 對 seen 去重,不是對已驗證集合,否則永不收斂
  allFindings.push(...fresh);
  log(`round ${round}: +${fresh.length} fresh findings (total ${allFindings.length})`);
}

// 對抗驗證(L/XL):每個 P0/P1 派 verifyVotes 個獨立 skeptic 反駁,多數反駁即作廢。
if (P.verifyVotes >= 3) {
  const critical = allFindings.filter((f) => /P0|P1/.test(f.severity));
  log(`adversarial verify: ${critical.length} critical findings x ${P.verifyVotes} skeptics`);
  const verdicts = await parallel(
    critical.map((f) => () =>
      verify(`finding「${f.title}」(${f.evidence})是真實、可操作、非誤報`, {
        tiers: ["economy", "fast", "standard"].slice(0, P.verifyVotes),
      }).then((v) => ({ f, ok: v.confirmed })).catch(() => ({ f, ok: true })), // 驗證器壞掉時保守保留
    ),
  );
  const killed = verdicts.filter((v) => !v.ok).map((v) => v.f.title);
  if (killed.length) log(`refuted by majority: ${killed.join(" | ").slice(0, 200)}`);
  allFindings = allFindings.filter((f) => !killed.includes(f.title));
}

// heavy 只收斂一次:這是唯一的 premium 花費點。
log("heavy convergence");
const final = await agent(
  `任務:${TASK}\n以下是多視角 scout findings(已去重${P.verifyVotes >= 3 ? "+對抗驗證" : ""})。` +
  `\n任務包與停止條件:${WORKFLOW_PACKET_TEXT}\n` +
  `同時參考 refutations 與 bounded patch proposals。` +
  `收斂成:1) top 風險排序 2) 每項一行修法 3) 可採用的小 patch intent 4) 哪些可忽略與為何。<=20 行,繁中。\n\n` +
  JSON.stringify({ findings: allFindings, refutations: allRefutations, patch_proposals: patchProposals }).slice(0, 12000),
  { tier: "heavy", label: "converge", retries: 1 },
);

report({ summary: `${LEVEL}: ${allFindings.length} findings -> converged`, result: final });
log(costReport());
