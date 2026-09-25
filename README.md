# AgentCo

**Intelligence, well spent.** AgentCo is an AI service procurement workspace for choosing providers, setting a spending policy, checking results, and keeping an evidence trail.

A task starts with a token, budget, deadline, and procurement policy. AgentCo compares a provider catalog, reserves the maximum allowed cost, records each service decision, checks the returned evidence, and reports the outcome and spend. The included Scout, Sentinel, Atlas, and Lens catalog supplies sample providers and repeatable execution histories so the workflow is usable immediately. Connected services add live data and external assessments to the same workspace.

## Connected workflows

- **OKX.AI-listed AgentLedger:** In Treasury, **Run free external assessment** sends a 30-day aggregate of provider activity to [AgentLedger Financial Health](https://www.okx.ai/agents/11336) (Agent 11336, Service 40038). The service returns budget utilization and provider concentration. AgentCo labels the input as caller supplied and sends only aggregate budgets, spend, and call counts.
- **Onchain OS Token API:** In Workspace, **Look up token** sends the selected contract address to OKX's [Token Basic Information API](https://web3.okx.com/onchainos/dev-docs/market/market-token-basic-info) using a server-side signed request. The returned name, symbol, decimals, and recognition flag appear beside the procurement plan. Configure the server credentials below to enable this lookup.
- **Onchain OS Market API:** The live risk workflow requests [Token Trading Information](https://web3.okx.com/onchainos/dev-docs/market/market-token-price-info) for the same contract. It records price, 24-hour change and volume, transactions, liquidity, holders, and the provider timestamp as market evidence.
- **OKX.AI-listed Sniffer Risk Check:** Workspace can request a live risk assessment from [Sniffer, Agent 6149](https://www.okx.ai/agents/6149). AgentCo asks the local Onchain OS CLI to quote the service, binds the provider's declared chain/address inputs to the task, checks the returned X Layer USD₮0 payment against the task budget and per-call limit, and shows the exact amount and recipient before the user approves payment. The CLI signs, replays the request, and returns its receipt and provider response.
- **Agentic Wallet and OKX.AI User readiness:** In Treasury, **Check connection** reads the local [Onchain OS](https://web3.okx.com/onchainos/dev-docs/okxai/user-register) CLI wallet session and user gate. The result shows readiness without exposing account identifiers or session data.

AgentLedger's assessment is a live external computation over the activity supplied to it. The bundled Scout, Sentinel, Atlas, and Lens catalog remains a sample workflow. Sniffer responses, OKX Market snapshots, and actual payment receipts are stored as distinct live run records; Treasury keeps sample spend and confirmed live spend separate. Token metadata returned by Onchain OS is live and displayed separately from provider findings.

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
| `AGENTCO_PAID_CALL_LIMIT_CENTS` | Maximum allowed cost for one live paid service call; defaults to `10` (0.10 USDT). |
| `AGENTCO_SNIFFER_METHOD` | Sniffer quote method (`GET` or `POST`); defaults to `GET`, matching the Onchain OS CLI quote default. |
| `AGENTCO_SNIFFER_CHAIN_PARAM` | Optional trusted seller field name for chain when the CLI quote does not publish missing inputs or a schema. |
| `AGENTCO_SNIFFER_TOKEN_PARAM` | Optional trusted seller field name for the token contract in that same case. |

Set the three OKX values as server-side environment variables in Vercel when deploying. They are never sent to the browser. The token lookup is initiated only when a user selects **Look up token**. OKX includes a [monthly free API quota](https://web3.okx.com/onchainos/dev-docs/market/market-api-fee); AgentCo stops if OKX returns a payment challenge.

For live payment, install Onchain OS and sign in to [Agentic Wallet](https://web3.okx.com/onchainos/dev-docs/home/install-your-agentic-wallet) on the computer running AgentCo. **Check connection** calls the official read-only `onchainos wallet status` and `onchainos agent gate-check --role user` commands. Paid provider routes run only in the local Vite server where that wallet session exists; the hosted Vercel routes return unavailable and never try to share a local wallet across web users.

## Procurement workflow

1. Enter a token contract and choose Base, X Layer, or Ethereum. Use **Look up token** for live basic metadata when the Onchain OS API is configured.
2. Set a spend limit and delivery window, then compare **Lowest cost**, **Balanced**, and **High assurance**. AgentCo shows the selected providers, expected cost, worst-case reserve, and reasons for its choices.
3. Run a sample procurement. The execution journal records reservations, service calls, verification, fallback decisions, releases, and the final outcome. Step mode lets you inspect each event.
4. Open the risk snapshot and export its evidence as JSON. Run history retains up to 30 records in the browser and uses their acceptance results in later provider selection.
5. Use **Prepare live risk check** to request Sniffer Risk Check and a separate OKX Market snapshot. Review the supplied chain and contract fields, payment network, asset, recipient, wallet balance status, and per-call quote. **Approve … and run** is the only action that starts wallet signing. The app records the provider result, Market evidence, payment ID, and transaction receipt in Run history.
6. Open Treasury to review sample spend separately from confirmed live provider spend, request the live AgentLedger assessment, and check local wallet and OKX.AI User readiness.

The sample catalog supports success, verification disagreement, and response timeout scenarios. Timeout reconciliation reuses the original invocation record, and the fallback path is bounded by the selected budget. Live provider payment requires an exact one-time quote on X Layer using the canonical USD₮0 asset; other networks or assets fail the approval check. An ambiguous payment result is saved as unresolved and cannot be replayed from the app. Check the local wallet/provider record before discarding it or preparing another quote. AgentLedger receives only sample workflow figures numerically in its USD schema; no live payment records or exchange-rate conversion are sent. Because the sample records include no income, AgentCo displays only the service's budget and provider-concentration findings.

## Verify

```bash
npm test
npm run build
npm run smoke:agentledger
```

The automated checks cover policy and ledger boundaries, fallback and timeout behavior, aggregate mapping, the same-origin service proxy, signed Onchain OS requests, and local wallet readiness. The live smoke check sends a fixed sample aggregate to AgentLedger.

See the [workflow guide](docs/workflow-guide.md) for a complete walk-through.
