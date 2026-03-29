'use client';
import { useState, useMemo } from 'react';

export interface ScheduleEntry {
  id: string;
  fileName: string;
  uploadedAt: string;
  columns: string[];
  rows: Record<string, any>[];
}

interface ScheduleHistoryProps {
  entries: ScheduleEntry[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onUploadClick: () => void;
}

// ── Excel time fraction → "H:MM AM/PM" ────────────────
function excelTimeToString(fraction: number): string {
  const totalMins = Math.round(fraction * 24 * 60);
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}
function isTimeCol(col: string) { return /time/i.test(col); }
export function formatCell(col: string, val: any): string {
  if (val === null || val === undefined) return '—';
  const num = typeof val === 'number' ? val : null;
  if (num !== null && num > 0 && num < 1 && isTimeCol(col)) return excelTimeToString(num);
  return String(val);
}

// ── History Sidebar ────────────────────────────────────
export function ScheduleHistory({ entries, activeId, onSelect, onDelete, onUploadClick }: ScheduleHistoryProps) {
  return (
    <div className="hist-sidebar">
      <div className="hist-header">
        <span className="hist-title">📁 Schedule History</span>
        <button className="hist-upload-btn" onClick={onUploadClick}>+ Upload New</button>
      </div>
      {entries.length === 0 ? (
        <div className="hist-empty">No schedules yet. Upload one to get started.</div>
      ) : (
        <ul className="hist-list">
          {entries.map(e => (
            <li
              key={e.id}
              className={`hist-item ${e.id === activeId ? 'hist-active' : ''}`}
              onClick={() => onSelect(e.id)}
            >
              <div className="hist-item-info">
                <span className="hist-item-name">{e.fileName}</span>
                <span className="hist-item-date">{e.uploadedAt}</span>
                <span className="hist-item-rows">{e.rows.length} rows</span>
              </div>
              <button
                className="hist-delete"
                title="Remove from history"
                onClick={(ev) => { ev.stopPropagation(); onDelete(e.id); }}
              >✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Schedule Table ─────────────────────────────────────
type SortDir = 'asc' | 'desc';

function compareValues(a: any, b: any, dir: SortDir) {
  const av = a == null ? '' : a;
  const bv = b == null ? '' : b;
  const an = parseFloat(av), bn = parseFloat(bv);
  let result = 0;
  if (!isNaN(an) && !isNaN(bn)) result = an - bn;
  else result = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
  return dir === 'asc' ? result : -result;
}

const PAGE_SIZE = 15;

interface ScheduleViewProps {
  entry: ScheduleEntry;
}

export function ScheduleView({ entry }: ScheduleViewProps) {
  const { columns, rows } = entry;
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

  return (
    <div className="sched-view">
      {/* Search */}
      <div className="sched-search-row">
        <input
          className="sched-search"
          type="text"
          placeholder="🔍  Search anything in this schedule…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
        />
        {search && <span className="sched-result-count">{sortedRows.length} of {rows.length} match</span>}
      </div>

      {/* Table */}
      <div className="table-card" style={{ marginTop: 8 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map(col => (
                  <th key={col} className="sortable-th" onClick={() => handleSort(col)}>
                    <span className="th-inner">
                      {col}
                      <span className={`sort-icon ${sortCol === col ? 'sort-active' : 'sort-neutral'}`}>
                        {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0
                ? <tr><td colSpan={columns.length} style={{ textAlign:'center', padding:32, color:'#64748b' }}>No rows match.</td></tr>
                : pageRows.map((row, i) => (
                  <tr key={i}>
                    {columns.map(col => (
                      <td key={col}>{formatCell(col, row[col])}</td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="pagination">
            <button className="page-btn" onClick={() => setPage(p => p-1)} disabled={page===0}>‹</button>
            {Array.from({ length: Math.min(totalPages,7) }, (_,i) => {
              const p = totalPages<=7 ? i : (page<4 ? i : page+i-3);
              if (p>=totalPages) return null;
              return <button key={p} className={`page-btn ${p===page?'active':''}`} onClick={() => setPage(p)}>{p+1}</button>;
            })}
            <button className="page-btn" onClick={() => setPage(p => p+1)} disabled={page>=totalPages-1}>›</button>
            <span className="page-info">Page {page+1} of {totalPages} · {pageRows.length} rows shown</span>
          </div>
        )}
      </div>
    </div>
  );
}
