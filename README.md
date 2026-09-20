# AgentCo

**English** | [简体中文](README.zh-CN.md)

**Intelligence, well spent.** An interactive AI procurement demo: choose services, control spending, and inspect the evidence.

AgentCo is an AI service procurement workspace built for OKX Dev Day. Give it a token, a budget, and a procurement policy; it compares services, reserves costs, checks results, and delivers a token risk snapshot with supporting evidence. This repository contains a working local demo built with React, TypeScript, and Vite.

**Everything is simulated.** Scout, Sentinel, Atlas, and Lens are fictional providers. Prices, ratings, histories, findings, and payment records are synthetic. As requested, the app does not connect to a wallet, sign transactions, call paid APIs, or transfer real funds. No credentials are required. Real OKX AI integration is future work and is not part of this demo.

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

To run the checks:

```bash
npm test
npm run typecheck
```

Tests cover the integer budget ledger, policy selection, budget and deadline boundaries, a single fallback, repeat verification, timeout reconciliation, and history feedback.

## What you can demonstrate

- **Three policies:** `Lowest cost`, `Balanced`, and `High assurance`. Compare selected services, expected spending, and the maximum allowed cost as you change the plan.
- **Three scenarios:** `Successful delivery`, `Verification mismatch`, and `Response timeout`, with pause, step-by-step playback, and reset controls.
- **Budgets and evidence:** The `Execution journal` shows reservations, spending, releases, and verification. Use `Export evidence` to download a report as JSON, or copy an individual event as JSON.
- **Providers and records:** Search and filter the `Agent directory`; review completed simulations and spending in `Run history` and `Treasury`.

The browser retains up to **30 runs** locally. Their observations combine with seeded samples to influence future provider selection. `New task` and `Reset run` preserve this history; use a fresh browser profile or private window to reproduce the initial example. With the default 0.50 USDT budget, 45-second deadline, and seeded history, a successful Balanced run costs 0.22, while its maximum cost with fallback and repeat verification is 0.38. All amounts are simulated ledger units.

## Documentation

Every document has a complete English and Simplified Chinese version, linked at the top of each file.

- [Three-minute demo walkthrough](docs/demo-walkthrough.md)
- [Product brief: original proposal and current implementation](docs/product-brief.md)
- [Visual and demo design: original proposal and current implementation](docs/demo-design.md)

## References

- [Event page](https://luma.com/l4aq8vii)
- [OKX Builder Kit](https://www.okx.com/en-sg/learn/okx-dev-day-builder-kit)
- [User-provided AgentCo MVP discussion](https://chatgpt.com/share/6aae7f96-13bc-83ec-b2a3-2a317c76cae7)

Original research date: September 20, 2026. Event and platform details in these documents provide background; they do not mean this demo has completed platform integration or a hackathon submission.
