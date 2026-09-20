# AgentCo: a three-minute demo walkthrough

**English** | [简体中文](demo-walkthrough.zh-CN.md)

This script demonstrates the local product as implemented. All services, market data, ratings, costs, and payment records are synthetic. There is no wallet connection, paid API call, or real transfer.

## Before the demo

Run `npm install` and `npm run dev`, then open [localhost:5173](http://localhost:5173). Start with a fresh browser profile or private window to use the initial seeded history. Refreshing the page, choosing `New task`, or using `Reset run` preserves the current browser's run history. Observations from the most recent 30 simulated runs influence future provider selection.

The default task uses the example AERO address on Base, with a `Spend limit` of **0.50 USDT** and a `Delivery window` of **45 sec**. The real address serves only as a task identifier; entering it does not query live market data. The fixed costs below assume this budget, deadline, and initial history.

| Policy in the UI | Normal outcome | Maximum spend with one fallback |
| --- | ---: | ---: |
| Lowest cost | 0.06 | 0.06; no fallback |
| Balanced | 0.22 | 0.38 |
| High assurance | 0.36 | 0.44 |

## 0:00–0:25 · Explain the product

Stay in `Workspace`.

> “AgentCo is a workspace that procures AI services on your behalf. I give it a task, a budget, and quality requirements. It selects services, controls spending, checks results, and records every decision. The Demo environment indicator at the top right means this run is entirely simulated, with no real funds involved.”

Point to `Token contract`, `Network`, `Spend limit`, and the three policy cards. Explain that the same task can use different procurement approaches.

## 0:25–0:50 · Compare policies and selection reasons

Click `Compare policies` to show the three plans.

> “Lowest cost uses Scout for 0.06 and checks only the response structure and identity. Balanced uses Sentinel plus Lens verification for a normal cost of 0.22, with room reserved for Atlas as a fallback and another verification call. High assurance buys two analyses and cross-checks them, with a normal cost of 0.36 and a ceiling of 0.44. If the budget or deadline is too tight, the plan adjusts or is blocked.”

Close the dialog and keep `Balanced` selected. Point to `DEMO HISTORY` in the service table: these are simulated acceptance records with sample counts, a separate signal from marketplace star ratings.

## 0:50–1:30 · Run procurement, budget tracking, and verification

Under `Explore an outcome`, keep `Successful delivery` selected and click `Run procurement`. Automatic playback advances one event every 1.25 seconds. Use `Pause execution` or the step button to its right when explaining an event, or select `Start in step-by-step mode` before starting.

> “AgentCo first reserves 0.38 for the most expensive allowed path, including the primary service, verification, fallback, and repeat verification. A successful primary path spends only 0.22, releasing the remaining 0.16 reservation and leaving 0.28 of the budget unspent. This releases a ledger reservation; it is not an onchain refund.”

Follow the budget allocation bar and `Execution journal`, then click `View risk snapshot` when the run finishes. Point out `Matched` and `Not verified`: fields such as liquidity match the synthetic reference, but `Contract security audit` has not been verified. Click `Export evidence` to download JSON containing the task, plan, ledger at each step, and evidence.

## 1:30–2:10 · Make a failure understandable

Close the report, choose `Verification mismatch` under `Explore an outcome`, keep Balanced and the 0.50 budget, and click `Run procurement` again.

> “Paying for a response does not mean the result passes acceptance. Here, the liquidity figure disagrees with the reference. AgentCo rejects the first analysis, activates the reserved Atlas fallback, and calls Lens again. It permits at most one fallback. The completed run spends 0.38 and leaves 0.12 unspent.”

Show `Evidence disagreement detected`, `Fallback 1 of 1 · Atlas`, and the evidence that ultimately passes. Click any event to inspect cumulative spending, remaining reservations, and available budget at that point.

## 2:10–2:40 · Recover a timeout without paying twice

Select `Response timeout` and run it.

> “This scenario simulates losing the response after the payment has been recorded. The system keeps the original invocation record, then recovers that same call through Original invocation reconciled. A missing response does not trigger a second payment. Balanced's normal total remains 0.22.”

If time is short, use the step button to advance to this event.

## 2:40–3:10 · Leave a traceable record

Open `Run history` to review the outcomes and costs of the three scenarios. Switch to `Treasury` to compare spending with budgets. If useful, open `Agent directory` to inspect provider profiles and acceptance samples.

> “Every outcome enters local simulated history and informs future selection. Users can trace why a service was chosen, how much was spent, which evidence passed, and what was left unchecked. This demo shows the complete procurement experience; real OKX service and payment integration will be separate future work.”

## Optional extension: insufficient budget

Return to `Workspace`, choose `High assurance`, and change `Spend limit` to **0.21**. This is insufficient for two analyses and verification. The UI displays `Before you run`, and `Run procurement` is disabled. Restore 0.50 to continue.

After repeated demos, history feedback may change the service combination and its quoted cost. This is intentional. To reproduce the initial costs in the table exactly, use a fresh browser session with no saved history.
