import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import agentLedgerProxy from '../../api/_agentledger-proxy.js';
import { agentLedgerProxyPlugin } from './vite-agentledger-plugin.js';

const payload = {
  source: 'provided_state',
  financialState: {
    periodDays: 30,
    cashFlow: { inflows: 0, outflows: 22 },
    providers: [{ provider: 'Sentinel (synthetic)', spend: 22, transactions: 1 }],
  },
  monthlyBudget: 50,
};

async function invoke(body, { method = 'POST', contentType = 'application/json' } = {}) {
  const request = new Request('https://agentco.example/api/agentledger/company-health', {
    method,
    headers: contentType ? { 'content-type': contentType } : {},
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  const result = await agentLedgerProxy(request);
  return { status: result.status, headers: result.headers, body: await result.json() };
}

test('rejects methods other than POST without calling the external service', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('must not call upstream'); };
  try {
    const result = await invoke(undefined, { method: 'GET' });
    assert.equal(result.status, 405);
    assert.equal(result.headers.get('allow'), 'POST');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects oversized or non-synthetic payloads before forwarding', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('must not call upstream'); };
  try {
    const oversized = await invoke(JSON.stringify({ payload: 'x'.repeat(17_000) }));
    assert.equal(oversized.status, 413);
    const sensitive = await invoke({ ...payload, tokenAddress: '0xsecret' });
    assert.equal(sensitive.status, 400);
    const unlabeled = await invoke({
      ...payload,
      financialState: { ...payload.financialState, providers: [{ provider: 'Sentinel', spend: 22, transactions: 1 }] },
    });
    assert.equal(unlabeled.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('forwards only the fixed synthetic schema and filters unrelated service conclusions', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({
      service: 'AgentLedger',
      analysisVersion: '0.3.4',
      stateVerification: 'caller_supplied',
      currency: 'USD',
      budget: { limit: 0.5, used: 0.22, usedPct: 44, remaining: 0.28, periodDays: 30 },
      topCounterparties: [{ address: 'Sentinel', spend: 0.22, transactions: 1, shareOfSpendPct: 100 }],
      insights: [
        { type: 'budget_utilization', title: 'Budget use' },
        { type: 'cash_flow', title: 'Cash flow' },
      ],
      recommendationSummary: { financialStatus: 'critical' },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await invoke(payload);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal(result.body.service, 'AgentLedger');
    assert.equal(result.body.stateVerification, 'caller_supplied');
    assert.deepEqual(result.body.insights.map((item) => item.type), ['budget_utilization']);
    assert.equal('recommendationSummary' in result.body, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://agentledger-one.vercel.app/api/company-health');
    assert.deepEqual(JSON.parse(calls[0].options.body), payload);
    assert.equal(calls[0].options.signal.aborted, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reports an upstream timeout as a gateway timeout', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const error = new Error('timeout');
    error.name = 'TimeoutError';
    throw error;
  };
  try {
    const result = await invoke(payload);
    assert.equal(result.status, 504);
    assert.match(result.body.error, /timed out/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Vite dev and preview middleware use the same validated proxy handler', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    service: 'AgentLedger',
    budget: { limit: 0.5, used: 0.22, usedPct: 44, remaining: 0.28 },
    topCounterparties: [],
    insights: [],
  }), { status: 200 });
  try {
    const plugin = agentLedgerProxyPlugin('https://agentledger-one.vercel.app');
    let devMiddleware;
    let previewMiddleware;
    plugin.configureServer({ middlewares: { use: (middleware) => { devMiddleware = middleware; } } });
    plugin.configurePreviewServer({ middlewares: { use: (middleware) => { previewMiddleware = middleware; } } });
    assert.equal(typeof devMiddleware, 'function');
    assert.equal(typeof previewMiddleware, 'function');

    const req = Readable.from([JSON.stringify(payload)]);
    req.url = '/api/agentledger/company-health';
    req.method = 'POST';
    req.headers = { 'content-type': 'application/json' };
    const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body; } };
    await devMiddleware(req, response, () => assert.fail('matched path should be handled'));
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body.toString()).service, 'AgentLedger');
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
