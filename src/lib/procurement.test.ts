import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_TASK, PROVIDERS, applyRunHistory, buildRun, formatMoney, getPlans,
  getProvider, reliabilityScore, selectPlan,
} from './procurement.ts';
import type { Policy, Provider, Run, Scenario, Task } from './procurement.ts';

function task(overrides: Partial<Task> = {}): Task {
  return { ...DEFAULT_TASK, ...overrides };
}

function run(overrides: Partial<Task> = {}, id = 'test-run', profiles = PROVIDERS): Run {
  const input = task(overrides);
  return buildRun(input, selectPlan(input, profiles), id, profiles);
}

function assertLedger(result: Run) {
  let previousSpent = 0;
  let previousProgress = 0;
  const receipts = new Set<string>();
  for (const frame of result.frames) {
    for (const amount of [frame.spentCents, frame.reservedCents, frame.availableCents]) {
      assert.ok(Number.isSafeInteger(amount) && amount >= 0, `Invalid amount at ${frame.id}`);
    }
    assert.equal(frame.spentCents + frame.reservedCents + frame.availableCents, result.task.budgetCents);
    assert.ok(frame.spentCents >= previousSpent);
    assert.ok(frame.progress >= previousProgress && frame.progress <= 100);
    if (frame.kind === 'payment') {
      assert.equal(frame.spentCents - previousSpent, getProvider(frame.providerId!)!.priceCents);
      assert.ok(!receipts.has(frame.detail), 'An invocation must not be charged twice');
      receipts.add(frame.detail);
    } else {
      assert.equal(frame.spentCents, previousSpent, 'Only an explicit payment changes spend');
    }
    previousSpent = frame.spentCents;
    previousProgress = frame.progress;
  }
  const final = result.frames.at(-1)!;
  assert.equal(final.reservedCents, 0);
  assert.equal(final.progress, 100);
  assert.equal(final.spentCents, result.totalCents);
  assert.ok(result.totalCents <= result.plan.worstCaseCents);
  assert.ok(result.frames.filter((frame) => frame.kind === 'fallback').length <= 1);
}

describe('explainable plan selection', () => {
  it('shows materially different costs and verification coverage for the three policies', () => {
    const [economy, balanced, assurance] = getPlans(task());
    assert.deepEqual(economy.primaryIds, ['scout']);
    assert.equal(economy.verifierId, null);
    assert.equal(economy.fallbackId, null);
    assert.equal(economy.expectedCents, 6);
    assert.equal(economy.worstCaseCents, 6);
    assert.deepEqual(balanced.primaryIds, ['sentinel']);
    assert.equal(balanced.verifierId, 'lens');
    assert.equal(balanced.fallbackId, 'atlas');
    assert.equal(balanced.expectedCents, 22);
    assert.equal(balanced.worstCaseCents, 38);
    assert.deepEqual(assurance.primaryIds, ['sentinel', 'atlas']);
    assert.equal(assurance.fallbackId, 'scout');
    assert.equal(assurance.expectedCents, 36);
    assert.equal(assurance.worstCaseCents, 44);
    for (const plan of [economy, balanced, assurance]) {
      assert.ok(plan.feasible);
      assert.equal(Object.keys(plan.selectionReasons).length, PROVIDERS.length);
    }
  });

  it('adapts providers and fallback scope to the full budget instead of overspending', () => {
    assert.deepEqual(selectPlan(task({ budgetCents: 16 })).primaryIds, ['atlas']);
    assert.deepEqual(selectPlan(task({ budgetCents: 8 })).primaryIds, ['scout']);
    assert.equal(selectPlan(task({ budgetCents: 22 })).fallbackId, null);
    assert.equal(selectPlan(task({ budgetCents: 30 })).fallbackId, 'scout');
    assert.equal(selectPlan(task({ budgetCents: 38 })).fallbackId, 'atlas');
    const constrained = selectPlan(task({ policy: 'assurance', budgetCents: 22 }));
    assert.deepEqual(constrained.primaryIds, ['atlas', 'scout']);
    assert.equal(constrained.fallbackId, null);
    assert.equal(selectPlan(task({ policy: 'assurance', budgetCents: 21 })).feasible, false);
  });

  it('respects the whole permitted deadline, including reconciliation and any fallback', () => {
    assert.deepEqual(selectPlan(task({ deadlineSeconds: 14 })).primaryIds, ['atlas']);
    assert.deepEqual(selectPlan(task({ deadlineSeconds: 15 })).primaryIds, ['sentinel']);
    assert.equal(selectPlan(task({ deadlineSeconds: 24 })).fallbackId, 'scout');
    assert.equal(selectPlan(task({ deadlineSeconds: 25 })).fallbackId, 'atlas');
    assert.equal(selectPlan(task({ deadlineSeconds: 15 })).fallbackId, null);
    assert.equal(selectPlan(task({ deadlineSeconds: 11, policy: 'assurance' })).feasible, false);
    assert.equal(selectPlan(task({ deadlineSeconds: 6, policy: 'economy' })).feasible, false);
    assert.equal(selectPlan(task({ deadlineSeconds: 7, policy: 'economy' })).feasible, true);
  });

  it('uses measured history with sample-size confidence rather than market stars', () => {
    const sentinel = getProvider('sentinel')!;
    const scout = getProvider('scout')!;
    assert.ok(scout.marketRating > sentinel.marketRating);
    assert.ok(reliabilityScore(sentinel) > reliabilityScore(scout));
    const tinyPerfectSample: Provider = { ...scout, accepted: 1, samples: 1 };
    assert.ok(reliabilityScore(sentinel) > reliabilityScore(tinyPerfectSample));
    const profiles = PROVIDERS.map((provider) => provider.id === 'sentinel' ? { ...provider, accepted: 10 } : provider);
    assert.deepEqual(selectPlan(task(), profiles).primaryIds, ['atlas']);
    // Changing a session profile must never rewrite the fixed demo prices.
    const alteredPrices = profiles.map((provider) => ({ ...provider, priceCents: 0 }));
    assert.equal(selectPlan(task(), alteredPrices).expectedCents, 16);
  });
});

describe('execution and evidence', () => {
  it('keeps a balanced success at expected cost and releases the unused fallback reservation', () => {
    const result = run();
    assert.equal(result.finalStatus, 'completed');
    assert.equal(result.totalCents, 22);
    assert.equal(result.frames.find((frame) => frame.kind === 'reserved')!.reservedCents, 38);
    assert.equal(result.frames.at(-1)!.availableCents, 28);
    assert.equal(result.frames.at(-1)!.evidence!.find((item) => item.id === 'contract')!.status, 'unverified');
    assertLedger(result);
  });

  it('replaces a rejected result once and pays for both actual verification calls', () => {
    for (const policy of ['balanced', 'assurance'] as Policy[]) {
      const result = run({ policy, scenario: 'disagreement' });
      assert.equal(result.finalStatus, 'completed');
      assert.equal(result.totalCents, result.plan.worstCaseCents);
      assert.equal(result.frames.filter((frame) => frame.kind === 'fallback').length, 1);
      assert.equal(result.frames.filter((frame) => frame.kind === 'payment' && frame.providerId === 'lens').length, 2);
      assert.ok(result.frames.some((frame) => frame.evidence?.some((item) => item.status === 'failed')));
      assert.ok(!result.frames.at(-1)!.evidence!.some((item) => item.status === 'failed'));
      assert.equal(result.observations.filter((observation) => observation.providerId === 'sentinel' && !observation.accepted).length, 1);
      assert.equal(result.observations.filter((observation) => observation.providerId === 'atlas').length, 1);
      assertLedger(result);
    }
  });

  it('fails visibly without an affordable fallback and keeps already spent amounts', () => {
    const result = run({ scenario: 'disagreement', budgetCents: 22 });
    assert.equal(result.finalStatus, 'failed');
    assert.equal(result.totalCents, 22);
    assert.equal(result.frames.at(-1)!.kind, 'failed');
    assert.equal(result.frames.filter((frame) => frame.kind === 'fallback').length, 0);
    assertLedger(result);
  });

  it('limits economy to schema checks and makes unpurchased evidence explicit', () => {
    const result = run({ policy: 'economy' });
    assert.equal(result.totalCents, 6);
    assert.equal(result.frames.filter((frame) => frame.kind === 'payment').length, 1);
    const evidence = result.frames.at(-1)!.evidence!;
    assert.equal(evidence.find((item) => item.id === 'identity')!.status, 'passed');
    assert.equal(evidence.find((item) => item.id === 'liquidity')!.status, 'unverified');
    assert.equal(evidence.find((item) => item.id === 'concentration')!.status, 'unverified');
    assert.equal(run({ policy: 'economy', scenario: 'disagreement' }).finalStatus, 'failed');
  });

  it('reconciles a timed-out invocation with no duplicate purchase or history observation', () => {
    for (const policy of ['economy', 'balanced', 'assurance'] as Policy[]) {
      const success = run({ policy });
      const recovered = run({ policy, scenario: 'timeout' });
      assert.equal(recovered.finalStatus, 'completed');
      assert.equal(recovered.totalCents, success.totalCents);
      assert.equal(recovered.frames.filter((frame) => frame.kind === 'payment').length, success.frames.filter((frame) => frame.kind === 'payment').length);
      assert.equal(recovered.observations.length, success.observations.length);
      assert.ok(recovered.frames.some((frame) => frame.title === 'Original invocation reconciled'));
      assert.ok(recovered.frames.some((frame) => frame.detail.includes('no second payment')));
      assertLedger(recovered);
    }
  });

  it('is deterministic and does not mutate the input task, plan, or catalog', () => {
    const input = task();
    const plan = selectPlan(input);
    const before = JSON.stringify({ input, plan, providers: PROVIDERS });
    const first = buildRun(input, plan, 'same-run');
    assert.deepEqual(buildRun(input, plan, 'same-run'), first);
    assert.equal(JSON.stringify({ input, plan, providers: PROVIDERS }), before);
  });
});

describe('budget and input boundaries', () => {
  it('maintains integer ledger invariants across all policy/scenario combinations and budget/deadline boundaries', () => {
    const budgets = [1, 5, 6, 7, 8, 15, 16, 19, 20, 21, 22, 23, 29, 30, 35, 36, 37, 38, 43, 44, 50, 100, 1000];
    const deadlines = [1, 6, 7, 8, 9, 11, 12, 14, 15, 17, 20, 22, 25, 45];
    for (const policy of ['economy', 'balanced', 'assurance'] as Policy[]) {
      for (const scenario of ['success', 'disagreement', 'timeout'] as Scenario[]) {
        for (const budgetCents of budgets) {
          for (const deadlineSeconds of deadlines) {
            const result = run({ policy, scenario, budgetCents, deadlineSeconds });
            assertLedger(result);
            if (result.plan.feasible) {
              assert.ok(result.plan.worstCaseCents <= budgetCents);
              assert.ok(result.plan.estimatedSeconds <= deadlineSeconds);
              assert.equal(result.totalCents, scenario === 'disagreement' && result.plan.fallbackId ? result.plan.worstCaseCents : result.plan.expectedCents);
            } else {
              assert.equal(result.finalStatus, 'blocked');
              assert.equal(result.totalCents, 0);
              assert.equal(result.frames.filter((frame) => frame.kind === 'payment').length, 0);
            }
          }
        }
      }
    }
  });

  it('blocks invalid address, budget, and deadline inputs without any spending', () => {
    const invalid: Partial<Task>[] = [
      ...['', '0x1234', `0x${'g'.repeat(40)}`, `0x${'0'.repeat(40)}`].map((tokenAddress) => ({ tokenAddress })),
      ...[0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map((budgetCents) => ({ budgetCents })),
      ...[0, -1, 1.5, NaN, Infinity].map((deadlineSeconds) => ({ deadlineSeconds })),
      { chain: 'Unknown' as Task['chain'] }, { policy: 'Unknown' as Policy }, { scenario: 'Unknown' as Scenario },
    ];
    for (const overrides of invalid) {
      const result = run(overrides);
      assert.equal(result.finalStatus, 'blocked');
      assert.equal(result.totalCents, 0);
      assert.equal(result.frames.length, 1);
      assert.equal(result.observations.length, 0);
      assertLedger(result);
    }
  });

  it('rejects a stale or tampered spending plan before reserving or paying', () => {
    const input = task();
    const plan = selectPlan(input);
    const tampered = { ...plan, worstCaseCents: plan.expectedCents };
    assert.equal(buildRun(input, tampered, 'tampered').finalStatus, 'blocked');
    const lowerBudget = { ...input, budgetCents: 8 };
    const stale = buildRun(lowerBudget, plan, 'stale');
    assert.equal(stale.finalStatus, 'blocked');
    assert.equal(stale.totalCents, 0);
    assert.equal(stale.frames[0].reservedCents, 0);
  });

  it('formats cents without currency arithmetic or rounding drift', () => {
    assert.equal(formatMoney(0), '0.00');
    assert.equal(formatMoney(6), '0.06');
    assert.equal(formatMoney(22), '0.22');
    assert.equal(formatMoney(1250), '12.50');
    assert.equal(formatMoney(Number.MAX_SAFE_INTEGER), '90071992547409.91');
    assert.equal(formatMoney(NaN), '—');
  });
});

describe('session feedback', () => {
  it('adds paid and checked observations once, including failed results and recovered timeouts', () => {
    const disagreement = run({ policy: 'assurance', scenario: 'disagreement' }, 'history-a');
    const timeout = run({ scenario: 'timeout' }, 'history-b');
    const profiles = applyRunHistory([disagreement, timeout, disagreement]);
    assert.deepEqual([getProvider('sentinel', profiles)!.accepted, getProvider('sentinel', profiles)!.samples], [48, 52]);
    assert.deepEqual([getProvider('atlas', profiles)!.accepted, getProvider('atlas', profiles)!.samples], [32, 37]);
    assert.deepEqual([getProvider('scout', profiles)!.accepted, getProvider('scout', profiles)!.samples], [13, 19]);
    assert.deepEqual([getProvider('lens', profiles)!.accepted, getProvider('lens', profiles)!.samples], [67, 69]);
    assert.equal(getProvider('sentinel')!.samples, 50, 'Seed history is immutable');
  });

  it('changes future selection after enough observed failures', () => {
    const failures = Array.from({ length: 14 }, (_, index) => run({ scenario: 'disagreement', budgetCents: 22 }, `failure-${index}`));
    const profiles = applyRunHistory(failures);
    assert.deepEqual(selectPlan(task(), profiles).primaryIds, ['atlas']);
    const next = run({}, 'after-feedback', profiles);
    assert.equal(next.finalStatus, 'completed');
    assert.equal(next.frames.find((frame) => frame.kind === 'payment')!.providerId, 'atlas');
  });
});
