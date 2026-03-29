'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import KpiCard from './KpiCard';
import DataTable from './DataTable';
import ChartPanel from './ChartPanel';
import { ScheduleHistory, ScheduleView, ScheduleEntry } from './ScheduleTable';

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
const LS_KEY_SCHED   = 'fcca_schedule_history_v1'; // stores ScheduleEntry[]
const PUBLIC_PERF_URL  = '/fcca-sports/data.xlsx';
const PUBLIC_SCHED_URL = '/fcca-sports/schedule.xlsx';

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
  const schedInput = useRef<HTMLInputElement>(null);

  // Derived: currently selected entry
  const activeSched = schedHistory.find(e => e.id === activeSchedId) ?? null;

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

    // Schedule history from localStorage
    (async () => {
      try {
        const raw = localStorage.getItem(LS_KEY_SCHED);
        if (raw) {
          const hist: ScheduleEntry[] = JSON.parse(raw);
          if (hist.length) {
            setSchedHistory(hist);
            setActiveSchedId(hist[0].id); // most recent first
          }
        } else {
          // Try public schedule file as first seed entry
          try {
            const res = await fetch(PUBLIC_SCHED_URL, { cache:'no-store' });
            if (res.ok) {
              const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type:'array' });
              const ws = wb.Sheets[wb.SheetNames[0]];
              const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false }) as Record<string,any>[];
              if (rows.length) {
                const cols = Object.keys(rows[0]);
                const entry: ScheduleEntry = { id: 'public', fileName: 'FCCA Schedule (Shared)', uploadedAt: 'Shared file', columns: cols, rows };
                setSchedHistory([entry]);
                setActiveSchedId('public');
              }
            }
          } catch {}
        }
      } catch {}
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
    setSchedLoading(true); setSchedError('');
    try {
      const buf = await files[0].arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type:'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false }) as Record<string,any>[];
      if (!rows.length) throw new Error('No data found in file');
      const cols = Object.keys(rows[0]);
      const entry: ScheduleEntry = {
        id: Date.now().toString(),
        fileName: files[0].name,
        uploadedAt: new Date().toLocaleString(),
        columns: cols,
        rows,
      };
      // Prepend new entry (most recent first)
      setSchedHistory(prev => {
        const updated = [entry, ...prev];
        try { localStorage.setItem(LS_KEY_SCHED, JSON.stringify(updated)); } catch {}
        return updated;
      });
      setActiveSchedId(entry.id);
    } catch (e: any) { setSchedError(e.message ?? 'Failed to parse file.'); }
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
          <div className="sched-hero">
            <h2>📅 Planning Schedule History</h2>
            <p>{schedHistory.length ? `${schedHistory.length} schedule${schedHistory.length>1?'s':''} saved · click any entry to view` : 'Upload schedule files — they are all preserved in history'}</p>
          </div>
          {schedError && <div className="error-banner">❌ {schedError}</div>}

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
                <div className="empty-state"><div>⏳</div><p>Parsing file…</p></div>
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