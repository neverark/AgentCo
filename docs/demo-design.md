# AgentCo visual and demo design: original proposal and current implementation

**English** | [简体中文](demo-design.zh-CN.md)

The original design goal was to help judges understand, within a few seconds, how AI procures services and accounts for its spending. This document preserves the design rationale. The next section records what was implemented; the layout sketch and color values that follow come from the original proposal.

## Current implementation

The local React, TypeScript, and Vite interface organizes procurement around a light workspace, dark navy text, blue actions, and a clear hierarchy for monetary values. It includes `Workspace`, `Agent directory`, `Run history`, and `Treasury`. Reports, provider profiles, policy comparisons, and event details open in modal dialogs.

The workspace provides chain and token inputs, a budget and delivery deadline, three policies, a service table, a budget allocation bar, and an `Execution journal`. Runs support pause, resume, step-by-step playback, and `Reset run`. Three simulated scenarios cover success, verification disagreement, and a response timeout. Reports offer `Export evidence`; events offer `Copy event JSON`.

Following the user's requirement to avoid paid operations, all data, charges, histories, and payment records are simulated locally. The UI displays `Demo environment` and `Simulation only. No real funds.` Real OKX integration is outside this delivery. The current browser retains the latest 30 runs, and their simulated acceptance outcomes influence future provider selection. `New task` and `Reset run` preserve that history.

See the [2–4 minute demo walkthrough](demo-walkthrough.md) for the current presentation flow and initial costs.

## Main view

The design centers on an interactive procurement workspace. Its opening view lets users define a task, inspect candidates, switch policies, and start execution. The product's visual identity revolves around the budget and evidence for one task.

```text
+--------------------------------------------------------------------------------+
| AgentCo                   Workspace / Invocation records             Demo mode  |
+------------------+------------------------------------+------------------------+
| TASK             | SERVICE COMPARISON                 | PROCUREMENT BUDGET     |
| Chain and token  | Price / capabilities / measured    | Spent / reserved /     |
| Budget, deadline | history / sample count             | available              |
| Policy           | Selected plan and its rationale    | Cost breakdown         |
|                  +------------------------------------+                        |
| Run analysis     | Procure -> execute -> verify       | Acceptance status      |
|                  | -> report                          | Expandable evidence    |
|                  | Each step tied to costs and results|                        |
+------------------+------------------------------------+------------------------+
| EVENT TIMELINE: reserve, call, payment status, verify, release, complete         |
+--------------------------------------------------------------------------------+
```

Layout rationale: keeping candidate comparison and execution in the same workspace avoids switching pages during the main flow. A separate directory provides capabilities and simulated history. The original sketch proposed drawers; the implementation uses modal dialogs for events and evidence. On narrow screens, sections rearrange and navigation can be expanded.

## Visual language

The direction is a precise, clear financial tool with an editorial feel. A light workspace pairs with navy text. Blue identifies selection and actions; reservations and verification states have their own color meanings.

| Color | Value | Purpose |
| --- | --- | --- |
| Porcelain | `#F3F5F7` | Page canvas |
| Ink navy | `#152238` | Primary text and high-contrast areas |
| Cobalt | `#355DFF` | Actions, selected plans, and focus |
| Teal | `#0F766E` | Passed verification and completion supported by evidence |
| Amber | `#A16207` | Budget reservations and pending checks |
| Vermilion | `#B43B37` | Verification failures and blocked execution |

Typography proposal: Manrope for selected headings, IBM Plex Sans for interface text, and IBM Plex Mono for amounts, times, and receipt identifiers. Chinese text should prefer a system sans-serif font. Font weights, fallbacks, loading, and contrast should be checked in the final implementation.

The original scale proposed a main heading around 32px, section headings around 20px, and a 16px base for body text. Amounts use tabular numerals. Table density supports comparison, while whitespace in the opening view supports explanation; stacks of statistics cards are not the main way to convey complexity.

## The defining visual element

**A budget allocation bar synchronized with the current simulated execution state.**

Funds move from available to reserved, then to spent when a charge is confirmed. Selected services and verification steps connect to the corresponding amounts. When the task ends, unused reservations return to the available portion. This transition makes AgentCo's work easy to understand.

Animation follows explicit state changes: provider selection, reservation, response arrival, verification, and fallback activation. The initial guidance suggested 160–240ms for microinteractions and 300–500ms for key state transitions. Current automatic playback advances one event every 1.25 seconds, with `Start in step-by-step mode` as an alternative. This is presentation pacing, not actual service latency.

## Core interactions

1. **Define the task:** provide a working example and keep visible labels and validation for the chain, token, budget, deadline, and policy.
2. **Compare services:** show capabilities, simulated quotes, simulated acceptance rates, and sample counts. Provider details distinguish marketplace star ratings from task acceptance history and explain that both seed data and local runs are simulated.
3. **Inspect the plan:** explain inclusion and exclusion, distinguish expected spending from the maximum cost, and show which steps and amounts change when switching policies.
4. **Execute and check acceptance:** advance through clear states, explain failures and waiting, and identify the checks that passed and the gaps in evidence.
5. **Inspect the delivery:** expand or export the risk snapshot, spending, evidence, and records. Resetting the current demonstration preserves simulated browser history.

## Original presentation outline

A product demo of roughly three minutes:

- **First 20 seconds:** explain the need for token risk information supported by evidence within a spending limit; show the task and budget.
- **20–70 seconds:** run Balanced, explain candidate comparison and selection, then show reservation, execution, verification, and the report.
- **70–110 seconds:** switch the same task to Lowest cost and High assurance. Observe changes in services purchased, evidence coverage, and cost; show the insufficient-budget message when requirements cannot be met.
- **110–150 seconds:** introduce a verification failure in a clearly labeled simulation and show the reserved fallback path and cumulative spending.
- **150–180 seconds:** open synthetic evidence and events, show unspent budget and observations from the run, and explain that there are no real payments or live market data.

This entire script runs in a clearly labeled demo mode. Fixed fixtures and deterministic execution make it repeatable during a presentation. Providers, prices, histories, and findings must not be presented as real observations. Follow the [current walkthrough](demo-walkthrough.md) for the actual operating steps.

## Design review

The enterprise workspace style, clear tables, and state feedback found through `ui-ux-pro-max` were relevant. Its generated marketing homepage structure did not fit this product and was not adopted. The layout and budget allocation bar follow AgentCo's procurement workflow.

Review priorities after implementation include keyboard operation, visible focus, aligned amounts, text contrast, narrow-screen layout, access to full addresses, loading and failure feedback, reduced motion, and simulation labels. There is currently no recorded-data or live-data mode.

The final stack is React, TypeScript, Vite, Lucide icons, and local font assets. The pure simulation logic in `src/lib/procurement.ts` handles amounts, plans, verification, and history feedback; the interface displays and plays back its events.
