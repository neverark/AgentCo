import assert from 'node:assert/strict';
import test from 'node:test';
import { createOnchainMarketHandler, signMarketRequest } from '../../api/_onchain-market.js';
import { createSnifferRiskHandlers } from '../../api/_sniffer-risk.js';

const tokenAddress = '0x940181a94A35A4569E4529A3CDfB74e38FD98631';
const task = { chain: 'Base', tokenAddress, budgetCents: 50 };
const jsonRequest = (url, body) => new Request(`http://localhost${url}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('signed OKX Market request returns only verified token metrics and source metadata', async () => {
  const calls = [];
  const handler = createOnchainMarketHandler({
    env: { OKX_API_KEY: 'key', OKX_SECRET_KEY: 'secret', OKX_PASSPHRASE: 'pass' },
    now: () => new Date('2026-09-25T12:00:00.000Z'),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ code: '0', data: [{
        chainIndex: '8453', tokenContractAddress: tokenAddress.toLowerCase(), time: '1790337600000',
        price: '1.23', marketCap: '4560000', priceChange24H: '-2.5', volume24H: '21000',
        txs24H: '640', liquidity: '980000', holders: '12345', privateField: 'omit-me',
      }] }), { status: 200 });
    },
  });
  const response = await handler(jsonRequest('/api/onchainos/token-market-info', { chain: 'Base', tokenAddress }));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(calls[0].url, 'https://web3.okx.com/api/v6/dex/market/price-info');
  const body = JSON.stringify([{ chainIndex: '8453', tokenContractAddress: tokenAddress.toLowerCase() }]);
  assert.equal(calls[0].options.body, body);
  assert.equal(calls[0].options.headers['OK-ACCESS-SIGN'], signMarketRequest('secret', '2026-09-25T12:00:00.000Z', 'POST', '/api/v6/dex/market/price-info', body));
  assert.equal(result.price, '1.23');
  assert.equal(result.liquidity, '980000');
  assert.equal(result.holders, '12345');
  assert.equal(JSON.stringify(result).includes('privateField'), false);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('Market handler refuses missing credentials, invalid requests, and API payment challenges', async () => {
  let calls = 0;
  const noCredentials = createOnchainMarketHandler({ env: {}, fetchImpl: async () => { calls += 1; return new Response('', { status: 402 }); } });
  const marketTask = { chain: task.chain, tokenAddress: task.tokenAddress };
  assert.equal((await noCredentials(jsonRequest('/market', marketTask))).status, 503);
  assert.equal(calls, 0);
  const invalid = await noCredentials(jsonRequest('/market', { ...marketTask, tokenAddress: '0x0' }));
  assert.equal(invalid.status, 400);
  const configured = createOnchainMarketHandler({
    env: { OKX_API_KEY: 'a', OKX_SECRET_KEY: 'b', OKX_PASSPHRASE: 'c' },
    fetchImpl: async () => { calls += 1; return new Response('', { status: 402 }); },
  });
  const response = await configured(jsonRequest('/market', marketTask));
  assert.equal(response.status, 402);
  assert.equal((await response.json()).error.includes('did not make a payment'), true);
});

function quoteCli() {
  return { ok: true, data: {
    paymentId: 'pay-123',
    candidates: [{ acceptsIndex: 0, amountHuman: 0.1, tokenSymbol: 'USDT', chainName: 'X Layer',
      asset: '0x779ded0c9e1022225f8e0630b35a9b54be713736', payTo: '0x0000000000000000000000000000000000000002',
      scheme: 'exact', recommended: true, balanceStatus: 'sufficient' }],
  } };
}

test('Sniffer quote follows seller-declared inputs; approval pays the bound option once and retains result and receipt', async () => {
  const calls = [];
  const handlers = createSnifferRiskHandlers({ env: { AGENTCO_PAID_CALL_LIMIT_CENTS: '10' }, run: async (args) => {
    calls.push(args);
    if (args[0] === 'payment' && args[1] === 'quote' && !args.includes('--param')) {
      return { ok: true, data: { missingParams: ['chain', 'ca'], merchantBody: { note: 'inputs required' } } };
    }
    if (args[1] === 'quote') return quoteCli();
    return { ok: true, data: { status: 'success', txHash: '0xabc', providerResponse: { verdict: 'caution', findings: ['Concentrated holders'] } } };
  } });
  const quoteResponse = await handlers.quote(jsonRequest('/quote', task));
  const quote = await quoteResponse.json();
  assert.equal(quoteResponse.status, 200);
  assert.deepEqual(quote.providedInputs, [
    { name: 'chain', value: 'Base' },
    { name: 'ca', value: tokenAddress.toLowerCase() },
  ]);
  assert.equal(quote.options[0].amountCents, 10);
  assert.equal(calls.some((args) => args[1] === 'pay'), false);
  const quotedArgs = calls[1];
  assert.equal(quotedArgs.includes('chain=Base'), true);
  assert.equal(quotedArgs.includes(`ca=${tokenAddress.toLowerCase()}`), true);

  const payResponse = await handlers.pay(jsonRequest('/pay', {
    quoteId: quote.quoteId, acceptsIndex: 0, task,
  }));
  const paid = await payResponse.json();
  assert.equal(payResponse.status, 200);
  assert.equal(paid.status, 'success');
  assert.equal(paid.providerResult.verdict, 'caution');
  assert.equal(paid.receipt.transaction, '0xabc');
  assert.equal(paid.receipt.amountCents, 10);
  const payArgs = calls[2];
  assert.deepEqual(payArgs.slice(0, 7), ['payment', 'pay', '--payment-id', 'pay-123', '--selected-index', '0', '--yes']);
  assert.equal(payArgs.includes(`ca=${tokenAddress.toLowerCase()}`), true);
  const repeated = await handlers.pay(jsonRequest('/pay', { quoteId: quote.quoteId, acceptsIndex: 0, task }));
  assert.equal((await repeated.json()).status, 'success');
  assert.equal(calls.filter((args) => args[1] === 'pay').length, 1);
  const status = await handlers.status(new Request(`http://localhost/status?quoteId=${quote.quoteId}`));
  assert.equal((await status.json()).status, 'success');
});

test('Sniffer quote rejects over-budget/per-call choices and fails closed when seller inputs are unknown', async () => {
  const tooExpensive = createSnifferRiskHandlers({
    env: { AGENTCO_PAID_CALL_LIMIT_CENTS: '10' },
    run: async (args) => args.includes('--param') ? { ok: true, data: { ...quoteCli().data, candidates: [{ ...quoteCli().data.candidates[0], amountHuman: 0.11 }] } }
      : { ok: true, data: { missingParams: ['network', 'contract_address'] } },
  });
  const response = await tooExpensive.quote(jsonRequest('/quote', task));
  assert.equal(response.status, 422);
  assert.match((await response.json()).error, /No quote option/);

  let calls = 0;
  const unknownInputs = createSnifferRiskHandlers({ run: async () => { calls += 1; return { ok: true, data: { missingParams: ['request', 'profile'] } }; } });
  const unknown = await unknownInputs.quote(jsonRequest('/quote', task));
  assert.equal(unknown.status, 422);
  assert.equal(calls, 1);
});

test('ambiguous Sniffer pay is locked as unknown and cannot be retried', async () => {
  const calls = [];
  const handlers = createSnifferRiskHandlers({ run: async (args) => {
    calls.push(args);
    if (args[1] === 'quote' && !args.includes('--param')) return { ok: true, data: { missingParams: ['chain', 'ca'] } };
    if (args[1] === 'quote') return quoteCli();
    const error = new Error('CLI timed out after submission');
    error.code = 'ETIMEDOUT';
    throw error;
  } });
  const quote = await handlers.quote(jsonRequest('/quote', task)).then((response) => response.json());
  const pay = await handlers.pay(jsonRequest('/pay', { quoteId: quote.quoteId, acceptsIndex: 0, task }));
  assert.equal(pay.status, 504);
  assert.equal((await pay.json()).status, 'unknown');
  const duplicate = await handlers.pay(jsonRequest('/pay', { quoteId: quote.quoteId, acceptsIndex: 0, task }));
  assert.equal(duplicate.status, 409);
  assert.equal(calls.filter((args) => args[1] === 'pay').length, 1);
  const status = await handlers.status(new Request(`http://localhost/status?quoteId=${quote.quoteId}`));
  assert.equal((await status.json()).status, 'unknown');
});

test('a failed settlement cannot be reported as paid by a conflicting CLI success flag', async () => {
  const handlers = createSnifferRiskHandlers({ run: async (args) => {
    if (args[1] === 'quote' && !args.includes('--param')) return { ok: true, data: { missingParams: ['chain', 'ca'] } };
    if (args[1] === 'quote') return quoteCli();
    return { ok: true, data: { status: 'failed', success: true, receipt: { status: 'success' } } };
  } });
  const quote = await handlers.quote(jsonRequest('/quote', task)).then((response) => response.json());
  const response = await handlers.pay(jsonRequest('/pay', { quoteId: quote.quoteId, acceptsIndex: 0, task }));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).receipt.status, 'failed');
});
