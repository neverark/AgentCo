import type { Run } from './procurement.ts';
import { PROVIDERS } from './procurement.ts';

export const AGENTLEDGER = {
  agentId: '11336',
  serviceId: '40038',
  name: 'AgentLedger Financial Health',
  listingUrl: 'https://www.okx.ai/agents/11336',
  directEndpoint: 'https://agentledger-one.vercel.app/api/company-health',
  proxyPath: '/api/agentledger/company-health',
} as const;

export interface AgentLedgerProviderUsage {
  provider: string;
  spend: number;
  transactions: number;
}

export interface AgentLedgerPayload {
  source: 'provided_state';
  financialState: {
    periodDays: 30;
    cashFlow: { inflows: 0; outflows: number };
    providers: AgentLedgerProviderUsage[];
  };
  monthlyBudget: number;
}

export interface AgentLedgerSummary {
  payload: AgentLedgerPayload;
  runCount: number;
  totalBudget: number;
  totalSpend: number;
  totalTransactions: number;
}

export interface AgentLedgerInsight {
  type: 'budget_utilization' | 'counterparty_concentration';
  severity?: string;
  title?: string;
  message?: string;
  metric?: number;
}

export interface AgentLedgerAssessment {
  service?: string;
  analysisVersion?: string;
  dataSource?: string;
  stateVerification?: string;
  currency?: string;
  generatedAt?: string;
  budget?: {
    limit?: number;
    used?: number;
    usedPct?: number;
    remaining?: number;
    periodDays?: number;
  };
  topCounterparties: Array<{
    address?: string;
    spend?: number;
    transactions?: number;
    shareOfSpendPct?: number;
  }>;
  insights: AgentLedgerInsight[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Keep only the service response fields supported by the supplied synthetic ledger. */
export function readAgentLedgerAssessment(value: unknown): AgentLedgerAssessment {
  if (!isRecord(value)) throw new Error('AgentLedger returned an unexpected response.');
  const body = isRecord(value.data) ? { ...value, ...value.data } : value;
  const budget = isRecord(body.budget) ? body.budget : undefined;
  if (typeof body.service !== 'string' || !body.service.toLowerCase().includes('agentledger')
    || !budget || ['limit', 'used', 'usedPct', 'remaining'].some((field) => finiteNumber(budget[field]) === undefined)) {
    throw new Error('The endpoint response did not match AgentLedger Financial Health. No assessment was displayed.');
  }
  const counterpartyRows = Array.isArray(body.topCounterparties) ? body.topCounterparties : [];
  const insightRows = Array.isArray(body.insights) ? body.insights : [];
  const topCounterparties = counterpartyRows.slice(0, 5).filter(isRecord).map((item) => ({
    ...(typeof item.address === 'string' ? { address: item.address.slice(0, 100) } : {}),
    ...(finiteNumber(item.spend) !== undefined ? { spend: finiteNumber(item.spend) } : {}),
    ...(finiteNumber(item.transactions) !== undefined ? { transactions: finiteNumber(item.transactions) } : {}),
    ...(finiteNumber(item.shareOfSpendPct) !== undefined ? { shareOfSpendPct: finiteNumber(item.shareOfSpendPct) } : {}),
  }));
  const insights = insightRows.filter(isRecord)
    .filter((item): item is Record<string, unknown> & { type: AgentLedgerInsight['type'] } =>
      item.type === 'budget_utilization' || item.type === 'counterparty_concentration')
    .map((item) => ({
      type: item.type,
      ...(typeof item.severity === 'string' ? { severity: item.severity.slice(0, 30) } : {}),
      ...(typeof item.title === 'string' ? { title: item.title.slice(0, 120) } : {}),
      ...(typeof item.message === 'string' ? { message: item.message.slice(0, 500) } : {}),
      ...(finiteNumber(item.metric) !== undefined ? { metric: finiteNumber(item.metric) } : {}),
    }));

  return {
    ...(typeof body.service === 'string' ? { service: body.service.slice(0, 100) } : {}),
    ...(typeof body.analysisVersion === 'string' ? { analysisVersion: body.analysisVersion.slice(0, 30) } : {}),
    ...(typeof body.dataSource === 'string' ? { dataSource: body.dataSource.slice(0, 50) } : {}),
    ...(typeof body.stateVerification === 'string' ? { stateVerification: body.stateVerification.slice(0, 50) } : {}),
    ...(typeof body.currency === 'string' ? { currency: body.currency.slice(0, 10) } : {}),
    ...(typeof body.generatedAt === 'string' ? { generatedAt: body.generatedAt.slice(0, 50) } : {}),
    ...(budget ? { budget: {
      ...(finiteNumber(budget.limit) !== undefined ? { limit: finiteNumber(budget.limit) } : {}),
      ...(finiteNumber(budget.used) !== undefined ? { used: finiteNumber(budget.used) } : {}),
      ...(finiteNumber(budget.usedPct) !== undefined ? { usedPct: finiteNumber(budget.usedPct) } : {}),
      ...(finiteNumber(budget.remaining) !== undefined ? { remaining: finiteNumber(budget.remaining) } : {}),
      ...(finiteNumber(budget.periodDays) !== undefined ? { periodDays: finiteNumber(budget.periodDays) } : {}),
    } } : {}),
    topCounterparties,
    insights,
  };
}

function usdt(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

/**
 * Prepare a privacy-limited summary for the free AgentLedger service.
 * It includes only synthetic totals over the last 30 days; no token addresses,
 * symbols, run IDs, or journal events are sent.
 */
export function summarizeForAgentLedger(runs: Run[], now = Date.now()): AgentLedgerSummary {
  const start = now - 30 * 24 * 60 * 60 * 1000;
  const seenRunIds = new Set<string>();
  const eligible = runs.filter((run) => {
    if (!run || run.source === 'live' || typeof run.id !== 'string' || seenRunIds.has(run.id)) return false;
    seenRunIds.add(run.id);
    const createdAt = Date.parse(run.createdAt);
    return Number.isFinite(createdAt) && createdAt >= start && createdAt <= now
      && Number.isSafeInteger(run.task?.budgetCents) && run.task.budgetCents >= 0
      && run.task.budgetCents <= 100_000_000 && Array.isArray(run.frames);
  });

  const providerUsage = new Map<string, { spendCents: number; transactions: number }>();
  let totalSpendCents = 0;
  let totalBudgetCents = 0;

  for (const run of eligible) {
    totalBudgetCents += run.task.budgetCents;
    if (!Number.isSafeInteger(totalBudgetCents)) throw new Error('Synthetic budget total is too large to summarize safely.');

    let previousSpend = 0;
    const seenFrames = new Set<string>();
    for (const frame of run.frames) {
      if (!frame || typeof frame.id !== 'string' || seenFrames.has(frame.id)) continue;
      seenFrames.add(frame.id);
      if (!Number.isSafeInteger(frame.spentCents) || frame.spentCents < previousSpend) continue;

      if (frame.kind === 'payment' && typeof frame.providerId === 'string') {
        const delta = frame.spentCents - previousSpend;
        const provider = PROVIDERS.find((candidate) => candidate.id === frame.providerId);
        if (provider && delta > 0 && Number.isSafeInteger(delta)) {
          const current = providerUsage.get(provider.id) ?? { spendCents: 0, transactions: 0 };
          current.spendCents += delta;
          current.transactions += 1;
          providerUsage.set(provider.id, current);
          totalSpendCents += delta;
          if (!Number.isSafeInteger(totalSpendCents)) throw new Error('Synthetic spend total is too large to summarize safely.');
        }
      }
      previousSpend = frame.spentCents;
    }
  }

  const providers = [...providerUsage.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, usage]) => ({
      provider: `${PROVIDERS.find((candidate) => candidate.id === id)!.name} (synthetic)`,
      spend: usdt(usage.spendCents),
      transactions: usage.transactions,
    }));
  const totalBudget = usdt(totalBudgetCents);
  const totalSpend = usdt(totalSpendCents);

  return {
    runCount: eligible.length,
    totalBudget,
    totalSpend,
    totalTransactions: providers.reduce((sum, item) => sum + item.transactions, 0),
    payload: {
      source: 'provided_state',
      financialState: {
        periodDays: 30,
        // AgentCo has no income records. Never treat task budgets as cash income.
        cashFlow: { inflows: 0, outflows: totalSpend },
        providers,
      },
      monthlyBudget: totalBudget,
    },
  };
}
