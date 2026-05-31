# open-ultrawork

`open-ultrawork` is a public skill/spec for **token-budgeted multi-model workflows**. It is designed for tasks that need a controlling agent plus coordinated help from Claude Code Dynamic Workflows / ultracode, reviewer models, or lower-cost parallel subagents.

`open-ultrawork` 不是一個 runtime，也不是某個 app 自帶的魔法能力；它是一份**工作流規範 / skill**，用來定義多模型協作時的角色邊界、授權規則、預算上限、驗證方式與安全收斂流程。

## 中文說明：這個 skill 是做什麼的？

這個 skill 用來規範「**主控代理 + Claude Code Dynamic Workflows / ultracode + 其他模型**」如何一起完成大型任務。

它適合這些情境：

- 任務很大，需要拆成多個平行子任務
- 需要多模型協作、交叉驗證、對抗審查
- 需要先用平價模型大範圍探索，再由重型模型收斂
- 高風險工程工作，例如大型重構、資料遷移、安全修補、交易風控、架構調整、工具橋接

它主要解決的不是「怎麼讓模型看起來更聰明」，而是：

- 誰負責最後決策
- 哪些模型可以做探索、哪些只能做審稿
- 什麼時候必須先取得使用者授權
- token / quota 怎麼控管
- 沒有工具證據時，如何 fail-closed，不把幻覺當完成

### 核心用途

1. **定義角色邊界**
   - 主控代理負責真實工具操作、驗證、Git、測試、回滾
   - Claude Dynamic Workflows 負責大規模探索、平行分派、批判式審稿
   - 其他模型只能在授權範圍內提供探索、草稿、分類、反駁與輔助分析

2. **定義啟動條件**
   - 小任務不應濫用多代理 fan-out
   - 大型 L/XL workflow 必須先向使用者說明範圍、預算、停止條件，再取得明確授權

3. **定義安全機制**
   - 外部模型不能直接持有主控工具
   - 工具操作必須可追溯、有 trace、有證據
   - 沒有證據就不能算完成

4. **定義收斂方式**
   - 先探索，再收斂
   - 先平價模型扛量，再由重型模型裁決
   - 先局部驗證，再宣告完成

## English: what is this skill for?

This skill defines a **general workflow contract** for large tasks that need:

- a controlling agent that owns real tool execution,
- Claude Code Dynamic Workflows / ultracode for large-scale parallel exploration and review,
- and optional external models for cheap exploration, drafting, triage, or adversarial validation.

It is useful when a task is too large, risky, or ambiguous for a single model to handle cleanly.

### What it standardizes

1. **Role boundaries**
   - The controller owns tool execution, grounding, testing, git actions, and final decisions.
   - Claude Dynamic Workflows can be used for native fan-out, orchestration, and high-quality review.
   - External models can assist, but they do not automatically gain native workflow powers or unrestricted tools.

2. **Authorization rules**
   - Large fan-out is opt-in.
   - L/XL workflow launches require explicit user approval before execution.

3. **Budget discipline**
   - The skill defines S/M/L/XL operating levels with hard limits on rounds, subagents, and token usage.
   - Cheap models explore first; heavy models converge last.

4. **Fail-closed verification**
   - Tool claims without trace evidence are treated as incomplete.
   - The controller must verify results through diffs, tests, logs, or reproducible commands.

5. **Degradation honesty**
   - If a runtime cannot actually reach Claude Dynamic Workflows, it must degrade honestly instead of pretending full capability exists.

## Important positioning

- This repo is a **workflow/specification skill**, not an official Claude Code runtime or SDK.
- The name `open-ultrawork` is the name of this workflow convention.
- The official product capability should still be described as **Claude Code Dynamic Workflows / ultracode** when applicable.

## Repository contents

```text
SKILL.md
agents/
  openai.yaml
```

- `SKILL.md`: the main skill spec
- `agents/openai.yaml`: agent-facing metadata and invocation policy

## Good fit

Use this skill when you need:

- multi-model collaboration in one task,
- parallel subagent exploration,
- adversarial review,
- architecture or migration planning,
- security or trading-risk review with explicit boundaries,
- token-budgeted orchestration with real stopping rules.

## Not a good fit

Do **not** use this skill for:

- simple one-shot answers,
- small formatting tasks,
- trivial edits that do not benefit from orchestration,
- situations where the environment cannot actually support the required workflow.

## License

No license has been added yet. Add one explicitly if you want to permit reuse under defined terms.
