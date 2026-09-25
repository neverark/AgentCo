import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SNIFFER_ENDPOINT = 'https://sniffer-alpha.duckdns.org/check';
const MAX_REQUEST_BYTES = 4 * 1024;
const MAX_CLI_OUTPUT_BYTES = 128 * 1024;
const CHAIN_INDEX = { 'X Layer': '196', Ethereum: '1', Base: '8453' };
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DEFAULT_CALL_LIMIT_CENTS = 10;
const ALLOWED_SYMBOLS = new Set(['USDT', 'USD₮0', 'USDT0']);
const APPROVED_PAYMENT_NETWORK = 'eip155:196';
const APPROVED_PAYMENT_ASSET = '0x779ded0c9e1022225f8e0630b35a9b54be713736';

const execOnchainos = async (args, timeout = 20_000) => {
  const { stdout } = await execFileAsync('onchainos', args, {
    timeout,
    maxBuffer: MAX_CLI_OUTPUT_BYTES,
    windowsHide: true,
  });
  return JSON.parse(stdout.trim());
};

function json(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function readJson(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return { error: 'Content-Type must be application/json.' };
  }
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_REQUEST_BYTES) return { error: 'Request payload is too large.' };
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) return { error: 'Request payload is too large.' };
  try { return JSON.parse(text); } catch { return { error: 'Request body must be valid JSON.' }; }
}

function isRecord(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function cliData(result) { return isRecord(result?.data) ? result.data : result; }

function safeText(value, max = 200) {
  return typeof value === 'string' ? value.slice(0, max) : undefined;
}

function collectParamNames(value, into = []) {
  if (Array.isArray(value)) {
    for (const row of value.slice(0, 30)) {
      if (typeof row === 'string') into.push(row);
      else if (isRecord(row)) {
        const name = row.name ?? row.key ?? row.field ?? row.param ?? row.parameter;
        if (typeof name === 'string') into.push(name);
        else if (isRecord(row.inputSchema)) collectParamNames(row.inputSchema, into);
      }
    }
  } else if (isRecord(value)) {
    if (isRecord(value.properties)) into.push(...Object.keys(value.properties));
    if (Array.isArray(value.required)) into.push(...value.required.filter((item) => typeof item === 'string'));
    for (const key of ['params', 'parameters', 'fields', 'requiredParams', 'missingParams', 'input']) {
      if (value[key] !== undefined) collectParamNames(value[key], into);
    }
  }
  return [...new Set(into.map((name) => name.trim()).filter((name) => name.length > 0 && name.length <= 80))];
}

function parameterKind(name) {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['chain', 'chainname', 'network', 'networkname'].includes(key)) return 'chain';
  if (['chainindex', 'chainid'].includes(key)) return 'chainIndex';
  if (['ca', 'address', 'tokenaddress', 'contractaddress', 'tokencontractaddress'].includes(key)) return 'tokenAddress';
  return null;
}

function getRequestParameters(data, task, env) {
  const names = [
    ...collectParamNames(data?.missingParams),
    ...collectParamNames(data?.merchantBody),
    ...collectParamNames(data?.inputSchema),
    ...collectParamNames(data?.parameters),
  ];
  const unique = [...new Set(names)];
  const assignments = [];
  const kinds = new Set();
  for (const name of unique) {
    const kind = parameterKind(name);
    if (!kind) continue;
    if (kinds.has(kind)) throw new Error('Sniffer requested ambiguous duplicate chain or contract fields. No payment was prepared.');
    kinds.add(kind);
    let value;
    if (kind === 'chain') value = task.chain;
    else if (kind === 'chainIndex') value = CHAIN_INDEX[task.chain];
    else value = task.tokenAddress.toLowerCase();
    assignments.push({ name, value });
  }
  for (const [kind, setting] of [['chain', env.AGENTCO_SNIFFER_CHAIN_PARAM ?? env.AGENTCO_SNIFFER_NETWORK_PARAM], ['tokenAddress', env.AGENTCO_SNIFFER_TOKEN_PARAM]] ) {
    if (kinds.has(kind) || typeof setting !== 'string' || !setting) continue;
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(setting)) throw new Error('Sniffer parameter-name overrides must be simple field names. No payment was prepared.');
    assignments.push({ name: setting, value: kind === 'chain' ? task.chain : task.tokenAddress.toLowerCase() });
    kinds.add(kind);
  }
  if (new Set(assignments.map(({ name }) => name)).size !== assignments.length) {
    throw new Error('Sniffer parameter-name overrides overlap. No payment was prepared.');
  }
  if (!kinds.has('chain') && !kinds.has('chainIndex')) throw new Error('Sniffer did not identify a chain input. No payment was prepared.');
  if (!kinds.has('tokenAddress')) throw new Error('Sniffer did not identify a token contract input. No payment was prepared.');
  return assignments;
}

function paymentStatus(result, data) {
  const receipt = data?.receipt ?? data?.payment ?? data?.settlement ?? {};
  const statuses = [data?.status, receipt.status];
  if (statuses.includes('failed') || data?.success === false || receipt.success === false) return 'failed';
  if (statuses.includes('pending')) return 'pending';
  if (statuses.includes('success') || data?.success === true || receipt.success === true) return 'success';
  return 'unknown';
}

function readQuoteCandidates(data) {
  const candidates = [
    ...(Array.isArray(data?.candidates) ? data.candidates : []),
    ...(Array.isArray(data?.alternatives) ? data.alternatives : []),
  ];
  const accepts = Array.isArray(data?.accepts) ? data.accepts
    : Array.isArray(data?.paymentRequirements) ? data.paymentRequirements : [];
  return candidates.filter(isRecord).map((candidate) => {
    const acceptsIndex = Number.isSafeInteger(candidate.acceptsIndex) ? candidate.acceptsIndex : -1;
    const requirement = acceptsIndex >= 0 && isRecord(accepts[acceptsIndex]) ? accepts[acceptsIndex] : {};
    const merged = { ...requirement, ...candidate };
    const amount = typeof merged.amountHuman === 'number' ? merged.amountHuman
      : typeof merged.amountHuman === 'string' && /^\d+(?:\.\d+)?$/.test(merged.amountHuman) ? Number(merged.amountHuman)
        : undefined;
    const symbol = merged.tokenSymbol ?? merged.currencySymbol ?? merged.symbol ?? merged.currency
      ?? merged.extra?.symbol ?? merged.assetSymbol;
    const chainNameToNetwork = { 'x layer': 'eip155:196', ethereum: 'eip155:1', base: 'eip155:8453' };
    const chain = merged.network ?? (merged.chainId !== undefined ? `eip155:${merged.chainId}`
      : typeof merged.chainName === 'string' ? chainNameToNetwork[merged.chainName.toLowerCase()] : undefined);
    const payTo = merged.payTo ?? merged.recipient;
    const asset = merged.asset ?? merged.tokenAddress ?? merged.currencyAddress;
    const scheme = merged.scheme;
    return {
      acceptsIndex,
      amountHuman: amount,
      tokenSymbol: safeText(symbol, 24),
      network: safeText(chain, 80),
      asset: safeText(asset, 160),
      payTo: safeText(payTo, 160),
      scheme: safeText(scheme, 40),
      recommended: merged.recommended === true,
      balanceStatus: safeText(merged.balanceStatus, 30),
      eligible: false,
    };
  });
}

function centsForAmount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1_000_000) return null;
  const cents = Math.ceil(value * 100 - 1e-9);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function currentCallLimit(env) {
  const raw = env.AGENTCO_PAID_CALL_LIMIT_CENTS;
  if (raw === undefined || raw === '') return DEFAULT_CALL_LIMIT_CENTS;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 && value <= 100_000 ? value : DEFAULT_CALL_LIMIT_CENTS;
}

function publicOption(option, taskBudgetCents, callLimitCents) {
  const amountCents = centsForAmount(option.amountHuman);
  const symbolOkay = ALLOWED_SYMBOLS.has(option.tokenSymbol);
  const assetOkay = option.asset?.toLowerCase() === APPROVED_PAYMENT_ASSET;
  const networkOkay = option.network === APPROVED_PAYMENT_NETWORK;
  const payToOkay = typeof option.payTo === 'string' && /^0x[0-9a-fA-F]{40}$/.test(option.payTo);
  const eligible = amountCents !== null && amountCents <= taskBudgetCents && amountCents <= callLimitCents
    && symbolOkay && assetOkay && networkOkay && payToOkay && option.acceptsIndex >= 0 && option.scheme === 'exact';
  const reason = eligible ? undefined
    : amountCents === null ? 'The quote did not include a supported human-readable amount.'
      : !symbolOkay ? 'AgentCo only approves USDT-denominated Sniffer calls.'
        : !networkOkay || !assetOkay ? 'AgentCo only approves USD₮0 exact payments on X Layer.'
          : !payToOkay ? 'The quote did not include a valid recipient address.'
        : amountCents > taskBudgetCents ? 'This option exceeds the task budget.'
          : amountCents > callLimitCents ? 'This option exceeds AgentCo’s per-call limit.'
            : option.scheme !== 'exact' ? 'This procurement supports one-time exact payments only.'
              : 'The quote omitted payment terms required for approval.';
  return {
    ...option,
    amountCents,
    eligible,
    ...(reason ? { reason } : {}),
  };
}

function paymentIdOf(data) {
  const value = data?.paymentId ?? data?.payment_id;
  return typeof value === 'string' && value.length <= 200 ? value : null;
}

function unwrapCliError(result, data) {
  return safeText(data?.error ?? data?.message ?? result?.error ?? result?.message, 300)
    || 'Onchain OS could not prepare this quote.';
}

function cleanProviderValue(value, depth = 0) {
  if (depth > 5) return undefined;
  if (typeof value === 'string') return value.slice(0, 4000);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => cleanProviderValue(item, depth + 1)).filter((item) => item !== undefined);
  if (!isRecord(value)) return undefined;
  const safe = {};
  for (const [key, item] of Object.entries(value).slice(0, 60)) {
    if (/private|secret|passphrase|signature|authorization|wallet|payer|from|nonce|credential/i.test(key)) continue;
    const clean = cleanProviderValue(item, depth + 1);
    if (clean !== undefined) safe[key.slice(0, 80)] = clean;
  }
  return safe;
}

function providerPayload(data) {
  const value = data?.providerResponse ?? data?.serviceResponse ?? data?.serviceResult
    ?? data?.result ?? data?.response ?? data?.resource ?? data?.output ?? data?.content ?? data?.body ?? data?.data;
  if (value !== undefined) {
    if (typeof value === 'string') {
      try { return cleanProviderValue(JSON.parse(value)); } catch { return value.slice(0, 8000); }
    }
    return cleanProviderValue(value);
  }
  return undefined;
}

function paymentReceipt(result, data, paymentId, option) {
  const receipt = data?.receipt ?? data?.payment ?? data?.settlement ?? {};
  const transaction = receipt.transaction ?? receipt.txHash ?? data?.transaction ?? data?.txHash;
  return {
    paymentId,
    status: paymentStatus(result, data),
    ...(typeof transaction === 'string' ? { transaction: transaction.slice(0, 160) } : {}),
    network: option.network,
    asset: option.asset,
    payTo: option.payTo,
    tokenSymbol: option.tokenSymbol,
    amountHuman: option.amountHuman,
    amountCents: option.amountCents,
    ...(typeof (receipt.payer ?? data?.payer) === 'string' ? { payer: (receipt.payer ?? data.payer).slice(0, 160) } : {}),
  };
}

function taskInput(value) {
  if (!isRecord(value) || !['chain', 'tokenAddress', 'budgetCents'].every((key) => Object.hasOwn(value, key))
    || Object.keys(value).some((key) => !['chain', 'tokenAddress', 'budgetCents'].includes(key))
    || !Object.hasOwn(CHAIN_INDEX, value.chain) || typeof value.tokenAddress !== 'string'
    || !ADDRESS.test(value.tokenAddress) || /^0x0{40}$/i.test(value.tokenAddress)
    || !Number.isSafeInteger(value.budgetCents) || value.budgetCents <= 0 || value.budgetCents > 100_000_000) return null;
  return { chain: value.chain, tokenAddress: value.tokenAddress.toLowerCase(), budgetCents: value.budgetCents };
}

export function createSnifferRiskHandlers({ env = process.env, run = execOnchainos, now = () => new Date() } = {}) {
  const quotes = new Map();

  async function quote(request) {
    if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
    const body = await readJson(request);
    if (body?.error) return json(body.error === 'Request payload is too large.' ? 413 : body.error === 'Content-Type must be application/json.' ? 415 : 400, { error: body.error });
    const task = taskInput(body);
    if (!task) return json(400, { error: 'Choose a supported chain, token contract, and positive task budget.' });
    const callLimitCents = currentCallLimit(env);

    try {
      // The listing describes the required input semantically but not field names.
      // Let the official payment CLI read the seller's missingParams/schema before
      // filling only fields that bind to the requested chain and token address.
      const configuredMethod = String(env.AGENTCO_SNIFFER_METHOD || 'GET').toUpperCase();
      if (!['GET', 'POST'].includes(configuredMethod)) return json(503, { error: 'AGENTCO_SNIFFER_METHOD must be GET or POST.' });
      const firstResult = await run(['payment', 'quote', SNIFFER_ENDPOINT, ...(configuredMethod === 'POST' ? ['--method', 'POST'] : [])]);
      const firstData = cliData(firstResult);
      let assignments;
      try { assignments = getRequestParameters(firstData, task, env); }
      catch (error) { return json(422, { error: error.message }); }
      const args = ['payment', 'quote', SNIFFER_ENDPOINT, ...(configuredMethod === 'POST' ? ['--method', 'POST'] : [])];
      for (const { name, value } of assignments) args.push('--param', `${name}=${value}`);
      const result = await run(args);
      const data = cliData(result);
      if (result?.ok === false || data?.ok === false || data?.status === 'failed') return json(502, { error: unwrapCliError(result, data) });
      if (Array.isArray(data?.missingParams) && data.missingParams.length) {
        return json(422, { error: 'Sniffer requires additional inputs. No payment was prepared.' });
      }
      const paymentId = paymentIdOf(data);
      if (!paymentId) return json(502, { error: 'Onchain OS did not return a payment quote ID.' });
      const options = readQuoteCandidates(data).map((item) => publicOption(item, task.budgetCents, callLimitCents));
      const eligibleOptions = options.filter((item) => item.eligible);
      if (!eligibleOptions.length) {
        return json(422, {
          error: 'No quote option matches the task budget, per-call limit, and supported payment terms. No payment was made.',
          options: options.slice(0, 8),
          callLimitCents,
        });
      }
      const defaultOption = eligibleOptions.find((item) => item.recommended) ?? eligibleOptions[0];
      const quoteId = randomUUID();
      const record = {
        quoteId,
        paymentId,
        task,
        assignments,
        options: eligibleOptions,
        callLimitCents,
        createdAt: now().toISOString(),
        status: 'quoted',
        selectedAcceptsIndex: null,
        result: null,
      };
      quotes.set(quoteId, record);
      return json(200, {
        quoteId,
        provider: 'Sniffer Risk Check',
        listingUrl: 'https://www.okx.ai/agents/6149',
        endpoint: SNIFFER_ENDPOINT,
        requestMethod: configuredMethod,
        task,
        providedInputs: assignments.map(({ name, value }) => ({ name, value })),
        budgetCents: task.budgetCents,
        callLimitCents,
        options: eligibleOptions.slice(0, 8),
        recommendedAcceptsIndex: defaultOption.acceptsIndex,
        preparedAt: record.createdAt,
      });
    } catch (error) {
      const missing = error?.code === 'ENOENT';
      return json(missing ? 503 : 502, {
        error: missing ? 'Install and sign in to the local Onchain OS CLI to prepare a paid provider quote.'
          : error?.name === 'TimeoutError' || error?.code === 'ETIMEDOUT' ? 'Sniffer quote timed out. No payment was initiated.'
            : 'Sniffer quote could not be prepared. No payment was initiated.',
      });
    }
  }

  async function pay(request) {
    if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
    const body = await readJson(request);
    if (body?.error) return json(body.error === 'Request payload is too large.' ? 413 : body.error === 'Content-Type must be application/json.' ? 415 : 400, { error: body.error });
    if (!isRecord(body) || Object.keys(body).some((key) => !['quoteId', 'acceptsIndex', 'task'].includes(key))
      || typeof body.quoteId !== 'string' || !Number.isSafeInteger(body.acceptsIndex)) {
      return json(400, { error: 'A prepared quote and selected payment option are required.' });
    }
    const record = quotes.get(body.quoteId);
    if (!record) return json(404, { status: 'unknown', error: 'This quote is no longer available in the local wallet session. Do not retry a prior payment; prepare a fresh quote only after checking its status.' });
    const task = taskInput(body.task);
    if (!task || JSON.stringify(task) !== JSON.stringify(record.task)) return json(409, { error: 'The task changed after the quote. Prepare a new quote before paying.' });
    if (record.status === 'paying' || record.status === 'unknown') {
      return json(409, { status: record.status, error: 'Payment status is unresolved. Do not submit another payment.' });
    }
    if (record.status === 'success' || record.status === 'pending') return json(200, record.result);
    if (record.status === 'failed') return json(409, { status: 'failed', error: 'This quote already has a terminal result. Prepare a new quote before trying again.' });
    const option = record.options.find((item) => item.acceptsIndex === body.acceptsIndex);
    if (!option || !option.eligible || option.amountCents > record.task.budgetCents || option.amountCents > record.callLimitCents) {
      return json(409, { error: 'The selected payment terms do not match this approved quote.' });
    }

    record.status = 'paying';
    record.selectedAcceptsIndex = option.acceptsIndex;
    try {
      const args = ['payment', 'pay', '--payment-id', record.paymentId, '--selected-index', String(option.acceptsIndex), '--yes'];
      for (const { name, value } of record.assignments) args.push('--param', `${name}=${value}`);
      const cliResult = await run(args, 90_000);
      const data = cliData(cliResult);
      const providerResult = providerPayload(data);
      const receipt = paymentReceipt(cliResult, data, record.paymentId, option);
      const status = receipt.status;
      const paymentResult = {
        status,
        quoteId: record.quoteId,
        task: record.task,
        provider: 'Sniffer Risk Check',
        providerResult: providerResult ?? null,
        receipt,
        completedAt: now().toISOString(),
        ...(providerResult === undefined ? { warning: 'The payment CLI returned no recognizable provider result. The receipt was retained.' } : {}),
      };
      record.status = status;
      record.result = paymentResult;
      return json(status === 'failed' ? 502 : status === 'unknown' ? 504 : 200, paymentResult);
    } catch (error) {
      // A killed or disconnected CLI may have signed or submitted before output
      // was lost. Keep the quote locked so the same payment is never sent twice.
      record.status = 'unknown';
      record.result = {
        status: 'unknown', quoteId: record.quoteId, task: record.task,
        provider: 'Sniffer Risk Check', receipt: {
          paymentId: record.paymentId, status: 'unknown', network: option.network,
          asset: option.asset, payTo: option.payTo, tokenSymbol: option.tokenSymbol,
          amountHuman: option.amountHuman, amountCents: option.amountCents,
        },
        warning: 'Payment execution ended without a definitive receipt. Check local wallet or provider status before any new attempt.',
      };
      return json(504, record.result);
    }
  }

  async function status(request) {
    if (request.method !== 'GET') return json(405, { error: 'Method not allowed.' });
    const quoteId = new URL(request.url).searchParams.get('quoteId');
    if (!quoteId || quoteId.length > 100) return json(400, { error: 'A quote ID is required.' });
    const record = quotes.get(quoteId);
    if (!record) return json(200, { status: 'unknown', message: 'This local process no longer has the quote record. Do not retry the payment based on this result.' });
    return json(200, {
      status: record.status,
      ...(record.result ? { result: record.result } : {}),
      ...(record.status === 'unknown' ? { message: 'The payment result is still unresolved. Do not retry this quote.' } : {}),
    });
  }

  return { quote, pay, status };
}

export { SNIFFER_ENDPOINT };
