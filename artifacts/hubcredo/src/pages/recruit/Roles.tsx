import { useState, useEffect, useCallback } from "react";
import { Briefcase, Plus, ArrowRight, Clock } from "lucide-react";
import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { VirtualTable, type ColumnDef } from "@/components/recruit/VirtualTable";
import { EmptyState } from "@/components/recruit/EmptyState";
import { getToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function authFetch(path: string, opts?: RequestInit) {
  return fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts?.headers ?? {}) },
  });
}

interface Role {
  id: string;
  title: string;
  status: string;
  brief_parse_status: string;
  location?: string | null;
  remote_ok?: boolean;
  salary_min?: number | null;
  salary_max?: number | null;
  currency?: string;
  created_at: string;
  clients?: { id: string; first_name?: string | null; last_name?: string | null; company_name?: string | null } | null;
}

function daysOpen(created_at: string) {
  return Math.floor((Date.now() - new Date(created_at).getTime()) / 86400000);
}

function DaysOpenBadge({ days }: { days: number }) {
  const color = days >= 45 ? "#DC2626" : days >= 21 ? "#D97706" : "#16A34A";
  const bg = days >= 45 ? "#FEF2F2" : days >= 21 ? "#FEF3C7" : "#DCFCE7";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: 9999, background: bg, color, fontSize: "0.75rem", fontWeight: 700 }}>
      <Clock style={{ width: 11, height: 11 }} />{days}d
    </span>
  );
}

export default function Roles() {
  const [, setLocation] = useLocation();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: "", client_id: "", location: "", remote_ok: false });
  const [clients, setClients] = useState<{ id: string; company_name?: string | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch("/api/recruit/roles");
      if (r.ok) setRoles(await r.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    authFetch("/api/recruit/clients").then(r => r.ok ? r.json() : []).then(setClients);
  }, []);

  const sortedRoles = [...roles].sort((a, b) => daysOpen(b.created_at) - daysOpen(a.created_at));

  async function createRole() {
    if (!form.title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const r = await authFetch("/api/recruit/roles", { method: "POST", body: JSON.stringify(form) });
      if (r.ok) {
        const created = await r.json();
        toast({ title: "Role created" });
        setShowNew(false);
        setForm({ title: "", client_id: "", location: "", remote_ok: false });
        setLocation(`/dashboard/recruit/roles/${created.id}`);
      } else {
        const err = await r.json();
        toast({ title: "Error", description: err.error, variant: "destructive" });
      }
    } finally { setSaving(false); }
  }

  const columns: ColumnDef<Role>[] = [
    {
      key: "title", label: "Role", sortable: true, width: "30%",
      render: (row) => (
        <div>
          <p style={{ margin: 0, fontWeight: 600, color: "#0A0A0A" }}>{row.title}</p>
          {row.clients?.company_name && (
            <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "#64748B" }}>{row.clients.company_name}</p>
          )}
        </div>
      ),
    },
    {
      key: "created_at", label: "Days open", sortable: true, width: "12%",
      render: (row) => <DaysOpenBadge days={daysOpen(row.created_at)} />,
    },
    {
      key: "location", label: "Location", width: "16%",
      render: (row) => (
        <span style={{ color: "#374151", fontSize: "0.875rem" }}>
          {row.location || (row.remote_ok ? "Remote" : "—")}
        </span>
      ),
    },
    {
      key: "status", label: "Status", sortable: true, width: "12%",
      render: (row) => {
        const cfg: Record<string, { bg: string; color: string }> = {
          active: { bg: "#DCFCE7", color: "#15803D" },
          draft:  { bg: "#F1F5F9", color: "#64748B" },
          filled: { bg: "#EFF6FF", color: "#1D4ED8" },
          closed: { bg: "#FEF2F2", color: "#DC2626" },
        };
        const c = cfg[row.status] ?? cfg.draft;
        return <span style={{ padding: "2px 9px", borderRadius: 9999, background: c.bg, color: c.color, fontSize: "0.75rem", fontWeight: 600 }}>{row.status}</span>;
      },
    },
    {
      key: "brief_parse_status", label: "Brief", width: "12%",
      render: (row) => {
        const label: Record<string, string> = { pending: "Draft", processing: "Parsing…", complete: "Ready", failed: "Error" };
        const color: Record<string, string> = { pending: "#94A3B8", processing: "#D97706", complete: "#16A34A", failed: "#DC2626" };
        return <span style={{ fontSize: "0.8125rem", color: color[row.brief_parse_status] ?? "#94A3B8" }}>{label[row.brief_parse_status] ?? row.brief_parse_status}</span>;
      },
    },
    {
      key: "_open", label: "", width: "8%",
      render: (row) => (
        <button
          onClick={e => { e.stopPropagation(); setLocation(`/dashboard/recruit/roles/${row.id}`); }}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#F8FAFC", fontSize: "0.75rem", fontWeight: 600, color: "#374151", cursor: "pointer" }}
        >
          Open <ArrowRight style={{ width: 12, height: 12 }} />
        </button>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0A0A0A", margin: 0 }}>Roles</h1>
            <p style={{ color: "#64748B", margin: "4px 0 0", fontSize: "0.9375rem" }}>
              {roles.filter(r => r.status === "active").length} active · sorted by days open
            </p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 10, border: "none", background: "#2563EB", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: "0.875rem" }}
          >
            <Plus style={{ width: 15, height: 15 }} /> New role
          </button>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, marginBottom: 18, fontSize: "0.75rem", color: "#64748B" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: "#FEF3C7", border: "1px solid #D97706", display: "inline-block" }} />Amber ≥ 21 days
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: "#FEF2F2", border: "1px solid #DC2626", display: "inline-block" }} />Red ≥ 45 days
          </span>
        </div>

        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, overflow: "hidden" }}>
          <VirtualTable
            columns={columns}
            data={sortedRoles}
            rowKey={r => r.id}
            loading={loading}
            onRowClick={r => setLocation(`/dashboard/recruit/roles/${r.id}`)}
            emptyState={
              <EmptyState
                icon={Briefcase}
                message="No roles yet. Create your first role to start building a pipeline."
                action={{ label: "New role", onClick: () => setShowNew(true) }}
              />
            }
          />
        </div>
      </div>

      {/* New role modal */}
      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: 440, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,.15)" }}>
            <h3 style={{ margin: "0 0 20px", fontSize: "1.0625rem", fontWeight: 700 }}>New role</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Role title *"
                style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #E2E8F0", fontSize: "0.875rem", outline: "none" }}
              />
              <select
                value={form.client_id}
                onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}
                style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #E2E8F0", fontSize: "0.875rem", outline: "none" }}
              >
                <option value="">— No client (internal) —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.company_name || c.id}</option>)}
              </select>
              <input
                value={form.location}
                onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                placeholder="Location (e.g. London, UK)"
                style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #E2E8F0", fontSize: "0.875rem", outline: "none" }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.875rem", color: "#374151", cursor: "pointer" }}>
                <input type="checkbox" checked={form.remote_ok} onChange={e => setForm(p => ({ ...p, remote_ok: e.target.checked }))} />
                Remote OK
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button onClick={() => setShowNew(false)} style={{ padding: "9px 18px", borderRadius: 9, border: "1px solid #E2E8F0", background: "#fff", cursor: "pointer" }}>Cancel</button>
              <button onClick={createRole} disabled={saving} style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: "#2563EB", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
                {saving ? "Creating…" : "Create role"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
