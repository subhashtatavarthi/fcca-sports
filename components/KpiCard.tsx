'use client';

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: string;
  delay?: number;
}

export default function KpiCard({ label, value, sub, icon = '📊', delay = 0 }: KpiCardProps) {
  return (
    <div className="kpi-card" style={{ animationDelay: `${delay}ms` }}>
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
