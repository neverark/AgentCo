# AgentCo

**Intelligence, well spent.** AgentCo is an AI service procurement workspace for choosing providers, setting a spending policy, checking results, and keeping an evidence trail.

A task starts with a token, budget, deadline, and procurement policy. AgentCo compares a provider catalog, reserves the maximum allowed cost, records each service decision, checks the returned evidence, and reports the outcome and spend. The included Scout, Sentinel, Atlas, and Lens catalog supplies sample providers and repeatable execution histories so the workflow is usable immediately. Connected services add live data and external assessments to the same workspace.

## Connected workflows

- **OKX.AI-listed AgentLedger:** In Treasury, **Run free external assessment** sends a 30-day aggregate of provider activity to [AgentLedger Financial Health](https://www.okx.ai/agents/11336) (Agent 11336, Service 40038). The service returns budget utilization and provider concentration. AgentCo labels the input as caller supplied and sends only aggregate budgets, spend, and call counts.
- **Onchain OS Token API:** In Workspace, **Look up token** sends the selected contract address to OKX's [Token Basic Information API](https://web3.okx.com/onchainos/dev-docs/market/market-token-basic-info) using a server-side signed request. The returned name, symbol, decimals, and recognition flag appear beside the procurement plan. Configure the server credentials below to enable this lookup.
- **Agentic Wallet and OKX.AI User readiness:** In Treasury, **Check connection** reads the local [Onchain OS](https://web3.okx.com/onchainos/dev-docs/okxai/user-register) CLI wallet session and user gate. The result shows readiness without exposing account identifiers or session data.

AgentLedger's assessment is a live external computation over the activity supplied to it. The bundled provider catalog and its execution records are sample data. Token metadata returned by Onchain OS is live and displayed separately from provider evidence.

## Start

Requires Node.js 22.18 or later.

```bash
npm ci
npm run dev
```

Open [localhost:5173](http://localhost:5173). To build and preview the production bundle:

```bash
npm run build
npm run preview
```

The preview runs at [localhost:4173](http://localhost:4173). Deploy the repository to Vercel to serve the frontend and its same-origin API functions together.

## Configure OKX connections

Copy `.env.example` to `.env` for local settings. `.env` is ignored by Git; only `.env.example` is tracked.

| Setting | Purpose |
| --- | --- |
| `AGENTLEDGER_SERVICE_ORIGIN` | Optional HTTPS origin for the local AgentLedger proxy; the verified service is the default. |
| `OKX_API_KEY` | Onchain OS Token API key from the [OKX Developer Portal](https://web3.okx.com/onchainos/dev-portal). |
| `OKX_SECRET_KEY` | Secret used by the server to sign the token lookup request. |
| `OKX_PASSPHRASE` | Passphrase for the same API key. |

Set the three OKX values as server-side environment variables in Vercel when deploying. They are never sent to the browser. The token lookup is initiated only when a user selects **Look up token**. OKX includes a [monthly free API quota](https://web3.okx.com/onchainos/dev-docs/market/market-api-fee); AgentCo stops if OKX returns a payment challenge.

For the local wallet check, install Onchain OS and complete [Agentic Wallet sign-in](https://web3.okx.com/onchainos/dev-docs/home/install-your-agentic-wallet) on the computer running AgentCo. **Check connection** calls the official read-only `onchainos wallet status` and `onchainos agent gate-check --role user` commands. The wallet session stays with the local CLI.

## Procurement workflow

1. Enter a token contract and choose Base, X Layer, or Ethereum. Use **Look up token** for live basic metadata when the Onchain OS API is configured.
2. Set a spend limit and delivery window, then compare **Lowest cost**, **Balanced**, and **High assurance**. AgentCo shows the selected providers, expected cost, worst-case reserve, and reasons for its choices.
3. Run a sample procurement. The execution journal records reservations, service calls, verification, fallback decisions, releases, and the final outcome. Step mode lets you inspect each event.
4. Open the risk snapshot and export its evidence as JSON. Run history retains up to 30 records in the browser and uses their acceptance results in later provider selection.
5. Open Treasury to review spending, request the live AgentLedger assessment, and check local wallet and OKX.AI User readiness.

The sample catalog supports success, verification disagreement, and response timeout scenarios. Timeout reconciliation reuses the original invocation record, and the fallback path is bounded by the selected budget. AgentLedger receives synthetic USDT figures numerically in its USD schema for this sample workflow; no exchange-rate conversion is applied. Because the sample records include no income, AgentCo displays only the service's budget and provider-concentration findings.

## Verify

```bash
npm test
npm run build
npm run smoke:agentledger
```

The automated checks cover policy and ledger boundaries, fallback and timeout behavior, aggregate mapping, the same-origin service proxy, signed Onchain OS requests, and local wallet readiness. The live smoke check sends a fixed sample aggregate to AgentLedger.

See the [workflow guide](docs/workflow-guide.md) for a complete walk-through.
