// example-flow.mjs — cost-tiered ultrawork run. Bulk fan-out on near-free economy
// model (MiniMax M3), premium reserved for synthesis. Run: node example-flow.mjs
import { agent, parallel, log, costReport } from "./ultrawork.mjs";

const angles = [
  "用一句話:為什麼並行 subagent 比單一長 context 省 token?",
  "用一句話:成本分層路由(economy fan-out + heavy 收斂)為何贏過全 premium?",
  "用一句話:vendor-diverse 對抗驗證為何優於 N 個相同 skeptic?",
];

log(`fan-out ${angles.length} economy subagents (MiniMax M3)`);
const takes = await parallel(
  angles.map((q, i) => () => agent(q, { tier: "economy", label: `take#${i + 1}` })),
);

log("synthesis (economy)");
const summary = await agent(
  "把以下幾段各濃縮成一個 bullet:\n\n" + takes.map((t, i) => `(${i + 1}) ${t}`).join("\n\n"),
  { tier: "economy", label: "synth" },
);

console.log("\n===== RESULT =====\n" + summary + "\n");
log(costReport());
