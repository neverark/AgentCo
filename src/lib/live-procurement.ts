import type { Evidence, Plan, Run, Task } from './procurement.ts';

export interface TokenMarketSnapshot {
  source: string;
  chain: string;
  tokenAddress: string;
  price: string;
  marketCap: string;
  priceChange24H: string;
  volume24H: string;
  transactions24H: string;
  liquidity: string;
  holders: string;
  timestamp: string;
  checkedAt: string;
}

export interface SnifferPaymentReceipt {
  paymentId: string;
  status: 'success' | 'pending' | 'failed' | 'unknown';
  transaction?: string;
  network: string;
  asset: string;
  payTo: string;
  tokenSymbol: string;
  amountHuman: number;
  amountCents: number;
  payer?: string;
}

export interface SnifferPaymentResult {
  status: 'success' | 'pending' | 'failed' | 'unknown';
  quoteId: string;
  task: Task;
  provider: string;
  providerResult: unknown;
  receipt: SnifferPaymentReceipt;
  completedAt: string;
  warning?: string;
}

function evidence(task: Task, market: TokenMarketSnapshot, providerResult: unknown): Evidence[] {
  const timestamp = Number(market.timestamp);
  const ageMs = Date.now() - timestamp;
  const fresh = Number.isFinite(timestamp) && ageMs >= -60_000 && ageMs <= 5 * 60_000;
  const verdict = providerVerdict(providerResult);
  return [
    {
      id: 'identity', label: 'Token identity', status: market.tokenAddress.toLowerCase() === task.tokenAddress.toLowerCase() ? 'passed' : 'failed',
      observed: `${market.tokenAddress} · ${market.chain}`, reference: task.tokenAddress.toLowerCase(), source: market.source,
    },
    {
      id: 'provider-risk', label: 'Sniffer risk assessment', status: 'unverified',
      observed: verdict || 'Provider returned a response; inspect its original findings below.',
      reference: 'Single provider opinion; not an audit or independent verification', source: 'Sniffer Risk Check · OKX.AI Agent 6149',
    },
    {
      id: 'market-freshness', label: 'Market snapshot freshness', status: fresh ? 'passed' : 'failed',
      observed: Number.isFinite(timestamp) ? `${Math.max(0, Math.round(ageMs / 1000))} seconds old` : 'Provider timestamp was invalid',
      reference: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : market.timestamp, source: market.source,
    },
    {
      id: 'market-price', label: 'Token price', status: 'unverified', observed: `$${market.price}`,
      reference: `24h change ${market.priceChange24H}% · market cap $${market.marketCap}`, source: market.source,
    },
    {
      id: 'market-liquidity', label: 'Pool liquidity', status: 'unverified', observed: `$${market.liquidity}`,
      reference: 'Market API aggregate; pool composition is not included in this snapshot', source: market.source,
    },
    {
      id: 'market-activity', label: '24h trading activity', status: 'unverified',
      observed: `$${market.volume24H} volume · ${market.transactions24H} transactions`,
      reference: `${market.holders} holder addresses`, source: market.source,
    },
    {
      id: 'contract-audit', label: 'Contract security audit', status: 'unverified', observed: 'Outside this live snapshot',
      reference: 'Provider signals and market metrics do not constitute a contract audit', source: 'Not assessed',
    },
  ];
}

function providerVerdict(value: unknown): string | undefined {
  if (typeof value === 'string') return value.slice(0, 800);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const fields = ['verdict', 'riskLevel', 'risk', 'assessment', 'summary', 'message', 'result'];
  const found = fields.flatMap((key) => typeof row[key] === 'string' ? [`${key}: ${row[key]}`] : []);
  return found.join(' · ').slice(0, 800) || undefined;
}

export function createLiveRun(task: Task, market: TokenMarketSnapshot, result: SnifferPaymentResult, now = new Date()): Run {
  const id = `AC-LIVE-${now.getTime().toString(36).toUpperCase()}`;
  const paid = result.receipt.status === 'success';
  const amountCents = paid ? result.receipt.amountCents : 0;
  const providerReceived = result.providerResult !== null && result.providerResult !== undefined;
  const completed = result.status === 'success' && providerReceived;
  const pending = result.status === 'pending' || result.status === 'unknown';
  const plan: Plan = {
    id: `live-${result.quoteId}`,
    policy: task.policy,
    primaryIds: ['sniffer-risk-check'],
    verifierId: 'onchain-os-market',
    fallbackId: null,
    expectedCents: result.receipt.amountCents,
    worstCaseCents: result.receipt.amountCents,
    estimatedSeconds: 0,
    feasible: true,
    reason: 'Sniffer Risk Check supplied the live assessment; OKX Onchain OS Market data supplies the separate price, liquidity, and activity snapshot.',
    blockedReason: null,
    selectionReasons: {
      'sniffer-risk-check': 'Live provider result returned for the requested chain and token address.',
      'onchain-os-market': 'Live Onchain OS Market data was returned for the same chain and token address.',
    },
  };
  const entries: Run['frames'] = [];
  let spentCents = 0;
  let reservedCents = 0;
  function frame(kind: Run['frames'][number]['kind'], title: string, detail: string, evidenceItems?: Evidence[]) {
    entries.push({
      id: `${id}-${entries.length + 1}`, kind, title, detail,
      spentCents, reservedCents, availableCents: Math.max(0, task.budgetCents - spentCents - reservedCents), progress: 0,
      ...(evidenceItems ? { evidence: evidenceItems } : {}),
    });
  }
  frame('planning', 'Live providers selected', 'The quote bound the Sniffer call to this task’s chain and token contract. Market data was fetched before any payment approval.');
  reservedCents = result.receipt.amountCents;
  frame('reserved', `${result.receipt.amountHuman.toFixed(2)} ${result.receipt.tokenSymbol} approved`, `The quoted amount was within the ${ (task.budgetCents / 100).toFixed(2) } USDT task budget and configured per-call cap.`);
  reservedCents = 0;
  spentCents = amountCents;
  frame('payment', `${result.receipt.amountHuman.toFixed(2)} ${result.receipt.tokenSymbol} · ${result.receipt.status}`, result.receipt.transaction
    ? `Onchain OS returned transaction ${result.receipt.transaction}. Payment ID ${result.receipt.paymentId}.`
    : `Payment ID ${result.receipt.paymentId}; ${result.receipt.status === 'success' ? 'receipt returned without a transaction hash.' : 'settlement remains unresolved.'}`);
  if (providerReceived) frame('response', 'Sniffer returned a live risk response', 'Provider response is retained in the report with its original fields. Delivery does not independently prove the findings.');
  if (completed) frame('verification', 'Market evidence attached', 'Token identity, snapshot freshness, price, liquidity, trading activity, and the single-provider limitation are recorded.', evidence(task, market, result.providerResult));
  if (completed) frame('completed', 'Live risk snapshot ready', 'Live Sniffer assessment and Onchain OS market data are attached to this run.');
  else if (pending) frame('blocked', 'Payment status needs reconciliation', result.warning || 'The wallet did not return a final payment state. Do not repeat this quote.');
  else frame('failed', 'Live provider run did not complete', result.warning || 'The paid provider returned no usable result. The payment receipt, if any, is retained.');
  entries.forEach((item, index) => { item.progress = entries.length === 1 ? 100 : Math.round(index / (entries.length - 1) * 100); });
  return {
    id,
    source: 'live',
    task: { ...task, tokenAddress: task.tokenAddress.toLowerCase() },
    plan,
    createdAt: result.completedAt || now.toISOString(),
    frames: entries,
    finalStatus: completed ? 'completed' : pending ? 'blocked' : 'failed',
    totalCents: amountCents,
    observations: [],
    providerResult: result.providerResult,
    marketSnapshot: market,
    paymentReceipt: result.receipt,
  };
}

export function isTaskEqual(a: Task, b: Partial<Task>): boolean {
  return a.chain === b.chain && typeof b.tokenAddress === 'string' && a.tokenAddress.toLowerCase() === b.tokenAddress.toLowerCase()
    && a.budgetCents === b.budgetCents && (b.policy === undefined || a.policy === b.policy);
}
