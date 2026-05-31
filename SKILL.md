---
name: open-ultrawork
description: Use when a task needs Claude Code Dynamic Workflows, ultracode-style orchestration, multi-model delegation, cross-model review, parallel subagents, adversarial validation, or a token-budgeted workflow for complex engineering, research, security, debugging, refactoring, migration, data, testing, documentation, or architecture tasks. Also use when two or more AI models (e.g. Claude, GPT, Grok, Minimax) must cooperate in one thread while the controlling agent remains responsible for grounded tool execution and final verification.
metadata:
  short-description: 多模型 Dynamic Workflows / ultrawork 調度規範
---

# open-ultrawork

本 skill 定義一套通用的多模型工作流：讓其他 AI 也可以透過主控代理、bridge、CLI、gateway 或人工授權，使用 Claude Code 原生 Dynamic Workflows / ultracode 能力。`open-ultrawork` 只是本工作流規範的名稱；官方能力應稱為 Claude Code Dynamic Workflows / ultracode。其他 AI 可調用或編排 Claude Code 的原生能力，但不要被描述成自身也原生擁有該能力。

核心原則：**主控代理負責落地與驗證；Claude Dynamic Workflows 負責大規模探索、並行分派與高品質審稿；外部模型只能在被授權的 request / bridge / thread 範圍內工作。**

## 何時使用

使用本 skill 當任務符合任一條件：

- 任務龐大、未知多、需要拆成多個平行子任務。
- 需要 Claude Code Dynamic Workflows / ultracode 協助研究、審查、修復或重構（前提是環境可達 DW，見「環境需求與相容性」）。
- 需要多模型同 thread 協作：探索、代勞、對抗驗證、收斂、落地。
- 高風險工程：大型重構、資料遷移、安全修補、交易系統、工具橋接、agent orchestration、模型接入。
- 使用者要求「Claude 協作」「dynamic workflows」「ultrawork」「多 AI 協作」「subagents 並行」「對抗驗證」「模型分工」「token 預算」。

不要使用本 skill 當任務可由單模型短回覆完成，或只是簡單翻譯、格式化、單檔小修。

## 授權要求

Claude Code Dynamic Workflows 是 **opt-in** 能力，大規模 fan-out 絕不自動發起：

- 任何 L/XL 級別的多 subagent fan-out，主控代理必須在啟動前取得使用者明確授權。
- 「任務龐大需要協助」不等於「已授權 fan-out」；授權必須明確，不得推定。
- 取得授權前，主控代理可先產生任務分解計畫（含範圍、停止條件、預算上限、回滾方式）供使用者確認，而非直接啟動 workflow。
- S/M 級別（單一主控或單一 reviewer）無需額外授權確認，但仍須符合最低級別原則。

## 環境需求與相容性

本 skill 是工作流**規範**，不是 runtime，也不會讓任何 app 自動獲得能力。要實際運轉，主控環境必須滿足以下前置條件；缺哪一項就按「能力降級矩陣」降級，而不是假裝具備。

### 前置條件

1. **主控代理能執行工具**：可操作檔案、shell、git、測試，並且是唯一工具執行者。
2. **可達 Claude Code Dynamic Workflows**：主控能透過 CLI / IDE / bridge / gateway / 人工授權其中一條路徑，請 Claude Code 執行原生 Dynamic Workflows。沒有這條，仍能做多模型主控編排，但拿不到原生 DW 的大規模並行 fan-out。
3. **（選用）跨品牌模型管道**：要用非 Claude 的 economy subagent，主控需具備單一 gateway / provider，或各品牌 CLI 可被主控呼叫。外部模型只經 request-scoped 工具橋，主控仍是唯一執行者。
4. **各模型自有授權**：每個品牌的 auth 由它自己的 runtime 管理；不得讀取或重放他人的 token / session。
5. **fail-closed 證據鏈與額度硬上限可設定**：能驗證工具 trace、能在啟動前宣告 budget 上限。
6. **API 花費守門**：多模型協作預設不得使用會按量計費的 API fan-out。若發現 workflow 正在用未白名單 API，主控代理必須停用該 API route / adapter / key path，保存 checkpoint，改走訂閱 CLI、本地模型或白名單模型，並向人類說明原因。

**如何滿足「可達 Claude Code Dynamic Workflows」（任選一條，由低到高門檻）**

- **人工授權路徑（零安裝）**：主控把任務分解計畫貼進 Claude Code 對話，由使用者手動觸發 Dynamic Workflows；最快的驗證方式。
- **CLI 路徑**：安裝 Claude Code CLI 且版本支援 Dynamic Workflows / ultracode；最低版本以 Claude Code 官方文件為準。
- **IDE 路徑**：在支援 Claude Code 的 IDE 擴充中執行。
- **bridge / gateway 路徑**：主控 app 自行實作對 Claude Code 的橋接層；本 skill 只定義行為規範，不提供橋接實作。

四條都不可用時，依「能力降級矩陣」走較低一列。

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

## 角色邊界

### 主控代理

主控代理是目前對話或 runtime 中持有最終決策權與工具執行能力的 AI；可以是 Codex CLI、Claude Code、OpenAI Agents SDK、自建 agent runtime 或其他具備工具執行能力的主控。主控代理必須：

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

被指派為 economy subagent 的跨品牌模型（例如 Grok、Minimax、GPT 等，具體選型由主控在 gateway 層配置）可作為：

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
- API 路線預設關閉：不要因為環境中有 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`XAI_API_KEY` 或其他 key 就自動用 API 跑 subagents。這會把協作 fan-out 變成不可控燒額度。
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

> **budget 宣告方式（概念說明）**：本文件的 `budget.total`、`budget.remaining()` 是概念性偽碼，不是任何框架的 API 欄位。實際宣告方式由主控 app 決定，常見做法是在系統提示或任務 header 放一段可被主控讀取的宣告，例如 `BUDGET: total=200000 tokens; max_subagents=16; max_rounds=2; on_exceed=stop`。重點是主控在任何 fan-out 前，以某種自己可讀可執行的方式確認這些數字為具體值（非未設定），並在超出時主動停止並記錄 checkpoint，而非依賴底層 1000-agent 背板兜底。

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
- 若任務改動 app / gateway / provider / sidebar / thread state，必須做 user-visible 驗證：確認主要 UI 狀態沒有回歸、既有資料仍可見、錯誤訊息不是 retry loop 或假完成。CLI 綠燈不能替代 UI 可見性。

完成回覆要包含：做了什麼、驗證證據、剩餘風險、下一步。

## 多模型 app / gateway 相容規範

當本 skill 用在任何多模型 app、agent runtime、gateway、IDE、CLI 或協作平台時，採用以下抽象原則：

### 最小橋接需求（Minimum Bridge Contract）

要在自訂 app / gateway / runtime 支援跨品牌 subagent，主控層必須滿足以下三點才算符合規範；缺一即降級為「無跨品牌管道」（見能力降級矩陣）：

1. **工具意圖攔截與代執行**：主控能攔截外部模型回傳的 `tool_call` / `function_call`，並由主控代為執行；外部模型不得直接觸發工具。
2. **可查閱的執行紀錄**：每次工具執行結果寫入可事後查閱、可對應 request id 的 audit trace（格式不限）。
3. **請求結束即撤銷存取**：每次 request 完成後，外部模型對工具的授權自動失效；下一次 request 需重新授予，不得跨請求持有工具憑據。

實作細節不限，滿足這三點即視為符合。

- 使用單一穩定 provider / gateway；不要為每個模型建立一個 provider。
- 同 thread 只切換 model，不切換 provider，保留上下文閉環。
- 若切換全域 provider，必須檢查既有 thread / project sidebar 是否仍可見；provider split 造成「沒有聊天」視為未完成，而不是 UI 小瑕疵。
- gateway 必須對大型 context fail-closed：設定明確 request body 上限，超限時回可診斷錯誤，不可 reset socket 造成主控 app 無限 reconnect。
- gateway / runtime 必須標示 API spend policy。非白名單 API route 必須 fail-closed；不能因為 key 存在就自動讓 subagents 使用 API。
- 外部模型只能使用 request-scoped tools；不得全域持有主控 app 的 MCP、computer-use、shell、browser 或其他工具。
- 工具意圖必須轉為主控 app 可驗證的 function_call / tool call / audit trace；主控 app 是唯一工具執行者。
- 若模型聲稱 click、type、set_value、press_key、open app 等 GUI 動作，但沒有對應 function_call / tool trace，視為未完成或 hallucination。
- computer-use 要 fail-closed：沒有工具 schema 就不能讓模型假裝操作；有工具 schema 也要檢查 action evidence。
- 沒有可驗證證據時的強制動作（fail-closed 協定）：主控代理先拒絕讓該聲稱推進工作流狀態 → 要求模型重新執行並回傳工具 trace 或可重現輸出 → 仍無法提供則由主控代理自行執行並留記錄 → 再無則標記為已知缺口並升級人工確認，不得推斷為完成。沒有證據 = 沒有完成。
- GPT / Claude / Grok / Minimax 等 adapter 必須有 capability matrix、smoke tests、錯誤分類與降級策略。
- 不提交 token、auth、logs、state database、完整 rollout、私人 thread id 或私密本機狀態。

## 專案地圖與記憶工具使用原則

- 若環境提供專案地圖、程式碼索引、知識庫或 graph 工具（工具名稱因環境而異，如 GitNexus 或同類），只在使用者明確要求或任務明確受益（例如需要跨模組影響範圍分析）時才啟用，不作為每次改動的強制前置步驟。
- 記憶／知識庫工具（如 GBrain 或同類）只保存可復用工作經驗與決策邊界，不保存原始資料、token、私密 thread、完整 logs 或不可公開狀態。
- 大型 ultrawork 完成後，若使用者要求記憶化，才將「何時啟動、怎麼分派、哪個 failure mode、如何驗證」蒸餾成短經驗；不自動記憶化。


## 完成定義

一次 ultrawork 完成時，必須滿足：

- 分派有邊界，沒有讓模型無限制擴散。
- Economy lane 與 Heavy lane 的工作不同，沒有重複浪費 token。
- Claude Dynamic Workflow 的結果被主控代理審核過，而非原樣照抄。
- 所有工具操作都有 trace、diff、測試或可重現證據。
- 如果交付會改變使用者可見 app 狀態，必須驗證可見 UI 與既有資料仍正常；只驗證後端、CLI、catalog 或 unit tests 不足以宣稱完成。
- 高風險資料與私密狀態未被提交或寫入共享 skill。
- 最終回覆能讓人類知道：已完成、未完成、剩餘風險、下一步。
