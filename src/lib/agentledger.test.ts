import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_TASK, buildRun, selectPlan } from './procurement.ts';
import { readAgentLedgerAssessment, summarizeForAgentLedger } from './agentledger.ts';

const testNow = Date.parse('2026-09-25T12:00:00.000Z');

function simulatedRun(id = 'local-run', scenario: 'success' | 'timeout' = 'success') {
  const task = { ...DEFAULT_TASK, scenario };
  const run = buildRun(task, selectPlan(task), id);
  return { ...run, createdAt: new Date(testNow - 1_000).toISOString() };
}

describe('AgentLedger caller-supplied summary', () => {
  it('aggregates payment deltas once and sends only synthetic totals', () => {
    const run = simulatedRun('timeout-run', 'timeout');
    const summary = summarizeForAgentLedger([run], testNow);

    assert.equal(summary.runCount, 1);
    assert.equal(summary.totalBudget, 0.5);
    assert.equal(summary.totalSpend, 0.22);
    assert.equal(summary.totalTransactions, 2);
    assert.deepEqual(summary.payload.financialState.cashFlow, { inflows: 0, outflows: 0.22 });
    assert.deepEqual(summary.payload.financialState.providers, [
      { provider: 'Lens (synthetic)', spend: 0.02, transactions: 1 },
      { provider: 'Sentinel (synthetic)', spend: 0.2, transactions: 1 },
    ]);

    const body = JSON.stringify(summary.payload);
    assert.ok(!body.includes(run.id));
    assert.ok(!body.includes(run.task.tokenAddress));
    assert.ok(!body.includes(run.task.tokenSymbol));
    assert.ok(!body.includes('frames'));
  });

  it('deduplicates runs and excludes data outside the 30-day window', () => {
    const recent = simulatedRun('same-run');
    const old = { ...simulatedRun('old-run'), createdAt: new Date(testNow - 31 * 24 * 60 * 60 * 1000).toISOString() };
    const summary = summarizeForAgentLedger([recent, recent, old], testNow);

    assert.equal(summary.runCount, 1);
    assert.equal(summary.totalTransactions, 2);
    assert.equal(summary.totalSpend, 0.22);
  });

  it('displays only budget and provider concentration fields from a recognized AgentLedger response', () => {
    const result = readAgentLedgerAssessment({
      service: 'AgentLedger', analysisVersion: '0.3.4', dataSource: 'provided_state',
      stateVerification: 'caller_supplied', currency: 'USD', generatedAt: '2026-09-25T12:00:00.000Z',
      budget: { limit: 0.5, used: 0.22, normalizedUsed: 0.22, usedPct: 44, remaining: 0.28, periodDays: 30 },
      topCounterparties: [{ address: 'synthetic-demo-provider', spend: 0.22, transactions: 1, shareOfSpendPct: 100 }],
      insights: [
        { type: 'budget_utilization', severity: 'positive', title: 'Budget use', message: 'Synthetic input', metric: 44 },
        { type: 'counterparty_concentration', severity: 'caution', title: 'Provider share', metric: 100 },
        { type: 'cash_flow', severity: 'negative', title: 'Not shown', metric: -0.22 },
      ],
      recommendationSummary: { financialStatus: 'critical' },
    });

    assert.equal(result.service, 'AgentLedger');
    assert.equal(result.budget?.usedPct, 44);
    assert.equal(result.topCounterparties[0].shareOfSpendPct, 100);
    assert.deepEqual(result.insights.map((insight) => insight.type), ['budget_utilization', 'counterparty_concentration']);
    assert.ok(!('recommendationSummary' in result));
    assert.throws(() => readAgentLedgerAssessment({}), /did not match AgentLedger/);
  });
});
