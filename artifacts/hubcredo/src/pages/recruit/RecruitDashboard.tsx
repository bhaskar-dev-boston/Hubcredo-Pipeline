import { useState, useEffect } from "react";
import { Briefcase, Users, Clock, Calendar, TrendingUp, AlertCircle } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getToken } from "@/lib/auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function authFetch(path: string) {
  return fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
}

interface DashStats {
  open_roles: number;
  candidates_in_play: number;
  awaiting_client: number;
  interviews_this_week: number;
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number | null; color: string }) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "20px 22px",
      display: "flex", alignItems: "center", gap: 16,
    }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon style={{ width: 22, height: 22, color }} />
      </div>
      <div>
        {value == null
          ? <div style={{ width: 40, height: 28, background: "#F1F5F9", borderRadius: 6 }} />
          : <p style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0A0A0A", margin: 0, lineHeight: 1 }}>{value}</p>
        }
        <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: "4px 0 0" }}>{label}</p>
      </div>
    </div>
  );
}

export default function RecruitDashboard() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch("/api/recruit/dashboard")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats(d); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0A0A0A", margin: 0 }}>Recruit Dashboard</h1>
          <p style={{ color: "#64748B", margin: "4px 0 0", fontSize: "0.9375rem" }}>Overview of your recruiting pipeline</p>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginBottom: 32 }}>
          <StatCard icon={Briefcase}  label="Open Roles"           value={loading ? null : (stats?.open_roles ?? 0)}           color="#2563EB" />
          <StatCard icon={Users}      label="Candidates in Play"   value={loading ? null : (stats?.candidates_in_play ?? 0)}   color="#7C3AED" />
          <StatCard icon={Clock}      label="Awaiting Client"      value={loading ? null : (stats?.awaiting_client ?? 0)}      color="#D97706" />
          <StatCard icon={Calendar}   label="Interviews This Week" value={loading ? null : (stats?.interviews_this_week ?? 0)} color="#16A34A" />
        </div>

        {/* Quick links */}
        <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 14, padding: "20px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <TrendingUp style={{ width: 17, height: 17, color: "#2563EB" }} />
            <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#0A0A0A", margin: 0 }}>Quick actions</h2>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              { label: "View open roles", href: "/dashboard/recruit/roles" },
              { label: "Find candidates", href: "/dashboard/recruit/candidates" },
              { label: "Manage clients", href: "/dashboard/recruit/clients" },
            ].map(({ label, href }) => (
              <a key={href} href={href} style={{
                padding: "8px 16px", borderRadius: 10, border: "1px solid rgba(37,99,235,.25)",
                background: "#fff", color: "#2563EB", fontSize: "0.875rem", fontWeight: 600,
                textDecoration: "none",
              }}>{label}</a>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
