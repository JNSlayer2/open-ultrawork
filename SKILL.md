---
name: open-ultrawork
description: Use when a task needs Claude Code Dynamic Workflows, ultracode-style orchestration, multi-model delegation, cross-model review, parallel subagents, adversarial validation, or a token-budgeted workflow for complex engineering, research, security, trading, debugging, migration, or architecture tasks. Also use when Codex, Claude, Grok, Minimax, GPT, or another model must cooperate in one thread while Codex remains responsible for grounded tool execution and final verification.
metadata:
  short-description: 多模型 Dynamic Workflows / ultrawork 調度規範
---

# open-ultrawork

本 skill 定義一套通用的多模型工作流：讓其他 AI 也可以透過主控代理、bridge、CLI、gateway 或人工授權，使用 Claude Code 原生 Dynamic Workflows / ultracode 能力。`open-ultrawork` 是本地工作流名稱；官方能力應稱為 Claude Code Dynamic Workflows / ultracode。其他 AI 可調用或編排 Claude Code 的原生能力，但不要被描述成自身也原生擁有該能力。

核心原則：**主控代理／執行宿主負責落地與驗證；Claude Dynamic Workflows 負責大規模探索、並行分派與高品質審稿；外部模型在被授權的 request / bridge / thread / sandbox 範圍內可真正主導方案、代碼與 patch intent，但 artifact 必須保留真實 `author_model`。**

## 何時使用

使用本 skill 當任務符合任一條件：

- 任務龐大、未知多、需要拆成多個平行子任務。
- 需要 Claude Code Dynamic Workflows / ultracode 協助研究、審查、修復或重構。
- 需要多模型同 thread 協作：探索、代勞、對抗驗證、收斂、落地。
- 需要 ChatGPT Pro 等高階模型做學術式協作：claim/evidence ledger、來源核查、反駁、替代假說、研究級審稿。
- 高風險工程：大型重構、資料遷移、安全修補、交易系統、工具橋接、agent orchestration、模型接入。
- 使用者要求「Claude 協作」「dynamic workflows」「ultrawork」「多 AI 協作」「subagents 並行」「對抗驗證」「模型分工」「token 預算」。

不要使用本 skill 當任務可由單模型短回覆完成，或只是簡單翻譯、格式化、單檔小修。

### 低收益時要提醒人類

若任務只是單句翻譯、簡單格式化、單檔小修、一次性查詢，主控代理應直接提醒：「這不需要開 ultrawork，多模型協作會增加協調成本」，然後用單模型完成或詢問是否仍要啟動。這不是拒絕，而是預算管理的一部分。

判斷口訣：沒有平行探索、沒有高風險、沒有審稿需求、沒有多檔影響範圍，就不要開 workflow。

## 授權要求

Claude Code Dynamic Workflows 是 **opt-in** 能力，大規模 fan-out 絕不自動發起：

- 任何 L/XL 級別的多 subagent fan-out，主控代理必須在啟動前取得使用者明確授權。
- 「任務龐大需要協助」不等於「已授權 fan-out」；授權必須明確，不得推定。
- 取得授權前，主控代理可先產生任務分解計畫（含範圍、停止條件、預算上限、回滾方式）供使用者確認，而非直接啟動 workflow。
- S/M 級別（單一主控或單一 reviewer）無需額外授權確認，但仍須符合最低級別原則。

## 環境需求與相容性

本 skill 是工作流**規範** + 一支**可執行 reference 編排器**（`scripts/ultrawork.mjs`，見下節）。規範不會讓任何 app 自動獲得能力；要實際運轉，主控環境必須滿足以下前置條件；缺哪一項就按「能力降級矩陣」降級，而不是假裝具備。編排器補上了「無 Claude Code 內建 Workflow tool 的主控（如 Codex CLI）也能真的 fan-out subagents」這一段。

### 前置條件

1. **主控代理／執行宿主能執行工具**：可操作檔案、shell、git、測試；side effect 必須由當前授權的 `executor_host` 執行並留 trace。
2. **可達 Claude Code Dynamic Workflows**：主控能透過 CLI / IDE / bridge / gateway / 人工授權其中一條路徑，請 Claude Code 執行原生 Dynamic Workflows。沒有這條，仍能做多模型主控編排，但拿不到原生 DW 的大規模並行 fan-out。
3. **（選用）跨品牌模型管道**：要用非 Claude 的 economy subagent，主控需具備單一 gateway / provider，或各品牌 CLI 可被主控呼叫。外部模型可產生 patch/tool intent；side effect 仍由授權的 `executor_host` 執行。
4. **各模型自有授權**：每個品牌的 auth 由它自己的 runtime 管理；不得讀取或重放他人的 token / session。
5. **fail-closed 證據鏈與額度硬上限可設定**：能驗證工具 trace、能在啟動前宣告 budget 上限。
6. **API 花費守門**：多模型協作預設不得使用會按量計費的 API fan-out。若發現 workflow 正在用未白名單 API，主控代理必須停用該 API route / adapter / key path，保存 checkpoint，改走訂閱 CLI、本地模型或白名單模型，並向人類說明原因。
7. **ChatGPT Pro Deep Research 研究分流**：若人類有 ChatGPT Pro / Deep Research，可把長篇外部研究分流到產品內訂閱額度；Codex 只負責產生 prompt、接收報告、驗證來源、結構化為 artifact。這不是 API fan-out，也不是 live executor。

### 能力降級矩陣（誠實標示）

| 主控環境具備 | 實際能跑到的程度 |
|---|---|
| 主控 + 可達 DW + 跨品牌管道 | 全功能：跨品牌 economy subagents 並行 + Claude 原生 DW fan-out + heavy 收斂 |
| 主控 + 可達 DW（無跨品牌管道） | 單品牌（Claude）原生 DW fan-out + 收斂；跨品牌部分不可用 |
| 主控 + 跨品牌管道（無法達 DW） | 多模型主控編排，用主控自身並行；無原生 DW 大規模 fan-out |
| 只有單一模型主控 | 退化為一般單模型工作，不應啟動本 skill |

### 不保證

- 本 skill 不保證在「任意 AI app」開箱即用；它規範行為與邊界，不替任何 app 實作橋接。
- 「其他 AI 可調用 Claude Code 原生 Dynamic Workflows」成立的條件，是該 app 已滿足上述前置條件（尤其第 2、3 點）；否則只能用到矩陣中較低的一列。
- 跨品牌 subagent 是在主控 / gateway 層達成，不是在 Claude 原生引擎內（見「Claude Code Dynamic Workflows 技術規範」）。

## V4 authorship / authority contract

open-ultrawork V4 不再把「哪個模型寫的」和「哪個宿主執行工具」混在一起。所有 subagent、review、report、journal、cost ledger 與 handoff artifact 都要能回答：

- `author_model`：實際思考、產生 patch proposal、tool intent、findings 或 reviewer judgment 的模型。
- `decision_model`：該 artifact 的決策來源；預設等於 `author_model`。
- `executor_host`：實際執行 shell / apply_patch / MCP / browser / computer-use 的宿主，例如 `codex-app`、`codex-cli`、`openclaw`、`claude-code-sandbox`。
- `authority_mode`：`brain_only`、`patch_proposal`、`tool_intent_bridge`、`sandbox_executor`、`native_peer_executor`。
- `patch_proposal`：是否允許輸出 unified diff / patch intent；允許不等於已套用。

白話：切到 Opus/Grok/Minimax/Fable 時，方案與 patch intent 應標 `author_model=<該模型>`；Codex App 可以是 `executor_host=codex-app`，負責套用、跑測試與驗證，但不得把作者改標成 GPT。權限綁的是 execution channel / authority mode，不是品牌。

### 環境能力矩陣

| 場景 | 目前能力 | V4 目標 |
|---|---|---|
| Codex App | 同 thread、request-scoped tool bridge、Codex tools | 外部模型可主導 patch/tool intent，Codex App 執行並保留 `author_model` |
| Terminal | `ultrawork.mjs` fan-out；多數 backend 是 text/schema subagent | 加 authority ledger、command receipts、sandbox worktree / patch proposal 契約 |
| OpenClaw | 取決於 OpenClaw executor/tool loop | 接入同一套 task packet / artifact / authority mode；OpenClaw 可當 `executor_host` |

### Subagent capability levels

1. **Scout brain**：Minimax/Grok/Haiku 做摘要、反例、候選方案、窄範圍 refutation。
2. **Patch proposal**：外部模型輸出 schema 化 findings / refutations / bounded unified diff，由宿主套用。
3. **Sandbox executor**：隔離 worktree 內允許 read/search/shell/test，輸出 patch + receipts；不得碰 denied paths。
4. **Claude Code DW lane**：Claude Code 原生 Dynamic Workflows 做大型 fan-out；多模型負責 cheap scouting、cross-check、final adversarial review。

每個 subagent task packet 至少包含：`objective`、`allowed_roots/files`、`denied_paths`、`allowed_commands`、`write_policy`、`max_runtime`、`budget`、`expected_artifact_schema`、`stop_condition`。

重要澄清：`claude -p`、JSON、無 session、工具全關 = `claude_print_json_tools_off`，只是 **Claude brain subagent**；不是完整 Claude Code Dynamic Workflows。真正 DW 需另走 `claude-code-sandbox` / Claude Code 原生 workflow lane；V4 目前把 `claude-code-sandbox` 標為 profile descriptor / authority contract，尚不是可直接 spawn 的 `BACKENDS` adapter，完整執行器需逐步落地。

## 私有部署接線（公開安全版）

> 本節只描述可公開的接線原則；具體機器路徑、帳號、tunnel、host name、token、thread id 與 raw logs 不得寫入 skill 或提交到 GitHub。

- **主控**：Codex App / Codex CLI / Claude Code / 自建 agent runtime 皆可，但只有主控代理能執行 side effects。
- **ChatGPT lanes**：日常協作優先走 Codex App / `model_gateway` 的 `chatgpt-pro-consult` 同 thread **GPT-5.5 fast consult**；它可做 planning / critique / bounded review，但不等同 ChatGPT App Deep Research。真正 Pro Research 走 `ProResearchJobV1`：Codex 產生 job，使用者在 ChatGPT Pro Deep Research 手動跑，Codex 匯入來源與 claim ledger 後驗證。
- **起手式**：日常小修、明確 bugfix、跑測試與落地執行，預設留在 Codex executor 模型；架構規劃、研究級審查、多模型分工、高風險決策或 claim/evidence 協作，起手切 `ChatGPT Pro Consult`；定案後再回 Codex executor 落地。不要把 Pro 當 bulk subagent，也不要把 executor 任務長期鎖在 Pro。
- **跨品牌管道**：優先使用單一 gateway provider，同 thread 只切 `model`；詳見 `codex-app-model-gateway` skill。
- **模型路由**：以 lane 角色（economy / copilot / heavy / judge / premium）描述，不把私人模型帳號、host、CLI 安裝路徑或 machine-specific alias 寫入公開文件。
- **驗收**：以 repo-local selftest、gateway health、same-thread smoke、MCP collab tools allowlist、redaction scan 作為可重現證據。


## ChatGPT Pro / Codex MCP RPO lane

`RPO` 在本 skill 中指 **Research / Plan / Operate**：`chatgpt-pro-consult` 負責同 thread 快速規劃／批評，真正 ChatGPT Pro Deep Research 走非同步研究 job；Codex / OpenClaw / sandbox 宿主負責可驗證執行。若工作從 Codex 開始，主線是 **Codex → `chatgpt-pro-consult`**；若工作從 ChatGPT 開始，才使用 **ChatGPT Pro → Codex MCP Hub** 前門。不要把 ChatGPT Web 假裝成背景 MCP server。

### 兩面打通

1. **Codex → ChatGPT Pro Consult（Codex 主控，日常主線）**
   - `model_gateway` catalog 必須暴露 `chatgpt-pro-consult`，display name `ChatGPT Pro Consult`。
   - 此 route 只把 request body 的 `model` 改寫成上游 `gpt-5.5`，其餘 Codex session headers、thread/tool context、MCP tool results 原封 passthrough。
   - `copilot` / `T1-copilot` tier 預設使用 `codex:chatgpt-pro-consult`；它是 GPT-5.5 Codex fast consult / Pro-account fast consult，`pro_research_equivalence=false`。
   - 健檢以 `chatgpt-pro-consult -> Claude/Grok/MiniMax -> chatgpt-pro-consult` same-thread smoke 驗證上下文不斷層。
2. **ChatGPT Pro → Codex MCP Hub（Pro 前門）**
   - ChatGPT 連到使用者自己的 Codex MCP Hub connector 後，先呼叫 `collab_guide`。
   - 若 Pro 表面只有 read/fetch 工具，呼叫 `codex_handoff_draft` 產生不改 DB 的 handoff packet。
   - 若 full MCP tools 可用，呼叫 `codex_handoff_create` 產生精簡 handoff；public connector 只能使用 safe / dry-run lane，真正 `codex` 執行必須在 localhost 端由 Codex 確認後啟動。
   - 後續任一方都用 `collab_pack_get(plan_id)` 恢復共享狀態，避免重貼全文與資訊斷層。
3. **ChatGPT Pro / Deep Research 手動研究分流**
   - 需要長篇外部研究時，Codex 產生 `ProResearchJobV1` / bounded prompt，使用者在 ChatGPT Pro / Deep Research 手動執行，再把含來源的 report 匯回；Codex 只採納經 primary-source cross-check 的 claims。

### Pro Academic Collaboration lane

這條 lane 的價值不是省 token，而是把 ChatGPT Pro 當成「研究級共同作者 / 反方審稿人」：

- 每個重要結論都拆成 `claim -> evidence -> status -> rebuttal -> next_test`，沒有 evidence 的內容只能是 hypothesis。
- Codex 先用 `academicContinuityPacket()` 建立 public-safe packet：問題、限制、決策、claims、open questions、驗證命令、驗證 receipts、artifact refs、content hash。
- `proAcademicPrompt()` 把 packet 轉成 Pro reviewer prompt，要求 Pro 做來源/證據核查、反駁、替代假說與 deterministic Codex next tests。
- `proAcademicReview()` 可直接走 `chatgpt-pro-consult` 執行一次 schema 化 Pro 審稿；若沒有 `tool_intent_bridge` / `sandbox_executor`，它只能輸出研究與 patch intent，不能聲稱已寫檔或跑 shell。
- `academicPromotionGate()` 是硬門檻：有 unsupported claims 或 P0/P1 rebuttals 時不得把結論升級為已驗證，除非人類明確允許 hypothesis-only 輸出。
- `academicReviewArtifact()` 把 Pro 回覆、packet hash、review hash、promotion gate 結果保存成可重現 artifact；沒有 artifact 的 live smoke 不算強證據。
- Pro 的輸出只會提升候選結論的可信度；真正 promotion 仍要 Codex 用 primary source、repo diff、測試、runtime artifact 驗證。

適用：架構決策、論文/官方文件研究、資安威脅模型、交易研究、複雜 debug、公開文件需要高可信度時。
不適用：即時 hot path、無來源的市場傳聞、需要直接操作帳戶/部署/下單的工作。

### 不資訊斷層契約

每次跨 Pro / Codex handoff 都必須保留一個短而完整的 continuity packet：`plan_id`、問題陳述、已知限制、repo/path refs、來源連結、決策紀錄、open questions、下一個 Codex action、Done condition、驗證命令、artifact refs、content hash。若沒有 `plan_id`，至少要有可人工貼回的 handoff packet；若沒有工具 trace，外部模型不得聲稱已執行。

硬邊界：不把 secrets、私有帳務、完整 logs、私人 thread id、原始 prompt dump、token 或本機絕對路徑放進 ChatGPT Pro / MCP public connector；ChatGPT Pro 預設只做研究、規劃、patch intent 或 handoff。任何寫檔、shell、部署、下單或風險參數修改都必須由本地授權的 `executor_host` 執行並留下 trace。

## 可執行編排器：`scripts/ultrawork.mjs`

ultrawork 的「引擎」本質就是一支 Node 編排腳本——spawn 模型 CLI 子進程當 subagent，每個子進程是**全新獨立 context**，用並發池平行跑、收集結果。Claude Code 把這包成內建 `Workflow` tool；沒有該 tool 的主控（Codex CLI、人工）則用這支 reference 腳本拿到同等能力。這就是「教其他 AI 使用此能力」的真正落地物，不是只描述計畫。

關鍵認知：**主控不能 fan-out ≠ 做不到**，而是缺一支編排腳本。補上腳本，Codex CLI 用 `node` 執行即可真的並行 subagents；腳本負責分派與紀錄，side effects 仍由當前授權的 `executor_host` 執行並由主控驗證。

**為何能贏過官方單廠牌 Workflow**：官方全 Claude，每個 subagent 都燒 premium quota；本編排器**成本分層**——bulk fan-out 走近免費的 MiniMax M3 / gpt-5.4-mini，premium Opus/ChatGPT Pro Consult 只留給收斂與裁決，且對抗驗證用**不同廠牌**模型（去相關盲點）。實測同樣 fan-out 成本約 1/100。

```js
import { agent, parallel, pipeline, verify, log, costReport, setBudget } from "./ultrawork.mjs";
setBudget(1.0); // 美元硬上限，超過 agent() 拋錯
const drafts = await parallel(files.map(f => () => agent(`review ${f}`, { tier: "economy" }))); // MiniMax 大量召回
const merged = await agent("merge:\n" + drafts.join("\n---\n"), { tier: "heavy" });             // Opus 1M 收斂
const v = await verify("the merge is correct", { tiers: ["fast","economy","standard"] });        // 跨廠牌裁決
log(costReport());
```

執行：`node my-workflow.mjs`（Codex CLI 直接以 shell 跑）。Hooks：`agent(prompt,{tier|backend,model,schema,retries,label})`、`parallel`、`pipeline`、`verify(claim,{tiers,threshold})`、`setBudget(usd)`、`costReport()`、`log`。Pro academic hooks：`academicContinuityPacket(input)`、`proAcademicPrompt(packet)`、`academicCollaborationPlan(opts)`、`proAcademicReview(input,{tier:"chatgpt-pro-consult"})`、`academicPromotionGate(review)`、`academicReviewArtifact({packet,review,promotion})`。

**Tier（建議入口，意圖 → backend:model，可用 `UW_TIER_<NAME>` env 覆寫；premium aliases 也支援 `UW_TIER_T0_PREMIUM`）**：
- `premium` / `T0-premium` → gateway `fable-5`（最貴 mission-critical synthesis，需要授權）
- `consultant` / `chatgpt-pro-consult` / `copilot` / `T1-copilot` → codex `chatgpt-pro-consult`（Codex-native ChatGPT Pro critique/assistant，同 thread passthrough）
- `T2-judge` → gateway `opus-4-8`（保守裁決）
- `T3-scout` → gateway `minimax-m3`（窄任務探索）
- `economy` → gateway `minimax-m3`（近免費，bulk fan-out / 草稿 / 抽取）
- `fast` → codex `gpt-5.4-mini`（本機 economy、read-only sandbox）
- `standard` → gateway `grok-build`
- `heavy` → claude `claude-opus-4-8[1m]`（`claude -p` brain subagent，工具全關；最強推理、1M context、收斂，但不是原生 DW sandbox）
- `judge` → gateway `opus-4-8`（premium 裁決）

後端（皆獨立 context；依環境可用性降級）：`claude`（claude -p，JSON、無 session、工具全關）、`codex`（codex exec、`-c mcp_servers={}`、`-o` 乾淨輸出、預設只在 `~/.codex-sub` 已明確設定 `model_provider = "model_gateway"` 時使用 sub-home，否則回落 `CODEX_HOME=$HOME/.codex`；可用 `UW_CODEX_HOME` 覆寫）、`gateway`（POST `/v1/responses` stream:false 取 `output_text`）。

特性：成本帳 + budget 硬上限；`UW_RESUME=1`+`UW_JOURNAL` 斷點續跑（依 backend|model|prompt hash 快取）；`retries` + claude model 404 自動退回 bare family alias。

### `scripts/ultrawork.mjs` 編排器細節

除了 `agent/parallel/pipeline/verify`，reference script 也提供 profile 與 companion routing helper，讓工作流不要每次重寫分組邏輯：

```js
import {
  profileForTask,
  companionSkillsFor,
  shouldUseUltrawork,
  budgetPlan,
  deepResearchPlanForTask,
  academicContinuityPacket,
  proAcademicPrompt,
  academicCollaborationPlan,
  proAcademicReview,
  academicPromotionGate,
  academicReviewArtifact,
  backendCapabilityProfile,
  authorityProfileFor,
  authorizeExecution,
  subagentTaskPacket,
  validateSubagentTaskPacket,
  proResearchJob,
  importProResearchReport,
  proResearchPromotionGate,
} from "./scripts/ultrawork.mjs";

const decision = shouldUseUltrawork({ task, fileCount, risk, needsParallelism });
if (!decision.use) {
  console.log(decision.reminder); // 提醒人類不必開 ultrawork
}

const profile = profileForTask(task); // ui / review / env / security / trading / migration / memory
const companions = companionSkillsFor({ task, hasDiff, wantsProjectMap, skillAuthoring });
const budget = budgetPlan(profile.id, { minimaxPlanConfirmed: true, maxRounds: 2 });
const dr = deepResearchPlanForTask(task); // ChatGPT Pro Deep Research prompt/import plan when useful
const packet = academicContinuityPacket({ task, claims, verificationCommands, verificationReceipts, artifactRefs });
const proPrompt = proAcademicPrompt(packet); // claim/evidence/rebuttal prompt for ChatGPT Pro Consult
const academic = academicCollaborationPlan({ task, packet });
const authority = authorityProfileFor({ backend: "gateway", model: "opus-4-8", surface: "codex-app" });
const packetForSub = subagentTaskPacket({ objective: "review diff", authorModel: "opus-4-8", executorHost: "codex-app" });
// Optional live call when worth the premium lane:
// const review = await proAcademicReview(packet);
// const promotion = academicPromotionGate(review);
// const artifact = academicReviewArtifact({ packet, review, promotion });
```

Script helper 原則：

- profile 只建議分工，不自動授權 L/XL fan-out。
- `companionSkillsFor()` 只回路由建議；主控仍需按 GitNexus / Codex Security / Superpowers 各自規則載入與執行。
- `budgetPlan()` 把 Minimax token-plan 與未確認 API route 分開；plan confirmed 才能把 economy lane 當 bulk。
- `budgetPlan()` 會把 `chatgpt_pro_deep_research` 標成 subscription lane / `apiFanoutExcludes`；它不消耗 API fan-out 預算，但仍要受人類產品內額度與任務停止條件約束。
- `deepResearchPlanForTask()` 只生成研究任務包與匯入契約：`original_prompt`、`research_ran_at`、`source_links`、`limitations`、`claims`、`artifact_mapping`、`content_hash`。Codex 必須先做 primary-source cross-check，再把結論轉成 runtime/router artifact。
- `academicContinuityPacket()` / `proAcademicPrompt()` / `proAcademicReview()` 是 Pro 級學術協作入口：所有重要結論先變成 claim/evidence ledger，再讓 ChatGPT Pro 做反駁、替代假說與 next-test 建議。`academicPromotionGate()` 負責阻止 unsupported claim 或 P0/P1 rebuttal 被靜默升級；`academicReviewArtifact()` 讓 live Pro 審稿可重現、可 hash、可存證。
- `backendCapabilityProfile()` / `authorityProfileFor()` / `authorizeExecution()` 是模型主導權與宿主權限的核心 helper；ledger、transcript、report 都要帶 `author_model`、`executor_host`、`authority_mode`。
- `subagentTaskPacket()` / `validateSubagentTaskPacket()` 生成 V4 subagent 任務包；任何 sandbox / patch proposal / scout 都要有 allowed roots、denied paths、allowed commands、write policy、budget 與 stop condition。`claude-code-sandbox` 在 V4 只會通過 descriptor contract 並回 warning，不能被當成目前可 `agent()` spawn 的 backend。
- `proResearchJob()` / `importProResearchReport()` / `proResearchPromotionGate()` 是真正 ChatGPT Pro Deep Research lane；它是 async job/import，不是同步 `/v1/responses` dropdown model。匯入時必須有 `research_ran_at`、`source_links`，且所有待 promotion claims 都有 claim-level evidence；否則 gate 會 fail-closed，unsupported claims 只能當 hypothesis。
- 大量 subagents 一律 schema 化、短輸出、可去重；不要讓自由長文淹沒主控上下文。
- `trading` profile 會搭配 `trading-training`：優先把外部深度研究交給 ChatGPT Pro Deep Research，GPT/Codex 主控 gate 與落地，MiniMax M3 扛策略候選與結果整理，Sonnet/Grok 做反方與快速副審，Opus 4.8 只審 top candidates / router / liquidation；所有 live_blocked、資金、訂單、槓桿或 stop-loss 變更仍必須走 Claude `trade-review`，且外部模型不得直接執行交易工具。

### ChatGPT Pro Deep Research lane

使用者若在 ChatGPT Pro 介面啟用 Deep Research，主控代理可把它當成「訂閱型研究副腦」：

1. Codex 先寫一份有邊界的研究 prompt：問題、禁止事項、必須引用 primary sources、輸出欄位、日期。
2. 人類在 ChatGPT Pro 手動跑 Deep Research，匯回 Markdown / PDF / source links。
3. Codex 對來源做 cross-check，標記 unsupported / stale / hallucinated claims。
4. 只有通過驗證的 claims 才能進入 artifact，例如 `AiMarketSnapshotV1`、`AiRouterDecisionV1`、套利 cashflow spec 或 strategy research note。

硬邊界：

- Deep Research 不進 hot path，不可用於實時下單、撤單、槓桿、停損、倉位大小或 API key 操作。
- 不把 secrets、交易所 key、白名單、私有帳務明細丟給 ChatGPT UI。
- 不自動操作或濫用 ChatGPT UI；這是一個人類手動啟動的產品內研究 lane。
- 沒有來源、來源不可驗證、或與 live runtime 不一致的結論，只能列為假設，不能進 router。

快速自測：

```bash
node scripts/ultrawork.selftest.mjs
```

雷（實測）：claude `--model` 要**真實 id**——`haiku`/`claude-haiku-4-5`/`claude-opus-4-8[1m]` 可用，但 **`claude-haiku-4-6` 不存在會 404**（已加 family fallback 補救）。驗收：`UW_JOURNAL=/tmp/uw.jsonl node scripts/example-flow.mjs`。


### ULTRAWORK-M environment-check pattern

一次中型環境健檢可抽象成這個可複用的 M 級 profile：

```text
ULTRAWORK-M: gpt5.5-primary / opus4.8-review / minimax-m3-sub / host-verified-execution
```

實測結論：

- **ChatGPT Pro Consult / GPT-5.5 primary**：`chatgpt-pro-consult` 是 Codex App 內的顧問 route，最終仍透過上游 `gpt-5.5` subscription passthrough；適合作為 Codex-native planner / critique / 最終決策入口。raw localhost GPT passthrough 會因缺 active Codex ChatGPT Authorization headers 而 401，這是正確 fail-closed，不是模型壞。要驗 GPT 路徑，用 Codex-native `codex exec --model chatgpt-pro-consult`、`codex exec --model gpt-5.5` 或 Codex App 內建路徑。
- **Opus 4.8 reviewer**：適合作為重型驗算、風險副審、架構裁決；一輪 reviewer 比多輪主控重讀整個上下文更省。
- **MiniMax M3 sub/economy**：若人類已確認屬 `minimax-near-unlimited-api` 或同級 token plan，適合大量 fan-out、草稿、抽取、候選方案、UI 風格探索、反例搜尋。它仍需任務級 budget cap 與停止條件，但 cap 可用「任務/輪次/輸出量」而不是過度保守的單次 $0.30。
- **Host-verified execution**：不論 subagent 來自哪個模型，寫檔、shell、測試、部署、回滾都要經授權 `executor_host` 執行並留下 evidence；外部模型可主導方案與 patch/tool intent，但不能無 trace 宣稱 side effect 已完成。

經驗教訓：

1. **raw gateway probe ≠ Codex-native probe**：GPT subscription passthrough 需要 active session headers，不能用無授權 curl 失敗就判斷 GPT 不可用。
2. **Minimax token plan 可放大探索，不等於無邊界**：可盡量派出 MiniMax subagents 扛量，但必須先定義 `N`、每個輸出 schema、輪次上限、去重/停止條件與 promotion 門檻。
3. **報告要記錄 cap**：任何 smoke / fan-out / top-N / no-retry / 截斷都要明寫，否則後人會誤以為已完整覆蓋。
4. **profile 是分層，不是硬改 runtime**：例如某些 host runtime 內部可維持自己的模型 dashboard；ChatGPT Pro Consult / GPT-5.5 是外層 Codex 顧問主控 lane，不應為了名稱一致去改 live gateway model。
5. **成本優化來自角色拆分**：cheap/subscription plan 負責寬探索，premium heavy 只負責少量收斂/驗算，主控只做 grounded execution。

### 2026-06-10 gateway 健檢蒸餾（copilot 斷頭 + 等級模板）

- **copilot lane 單點故障已修**：codex OAuth session 壞掉（401 / token invalidated）時，整個 GPT 副手 lane 會直接報廢工作流。`ultrawork.mjs` 現在對 codex backend 的 auth 類錯誤自動降級到 `gateway:grok-build`（跨品牌 fallback，log 標 `→fb:`）；`UW_AUTH_FALLBACK_MODEL` 可覆寫，設 `off` 停用。
- **第二個 CODEX_HOME 會養出孤兒 auth.json**：subagent 專用 home（如 `~/.codex-sub`）若留著舊 auth.json 副本，token 輪換後就永遠 401，且舊副本搶刷可能再度弄壞主 session。對策：子 home 的 auth.json 一律 symlink 指向主 Codex auth file；`codex-app-model-gateway` 的 `post-update-check.sh` 已加單一真相源檢查。
- **等級模板落地**：`scripts/flow-levels.mjs` 提供 S/M/L/XL 預設（budget 硬上限、fan-out 上限、loop-until-dry、L 級以上 adversarial verify、XL 需 `UW_XL_AUTHORIZED=1`），fan-out 一律 schema 短輸出。實測 M 級：8 economy scouts 兩輪 → heavy 收斂一次，總成本 ~$0.03。
- **economy 片段審碼會高信度誤報**：MiniMax 對片段給出的 P0（如「context 200K 過度宣告」）可能正是 spec 刻意行為；fan-out findings 必須由主控對全檔/spec 逐條驗證後才可進報告。

### 新電腦安裝時的迭代規則

- 新機器第一次安裝或接線時，**先驗證非 API 路徑**：ChatGPT subscription passthrough、Claude CLI、Grok CLI、本地模型 runtime。
- 若新機器上的某個模型接法只能透過按量 API 才能工作，預設**不要開**；先停用該 API route，避免 fan-out 直接爛燒額度。
- 只有 API 白名單模型可在新機器上進一步評估：`local-openai-compatible`、`minimax-near-unlimited-api`、或人類本次明確批准的 `user-approved-api:<provider>/<model>`。
- 新機安裝若踩到新的 failure mode（PATH、OAuth、CLI 版本、provider sync、sidebar、額度、API 誤用等），要把它抽象成「症狀 → 成因 → 修法」回寫到 `codex-app-model-gateway` 與本 skill，而不是只留在聊天紀錄裡。


### Companion skills / plugins 自主調度

當本 skill 已經啟動，主控代理不應只在本 skill 內硬撐；要依任務性質主動搭配其他能力，但仍遵守各 skill 的觸發邊界：

- **GitNexus**：若任務涉及專案地圖、入口、資料流、影響範圍、架構遷移、OpenClaw/gateway 拓樸，視為「clear project-map need」，先用 `gitnexus:gitnexus` 查結構，再繼續正常工程。不要把 GitNexus 變成每次 grep / file read 的強制 hook。
- **Codex Security**：若任務涉及 PR/diff/security review、auth、secret、permission、sandbox、RCE、SSRF、資料外洩、交易/資金安全，轉入對應 `codex-security:*` 流程；diff/patch 以 `security-diff-scan` 為優先。
- **Superpowers**：若任務是寫 skill、改 skill、撰寫計畫、TDD、debug、驗證完成，使用相應 `superpowers:*` skill；例如 skill 變更用 `superpowers:writing-skills`，功能/bugfix 用 `superpowers:test-driven-development`，完成前用 `superpowers:verification-before-completion`。

這些 companion 不是外部模型的工具授權；它們是主控 Codex 的流程路由。外部模型只能提出意圖或 critique，不能繞過主控直接操作。

### 越用越迭代

每次 ultrawork 後都要問：這次有沒有新的 failure mode、probe 路徑、模型分工、預算上限、停止條件、或 reusable script？若有，將其蒸餾為「症狀 → 成因 → 修法 → 驗證 → 下次 routing」，回寫到本 skill、相關專案 runbook，或 memory extension；不要只留在聊天。

## 角色邊界

### 主控代理

主控代理通常是目前對話中的 Codex，也可以是 Claude 或其他 AI。主控代理必須：

- 保留最終決策權與責任。
- 管理檔案、shell、Git、測試、部署、回滾。
- 不把工具全域交給外部模型。
- 對所有模型輸出做 grounding：有證據才算完成。
- 對高風險變更先備份、再小步落地、最後驗證。

### Claude Code Dynamic Workflows

Claude Code 適合：

- 針對大型任務動態產生 orchestration plan。
- 啟動多個 subagents 做獨立探索、審稿、漏洞搜尋、方案比較。
- 對複雜架構做批判、重擬、風險清單。
- 對 skill、設計文件、migration plan 做官方語義與流程審查。

Claude 的輸出是高價值證據，不是自動真相。主控代理仍需落地、測試、裁決。

### 其他模型

Grok、Minimax、Haiku、Sonnet、GPT 等可作為：

- 查詢、摘要、草稿、分類、量化、資料清洗。
- 並行探索與對抗驗證。
- smoke test、lint triage、假設反駁。
- 低風險代勞。

其他模型不能被假設原生擁有 Claude Dynamic Workflows；需要時由主控代理透過 Claude Code、bridge、gateway 或人工授權請 Claude 執行。

**執行機制澄清（重要）：** 上列能力（並行探索、對抗驗證、smoke test 等）有兩條執行路徑，不可混淆。Claude 自有 subagents 由 Dynamic Workflows 啟動，在沙盒內直接執行 read / search / shell 並回傳實際工具證據；外部模型（Grok、GPT、Minimax 等）只能透過 bridge 發出工具意圖，由主控代理執行並產生 audit trace，否則視為未完成。外部模型參與並行探索的正確姿態，是主控代理請 Claude 啟動 subagents，或由主控代理代執行其工具意圖，而非外部模型自行進入沙盒。詳見「Claude Code Dynamic Workflows 技術規範」。

## 模型分層

模型分層要跟隨時代演進，以下只是當前範式，不是永久名單。lane 是「角色」不是「品牌」：由主控在 gateway 層用合適品牌填補（跨品牌平行 subagents），或由 Claude 原生 workflow 以 Claude subagents 填補。指派模型時預設省略、繼承主控當前模型；只在明確跨層（economy↔heavy）且強烈有把握時才指定具體模型，過度釘死模型版本是反模式。

**同品牌內也要分層**：同一品牌通常有輕重檔位，subagent 與決策不該用同一檔。探索／量化／代勞／對抗驗證的 subagent 一律走該品牌的**輕量／低成本檔位**（如 `*-mini`、低 reasoning effort）；只有收斂、裁決、修正重擬才升到該品牌**頂級檔位**。若某品牌的 subagent 調用本身有固定額外開銷（例如要經一層 agent runtime / CLI 包裝才能呼叫），更要把它留給「值得這個開銷」的任務，不要拿頂級檔位或高開銷通道做廉價批量工作。

### Economy lane：平價 / 高並發模型

例：當代輕量高速模型（Haiku、Sonnet、Minimax、Grok 等型號族，隨時代更替）。

適合：

- 搜尋、閱讀、摘要、資料抽取。
- 量化初篩、測試矩陣、滲透初掃。
- 多 subagents 並行探索。
- 對抗驗證：找反例、找破綻、找遺漏。
- 產生初稿、測試樣例、候選方案。

不適合：

- 高風險最終決策。
- 未驗證的 GUI / computer-use 長鏈操作。
- 自稱完成但沒有工具紀錄或測試證據的任務。

### Heavy lane：重型 / 收斂模型

例：當代重型推理模型（高 context window、多步驟推理、instruction-following 穩定者）。

適合：

- 架構收斂、策略裁決、修正重擬。
- 讀取多個子代理結果後整合為單一計畫。
- 高風險審稿、安全審查、交易風控副審。
- 判斷任務是否需要 Claude Dynamic Workflows。
- 決定是否停手、回滾、重構、升級驗證。

不適合：

- 大量低價值批量查詢。
- 可由 deterministic script 完成的重複工作。

### Opus 4.7 / Opus 4.8 校準（先觀測，不硬寫神話）

不要把 `opus-4-7` 與 `opus-4-8` 的差異寫成永久能力階級。每次要把它們納入 workflow 分工前，先問：這是**同題觀測**，還是只是不同任務帶來的印象？沒有同題證據時，只能寫成暫定 routing，不得寫成「4.7 一定適合 X、4.8 一定適合 Y」。

2026-06-01 本機小樣本同題探針（3 題：skill routing 審查、gateway 401 triage、衝突證據 promotion）得到的暫定差異：

| 觀測面 | Opus 4.7 | Opus 4.8 |
|---|---|---|
| 輸出姿態 | 較直接、工程化、容易給具體操作與 checklist | 較保守、審計式、較會壓住過度推論 |
| 結構遵循 | 較能遵守 compact JSON / enum 要求 | 偶爾包 code fence 或改 enum wording，需主控 normalize |
| 主要風險 | 可能補出 prompt 未提供的本機 path / service / 命令，形成「看似可執行但未驗證」的 overreach | 可能偏保守、較不主動產生 patch 級細節；格式不一定機器可直接吃 |
| 暫定適用 | 中型 diff、implementation plan、skill wording、需要 actionability 的 reviewer prompt | 高風險 fail-closed triage、架構/權限/成本/回滾、衝突證據的 final judge |

Routing 規則（暫定，需隨專案再校準）：

- **S/M diff 或文件/skill wording**：可先用 `opus-4-7` 當 focused reviewer，但主控必須驗證它提出的路徑、服務名、命令與專案事實；不能直接寫入 runbook / skill。
- **auth、gateway、security、trading、deployment、rollback、memory truth promotion**：優先 `opus-4-8` final judge；若 4.7 先看過，只把它當候選意見。
- **不要預設兩個都跑**：先選一個符合風險的 Opus；只有 reviewer 分歧、證據衝突、高風險未解，才用另一個交叉驗證。
- **不要為一次觀測改 runtime tier**：`scripts/ultrawork.mjs` 的 `heavy/judge` 維持保守預設；若某專案連續證明 4.7 在特定任務勝出，再用 `UW_TIER_*` 或專案 profile 覆寫，而非全域硬改。
- **promotion 門檻**：至少同一批任務雙跑 5–10 題，記錄 defect-catch、false positive、actionability、schema compliance、latency，才把「暫定」升成預設規則。

### Minimax token-plan / near-unlimited lane

當人類已明確確認 Minimax 或同類模型屬於「token plan / 近吃到飽 / 可承擔大量使用」池時，主控可以把它視為 **bulk exploration lane**，策略不同於一般按量 API：

適合盡量派出：

- 大量候選：UI 風格方向、文案版本、元件草圖、測試 case、edge case。
- 大量閱讀：repo 檔案摘要、日誌分類、錯誤聚類、文件索引。
- 大量反駁：找遺漏、找矛盾、找安全/權限/成本 failure mode。
- 大量低風險代勞：格式整理、表格化、初稿、候選命名、相似案例蒐集。

仍然必須限制：

- 不讓 Minimax 直接寫檔、執行 shell、操作 GUI、修改 runtime。
- 不讓 Minimax 做高風險最終決策（交易、資安、刪除、部署、權限、金流）。
- 不用自由長文輸出做大量 fan-out；大量派發時要 schema 化、短輸出、可去重。
- 不把「可大量用」誤寫成「無成本」：仍需任務 cap，例如 `max_agents`、`max_rounds`、`max_output_tokens_per_agent`、`stop_when_no_new_findings=2`。

建議預設：

| 場景 | Minimax 派發量 | Heavy 使用 | 停止條件 |
|---|---:|---:|---|
| 小型探索 | 3-5 | 0-1 reviewer | 找到可行方向或無新發現 1 輪 |
| UI/文案/風格摸索 | 8-24 | 1 次收斂 | top-N 候選收斂到 3 個方向 |
| repo 初掃/日誌分類 | 8-32 | 1 次風險審稿 | coverage 達到目標檔集或連續 2 輪無新類別 |
| 安全/交易/高風險預掃 | 12-48 | 1-3 個 heavy reviewers | 多數 verifier 無法再提出新 critical |

若 Minimax plan 狀態不明，退回一般 API 白名單規則，不得大量派發。

### 任務類型 → 模型協作分組

以下是本機 ultrawork 的建議分組。分組是起點，不是永久規則；每次仍要依任務風險、可驗證性與預算調整。

| 任務類型 | 主控 | Economy / subagents | Heavy / reviewer | 驗證重點 |
|---|---|---|---|---|
| 前端 UI 風格摸索 | ChatGPT Pro Consult 或 Codex 主控定義產品目標 | Minimax 大量產生 moodboard、版型、文案、元件變體；可加 Grok 查趨勢/反例 | Opus/GPT heavy 收斂成 2-3 個設計方向 | 截圖/原型、使用者偏好、品牌一致性、不要直接讓 subagent 改全站 |
| 前端實作 / component build | Codex/ChatGPT Pro Consult 落地 | Minimax 產生候選元件、測試樣例、可訪問性 checklist | Opus 或 GPT heavy review 架構/狀態流 | browser smoke、lint、視覺 diff、互動流程 |
| 代碼審查 / PR review | Codex 主控 diff 與測試 | Minimax 分檔掃描：bug/security/perf/docs/test gaps | Opus 4.8 做 final risk review / false positive pruning | git diff、test、可重現證據、不要只收集意見 |
| AI 環境鋪設 / gateway / OpenClaw | ChatGPT Pro Consult/Codex 主控；GitNexus 只在專案地圖需求時用 | Minimax 做 config inventory、log classification、runbook 草稿 | Opus 4.8 驗算拓樸、權限、成本、回滾 | health endpoints、LaunchAgent、process/port、secret redaction、rollback |
| 大型重構 / migration | Codex 主控小步 patch | Minimax 分模組盤點影響範圍、候選切分 | Claude DW / Opus 做 orchestration plan 與風險裁決 | 分批、checkpoint、測試矩陣、回滾點 |
| 安全審查 | Codex 主控 evidence | Minimax/Grok 多視角找入口、資料流、疑點 | Opus/GPT heavy 驗證 exploitability 與嚴重度 | primary-source code evidence、PoC 安全邊界、無秘密外洩 |
| 學術/研究級協作 | Codex 主控 packet 與驗證 | Minimax/Grok 做窄範圍 source/extraction/refutation | ChatGPT Pro Consult 做 claim/evidence/rebuttal/alternative hypothesis；Opus 只審 unresolved high-risk | primary sources、claim ledger、unsupported 降級為 hypothesis、deterministic next tests |
| 交易 / Hermes 風控 | Codex 主控 read-only 狀態 | Economy 只做資料整理、候選風險清單 | `trade-review` / Opus heavy 必須介入 | 不下單、不改 live risk、不碰 secrets；paper/backtest evidence |
| 記憶蒸餾 / skill 更新 | Codex 主控寫入 | Minimax 初步分類：症狀→成因→修法→驗證→routing | Opus/GPT heavy 檢查是否過度泛化或污染 truth | 不保存 raw logs/thread ids/secrets；低污染 promotion |


### Premium lane：`mission-critical-max`（最貴工作流）

`mission-critical-max` 是刻意設計的最高價 profile，只用於「錯一次代價高於 premium review 成本」的任務。它**永不自動啟動**，必須同時具備：字面 opt-in `ultrawork:max`、`mission_critical: true`、人類明確授權、硬預算上限、Done condition 與停止條件。

建議分工：`T0-premium` = `fable-5`/`fable5` 做候選架構與最終 synthesis；`T1-copilot` = `chatgpt-pro-consult` 做 Codex-native critique/修補；`T2-judge` = `opus-4-8` 做保守反駁裁決；`T3-scout` = 便宜模型做窄輸出探索；`executor_host` = Codex App / Codex CLI / OpenClaw / sandbox 中被授權的一方。流程為 scout → ChatGPT Pro Consult → Fable5 → Opus 4.8 judge gate → evidence 驗證 → executor_host 執行。routine coding、簡單 review、查詢、無 Done condition 或 latency-sensitive 任務不得使用。

### 模型性格速記

- **ChatGPT Pro Consult / GPT heavy**：主控、落地規劃、工具執行語義、跨步驟決策、claim/evidence/rebuttal 學術協作；適合當 `primary` 或 Pro reviewer，不適合做大量廉價枚舉。
- **Opus 4.7 / Claude focused reviewer（暫定）**：較直接、actionable、守結構；適合中型 diff / implementation / skill wording 的第一輪 reviewer。風險是會補未驗證的本機細節，主控必須逐條驗證。
- **Opus 4.8 / Claude heavy judge**：較保守、審計式、適合高風險 fail-closed 判斷、架構驗算、長上下文收斂與 final judge。風險是格式可能不如 4.7 乾淨，機器吃 JSON 前要 normalize。
- **MiniMax M3**：高吞吐、便宜/plan 扛量、風格/候選/摘要/分類/反例；適合大量 subagents，不適合最終高風險裁決。
- **Grok**：外部視角、趨勢/反例/尖銳批評、快速 sanity check；適合補盲點，不應成為唯一證據。
- **本地模型/Qwen/Ollama**：隱私、離線、低成本反覆跑；適合粗分類與私密初掃，但能力不足時要升級 reviewer。

### 成本節省估算方式

不要只說「省很多」，要用任務拆分估算：

```text
single-heavy-cost ≈ (探索 tokens + 收斂 tokens + 重讀浪費 tokens) × heavy 單價
ultrawork-cost ≈ economy 探索 tokens × economy/plan 單價 + heavy 收斂 tokens × heavy 單價 + smoke/驗證成本
savings ≈ 1 - ultrawork-cost / single-heavy-cost
```

在 Minimax token plan 已確認可大量使用時，economy 探索的邊際成本接近固定月費/plan 消耗；實務上常見節省區間：

- 小任務（S/M）：節省不一定明顯，甚至因 coordination 多花 10-30%；能單模型完成就不要開 workflow。
- 中型審查/環境健檢：通常省 50-80%，因為大量閱讀/分類交給 Minimax，heavy 只做一次驗算。
- 大型探索/安全/架構任務：可省 80-95%+；若原本會用全 Opus/全 GPT heavy 做 20-50 個 subagents，改成 Minimax fan-out + 1-3 次 heavy judge，接近 10x-100x 的 premium token 節省。

節省不是免費：多模型增加 orchestration overhead、smoke test、結果合併與 false positive pruning。只有當「探索量大、可並行、可驗證」時才明顯划算。

## Token / quota 預算

每次啟動 ultrawork 前先選級別。若使用者沒有指定，採用能完成任務的最低級別。

| 級別 | 使用時機 | 模型策略 | 預算原則 | 硬限制 |
|---|---|---|---|---|
| S | 單一小任務、低風險修補 | 1 個主控模型 | 不開 Claude Dynamic Workflows；只做必要驗證 | 0 subagents / 1 輪 |
| M | 中型工程、需要一次審稿 | 主控 + 1 個 reviewer | Economy 探索，Heavy 收斂；限制上下文與檔案範圍 | ≤4 subagents / ≤2 輪 |
| L | 多模組、多風險、需對抗驗證 | 主控 + 多個 economy subagents + 1 個 heavy reviewer | 每個 subagent 問題要窄；只回證據與建議 | ≤16 subagents / ≤2 輪 |
| XL | 大型未知任務、migration、安全/交易/架構高風險 | Claude Dynamic Workflows / ultracode + 主控落地 | 先要求 Claude 產生任務分解與停止條件；分階段驗證，不一次吃完整 repo | ≤48 subagents / ≤3 輪 |

預算規則：

- 先用 cheap model 探索，再用 heavy model 收斂。
- 先 grep / test / script，後問重型模型。
- subagent 任務必須窄、可驗證、輸出有限。
- 不要讓多個模型重複閱讀同一大段上下文；主控代理負責整理 shared brief。
- 任何 quota 接近限制時，停止擴散，保存 checkpoint，改走本地 deterministic 驗證。
- API 路線預設關閉：不要因為環境中有 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`XAI_API_KEY`、`MINIMAX_API_KEY` 或其他 key 就自動用 API 跑 subagents。這會把協作 fan-out 變成不可控燒額度。
- 上表「硬限制」必須在啟動前宣告，不是事後補救。超出時強制停止、記錄 checkpoint、通知使用者剩餘工作清單；不得靜默繼續或靠原生 1000-agent 背板兜底。需超出 XL 上限時，須使用者明確重新授權並升級為分批次任務。
- NO SILENT CAPS：凡覆蓋有上限（top-N、取樣、no-retry、截斷），必須明確記錄被丟棄／截斷的部分；靜默截斷會被誤讀為完整覆蓋。

### API 白名單與人類確認

只有以下 API 類型可被多模型協作使用；其他 API 一律停用，直到人類明確確認：

- `local-openai-compatible`：本機或私有 LAN 的 Ollama、LM Studio、vLLM、llama.cpp server 等，前提是沒有按量計費。
- `minimax-near-unlimited-api`：Minimax 或同類近乎吃到飽方案，前提是人類確認目前帳號/方案/模型屬於低風險額度池。
- `user-approved-api:<provider>/<model>`：人類針對本次任務明確批准的 provider/model，且同時給出用途、預算上限與停止條件。

啟用任何 API 前，主控代理必須向人類確認四件事：provider/model、endpoint 或 runtime、計費/額度型態、這次任務的最大可接受花費或用量。缺任一項就不使用 API。若執行中發現非白名單 API 被使用，立即停用該 route，不再派發新 subagents 到該 API。

### 各級 token 量級與可承擔原則

token 預算依級別分階，預設取「能完成任務的最低級別」；任何大小任務都用「事前硬上限 + economy 扛量、heavy 只收斂」確保承擔得起：

| 級別 | output token 量級（參考，可依任務調整） | 為何承擔得起 |
|---|---|---|
| S | 一回合對話量級（約 ≤ 2 萬） | 不開 workflow、單模型、無 fan-out |
| M | 約 2–8 萬 | 只 1 個 reviewer，輸出窄 |
| L | 約 8–30 萬 | economy subagents 平行但每個問題窄、只回證據；heavy 只收斂一次 |
| XL | 約 30 萬–100 萬，且必須分批 | 每批設 budget.total 硬上限，達上限即 throw；不一次吃完整 repo |

三條可承擔保證：

1. **事前硬上限**：每次啟動前宣告 budget.total 與 subagent／輪次上限，達到即停（budget 是會 throw 的硬上限，不是建議值）。
2. **最低級別預設**：使用者沒指定時取能完成任務的最低級別，不預設往大開。
3. **economy 扛量、heavy 收斂**：大量平行探索走平價模型，重型模型只做最後收斂，避免用貴模型做廉價批量工作。

## Claude Code Dynamic Workflows 技術規範

本節描述原生 Dynamic Workflows 的執行機制。主控代理（含非 Claude AI）在「請求／編排／審查」一個 workflow 時，以此判斷正確性與安全終止。

### 跨品牌模型作為 agents 的兩層架構

讓 Grok、GPT、Minimax、Claude 等跨品牌模型同時當 subagents 與主 agent，是在「主控／gateway 層」達成，不是在 Claude 原生引擎內：

- **主 agent（主控）**：可以是任何品牌模型；它持有最終決策與工具執行權。
- **跨品牌 subagents**：由主控用單一 gateway 並行分派——同一條 thread 內只切 model、不切 provider，每個外部模型只拿 request-scoped 工具、回傳意圖由主控執行。這一層才是「跨品牌平行 subagents」真正所在。
- **Claude 原生 Dynamic Workflows 的 subagents 是 Claude 模型**（agent() 只 fan-out Claude）。主控需要大規模 Claude 平行探索／審稿時，請 Claude 跑一個原生 workflow。

結論：跨品牌 fan-out ＝ 主控／gateway 能力；Claude 原生 fan-out ＝ Claude-only subagents。兩者由主控疊加組合，不可混為一談。

### 編排原語：預設 pipeline，不亂加 barrier

- pipeline 是預設編排：各項目可在不同階段流水推進，不必等全部項目跑完同一階段。預設選它。
- 只有當收斂步驟「需要前一階段全部結果齊備」才插入 barrier（全局等待）：跨項目去重／合併、early-exit、跨項目比較排序。
- 反模式：每個階段交界都加 barrier，等於退回串列，破壞並發。

### 子代理輸出契約

- subagent 的回傳值就是它的最終輸出文字；orchestrator 直接接收，別假設它寫共享狀態或側通道。
- 提供 JSON schema 時，subagent 被強制回傳符合 schema 的結構化資料，不符即 fail-hard，不靜默降級。先定 schema 再寫 prompt，不要事後 regex 剖析自由文字。
- 每個 subagent 必須窄、獨立、自包含；明確定義回傳欄位、型別、可空條件。

### 停止條件（STOP idioms）

未指定停止條件的動態迴圈會一路跑到 1000-agent 背板，屬設計錯誤。三選一：

1. loop-until-dry：每輪候選先入 seen 去重；連續 K 輪（建議 2~3）無新項即停。去重對象必須是 seen，不得對「已驗證集合」去重，否則永不收斂。
2. loop-until-count：通過品質門檻的結果累加，達目標數 N 即停。
3. loop-until-budget：迴圈條件 budget.remaining() > 門檻；啟動前必須確認 budget.total 為具體值（非 null），否則跑到背板才停。

### 驗證條件（VERIFY idioms，L/XL 至少採一種）

1. adversarial-refute-by-N：每個關鍵發現派 N 個獨立 verifier（建議奇數 N≥3），各提示「找理由反駁；無法確定就預設反駁成立」；多數反駁即作廢。
2. perspective-diverse：每個 verifier 分配不同視角（正確性／安全／可重現／效能），各自窄而獨立。
3. completeness-critic：最後追加一個 agent 只問「漏了什麼？哪些 failure mode／邊界／依賴未覆蓋？」，補進剩餘風險，不改既有結論。

（S/M 級別只需「reviewer 找漏洞」即可。）

### 硬性限制

- 並發上限：每個 workflow 同時最多 min(16, cores-2) 個 subagent，超出排隊（不丟棄、增延遲）。
- Lifetime 背板：單一 workflow 總 agent 數上限 1000，到頂後 agent() 拋例外。
- budget 是硬上限不是建議：spent() 達 total 後 agent() 直接拋錯。

這些限制與 budget 級別（S/M/L/XL）共同構成 fan-out 安全邊界：級別決定預算量級，並發上限與背板決定物理上限。

## 標準流程

### 1. 定義任務與停止條件

主控代理先寫清楚：

- 目標是什麼。
- 不做什麼。
- 風險邊界。
- 完成定義。
- 可接受的 token / quota 級別。
- 哪些工具、repo、資料可以碰，哪些不可碰。

### 2. 分派探索

使用 Economy lane 做獨立子任務，例如：

- A：找現有架構與入口。
- B：找測試與驗收方式。
- C：找安全/資料外洩風險。
- D：找替代方案與反例。

每個子任務只要求：結論、證據路徑、風險、下一步。不要要求長篇報告。

### 3. Claude Dynamic Workflow 審查

當任務達到 L/XL 級別，請 Claude Code 使用 Dynamic Workflows / ultracode 產生或審查：

- 任務拆解是否合理。
- 是否需要更多 subagents。
- 是否有被忽略的 failure mode。
- token 消耗是否超標。
- 主控代理是否過早收斂。
- 是否有更安全的落地順序。

### 4. Heavy lane 收斂

由 Heavy lane 整合各方結果，產出：

- 單一可執行方案。
- 明確風險與不做項。
- 最小可驗證 patch / action。
- 測試命令。
- 回滾方式。

### 5. 主控代理落地

主控代理執行檔案修改、shell、測試、Git、部署。外部模型不得直接宣稱已完成工具操作；必須有實際工具紀錄、diff、測試輸出或可重現證據。

### 6. 對抗驗證與收尾

至少做一個驗證面：

- 測試 / smoke / lint。
- git diff review。
- reviewer 模型找漏洞。
- 重新跑關鍵命令。
- 對高風險系統做 read-only 狀態確認。

完成回覆要包含：做了什麼、驗證證據、剩餘風險、下一步。

## 多模型 app / gateway 相容規範

當本 skill 用在任何多模型 app、agent runtime、gateway、IDE、CLI 或協作平台時，採用以下抽象原則：

- 使用單一穩定 provider / gateway；不要為每個模型建立一個 provider。
- 同 thread 只切換 model，不切換 provider，保留上下文閉環。
- 外部模型只能使用 request-scoped tools；不得全域持有主控 app 的 MCP、computer-use、shell、browser 或其他工具。
- 工具意圖必須轉為主控 app 可驗證的 function_call / tool call / audit trace；主控 app / sandbox / OpenClaw 等 `executor_host` 才能宣稱 side effect。
- 若模型聲稱 click、type、set_value、press_key、open app 等 GUI 動作，但沒有對應 function_call / tool trace，視為未完成或 hallucination。
- computer-use 要 fail-closed：沒有工具 schema 就不能讓模型假裝操作；有工具 schema 也要檢查 action evidence。
- 沒有可驗證證據時的強制動作（fail-closed 協定）：主控代理先拒絕讓該聲稱推進工作流狀態 → 要求模型重新執行並回傳工具 trace 或可重現輸出 → 仍無法提供則由主控代理自行執行並留記錄 → 再無則標記為已知缺口並升級人工確認，不得推斷為完成。沒有證據 = 沒有完成。
- GPT / Claude / Grok / Minimax 等 adapter 必須有 capability matrix、smoke tests、錯誤分類與降級策略。
- 不因環境存在 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`XAI_API_KEY`、`MINIMAX_API_KEY` 或相容 key 就自動開 API subagent fan-out；未白名單 API route 必須停用。
- 不提交 token、auth、logs、state database、完整 rollout、私人 thread id 或私密本機狀態。

## GitNexus / GBrain 使用

- GitNexus 是被動專案地圖工具；只有使用者明示 `/gitnexus`、`用 GitNexus`、`專案地圖`、`入口`、`影響範圍`，或本 skill 已判定任務有明確架構/入口/資料流/影響範圍需求（clear project-map need）時才使用。不要把 GitNexus 變成每次修改前、grep 前或 file read 前的強制步驟。
- GBrain / memory 只保存可復用工作經驗與決策邊界，不保存原始資料、token、私密 thread、完整 logs 或不可公開狀態。
- 大型 ultrawork 完成後，若使用者要求記憶化，才將「何時啟動、怎麼分派、哪個 failure mode、如何驗證」蒸餾成短經驗。



## 運行後優化清單

每次大型 ultrawork 後，主控代理應檢查以下項目，決定是否回寫 skill / memory：

1. **Probe 路徑是否正確**：例如 GPT passthrough 需要 Codex-native headers，raw curl 401 可能是 healthy fail-closed。把「正確 probe 方式」寫清楚。
2. **模型 profile 是否分層而非混淆 runtime**：不要為了 profile 名稱去硬改 live app 內部模型；外層主控、內層 subagent、reviewer 可以是不同層。
3. **Minimax 是否真的屬可大量使用 plan**：若是，放寬 economy fan-out；若不是，回到白名單 + 人類確認。
4. **成本帳是否有對照組**：至少估算「全 heavy 做到底」vs「Minimax fan-out + heavy 收斂」的差異。
5. **輸出是否 schema 化**：大量 subagents 必須短輸出、可合併、可去重，否則合併成本吃掉節省。
6. **是否有 reusable script**：smoke/probe/healthcheck 應變成 repo-local 小工具，而不是只留在聊天。
7. **是否保存了過多私密狀態**：skill 只保存抽象規則；具體 token、thread id、raw logs、完整 rollout 留在安全本地或不保存。

## 完成定義

一次 ultrawork 完成時，必須滿足：

- 分派有邊界，沒有讓模型無限制擴散。
- Economy lane 與 Heavy lane 的工作不同，沒有重複浪費 token。
- Claude Dynamic Workflow 的結果被主控代理審核過，而非原樣照抄。
- 所有工具操作都有 trace、diff、測試或可重現證據。
- Pro academic lane 的重要 claims 都有 evidence/status/rebuttal/next_test；unsupported claims 已降級為 hypothesis。
- 高風險資料與私密狀態未被提交或寫入共享 skill。
- 最終回覆能讓人類知道：已完成、未完成、剩餘風險、下一步。
