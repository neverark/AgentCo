import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  ArrowRight, ArrowUpRight, AudioLines, BookOpen, Check,
  CheckCheck, ChevronDown, ChevronRight, CircleCheck, CircleHelp, Clock3,
  Coins, Copy, Download, FileCheck2, FlaskConical, Gauge, History, Info,
  Layers3, LayoutGrid, Menu, Network, Pause, Play, Plus,
  RotateCcw, Search, ShieldCheck, ShieldHalf, SkipForward, SlidersHorizontal,
  Sparkles, Target, Wallet, X, Zap,
} from 'lucide-react';
import {
  DEFAULT_TASK, applyRunHistory, buildRun, formatMoney, getPlans, selectPlan,
} from './lib/procurement';
import type { Evidence, Policy, Provider, Run, RunFrame, Scenario, Task } from './lib/procurement';
import { AGENTLEDGER, readAgentLedgerAssessment, summarizeForAgentLedger } from './lib/agentledger';
import type { AgentLedgerAssessment } from './lib/agentledger';
import { createLiveRun, isTaskEqual } from './lib/live-procurement';
import type { SnifferPaymentResult, TokenMarketSnapshot } from './lib/live-procurement';

type View = 'workspace' | 'providers' | 'history' | 'treasury';
type Overlay = { kind: 'guide' | 'compare' } | { kind: 'provider'; provider: Provider }
  | { kind: 'report'; run: Run } | { kind: 'event'; run: Run; frame: RunFrame };
const POLICY_INFO = {
  economy: { label: 'Lowest cost', short: 'Essential intelligence', detail: 'One specialist. A lighter footprint.', icon: Zap },
  balanced: { label: 'Balanced', short: 'Confidence meets value', detail: 'Verified insight, with a backup plan.', icon: SlidersHorizontal },
  assurance: { label: 'High assurance', short: 'More eyes on the evidence', detail: 'Multiple opinions. Deeper checks.', icon: ShieldCheck },
} as const;
const SCENARIOS: Record<Scenario, string> = { success: 'Successful delivery', disagreement: 'Verification mismatch', timeout: 'Response timeout' };
const STORAGE_KEY = 'agentco-demo-runs-v1';
const LIVE_PENDING_KEY = 'agentco-live-payment-v1';

function loadHistory(): Run[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Run => !!item && typeof item === 'object'
      && typeof item.id === 'string' && item.task && item.plan && Array.isArray(item.frames)
      && Array.isArray(item.observations) && Number.isInteger(item.totalCents)
      && ['completed', 'failed', 'blocked'].includes(item.finalStatus)).slice(0, 30);
  } catch { return []; }
}

function Money({ cents, unit = false }: { cents: number; unit?: boolean }) {
  return <span className="money">{formatMoney(cents)}{unit && <span className="money-unit"> USDT</span>}</span>;
}

function BrandMark({ small = false }: { small?: boolean }) {
  return <svg className={small ? 'brand-mark small' : 'brand-mark'} viewBox="0 0 40 40" aria-hidden="true">
    <rect width="40" height="40" rx="11" fill="currentColor" />
    <path d="M11 27V15l9-5 9 5v12h-6v-8l-3-1.7-3 1.7v8z" fill="white" />
    <path d="M18 24h4v6h-4z" fill="#acbdff" />
  </svg>;
}

function ProviderMark({ provider, size = '' }: { provider: Provider; size?: string }) {
  const icons = { scout: Zap, sentinel: ShieldHalf, atlas: Layers3, lens: AudioLines };
  const Icon = icons[provider.id as keyof typeof icons] || Network;
  return <span className={`provider-mark ${provider.id} ${size}`}><Icon size={size === 'large' ? 26 : 19} strokeWidth={1.8} /></span>;
}

function Modal({ title, eyebrow, children, onClose, wide = false }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} aria-labelledby={headingId} className={`modal ${wide ? 'wide' : ''}`} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-inner">
      <header className="modal-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2 id={headingId}>{title}</h2></div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></header>
      {children}
    </div>
  </dialog>;
}

function EvidenceTable({ evidence }: { evidence: Evidence[] }) {
  return <div className="evidence-list">{evidence.map(item => <div className={`evidence-item ${item.status}`} key={item.id}>
    <span className="evidence-icon">{item.status === 'passed' ? <Check size={16} /> : item.status === 'failed' ? <X size={16} /> : <CircleHelp size={16} />}</span>
    <div><strong>{item.label}</strong><p>{item.observed}</p><small>{item.reference}</small><small className="evidence-source">Source: {item.source}</small></div>
    <span className={`pill ${item.status === 'passed' ? 'green' : item.status === 'failed' ? 'red' : 'neutral'}`}>{item.status === 'unverified' ? 'Not verified' : item.status === 'passed' ? 'Matched' : 'Mismatch'}</span>
  </div>)}</div>;
}

function exportRun(run: Run) {
  const payload = { notice: run.source === 'live'
    ? 'Live provider response, Onchain OS market snapshot, and actual payment receipt when present.'
    : 'AgentCo sample run. Providers, observations, prices, findings and payments are synthetic. No real transactions.', ...run };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `agentco-${run.id}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type TokenLookup = { source: string; chain: string; tokenAddress: string; tokenName?: string; tokenSymbol?: string; decimals?: string; communityRecognized: boolean; checkedAt: string };
type WalletReadiness = { available: boolean; walletLoggedIn: boolean; okxUserReady: boolean; checks?: { wallet: boolean; identity: boolean; communication: boolean }; error?: string };

type LiveOption = {
  acceptsIndex: number; amountHuman: number; amountCents: number; tokenSymbol: string; network: string;
  asset: string; payTo: string; scheme: string; recommended: boolean; balanceStatus?: string;
};
type LiveQuote = {
  quoteId: string; provider: string; listingUrl: string; endpoint: string; task: Task;
  requestMethod: string;
  providedInputs: Array<{ name: string; value: string }>;
  budgetCents: number; callLimitCents: number; options: LiveOption[]; recommendedAcceptsIndex: number;
  preparedAt: string;
};
type SavedLiveQuote = {
  quote: LiveQuote; market: TokenMarketSnapshot; status: 'quoted' | 'paying' | 'unknown' | 'pending';
  selectedAcceptsIndex: number; message?: string;
};

function loadSavedLiveQuote(): SavedLiveQuote | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LIVE_PENDING_KEY) || 'null');
    if (!value || typeof value !== 'object' || !('quote' in value) || !('market' in value)) return null;
    const saved = value as SavedLiveQuote;
    return saved.quote?.quoteId && Array.isArray(saved.quote.options) && saved.market?.source ? saved : null;
  } catch { return null; }
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(data.error || `Request failed with HTTP ${response.status}.`);
  return data;
}

function LiveSnifferPanel({ task, onRun }: { task: Task; onRun: (run: Run) => void }) {
  const [pending, setPending] = useState<SavedLiveQuote | null>(loadSavedLiveQuote);
  const [working, setWorking] = useState<'idle' | 'preparing' | 'paying' | 'checking'>('idle');
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const taskMatches = !!pending && isTaskEqual(pending.quote.task, task);
  const selectedOption = pending?.quote.options.find((item) => item.acceptsIndex === pending.selectedAcceptsIndex);
  const unresolved = pending?.status === 'paying' || pending?.status === 'unknown' || pending?.status === 'pending';

  function save(value: SavedLiveQuote | null) {
    setPending(value);
    try {
      if (value) localStorage.setItem(LIVE_PENDING_KEY, JSON.stringify(value));
      else localStorage.removeItem(LIVE_PENDING_KEY);
    } catch { /* This panel remains usable if browser storage is unavailable. */ }
  }

  useEffect(() => {
    if (pending?.status === 'paying') save({ ...pending, status: 'unknown', message: 'The page reloaded while payment was running. Check the local wallet status before starting another payment.' });
    // Persist an interrupted payment as unresolved on reload; never replay it automatically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function prepare() {
    const request = ++requestId.current;
    const taskCopy = { ...task, tokenAddress: task.tokenAddress.toLowerCase() };
    setWorking('preparing'); setError('');
    try {
      const marketBody = JSON.stringify({ chain: taskCopy.chain, tokenAddress: taskCopy.tokenAddress });
      const quoteBody = JSON.stringify({ chain: taskCopy.chain, tokenAddress: taskCopy.tokenAddress, budgetCents: taskCopy.budgetCents });
      const [marketResponse, quoteResponse] = await Promise.all([
        fetch('/api/onchainos/token-market-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: marketBody, signal: AbortSignal.timeout(20_000) }),
        fetch('/api/okx/sniffer-risk/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: quoteBody, signal: AbortSignal.timeout(60_000) }),
      ]);
      const market = await readApiResponse<TokenMarketSnapshot>(marketResponse);
      const quoteData = await readApiResponse<LiveQuote>(quoteResponse);
      if (request !== requestId.current) return;
      const quote = { ...quoteData, task: taskCopy };
      save({ quote, market, status: 'quoted', selectedAcceptsIndex: quote.recommendedAcceptsIndex });
    } catch (cause) {
      if (request === requestId.current) setError(cause instanceof Error ? cause.message : 'The live provider quote could not be prepared.');
    } finally {
      if (request === requestId.current) setWorking('idle');
    }
  }

  function complete(result: SnifferPaymentResult, quoteState: SavedLiveQuote) {
    const next = createLiveRun(quoteState.quote.task, quoteState.market, result);
    save(null); setWorking('idle'); setError(''); onRun(next);
  }

  async function approveAndPay() {
    if (!pending || !selectedOption || !taskMatches || pending.status !== 'quoted') return;
    const current = { ...pending, status: 'paying' as const, message: undefined };
    save(current); setWorking('paying'); setError('');
    try {
      const response = await fetch('/api/okx/sniffer-risk/pay', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: pending.quote.quoteId, acceptsIndex: selectedOption.acceptsIndex, task: {
          chain: pending.quote.task.chain, tokenAddress: pending.quote.task.tokenAddress, budgetCents: pending.quote.task.budgetCents,
        } }),
        signal: AbortSignal.timeout(100_000),
      });
      const result = await response.json() as SnifferPaymentResult;
      if (result.status === 'success' || result.status === 'failed') { complete(result, current); return; }
      save({ ...current, status: result.status === 'pending' ? 'pending' : 'unknown', message: result.warning || 'Payment status is unresolved. Do not retry this quote.' });
      setError(result.warning || 'Payment status is unresolved. Check local wallet status before any new attempt.');
    } catch (cause) {
      save({ ...current, status: 'unknown', message: 'The payment request ended without a definitive receipt. Check local wallet status before any new attempt.' });
      setError(cause instanceof Error ? cause.message : 'Payment status is unresolved. Do not retry this quote.');
    } finally { setWorking('idle'); }
  }

  async function checkPaymentStatus() {
    if (!pending) return;
    setWorking('checking'); setError('');
    try {
      const response = await fetch(`/api/okx/sniffer-risk/payment-status?quoteId=${encodeURIComponent(pending.quote.quoteId)}`, { signal: AbortSignal.timeout(12_000) });
      const status = await response.json() as { status: SavedLiveQuote['status'] | 'success' | 'failed'; result?: SnifferPaymentResult; message?: string };
      if (status.result && (status.result.status === 'success' || status.result.status === 'failed')) { complete(status.result, pending); return; }
      if (status.status === 'success' || status.status === 'failed') { setError('The local payment result is missing its service receipt. Keep the quote closed and check the wallet/provider record.'); save({ ...pending, status: 'unknown' }); return; }
      const nextStatus = status.status === 'quoted' ? 'quoted' : status.status === 'paying' ? 'paying' : status.status === 'pending' ? 'pending' : 'unknown';
      save({ ...pending, status: nextStatus, message: status.message || (nextStatus === 'quoted' ? '' : 'Payment is not confirmed. Do not retry this quote.') });
      if (nextStatus === 'quoted') setError('The local wallet has not started this payment. You can approve the quoted terms.');
      else setError(status.message || 'Payment is still unresolved. Do not retry this quote.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not read payment status.'); }
    finally { setWorking('idle'); }
  }

  const market = pending?.market;
  return <section className="panel live-procurement-panel">
    <div className="panel-heading"><div><p className="eyebrow muted">LIVE PROVIDER · ONCHAIN OS</p><h2>Sniffer Risk Check</h2></div><span className="pill green">OKX.AI Agent 6149 · quote required</span></div>
    <div className="live-procurement-content">
      <p>Request a real token risk assessment from <a href="https://www.okx.ai/agents/6149" target="_blank" rel="noreferrer">Sniffer Risk Check <ArrowUpRight size={12} /></a> and attach a separate Onchain OS price, liquidity, holder, and 24h activity snapshot. AgentCo checks the actual quote against your task budget and configured per-call limit before payment.</p>
      <div className="live-service-metadata"><span><strong>Provider</strong> Sniffer Risk Check</span><span><strong>Required inputs</strong> Chain + token contract</span><span><strong>Payment</strong> Agentic Wallet · one-time</span></div>
      {!pending && <button className="button secondary" onClick={prepare} disabled={working !== 'idle'}>{working === 'preparing' ? 'Fetching market data and quote…' : 'Prepare live risk check'} <ArrowUpRight size={14} /></button>}
      {pending && <>
        <div className="live-quote-card">
          <div className="live-quote-heading"><div><span className="eyebrow muted">PAYMENT QUOTE · NO FUNDS MOVED</span><strong>{taskMatches ? 'Quote is bound to the current task' : 'Task changed after this quote'}</strong></div><span className={`pill ${unresolved ? 'amber' : taskMatches ? 'blue' : 'neutral'}`}>{unresolved ? `Payment ${pending.status}` : 'Approval required'}</span></div>
          <div className="live-quote-details"><div><span>Token</span><strong>{pending.quote.task.tokenAddress}</strong><small>{pending.quote.task.chain}</small></div><div><span>Budget / call cap</span><strong>{(pending.quote.budgetCents / 100).toFixed(2)} / {(pending.quote.callLimitCents / 100).toFixed(2)} USDT</strong></div><div><span>Provider request</span><strong>{pending.quote.requestMethod} {pending.quote.endpoint}</strong><small>{pending.quote.providedInputs.map(item => `${item.name}: ${item.value}`).join(' · ')}</small></div></div>
          <div className="live-options">{pending.quote.options.map(option => <label key={option.acceptsIndex} className={`live-option ${pending.selectedAcceptsIndex === option.acceptsIndex ? 'selected' : ''}`}><input type="radio" name="live-payment-option" checked={pending.selectedAcceptsIndex === option.acceptsIndex} disabled={pending.status !== 'quoted' || !taskMatches} onChange={() => save({ ...pending, selectedAcceptsIndex: option.acceptsIndex })} /><span><strong>{option.amountHuman.toFixed(2)} {option.tokenSymbol}</strong><small>{option.scheme} · {option.network} · {option.balanceStatus || 'wallet checked'}</small><small>Token {option.asset} → recipient {option.payTo}</small></span>{option.recommended && <span className="pill blue">Recommended</span>}</label>)}</div>
          {market && <div className="live-market-grid"><div><span>Price</span><strong>${market.price}</strong><small>24h {market.priceChange24H}%</small></div><div><span>Liquidity</span><strong>${market.liquidity}</strong><small>Market cap ${market.marketCap}</small></div><div><span>24h activity</span><strong>${market.volume24H}</strong><small>{market.transactions24H} transactions · {market.holders} holders</small></div></div>}
          <div className="live-payment-actions">
            {pending.status === 'quoted' && <button className="button primary" onClick={approveAndPay} disabled={working !== 'idle' || !taskMatches || !selectedOption}>{working === 'paying' ? 'Signing and requesting service…' : `Approve ${selectedOption ? `${selectedOption.amountHuman.toFixed(2)} ${selectedOption.tokenSymbol}` : 'payment'} and run`} <Coins size={15} /></button>}
            {unresolved && <button className="button secondary" onClick={checkPaymentStatus} disabled={working !== 'idle'}>{working === 'checking' ? 'Checking local status…' : 'Check payment status'} <RotateCcw size={14} /></button>}
            {(pending.status === 'unknown' || pending.status === 'pending') && <button className="text-button" onClick={() => { save(null); setError(''); }}>I checked the wallet; no payment was made — discard quote</button>}
            {pending.status === 'quoted' && <button className="text-button" disabled={working !== 'idle'} onClick={prepare}>Refresh quote</button>}
          </div>
        </div>
      </>}
      {error && <p className="live-procurement-error" role="alert">{error}</p>}
      <small className="live-procurement-footnote">Approval signs only the displayed quote. A timed-out payment is saved as unresolved and cannot be replayed from this screen. Paid execution uses the local Onchain OS CLI wallet session; hosted serverless payment is disabled.</small>
    </div>
  </section>;
}

function OnchainTokenPanel({ task }: { task: Task }) {
  const [state, setState] = useState<{ kind: 'idle' | 'loading' } | { kind: 'success'; data: TokenLookup } | { kind: 'error'; message: string }>({ kind: 'idle' });
  const requestId = useRef(0);
  useEffect(() => { requestId.current += 1; setState({ kind: 'idle' }); }, [task.chain, task.tokenAddress]);
  const validAddress = /^0x[0-9a-fA-F]{40}$/.test(task.tokenAddress) && !/^0x0{40}$/i.test(task.tokenAddress);
  async function lookUp() {
    const id = ++requestId.current;
    setState({ kind: 'loading' });
    try {
      const response = await fetch('/api/onchainos/token-basic-info', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain: task.chain, tokenAddress: task.tokenAddress }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Onchain OS returned HTTP ${response.status}.`);
      if (id === requestId.current) setState({ kind: 'success', data });
    } catch (error) {
      if (id === requestId.current) setState({ kind: 'error', message: error instanceof Error ? error.message : 'Token lookup failed.' });
    }
  }
  return <section className="panel okx-connection-panel">
    <div className="panel-heading"><div><p className="eyebrow muted">ONCHAIN OS · TOKEN API</p><h2>Check the token on OKX</h2></div><span className="pill blue">Live lookup</span></div>
    <div className="okx-connection-content"><p>Look up basic metadata for the selected address. This read-only result is shown separately from the simulated risk snapshot.</p>
      <button className="button secondary" onClick={lookUp} disabled={!validAddress || state.kind === 'loading'}>{state.kind === 'loading' ? 'Checking token…' : 'Look up token'} <ArrowUpRight size={14} /></button>
      {!validAddress && <small>Enter a valid token contract address to look it up.</small>}
      {state.kind === 'error' && <small className="agentledger-error" role="alert">{state.message}</small>}
      {state.kind === 'success' && <div className="okx-connection-result" role="status"><strong>{state.data.tokenName || 'Token'} {state.data.tokenSymbol ? `(${state.data.tokenSymbol})` : ''}</strong><span>{state.data.chain} · {state.data.decimals ?? '—'} decimals · {state.data.communityRecognized ? 'Community recognized' : 'Recognition not indicated'}</span><small>{state.data.source} · {new Date(state.data.checkedAt).toLocaleString()}</small></div>}
    </div>
  </section>;
}

function WalletReadinessPanel() {
  const [state, setState] = useState<{ kind: 'idle' | 'loading' } | { kind: 'success'; data: WalletReadiness } | { kind: 'error'; message: string }>({ kind: 'idle' });
  async function check() {
    setState({ kind: 'loading' });
    try {
      const response = await fetch('/api/okx/wallet-status', { signal: AbortSignal.timeout(12_000) });
      const data: WalletReadiness = await response.json();
      if (!response.ok) throw new Error(data.error || `Wallet check returned HTTP ${response.status}.`);
      setState({ kind: 'success', data });
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : 'Wallet check failed.' });
    }
  }
  const data = state.kind === 'success' ? state.data : null;
  return <section className="panel okx-connection-panel">
    <div className="panel-heading"><div><p className="eyebrow muted">ONCHAIN OS · AGENTIC WALLET</p><h2>Connection readiness</h2></div><span className="pill neutral">Read only</span></div>
    <div className="okx-connection-content"><p>Check the local Agentic Wallet session and OKX.AI User readiness through the official Onchain OS CLI. This check never signs or sends a transaction.</p>
      <button className="button secondary" onClick={check} disabled={state.kind === 'loading'}>{state.kind === 'loading' ? 'Checking connection…' : 'Check connection'} <ArrowUpRight size={14} /></button>
      {state.kind === 'error' && <small className="agentledger-error" role="alert">{state.message}</small>}
      {data && <div className="okx-connection-result" role="status"><strong>{!data.available ? 'Local Onchain OS CLI needed' : data.walletLoggedIn ? 'Agentic Wallet signed in' : 'Agentic Wallet sign-in needed'}</strong>{data.available && <span>{data.okxUserReady ? 'OKX.AI User ready' : 'OKX.AI User setup pending'}</span>}{data.error && <small>{data.error}</small>}</div>}
      <div className="okx-connection-links"><a href="https://web3.okx.com/onchainos/dev-docs/okxai/user-register" target="_blank" rel="noreferrer">OKX.AI User setup <ArrowUpRight size={13} /></a><a href="https://web3.okx.com/onchainos/dev-docs/home/install-your-agentic-wallet" target="_blank" rel="noreferrer">Agentic Wallet setup <ArrowUpRight size={13} /></a></div>
    </div>
  </section>;
}

function AgentLedgerPanel({ runs }: { runs: Run[] }) {
  const summary = useMemo(() => summarizeForAgentLedger(runs), [runs]);
  const [state, setState] = useState<{ kind: 'idle' | 'loading' } | { kind: 'success'; result: AgentLedgerAssessment } | { kind: 'error'; message: string }>({ kind: 'idle' });
  const requestId = useRef(0);

  useEffect(() => {
    requestId.current += 1;
    setState({ kind: 'idle' });
  }, [summary]);

  async function requestAssessment() {
    const currentRequest = ++requestId.current;
    setState({ kind: 'loading' });
    try {
      const response = await fetch(AGENTLEDGER.proxyPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summary.payload),
        signal: AbortSignal.timeout(25_000),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`The listed service returned HTTP ${response.status}. No assessment was received.`);
      let data: unknown;
      try { data = JSON.parse(text); }
      catch { throw new Error('AgentLedger returned a response that was not JSON. No assessment was displayed.'); }
      if (currentRequest !== requestId.current) return;
      setState({ kind: 'success', result: readAgentLedgerAssessment(data) });
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setState({ kind: 'error', message: error instanceof Error ? error.message : 'The listed service could not be reached. No assessment was received.' });
    }
  }

  const assessment = state.kind === 'success' ? state.result : null;
  const money = (value?: number) => value === undefined ? '—' : `$${value.toFixed(2)}`;

  return <section className="panel agentledger-panel">
    <div className="panel-heading">
      <div><p className="eyebrow muted">OKX.AI LISTED SERVICE</p><h2>AgentLedger Financial Health</h2></div>
      <span className="pill green">Free · live service</span>
    </div>
    <div className="agentledger-content">
      <p className="agentledger-lead">Get an external assessment of AgentCo’s recent synthetic budget use and service-provider concentration.</p>
      <div className="agentledger-links">
        <a href={AGENTLEDGER.listingUrl} target="_blank" rel="noreferrer">OKX.AI listing · Agent {AGENTLEDGER.agentId} · Service {AGENTLEDGER.serviceId} <ArrowUpRight size={14} /></a>
        <span>Direct endpoint: <code>agentledger-one.vercel.app/api/company-health</code></span>
      </div>
      <div className="agentledger-inputs" aria-label="Data to be sent">
        <div><span>Runs in 30 days</span><strong>{summary.runCount}</strong></div>
        <div><span>Assigned budgets</span><strong>{summary.totalBudget.toFixed(2)} <small>sample units</small></strong></div>
        <div><span>Simulated service calls</span><strong>{summary.totalTransactions}</strong></div>
        <div><span>Simulated spend</span><strong>{summary.totalSpend.toFixed(2)} <small>sample units</small></strong></div>
      </div>
      {summary.totalTransactions === 0 && <p className="agentledger-hint">Complete a sample procurement first to create aggregate data for the service.</p>}
      <div className="agentledger-action">
        <button className="button primary" onClick={requestAssessment} disabled={state.kind === 'loading' || summary.totalTransactions === 0}>
          {state.kind === 'loading' ? 'Contacting AgentLedger…' : 'Run free external assessment'} <ArrowUpRight size={15} />
        </button>
        {state.kind === 'loading' && <span role="status">Waiting for the live service response.</span>}
        {state.kind === 'error' && <span className="agentledger-error" role="alert">{state.message}</span>}
      </div>

      {assessment && <div className="agentledger-result" aria-live="polite">
        <div className="agentledger-result-heading"><div><p className="eyebrow muted">LIVE RESPONSE</p><h3>{assessment.service || 'AgentLedger'} returned an assessment</h3></div><span className="pill blue">{assessment.stateVerification === 'caller_supplied' ? 'Caller supplied' : assessment.dataSource || 'External result'}</span></div>
        <div className="agentledger-metrics">
          <div><span>Budget used</span><strong>{assessment.budget?.usedPct === undefined ? '—' : `${assessment.budget.usedPct}%`}</strong><small>{money(assessment.budget?.used)} of {money(assessment.budget?.limit)} {assessment.currency || 'USD'}</small></div>
          <div><span>Budget remaining</span><strong>{money(assessment.budget?.remaining)}</strong><small>{assessment.currency || 'USD'} · {assessment.budget?.periodDays ?? 30} days</small></div>
          <div><span>Largest provider share</span><strong>{assessment.topCounterparties[0]?.shareOfSpendPct === undefined ? '—' : `${assessment.topCounterparties[0].shareOfSpendPct}%`}</strong><small>{assessment.topCounterparties[0]?.address || 'No provider breakdown'}</small></div>
        </div>
        {assessment.insights.length > 0 && <div className="agentledger-insights">{assessment.insights.map((insight, index) => <article key={`${insight.type}-${index}`}><span className={`pill ${insight.severity === 'positive' ? 'green' : 'amber'}`}>{insight.type === 'budget_utilization' ? 'Budget use' : 'Provider concentration'}</span><strong>{insight.title || insight.type}</strong>{insight.message && <p>{insight.message}</p>}</article>)}</div>}
        <p className="agentledger-caveat">AgentLedger received caller-supplied synthetic aggregates; it did not verify them. AgentCo has no income records, so it sent zero inflows. Income, cash-flow, and overall health conclusions are outside this assessment. Sample values are passed numerically into the service’s USD schema; no exchange-rate lookup or conversion is performed.</p>
        <div className="agentledger-result-foot"><span>{assessment.analysisVersion ? `Analysis ${assessment.analysisVersion}` : 'External service response'}{assessment.generatedAt ? ` · ${new Date(assessment.generatedAt).toLocaleString()}` : ''}</span><span>Only budget-use and provider-concentration findings are shown.</span></div>
      </div>}
      <div className="panel-footnote agentledger-footnote"><Info size={13} /> Free direct call to AgentLedger’s OKX.AI-listed endpoint; synthetic aggregates only.</div>
    </div>
  </section>;
}

function RunReport({ run }: { run: Run }) {
  const evidence = [...run.frames].reverse().find(frame => frame.evidence?.length)?.evidence || [];
  const live = run.source === 'live';
  const market = live && run.marketSnapshot && typeof run.marketSnapshot === 'object' ? run.marketSnapshot as TokenMarketSnapshot : null;
  const providerJson = typeof run.providerResult === 'string' ? run.providerResult : JSON.stringify(run.providerResult, null, 2);
  const receipt = run.paymentReceipt;
  return <>
    <div className={`report-banner ${run.finalStatus}`}><FileCheck2 size={30} /><div><h3>{run.finalStatus === 'completed' ? live ? 'Live assessment, with its data trail.' : 'A clearer picture. A complete paper trail.' : 'Every outcome stays accountable.'}</h3><p>{run.finalStatus === 'completed' ? live ? 'Your Sniffer assessment and market snapshot are ready.' : 'Your sample token risk snapshot is ready.' : run.frames.at(-1)?.detail}</p></div></div>
    <div className="report-summary"><div><span>Asset</span><strong>{run.task.tokenSymbol} <small>on {run.task.chain}</small></strong></div><div><span>Procurement policy</span><strong>{POLICY_INFO[run.task.policy].label}</strong></div><div><span>{live ? 'Actual paid spend' : 'Simulated spend'}</span><strong><Money cents={run.totalCents} unit /></strong></div></div>
    <div className="report-address"><span>Contract</span><code>{run.task.tokenAddress}</code></div>
    {live && market && <section className="live-report-market"><div className="section-heading"><h3>Onchain OS Market snapshot</h3><span className="pill green">Live data</span></div><div className="live-market-grid"><div><span>Price</span><strong>${market.price}</strong><small>24h {market.priceChange24H}%</small></div><div><span>Liquidity</span><strong>${market.liquidity}</strong><small>Market cap ${market.marketCap}</small></div><div><span>24h activity</span><strong>${market.volume24H}</strong><small>{market.transactions24H} transactions · {market.holders} holders</small></div></div><small className="live-data-timestamp">As of {new Date(Number(market.timestamp)).toLocaleString()} · checked {new Date(market.checkedAt).toLocaleString()}</small></section>}
    {live && <section className="live-provider-result"><div className="section-heading"><h3>Sniffer Risk Check response</h3><span className="pill blue">Provider result</span></div>{providerJson ? <pre>{providerJson}</pre> : <p className="empty-inline">The provider returned no recognizable result. Check the payment receipt below.</p>}</section>}
    {live && receipt && <section className="live-payment-receipt"><div className="section-heading"><h3>Payment receipt</h3><span className={`pill ${receipt.status === 'success' ? 'green' : receipt.status === 'failed' ? 'red' : 'amber'}`}>{receipt.status}</span></div><dl><div><dt>Paid amount</dt><dd>{receipt.status === 'success' ? <><Money cents={receipt.amountCents} /> {receipt.tokenSymbol}</> : `Quoted ${receipt.amountHuman.toFixed(2)} ${receipt.tokenSymbol}`}</dd></div><div><dt>Network</dt><dd>{receipt.network}</dd></div><div><dt>Recipient</dt><dd><code>{receipt.payTo}</code></dd></div><div><dt>Payment ID</dt><dd><code>{receipt.paymentId}</code></dd></div>{receipt.transaction && <div><dt>Transaction</dt><dd><code>{receipt.transaction}</code></dd></div>}</dl></section>}
    <div className="section-heading"><h3>What the evidence says</h3><span className={`pill ${live ? 'green' : 'neutral'}`}>{live ? 'Live sources · one provider' : 'Synthetic findings'}</span></div>
    {evidence.length ? <EvidenceTable evidence={evidence} /> : <p className="empty-inline">No evidence was purchased for this run.</p>}
    <div className="note"><Info size={16} /><p>{live ? 'The provider’s risk view is a single source and the Market API supplies market context. These checks do not establish token safety or constitute a contract audit.' : 'Checks cover the displayed facts only. They do not establish token safety or constitute an audit. The provider findings here are sample records, separate from live token metadata.'}</p></div>
    <div className="report-bottom"><div><small>Unspent budget</small><strong><Money cents={Math.max(0, run.task.budgetCents - run.totalCents)} unit /></strong></div><button className="button primary" onClick={() => exportRun(run)}><Download size={16} /> Export evidence</button></div>
  </>;
}

export default function App() {
  const [view, setView] = useState<View>('workspace');
  const [task, setTask] = useState<Task>({ ...DEFAULT_TASK });
  const [budgetInput, setBudgetInput] = useState(formatMoney(DEFAULT_TASK.budgetCents));
  const [runs, setRuns] = useState<Run[]>(loadHistory);
  const [run, setRun] = useState<Run | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [manual, setManual] = useState(false);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [providerQuery, setProviderQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState<'all' | 'analyst' | 'verifier'>('all');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [toast, setToast] = useState('');
  const journalRef = useRef<HTMLDivElement>(null);
  const profiles = useMemo(() => applyRunHistory(runs), [runs]);
  const currentPlan = useMemo(() => selectPlan(task, profiles), [task, profiles]);
  const plan = run?.source === 'live' ? currentPlan : run?.plan || currentPlan;
  const frame = run?.frames[frameIndex];
  const inFlight = !!run && frameIndex < run.frames.length - 1;
  const finished = !!run && !inFlight;
  const activeTask = run?.task || task;
  const safeBudget = Number.isFinite(activeTask.budgetCents) ? Math.max(0, activeTask.budgetCents) : 0;
  const primary = profiles.find(p => p.id === plan.primaryIds[0]);
  const fallbackProvider = profiles.find(p => p.id === plan.fallbackId);
  const fallbackTriggered = !!run?.frames.slice(0, frameIndex + 1).some(item => item.kind === 'fallback');
  const plannedAgentCount = plan.primaryIds.length + (plan.verifierId ? 1 : 0);
  const sampleRuns = runs.filter(entry => entry.source !== 'live');
  const totalSpent = sampleRuns.reduce((sum, entry) => sum + entry.totalCents, 0);
  const liveSpent = runs.filter(entry => entry.source === 'live').reduce((sum, entry) => sum + entry.totalCents, 0);
  const completedCount = runs.filter(entry => entry.finalStatus === 'completed').length;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(runs)); } catch { /* The workspace also works without browser storage. */ }
  }, [runs]);
  useEffect(() => {
    if (!playing || !inFlight) return;
    const timer = window.setTimeout(() => setFrameIndex(index => index + 1), 1250);
    return () => window.clearTimeout(timer);
  }, [playing, inFlight, frameIndex]);
  useEffect(() => {
    if (!finished || !run) return;
    setPlaying(false);
    setRuns(old => old.some(item => item.id === run.id) ? old : [run, ...old].slice(0, 30));
  }, [finished, run]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3200); return () => clearTimeout(timer); }, [toast]);

  useEffect(() => {
    if (journalRef.current) journalRef.current.scrollTop = journalRef.current.scrollHeight;
  }, [frameIndex, run, view]);

  function updateTask(patch: Partial<Task>) {
    if (inFlight) return;
    setTask(old => ({ ...old, ...patch })); setRun(null); setFrameIndex(0); setPlaying(false);
  }
  function startRun() {
    if (inFlight) return;
    const id = `AC-${Date.now().toString(36).toUpperCase()}`;
    const next = { ...buildRun(task, currentPlan, id, profiles), createdAt: new Date().toISOString() };
    setRun(next); setFrameIndex(0); setPlaying(!manual); setView('workspace');
  }
  function finishLiveRun(next: Run) {
    setRun(next); setFrameIndex(next.frames.length - 1); setPlaying(false); setView('workspace');
  }
  function newTask() {
    setPlaying(false); setRun(null); setFrameIndex(0); setTask({ ...DEFAULT_TASK });
    setBudgetInput(formatMoney(DEFAULT_TASK.budgetCents)); setView('workspace'); setMobileNav(false);
  }
  function navigate(next: View) { setView(next); setMobileNav(false); }
  function latestEvidence() { return run ? [...run.frames.slice(0, frameIndex + 1)].reverse().find(item => item.evidence?.length)?.evidence || [] : []; }
  const visibleProviders = profiles.filter(p => (providerFilter === 'all' || p.role === providerFilter) && `${p.name} ${p.tagline}`.toLowerCase().includes(providerQuery.toLowerCase()));
  const visibleRuns = runs.filter(item => historyFilter === 'all' || item.finalStatus === historyFilter);
  const navItems = [
    { id: 'workspace' as const, label: 'Workspace', icon: LayoutGrid },
    { id: 'providers' as const, label: 'Agent directory', icon: Network, count: profiles.length },
    { id: 'history' as const, label: 'Run history', icon: History, count: runs.length || undefined },
    { id: 'treasury' as const, label: 'Treasury', icon: Wallet },
  ];
  const headings = {
    workspace: ['YOUR AGENT OPERATIONS DESK', 'Intelligence, well spent.', 'The right agents. A clear budget. Results you can verify.'],
    providers: ['A SMALL TEAM. SPECIALIST SKILLS.', 'Meet your next collaborators.', 'Compare capabilities and the evidence behind every reputation.'],
    history: ['A PAPER TRAIL FOR EVERY DECISION', 'Every run tells a story.', 'Revisit the choices, costs, and evidence behind your outcomes.'],
    treasury: ['ACCOUNTABILITY, DOWN TO THE CENT', 'Keep capital in your corner.', 'A transparent record of service decisions and modeled spend.'],
  };

  return <div className="app-shell">
    {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <a className="brand" href="#workspace" onClick={e => { e.preventDefault(); navigate('workspace'); }}><BrandMark /><span>agentco<span className="brand-period">.</span></span></a>
      <div className="workspace-identity"><div className="workspace-symbol"><Layers3 size={18} /></div><div><strong>AgentCo workspace</strong><span>Personal workspace</span></div></div>
      <p className="nav-label">OPERATIONS</p>
      <nav aria-label="Main navigation">{navItems.map(item => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} aria-current={view === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={18} strokeWidth={1.7} /><span>{item.label}</span>{item.count !== undefined && <small>{item.count}</small>}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="sidebar-promo"><div className="promo-orbits" aria-hidden="true"><span /><span /><span /><BrandMark small /></div><strong>Small team.<br />Bigger possibilities.</strong><p>Your agents do the work.<br />You set the direction.</p><button onClick={() => setOverlay({ kind: 'guide' })}>Explore the workflow <ArrowUpRight size={15} /></button></div>
        <button className="nav-item help-link" onClick={() => setOverlay({ kind: 'guide' })}><BookOpen size={18} /> Workflow guide <ArrowUpRight size={14} /></button>
        <div className="event-brand"><span className="okx-mark" aria-hidden="true">▦</span><div>AGENTCO <span>SERVICE PROCUREMENT</span></div></div>
      </div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={21} /></button><span>AgentCo workspace</span><ChevronRight size={14} /><strong>{navItems.find(item => item.id === view)?.label}</strong></div><div className="topbar-right"><span className="environment-badge"><span /> Sample workspace</span><button className="icon-button top-help" aria-label="Open workflow guide" onClick={() => setOverlay({ kind: 'guide' })}><CircleHelp size={19} /></button><span className="avatar" title="AgentCo workspace">AC</span></div></header>
      <main id="main-content">
        <section className="page-heading"><div><p className="eyebrow"><span className="tiny-square" />{headings[view][0]}</p><h1>{headings[view][1]}</h1><p className="page-description">{headings[view][2]}</p></div><button className="button secondary new-task" onClick={newTask}><Plus size={17} /> New task</button></section>

        {view === 'workspace' && <div className="workspace-grid">
          <div className="workspace-main">
            <section className="panel mission-panel">
              <div className="panel-heading"><div className="heading-with-icon"><span className="section-icon"><Target size={20} /></span><div><h2>Token risk snapshot</h2><p>A focused brief. Independent evidence.</p></div></div><span className="pill neutral draft-label">{run ? run.id : 'NEW PROCUREMENT'}</span></div>
              <form id="procurement-form" onSubmit={e => { e.preventDefault(); startRun(); }}>
                <fieldset disabled={inFlight} className="task-fields"><div className="field token-field"><div className="field-label"><label htmlFor="token-address">Token contract</label><button type="button" className="text-button example-button" onClick={() => { updateTask({ tokenAddress: DEFAULT_TASK.tokenAddress, tokenSymbol: DEFAULT_TASK.tokenSymbol, chain: DEFAULT_TASK.chain }); }}>Use example</button></div><div className="input-wrap"><span className="token-monogram">{task.tokenSymbol === DEFAULT_TASK.tokenSymbol ? 'a' : '0x'}</span><input id="token-address" value={task.tokenAddress} spellCheck={false} autoComplete="off" onChange={e => updateTask({ tokenAddress: e.target.value, tokenSymbol: task.chain === DEFAULT_TASK.chain && e.target.value.toLowerCase() === DEFAULT_TASK.tokenAddress.toLowerCase() ? DEFAULT_TASK.tokenSymbol : 'CUSTOM' })} aria-describedby="token-hint" /><span className="asset-symbol">{task.tokenSymbol}</span></div></div>
                <div className="field chain-field"><label htmlFor="chain">Network</label><div className="select-wrap"><select id="chain" value={task.chain} onChange={e => updateTask({ chain: e.target.value as Task['chain'], tokenSymbol: e.target.value === DEFAULT_TASK.chain && task.tokenAddress.toLowerCase() === DEFAULT_TASK.tokenAddress.toLowerCase() ? DEFAULT_TASK.tokenSymbol : 'CUSTOM' })}><option>Base</option><option>X Layer</option><option>Ethereum</option></select><ChevronDown size={14} /></div></div>
                <div className="field budget-field"><label htmlFor="budget">Spend limit</label><div className="input-wrap"><input id="budget" type="number" min="0" step="0.01" value={budgetInput} onChange={e => { setBudgetInput(e.target.value); updateTask({ budgetCents: e.target.value === '' ? 0 : Math.round(Number(e.target.value) * 100) }); }} /><span className="input-suffix">USDT</span></div></div>
                </fieldset>
                <div className="form-meta"><span id="token-hint"><ShieldCheck size={13} /> Live metadata available on demand</span><label htmlFor="deadline"><Clock3 size={13} /> Delivery window <select id="deadline" disabled={inFlight} value={task.deadlineSeconds} onChange={e => updateTask({ deadlineSeconds: Number(e.target.value) })}><option value={10}>10 sec</option><option value={15}>15 sec</option><option value={30}>30 sec</option><option value={45}>45 sec</option><option value={60}>60 sec</option></select></label></div>
                <div className="policy-section"><div className="section-heading"><h3>How should your agents work?</h3><button type="button" className="text-button" onClick={() => setOverlay({ kind: 'compare' })}>Compare policies <ArrowUpRight size={13} /></button></div><div className="policy-options" role="radiogroup" aria-label="Procurement policy">{(Object.keys(POLICY_INFO) as Policy[]).map(policy => { const item = POLICY_INFO[policy]; return <label key={policy} className={`policy-card ${task.policy === policy ? 'selected' : ''} ${inFlight ? 'disabled' : ''}`}><input type="radio" name="procurement-policy" value={policy} checked={task.policy === policy} disabled={inFlight} onChange={() => updateTask({ policy })} /><div><item.icon size={17} /><span className="radio-dot">{task.policy === policy && <span />}</span></div><strong>{item.label}</strong><p>{item.detail}</p></label>; })}</div></div>
              </form>
            </section>

            <OnchainTokenPanel task={task} />
            <LiveSnifferPanel task={task} onRun={finishLiveRun} />
            <section className="panel procurement-panel"><div className="panel-heading"><div><p className="eyebrow muted">THE PROCUREMENT PLAN</p><h2>A team chosen with intention.</h2></div><span className="pill blue"><Network size={12} /> {plannedAgentCount} {plannedAgentCount === 1 ? 'agent' : 'agents'} in plan</span></div>
              <div className="provider-table" role="table" aria-label="Candidate agent comparison"><div className="provider-row table-head" role="row"><span role="columnheader">SPECIALIST</span><span role="columnheader">PER CALL</span><span role="columnheader">SAMPLE HISTORY</span><span role="columnheader">ROLE IN PLAN</span></div>{profiles.filter(p => p.role === 'analyst').map(provider => { const selected = plan.primaryIds.includes(provider.id); const fallback = plan.fallbackId === provider.id; return <div role="row" key={provider.id} className={`provider-row ${selected ? 'chosen' : ''}`}><div role="cell"><button className="provider-name" onClick={() => setOverlay({ kind: 'provider', provider })}><ProviderMark provider={provider} /><span><strong>{provider.name} <ArrowUpRight size={11} /></strong><small>{provider.tagline}</small></span></button></div><span role="cell"><Money cents={provider.priceCents} /><small className="cell-sub">USDT</small></span><span className="performance-cell" role="cell"><strong>{Math.round(provider.accepted / provider.samples * 100)}<small>%</small></strong><span className="mini-track"><span style={{ width: `${provider.accepted / provider.samples * 100}%` }} /></span><small>{provider.accepted}/{provider.samples} simulated</small></span><span role="cell">{selected ? <span className="pill blue"><Check size={12} /> Selected</span> : fallback ? <span className={`pill ${fallbackTriggered ? 'green' : 'amber'}`}>{fallbackTriggered ? 'Fallback used' : 'On standby'}</span> : <span className="muted role-other">Not selected</span>}</span></div>; })}</div>
              <div className="selection-note"><Sparkles size={15} /><p>{plan.feasible ? plan.reason : plan.blockedReason}</p></div>
              <div className="execution-map"><div className="section-heading"><h3>From budget to better insight</h3><span className="muted">{plan.estimatedSeconds}s max · simulated</span></div><div className="flow-nodes">{[
                { name: 'Reserve', caption: `${formatMoney(plan.worstCaseCents)} USDT ceiling`, icon: Wallet, className: 'reserve', active: frame?.kind === 'reserved' },
                { name: fallbackTriggered ? `${fallbackProvider?.name} fallback` : plan.primaryIds.length > 1 ? 'Two specialists' : primary?.name || 'Specialist', caption: fallbackTriggered ? 'One backup. Budget protected.' : plan.primaryIds.length > 1 ? 'Independent perspectives' : 'Risk intelligence', icon: ShieldHalf, className: 'analyze', active: ((frame?.kind === 'payment' || frame?.kind === 'response') && frame.providerId !== plan.verifierId) || frame?.kind === 'fallback' },
                { name: plan.verifierId ? 'Lens verification' : 'Schema check', caption: plan.verifierId ? 'Cross-check the facts' : 'Limited evidence coverage', icon: AudioLines, className: 'verify', active: frame?.kind === 'verification' || (frame?.kind === 'payment' && frame.providerId === plan.verifierId) },
                { name: 'Risk snapshot', caption: 'Evidence, attached', icon: FileCheck2, className: 'deliver', active: frame?.kind === 'completed' },
              ].map((node, index) => <div className={`flow-node ${node.className} ${node.active ? 'is-active' : ''}`} key={node.name}><span className="flow-node-icon"><node.icon size={22} strokeWidth={1.6} />{node.active && <span className="flow-active-dot" />}</span><strong>{node.name}</strong><small>{node.caption}</small>{index < 3 && <span className="flow-connector"><span /><ChevronRight size={12} /></span>}</div>)}</div></div>
            </section>
          </div>

          <aside className="workspace-aside"><section className="treasury-card"><div className="treasury-arc" aria-hidden="true" /><div className="treasury-title"><span><Wallet size={17} /> Treasury guard</span><ShieldCheck size={17} /></div><div className="budget-display"><span>YOUR SPENDING LIMIT</span><strong><Money cents={safeBudget} /><small>USDT</small></strong><p>{finished ? 'Every cent, accounted for.' : 'A hard limit. A smarter allocation.'}</p></div>
              <div className="allocation-track" aria-label={frame ? `Spent ${formatMoney(frame.spentCents)}, reserved ${formatMoney(frame.reservedCents)}, available ${formatMoney(frame.availableCents)} USDT` : `Planned allocation ${formatMoney(plan.worstCaseCents)} of ${formatMoney(safeBudget)} USDT`}>
                <span className="spent" style={{ flex: frame ? frame.spentCents : Math.min(plan.expectedCents, safeBudget) }} /><span className="reserved" style={{ flex: frame ? frame.reservedCents : Math.max(0, Math.min(plan.worstCaseCents, safeBudget) - Math.min(plan.expectedCents, safeBudget)) }} /><span className="available" style={{ flex: frame ? frame.availableCents : Math.max(0, safeBudget - plan.worstCaseCents) }} />
              </div>
              <div className="treasury-lines"><div><span><i className="dot spent" />{frame ? 'Spent' : 'Expected spend'}</span><Money cents={frame?.spentCents ?? plan.expectedCents} /></div><div><span><i className="dot reserved" />{frame ? 'Still reserved' : 'Contingency reserve'}</span><Money cents={frame?.reservedCents ?? Math.max(0, plan.worstCaseCents - plan.expectedCents)} /></div><div><span><i className="dot available" />{frame ? 'Available' : 'Unallocated'}</span><Money cents={frame?.availableCents ?? Math.max(0, safeBudget - plan.worstCaseCents)} /></div></div>
              <div className={`budget-check ${plan.feasible ? '' : 'exceeds'}`}>{plan.feasible ? <ShieldCheck size={15} /> : <Info size={15} />}<span>{plan.feasible ? 'Worst case stays within budget' : 'This plan needs an adjustment'}</span></div>
              {inFlight ? <div className="execution-controls"><button className="button run-button" onClick={() => setPlaying(!playing)}>{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? 'Pause execution' : 'Resume execution'}</button><button className="button step-button" aria-label="Advance one step" onClick={() => { setPlaying(false); setFrameIndex(i => Math.min(i + 1, (run?.frames.length || 1) - 1)); }}><SkipForward size={17} /></button></div> : finished ? <button className="button run-button" onClick={() => setOverlay({ kind: 'report', run: run! })}><FileCheck2 size={17} /> View {run!.finalStatus === 'completed' ? 'risk snapshot' : 'run outcome'} <ArrowRight size={17} /></button> : <button className="button run-button" form="procurement-form" type="submit" disabled={!plan.feasible}><Play size={16} fill="currentColor" /> Run procurement <ArrowRight size={17} /></button>}
              <p className="no-funds"><FlaskConical size={12} /> {run?.source === 'live' ? 'Live spend and receipt appear in the report' : 'Sample catalog · modeled charges'}</p>
            </section>
            {!plan.feasible && <div className="blocked-notice" role="alert"><Info size={18} /><div><strong>Before you run</strong><p>{plan.blockedReason}</p></div></div>}
            <section className="panel reasoning-card"><div className="section-heading"><span className="small-icon"><Sparkles size={17} /></span><h3>Good judgment, made visible.</h3></div><p>{plan.feasible ? plan.reason : 'Adjust your budget, deadline, or policy to find a feasible plan.'}</p><div className="reason-tags"><span><CheckCheck size={13} /> Budget checked</span><span><Clock3 size={13} /> Deadline aware</span></div>{plan.fallbackId && <div className="fallback-note"><RotateCcw size={15} /><span>{fallbackProvider?.name} {fallbackTriggered ? 'was activated as the fallback.' : 'is ready if verification fails.'}</span></div>}</section>
            <section className="scenario-card"><div><FlaskConical size={16} /><h3>Try an outcome</h3><span className="pill neutral">SAMPLE</span></div><div className="select-wrap"><select aria-label="Sample scenario" disabled={inFlight} value={task.scenario} onChange={e => updateTask({ scenario: e.target.value as Scenario })}>{Object.entries(SCENARIOS).map(([key, value]) => <option value={key} key={key}>{value}</option>)}</select><ChevronDown size={14} /></div><label className="manual-toggle"><input type="checkbox" checked={manual} disabled={inFlight} onChange={e => setManual(e.target.checked)} /><span>Start in step-by-step mode</span></label></section>
          </aside>

          <section className="panel activity-panel"><div className="panel-heading"><div className="heading-with-icon"><span className="section-icon subtle"><History size={18} /></span><h2>Execution journal</h2>{run && <span className={`pill ${finished ? run.finalStatus === 'completed' ? 'green' : 'amber' : 'blue'}`}>{finished ? run.finalStatus : playing ? 'Running' : 'Paused'}</span>}</div><div className="journal-actions">{run && <><span className="journal-progress">{frameIndex + 1} / {run.frames.length} events</span><button className="text-button" onClick={() => { setPlaying(false); setRun(null); setFrameIndex(0); }}>Reset run <RotateCcw size={13} /></button></>}<span className={`pill ${run?.source === 'live' ? 'green' : 'neutral'}`}>{run?.source === 'live' ? 'Live records' : 'Sample events'}</span></div></div>
            {!run ? <div className="journal-empty"><span className="journal-empty-icon"><AudioLines size={23} /></span><div><strong>The plan is ready. The story starts with you.</strong><p>Run procurement to follow every decision, reservation, and evidence check.</p></div><span className="empty-dots" aria-hidden="true"><i /><i /><i /></span></div> : <><div className="run-progress-track"><span style={{ width: `${frame?.progress || 0}%` }} /></div><div ref={journalRef} className="journal-list" aria-live="polite" aria-relevant="additions">{run.frames.slice(0, frameIndex + 1).map((event, index) => <button key={event.id} className={`journal-event ${event.kind}`} onClick={() => setOverlay({ kind: 'event', run, frame: event })}><span className="event-time">{String(index + 1).padStart(2, '0')}</span><span className="event-dot">{event.kind === 'failed' ? <X size={12} /> : event.kind === 'verification' ? <ShieldCheck size={12} /> : event.kind === 'payment' ? <Coins size={12} /> : <Check size={12} />}</span><span className="event-copy"><strong>{event.title}</strong><span>{event.detail}</span></span><span className="event-cost"><Money cents={event.spentCents} /><small>spent</small></span><ChevronRight size={14} /></button>)}</div>{finished && <div className={`journal-result ${run.finalStatus}`}><CircleCheck size={21} /><div><strong>{run.finalStatus === 'completed' ? 'Delivered, with the evidence to back it up.' : 'The run stopped with a clear record.'}</strong><span>{formatMoney(run.totalCents)} USDT spent · {formatMoney(Math.max(0, run.task.budgetCents - run.totalCents))} USDT unspent</span></div><button className="button secondary" onClick={() => setOverlay({ kind: 'report', run })}>Review outcome <ArrowUpRight size={15} /></button></div>}{!finished && latestEvidence().length > 0 && <div className="inline-evidence"><ShieldCheck size={14} /> {latestEvidence().filter(e => e.status === 'passed').length} checks matched · inspect the verification event for details</div>}</>}
          </section>
        </div>}

        {view === 'providers' && <section className="directory-view"><div className="view-toolbar"><div className="filter-tabs" aria-label="Agent type">{(['all', 'analyst', 'verifier'] as const).map(filter => <button className={providerFilter === filter ? 'active' : ''} key={filter} aria-pressed={providerFilter === filter} onClick={() => setProviderFilter(filter)}>{filter === 'all' ? 'All agents' : filter === 'analyst' ? 'Analysts' : 'Verifiers'}</button>)}</div><div className="search-wrap"><Search size={16} /><input aria-label="Search agents" placeholder="Find a specialist…" value={providerQuery} onChange={e => setProviderQuery(e.target.value)} /></div></div><div className="directory-grid">{visibleProviders.map(provider => <article className="panel directory-card" key={provider.id}><div className="directory-top"><ProviderMark provider={provider} size="large" /><span className="pill neutral">{provider.role === 'analyst' ? 'Risk specialist' : 'Evidence verifier'}</span></div><h2>{provider.name}</h2><p>{provider.tagline}</p><div className="capability-tags">{provider.capabilities.map(capability => <span key={capability}>{capability.replaceAll('-', ' ')}</span>)}</div><div className="directory-stats"><div><span>Per call</span><strong><Money cents={provider.priceCents} /> <small>USDT</small></strong></div><div><span>Sample acceptance</span><strong>{Math.round(provider.accepted / provider.samples * 100)}<small>%</small></strong></div><div><span>Response</span><strong>{provider.latencySeconds}<small>s</small></strong></div></div><button className="text-button" onClick={() => setOverlay({ kind: 'provider', provider })}>View agent profile <ArrowUpRight size={15} /></button></article>)}</div>{!visibleProviders.length && <div className="panel empty-state"><Search size={30} /><h2>No specialists match that search.</h2><button className="button secondary" onClick={() => { setProviderQuery(''); setProviderFilter('all'); }}>Show all agents</button></div>}<div className="note"><FlaskConical size={17} /><p>This included catalog contains sample providers, prices, ratings, and histories. Completed sample runs add local observations to later decisions.</p></div></section>}

        {view === 'history' && <section className="panel history-panel"><div className="panel-heading"><h2>Your procurement history <span className="count-badge">{runs.length}</span></h2><div className="filter-tabs">{['all', 'completed', 'failed', 'blocked'].map(filter => <button key={filter} className={historyFilter === filter ? 'active' : ''} aria-pressed={historyFilter === filter} onClick={() => setHistoryFilter(filter)}>{filter[0].toUpperCase() + filter.slice(1)}</button>)}</div></div>{!visibleRuns.length ? <div className="empty-state"><History size={32} /><h2>{runs.length ? 'No runs in this category.' : 'Your first decision is waiting.'}</h2><p>{runs.length ? 'Choose another filter to explore your history.' : 'Complete a procurement to see its decisions, costs, and evidence here.'}</p><button className="button primary" onClick={() => navigate('workspace')}>Open workspace <ArrowRight size={16} /></button></div> : <div className="history-table"><div className="history-row table-head"><span>PROCUREMENT</span><span>POLICY</span><span>OUTCOME</span><span>SPEND</span><span /></div>{visibleRuns.map(item => <button className="history-row" key={item.id} onClick={() => setOverlay({ kind: 'report', run: item })}><span><strong>{item.task.tokenSymbol} risk snapshot {item.source === 'live' && <span className="pill green">Live</span>}</strong><small>{new Date(item.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {item.source === 'live' ? 'Sniffer Risk Check + OKX Market' : SCENARIOS[item.task.scenario]}</small></span><span>{POLICY_INFO[item.task.policy].label}</span><span className={`pill ${item.finalStatus === 'completed' ? 'green' : 'amber'}`}>{item.finalStatus}</span><span><Money cents={item.totalCents} unit /></span><ChevronRight size={16} /></button>)}</div>}<div className="panel-footnote"><Info size={13} /> Up to 30 runs are stored in this browser. Sample and live payment records show their source separately.</div></section>}

        {view === 'treasury' && <div className="treasury-view"><div className="treasury-overview"><section className="panel treasury-summary primary-summary"><Wallet size={24} /><span>Sample spend</span><strong><Money cents={totalSpent} /><small>USDT</small></strong><p>Across {sampleRuns.length} sample procurements</p></section><section className="panel treasury-summary"><Coins size={24} /><span>Confirmed live spend</span><strong><Money cents={liveSpent} /><small>USDT</small></strong><p>{runs.filter(item => item.source === 'live' && item.paymentReceipt?.status === 'success').length} confirmed paid provider calls</p></section><section className="panel treasury-summary"><FileCheck2 size={24} /><span>Delivered snapshots</span><strong>{completedCount}<small>/ {runs.length} runs</small></strong><p>Accepted after the selected checks</p></section><section className="panel treasury-summary"><ShieldCheck size={24} /><span>Budget overruns</span><strong>{runs.filter(item => item.totalCents > item.task.budgetCents).length}</strong><p>Spending ceilings enforced by each flow</p></section></div><section className="panel"><div className="panel-heading"><div><p className="eyebrow muted">SAMPLE SPEND VERSUS LIMIT</p><h2>Room to make better decisions.</h2></div><span className="pill neutral">Last 8 sample runs</span></div>{!sampleRuns.length ? <div className="empty-state"><Gauge size={32} /><h2>No sample spend is recorded yet.</h2><p>Run the sample procurement to see how much of its budget was used.</p><button className="button primary" onClick={() => navigate('workspace')}>Plan your first run <ArrowRight size={16} /></button></div> : <div className="spend-chart">{sampleRuns.slice(0, 8).map(item => <button className="spend-row" key={item.id} onClick={() => setOverlay({ kind: 'report', run: item })}><span><strong>{item.task.tokenSymbol}</strong><small>{POLICY_INFO[item.task.policy].label}</small></span><span className="spend-bar"><span style={{ width: `${item.task.budgetCents ? item.totalCents / item.task.budgetCents * 100 : 0}%` }} /></span><span><Money cents={item.totalCents} /> <small>/ {formatMoney(item.task.budgetCents)}</small></span><ArrowUpRight size={15} /></button>)}</div>}<div className="panel-footnote"><span className="chart-legend"><i /> Simulated spend</span><span>Sample ledger values in USDT; live spend is shown above.</span></div></section><WalletReadinessPanel /><AgentLedgerPanel runs={runs} /></div>}

        <footer className="app-footer"><span><FlaskConical size={13} /> Sample provider ledger · live OKX connections.</span><span>Connected to <a href="https://www.okx.ai/agents/11336" target="_blank" rel="noreferrer">OKX.AI services <ArrowUpRight size={11} /></a></span></footer>
      </main>
    </div>

    {overlay?.kind === 'guide' && <Modal title="Your agents. Your ground rules." eyebrow="WELCOME TO AGENTCO" onClose={() => setOverlay(null)}><p className="modal-lead">A small company of specialists, working within a budget you control.</p><div className="guide-steps">{[
      [Target, 'Set a focused goal', 'Choose a token, set a spend limit, and decide how much assurance you need.'],
      [Network, 'See why the team was chosen', 'Compare capabilities, costs, and simulated performance. Every selection has a reason.'],
      [Wallet, 'Watch your budget work', 'Funds are reserved before execution. Unused reservations return to the available budget.'],
      [FileCheck2, 'Inspect the evidence', 'Review each fact check, see the spend, and export the complete simulated record.'],
    ].map(([Icon, title, text], index) => { const StepIcon = Icon as typeof Target; return <div key={index}><span><StepIcon size={20} /></span><div><h3>{title as string}</h3><p>{text as string}</p></div></div>; })}</div><div className="guide-scenarios"><h3>Explore the workflow</h3><p>Switch policies, lower the budget, or choose a verification mismatch. Use step-by-step mode to explain each decision at your own pace.</p></div><div className="note"><FlaskConical size={17} /><p>The included provider catalog uses sample records. Connected OKX results are labeled separately by source.</p></div><button className="button primary full-width" onClick={() => { setOverlay(null); navigate('workspace'); }}>Explore the workspace <ArrowRight size={17} /></button></Modal>}
    {overlay?.kind === 'compare' && <Modal title="One goal. Three ways to get there." eyebrow="COMPARE PROCUREMENT POLICIES" onClose={() => setOverlay(null)} wide><p className="modal-lead">Same task, same budget. Different priorities change the team and the evidence.</p><div className="compare-grid">{getPlans(task, profiles).map(candidate => { const info = POLICY_INFO[candidate.policy]; return <div key={candidate.policy} className={`compare-card ${candidate.policy === task.policy ? 'current' : ''}`}><info.icon size={24} /><h3>{info.label}</h3><p>{info.short}</p><strong className="compare-price"><Money cents={candidate.expectedCents} /><small> USDT expected</small></strong><dl><div><dt>Worst case</dt><dd><Money cents={candidate.worstCaseCents} /> USDT</dd></div><div><dt>Specialists</dt><dd>{candidate.primaryIds.length}</dd></div><div><dt>Independent checks</dt><dd>{candidate.verifierId ? 'Included' : 'Not included'}</dd></div><div><dt>Fallback</dt><dd>{candidate.fallbackId ? 'Reserved' : 'Not reserved'}</dd></div></dl><p className={candidate.feasible ? 'compare-fit' : 'compare-blocked'}>{candidate.feasible ? 'Fits your budget and deadline' : candidate.blockedReason}</p><button className={`button ${candidate.policy === task.policy ? 'primary' : 'secondary'}`} disabled={inFlight} onClick={() => { updateTask({ policy: candidate.policy }); setOverlay(null); }}>{candidate.policy === task.policy ? 'Current policy' : `Use ${info.label.toLowerCase()}`}</button></div>; })}</div><div className="note"><Info size={16} /><p>Extra assurance increases evidence coverage, not certainty. The included provider catalog uses modeled charges and sample outcomes.</p></div></Modal>}
    {overlay?.kind === 'provider' && <Modal title={overlay.provider.name} eyebrow="SIMULATED AGENT PROFILE" onClose={() => setOverlay(null)}><div className="profile-intro"><ProviderMark provider={overlay.provider} size="large" /><p>{overlay.provider.tagline}</p></div><div className="profile-metrics"><div><span>Per call</span><strong><Money cents={overlay.provider.priceCents} unit /></strong></div><div><span>Fixture market rating</span><strong>{overlay.provider.marketRating.toFixed(1)} <small>/ 5</small></strong></div></div><h3>Task-specific observations</h3><div className="profile-performance"><strong>{Math.round(overlay.provider.accepted / overlay.provider.samples * 100)}<small>% accepted</small></strong><span>{overlay.provider.accepted} / {overlay.provider.samples} simulated observations</span><div className="observation-bars" aria-hidden="true">{Array.from({ length: 30 }, (_, i) => <i className={i / 30 < overlay.provider.accepted / overlay.provider.samples ? 'passed' : ''} style={{ '--bar-height': `${18 + (i * 7 % 21)}px` } as CSSProperties} key={i} />)}</div></div><div className="capability-tags">{overlay.provider.capabilities.map(item => <span key={item}>{item.replaceAll('-', ' ')}</span>)}</div><div className="note"><Info size={16} /><p>Market ratings and task acceptance are separate signals. These are seeded sample observations plus your local runs, not evidence of a real provider’s performance.</p></div>{plan.selectionReasons[overlay.provider.id] && <div className="profile-reason"><Sparkles size={17} /><p>{plan.selectionReasons[overlay.provider.id]}</p></div>}</Modal>}
    {overlay?.kind === 'report' && <Modal title={`${overlay.run.task.tokenSymbol} · Risk snapshot`} eyebrow={`${overlay.run.id} / ${overlay.run.source === 'live' ? 'LIVE REPORT' : 'SAMPLE REPORT'}`} onClose={() => setOverlay(null)} wide><RunReport run={overlay.run} /></Modal>}
    {overlay?.kind === 'event' && <Modal title={overlay.frame.title} eyebrow={`${overlay.run.source === 'live' ? 'LIVE' : 'SAMPLE'} EXECUTION RECORD`} onClose={() => setOverlay(null)}><p className="modal-lead">{overlay.frame.detail}</p><div className="event-record"><div><span>Event ID</span><code>{overlay.frame.id}</code></div><div><span>Run</span><code>{overlay.run.id}</code></div><div><span>Cumulative spend</span><Money cents={overlay.frame.spentCents} unit /></div><div><span>Reserved</span><Money cents={overlay.frame.reservedCents} unit /></div><div><span>Available</span><Money cents={overlay.frame.availableCents} unit /></div></div>{overlay.frame.evidence && <EvidenceTable evidence={overlay.frame.evidence} />}<div className="note"><FlaskConical size={16} /><p>{overlay.run.source === 'live' ? 'This record includes connected provider data. The payment receipt, if one was issued, is attached to the full report.' : 'This record was created by the local simulator. It has no blockchain transaction hash or payment receipt.'}</p></div><button className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify(overlay.frame, null, 2)); setToast('Execution event copied.'); } catch { setToast('Clipboard unavailable. Export the full report instead.'); } }}><Copy size={15} /> Copy event JSON</button></Modal>}
    {toast && <div className="toast" role="status"><CircleCheck size={17} />{toast}</div>}
  </div>;
}
