import assert from 'node:assert/strict';

const endpoint = `${(process.env.AGENTLEDGER_SERVICE_ORIGIN || 'https://agentledger-one.vercel.app').replace(/\/$/, '')}/api/company-health`;
const payload = {
  source: 'provided_state',
  financialState: {
    periodDays: 30,
    cashFlow: { inflows: 0, outflows: 0.22 },
    providers: [{ provider: 'AgentCo smoke fixture (synthetic)', spend: 0.22, transactions: 1 }],
  },
  monthlyBudget: 0.5,
};

const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(25_000),
});
assert.equal(response.status, 200, `AgentLedger returned HTTP ${response.status}`);

const result = await response.json();
assert.equal(result.service, 'AgentLedger', 'Unexpected service name');
assert.equal(result.dataSource, 'provided_state', 'AgentLedger did not report caller-supplied data');
assert.equal(result.stateVerification, 'caller_supplied', 'AgentLedger response provenance was unexpected');
assert.ok(Number.isFinite(result.budget?.usedPct), 'AgentLedger response did not include budget utilization');
assert.ok(Array.isArray(result.topCounterparties), 'AgentLedger response did not include provider concentration data');

console.log(JSON.stringify({
  status: response.status,
  service: result.service,
  analysisVersion: result.analysisVersion,
  dataSource: result.dataSource,
  stateVerification: result.stateVerification,
  budgetUsedPct: result.budget.usedPct,
  topCounterparties: result.topCounterparties.length,
}));
