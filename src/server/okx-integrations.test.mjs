import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { createOnchainTokenHandler } from '../../api/_onchain-token.js';
import { createWalletStatusHandler } from './okx-wallet-status.js';

const tokenAddress = '0x940181a94A35A4569E4529A3CDfB74e38FD98631';
const tokenRequest = () => new Request('http://localhost/api/onchainos/token-basic-info', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ chain: 'Base', tokenAddress }),
});

test('signed Onchain OS lookup sends the exact token request and exposes only selected metadata', async () => {
  const calls = [];
  const handler = createOnchainTokenHandler({
    env: { OKX_API_KEY: 'test-key', OKX_SECRET_KEY: 'test-secret', OKX_PASSPHRASE: 'test-passphrase' },
    now: () => new Date('2026-09-25T12:00:00.000Z'),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ code: '0', data: [{
        chainIndex: '8453', tokenContractAddress: tokenAddress.toLowerCase(),
        tokenName: 'Aerodrome', tokenSymbol: 'AERO', decimal: '18',
        tagList: { communityRecognized: true }, privateField: 'omit-me',
      }] }), { status: 200 });
    },
  });
  const response = await handler(tokenRequest());
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(calls[0].url, 'https://web3.okx.com/api/v6/dex/market/token/basic-info');
  const body = JSON.stringify([{ chainIndex: '8453', tokenContractAddress: tokenAddress.toLowerCase() }]);
  assert.equal(calls[0].options.body, body);
  assert.equal(calls[0].options.headers['OK-ACCESS-SIGN'], createHmac('sha256', 'test-secret')
    .update(`2026-09-25T12:00:00.000ZPOST/api/v6/dex/market/token/basic-info${body}`).digest('base64'));
  assert.equal(result.tokenSymbol, 'AERO');
  assert.equal(result.communityRecognized, true);
  assert.equal(JSON.stringify(result).includes('privateField'), false);
  assert.equal(JSON.stringify(result).includes('test-secret'), false);
});

test('token lookup stops on invalid input, missing credentials, and a payment challenge', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return new Response('', { status: 402 }); };
  const handler = createOnchainTokenHandler({ env: {}, fetchImpl });
  assert.equal((await handler(tokenRequest())).status, 503);
  assert.equal(calls, 0);
  const bad = new Request('http://localhost/api/onchainos/token-basic-info', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chain: 'Base', tokenAddress, extra: 'secret' }),
  });
  assert.equal((await handler(bad)).status, 400);
  const configured = createOnchainTokenHandler({ env: { OKX_API_KEY: 'a', OKX_SECRET_KEY: 'b', OKX_PASSPHRASE: 'c' }, fetchImpl });
  assert.equal((await configured(tokenRequest())).status, 402);
  assert.equal(calls, 1);
});

test('wallet readiness checks the CLI session before the OKX.AI User gate and strips session data', async () => {
  const commands = [];
  const handler = createWalletStatusHandler(async (args) => {
    commands.push(args);
    if (args[0] === 'wallet') return { data: { loggedIn: true, email: 'private@example.com', evmAddress: '0xprivate' } };
    return { data: { ready: true, wallet: { ok: true }, identity: { ok: true }, communication: { ok: true }, token: 'private-token' } };
  });
  const result = await (await handler(new Request('http://localhost/api/okx/wallet-status'))).json();
  assert.deepEqual(commands, [['wallet', 'status'], ['agent', 'gate-check', '--role', 'user']]);
  assert.equal(result.walletLoggedIn, true);
  assert.equal(result.okxUserReady, true);
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('logged-out wallet does not query OKX.AI identity', async () => {
  const commands = [];
  const handler = createWalletStatusHandler(async (args) => { commands.push(args); return { data: { loggedIn: false } }; });
  const result = await (await handler(new Request('http://localhost/api/okx/wallet-status'))).json();
  assert.deepEqual(commands, [['wallet', 'status']]);
  assert.equal(result.okxUserReady, false);
});
