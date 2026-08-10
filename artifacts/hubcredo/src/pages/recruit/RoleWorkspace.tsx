import { useState, useEffect, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Save, Loader2, Plus, GripVertical, ChevronDown, Users, FileText, Send, Activity, Briefcase } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StageBadge, ALL_STAGES, type ApplicationStage } from "@/components/recruit/StageBadge";
import { SlideOver } from "@/components/recruit/SlideOver";
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
  description?: string | null;
  must_have_skills?: string[];
  nice_to_have_skills?: string[];
  salary_min?: number | null;
  salary_max?: number | null;
  currency?: string;
  location?: string | null;
  remote_ok?: boolean;
  created_at: string;
  updated_at: string;
  clients?: { id: string; first_name?: string | null; last_name?: string | null; company_name?: string | null } | null;
}

interface Application {
  id: string;
  role_id: string;
  lead_id: string;
  stage: string;
  notes?: string | null;
  match_score?: number | null;
  created_at: string;
  candidate?: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    job_title?: string | null;
    company_name?: string | null;
  } | null;
}

type TabId = "brief" | "pipeline" | "candidates" | "submissions" | "activity";

const PIPELINE_STAGES: ApplicationStage[] = [
  "sourced", "contacted", "responded", "screening",
  "shortlisted", "submitted", "client_interview", "offer", "placed",
];

function TagChip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 9999,
      background: "#EFF6FF", color: "#1D4ED8",
      fontSize: "0.8125rem", fontWeight: 500,
    }}>
      {label}
      {onRemove && (
        <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "#93C5FD", padding: 0, lineHeight: 1, fontSize: "0.9rem" }}>×</button>
      )}
    </span>
  );
}

function SkillsInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState("");
  function add() {
    const v = input.trim();
    if (v && !value.includes(v)) { onChange([...value, v]); setInput(""); }
  }
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {value.map(s => <TagChip key={s} label={s} onRemove={() => onChange(value.filter(x => x !== s))} />)}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: "0.875rem", outline: "none" }}
        />
        <button onClick={add} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#F8FAFC", fontSize: "0.875rem", cursor: "pointer" }}>
          Add
        </button>
      </div>
    </div>
  );
}

export default function RoleWorkspace() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/dashboard/recruit/roles/:id");
  const roleId = params?.id;
  const { toast } = useToast();

  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("brief");
  const [saving, setSaving] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  // Brief form state
  const [brief, setBrief] = useState({
    title: "",
    description: "",
    must_have_skills: [] as string[],
    nice_to_have_skills: [] as string[],
    salary_min: "",
    salary_max: "",
    currency: "USD",
    location: "",
    remote_ok: false,
  });

  const loadRole = useCallback(async () => {
    if (!roleId) return;
    setLoading(true);
    try {
      const r = await authFetch(`/api/recruit/roles/${roleId}`);
      if (r.ok) {
        const d = await r.json();
        setRole(d);
        setBrief({
          title: d.title ?? "",
          description: d.description ?? "",
          must_have_skills: d.must_have_skills ?? [],
          nice_to_have_skills: d.nice_to_have_skills ?? [],
          salary_min: d.salary_min?.toString() ?? "",
          salary_max: d.salary_max?.toString() ?? "",
          currency: d.currency ?? "USD",
          location: d.location ?? "",
          remote_ok: d.remote_ok ?? false,
        });
      } else {
        toast({ title: "Role not found", variant: "destructive" });
        setLocation("/dashboard/recruit/roles");
      }
    } finally { setLoading(false); }
  }, [roleId]);

  const loadApplications = useCallback(async () => {
    if (!roleId) return;
    setAppsLoading(true);
    try {
      const r = await authFetch(`/api/recruit/applications?role_id=${roleId}`);
      if (r.ok) setApplications(await r.json());
    } finally { setAppsLoading(false); }
  }, [roleId]);

  useEffect(() => { loadRole(); }, [loadRole]);
  useEffect(() => { if (tab === "pipeline" || tab === "candidates") loadApplications(); }, [tab, loadApplications]);

  async function saveBrief() {
    if (!roleId) return;
    setSaving(true);
    try {
      const r = await authFetch(`/api/recruit/roles/${roleId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...brief,
          salary_min: brief.salary_min ? Number(brief.salary_min) : null,
          salary_max: brief.salary_max ? Number(brief.salary_max) : null,
          brief_parse_status: "complete",
        }),
      });
      if (r.ok) {
        const updated = await r.json();
        setRole(updated);
        toast({ title: "Brief saved" });
      } else {
        toast({ title: "Save failed", variant: "destructive" });
      }
    } finally { setSaving(false); }
  }

  async function moveApplication(appId: string, newStage: string) {
    const r = await authFetch(`/api/recruit/applications/${appId}`, {
      method: "PATCH", body: JSON.stringify({ stage: newStage }),
    });
    if (r.ok) {
      setApplications(prev => prev.map(a => a.id === appId ? { ...a, stage: newStage } : a));
    }
  }

  const briefComplete = role?.brief_parse_status === "complete";

  const TABS: { id: TabId; label: string; icon: any; disabled?: boolean }[] = [
    { id: "brief", label: "Brief", icon: FileText },
    { id: "pipeline", label: "Pipeline", icon: Briefcase, disabled: !briefComplete },
    { id: "candidates", label: "Candidates", icon: Users, disabled: !briefComplete },
    { id: "submissions", label: "Submissions", icon: Send, disabled: !briefComplete },
    { id: "activity", label: "Activity", icon: Activity, disabled: !briefComplete },
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 320 }}>
          <Loader2 style={{ width: 28, height: 28, color: "#6B4EFF", animation: "spin 1s linear infinite" }} />
        </div>
      </DashboardLayout>
    );
  }

  if (!role) return null;

  return (
    <DashboardLayout>
      {/* Sticky header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "#fff", borderBottom: "1px solid #E2E8F0",
        padding: "14px 24px",
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <button
          onClick={() => setLocation("/dashboard/recruit/roles")}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#F8FAFC", color: "#374151", cursor: "pointer", fontSize: "0.8125rem", flexShrink: 0 }}
        >
          <ArrowLeft style={{ width: 13, height: 13 }} /> Roles
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 800, color: "#0A0A0A", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {role.title}
          </h1>
          {role.clients?.company_name && (
            <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: "1px 0 0" }}>{role.clients.company_name}</p>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {/* Status badge */}
          <span style={{
            padding: "4px 12px", borderRadius: 9999, fontSize: "0.75rem", fontWeight: 600,
            background: role.status === "active" ? "#DCFCE7" : "#F1F5F9",
            color: role.status === "active" ? "#15803D" : "#64748B",
          }}>{role.status}</span>

          {tab === "brief" && (
            <button
              onClick={saveBrief}
              disabled={saving}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "8px 16px", borderRadius: 9, border: "none",
                background: "#2563EB", color: "#fff", fontWeight: 600,
                fontSize: "0.875rem", cursor: "pointer",
              }}
            >
              {saving ? <Loader2 style={{ width: 13, height: 13 }} /> : <Save style={{ width: 13, height: 13 }} />}
              Save brief
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 2, borderBottom: "1px solid #E2E8F0", padding: "0 24px" }}>
        {TABS.map(({ id, label, icon: Icon, disabled }) => (
          <button
            key={id}
            onClick={() => !disabled && setTab(id)}
            disabled={!!disabled}
            title={disabled ? "Complete and save the brief first" : undefined}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "11px 16px", border: "none", background: "transparent",
              cursor: disabled ? "not-allowed" : "pointer",
              fontSize: "0.875rem", fontWeight: 600,
              color: tab === id ? "#2563EB" : disabled ? "#CBD5E1" : "#64748B",
              borderBottom: tab === id ? "2px solid #2563EB" : "2px solid transparent",
              marginBottom: -1, transition: "color .15s",
            }}
          >
            <Icon style={{ width: 14, height: 14 }} />{label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>

        {/* ── BRIEF TAB ── */}
        {tab === "brief" && (
          <div style={{ maxWidth: 680 }}>
            {!briefComplete && (
              <div style={{ marginBottom: 20, padding: "12px 16px", borderRadius: 10, background: "#FFF7ED", border: "1px solid #FED7AA", fontSize: "0.875rem", color: "#92400E" }}>
                Fill in the brief details and click <strong>Save brief</strong> to unlock the Pipeline, Candidates, Submissions, and Activity tabs.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {/* Title */}
              <div>
                <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Role title *</label>
                <input
                  value={brief.title}
                  onChange={e => setBrief(p => ({ ...p, title: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid #E2E8F0", fontSize: "0.875rem", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              {/* Description */}
              <div>
                <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Job description</label>
                <textarea
                  value={brief.description}
                  onChange={e => setBrief(p => ({ ...p, description: e.target.value }))}
                  rows={6}
                  placeholder="Paste the full job description or write a brief…"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid #E2E8F0", fontSize: "0.875rem", outline: "none", resize: "vertical", boxSizing: "border-box" }}
                />
              </div>

              {/* Must-have skills */}
              <div>
                <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Must-have skills</label>
                <SkillsInput
                  value={brief.must_have_skills}
                  onChange={v => setBrief(p => ({ ...p, must_have_skills: v }))}
                  placeholder="Type skill and press Enter…"
                />
              </div>

              {/* Nice-to-have skills */}
              <div>
                <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Nice-to-have skills</label>
                <SkillsInput
                  value={brief.nice_to_have_skills}
                  onChange={v => setBrief(p => ({ ...p, nice_to_have_skills: v }))}
                  placeholder="Type skill and press Enter…"
                />
              </div>

              {/* Location + remote */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end" }}>
                <div>
                  <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Location</label>
                  <input
                    value={brief.location}
                    onChange={e => setBrief(p => ({ ...p, location: e.target.value }))}
                    placeholder="e.g. London, UK"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid #E2E8F0", fontSize: "0.875rem", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.875rem", color: "#374151", cursor: "pointer", paddingBottom: 9 }}>
                  <input type="checkbox" checked={brief.remote_ok} onChange={e => setBrief(p => ({ ...p, remote_ok: e.target.checked }))} />
                  Remote OK
                </label>
              </div>

              {/* Salary */}
              <div>
                <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Salary range</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px", gap: 10 }}>
                  <input
                    value={brief.salary_min}
                    onChange={e => setBrief(p => ({ ...p, salary_min: e.target.value }))}
                    placeholder="Min"
                    type="number"
                    style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #E2E8F0", fontSize: "0.875rem", outline: "none" }}
                  />
                  <input
                    value={brief.salary_max}
                    onChange={e => setBrief(p => ({ ...p, salary_max: e.target.value }))}
                    placeholder="Max"
                    type="number"
                    style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #E2E8F0", fontSize: "0.875rem", outline: "none" }}
                  />
                  <select
                    value={brief.currency}
                    onChange={e => setBrief(p => ({ ...p, currency: e.target.value }))}
                    style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #E2E8F0", fontSize: "0.875rem", outline: "none" }}
                  >
                    {["USD","GBP","EUR","CAD","AUD","INR","SGD"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── PIPELINE TAB (kanban) ── */}
        {tab === "pipeline" && (
          <div style={{ overflowX: "auto", paddingBottom: 12 }}>
            <div style={{ display: "flex", gap: 12, minWidth: "max-content" }}>
              {PIPELINE_STAGES.map(stage => {
                const stageApps = applications.filter(a => a.stage === stage);
                return (
                  <div
                    key={stage}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault();
                      const appId = e.dataTransfer.getData("appId");
                      if (appId) {
                        // Only move if the card actually changed columns
                        const current = applications.find(a => a.id === appId);
                        if (current && current.stage !== stage) moveApplication(appId, stage);
                      }
                      setDragging(null);
                    }}
                    style={{
                      width: 220, flexShrink: 0,
                      background: "#F8FAFC", borderRadius: 12,
                      border: "1px solid #E2E8F0",
                      minHeight: 400,
                    }}
                  >
                    {/* Column header */}
                    <div style={{ padding: "12px 14px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 8 }}>
                      <StageBadge stage={stage} size="sm" />
                      <span style={{ marginLeft: "auto", fontSize: "0.75rem", fontWeight: 700, color: "#94A3B8" }}>{stageApps.length}</span>
                    </div>

                    {/* Cards */}
                    <div style={{ padding: "10px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
                      {stageApps.map(app => (
                        <div
                          key={app.id}
                          draggable
                          onDragStart={e => { e.dataTransfer.setData("appId", app.id); setDragging(app.id); }}
                          onDragEnd={() => setDragging(null)}
                          onClick={() => setSelectedApp(app)}
                          style={{
                            background: "#fff", borderRadius: 9, border: "1px solid #E2E8F0",
                            padding: "10px 12px", cursor: "grab",
                            boxShadow: dragging === app.id ? "0 4px 16px rgba(0,0,0,.12)" : "none",
                            opacity: dragging === app.id ? 0.6 : 1,
                            transition: "box-shadow .15s",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <GripVertical style={{ width: 12, height: 12, color: "#CBD5E1", flexShrink: 0 }} />
                            <p style={{ margin: 0, fontWeight: 600, color: "#0A0A0A", fontSize: "0.8125rem", lineHeight: 1.3 }}>
                              {[app.candidate?.first_name, app.candidate?.last_name].filter(Boolean).join(" ") || app.candidate?.email || "Candidate"}
                            </p>
                          </div>
                          {app.candidate?.job_title && (
                            <p style={{ margin: "4px 0 0 20px", fontSize: "0.75rem", color: "#64748B" }}>{app.candidate.job_title}</p>
                          )}
                        </div>
                      ))}

                      {stageApps.length === 0 && (
                        <div style={{ padding: "16px 12px", textAlign: "center", color: "#CBD5E1", fontSize: "0.8125rem" }}>
                          Drop here
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── CANDIDATES TAB ── */}
        {tab === "candidates" && (
          <div>
            {appsLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                <Loader2 style={{ width: 24, height: 24, color: "#6B4EFF", animation: "spin 1s linear infinite" }} />
              </div>
            ) : applications.length === 0 ? (
              <EmptyState
                icon={Users}
                message="No candidates in the pipeline for this role yet. Add them from the Candidates page."
                action={{ label: "Find candidates", onClick: () => setLocation("/dashboard/recruit/candidates") }}
              />
            ) : (
              <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
                      {["Candidate", "Current role", "Stage", "Match score", "Added"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#64748B", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: ".06em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map(app => (
                      <tr key={app.id} onClick={() => setSelectedApp(app)} style={{ borderBottom: "1px solid #F1F5F9", cursor: "pointer" }}
                        onMouseOver={e => (e.currentTarget.style.background = "#F8FAFC")}
                        onMouseOut={e => (e.currentTarget.style.background = "")}>
                        <td style={{ padding: "12px 14px", fontWeight: 600 }}>
                          {[app.candidate?.first_name, app.candidate?.last_name].filter(Boolean).join(" ") || app.candidate?.email || "—"}
                        </td>
                        <td style={{ padding: "12px 14px", color: "#64748B" }}>{app.candidate?.job_title || "—"}</td>
                        <td style={{ padding: "12px 14px" }}><StageBadge stage={app.stage} size="sm" /></td>
                        <td style={{ padding: "12px 14px" }}>
                          {app.match_score != null
                            ? <span style={{ fontWeight: 700, color: app.match_score >= 80 ? "#16A34A" : app.match_score >= 60 ? "#D97706" : "#64748B" }}>{app.match_score}</span>
                            : <span style={{ color: "#94A3B8" }}>—</span>
                          }
                        </td>
                        <td style={{ padding: "12px 14px", color: "#94A3B8", fontSize: "0.8125rem" }}>
                          {new Date(app.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── SUBMISSIONS / ACTIVITY stubs ── */}
        {(tab === "submissions" || tab === "activity") && (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#94A3B8" }}>
            <p style={{ fontWeight: 600, color: "#374151", marginBottom: 6 }}>
              {tab === "submissions" ? "Submissions" : "Activity"} — coming in Phase 2
            </p>
            <p style={{ fontSize: "0.875rem" }}>
              {tab === "submissions"
                ? "Submission composer and client feedback tracking will be built in Phase 2."
                : "Full audit trail of pipeline moves, emails, and notes will appear here in Phase 3."}
            </p>
          </div>
        )}
      </div>

      {/* Application detail slide-over */}
      <SlideOver
        open={!!selectedApp}
        onClose={() => setSelectedApp(null)}
        title={[selectedApp?.candidate?.first_name, selectedApp?.candidate?.last_name].filter(Boolean).join(" ") || "Candidate"}
        subtitle={selectedApp?.candidate?.job_title || undefined}
      >
        {selectedApp && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: ".06em", margin: "0 0 8px" }}>Current stage</p>
              <StageBadge stage={selectedApp.stage} />
            </div>

            <div>
              <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: ".06em", margin: "0 0 10px" }}>Move to stage</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ALL_STAGES.map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      moveApplication(selectedApp.id, s);
                      setSelectedApp(prev => prev ? { ...prev, stage: s } : null);
                    }}
                    style={{
                      padding: "4px 12px", borderRadius: 9999, border: "1px solid #E2E8F0", cursor: "pointer",
                      fontSize: "0.8125rem", fontWeight: 500,
                      background: selectedApp.stage === s ? "#EFF6FF" : "#F8FAFC",
                      color: selectedApp.stage === s ? "#2563EB" : "#374151",
                    }}
                  >{s.replace(/_/g, " ")}</button>
                ))}
              </div>
            </div>

            {selectedApp.notes && (
              <div>
                <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: ".06em", margin: "0 0 6px" }}>Notes</p>
                <p style={{ fontSize: "0.875rem", color: "#374151", margin: 0 }}>{selectedApp.notes}</p>
              </div>
            )}
          </div>
        )}
      </SlideOver>
    </DashboardLayout>
  );
}
