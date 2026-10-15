export function contract(origin: string) {
  const cond = {
    oneOf: [
      { type: "object", required: ["type", "repo", "issue"], properties: { type: { const: "github_pr_merged" }, repo: { type: "string", description: "owner/name" }, issue: { type: "integer" } } },
      { type: "object", required: ["type"], properties: { type: { const: "both_confirm" } } },
      { type: "object", required: ["type", "url", "text"], properties: { type: { const: "url_contains" }, url: { type: "string" }, text: { type: "string" } } },
    ],
  };
  return {
    plugin_id: "settle", name: "Settle", version: "0.1.0", publisher: "Settle (PayBox Hackathon Ch.1)",
    category: "merchant-tools", official: false,
    description: "Conditional escrow for agents. Lock USDC now; it releases automatically when a verifiable condition passes (GitHub PR merged, both parties confirm, URL live) or refunds at the deadline.",
    contract_uri: `${origin}/plugin.json`,
    pricing: { create_deal: { usd: Number(process.env.CREATE_PRICE_USD || "0.05"), protocol: "x402" }, release_fee_bps: 50 },
    invoke: { endpoint: `${origin}/api/plugin/use`, method: "POST", body: "{ tool_id, input }", payment: "x402 on create_deal" },
    tools: [
      { tool_id: "create_deal", money: false, description: "Create an escrow deal. Returns the escrow address to fund + payer/payee tokens.", input_schema: { type: "object", required: ["payee", "amount", "condition"], properties: { title: { type: "string" }, payer: { type: "string", description: "payer wallet (refunds go here); optional, taken from funding tx" }, payee: { type: "string", description: "0x wallet that gets paid" }, amount: { type: "number", description: "USDC" }, deadline: { type: "string", format: "date-time" }, deadline_hours: { type: "number" }, condition: cond } } },
      { tool_id: "fund_deal", money: false, description: "After the user pays the escrow address (PayBox send_payment / passkey), register the tx hash. Settle verifies it on-chain.", input_schema: { type: "object", required: ["deal_id", "tx"], properties: { deal_id: { type: "string" }, tx: { type: "string" } } } },
      { tool_id: "get_deal", money: false, description: "Status + live timeline of a deal.", input_schema: { type: "object", required: ["deal_id"], properties: { deal_id: { type: "string" } } } },
      { tool_id: "confirm_deal", money: false, description: "Payer or payee confirms completion (both_confirm deals) using their token.", input_schema: { type: "object", required: ["deal_id", "token"], properties: { deal_id: { type: "string" }, token: { type: "string" } } } },
      { tool_id: "check_deal", money: false, description: "Force a condition check now (release or refund if due).", input_schema: { type: "object", required: ["deal_id"], properties: { deal_id: { type: "string" } } } },
    ],
    funding_flow: "create_deal → PayBox send_payment of `amount` USDC to fund.to (user approves with passkey) → fund_deal(tx) → Settle releases/refunds automatically.",
  };
}
