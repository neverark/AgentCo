# AgentCo

**Intelligence, well spent.** An interactive AI procurement demo: choose services, control spending, and inspect the evidence.

AgentCo is an AI service procurement workspace built for OKX Dev Day. Give it a token, a budget, and a procurement policy; it compares services, reserves costs, checks results, and delivers a token risk snapshot with supporting evidence. This repository contains a working local demo built with React, TypeScript, and Vite.

**The AgentCo procurement ledger is simulated.** Scout, Sentinel, Atlas, and Lens are fictional providers. Their prices, ratings, histories, findings, and payment records are synthetic. The app does not connect a wallet, sign transactions, or transfer real funds.

**The Treasury also integrates a live free service listed on OKX.AI:** [AgentLedger Financial Health](https://www.okx.ai/agents/11336), Agent ID **11336**, Service ID **40038**. After a simulated run, choose `Treasury` → `Run free external assessment`. AgentCo sends only 30-day aggregate synthetic budgets, provider spend and call counts to the service's public endpoint. It sends no token addresses, token symbols, run IDs, or journal events. The returned budget-use and provider-concentration figures are a real external computation over caller-supplied synthetic inputs (`stateVerification: caller_supplied`); they are not live token analysis or independently verified financial data.

AgentCo calls the public service endpoint listed on OKX.AI. The assessment is free. Local Vite and Vercel route it through the same-origin proxy because the service does not allow browser-origin requests.

## Run locally

Requires **Node.js 22.18 or later**.

```bash
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173). If port 5173 is in use, run `npm run dev -- --port 5174`.

To build and preview the production bundle:

```bash
npm run build
npm run preview
```

The build output is in `dist/`. The production preview runs at [localhost:4173](http://localhost:4173).

## Deploy and configure

Deploy the repository to Vercel to serve the frontend and the included `/api/agentledger/company-health` function together. The function accepts bounded synthetic summaries, calls the fixed AgentLedger HTTPS endpoint, returns only budget and provider-concentration fields, and times out after 15 seconds.

For local development, the verified endpoint is the default. To use another HTTPS origin, copy `.env.example` to `.env` and set `AGENTLEDGER_SERVICE_ORIGIN`; `.env` is ignored by Git and the Vite proxy keeps this value server-side.

To run the checks:

```bash
npm test
npm run typecheck
```

Tests cover the integer budget ledger, policy selection, budget and deadline boundaries, a single fallback, repeat verification, timeout reconciliation, history feedback, and the privacy-limited AgentLedger request mapping.

To smoke-check the live AgentLedger endpoint with a fixed synthetic request:

```bash
npm run smoke:agentledger
```

This requires internet access and sends only a hard-coded demo payload. It checks for HTTP 200, AgentLedger identity, caller-supplied provenance, and budget/provider fields. The browser integration was exercised end to end through the local Vite proxy: a Balanced simulated run returned **44% budget use**, **$0.28 remaining**, and **90.91% top-provider share** for the sample synthetic ledger.

The live service expects USD-valued fields. AgentCo's synthetic ledger uses USDT; the demo passes the same numeric values under a 1:1 display convention. No exchange-rate lookup or conversion occurs. AgentCo has no income data, so it sends zero inflows. The UI therefore shows only budget utilization and provider concentration and omits the service's cash-flow and overall-health conclusions.

## What you can demonstrate

- **Three policies:** `Lowest cost`, `Balanced`, and `High assurance`. Compare selected services, expected spending, and the maximum allowed cost as you change the plan.
- **Three scenarios:** `Successful delivery`, `Verification mismatch`, and `Response timeout`, with pause, step-by-step playback, and reset controls.
- **Budgets and evidence:** The `Execution journal` shows reservations, spending, releases, and verification. Use `Export evidence` to download a report as JSON, or copy an individual event as JSON.
- **Providers and records:** Search and filter the `Agent directory`; review completed simulations and spending in `Run history` and `Treasury`.

The browser retains up to **30 runs** locally. Their observations combine with seeded samples to influence future provider selection. `New task` and `Reset run` preserve this history; use a fresh browser profile or private window to reproduce the initial example. With the default 0.50 USDT budget, 45-second deadline, and seeded history, a successful Balanced run costs 0.22, while its maximum cost with fallback and repeat verification is 0.38. All amounts are simulated ledger units.

## Documentation

- [Three-minute demo walkthrough](docs/demo-walkthrough.md)

## References

- [Event page](https://luma.com/l4aq8vii)
- [OKX Builder Kit](https://www.okx.com/en-sg/learn/okx-dev-day-builder-kit)
- [OKX.AI AgentLedger Financial Health · Agent 11336 · Service 40038](https://www.okx.ai/agents/11336)
- [User-provided AgentCo MVP discussion](https://chatgpt.com/share/6aae7f96-13bc-83ec-b2a3-2a317c76cae7)

Original product research date: September 20, 2026. The AgentLedger listing and direct-call integration were checked on September 25, 2026.
