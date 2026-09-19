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
  const payload = { notice: 'AgentCo simulation. All providers, observations, prices, findings and payments are synthetic. No real transactions.', ...run };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `agentco-${run.id}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function RunReport({ run }: { run: Run }) {
  const evidence = [...run.frames].reverse().find(frame => frame.evidence?.length)?.evidence || [];
  return <>
    <div className={`report-banner ${run.finalStatus}`}><FileCheck2 size={30} /><div><h3>{run.finalStatus === 'completed' ? 'A clearer picture. A complete paper trail.' : 'Every outcome stays accountable.'}</h3><p>{run.finalStatus === 'completed' ? 'Your simulated token risk snapshot is ready.' : run.frames.at(-1)?.detail}</p></div></div>
    <div className="report-summary"><div><span>Asset</span><strong>{run.task.tokenSymbol} <small>on {run.task.chain}</small></strong></div><div><span>Procurement policy</span><strong>{POLICY_INFO[run.task.policy].label}</strong></div><div><span>Simulated spend</span><strong><Money cents={run.totalCents} unit /></strong></div></div>
    <div className="report-address"><span>Contract</span><code>{run.task.tokenAddress}</code></div>
    <div className="section-heading"><h3>What the evidence says</h3><span className="pill neutral">Synthetic findings</span></div>
    {evidence.length ? <EvidenceTable evidence={evidence} /> : <p className="empty-inline">No evidence was purchased for this run.</p>}
    <div className="note"><Info size={16} /><p>Checks cover the displayed facts only. They do not establish token safety or constitute an audit. All findings in this demo are fixtures, not current market data.</p></div>
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
  const plan = run?.plan || currentPlan;
  const frame = run?.frames[frameIndex];
  const inFlight = !!run && frameIndex < run.frames.length - 1;
  const finished = !!run && !inFlight;
  const activeTask = run?.task || task;
  const safeBudget = Number.isFinite(activeTask.budgetCents) ? Math.max(0, activeTask.budgetCents) : 0;
  const primary = profiles.find(p => p.id === plan.primaryIds[0]);
  const fallbackProvider = profiles.find(p => p.id === plan.fallbackId);
  const fallbackTriggered = !!run?.frames.slice(0, frameIndex + 1).some(item => item.kind === 'fallback');
  const plannedAgentCount = plan.primaryIds.length + (plan.verifierId ? 1 : 0);
  const totalSpent = runs.reduce((sum, entry) => sum + entry.totalCents, 0);
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
    treasury: ['ACCOUNTABILITY, DOWN TO THE CENT', 'Keep capital in your corner.', 'A transparent record of your simulated procurement spend.'],
  };

  return <div className="app-shell">
    {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <a className="brand" href="#workspace" onClick={e => { e.preventDefault(); navigate('workspace'); }}><BrandMark /><span>agentco<span className="brand-period">.</span></span></a>
      <div className="workspace-identity"><div className="workspace-symbol"><Layers3 size={18} /></div><div><strong>Builder workspace</strong><span>Personal · Demo</span></div></div>
      <p className="nav-label">OPERATIONS</p>
      <nav aria-label="Main navigation">{navItems.map(item => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} aria-current={view === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={18} strokeWidth={1.7} /><span>{item.label}</span>{item.count !== undefined && <small>{item.count}</small>}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="sidebar-promo"><div className="promo-orbits" aria-hidden="true"><span /><span /><span /><BrandMark small /></div><strong>Small team.<br />Bigger possibilities.</strong><p>Your agents do the work.<br />You set the direction.</p><button onClick={() => setOverlay({ kind: 'guide' })}>Explore the demo <ArrowUpRight size={15} /></button></div>
        <button className="nav-item help-link" onClick={() => setOverlay({ kind: 'guide' })}><BookOpen size={18} /> Demo guide <ArrowUpRight size={14} /></button>
        <div className="event-brand"><span className="okx-mark" aria-hidden="true">▦</span><div>OKX DEV DAY <span>2026 · BUILD A COMPANY</span></div></div>
      </div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={21} /></button><span>Builder workspace</span><ChevronRight size={14} /><strong>{navItems.find(item => item.id === view)?.label}</strong></div><div className="topbar-right"><span className="environment-badge"><span /> Demo environment</span><button className="icon-button top-help" aria-label="Open demo guide" onClick={() => setOverlay({ kind: 'guide' })}><CircleHelp size={19} /></button><span className="avatar" title="Demo workspace">AC</span></div></header>
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
                <div className="form-meta"><span id="token-hint"><ShieldCheck size={13} /> Read-only research · synthetic data</span><label htmlFor="deadline"><Clock3 size={13} /> Delivery window <select id="deadline" disabled={inFlight} value={task.deadlineSeconds} onChange={e => updateTask({ deadlineSeconds: Number(e.target.value) })}><option value={10}>10 sec</option><option value={15}>15 sec</option><option value={30}>30 sec</option><option value={45}>45 sec</option><option value={60}>60 sec</option></select></label></div>
                <div className="policy-section"><div className="section-heading"><h3>How should your agents work?</h3><button type="button" className="text-button" onClick={() => setOverlay({ kind: 'compare' })}>Compare policies <ArrowUpRight size={13} /></button></div><div className="policy-options" role="radiogroup" aria-label="Procurement policy">{(Object.keys(POLICY_INFO) as Policy[]).map(policy => { const item = POLICY_INFO[policy]; return <label key={policy} className={`policy-card ${task.policy === policy ? 'selected' : ''} ${inFlight ? 'disabled' : ''}`}><input type="radio" name="procurement-policy" value={policy} checked={task.policy === policy} disabled={inFlight} onChange={() => updateTask({ policy })} /><div><item.icon size={17} /><span className="radio-dot">{task.policy === policy && <span />}</span></div><strong>{item.label}</strong><p>{item.detail}</p></label>; })}</div></div>
              </form>
            </section>

            <section className="panel procurement-panel"><div className="panel-heading"><div><p className="eyebrow muted">THE PROCUREMENT PLAN</p><h2>A team chosen with intention.</h2></div><span className="pill blue"><Network size={12} /> {plannedAgentCount} {plannedAgentCount === 1 ? 'agent' : 'agents'} in plan</span></div>
              <div className="provider-table" role="table" aria-label="Candidate agent comparison"><div className="provider-row table-head" role="row"><span role="columnheader">SPECIALIST</span><span role="columnheader">PER CALL</span><span role="columnheader">DEMO HISTORY</span><span role="columnheader">ROLE IN PLAN</span></div>{profiles.filter(p => p.role === 'analyst').map(provider => { const selected = plan.primaryIds.includes(provider.id); const fallback = plan.fallbackId === provider.id; return <div role="row" key={provider.id} className={`provider-row ${selected ? 'chosen' : ''}`}><div role="cell"><button className="provider-name" onClick={() => setOverlay({ kind: 'provider', provider })}><ProviderMark provider={provider} /><span><strong>{provider.name} <ArrowUpRight size={11} /></strong><small>{provider.tagline}</small></span></button></div><span role="cell"><Money cents={provider.priceCents} /><small className="cell-sub">USDT</small></span><span className="performance-cell" role="cell"><strong>{Math.round(provider.accepted / provider.samples * 100)}<small>%</small></strong><span className="mini-track"><span style={{ width: `${provider.accepted / provider.samples * 100}%` }} /></span><small>{provider.accepted}/{provider.samples} simulated</small></span><span role="cell">{selected ? <span className="pill blue"><Check size={12} /> Selected</span> : fallback ? <span className={`pill ${fallbackTriggered ? 'green' : 'amber'}`}>{fallbackTriggered ? 'Fallback used' : 'On standby'}</span> : <span className="muted role-other">Not selected</span>}</span></div>; })}</div>
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
              <p className="no-funds"><FlaskConical size={12} /> Simulation only. No real funds.</p>
            </section>
            {!plan.feasible && <div className="blocked-notice" role="alert"><Info size={18} /><div><strong>Before you run</strong><p>{plan.blockedReason}</p></div></div>}
            <section className="panel reasoning-card"><div className="section-heading"><span className="small-icon"><Sparkles size={17} /></span><h3>Good judgment, made visible.</h3></div><p>{plan.feasible ? plan.reason : 'Adjust your budget, deadline, or policy to find a feasible plan.'}</p><div className="reason-tags"><span><CheckCheck size={13} /> Budget checked</span><span><Clock3 size={13} /> Deadline aware</span></div>{plan.fallbackId && <div className="fallback-note"><RotateCcw size={15} /><span>{fallbackProvider?.name} {fallbackTriggered ? 'was activated as the fallback.' : 'is ready if verification fails.'}</span></div>}</section>
            <section className="scenario-card"><div><FlaskConical size={16} /><h3>Explore an outcome</h3><span className="pill neutral">DEMO</span></div><div className="select-wrap"><select aria-label="Demo scenario" disabled={inFlight} value={task.scenario} onChange={e => updateTask({ scenario: e.target.value as Scenario })}>{Object.entries(SCENARIOS).map(([key, value]) => <option value={key} key={key}>{value}</option>)}</select><ChevronDown size={14} /></div><label className="manual-toggle"><input type="checkbox" checked={manual} disabled={inFlight} onChange={e => setManual(e.target.checked)} /><span>Start in step-by-step mode</span></label></section>
          </aside>

          <section className="panel activity-panel"><div className="panel-heading"><div className="heading-with-icon"><span className="section-icon subtle"><History size={18} /></span><h2>Execution journal</h2>{run && <span className={`pill ${finished ? run.finalStatus === 'completed' ? 'green' : 'amber' : 'blue'}`}>{finished ? run.finalStatus : playing ? 'Running' : 'Paused'}</span>}</div><div className="journal-actions">{run && <><span className="journal-progress">{frameIndex + 1} / {run.frames.length} events</span><button className="text-button" onClick={() => { setPlaying(false); setRun(null); setFrameIndex(0); }}>Reset run <RotateCcw size={13} /></button></>}<span className="pill neutral">Simulated events</span></div></div>
            {!run ? <div className="journal-empty"><span className="journal-empty-icon"><AudioLines size={23} /></span><div><strong>The plan is ready. The story starts with you.</strong><p>Run procurement to follow every decision, reservation, and evidence check.</p></div><span className="empty-dots" aria-hidden="true"><i /><i /><i /></span></div> : <><div className="run-progress-track"><span style={{ width: `${frame?.progress || 0}%` }} /></div><div ref={journalRef} className="journal-list" aria-live="polite" aria-relevant="additions">{run.frames.slice(0, frameIndex + 1).map((event, index) => <button key={event.id} className={`journal-event ${event.kind}`} onClick={() => setOverlay({ kind: 'event', run, frame: event })}><span className="event-time">{String(index + 1).padStart(2, '0')}</span><span className="event-dot">{event.kind === 'failed' ? <X size={12} /> : event.kind === 'verification' ? <ShieldCheck size={12} /> : event.kind === 'payment' ? <Coins size={12} /> : <Check size={12} />}</span><span className="event-copy"><strong>{event.title}</strong><span>{event.detail}</span></span><span className="event-cost"><Money cents={event.spentCents} /><small>spent</small></span><ChevronRight size={14} /></button>)}</div>{finished && <div className={`journal-result ${run.finalStatus}`}><CircleCheck size={21} /><div><strong>{run.finalStatus === 'completed' ? 'Delivered, with the evidence to back it up.' : 'The run stopped with a clear record.'}</strong><span>{formatMoney(run.totalCents)} USDT spent · {formatMoney(Math.max(0, run.task.budgetCents - run.totalCents))} USDT unspent</span></div><button className="button secondary" onClick={() => setOverlay({ kind: 'report', run })}>Review outcome <ArrowUpRight size={15} /></button></div>}{!finished && latestEvidence().length > 0 && <div className="inline-evidence"><ShieldCheck size={14} /> {latestEvidence().filter(e => e.status === 'passed').length} checks matched · inspect the verification event for details</div>}</>}
          </section>
        </div>}

        {view === 'providers' && <section className="directory-view"><div className="view-toolbar"><div className="filter-tabs" aria-label="Agent type">{(['all', 'analyst', 'verifier'] as const).map(filter => <button className={providerFilter === filter ? 'active' : ''} key={filter} aria-pressed={providerFilter === filter} onClick={() => setProviderFilter(filter)}>{filter === 'all' ? 'All agents' : filter === 'analyst' ? 'Analysts' : 'Verifiers'}</button>)}</div><div className="search-wrap"><Search size={16} /><input aria-label="Search agents" placeholder="Find a specialist…" value={providerQuery} onChange={e => setProviderQuery(e.target.value)} /></div></div><div className="directory-grid">{visibleProviders.map(provider => <article className="panel directory-card" key={provider.id}><div className="directory-top"><ProviderMark provider={provider} size="large" /><span className="pill neutral">{provider.role === 'analyst' ? 'Risk specialist' : 'Evidence verifier'}</span></div><h2>{provider.name}</h2><p>{provider.tagline}</p><div className="capability-tags">{provider.capabilities.map(capability => <span key={capability}>{capability.replaceAll('-', ' ')}</span>)}</div><div className="directory-stats"><div><span>Per call</span><strong><Money cents={provider.priceCents} /> <small>USDT</small></strong></div><div><span>Demo acceptance</span><strong>{Math.round(provider.accepted / provider.samples * 100)}<small>%</small></strong></div><div><span>Response</span><strong>{provider.latencySeconds}<small>s</small></strong></div></div><button className="text-button" onClick={() => setOverlay({ kind: 'provider', provider })}>View agent profile <ArrowUpRight size={15} /></button></article>)}</div>{!visibleProviders.length && <div className="panel empty-state"><Search size={30} /><h2>No specialists match that search.</h2><button className="button secondary" onClick={() => { setProviderQuery(''); setProviderFilter('all'); }}>Show all agents</button></div>}<div className="note"><FlaskConical size={17} /><p>These four agents are fictional demo providers. Prices, market ratings, and seed histories are simulated. Completed demo runs add local observations to future decisions.</p></div></section>}

        {view === 'history' && <section className="panel history-panel"><div className="panel-heading"><h2>Your procurement history <span className="count-badge">{runs.length}</span></h2><div className="filter-tabs">{['all', 'completed', 'failed', 'blocked'].map(filter => <button key={filter} className={historyFilter === filter ? 'active' : ''} aria-pressed={historyFilter === filter} onClick={() => setHistoryFilter(filter)}>{filter[0].toUpperCase() + filter.slice(1)}</button>)}</div></div>{!visibleRuns.length ? <div className="empty-state"><History size={32} /><h2>{runs.length ? 'No runs in this category.' : 'Your first decision is waiting.'}</h2><p>{runs.length ? 'Choose another filter to explore your history.' : 'Complete a procurement to see its decisions, costs, and evidence here.'}</p><button className="button primary" onClick={() => navigate('workspace')}>Open workspace <ArrowRight size={16} /></button></div> : <div className="history-table"><div className="history-row table-head"><span>PROCUREMENT</span><span>POLICY</span><span>OUTCOME</span><span>SPEND</span><span /></div>{visibleRuns.map(item => <button className="history-row" key={item.id} onClick={() => setOverlay({ kind: 'report', run: item })}><span><strong>{item.task.tokenSymbol} risk snapshot</strong><small>{new Date(item.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {SCENARIOS[item.task.scenario]}</small></span><span>{POLICY_INFO[item.task.policy].label}</span><span className={`pill ${item.finalStatus === 'completed' ? 'green' : 'amber'}`}>{item.finalStatus}</span><span><Money cents={item.totalCents} unit /></span><ChevronRight size={16} /></button>)}</div>}<div className="panel-footnote"><Info size={13} /> Demo history is stored in this browser. Up to 30 runs are retained.</div></section>}

        {view === 'treasury' && <div className="treasury-view"><div className="treasury-overview"><section className="panel treasury-summary primary-summary"><Wallet size={24} /><span>Total simulated spend</span><strong><Money cents={totalSpent} /><small>USDT</small></strong><p>Across {runs.length} recorded procurements</p></section><section className="panel treasury-summary"><FileCheck2 size={24} /><span>Delivered snapshots</span><strong>{completedCount}<small>/ {runs.length} runs</small></strong><p>Accepted after the selected checks</p></section><section className="panel treasury-summary"><ShieldCheck size={24} /><span>Budget overruns</span><strong>{runs.filter(item => item.totalCents > item.task.budgetCents).length}</strong><p>Spending ceilings enforced by the planner</p></section></div><section className="panel"><div className="panel-heading"><div><p className="eyebrow muted">SPEND VERSUS LIMIT</p><h2>Room to make better decisions.</h2></div><span className="pill neutral">Last 8 runs</span></div>{!runs.length ? <div className="empty-state"><Gauge size={32} /><h2>A clean ledger. A fresh start.</h2><p>Run a procurement to see how much of the budget was used.</p><button className="button primary" onClick={() => navigate('workspace')}>Plan your first run <ArrowRight size={16} /></button></div> : <div className="spend-chart">{runs.slice(0, 8).map(item => <button className="spend-row" key={item.id} onClick={() => setOverlay({ kind: 'report', run: item })}><span><strong>{item.task.tokenSymbol}</strong><small>{POLICY_INFO[item.task.policy].label}</small></span><span className="spend-bar"><span style={{ width: `${item.task.budgetCents ? item.totalCents / item.task.budgetCents * 100 : 0}%` }} /></span><span><Money cents={item.totalCents} /> <small>/ {formatMoney(item.task.budgetCents)}</small></span><ArrowUpRight size={15} /></button>)}</div>}<div className="panel-footnote"><span className="chart-legend"><i /> Actual simulated spend</span><span>All values in USDT · no wallet connected</span></div></section></div>}

        <footer className="app-footer"><span><FlaskConical size={13} /> Simulated providers, payments & evidence. Always.</span><span>Built with intention for <a href="https://luma.com/l4aq8vii" target="_blank" rel="noreferrer">OKX Dev Day <ArrowUpRight size={11} /></a></span></footer>
      </main>
    </div>

    {overlay?.kind === 'guide' && <Modal title="Your agents. Your ground rules." eyebrow="WELCOME TO AGENTCO" onClose={() => setOverlay(null)}><p className="modal-lead">A small company of specialists, working within a budget you control.</p><div className="guide-steps">{[
      [Target, 'Set a focused goal', 'Choose a token, set a spend limit, and decide how much assurance you need.'],
      [Network, 'See why the team was chosen', 'Compare capabilities, costs, and simulated performance. Every selection has a reason.'],
      [Wallet, 'Watch your budget work', 'Funds are reserved before execution. Unused reservations return to the available budget.'],
      [FileCheck2, 'Inspect the evidence', 'Review each fact check, see the spend, and export the complete simulated record.'],
    ].map(([Icon, title, text], index) => { const StepIcon = Icon as typeof Target; return <div key={index}><span><StepIcon size={20} /></span><div><h3>{title as string}</h3><p>{text as string}</p></div></div>; })}</div><div className="guide-scenarios"><h3>Make the demo your own</h3><p>Switch policies, lower the budget, or choose a verification mismatch. Use step-by-step mode to explain each decision at your own pace.</p></div><div className="note"><FlaskConical size={17} /><p>Everything runs locally with synthetic data. No wallet connection, paid API call, or real transfer is made.</p></div><button className="button primary full-width" onClick={() => { setOverlay(null); navigate('workspace'); }}>Explore the workspace <ArrowRight size={17} /></button></Modal>}
    {overlay?.kind === 'compare' && <Modal title="One goal. Three ways to get there." eyebrow="COMPARE PROCUREMENT POLICIES" onClose={() => setOverlay(null)} wide><p className="modal-lead">Same task, same budget. Different priorities change the team and the evidence.</p><div className="compare-grid">{getPlans(task, profiles).map(candidate => { const info = POLICY_INFO[candidate.policy]; return <div key={candidate.policy} className={`compare-card ${candidate.policy === task.policy ? 'current' : ''}`}><info.icon size={24} /><h3>{info.label}</h3><p>{info.short}</p><strong className="compare-price"><Money cents={candidate.expectedCents} /><small> USDT expected</small></strong><dl><div><dt>Worst case</dt><dd><Money cents={candidate.worstCaseCents} /> USDT</dd></div><div><dt>Specialists</dt><dd>{candidate.primaryIds.length}</dd></div><div><dt>Independent checks</dt><dd>{candidate.verifierId ? 'Included' : 'Not included'}</dd></div><div><dt>Fallback</dt><dd>{candidate.fallbackId ? 'Reserved' : 'Not reserved'}</dd></div></dl><p className={candidate.feasible ? 'compare-fit' : 'compare-blocked'}>{candidate.feasible ? 'Fits your budget and deadline' : candidate.blockedReason}</p><button className={`button ${candidate.policy === task.policy ? 'primary' : 'secondary'}`} disabled={inFlight} onClick={() => { updateTask({ policy: candidate.policy }); setOverlay(null); }}>{candidate.policy === task.policy ? 'Current policy' : `Use ${info.label.toLowerCase()}`}</button></div>; })}</div><div className="note"><Info size={16} /><p>Extra assurance increases evidence coverage, not certainty. Costs and outcomes shown here are simulated; no money is moved.</p></div></Modal>}
    {overlay?.kind === 'provider' && <Modal title={overlay.provider.name} eyebrow="SIMULATED AGENT PROFILE" onClose={() => setOverlay(null)}><div className="profile-intro"><ProviderMark provider={overlay.provider} size="large" /><p>{overlay.provider.tagline}</p></div><div className="profile-metrics"><div><span>Per call</span><strong><Money cents={overlay.provider.priceCents} unit /></strong></div><div><span>Fixture market rating</span><strong>{overlay.provider.marketRating.toFixed(1)} <small>/ 5</small></strong></div></div><h3>Task-specific observations</h3><div className="profile-performance"><strong>{Math.round(overlay.provider.accepted / overlay.provider.samples * 100)}<small>% accepted</small></strong><span>{overlay.provider.accepted} / {overlay.provider.samples} simulated observations</span><div className="observation-bars" aria-hidden="true">{Array.from({ length: 30 }, (_, i) => <i className={i / 30 < overlay.provider.accepted / overlay.provider.samples ? 'passed' : ''} style={{ '--bar-height': `${18 + (i * 7 % 21)}px` } as CSSProperties} key={i} />)}</div></div><div className="capability-tags">{overlay.provider.capabilities.map(item => <span key={item}>{item.replaceAll('-', ' ')}</span>)}</div><div className="note"><Info size={16} /><p>Market ratings and task acceptance are separate signals. These are seeded demo observations plus your local runs, not evidence of a real provider’s performance.</p></div>{plan.selectionReasons[overlay.provider.id] && <div className="profile-reason"><Sparkles size={17} /><p>{plan.selectionReasons[overlay.provider.id]}</p></div>}</Modal>}
    {overlay?.kind === 'report' && <Modal title={`${overlay.run.task.tokenSymbol} · Risk snapshot`} eyebrow={`${overlay.run.id} / DEMO REPORT`} onClose={() => setOverlay(null)} wide><RunReport run={overlay.run} /></Modal>}
    {overlay?.kind === 'event' && <Modal title={overlay.frame.title} eyebrow="SIMULATED EXECUTION RECORD" onClose={() => setOverlay(null)}><p className="modal-lead">{overlay.frame.detail}</p><div className="event-record"><div><span>Event ID</span><code>{overlay.frame.id}</code></div><div><span>Run</span><code>{overlay.run.id}</code></div><div><span>Cumulative spend</span><Money cents={overlay.frame.spentCents} unit /></div><div><span>Reserved</span><Money cents={overlay.frame.reservedCents} unit /></div><div><span>Available</span><Money cents={overlay.frame.availableCents} unit /></div></div>{overlay.frame.evidence && <EvidenceTable evidence={overlay.frame.evidence} />}<div className="note"><FlaskConical size={16} /><p>This record was created by the local simulator. It has no blockchain transaction hash or payment receipt.</p></div><button className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify(overlay.frame, null, 2)); setToast('Simulated event copied.'); } catch { setToast('Clipboard unavailable. Export the full report instead.'); } }}><Copy size={15} /> Copy event JSON</button></Modal>}
    {toast && <div className="toast" role="status"><CircleCheck size={17} />{toast}</div>}
  </div>;
}
