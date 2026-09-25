# AgentCo workflow guide

AgentCo brings provider selection, budget control, evidence review, and connected OKX services into one workspace. This guide uses the bundled sample catalog to make each decision reproducible, then shows the live service and data connections.

## 1. Create a task

Start the app with `npm ci` and `npm run dev`, then open [localhost:5173](http://localhost:5173). The default task uses an AERO address on Base, a 0.50 USDT spend limit, and a 45-second delivery window. Change the token, network, budget, or deadline to explore different decisions.

When Onchain OS API credentials are configured, select **Look up token** beneath the task form. AgentCo requests basic metadata for the selected contract and shows the returned name, symbol, decimals, and recognition flag. This live metadata is separate from the sample provider findings.

## 2. Compare procurement policies

Select **Compare policies**. With the default task and initial sample history:

| Policy | Normal sample spend | Maximum spend |
| --- | ---: | ---: |
| Lowest cost | 0.06 USDT | 0.06 USDT |
| Balanced | 0.22 USDT | 0.38 USDT |
| High assurance | 0.36 USDT | 0.44 USDT |

**Lowest cost** buys one analysis and checks its structure and identity. **Balanced** adds independent verification and reserves room for one fallback. **High assurance** compares two analyses and verifies their evidence. The plan changes when the budget, deadline, or accumulated provider history changes.

## 3. Run and inspect a procurement

Keep **Balanced** selected and start with **Successful delivery**. Choose **Run procurement**. Pause or step through the execution journal to inspect the reservation, provider call, verification, release, and final snapshot. The sample path reserves 0.38 USDT, records 0.22 USDT of modeled spend, and releases the unused 0.16 USDT reservation.

Open **View risk snapshot** to inspect matched and unverified fields. **Export evidence** downloads the task, plan, ledger states, and evidence as JSON.

Change the scenario to **Verification mismatch** and run again. The first answer fails its evidence check; AgentCo activates Atlas as its single bounded fallback and calls Lens again. This sample path records 0.38 USDT of modeled spend.

Select **Response timeout** to see reconciliation. AgentCo recovers the original invocation record after the response timeout, preserving one payment record for that call.

## 4. Request an external assessment

Open **Treasury** and select **Run free external assessment**. AgentCo sends the most recent 30 days of aggregate sample budgets, provider spend, and call counts to the free [AgentLedger Financial Health service listed on OKX.AI](https://www.okx.ai/agents/11336). The live response reports budget utilization and provider concentration and identifies the input as caller supplied. AgentCo shows those supported findings with their provenance.

For a fresh browser profile with one default Balanced run, the response shows 44% budget use, $0.28 remaining, and 90.91% largest-provider share. Values change as the local run history changes.

## 5. Check the wallet connection

With Onchain OS installed and an Agentic Wallet session available on the local computer, select **Check connection** in Treasury. The app reads the wallet sign-in state and the OKX.AI User gate through the official CLI. The readiness result contains no account identifiers, balances, keys, or session tokens.

## 6. Explore constraints and history

Return to Workspace, choose **High assurance**, and lower the spend limit to 0.21 USDT. AgentCo blocks the plan because the selected checks cannot fit the limit. Restore 0.50 USDT to continue.

Run history retains up to 30 local records. Acceptance results affect later provider choices. Use a fresh browser profile to reproduce the initial policy costs exactly.
