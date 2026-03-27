'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import KpiCard from './KpiCard';
import DataTable from './DataTable';
import ChartPanel from './ChartPanel';

interface ParsedData {
  columns: string[];
  rows: Record<string, any>[];
  numericCols: string[];
  labelCol: string;
  fileName: string;
  uploadedAt?: string;
}

const LS_KEY = 'fcca_dashboard_data';
const PUBLIC_DATA_URL = '/fcca-sports/data.xlsx';

const ICONS: Record<string, string> = {
  total: '👥', avg: '📊', max: '🏆', min: '📉', sheets: '📄',
  score: '🎯', weight: '⚖️', height: '📏', age: '🎂', bmi: '🧬',
  time: '⏱️', default: '📈'
};
function iconFor(label: string) {
  const l = label.toLowerCase();
  for (const key of Object.keys(ICONS)) if (l.includes(key)) return ICONS[key];
  return ICONS.default;
}
function fmt(v: number) {
  if (isNaN(v)) return '—';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}

function parseArrayBuffer(data: ArrayBuffer, fileName: string): ParsedData {
  const wb = XLSX.read(new Uint8Array(data), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: null });
  if (!rows.length) throw new Error('No data found in file');
  const columns = Object.keys(rows[0]);
  const numericCols = columns.filter(col =>
    rows.slice(0, 20).filter(r => r[col] !== null && r[col] !== '').some(r => !isNaN(parseFloat(r[col])))
  );
  const labelCol = columns.find(c =>
    !numericCols.includes(c) && rows.filter(r => r[c]).length > rows.length * 0.5
  ) ?? columns[0];
  return { columns, rows, numericCols, labelCol, fileName, uploadedAt: new Date().toLocaleString() };
}

function parseFile(file: File): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try { resolve(parseArrayBuffer(e.target!.result as ArrayBuffer, file.name)); }
      catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function buildKpis(parsed: ParsedData) {
  const { rows, numericCols, fileName } = parsed;
  const kpis: { label: string; value: string; sub?: string; icon?: string }[] = [];
  kpis.push({ label: 'Total Players', value: String(rows.length), sub: fileName, icon: '👥' });
  numericCols.slice(0, 7).forEach(col => {
    const vals = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    if (!vals.length) return;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    kpis.push({
      label: col.length > 20 ? col.slice(0, 20) + '…' : col,
      value: fmt(avg),
      sub: `Max: ${fmt(max)}  •  Min: ${fmt(min)}  •  n=${vals.length}`,
      icon: iconFor(col),
    });
  });
  return kpis;
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

// ── helpers ────────────────────────────────────────────
function saveToLocalStorage(data: ParsedData) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
}
function loadFromLocalStorage(): ParsedData | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function clearLocalStorage() {
  try { localStorage.removeItem(LS_KEY); } catch {}
}

// ── Main Component ─────────────────────────────────────
export default function DashboardShell() {
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(true);   // starts true while we check for saved data
  const [loadingMsg, setLoadingMsg] = useState('Loading saved dashboard…');
  const [dragOver, setDragOver] = useState(false);
  const [source, setSource] = useState<'public' | 'local' | 'new' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── On mount: localStorage first (user's upload wins), then public file ──
  useEffect(() => {
    async function autoLoad() {
      // 1. Use localStorage if the user has previously uploaded a file
      //    This always takes priority so their latest upload is never overwritten
      const saved = loadFromLocalStorage();
      if (saved) {
        setParsed(saved);
        setSource('local');
        setLoading(false);
        return;
      }

      // 2. Fall back to the committed public data file (shared default for new visitors)
      try {
        setLoadingMsg('Loading shared dashboard data…');
        const res = await fetch(PUBLIC_DATA_URL, { cache: 'no-store' });
        if (res.ok) {
          const buf = await res.arrayBuffer();
          const p = parseArrayBuffer(buf, 'FCCA Shared Data');
          p.uploadedAt = undefined;
          setParsed(p);
          setSource('public');
        }
      } catch {}

      setLoading(false);
    }
    autoLoad();
  }, []);


  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || !files[0]) return;
    setLoading(true); setLoadingMsg('Parsing your file…'); setError('');
    try {
      const p = await parseFile(files[0]);
      setParsed(p);
      setSource('new');
      saveToLocalStorage(p);          // persist in this browser
    } catch (e: any) {
      setError(e.message ?? 'Failed to parse file.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClear = () => {
    clearLocalStorage();
    setParsed(null);
    setSource(null);
  };

  const kpis = parsed ? buildKpis(parsed) : [];

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
          <h1>Sports Performance Dashboard</h1>
          <p>{parsed ? `📂 ${parsed.fileName}` : 'Upload an Excel file to get started'}</p>
        </div>
        <div className="brand-yash">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fcca-sports/yash-logo.png" alt="YASH Technologies" className="yash-img" />
        </div>
      </div>

      {/* ── Persistence Banner ── */}
      {parsed && (
        <div className={`persist-banner ${source === 'public' ? 'persist-public' : source === 'local' ? 'persist-local' : 'persist-new'}`}>
          <div className="persist-info">
            {source === 'public' && <><span>🌐</span><span>Shared dashboard — visible to everyone who visits this URL</span></>}
            {source === 'local'  && <><span>💾</span><span>Restored from your last upload: <strong>{parsed.fileName}</strong>{parsed.uploadedAt ? ` — ${parsed.uploadedAt}` : ''}</span></>}
            {source === 'new'    && <><span>✅</span><span>Loaded: <strong>{parsed.fileName}</strong> — saved to your browser for next visit</span></>}
          </div>
          <div className="persist-actions">
            <button className="persist-btn" onClick={() => inputRef.current?.click()}>🔄 Update File</button>
            {source !== 'public' && <button className="persist-btn persist-clear" onClick={handleClear}>✖ Clear</button>}
          </div>
        </div>
      )}

      {/* ── Upload Zone — shown when no data or collapsed ── */}
      {!parsed && (
        <div className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
             onClick={() => inputRef.current?.click()}
             onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
             onDragLeave={() => setDragOver(false)}
             onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => handleFiles(e.target.files)} />
          <div className="upload-icon">{loading ? '⏳' : '📂'}</div>
          <h3>{loading ? loadingMsg : 'Drop your Excel file here'}</h3>
          <p>{loading ? 'Please wait…' : 'Supports .xlsx, .xls, .csv'}</p>
        </div>
      )}

      {/* Hidden input when data already loaded */}
      {parsed && (
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv"
               style={{ display:'none' }} onChange={(e) => handleFiles(e.target.files)} />
      )}

      {/* ── Error ── */}
      {error && (
        <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:12, padding:'12px 18px', marginBottom:20, color:'#b91c1c', fontWeight:600 }}>
          ❌ {error}
        </div>
      )}

      {/* ── Dashboard Content ── */}
      {parsed && (
        <>
          <p className="section-title">Key Performance Indicators</p>
          <div className="kpi-grid">
            {kpis.map((kpi, i) => (
              <KpiCard key={i} label={kpi.label} value={kpi.value} sub={kpi.sub} icon={kpi.icon} delay={i * 60} />
            ))}
          </div>
          <p className="section-title">Visualizations</p>
          <ChartPanel data={parsed.rows} numericCols={parsed.numericCols} labelCol={parsed.labelCol} />
          <p className="section-title">Players Participated</p>
          <DataTable columns={parsed.columns} rows={parsed.rows} />
        </>
      )}

      {!parsed && !loading && (
        <div style={{ textAlign:'center', marginTop:60, color:'#0369a1', opacity:0.6 }}>
          <div style={{ fontSize:'4rem' }}>📊</div>
          <p style={{ marginTop:12, fontWeight:600 }}>Your KPIs and charts will appear here after upload</p>
          <p style={{ marginTop:8, fontSize:'0.8rem' }}>
            💡 <strong>Tip:</strong> To make the dashboard visible to everyone permanently, commit your Excel file as <code>public/data.xlsx</code> in the repository.
          </p>
        </div>
      )}

    </div>
  );
}