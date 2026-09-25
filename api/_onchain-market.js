import { createHmac } from 'node:crypto';

const PATH = '/api/v6/dex/market/price-info';
const UPSTREAM = `https://web3.okx.com${PATH}`;
const CHAIN_INDEX = { 'X Layer': '196', Ethereum: '1', Base: '8453' };
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function json(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function limitedText(stream, lengthHeader, maxBytes) {
  if (lengthHeader !== null && Number(lengthHeader) > maxBytes) throw new RangeError('Too large');
  if (!stream) return '';
  const reader = stream.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      throw new RangeError('Too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

function numericString(value, max = 80) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.length <= max && /^-?\d+(?:\.\d+)?$/.test(value)) return value;
  return undefined;
}

export function signMarketRequest(secret, timestamp, method, path, body) {
  return createHmac('sha256', secret).update(`${timestamp}${method}${path}${body}`).digest('base64');
}

export function createOnchainMarketHandler({ env = process.env, fetchImpl = fetch, now = () => new Date() } = {}) {
  return async function handler(request) {
    if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
    if (!request.headers.get('content-type')?.startsWith('application/json')) {
      return json(415, { error: 'Content-Type must be application/json.' });
    }

    let input;
    try {
      input = JSON.parse(await limitedText(request.body, request.headers.get('content-length'), 1024));
    } catch (error) {
      if (error instanceof RangeError) return json(413, { error: 'Request is too large.' });
      return json(400, { error: 'Invalid JSON request.' });
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some((key) => !['chain', 'tokenAddress'].includes(key))
      || !Object.hasOwn(CHAIN_INDEX, input.chain) || typeof input.tokenAddress !== 'string'
      || !ADDRESS.test(input.tokenAddress) || /^0x0{40}$/i.test(input.tokenAddress)) {
      return json(400, { error: 'Choose a supported network and a valid token address.' });
    }

    const key = env.OKX_API_KEY;
    const secret = env.OKX_SECRET_KEY;
    const passphrase = env.OKX_PASSPHRASE;
    if (!key || !secret || !passphrase) {
      return json(503, { error: 'Set OKX_API_KEY, OKX_SECRET_KEY, and OKX_PASSPHRASE on the server to request Onchain OS market data.' });
    }

    const body = JSON.stringify([{ chainIndex: CHAIN_INDEX[input.chain], tokenContractAddress: input.tokenAddress.toLowerCase() }]);
    const timestamp = now().toISOString();
    try {
      const upstream = await fetchImpl(UPSTREAM, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'OK-ACCESS-KEY': key,
          'OK-ACCESS-PASSPHRASE': passphrase,
          'OK-ACCESS-TIMESTAMP': timestamp,
          'OK-ACCESS-SIGN': signMarketRequest(secret, timestamp, 'POST', PATH, body),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (upstream.status === 402) return json(402, { error: 'The Onchain OS market API quota requires payment. AgentCo did not make a payment.' });
      if (!upstream.ok) return json(502, { error: `Onchain OS returned HTTP ${upstream.status}.` });
      let result;
      try { result = JSON.parse(await limitedText(upstream.body, upstream.headers.get('content-length'), 64 * 1024)); }
      catch { return json(502, { error: 'Onchain OS market response was invalid or too large.' }); }
      if (result?.code !== '0' || !Array.isArray(result.data)) {
        return json(502, { error: 'Onchain OS did not return token market information.' });
      }
      const row = result.data.find((item) => item?.chainIndex === CHAIN_INDEX[input.chain]
        && item?.tokenContractAddress?.toLowerCase() === input.tokenAddress.toLowerCase());
      if (!row) return json(404, { error: 'No matching market information was returned for this token.' });
      const metrics = {
        price: numericString(row.price), marketCap: numericString(row.marketCap),
        priceChange24H: numericString(row.priceChange24H), volume24H: numericString(row.volume24H),
        transactions24H: numericString(row.txs24H), liquidity: numericString(row.liquidity),
        holders: numericString(row.holders), timestamp: numericString(row.time),
      };
      if (Object.values(metrics).some((value) => value === undefined)) {
        return json(502, { error: 'Onchain OS returned incomplete token market information.' });
      }
      return json(200, {
        source: 'OKX Onchain OS Market API',
        chain: input.chain,
        tokenAddress: input.tokenAddress.toLowerCase(),
        ...metrics,
        checkedAt: timestamp,
      });
    } catch {
      return json(502, { error: 'Onchain OS market lookup could not be completed.' });
    }
  };
}

export default createOnchainMarketHandler();
