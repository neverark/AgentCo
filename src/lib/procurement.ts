/**
 * A local, deterministic simulation. This module has no wallet, network,
 * signing, or payment integrations. Every service observation is synthetic.
 */
export type Policy = 'economy' | 'balanced' | 'assurance';
export type Scenario = 'success' | 'disagreement' | 'timeout';

export interface Task {
  chain: 'X Layer' | 'Ethereum' | 'Base';
  tokenAddress: string;
  tokenSymbol: string;
  budgetCents: number;
  deadlineSeconds: number;
  policy: Policy;
  scenario: Scenario;
}

export interface Provider {
  id: string;
  name: string;
  tagline: string;
  role: 'analyst' | 'verifier';
  priceCents: number;
  latencySeconds: number;
  accepted: number;
  samples: number;
  marketRating: number;
  accent: string;
  initials: string;
  capabilities: string[];
  source: 'simulated';
}

export interface Plan {
  id: string;
  policy: Policy;
  primaryIds: string[];
  verifierId: string | null;
  fallbackId: string | null;
  expectedCents: number;
  worstCaseCents: number;
  estimatedSeconds: number;
  feasible: boolean;
  reason: string;
  blockedReason: string | null;
  selectionReasons: Record<string, string>;
}

export interface Evidence {
  id: string;
  label: string;
  status: 'passed' | 'failed' | 'unverified';
  observed: string;
  reference: string;
  source: string;
}

export interface RunFrame {
  id: string;
  kind: 'planning' | 'reserved' | 'payment' | 'response' | 'verification' | 'fallback' | 'completed' | 'failed' | 'blocked';
  title: string;
  detail: string;
  providerId?: string;
  spentCents: number;
  reservedCents: number;
  availableCents: number;
  progress: number;
  evidence?: Evidence[];
}

export interface ProviderObservation {
  providerId: string;
  accepted: boolean;
  latencySeconds: number;
}

export interface Run {
  id: string;
  source?: 'sample' | 'live';
  task: Task;
  plan: Plan;
  createdAt: string;
  frames: RunFrame[];
  finalStatus: 'completed' | 'failed' | 'blocked';
  totalCents: number;
  observations: ProviderObservation[];
  providerResult?: unknown;
  marketSnapshot?: unknown;
  paymentReceipt?: {
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
  };
}

export const SIMULATION_TIMESTAMP = '2026-09-20T09:41:00.000Z';
export const MAX_FALLBACKS = 1;

export const PROVIDERS: Provider[] = [
  {
    id: 'scout', name: 'Scout', tagline: 'A quick first look, for less.',
    role: 'analyst', priceCents: 6, latencySeconds: 4,
    accepted: 12, samples: 18, marketRating: 4.9,
    accent: '#bd5c36', initials: 'Sc',
    capabilities: ['Token identity', 'Liquidity', 'Holder concentration'], source: 'simulated',
  },
  {
    id: 'sentinel', name: 'Sentinel', tagline: 'Consistent research. Measured results.',
    role: 'analyst', priceCents: 20, latencySeconds: 10,
    accepted: 47, samples: 50, marketRating: 4.8,
    accent: '#5268d8', initials: 'Se',
    capabilities: ['Token identity', 'Liquidity', 'Holder concentration'], source: 'simulated',
  },
  {
    id: 'atlas', name: 'Atlas', tagline: 'A capable second opinion.',
    role: 'analyst', priceCents: 14, latencySeconds: 7,
    accepted: 31, samples: 36, marketRating: 4.7,
    accent: '#558370', initials: 'At',
    capabilities: ['Token identity', 'Liquidity', 'Holder concentration'], source: 'simulated',
  },
  {
    id: 'lens', name: 'Lens', tagline: 'Check the facts behind the answer.',
    role: 'verifier', priceCents: 2, latencySeconds: 3,
    accepted: 64, samples: 66, marketRating: 4.9,
    accent: '#8665ad', initials: 'Le',
    capabilities: ['Identity check', 'Freshness check', 'Fact comparison'], source: 'simulated',
  },
];

export const DEFAULT_TASK: Task = {
  chain: 'Base',
  tokenAddress: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
  tokenSymbol: 'AERO',
  budgetCents: 50,
  deadlineSeconds: 45,
  policy: 'balanced',
  scenario: 'success',
};

const POLICIES: Policy[] = ['economy', 'balanced', 'assurance'];
const RECONCILIATION_SECONDS = 2;
const SCHEMA_CHECK_SECONDS = 1;

/** Integer cents stay integers throughout planning and execution. */
export function formatMoney(cents: number): string {
  if (!Number.isSafeInteger(cents)) return '—';
  const absolute = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

export function acceptanceRate(provider: Provider): number {
  return provider.samples > 0 ? provider.accepted / provider.samples : 0;
}

/** Wilson lower bound prevents a tiny perfect sample beating reliable history. */
export function reliabilityScore(provider: Provider): number {
  if (provider.samples <= 0) return 0;
  const z = 1.96;
  const n = provider.samples;
  const p = acceptanceRate(provider);
  return (p + z * z / (2 * n) - z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)) / (1 + z * z / n);
}

export function getProvider(id: string, profiles: Provider[] = PROVIDERS): Provider | undefined {
  return profiles.find((provider) => provider.id === id);
}

/** History may update observed performance; the fixture catalog fixes prices. */
function catalogWithHistory(profiles: Provider[]): Provider[] {
  return PROVIDERS.map((seed) => {
    const profile = getProvider(seed.id, profiles);
    const valid = profile && Number.isSafeInteger(profile.samples) && profile.samples >= 0
      && Number.isSafeInteger(profile.accepted) && profile.accepted >= 0 && profile.accepted <= profile.samples;
    return { ...seed, capabilities: [...seed.capabilities], ...(valid ? { samples: profile.samples, accepted: profile.accepted } : {}) };
  });
}

export function applyRunHistory(runs: Run[]): Provider[] {
  const profiles = catalogWithHistory(PROVIDERS);
  const seen = new Set<string>();
  for (const run of runs) {
    if (seen.has(run.id)) continue;
    seen.add(run.id);
    for (const observation of run.observations) {
      const provider = getProvider(observation.providerId, profiles);
      if (!provider) continue;
      provider.samples += 1;
      if (observation.accepted) provider.accepted += 1;
    }
  }
  return profiles;
}

export function validateTask(task: Task): string | null {
  if (!['Base', 'Ethereum', 'X Layer'].includes(task.chain)) return 'Choose a supported EVM chain.';
  if (typeof task.tokenAddress !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(task.tokenAddress.trim())
    || /^0x0{40}$/i.test(task.tokenAddress.trim())) return 'Enter a nonzero EVM token address (0x and 40 hexadecimal characters).';
  if (!Number.isSafeInteger(task.budgetCents) || task.budgetCents <= 0) return 'Budget must be a positive, whole number of cents.';
  if (!Number.isSafeInteger(task.deadlineSeconds) || task.deadlineSeconds <= 0) return 'Deadline must be a positive, whole number of seconds.';
  if (!POLICIES.includes(task.policy)) return 'Choose a supported procurement policy.';
  if (!['success', 'disagreement', 'timeout'].includes(task.scenario)) return 'Choose a supported demo scenario.';
  return null;
}

function unavailable(policy: Policy, reason: string): Plan {
  return {
    id: `plan-${policy}`, policy, primaryIds: [], verifierId: null, fallbackId: null,
    expectedCents: 0, worstCaseCents: 0, estimatedSeconds: 0, feasible: false,
    reason: 'No service will be called until this plan is feasible.', blockedReason: reason, selectionReasons: {},
  };
}

function qualityOrder(a: Provider, b: Provider): number {
  return reliabilityScore(b) - reliabilityScore(a) || a.priceCents - b.priceCents || a.id.localeCompare(b.id);
}

function primarySeconds(providers: Provider[], verifier: Provider | null): number {
  return Math.max(...providers.map((provider) => provider.latencySeconds))
    + (verifier?.latencySeconds ?? SCHEMA_CHECK_SECONDS) + RECONCILIATION_SECONDS;
}

function makePlan(task: Task, policy: Policy, catalog: Provider[]): Plan {
  const validationError = validateTask(task);
  if (validationError) return unavailable(policy, validationError);
  const analysts = catalog.filter((provider) => provider.role === 'analyst').sort(qualityOrder);
  const verifier = catalog.find((provider) => provider.role === 'verifier')!;
  let selected: Provider[] | undefined;
  const externalVerifier = policy === 'economy' ? null : verifier;

  if (policy === 'assurance') {
    const pairs = analysts.flatMap((provider, index) => analysts.slice(index + 1).map((second) => [provider, second]));
    pairs.sort((a, b) => b.reduce((sum, item) => sum + reliabilityScore(item), 0) - a.reduce((sum, item) => sum + reliabilityScore(item), 0));
    selected = pairs.find((pair) => pair.reduce((sum, provider) => sum + provider.priceCents, verifier.priceCents) <= task.budgetCents
      && primarySeconds(pair, verifier) <= task.deadlineSeconds);
  } else {
    const candidates = policy === 'economy'
      ? [...analysts].sort((a, b) => a.priceCents - b.priceCents || qualityOrder(a, b)) : analysts;
    const primary = candidates.find((provider) => provider.priceCents + (externalVerifier?.priceCents ?? 0) <= task.budgetCents
      && primarySeconds([provider], externalVerifier) <= task.deadlineSeconds);
    if (primary) selected = [primary];
  }

  if (!selected) {
    const requirements = policy === 'economy' ? 'one analysis plus a schema check'
      : policy === 'balanced' ? 'one analysis plus independent verification'
      : 'two analysis sources plus independent verification';
    return unavailable(policy, `The ${formatMoney(task.budgetCents)} USDT budget and ${task.deadlineSeconds}s deadline cannot cover ${requirements}. Increase the budget or deadline.`);
  }

  const expectedCents = selected.reduce((sum, provider) => sum + provider.priceCents, externalVerifier?.priceCents ?? 0);
  const baseSeconds = primarySeconds(selected, externalVerifier);
  const fallback = policy === 'economy' ? undefined : analysts.find((provider) => !selected.some((primary) => primary.id === provider.id)
    && expectedCents + provider.priceCents + verifier.priceCents <= task.budgetCents
    && baseSeconds + provider.latencySeconds + verifier.latencySeconds <= task.deadlineSeconds);
  const worstCaseCents = expectedCents + (fallback ? fallback.priceCents + verifier.priceCents : 0);
  const estimatedSeconds = baseSeconds + (fallback ? fallback.latencySeconds + verifier.latencySeconds : 0);
  const selectionReasons: Record<string, string> = {};
  for (const provider of catalog) {
    if (selected.some((primary) => primary.id === provider.id)) {
      selectionReasons[provider.id] = policy === 'economy'
        ? `Lowest eligible price at ${formatMoney(provider.priceCents)} USDT. ${provider.accepted}/${provider.samples} accepted synthetic runs; independent facts remain unverified.`
        : `${provider.accepted}/${provider.samples} accepted synthetic runs; ${Math.round(reliabilityScore(provider) * 100)}% conservative reliability score. Fits the budget and deadline.`;
    } else if (provider.id === externalVerifier?.id) {
      selectionReasons[provider.id] = 'Separate synthetic reference fixtures check identity, freshness, liquidity, and holder concentration. This does not prove real-world source independence.';
    } else if (provider.id === fallback?.id) {
      selectionReasons[provider.id] = `One fallback only. ${formatMoney(provider.priceCents + verifier.priceCents)} USDT reserved, including repeat verification.`;
    } else if (provider.role === 'verifier') {
      selectionReasons[provider.id] = 'Economy includes a local schema check only; external verification is not purchased.';
    } else {
      const eligibleAlone = provider.priceCents + (externalVerifier?.priceCents ?? 0) <= task.budgetCents
        && primarySeconds([provider], externalVerifier) <= task.deadlineSeconds;
      selectionReasons[provider.id] = !eligibleAlone ? 'Does not fit this budget and deadline.'
        : policy === 'economy' ? 'Costs more than the lowest eligible provider.'
          : 'A stronger measured history was selected, or no additional full verification path fits the remaining budget and time.';
    }
  }
  const reason = policy === 'economy'
    ? `${selected[0].name} is the lowest-cost eligible provider. Schema validation only; no automatic fallback.`
    : `${selected.map((provider) => provider.name).join(' + ')} ${selected.length === 1 ? 'has' : 'have'} the strongest eligible measured history. Lens checks the evidence. ${fallback ? `${fallback.name} is reserved for one verified fallback.` : 'No fallback fits the remaining budget and deadline.'}`;
  return {
    id: `plan-${policy}`, policy, primaryIds: selected.map((provider) => provider.id), verifierId: externalVerifier?.id ?? null,
    fallbackId: fallback?.id ?? null, expectedCents, worstCaseCents, estimatedSeconds, feasible: true,
    reason, blockedReason: null, selectionReasons,
  };
}

export function getPlans(task: Task, providerProfiles: Provider[] = PROVIDERS): Plan[] {
  const catalog = catalogWithHistory(providerProfiles);
  return POLICIES.map((policy) => makePlan(task, policy, catalog));
}

export function selectPlan(task: Task, providerProfiles: Provider[] = PROVIDERS): Plan {
  const plans = getPlans(task, providerProfiles);
  return plans.find((plan) => plan.policy === task.policy) ?? unavailable('economy', validateTask(task) ?? 'Unknown policy.');
}

function evidenceFor(task: Task, primaryIds: string[], verified: boolean, mismatch: boolean): Evidence[] {
  const analystNames = primaryIds.map((id) => getProvider(id)!.name).join(' + ');
  const source = verified ? `${analystNames} × Lens · simulated fixtures` : `${analystNames} · simulated response`;
  const evidence: Evidence[] = [
    {
      id: 'identity', label: 'Token identity', status: !verified && mismatch ? 'failed' : 'passed',
      observed: !verified && mismatch ? 'Returned address differs from requested token' : `${task.tokenSymbol || 'TOKEN'} · ${task.chain}`,
      reference: task.tokenAddress.trim(), source,
    },
    {
      id: 'freshness', label: 'Snapshot freshness', status: 'passed', observed: '12 seconds before the fixture clock',
      reference: `Fixture clock: ${SIMULATION_TIMESTAMP}`, source,
    },
    {
      id: 'liquidity', label: 'Liquidity depth', status: !verified ? 'unverified' : mismatch ? 'failed' : 'passed',
      observed: mismatch ? '$2,940,000' : '$1,284,600',
      reference: verified ? '$1,276,400 · 2% tolerance' : 'No independent comparison purchased', source,
    },
    {
      id: 'concentration', label: 'Top 10 holder share', status: verified ? 'passed' : 'unverified', observed: '23.7%',
      reference: verified ? '23.5% · 2 percentage-point tolerance' : 'No independent comparison purchased', source,
    },
    {
      id: 'contract', label: 'Contract security audit', status: 'unverified', observed: 'Outside this snapshot',
      reference: 'Evidence agreement is not a token safety guarantee', source: 'Not assessed',
    },
  ];
  if (primaryIds.length > 1) evidence.splice(4, 0, {
    id: 'agreement', label: 'Cross-source agreement', status: mismatch ? 'failed' : 'passed',
    observed: mismatch ? 'The two analysis responses disagree' : 'Two analysis responses agree within tolerance',
    reference: 'Separate demo fixtures; real source independence is unproven', source,
  });
  return evidence;
}

function executionSignature(plan: Plan): string {
  return JSON.stringify([plan.policy, plan.primaryIds, plan.verifierId, plan.fallbackId, plan.expectedCents, plan.worstCaseCents, plan.estimatedSeconds, plan.feasible]);
}

export function buildRun(task: Task, plan: Plan, runId: string, providerProfiles: Provider[] = PROVIDERS): Run {
  const catalog = catalogWithHistory(providerProfiles);
  const selectedPlan = selectPlan(task, catalog);
  const malformedBudget = !Number.isSafeInteger(task.budgetCents) || task.budgetCents < 0;
  // A blocked malformed budget cannot be represented as spendable ledger money.
  const runTask: Task = { ...task, budgetCents: malformedBudget ? 0 : task.budgetCents };
  const budget = runTask.budgetCents;
  const frames: RunFrame[] = [];
  const observations: ProviderObservation[] = [];
  let spentCents = 0;
  let reservedCents = 0;
  let finalStatus: Run['finalStatus'] = 'blocked';

  function frame(kind: RunFrame['kind'], title: string, detail: string, providerId?: string, evidence?: Evidence[]) {
    frames.push({
      id: `${runId}-${frames.length + 1}`, kind, title, detail,
      ...(providerId ? { providerId } : {}), ...(evidence ? { evidence } : {}),
      spentCents, reservedCents, availableCents: budget - spentCents - reservedCents, progress: 0,
    });
  }

  function finish(): Run {
    frames.forEach((item, index) => { item.progress = frames.length === 1 ? 100 : Math.round(index / (frames.length - 1) * 100); });
    return {
      id: runId, source: 'sample', task: runTask, plan: selectedPlan, createdAt: SIMULATION_TIMESTAMP,
      frames, finalStatus, totalCents: spentCents, observations,
    };
  }

  const error = validateTask(task) ?? (!selectedPlan.feasible ? selectedPlan.blockedReason : null)
    ?? (executionSignature(plan) !== executionSignature(selectedPlan) ? 'The previewed plan no longer matches this task. Review the current plan before running.' : null);
  if (error) {
    frame('blocked', 'Plan needs attention', error);
    return finish();
  }

  function pay(provider: Provider, invocation: string) {
    // Only the internally recomputed plan is executable, and each authorized
    // invocation is paid once. There is no external side effect here.
    if (provider.priceCents > reservedCents) throw new Error('Simulation tried to exceed its reservation.');
    spentCents += provider.priceCents;
    reservedCents -= provider.priceCents;
    frame('payment', `${provider.name} · ${formatMoney(provider.priceCents)} USDT`,
      `Simulated receipt ${invocation}. This is a local ledger entry; no funds move.`, provider.id);
  }

  function response(provider: Provider, invocation: string, recover: boolean) {
    if (recover) {
      frame('response', 'Response timeout · receipt retained',
        `The response for ${invocation} was lost after its simulated payment. Hold the existing reservation while checking this same invocation.`, provider.id);
      frame('response', 'Original invocation reconciled',
        `Recovered the result for ${invocation}. The existing receipt is reused; no second payment or new invocation.`, provider.id);
    }
    frame('response', `${provider.name} returned a snapshot`,
      `Synthetic ${task.tokenSymbol || 'token'} analysis received for ${task.chain}. Delivery alone does not mean the result is accepted.`, provider.id);
  }

  function check(ids: string[], mismatch: boolean, phase: string): Evidence[] {
    const verifier = selectedPlan.verifierId ? getProvider(selectedPlan.verifierId, catalog)! : null;
    if (verifier) {
      pay(verifier, `${runId}:${phase}:verify`);
      observations.push({ providerId: verifier.id, accepted: true, latencySeconds: verifier.latencySeconds });
    }
    for (const [index, id] of ids.entries()) {
      // Rechecking a retained assurance result is not a new service delivery.
      if (phase === 'fallback' && selectedPlan.primaryIds.includes(id)) continue;
      const provider = getProvider(id, catalog)!;
      observations.push({
        providerId: id, accepted: !mismatch || index > 0,
        latencySeconds: provider.latencySeconds + (task.scenario === 'timeout' && phase === 'primary' && index === 0 ? RECONCILIATION_SECONDS : 0),
      });
    }
    const evidence = evidenceFor(task, ids, Boolean(verifier), mismatch);
    frame('verification', mismatch ? (verifier ? 'Evidence disagreement detected' : 'Schema check rejected the response')
      : verifier ? 'Evidence checks passed' : 'Schema check passed',
    mismatch ? (verifier ? 'Liquidity exceeds the reference tolerance. The first analysis is rejected; a paid response is not automatically a valid result.'
      : 'The returned token identity does not match the requested address. Economy has no independently verified fallback.')
      : verifier ? 'Identity, freshness, liquidity, and concentration match synthetic reference fixtures. Contract security is outside this check.'
        : 'Required fields and token identity match. Liquidity and concentration have not been independently verified.',
    verifier?.id ?? ids[0], evidence);
    return evidence;
  }

  frame('planning', 'A plan with a spending ceiling', selectedPlan.reason);
  reservedCents = selectedPlan.worstCaseCents;
  frame('reserved', `${formatMoney(reservedCents)} USDT reserved`,
    `${formatMoney(selectedPlan.expectedCents)} USDT expected. ${selectedPlan.fallbackId ? 'The ceiling includes one fallback and repeat verification.' : 'No automatic fallback is authorized.'} Local reservation only.`);

  for (const [index, id] of selectedPlan.primaryIds.entries()) {
    const provider = getProvider(id, catalog)!;
    const invocation = `${runId}:primary:${id}`;
    pay(provider, invocation);
    response(provider, invocation, task.scenario === 'timeout' && index === 0);
  }

  const mismatch = task.scenario === 'disagreement';
  let finalEvidence = check(selectedPlan.primaryIds, mismatch, 'primary');
  if (mismatch && !selectedPlan.fallbackId) {
    reservedCents = 0;
    finalStatus = 'failed';
    frame('failed', 'Stopped at the quality gate',
      `${formatMoney(spentCents)} USDT was used in the simulated ledger. No approved fallback fits this plan; unused reservations are released.`, undefined, finalEvidence);
    return finish();
  }

  if (mismatch && selectedPlan.fallbackId) {
    const fallback = getProvider(selectedPlan.fallbackId, catalog)!;
    frame('fallback', `Fallback 1 of ${MAX_FALLBACKS} · ${fallback.name}`,
      'The rejected first analysis is replaced within the pre-approved ceiling. Repeat verification is already reserved.', fallback.id);
    const invocation = `${runId}:fallback:${fallback.id}`;
    pay(fallback, invocation);
    response(fallback, invocation, false);
    const retainedIds = selectedPlan.primaryIds.slice(1);
    finalEvidence = check([fallback.id, ...retainedIds], false, 'fallback');
  }

  const releasedCents = reservedCents;
  reservedCents = 0;
  finalStatus = 'completed';
  frame('completed', selectedPlan.verifierId ? 'Snapshot ready · evidence attached' : 'Snapshot ready · limited verification',
    `${formatMoney(spentCents)} USDT used; ${formatMoney(releasedCents)} USDT of unused reservation released. All amounts and evidence are simulated. Releasing a reservation is not an onchain refund.`,
    undefined, finalEvidence);
  return finish();
}
