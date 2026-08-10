import { useState, useEffect, useCallback } from "react";
import { Search, UserSearch, Play, X, Flame, CircleDot, Mail, Briefcase } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
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

interface CandidateSignal {
  id: string;
  linkedin_url: string;
  public_identifier?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  headline?: string | null;
  about?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  location_country?: string | null;
  location_matched?: boolean | null;
  current_title?: string | null;
  current_company?: string | null;
  top_skills?: string[] | null;
  open_to_work: boolean;
  job_seeking_score: number;
  job_seeking_reasons?: string[] | null;
  email?: string | null;
  search_role?: string | null;
  search_location?: string | null;
  scraped_at: string;
}

// A row from `leads` where audience_type = 'candidate' — i.e. someone already
// added to the network, via GET /api/recruit/candidates
interface NetworkCandidate {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  job_title?: string | null;
  company_name?: string | null;
  linkedin_url?: string | null;
  review_status?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

type Tab = "search" | "my-candidates";

const EXPERIENCE_LEVELS = ["Entry", "Mid-Senior", "Director", "Executive"];

function scoreTone(score: number): { bg: string; fg: string; label: string } {
  if (score >= 70) return { bg: "#FEF2F2", fg: "#DC2626", label: "Likely looking" };
  if (score >= 30) return { bg: "#FFFBEB", fg: "#D97706", label: "Possibly open" };
  return { bg: "#F1F5F9", fg: "#64748B", label: "Passive" };
}

function statusTone(status?: string | null): { bg: string; fg: string } {
  switch (status) {
    case "sourced": return { bg: "#EFF6FF", fg: "#2563EB" };
    case "approved": return { bg: "#F0FDF4", fg: "#16A34A" };
    case "prospect": return { bg: "#FFFBEB", fg: "#D97706" };
    default: return { bg: "#F1F5F9", fg: "#64748B" };
  }
}

export default function Candidates() {
  const [tab, setTab] = useState<Tab>("search");
  const { toast } = useToast();

  // free-text network search (existing "Search by name, title, company" bar)
  const [networkQuery, setNetworkQuery] = useState("");

  // sourcing form
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("India");
  const [experience, setExperience] = useState("Mid-Senior");
  const [triggering, setTriggering] = useState(false);

  // sourced results (Search tab)
  const [signals, setSignals] = useState<CandidateSignal[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // saved network candidates (My Candidates tab)
  const [myCandidates, setMyCandidates] = useState<NetworkCandidate[]>([]);
  const [myCandidatesLoading, setMyCandidatesLoading] = useState(false);
  const [addAllProcessing, setAddAllProcessing] = useState(false);

  const loadSignals = useCallback(async (roleFilter?: string) => {
    setSignalsLoading(true);
    try {
      const params = new URLSearchParams();
      if (roleFilter) params.set("role", roleFilter);
      const r = await authFetch(`/api/recruit/candidate-signals?${params.toString()}`);
      if (r.ok) setSignals(await r.json());
    } finally {
      setSignalsLoading(false);
    }
  }, []);

  const loadMyCandidates = useCallback(async (search?: string) => {
    setMyCandidatesLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const r = await authFetch(`/api/recruit/candidates?${params.toString()}`);
      if (r.ok) setMyCandidates(await r.json());
    } finally {
      setMyCandidatesLoading(false);
    }
  }, []);

  async function submitSearch() {
    if (!role.trim()) {
      toast({ title: "Role is required", variant: "destructive" });
      return;
    }
    setTriggering(true);
    setHasSearched(true);
    try {
      const r = await authFetch("/api/recruit/candidates/trigger", {
        method: "POST",
        body: JSON.stringify({ role: role.trim(), location, experience }),
      });
      if (r.ok) {
        toast({
          title: "Candidate search triggered",
          description: "Sourcing runs in the background — results will appear below once scraping finishes.",
        });
        setTimeout(() => loadSignals(role.trim()), 8000);
      } else {
        const err = await r.json();
        toast({ title: "Error", description: err.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Could not reach the sourcing workflow", variant: "destructive" });
    } finally {
      setTriggering(false);
    }
  }

  useEffect(() => {
    if (tab === "search" && hasSearched) loadSignals(role.trim() || undefined);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === "my-candidates") loadMyCandidates();
  }, [tab, loadMyCandidates]);

  // debounce the free-text search on My Candidates
  useEffect(() => {
    if (tab !== "my-candidates") return;
    const t = setTimeout(() => loadMyCandidates(networkQuery.trim() || undefined), 300);
    return () => clearTimeout(t);
  }, [networkQuery, tab, loadMyCandidates]);

  async function addToNetwork(signal: CandidateSignal) {
    try {
      const r = await authFetch(`/api/recruit/candidate-signals/${signal.id}/add-to-network`, { method: "POST" });
      const payload = await r.json().catch(() => ({}));
      if (r.ok) {
        toast({ title: `${signal.first_name ?? "Candidate"} added to your network` });
        // remove the signal from Search immediately
        setSignals(prev => prev.filter(s => s.id !== signal.id));
        // if backend returned the lead, prepend it to My Candidates so it appears immediately
        if (payload.lead) setMyCandidates(prev => [payload.lead as NetworkCandidate, ...prev]);
        // also refresh server-side list in background
        loadMyCandidates();
      } else {
        toast({ title: "Error", description: payload.error ?? "Could not add candidate", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Could not add candidate", variant: "destructive" });
    }
  }

  async function addAllToNetwork() {
    if (!signals || signals.length === 0) return;
    setAddAllProcessing(true);
    let success = 0;
    let failed = 0;
    for (const signal of [...signals]) {
      try {
        const r = await authFetch(`/api/recruit/candidate-signals/${signal.id}/add-to-network`, { method: "POST" });
        const payload = await r.json().catch(() => ({}));
        if (r.ok && payload.lead) {
          // remove from signals list and prepend to myCandidates
          setSignals(prev => prev.filter(s => s.id !== signal.id));
          setMyCandidates(prev => [payload.lead as NetworkCandidate, ...prev]);
          success += 1;
        } else {
          failed += 1;
        }
      } catch (err) {
        failed += 1;
      }
    }
    setAddAllProcessing(false);
    // refresh server-side list in background
    loadMyCandidates();
    if (success > 0) {
      toast({ title: `Added ${success} candidate${success > 1 ? "s" : ""} to your network` });
    }
    if (failed > 0) {
      toast({ title: "Some additions failed", description: `${failed} failed`, variant: "destructive" });
    }
  }

  async function deleteCandidate(id: string) {
    if (!confirm("Delete this candidate from your network?")) return;
    try {
      const r = await authFetch(`/api/recruit/candidates/${id}`, { method: "DELETE" });
      if (r.ok) {
        setMyCandidates(prev => prev.filter(c => c.id !== id));
        toast({ title: "Candidate removed" });
      } else {
        const err = await r.json().catch(() => ({}));
        toast({ title: "Error", description: err.error ?? "Failed to delete", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    }
  }

  async function dismissSignal(signal: CandidateSignal) {
    setSignals(prev => prev.filter(s => s.id !== signal.id));
    try {
      const r = await authFetch(`/api/recruit/candidate-signals/${signal.id}/dismiss`, { method: "POST" });
      if (!r.ok) {
        setSignals(prev => [...prev, signal]);
        const err = await r.json().catch(() => ({}));
        toast({ title: "Couldn't dismiss", description: err.error ?? "Try again", variant: "destructive" });
      }
    } catch {
      setSignals(prev => [...prev, signal]);
      toast({ title: "Couldn't dismiss", description: "Network error", variant: "destructive" });
    }
  }

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ color: "#64748B", margin: 0, fontSize: "0.9375rem" }}>Search and manage your candidate pipeline</p>
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #E2E8F0" }}>
          {([["search", "Search"], ["my-candidates", "My Candidates"]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding: "9px 18px", border: "none", background: "transparent", cursor: "pointer",
                fontSize: "0.875rem", fontWeight: 600,
                color: tab === id ? "#2563EB" : "#64748B",
                borderBottom: tab === id ? "2px solid #2563EB" : "2px solid transparent",
                marginBottom: -1,
              }}
            >{label}</button>
          ))}
        </div>

        {tab === "search" && (
          <div>
            <div style={{ position: "relative", maxWidth: 480, marginBottom: 20 }}>
              <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "#9CA3AF" }} />
              <input
                value={networkQuery}
                onChange={e => setNetworkQuery(e.target.value)}
                placeholder="Search by name, title, company…"
                style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9, borderRadius: 10, border: "1px solid #E2E8F0", fontSize: "0.875rem", outline: "none", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 14, padding: 20, marginBottom: 20 }}>
              <p style={{ margin: "0 0 14px", fontSize: "0.8125rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".04em" }}>
                Source candidates from LinkedIn
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr auto", gap: 12, alignItems: "end" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748B", marginBottom: 6 }}>Role *</label>
                  <input
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    placeholder="e.g. Software Engineer"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid #E2E8F0", fontSize: "0.875rem", outline: "none", boxSizing: "border-box", background: "#fff" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748B", marginBottom: 6 }}>Location</label>
                  <input
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    placeholder="e.g. India"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid #E2E8F0", fontSize: "0.875rem", outline: "none", boxSizing: "border-box", background: "#fff" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748B", marginBottom: 6 }}>Experience</label>
                  <select
                    value={experience}
                    onChange={e => setExperience(e.target.value)}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid #E2E8F0", fontSize: "0.875rem", outline: "none", boxSizing: "border-box", background: "#fff" }}
                  >
                    {EXPERIENCE_LEVELS.map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
                  </select>
                </div>
                <button
                  onClick={submitSearch}
                  disabled={triggering}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 9, border: "none", background: "#2563EB", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: "0.875rem", whiteSpace: "nowrap" }}
                >
                  <Play style={{ width: 14, height: 14 }} /> {triggering ? "Starting…" : "Search candidates"}
                </button>
                <button
                  onClick={addAllToNetwork}
                  disabled={addAllProcessing || signals.length === 0}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 9, border: "none", background: "#2563EB", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: "0.875rem", whiteSpace: "nowrap" }}
                >
                  {addAllProcessing ? "Adding…" : "Add all to network"}
                </button>
              </div>
            </div>

            {!hasSearched ? (
              <EmptyState icon={UserSearch} message="Type to search your candidate network" />
            ) : signalsLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[1, 2, 3].map(i => <div key={i} style={{ height: 90, borderRadius: 12, background: "#F1F5F9" }} />)}
              </div>
            ) : signals.length === 0 ? (
              <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 14, padding: "40px 32px", textAlign: "center" }}>
                <UserSearch style={{ width: 40, height: 40, color: "#CBD5E1", margin: "0 auto 12px", display: "block" }} />
                <h3 style={{ margin: "0 0 8px", fontSize: "1rem", fontWeight: 700, color: "#374151" }}>No results yet</h3>
                <p style={{ color: "#64748B", fontSize: "0.875rem", margin: 0 }}>
                  Sourcing runs in the background — this can take a minute. Click "Search candidates" again to refresh.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {signals.map(signal => {
                  const tone = scoreTone(signal.job_seeking_score);
                  const name = [signal.first_name, signal.last_name].filter(Boolean).join(" ") || "Unknown";
                  const locationLabel = [signal.location_city, signal.location_country].filter(Boolean).join(", ");
                  return (
                    <div key={signal.id} style={{
                      display: "flex", alignItems: "center", gap: 16, padding: "16px 18px",
                      background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12,
                    }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: "50%", background: "#F1F5F9",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        fontWeight: 700, color: "#475569", fontSize: "0.8125rem",
                      }}>
                        {name.slice(0, 2).toUpperCase()}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                          <a href={signal.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ margin: 0, fontWeight: 700, color: "#0A0A0A", fontSize: "0.9375rem", textDecoration: "none" }}>
                            {name}
                          </a>
                          {signal.open_to_work && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.6875rem", fontWeight: 700, color: "#16A34A", background: "#F0FDF4", padding: "1px 7px", borderRadius: 6 }}>
                              <CircleDot style={{ width: 10, height: 10 }} /> Open to work
                            </span>
                          )}
                          {signal.location_matched === false && (
                            <span title="Scraped profile's country didn't match your search location" style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#D97706", background: "#FFFBEB", padding: "1px 7px", borderRadius: 6 }}>
                              Location mismatch
                            </span>
                          )}
                        </div>
                        <p style={{ margin: 0, fontSize: "0.875rem", color: "#374151" }}>
                          {signal.current_title || signal.headline || "—"}
                          {signal.current_company && <span style={{ color: "#94A3B8" }}> · {signal.current_company}</span>}
                          {locationLabel && <span style={{ color: "#94A3B8" }}> · {locationLabel}</span>}
                        </p>
                        {signal.top_skills && signal.top_skills.length > 0 && (
                          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                            {signal.top_skills.slice(0, 5).map(skill => (
                              <span key={skill} style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#64748B", background: "#F1F5F9", padding: "2px 8px", borderRadius: 6 }}>
                                {skill}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 999, background: tone.bg, color: tone.fg, fontWeight: 700, fontSize: "0.75rem", flexShrink: 0 }}>
                        <Flame style={{ width: 13, height: 13 }} /> {tone.label} ({signal.job_seeking_score})
                      </div>

                      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        <button
                          onClick={() => addToNetwork(signal)}
                          style={{ padding: "8px 14px", borderRadius: 9, border: "none", background: "#0A0A0A", color: "#fff", fontWeight: 600, fontSize: "0.8125rem", cursor: "pointer" }}
                        >
                          Add to network
                        </button>
                        <button
                          onClick={() => dismissSignal(signal)}
                          title="Dismiss"
                          style={{ padding: 8, borderRadius: 9, border: "1px solid #E2E8F0", background: "#fff", color: "#94A3B8", cursor: "pointer", display: "flex" }}
                        >
                          <X style={{ width: 14, height: 14 }} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "my-candidates" && (
          <div>
            <div style={{ position: "relative", maxWidth: 480, marginBottom: 20 }}>
              <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "#9CA3AF" }} />
              <input
                value={networkQuery}
                onChange={e => setNetworkQuery(e.target.value)}
                placeholder="Search by name, title, company…"
                style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9, borderRadius: 10, border: "1px solid #E2E8F0", fontSize: "0.875rem", outline: "none", boxSizing: "border-box" }}
              />
            </div>

            {myCandidatesLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[1, 2, 3].map(i => <div key={i} style={{ height: 80, borderRadius: 12, background: "#F1F5F9" }} />)}
              </div>
            ) : myCandidates.length === 0 ? (
              <EmptyState icon={UserSearch} message="Candidates added to your network will appear here." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {myCandidates.map(c => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Unknown";
                  const tone = statusTone(c.review_status);
                  return (
                    <div key={c.id} style={{
                      display: "flex", alignItems: "center", gap: 16, padding: "14px 18px",
                      background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12,
                    }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: "50%", background: "#F1F5F9",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        fontWeight: 700, color: "#475569", fontSize: "0.8125rem",
                      }}>
                        {name.slice(0, 2).toUpperCase()}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {c.linkedin_url ? (
                            <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ margin: 0, fontWeight: 700, color: "#0A0A0A", fontSize: "0.9375rem", textDecoration: "none" }}>
                              {name}
                            </a>
                          ) : (
                            <p style={{ margin: 0, fontWeight: 700, color: "#0A0A0A", fontSize: "0.9375rem" }}>{name}</p>
                          )}
                          {c.review_status && (
                            <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: tone.fg, background: tone.bg, padding: "1px 7px", borderRadius: 6, textTransform: "capitalize" }}>
                              {c.review_status}
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 2 }}>
                          {(c.job_title || c.company_name) && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.8125rem", color: "#64748B" }}>
                              <Briefcase style={{ width: 12, height: 12 }} />
                              {[c.job_title, c.company_name].filter(Boolean).join(" · ")}
                            </span>
                          )}
                          {c.email && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.8125rem", color: "#64748B" }}>
                              <Mail style={{ width: 12, height: 12 }} /> {c.email}
                            </span>
                          )}
                        </div>
                      </div>

                      <span style={{ fontSize: "0.75rem", color: "#94A3B8", flexShrink: 0 }}>
                        {c.updated_at ? new Date(c.updated_at).toLocaleDateString() : ""}
                      </span>
                      <div style={{ display: "flex", gap: 8, marginLeft: 8 }}>
                        <button
                          onClick={() => deleteCandidate(c.id)}
                          title="Remove"
                          style={{ padding: 8, borderRadius: 9, border: "1px solid #E2E8F0", background: "#fff", color: "#94A3B8", cursor: "pointer", display: "flex" }}
                        >
                          <X style={{ width: 14, height: 14 }} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}