'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import KpiCard from './KpiCard';
import DataTable from './DataTable';
import ChartPanel from './ChartPanel';
import { ScheduleHistory, ScheduleView, ScheduleEntry } from './ScheduleTable';
import { getStoredToken, setStoredToken, clearStoredToken, commitSchedule } from '../lib/githubApi';

// ── Types ──────────────────────────────────────────────
interface ParsedData {
  columns: string[];
  rows: Record<string, any>[];
  numericCols: string[];
  labelCol: string;
  fileName: string;
  uploadedAt?: string;
}

type ActiveTab = 'dashboard' | 'schedule';

// ── Constants ──────────────────────────────────────────
const LS_KEY_PERF    = 'fcca_dashboard_data';
const LS_KEY_SCHED   = 'fcca_schedule_history_v1';
const PUBLIC_PERF_URL  = '/fcca-sports/data.xlsx';
const SCHED_BASE_URL   = '/fcca-sports/schedules/'; // base URL for public/schedules/


// ── Helpers ────────────────────────────────────────────
const ICONS: Record<string, string> = {
  total:'👥', avg:'📊', max:'🏆', min:'📉',
  score:'🎯', weight:'⚖️', height:'📏', age:'🎂',
  time:'⏱️', default:'📈'
};
function iconFor(label: string) {
  const l = label.toLowerCase();
  for (const key of Object.keys(ICONS)) if (l.includes(key)) return ICONS[key];
  return ICONS.default;
}
function fmt(v: number) {
  if (isNaN(v)) return '—';
  if (Math.abs(v) >= 1e6) return (v/1e6).toFixed(1)+'M';
  if (Math.abs(v) >= 1e3) return (v/1e3).toFixed(1)+'K';
  return v%1===0 ? String(v) : v.toFixed(2);
}

function parseArrayBuffer(data: ArrayBuffer, fileName: string, rawMode = true): ParsedData {
  const wb = XLSX.read(new Uint8Array(data), { type:'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // raw:false = use Excel's formatted text (preserves "5:30 PM" etc.)
  // raw:true  = raw numbers (needed for KPI calculations)
  const rows: Record<string,any>[] = XLSX.utils.sheet_to_json(ws, { defval: null, raw: rawMode });
  if (!rows.length) throw new Error('No data found in file');
  const columns = Object.keys(rows[0]);
  const numericCols = columns.filter(col =>
    rows.slice(0,20).filter(r => r[col]!==null && r[col]!=='').some(r => !isNaN(parseFloat(r[col])))
  );
  const labelCol = columns.find(c =>
    !numericCols.includes(c) && rows.filter(r => r[c]).length > rows.length*0.5
  ) ?? columns[0];
  return { columns, rows, numericCols, labelCol, fileName, uploadedAt: new Date().toLocaleString() };
}
function parseFile(file: File, rawMode = true): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try { resolve(parseArrayBuffer(e.target!.result as ArrayBuffer, file.name, rawMode)); }
      catch(err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function buildKpis(parsed: ParsedData) {
  const { rows, numericCols, fileName } = parsed;
  const kpis: {label:string;value:string;sub?:string;icon?:string}[] = [];
  kpis.push({ label:'Total Players', value:String(rows.length), sub:fileName, icon:'👥' });
  numericCols.slice(0,7).forEach(col => {
    const vals = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    if (!vals.length) return;
    const avg = vals.reduce((a,b)=>a+b,0)/vals.length;
    const max = Math.max(...vals), min = Math.min(...vals);
    kpis.push({
      label: col.length>20 ? col.slice(0,20)+'…' : col,
      value: fmt(avg),
      sub: `Max: ${fmt(max)}  •  Min: ${fmt(min)}  •  n=${vals.length}`,
      icon: iconFor(col),
    });
  });
  return kpis;
}

// ── localStorage helpers ───────────────────────────────
function lsSave(key: string, data: ParsedData) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}
function lsLoad(key: string): ParsedData | null {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; }
}
function lsClear(key: string) {
  try { localStorage.removeItem(key); } catch {}
}

// ── FCCA SVG Logo ──────────────────────────────────────
function FCCALogo() {
  return (
    <svg viewBox="0 0 400 110" xmlns="http://www.w3.org/2000/svg" className="fcca-svg">
      <rect width="400" height="110" rx="10" fill="#0a1172"/>
      <line x1="22" y1="24" x2="22" y2="82" stroke="#FFD700" strokeWidth="3.5"/>
      <line x1="32" y1="22" x2="32" y2="82" stroke="#FFD700" strokeWidth="3.5"/>
      <line x1="42" y1="24" x2="42" y2="82" stroke="#FFD700" strokeWidth="3.5"/>
      <line x1="19" y1="22" x2="45" y2="22" stroke="#FFD700" strokeWidth="2.8"/>
      <rect x="44" y="36" width="12" height="44" rx="4" fill="#FFD700" transform="rotate(-32 44 36)"/>
      <rect x="34" y="72" width="14" height="9" rx="3" fill="#FFD700" transform="rotate(-32 34 72)"/>
      <circle cx="64" cy="76" r="5" fill="#FFD700"/>
      <text x="82" y="68" fontFamily="Arial Black, Arial" fontWeight="900" fontSize="42" fill="#FFD700" letterSpacing="3">FCCA</text>
      <text x="82" y="90" fontFamily="Arial" fontWeight="600" fontSize="10" fill="#FFD700" letterSpacing="1.5">FRISCO COMMUNITY CRICKET ASSOCIATION</text>
    </svg>
  );
}

// ── Upload Zone ────────────────────────────────────────
function UploadZone({ onFiles, loading, msg }: {
  onFiles: (f: FileList) => void;
  loading: boolean;
  msg?: string;
}) {
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className={`upload-zone ${drag ? 'drag-over' : ''}`}
         onClick={() => ref.current?.click()}
         onDragOver={e => { e.preventDefault(); setDrag(true); }}
         onDragLeave={() => setDrag(false)}
         onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files) onFiles(e.dataTransfer.files); }}>
      <input ref={ref} type="file" accept=".xlsx,.xls,.csv"
             onChange={e => e.target.files && onFiles(e.target.files)} />
      <div className="upload-icon">{loading ? '⏳' : '📂'}</div>
      <h3>{loading ? (msg ?? 'Loading…') : 'Drop your Excel / CSV file here'}</h3>
      <p>{loading ? 'Please wait…' : 'Supports .xlsx  ·  .xls  ·  .csv'}</p>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────
export default function DashboardShell() {
  const [tab, setTab] = useState<ActiveTab>('dashboard');

  // Performance tab state
  const [perf, setPerf] = useState<ParsedData|null>(null);
  const [perfSource, setPerfSource] = useState<'public'|'local'|'new'|null>(null);
  const [perfLoading, setPerfLoading] = useState(true);
  const [perfMsg, setPerfMsg] = useState('Loading saved dashboard…');
  const [perfError, setPerfError] = useState('');
  const perfInput = useRef<HTMLInputElement>(null);

  // Schedule tab state — history array
  const [schedHistory, setSchedHistory] = useState<ScheduleEntry[]>([]);
  const [activeSchedId, setActiveSchedId] = useState<string|null>(null);
  const [schedLoading, setSchedLoading] = useState(false);
  const [schedError, setSchedError] = useState('');
  const [schedStatus, setSchedStatus] = useState(''); // progress message
  const schedInput = useRef<HTMLInputElement>(null);

  // GitHub token settings
  const [ghToken, setGhToken] = useState('');
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenInput, setTokenInput] = useState('');

  // Derived: currently selected entry
  const activeSched = schedHistory.find(e => e.id === activeSchedId) ?? null;

  // Load GitHub token from localStorage on mount
  useEffect(() => { setGhToken(getStoredToken()); }, []);

  // ── Auto-load on mount ─────────────────────────────
  useEffect(() => {
    // Performance data
    (async () => {
      const saved = lsLoad(LS_KEY_PERF);
      if (saved) { setPerf(saved); setPerfSource('local'); setPerfLoading(false); return; }
      try {
        setPerfMsg('Loading shared dashboard data…');
        const res = await fetch(PUBLIC_PERF_URL, { cache:'no-store' });
        if (res.ok) {
          const p = parseArrayBuffer(await res.arrayBuffer(), 'FCCA Shared Data');
          p.uploadedAt = undefined;
          setPerf(p); setPerfSource('public');
        }
      } catch {}
      setPerfLoading(false);
    })();

    // Schedule history: merge public manifest (shared) + localStorage (personal uploads)
    (async () => {
      const localEntries: ScheduleEntry[] = [];
      const publicEntries: ScheduleEntry[] = [];

      // 1. Load localStorage personal uploads
      try {
        const raw = localStorage.getItem(LS_KEY_SCHED);
        if (raw) {
          const hist: ScheduleEntry[] = JSON.parse(raw);
          localEntries.push(...hist);
        }
      } catch {}

      // 2. Load public manifest (visible to everyone who visits the live URL)
      try {
        const res = await fetch(`${SCHED_BASE_URL}manifest.json`, { cache: 'no-store' });
        if (res.ok) {
          const manifest: { schedules: { id: string; file: string; label: string; addedAt: string }[] } = await res.json();
          for (const item of manifest.schedules) {
            try {
              const fileRes = await fetch(`${SCHED_BASE_URL}${item.file}`, { cache: 'no-store' });
              if (!fileRes.ok) continue;
              let rows: Record<string, any>[] = [];
              let cols: string[] = [];
              if (item.file.endsWith('.json')) {
                // Committed via GitHub API (JSON format)
                const data: { columns: string[]; rows: Record<string,any>[] } = await fileRes.json();
                rows = data.rows; cols = data.columns;
              } else {
                // Legacy Excel file committed via npm script
                const wb = XLSX.read(new Uint8Array(await fileRes.arrayBuffer()), { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false }) as Record<string,any>[];
                if (rows.length) cols = Object.keys(rows[0]);
              }
              if (!rows.length) continue;
              publicEntries.push({
                id: `pub_${item.id}`,
                fileName: item.label,
                uploadedAt: `🌐 Shared · ${item.addedAt}`,
                columns: cols,
                rows,
              });
            } catch {}
          }
        }
      } catch {}

      // Merge: public entries (shared) + local entries (personal, marked)
      const merged = [
        ...publicEntries,
        ...localEntries.map(e => ({ ...e, fileName: `🖥️ ${e.fileName}` })),
      ];
      if (merged.length) {
        setSchedHistory(merged);
        setActiveSchedId(merged[0].id);
      }
    })();
  }, []);



  // ── File handlers ──────────────────────────────────
  const handlePerfFiles = useCallback(async (files: FileList) => {
    if (!files[0]) return;
    setPerfLoading(true); setPerfMsg('Parsing file…'); setPerfError('');
    try {
      const p = await parseFile(files[0]);
      setPerf(p); setPerfSource('new'); lsSave(LS_KEY_PERF, p);
    } catch (e: any) { setPerfError(e.message ?? 'Failed to parse file.'); }
    finally { setPerfLoading(false); }
  }, []);

  const handleSchedFiles = useCallback(async (files: FileList) => {
    if (!files[0]) return;
    setSchedLoading(true); setSchedError(''); setSchedStatus('Parsing file…');
    try {
      const buf = await files[0].arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type:'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false }) as Record<string,any>[];
      if (!rows.length) throw new Error('No data found in file');
      const cols = Object.keys(rows[0]);
      const token = getStoredToken();

      if (token) {
        // ── GitHub API commit: makes file visible to ALL visitors ──
        setSchedStatus('Committing to GitHub… (everyone will see this in ~2 min)');
        const slug = files[0].name.replace(/\s+/g, '_').replace(/\.[^.]+$/, '');
        const label = files[0].name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
        await commitSchedule(token, slug, label, rows, cols);
        setSchedStatus('✅ Committed! Reloading shared schedules…');
        // Reload public entries to pick up newly committed file
        const res = await fetch(`${SCHED_BASE_URL}manifest.json`, { cache: 'no-store' });
        if (res.ok) {
          const manifest: { schedules: { id: string; file: string; label: string; addedAt: string }[] } = await res.json();
          const publicEntries: ScheduleEntry[] = [];
          for (const item of manifest.schedules) {
            try {
              const fileRes = await fetch(`${SCHED_BASE_URL}${item.file}`, { cache: 'no-store' });
              if (!fileRes.ok) continue;
              let entryRows: Record<string, any>[] = [];
              let entryCols: string[] = [];
              if (item.file.endsWith('.json')) {
                const data: { columns: string[]; rows: Record<string,any>[] } = await fileRes.json();
                entryRows = data.rows; entryCols = data.columns;
              } else {
                const wbE = XLSX.read(new Uint8Array(await fileRes.arrayBuffer()), { type: 'array' });
                const wsE = wbE.Sheets[wbE.SheetNames[0]];
                entryRows = XLSX.utils.sheet_to_json(wsE, { defval: null, raw: false }) as Record<string,any>[];
                if (entryRows.length) entryCols = Object.keys(entryRows[0]);
              }
              if (!entryRows.length) continue;
              publicEntries.push({ id: `pub_${item.id}`, fileName: item.label, uploadedAt: `🌐 Shared · ${item.addedAt}`, columns: entryCols, rows: entryRows });
            } catch {}
          }
          if (publicEntries.length) { setSchedHistory(publicEntries); setActiveSchedId(publicEntries[0].id); }
        }
        setSchedStatus('');
      } else {
        // ── No token: show in this browser only + prompt for token ──
        const id = Date.now().toString();
        const entry: ScheduleEntry = {
          id,
          fileName: `🖥️ ${files[0].name} (your browser only)`,
          uploadedAt: new Date().toLocaleString(),
          columns: cols,
          rows,
        };
        setSchedHistory(prev => { const u = [entry, ...prev]; try { localStorage.setItem(LS_KEY_SCHED, JSON.stringify(u)); } catch {} return u; });
        setActiveSchedId(id);
        setSchedError('⚠️ No GitHub token set — only YOU can see this upload. Click ⚙️ Settings to add your token so uploads are shared with everyone.');
      }
    } catch (e: any) { setSchedError(e.message ?? 'Failed to process file.'); setSchedStatus(''); }
    finally { setSchedLoading(false); }
  }, []);

  const deleteSchedEntry = useCallback((id: string) => {
    setSchedHistory(prev => {
      const updated = prev.filter(e => e.id !== id);
      try { localStorage.setItem(LS_KEY_SCHED, JSON.stringify(updated)); } catch {}
      return updated;
    });
    setActiveSchedId(prev => {
      if (prev !== id) return prev;
      const remaining = schedHistory.filter(e => e.id !== id);
      return remaining.length ? remaining[0].id : null;
    });
  }, [schedHistory]);

  const saveToken = () => {
    setStoredToken(tokenInput);
    setGhToken(tokenInput.trim());
    setTokenInput('');
    setShowTokenModal(false);
    setSchedError('');
  };
  const removeToken = () => { clearStoredToken(); setGhToken(''); setShowTokenModal(false); };


  const kpis = perf ? buildKpis(perf) : [];

  // ── Source banner text ────────────────────────────
  const PersistBanner = ({ source, data, onUpdate, onClear }: {
    source: 'public'|'local'|'new'|null;
    data: ParsedData;
    onUpdate: () => void;
    onClear: () => void;
  }) => (
    <div className={`persist-banner ${source==='public'?'persist-public':source==='local'?'persist-local':'persist-new'}`}>
      <div className="persist-info">
        {source==='public' && <><span>🌐</span><span>Shared data — visible to everyone who visits this URL</span></>}
        {source==='local'  && <><span>💾</span><span>Restored from your last upload: <strong>{data.fileName}</strong>{data.uploadedAt ? ` — ${data.uploadedAt}` : ''}</span></>}
        {source==='new'    && <><span>✅</span><span>Loaded: <strong>{data.fileName}</strong> — saved to your browser</span></>}
      </div>
      <div className="persist-actions">
        <button className="persist-btn" onClick={onUpdate}>🔄 Update File</button>
        {source!=='public' && <button className="persist-btn persist-clear" onClick={onClear}>✖ Clear</button>}
      </div>
    </div>
  );

  return (
    <div className="shell">

      {/* ── Brand Header ── */}
      <div className="brand-bar">
        <div className="brand-fcca">
          <FCCALogo />
          <a href="https://www.facebook.com/share/1BczvQcatd/?mibextid=wwXIfr"
             target="_blank" rel="noopener noreferrer" className="fb-btn">
            <span className="fb-icon">f</span>
            Like &nbsp;·&nbsp; Share &nbsp;·&nbsp; Follow
          </a>
        </div>
        <div className="brand-title">
          <h1>FCCA Sports Hub</h1>
          <p>Frisco Community Cricket Association</p>
        </div>
        <div className="brand-yash">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fcca-sports/yash-logo.png" alt="YASH Technologies" className="yash-img" />
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="tab-bar">
        <button
          className={`tab-btn ${tab==='dashboard' ? 'tab-active' : ''}`}
          onClick={() => setTab('dashboard')}
        >
          📊 Performance Dashboard
        </button>
        <button
          className={`tab-btn ${tab==='schedule' ? 'tab-active' : ''}`}
          onClick={() => setTab('schedule')}
        >
          📅 Planning Schedule
        </button>
      </div>

      {/* ══════════════════════════════════════════════
          TAB 1 — Performance Dashboard
      ══════════════════════════════════════════════ */}
      {tab === 'dashboard' && (
        <>
          {perf && (
            <PersistBanner
              source={perfSource}
              data={perf}
              onUpdate={() => perfInput.current?.click()}
              onClear={() => { lsClear(LS_KEY_PERF); setPerf(null); setPerfSource(null); }}
            />
          )}
          {/* Hidden input when data already loaded */}
          <input ref={perfInput} type="file" accept=".xlsx,.xls,.csv"
                 style={{ display:'none' }} onChange={e => e.target.files && handlePerfFiles(e.target.files)} />

          {!perf && (
            <UploadZone onFiles={handlePerfFiles} loading={perfLoading} msg={perfMsg} />
          )}
          {perfError && (
            <div className="error-banner">❌ {perfError}</div>
          )}
          {perf && (
            <>
              <p className="section-title">Key Performance Indicators</p>
              <div className="kpi-grid">
                {kpis.map((kpi,i) => (
                  <KpiCard key={i} label={kpi.label} value={kpi.value} sub={kpi.sub} icon={kpi.icon} delay={i*60} />
                ))}
              </div>
              <p className="section-title">Visualizations</p>
              <ChartPanel data={perf.rows} numericCols={perf.numericCols} labelCol={perf.labelCol} />
              <p className="section-title">Players Participated</p>
              <DataTable columns={perf.columns} rows={perf.rows} />
            </>
          )}
          {!perf && !perfLoading && (
            <div className="empty-state">
              <div>📊</div>
              <p>Your KPIs and charts will appear here after upload</p>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════
          TAB 2 — Planning Schedule
      ══════════════════════════════════════════════ */}
      {tab === 'schedule' && (
        <>
          {/* Token Settings Modal */}
          {showTokenModal && (
            <div className="token-overlay" onClick={() => setShowTokenModal(false)}>
              <div className="token-modal" onClick={e => e.stopPropagation()}>
                <h3>⚙️ GitHub Token Settings</h3>
                <p className="token-desc">
                  A GitHub <strong>Personal Access Token</strong> (PAT) lets uploads go directly to the repository
                  so <strong>everyone who visits the URL sees them</strong> — not just your browser.
                </p>
                <ol className="token-steps">
                  <li>Go to <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer">github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens</a></li>
                  <li>Set Repository access → <strong>fcca-sports</strong></li>
                  <li>Permissions → Contents: <strong>Read and Write</strong></li>
                  <li>Generate token → copy and paste below</li>
                </ol>
                {ghToken ? (
                  <div className="token-status-set">
                    ✅ Token is set — uploads go to GitHub for everyone
                    <button className="token-remove-btn" onClick={removeToken}>Remove Token</button>
                  </div>
                ) : (
                  <div className="token-input-row">
                    <input
                      className="token-input"
                      type="password"
                      placeholder="github_pat_xxxxxxxxxxxx…"
                      value={tokenInput}
                      onChange={e => setTokenInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveToken()}
                    />
                    <button className="hist-upload-btn" onClick={saveToken} disabled={!tokenInput.trim()}>Save</button>
                  </div>
                )}
                <button className="token-close" onClick={() => setShowTokenModal(false)}>✕ Close</button>
              </div>
            </div>
          )}

          <div className="sched-hero">
            <div className="sched-hero-row">
              <div>
                <h2>📅 Planning Schedule History</h2>
                <p>{schedHistory.length ? `${schedHistory.filter(e=>e.id.startsWith('pub_')).length} shared + ${schedHistory.filter(e=>!e.id.startsWith('pub_')).length} local · click any entry to view` : 'Upload schedule files — they are all preserved in history'}</p>
              </div>
              <button
                className={`token-gear-btn ${ghToken ? 'token-gear-active' : 'token-gear-warn'}`}
                onClick={() => setShowTokenModal(true)}
                title={ghToken ? 'GitHub token set — uploads shared with everyone' : 'No token — uploads only visible to you'}
              >
                ⚙️ {ghToken ? '🟢 Sharing enabled' : '🟡 Browser only — click to enable sharing'}
              </button>
            </div>
          </div>

          {schedStatus && (
            <div className="sched-status-banner">{schedStatus}</div>
          )}
          {schedError && <div className="error-banner">{schedError}</div>}

          {/* Hidden file input */}
          <input ref={schedInput} type="file" accept=".xlsx,.xls,.csv"
                 style={{ display:'none' }}
                 onChange={e => e.target.files && handleSchedFiles(e.target.files)} />

          {/* Two-column layout: sidebar + main view */}
          <div className="sched-layout">
            <ScheduleHistory
              entries={schedHistory}
              activeId={activeSchedId}
              onSelect={setActiveSchedId}
              onDelete={deleteSchedEntry}
              onUploadClick={() => schedInput.current?.click()}
            />
            <div className="sched-main">
              {schedLoading && (
                <div className="empty-state"><div>⏳</div><p>{schedStatus || 'Processing…'}</p></div>
              )}
              {!schedLoading && !activeSched && (
                <div className="empty-state">
                  <div>📅</div>
                  <p>Upload your first schedule file using the button in the history panel</p>
                  <p style={{ fontSize:'0.8rem', marginTop:8 }}>Each upload is saved separately — April, May, June… all preserved</p>
                </div>
              )}
              {activeSched && !schedLoading && (
                <ScheduleView entry={activeSched} />
              )}
            </div>
          </div>
        </>
      )}



    </div>
  );
}