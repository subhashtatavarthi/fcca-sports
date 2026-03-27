'use client';
import { useState, useCallback, useRef } from 'react';
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
}

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

function parseFile(file: File): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: null });
        if (!rows.length) { reject(new Error('No data found in file')); return; }

        const columns = Object.keys(rows[0]);
        const numericCols = columns.filter(col =>
          rows.slice(0, 20).filter(r => r[col] !== null && r[col] !== '').some(r => !isNaN(parseFloat(r[col])))
        );
        // Pick a good label column (text, likely name/player/participant)
        const textCol = columns.find(c =>
          !numericCols.includes(c) &&
          rows.filter(r => r[c]).length > rows.length * 0.5
        ) ?? columns[0];

        resolve({ columns, rows, numericCols, labelCol: textCol, fileName: file.name });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function buildKpis(parsed: ParsedData) {
  const { rows, numericCols, fileName } = parsed;
  const kpis: { label: string; value: string; sub?: string; icon?: string }[] = [];

  kpis.push({ label: 'Total Records', value: String(rows.length), sub: fileName, icon: '👥' });

  numericCols.slice(0, 7).forEach(col => {
    const vals = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    if (!vals.length) return;
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = sum / vals.length;
    const max = Math.max(...vals);
    kpis.push({
      label: col.length > 20 ? col.slice(0, 20) + '…' : col,
      value: fmt(avg),
      sub: `Max: ${fmt(max)}  •  n=${vals.length}`,
      icon: iconFor(col),
    });
  });

  return kpis;
}

export default function DashboardShell() {
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || !files[0]) return;
    setLoading(true); setError('');
    try {
      const p = await parseFile(files[0]);
      setParsed(p);
    } catch (e: any) {
      setError(e.message ?? 'Failed to parse file.');
    } finally {
      setLoading(false);
    }
  }, []);

  const kpis = parsed ? buildKpis(parsed) : [];

  return (
    <div className="shell">
      {/* Header */}
      <div className="brand-bar">
        {/* FCCA Logo — inline SVG */}
        <div className="brand-fcca">
          <svg viewBox="0 0 260 90" xmlns="http://www.w3.org/2000/svg" className="fcca-svg">
            <rect width="260" height="90" rx="8" fill="#0a1172"/>
            {/* Cricket stumps */}
            <line x1="18" y1="20" x2="18" y2="68" stroke="#FFD700" strokeWidth="3"/>
            <line x1="26" y1="18" x2="26" y2="68" stroke="#FFD700" strokeWidth="3"/>
            <line x1="34" y1="20" x2="34" y2="68" stroke="#FFD700" strokeWidth="3"/>
            <line x1="16" y1="18" x2="36" y2="18" stroke="#FFD700" strokeWidth="2.5"/>
            {/* Cricket bat */}
            <rect x="36" y="30" width="10" height="36" rx="3" fill="#FFD700" transform="rotate(-30 36 30)"/>
            <rect x="28" y="58" width="11" height="7" rx="2" fill="#FFD700" transform="rotate(-30 28 58)"/>
            {/* Ball */}
            <circle cx="52" cy="62" r="4" fill="#FFD700"/>
            {/* FCCA text */}
            <text x="68" y="55" fontFamily="Arial Black, Arial" fontWeight="900" fontSize="34" fill="#FFD700" letterSpacing="2">FCCA</text>
            {/* Full name */}
            <text x="68" y="72" fontFamily="Arial" fontWeight="600" fontSize="8" fill="#FFD700" letterSpacing="1">FRISCO COMMUNITY CRICKET ASSOCIATION</text>
          </svg>
        </div>

        {/* Center title */}
        <div className="brand-title">
          <h1>Sports Performance Dashboard</h1>
          <p>{parsed ? `📂 ${parsed.fileName}` : 'Upload an Excel file to get started'}</p>
        </div>

        {/* YASH Technologies logo */}
        <div className="brand-yash">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fcca-sports/yash-logo.png" alt="YASH Technologies" className="yash-img" />
        </div>
      </div>

      {/* Upload Zone */}
      <div
        className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
      >
        <input
          ref={inputRef} type="file" accept=".xlsx,.xls,.csv"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="upload-icon">{loading ? '⏳' : '📂'}</div>
        <h3>{loading ? 'Parsing your file…' : parsed ? 'Upload a different file' : 'Drop your Excel file here'}</h3>
        <p>{parsed ? `${parsed.rows.length} records loaded from ${parsed.columns.length} columns` : 'Supports .xlsx, .xls, .csv'}</p>
        {parsed && <span className="upload-badge">✅ {parsed.fileName}</span>}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:12, padding:'12px 18px', marginBottom:20, color:'#b91c1c', fontWeight:600 }}>
          ❌ {error}
        </div>
      )}

      {/* Dashboard */}
      {parsed && (
        <>
          {/* KPI Cards */}
          <p className="section-title">Key Performance Indicators</p>
          <div className="kpi-grid">
            {kpis.map((kpi, i) => (
              <KpiCard key={i} label={kpi.label} value={kpi.value} sub={kpi.sub} icon={kpi.icon} delay={i * 60} />
            ))}
          </div>

          {/* Charts */}
          <p className="section-title">Visualizations</p>
          <ChartPanel data={parsed.rows} numericCols={parsed.numericCols} labelCol={parsed.labelCol} />

          {/* Table */}
          <p className="section-title">Data Explorer</p>
          <DataTable columns={parsed.columns} rows={parsed.rows} />
        </>
      )}

      {!parsed && !loading && (
        <div style={{ textAlign:'center', marginTop:60, color:'#0369a1', opacity:0.6 }}>
          <div style={{ fontSize:'4rem' }}>📊</div>
          <p style={{ marginTop:12, fontWeight:600 }}>Your KPIs and charts will appear here after upload</p>
        </div>
      )}
    </div>
  );
}