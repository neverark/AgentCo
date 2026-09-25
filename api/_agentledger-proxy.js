const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_AGGREGATE_MONEY = 30_000_000;

function jsonResponse(status, value, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value, allowed) {
  return isRecord(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function finiteMoney(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_AGGREGATE_MONEY;
}

function validatePayload(payload) {
  if (!hasOnlyKeys(payload, ['source', 'financialState', 'monthlyBudget'])
    || payload.source !== 'provided_state'
    || !finiteMoney(payload.monthlyBudget)) return null;

  const state = payload.financialState;
  if (!hasOnlyKeys(state, ['periodDays', 'cashFlow', 'providers']) || state.periodDays !== 30
    || !hasOnlyKeys(state.cashFlow, ['inflows', 'outflows'])
    || state.cashFlow.inflows !== 0 || !finiteMoney(state.cashFlow.outflows)
    || !Array.isArray(state.providers) || state.providers.length > 4) return null;

  const providers = [];
  for (const provider of state.providers) {
    if (!hasOnlyKeys(provider, ['provider', 'spend', 'transactions'])
      || typeof provider.provider !== 'string'
      || provider.provider.length < 1 || provider.provider.length > 100
      || !provider.provider.endsWith(' (synthetic)')
      || !finiteMoney(provider.spend)
      || !Number.isSafeInteger(provider.transactions)
      || provider.transactions < 0 || provider.transactions > 100_000) return null;
    providers.push({
      provider: provider.provider,
      spend: provider.spend,
      transactions: provider.transactions,
    });
  }

  return {
    source: 'provided_state',
    financialState: {
      periodDays: 30,
      cashFlow: { inflows: 0, outflows: state.cashFlow.outflows },
      providers,
    },
    monthlyBudget: payload.monthlyBudget,
  };
}

function sanitizeAssessment(value) {
  if (!isRecord(value) || typeof value.service !== 'string'
    || !value.service.toLowerCase().includes('agentledger') || !isRecord(value.budget)) return null;

  const budgetFields = ['limit', 'used', 'usedPct', 'remaining'];
  if (budgetFields.some((key) => typeof value.budget[key] !== 'number' || !Number.isFinite(value.budget[key]))) return null;

  const counterparties = Array.isArray(value.topCounterparties) ? value.topCounterparties : [];
  const insights = Array.isArray(value.insights) ? value.insights : [];
  return {
    service: value.service.slice(0, 100),
    ...(typeof value.analysisVersion === 'string' ? { analysisVersion: value.analysisVersion.slice(0, 30) } : {}),
    ...(typeof value.dataSource === 'string' ? { dataSource: value.dataSource.slice(0, 50) } : {}),
    ...(typeof value.stateVerification === 'string' ? { stateVerification: value.stateVerification.slice(0, 50) } : {}),
    ...(typeof value.currency === 'string' ? { currency: value.currency.slice(0, 10) } : {}),
    ...(typeof value.generatedAt === 'string' ? { generatedAt: value.generatedAt.slice(0, 50) } : {}),
    budget: {
      limit: value.budget.limit,
      used: value.budget.used,
      usedPct: value.budget.usedPct,
      remaining: value.budget.remaining,
      ...(typeof value.budget.periodDays === 'number' && Number.isFinite(value.budget.periodDays)
        ? { periodDays: value.budget.periodDays } : {}),
    },
    topCounterparties: counterparties.slice(0, 5).filter(isRecord).map((row) => ({
      ...(typeof row.address === 'string' ? { address: row.address.slice(0, 100) } : {}),
      ...(typeof row.spend === 'number' && Number.isFinite(row.spend) ? { spend: row.spend } : {}),
      ...(typeof row.transactions === 'number' && Number.isFinite(row.transactions) ? { transactions: row.transactions } : {}),
      ...(typeof row.shareOfSpendPct === 'number' && Number.isFinite(row.shareOfSpendPct)
        ? { shareOfSpendPct: row.shareOfSpendPct } : {}),
    })),
    insights: insights.filter(isRecord)
      .filter((item) => item.type === 'budget_utilization' || item.type === 'counterparty_concentration')
      .slice(0, 10)
      .map((item) => ({
        type: item.type,
        ...(typeof item.severity === 'string' ? { severity: item.severity.slice(0, 30) } : {}),
        ...(typeof item.title === 'string' ? { title: item.title.slice(0, 120) } : {}),
        ...(typeof item.message === 'string' ? { message: item.message.slice(0, 500) } : {}),
        ...(typeof item.metric === 'number' && Number.isFinite(item.metric) ? { metric: item.metric } : {}),
      })),
  };
}

async function readLimitedText(stream, lengthHeader, maxBytes) {
  if (lengthHeader !== null) {
    const length = Number(lengthHeader);
    if (!Number.isSafeInteger(length) || length < 0 || length > maxBytes) throw new RangeError('Payload too large');
  }

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
      throw new RangeError('Payload too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export function createAgentLedgerProxy(origin = 'https://agentledger-one.vercel.app') {
  let endpoint;
  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.protocol !== 'https:' || parsedOrigin.origin !== origin.replace(/\/$/, '')) {
      throw new Error('Invalid origin');
    }
    endpoint = `${parsedOrigin.origin}/api/company-health`;
  } catch {
    throw new Error('AgentLedger service origin must be an HTTPS origin without a path.');
  }

  return async function handler(request) {
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed.' }, { allow: 'POST' });
    }
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return jsonResponse(415, { error: 'Content-Type must be application/json.' });
    }

    let payload;
    try {
      payload = JSON.parse(await readLimitedText(
        request.body,
        request.headers.get('content-length'),
        MAX_REQUEST_BYTES,
      ));
    } catch (error) {
      return jsonResponse(error instanceof RangeError ? 413 : 400, {
        error: error instanceof RangeError ? 'Request payload is too large.' : 'Request body must be valid JSON.',
      });
    }

    const safePayload = validatePayload(payload);
    if (!safePayload) return jsonResponse(400, { error: 'Request does not match the synthetic AgentLedger input schema.' });

    try {
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(safePayload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!upstream.ok) return jsonResponse(502, { error: 'AgentLedger service returned an error.' });

      let responseText;
      try {
        responseText = await readLimitedText(
          upstream.body,
          upstream.headers.get('content-length'),
          MAX_RESPONSE_BYTES,
        );
      } catch {
        return jsonResponse(502, { error: 'AgentLedger response was too large.' });
      }
      let assessment;
      try {
        assessment = sanitizeAssessment(JSON.parse(responseText));
      } catch {
        assessment = null;
      }
      if (!assessment) return jsonResponse(502, { error: 'AgentLedger returned an unexpected response.' });
      return jsonResponse(200, assessment);
    } catch (error) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      return jsonResponse(timedOut ? 504 : 502, {
        error: timedOut ? 'AgentLedger request timed out.' : 'AgentLedger service is unavailable.',
      });
    }
  };
}

export default createAgentLedgerProxy();
