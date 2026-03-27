'use client';

import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

interface ChartPanelProps {
  data: Record<string, any>[];
  numericCols: string[];
  labelCol: string;
}

const COLORS = ['#0ea5e9', '#0369a1', '#38bdf8', '#7dd3fc', '#0284c7'];

export default function ChartPanel({ data, numericCols, labelCol }: ChartPanelProps) {
  if (!data.length || !numericCols.length) return null;

  // Use first 20 rows for charts, truncated label
  const chartData = data.slice(0, 20).map(row => {
    const entry: Record<string, any> = { name: String(row[labelCol] ?? '').slice(0, 14) };
    numericCols.slice(0, 4).forEach(col => {
      entry[col] = typeof row[col] === 'number' ? +row[col].toFixed(2) : parseFloat(row[col]) || 0;
    });
    return entry;
  });

  // Build a summary aggregation for a bar chart (avg per numeric col)
  const summary = numericCols.slice(0, 8).map(col => {
    const vals = data.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    return { col: col.length > 16 ? col.slice(0, 16) + '…' : col, avg: +avg.toFixed(2) };
  });

  return (
    <div className="charts-grid">
      {/* Bar chart — averages */}
      <div className="chart-card">
        <h3>📊 Average by Metric</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={summary} margin={{ top: 4, right: 12, left: 0, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(14,165,233,0.15)" />
            <XAxis dataKey="col" tick={{ fontSize: 10, fill: '#0369a1' }} angle={-35} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 11, fill: '#0369a1' }} />
            <Tooltip
              contentStyle={{ background:'rgba(255,255,255,0.9)', border:'1px solid #7dd3fc', borderRadius:10 }}
              labelStyle={{ color:'#0c4a6e', fontWeight:700 }}
            />
            <Bar dataKey="avg" fill="#0ea5e9" radius={[6,6,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Line chart — trend across rows for first numeric col */}
      {numericCols[0] && (
        <div className="chart-card">
          <h3>📈 Trend — {numericCols.slice(0, 3).join(', ')}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(14,165,233,0.15)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#0369a1' }} angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 11, fill: '#0369a1' }} />
              <Tooltip
                contentStyle={{ background:'rgba(255,255,255,0.9)', border:'1px solid #7dd3fc', borderRadius:10 }}
                labelStyle={{ color:'#0c4a6e', fontWeight:700 }}
              />
              <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12 }} />
              {numericCols.slice(0, 3).map((col, i) => (
                <Line
                  key={col} type="monotone" dataKey={col}
                  stroke={COLORS[i]} strokeWidth={2.5}
                  dot={{ r: 3, fill: COLORS[i] }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
