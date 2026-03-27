'use client';
import { useState, useMemo } from 'react';

interface DataTableProps {
  columns: string[];
  rows: Record<string, any>[];
}

const PAGE_SIZE = 10;

type SortDir = 'asc' | 'desc';

function compareValues(a: any, b: any, dir: SortDir) {
  const av = a === null || a === undefined ? '' : a;
  const bv = b === null || b === undefined ? '' : b;
  const an = parseFloat(av), bn = parseFloat(bv);
  let result = 0;
  if (!isNaN(an) && !isNaN(bn)) {
    result = an - bn;
  } else {
    result = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
  }
  return dir === 'asc' ? result : -result;
}

export default function DataTable({ columns, rows }: DataTableProps) {
  const [page, setPage] = useState(0);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sortedRows = useMemo(() => {
    if (!sortCol) return rows;
    return [...rows].sort((a, b) => compareValues(a[sortCol], b[sortCol], sortDir));
  }, [rows, sortCol, sortDir]);

  const totalPages = Math.ceil(sortedRows.length / PAGE_SIZE);
  const pageRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
    setPage(0); // reset to first page when sort changes
  };

  const sortIcon = (col: string) => {
    if (sortCol !== col) return <span className="sort-icon sort-neutral">⇅</span>;
    return <span className="sort-icon sort-active">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="table-card">
      <div className="table-header-row">
        <h3>🏏 Players Participated — {rows.length} Players</h3>
        <span className="table-legend"><strong>DNA</strong> = Did Not Attempt</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col} className="sortable-th" onClick={() => handleSort(col)}>
                  <span className="th-inner">
                    {col}
                    {sortIcon(col)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={i}>
                {columns.map(col => (
                  <td key={col}>
                    {row[col] === null || row[col] === undefined ? '—' : String(row[col])}
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
              <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>
                {p + 1}
              </button>
            );
          })}
          <button className="page-btn" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>›</button>
          <span className="page-info">Page {page + 1} of {totalPages}</span>
        </div>
      )}
    </div>
  );
}
