import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

export interface ColumnDef<T> {
  key: string;
  label: string;
  width?: string | number;
  sortable?: boolean;
  render: (row: T, index: number) => React.ReactNode;
}

interface VirtualTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyState?: React.ReactNode;
  loading?: boolean;
  skeletonRows?: number;
}

/** Single reusable table used by Clients, Roles, Candidates, and Submissions. */
export function VirtualTable<T>({
  columns, data, rowKey, onRowClick, emptyState, loading, skeletonRows = 6,
}: VirtualTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a: any, b: any) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  if (loading) {
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
              {columns.map(col => (
                <th key={col.key} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#64748B", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: ".06em", whiteSpace: "nowrap" }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                {columns.map(col => (
                  <td key={col.key} style={{ padding: "12px 14px" }}>
                    <div style={{ height: 14, borderRadius: 6, background: "#F1F5F9", width: `${60 + (i * 13 + col.key.length * 7) % 40}%`, animation: "pulse 1.5s ease-in-out infinite" }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!data.length && emptyState) return <>{emptyState}</>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
            {columns.map(col => (
              <th
                key={col.key}
                style={{
                  padding: "10px 14px", textAlign: "left", fontWeight: 600,
                  color: "#64748B", fontSize: "0.75rem", textTransform: "uppercase",
                  letterSpacing: ".06em", whiteSpace: "nowrap",
                  cursor: col.sortable ? "pointer" : "default",
                  userSelect: "none",
                  width: col.width,
                }}
                onClick={() => col.sortable && handleSort(col.key)}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {col.label}
                  {col.sortable && sortKey === col.key && (
                    sortDir === "asc"
                      ? <ChevronUp style={{ width: 12, height: 12 }} />
                      : <ChevronDown style={{ width: 12, height: 12 }} />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => (
            <tr
              key={rowKey(row)}
              onClick={() => onRowClick?.(row)}
              style={{
                borderBottom: "1px solid #F1F5F9",
                cursor: onRowClick ? "pointer" : "default",
                transition: "background .12s",
              }}
              onMouseOver={e => { if (onRowClick) (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
              onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = ""; }}
            >
              {columns.map(col => (
                <td key={col.key} style={{ padding: "12px 14px", color: "#0A0A0A", verticalAlign: "middle" }}>
                  {col.render(row, idx)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
