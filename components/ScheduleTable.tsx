'use client';
import { useState, useMemo } from 'react';

interface ScheduleTableProps {
  columns: string[];
  rows: Record<string, any>[];
  fileName: string;
  uploadedAt?: string;
  onChangeFile: () => void;
  onClear: () => void;
}

type SortDir = 'asc' | 'desc';

function compareValues(a: any, b: any, dir: SortDir) {
  const av = a === null || a === undefined ? '' : a;
  const bv = b === null || b === undefined ? '' : b;
  // Try date-aware compare
  const da = new Date(av), db = new Date(bv);
  const aIsDate = !isNaN(da.getTime()) && String(av).length > 4;
  const bIsDate = !isNaN(db.getTime()) && String(bv).length > 4;
  let result = 0;
  if (aIsDate && bIsDate) {
    result = da.getTime() - db.getTime();
  } else {
    const an = parseFloat(av), bn = parseFloat(bv);
    if (!isNaN(an) && !isNaN(bn)) result = an - bn;
    else result = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
  }
  return dir === 'asc' ? result : -result;
}

const PAGE_SIZE = 15;

// ── Excel time fraction → "H:MM AM/PM" ────────────────
// Excel stores times as a fraction of 24h: 0.75 = 18:00 = 6:00 PM
function excelTimeToString(fraction: number): string {
  const totalMins = Math.round(fraction * 24 * 60);
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

// Detect time-like columns by name
function isTimeCol(col: string) {
  return /time/i.test(col);
}

// Format a single cell value for display
function formatCell(col: string, val: any): string {
  if (val === null || val === undefined) return '—';
  const num = typeof val === 'number' ? val : null;
  // Convert decimal fraction to AM/PM if it looks like a time column
  if (num !== null && num > 0 && num < 1 && isTimeCol(col)) {
    return excelTimeToString(num);
  }
  return String(val);
}

export default function ScheduleTable({ columns, rows, fileName, uploadedAt, onChangeFile, onClear }: ScheduleTableProps) {
  const [page, setPage] = useState(0);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [search, setSearch] = useState('');

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(row =>
      columns.some(col => formatCell(col, row[col]).toLowerCase().includes(q))
    );
  }, [rows, columns, search]);

  const sortedRows = useMemo(() => {
    if (!sortCol) return filteredRows;
    return [...filteredRows].sort((a, b) => compareValues(a[sortCol], b[sortCol], sortDir));
  }, [filteredRows, sortCol, sortDir]);

  const totalPages = Math.ceil(sortedRows.length / PAGE_SIZE);
  const pageRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setPage(0);
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(0);
  };

  const sortIcon = (col: string) => {
    if (sortCol !== col) return <span className="sort-icon sort-neutral">⇅</span>;
    return <span className="sort-icon sort-active">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="sched-wrap">
      {/* Info bar */}
      <div className="sched-infobar">
        <div className="sched-meta">
          <span className="sched-filename">📂 {fileName}</span>
          {uploadedAt && <span className="sched-time">Uploaded: {uploadedAt}</span>}
          <span className="sched-count">{rows.length} rows · {columns.length} columns</span>
        </div>
        <div className="sched-actions">
          <button className="persist-btn" onClick={onChangeFile}>🔄 Update File</button>
          <button className="persist-btn persist-clear" onClick={onClear}>✖ Clear</button>
        </div>
      </div>

      {/* Search */}
      <div className="sched-search-row">
        <input
          className="sched-search"
          type="text"
          placeholder="🔍  Search anything in the schedule…"
          value={search}
          onChange={handleSearch}
        />
        {search && (
          <span className="sched-result-count">
            {sortedRows.length} of {rows.length} rows match
          </span>
        )}
      </div>

      {/* Table */}
      <div className="table-card" style={{ marginTop: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map(col => (
                  <th key={col} className="sortable-th" onClick={() => handleSort(col)}>
                    <span className="th-inner">{col}{sortIcon(col)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr><td colSpan={columns.length} style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>No matching rows found.</td></tr>
              ) : pageRows.map((row, i) => (
                <tr key={i}>
                  {columns.map(col => (
                    <td key={col}>
                      {formatCell(col, row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="pagination">
            <button className="page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 0}>‹</button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = totalPages <= 7 ? i : (page < 4 ? i : page + i - 3);
              if (p >= totalPages) return null;
              return (
                <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p + 1}</button>
              );
            })}
            <button className="page-btn" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>›</button>
            <span className="page-info">Page {page + 1} of {totalPages} · Showing {pageRows.length} rows</span>
          </div>
        )}
      </div>
    </div>
  );
}
