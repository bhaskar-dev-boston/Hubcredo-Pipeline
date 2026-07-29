import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { useListLeadLists } from "@workspace/api-client-react";
import type { LeadList } from "@workspace/api-client-react";
import {
  Phone, Plus, Loader2, Play, Pencil, Trash2, CheckCircle2,
  AlertCircle, Clock, ChevronDown, ChevronUp, RefreshCw, X,
  Mic, Users, Calendar, BarChart2, FileText, Volume2,
} from "lucide-react";

const API_BASE = "/api";
function apiUrl(path: string) {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}${API_BASE}${path}`;
}
function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface ELAgent {
  id: string;
  elevenlabs_agent_id: string;
  name: string;
  first_message: string;
  system_prompt: string;
  voice_id: string;
  language: string;
  phone_number_id: string | null;
  phone_number: string | null;
  status: "draft" | "published";
  created_at: string;
}

interface CallBatch {
  id: string;
  call_name: string;
  elevenlabs_batch_id: string;
  status: string;
  total_calls: number;
  lead_list_id: string;
  stats_json: { total_calls_dispatched?: number; total_calls_scheduled?: number; total_calls_finished?: number } | null;
  created_at: string;
}

interface Call {
  id: string;
  phone_number: string | null;
  lead_name: string | null;
  company: string | null;
  status: string;
  outcome: string | null;
  duration_seconds: number | null;
  transcript: string | null;
  drive_share_url: string | null;
  created_at: string;
}

// ── Preset voices ────────────────────────────────────────────────────────────

const VOICE_PRESETS = [
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel (Female, conversational)" },
  { id: "29vD33N1adt5zvmXBAzu", label: "Drew (Male, well-rounded)" },
  { id: "2EiwWnXFnvU5JabPnv8n", label: "Clyde (Male, war-veteran)" },
  { id: "5Q0t7uMcjvnagumLfvZi", label: "Paul (Male, news presenter)" },
  { id: "AZnzlk1XvdvUeBnXmlld", label: "Domi (Female, strong)" },
  { id: "CYw3kZ3HuHWtHbBOJeVF", label: "Dave (Male, British)" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    published: { bg: "#DCFCE7", text: "#166534", label: "Published" },
    draft: { bg: "#F3F4F6", text: "#6B7280", label: "Draft" },
    pending: { bg: "#FEF9C3", text: "#854D0E", label: "Pending" },
    in_progress: { bg: "#DBEAFE", text: "#1E40AF", label: "In Progress" },
    completed: { bg: "#DCFCE7", text: "#166534", label: "Completed" },
    failed: { bg: "#FEE2E2", text: "#991B1B", label: "Failed" },
    cancelled: { bg: "#F3F4F6", text: "#6B7280", label: "Cancelled" },
    answered: { bg: "#DCFCE7", text: "#166534", label: "Answered" },
    no_answer: { bg: "#FEF9C3", text: "#854D0E", label: "No Answer" },
    busy: { bg: "#FEE2E2", text: "#991B1B", label: "Busy" },
    error: { bg: "#FEE2E2", text: "#991B1B", label: "Error" },
  };
  const s = map[status] ?? { bg: "#F3F4F6", text: "#6B7280", label: status };
  return (
    <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: "0.7rem", fontWeight: 600, background: s.bg, color: s.text }}>
      {s.label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDuration(secs: number | null) {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Agent Form Modal ─────────────────────────────────────────────────────────

interface AgentFormProps {
  agent: ELAgent | null;
  onClose: () => void;
  onSaved: () => void;
}

function AgentFormModal({ agent, onClose, onSaved }: AgentFormProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: agent?.name ?? "",
    first_message: agent?.first_message ?? "",
    system_prompt: agent?.system_prompt ?? "",
    voice_id: agent?.voice_id ?? "21m00Tcm4TlvDq8ikWAM",
    language: agent?.language ?? "en",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.system_prompt.trim()) {
      toast({ title: "Name and script are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const url = agent ? apiUrl(`/elevenlabs/agents/${agent.id}`) : apiUrl("/elevenlabs/agents");
      const res = await fetch(url, {
        method: agent ? "PATCH" : "POST",
        headers: authHeaders(),
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save agent");
      toast({ title: agent ? "Agent updated" : "Agent published!" });
      onSaved();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", border: "1px solid rgba(107,78,255,.2)",
    borderRadius: 8, fontSize: "0.875rem", outline: "none", background: "#FAFAFA",
    boxSizing: "border-box",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 540, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,.2)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#1E1B4B", margin: 0 }}>
            {agent ? "Edit Agent" : "Create Calling Agent"}
          </h2>
          <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#6B7280" }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Agent Name *</label>
            <input style={inputStyle} value={form.name} onChange={set("name")} placeholder="e.g. SaaS Outbound Agent" required />
          </div>

          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
              Opening Line <span style={{ color: "#9CA3AF", fontWeight: 400 }}>(supports {"{{lead_name}}"}, {"{{company}}"})</span>
            </label>
            <input style={inputStyle} value={form.first_message} onChange={set("first_message")} placeholder='e.g. "Hey {{lead_name}}, this is Alex from HubCredo — got a quick minute?"' />
          </div>

          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Script / System Prompt *</label>
            <textarea
              style={{ ...inputStyle, minHeight: 120, resize: "vertical", fontFamily: "inherit" }}
              value={form.system_prompt}
              onChange={set("system_prompt") as any}
              placeholder="You are a sales agent for HubCredo. Your goal is to book a 15-min demo call. Keep the conversation short and to the point..."
              required
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Voice</label>
              <select style={inputStyle} value={form.voice_id} onChange={set("voice_id")}>
                {VOICE_PRESETS.map(v => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Language</label>
              <select style={inputStyle} value={form.language} onChange={set("language")}>
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="pt">Portuguese</option>
                <option value="hi">Hindi</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{ marginTop: 4, padding: "10px 0", background: "linear-gradient(135deg,#6B4EFF,#8B5CF6)", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: "0.9rem", cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {saving ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : null}
            {saving ? "Publishing…" : agent ? "Update Agent" : "Publish Agent"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Phone Number Modal ────────────────────────────────────────────────────────

interface PhoneModalProps {
  agentId: string;
  onClose: () => void;
  onSaved: () => void;
}

function PhoneNumberModal({ agentId, onClose, onSaved }: PhoneModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ phone_number: "", twilio_account_sid: "", twilio_auth_token: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(apiUrl("/elevenlabs/phone-numbers"), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ ...form, agent_db_id: agentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to attach phone number");
      toast({ title: "Phone number attached!" });
      onSaved();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", border: "1px solid rgba(107,78,255,.2)",
    borderRadius: 8, fontSize: "0.875rem", outline: "none", background: "#FAFAFA",
    boxSizing: "border-box",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#1E1B4B", margin: 0 }}>Attach Phone Number (Twilio)</h2>
          <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#6B7280" }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>
        <p style={{ fontSize: "0.8rem", color: "#6B7280", marginBottom: 16 }}>
          Your Twilio credentials are passed directly to ElevenLabs and are never stored in HubCredo.
        </p>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Phone Number</label>
            <input style={inputStyle} value={form.phone_number} onChange={set("phone_number")} placeholder="+1XXXXXXXXXX" required />
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Twilio Account SID</label>
            <input style={inputStyle} value={form.twilio_account_sid} onChange={set("twilio_account_sid")} placeholder="ACxxxxxxxxxxxxxxxx" required />
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Twilio Auth Token</label>
            <input style={inputStyle} type="password" value={form.twilio_auth_token} onChange={set("twilio_auth_token")} placeholder="••••••••••••••••" required />
          </div>
          <button
            type="submit"
            disabled={saving}
            style={{ marginTop: 4, padding: "10px 0", background: "#6B4EFF", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {saving ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : null}
            {saving ? "Attaching…" : "Attach Number"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── New Batch Modal ───────────────────────────────────────────────────────────

interface NewBatchModalProps {
  agents: ELAgent[];
  leadLists: LeadList[];
  onClose: () => void;
  onLaunched: () => void;
}

function NewBatchModal({ agents, leadLists, onClose, onLaunched }: NewBatchModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ call_name: "", agent_db_id: "", lead_list_id: "", schedule: "now", scheduled_datetime: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const publishedAgents = agents.filter(a => a.status === "published");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.call_name || !form.agent_db_id || !form.lead_list_id) {
      toast({ title: "All fields are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, any> = {
        call_name: form.call_name,
        agent_db_id: form.agent_db_id,
        lead_list_id: form.lead_list_id,
      };
      if (form.schedule === "scheduled" && form.scheduled_datetime) {
        body.scheduled_time_unix = Math.floor(new Date(form.scheduled_datetime).getTime() / 1000);
      }
      const res = await fetch(apiUrl("/elevenlabs/batches"), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to launch batch");
      toast({ title: "Batch launched! 🚀" });
      onLaunched();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", border: "1px solid rgba(107,78,255,.2)",
    borderRadius: 8, fontSize: "0.875rem", outline: "none", background: "#FAFAFA",
    boxSizing: "border-box",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#1E1B4B", margin: 0 }}>New Batch Call</h2>
          <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#6B7280" }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Campaign Name</label>
            <input style={inputStyle} value={form.call_name} onChange={set("call_name")} placeholder='e.g. "Q3 SaaS Outbound"' required />
          </div>

          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Agent</label>
            <select style={inputStyle} value={form.agent_db_id} onChange={set("agent_db_id")} required>
              <option value="">Select a published agent…</option>
              {publishedAgents.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.phone_number ? ` (${a.phone_number})` : " ⚠ no phone"}
                </option>
              ))}
            </select>
            {publishedAgents.length === 0 && (
              <p style={{ fontSize: "0.72rem", color: "#EF4444", marginTop: 4 }}>No published agents yet. Create one in Agent Setup first.</p>
            )}
          </div>

          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Lead List</label>
            <select style={inputStyle} value={form.lead_list_id} onChange={set("lead_list_id")} required>
              <option value="">Select a lead list…</option>
              {leadLists.map((ll: LeadList) => (
                <option key={ll.id} value={ll.id}>{ll.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Schedule</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["now", "scheduled"] as const).map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, schedule: opt }))}
                  style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1.5px solid ${form.schedule === opt ? "#6B4EFF" : "rgba(107,78,255,.2)"}`, background: form.schedule === opt ? "#F5F3FF" : "#fff", color: form.schedule === opt ? "#6B4EFF" : "#6B7280", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer" }}
                >
                  {opt === "now" ? "Launch Now" : "Schedule"}
                </button>
              ))}
            </div>
            {form.schedule === "scheduled" && (
              <input
                type="datetime-local"
                style={{ ...inputStyle, marginTop: 8 }}
                value={form.scheduled_datetime}
                onChange={set("scheduled_datetime")}
                required
              />
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{ marginTop: 4, padding: "11px 0", background: "linear-gradient(135deg,#6B4EFF,#8B5CF6)", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: "0.9rem", cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {saving ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : null}
            {saving ? "Launching…" : "🚀 Launch Batch"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Call Row (expandable) ─────────────────────────────────────────────────────

function CallRow({ call }: { call: Call }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ border: "1px solid rgba(107,78,255,.1)", borderRadius: 10, marginBottom: 6, overflow: "hidden" }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer", background: "#FAFAFE" }}
      >
        <Phone style={{ width: 14, height: 14, color: "#6B4EFF", flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: "0.875rem", fontWeight: 500, color: "#1E1B4B" }}>
          {call.lead_name ?? call.phone_number ?? "Unknown"}
          {call.company ? <span style={{ color: "#6B7280", fontWeight: 400 }}> · {call.company}</span> : null}
        </span>
        {statusBadge(call.outcome ?? call.status)}
        <span style={{ fontSize: "0.75rem", color: "#9CA3AF", marginLeft: 8 }}>{formatDuration(call.duration_seconds)}</span>
        {expanded ? <ChevronUp style={{ width: 14, height: 14, color: "#9CA3AF" }} /> : <ChevronDown style={{ width: 14, height: 14, color: "#9CA3AF" }} />}
      </div>

      {expanded && (
        <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(107,78,255,.08)", background: "#fff" }}>
          {call.transcript ? (
            <div>
              <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Transcript</p>
              <pre style={{ fontSize: "0.8rem", color: "#374151", whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0, background: "#F9FAFB", borderRadius: 8, padding: "10px 12px", lineHeight: 1.6 }}>
                {call.transcript}
              </pre>
            </div>
          ) : (
            <p style={{ fontSize: "0.8rem", color: "#9CA3AF", fontStyle: "italic" }}>No transcript yet.</p>
          )}
          {call.drive_share_url && (
            <a href={call.drive_share_url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: "0.8rem", color: "#6B4EFF", textDecoration: "none", fontWeight: 600 }}>
              <Volume2 style={{ width: 13, height: 13 }} /> Listen on Drive
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── Batch Row ─────────────────────────────────────────────────────────────────

function BatchRow({ batch: initialBatch, agents, leadLists }: { batch: CallBatch; agents: ELAgent[]; leadLists: LeadList[] }) {
  const [expanded, setExpanded] = useState(false);
  const [calls, setCalls] = useState<Call[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  // Local copy of batch so we can update stats after polling without re-fetching the full list
  const [batch, setBatch] = useState<CallBatch>(initialBatch);

  const stats = batch.stats_json;

  async function loadCalls() {
    setExpanded(e => {
      if (e && calls.length > 0) return false; // collapse
      return true;
    });
    if (expanded && calls.length > 0) return; // already loaded, just toggled closed

    setLoadingCalls(true);
    try {
      // Fetch batch detail + calls in parallel.
      // The batch detail endpoint triggers ElevenLabs reconciliation server-side,
      // so stats and per-call statuses are fresh when we display them.
      const [batchRes, callsRes] = await Promise.all([
        fetch(apiUrl(`/elevenlabs/batches/${batch.id}`), { headers: authHeaders() }),
        fetch(apiUrl(`/elevenlabs/batches/${batch.id}/calls`), { headers: authHeaders() }),
      ]);
      if (batchRes.ok) {
        const batchJson = await batchRes.json();
        if (batchJson.batch) setBatch(batchJson.batch);
      }
      if (callsRes.ok) {
        const callsJson = await callsRes.json();
        setCalls(callsJson.calls ?? []);
      }
    } catch { /* ignore */ }
    setLoadingCalls(false);
  }

  return (
    <div style={{ border: "1px solid rgba(107,78,255,.1)", borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", background: "#FAFAFE" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: "0.9rem", fontWeight: 700, color: "#1E1B4B", margin: "0 0 2px" }}>{batch.call_name}</p>
            <p style={{ fontSize: "0.75rem", color: "#6B7280", margin: 0 }}>{formatDate(batch.created_at)} · {batch.total_calls} leads</p>
          </div>
          {statusBadge(batch.status)}
        </div>

        {stats && (
          <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
            {[
              { icon: Play, label: "Dispatched", val: stats.total_calls_dispatched ?? 0 },
              { icon: Clock, label: "Scheduled", val: stats.total_calls_scheduled ?? 0 },
              { icon: CheckCircle2, label: "Finished", val: stats.total_calls_finished ?? 0 },
            ].map(({ icon: Icon, label, val }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.78rem", color: "#6B7280" }}>
                <Icon style={{ width: 13, height: 13 }} />
                <span style={{ fontWeight: 700, color: "#1E1B4B" }}>{val}</span> {label}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={loadCalls}
          style={{ marginTop: 10, padding: "5px 12px", border: "1.5px solid rgba(107,78,255,.2)", borderRadius: 7, background: "transparent", color: "#6B4EFF", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
        >
          <FileText style={{ width: 12, height: 12 }} />
          {expanded ? "Hide Calls" : "View Calls"}
        </button>
      </div>

      {expanded && (
        <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(107,78,255,.08)", background: "#fff" }}>
          {loadingCalls ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#6B7280", fontSize: "0.85rem" }}>
              <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Loading calls…
            </div>
          ) : calls.length === 0 ? (
            <p style={{ fontSize: "0.82rem", color: "#9CA3AF", fontStyle: "italic" }}>No call records yet.</p>
          ) : (
            calls.map(c => <CallRow key={c.id} call={c} />)
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ColdCalling() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"setup" | "batches">("setup");

  const [agents, setAgents] = useState<ELAgent[]>([]);
  const [batches, setBatches] = useState<CallBatch[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingBatches, setLoadingBatches] = useState(true);

  const [showAgentForm, setShowAgentForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState<ELAgent | null>(null);
  const [showPhoneModal, setShowPhoneModal] = useState<ELAgent | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);

  const { data: leadListsData } = useListLeadLists();
  const leadLists: LeadList[] = (leadListsData as LeadList[]) ?? [];

  const loadAgents = useCallback(async () => {
    setLoadingAgents(true);
    try {
      const res = await fetch(apiUrl("/elevenlabs/agents"), { headers: authHeaders() });
      const json = await res.json();
      setAgents(json.agents ?? []);
    } catch {
      toast({ title: "Failed to load agents", variant: "destructive" });
    } finally {
      setLoadingAgents(false);
    }
  }, []);

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true);
    try {
      const res = await fetch(apiUrl("/elevenlabs/batches"), { headers: authHeaders() });
      const json = await res.json();
      setBatches(json.batches ?? []);
    } catch {
      toast({ title: "Failed to load batches", variant: "destructive" });
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  useEffect(() => { loadAgents(); }, [loadAgents]);
  useEffect(() => {
    if (activeTab === "batches") loadBatches();
  }, [activeTab, loadBatches]);

  async function deleteAgent(agent: ELAgent) {
    if (!confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) return;
    try {
      await fetch(apiUrl(`/elevenlabs/agents/${agent.id}`), { method: "DELETE", headers: authHeaders() });
      setAgents(prev => prev.filter(a => a.id !== agent.id));
      toast({ title: "Agent deleted" });
    } catch {
      toast({ title: "Failed to delete agent", variant: "destructive" });
    }
  }

  const tabBtn = (tab: "setup" | "batches", label: string) => (
    <button
      onClick={() => setActiveTab(tab)}
      style={{ padding: "10px 18px", fontSize: "0.875rem", fontWeight: 600, border: "none", background: "transparent", cursor: "pointer", borderBottom: `2px solid ${activeTab === tab ? "#6B4EFF" : "transparent"}`, color: activeTab === tab ? "#6B4EFF" : "#6B7280", transition: "all .15s", marginBottom: -1 }}
    >
      {label}
    </button>
  );

  return (
    <DashboardLayout>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 20px" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#6B4EFF,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Phone style={{ width: 18, height: 18, color: "#fff" }} />
            </div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#1E1B4B", margin: 0, letterSpacing: "-0.02em" }}>Cold Calling</h1>
          </div>
          <p style={{ fontSize: "0.875rem", color: "#6B7280", margin: 0 }}>
            Automate outbound calls with ElevenLabs AI voice agents. Create agents, attach phone numbers, and launch batch campaigns.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ borderBottom: "1px solid rgba(107,78,255,.12)", marginBottom: 24, display: "flex", gap: 4 }}>
          {tabBtn("setup", "🤖 Agent Setup & Publish")}
          {tabBtn("batches", "📞 Batch Calling")}
        </div>

        {/* ── SECTION A: AGENT SETUP ── */}
        {activeTab === "setup" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "#6B7280" }}>
                {agents.length} agent{agents.length !== 1 ? "s" : ""} configured
              </p>
              <button
                onClick={() => { setEditingAgent(null); setShowAgentForm(true); }}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", background: "linear-gradient(135deg,#6B4EFF,#8B5CF6)", color: "#fff", border: "none", borderRadius: 10, fontWeight: 600, fontSize: "0.85rem", cursor: "pointer", boxShadow: "0 2px 8px rgba(107,78,255,.3)" }}
              >
                <Plus style={{ width: 14, height: 14 }} /> New Agent
              </button>
            </div>

            {loadingAgents ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#6B7280", padding: "40px 0" }}>
                <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} /> Loading agents…
              </div>
            ) : agents.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", border: "2px dashed rgba(107,78,255,.15)", borderRadius: 16 }}>
                <Mic style={{ width: 36, height: 36, color: "#C4B5FD", margin: "0 auto 12px" }} />
                <p style={{ fontSize: "1rem", fontWeight: 600, color: "#1E1B4B", margin: "0 0 4px" }}>No agents yet</p>
                <p style={{ fontSize: "0.85rem", color: "#6B7280", margin: "0 0 16px" }}>Create your first AI calling agent to get started.</p>
                <button
                  onClick={() => { setEditingAgent(null); setShowAgentForm(true); }}
                  style={{ padding: "9px 20px", background: "#6B4EFF", color: "#fff", border: "none", borderRadius: 10, fontWeight: 600, cursor: "pointer" }}
                >
                  Create Agent
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {agents.map(agent => (
                  <div key={agent.id} style={{ border: "1px solid rgba(107,78,255,.1)", borderRadius: 12, padding: "16px 18px", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg,#EDE9FE,#DDD6FE)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Mic style={{ width: 16, height: 16, color: "#6B4EFF" }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#1E1B4B" }}>{agent.name}</span>
                          {statusBadge(agent.status)}
                        </div>
                        <p style={{ fontSize: "0.78rem", color: "#6B7280", margin: "4px 0 0" }}>
                          Voice: {VOICE_PRESETS.find(v => v.id === agent.voice_id)?.label?.split(" (")[0] ?? agent.voice_id}
                          {" · "}Language: {agent.language.toUpperCase()}
                        </p>
                        {agent.phone_number ? (
                          <p style={{ fontSize: "0.78rem", color: "#059669", margin: "2px 0 0", fontWeight: 600 }}>
                            📱 {agent.phone_number}
                          </p>
                        ) : (
                          <button
                            onClick={() => setShowPhoneModal(agent)}
                            style={{ marginTop: 4, padding: "3px 10px", border: "1.5px solid #FCA5A5", borderRadius: 6, background: "#FFF5F5", color: "#DC2626", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer" }}
                          >
                            ⚠ Attach Phone Number
                          </button>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => { setEditingAgent(agent); setShowAgentForm(true); }}
                          title="Edit"
                          style={{ padding: "6px 10px", border: "1px solid rgba(107,78,255,.2)", borderRadius: 8, background: "#F5F3FF", color: "#6B4EFF", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: "0.78rem", fontWeight: 600 }}
                        >
                          <Pencil style={{ width: 12, height: 12 }} /> Edit
                        </button>
                        <button
                          onClick={() => deleteAgent(agent)}
                          title="Delete"
                          style={{ padding: "6px 8px", border: "1px solid #FCA5A5", borderRadius: 8, background: "#FFF5F5", color: "#DC2626", cursor: "pointer" }}
                        >
                          <Trash2 style={{ width: 12, height: 12 }} />
                        </button>
                      </div>
                    </div>

                    {agent.first_message && (
                      <div style={{ marginTop: 10, padding: "8px 12px", background: "#F9FAFB", borderRadius: 8, borderLeft: "3px solid #C4B5FD" }}>
                        <p style={{ fontSize: "0.78rem", color: "#6B7280", margin: "0 0 2px", fontWeight: 600 }}>Opening Line</p>
                        <p style={{ fontSize: "0.82rem", color: "#374151", margin: 0, fontStyle: "italic" }}>"{agent.first_message}"</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SECTION B: BATCH CALLING ── */}
        {activeTab === "batches" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "#6B7280" }}>
                {batches.length} batch{batches.length !== 1 ? "es" : ""} total
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={loadBatches}
                  title="Refresh"
                  style={{ padding: "7px 10px", border: "1px solid rgba(107,78,255,.2)", borderRadius: 8, background: "#fff", color: "#6B4EFF", cursor: "pointer" }}
                >
                  <RefreshCw style={{ width: 14, height: 14 }} />
                </button>
                <button
                  onClick={() => setShowBatchModal(true)}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", background: "linear-gradient(135deg,#6B4EFF,#8B5CF6)", color: "#fff", border: "none", borderRadius: 10, fontWeight: 600, fontSize: "0.85rem", cursor: "pointer", boxShadow: "0 2px 8px rgba(107,78,255,.3)" }}
                >
                  <Plus style={{ width: 14, height: 14 }} /> New Batch
                </button>
              </div>
            </div>

            {loadingBatches ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#6B7280", padding: "40px 0" }}>
                <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} /> Loading batches…
              </div>
            ) : batches.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", border: "2px dashed rgba(107,78,255,.15)", borderRadius: 16 }}>
                <Users style={{ width: 36, height: 36, color: "#C4B5FD", margin: "0 auto 12px" }} />
                <p style={{ fontSize: "1rem", fontWeight: 600, color: "#1E1B4B", margin: "0 0 4px" }}>No batches yet</p>
                <p style={{ fontSize: "0.85rem", color: "#6B7280", margin: "0 0 16px" }}>Launch your first batch to start calling leads.</p>
                <button
                  onClick={() => setShowBatchModal(true)}
                  style={{ padding: "9px 20px", background: "#6B4EFF", color: "#fff", border: "none", borderRadius: 10, fontWeight: 600, cursor: "pointer" }}
                >
                  New Batch
                </button>
              </div>
            ) : (
              <div>
                {batches.map(batch => (
                  <BatchRow key={batch.id} batch={batch} agents={agents} leadLists={leadLists} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAgentForm && (
        <AgentFormModal
          agent={editingAgent}
          onClose={() => { setShowAgentForm(false); setEditingAgent(null); }}
          onSaved={() => { setShowAgentForm(false); setEditingAgent(null); loadAgents(); }}
        />
      )}
      {showPhoneModal && (
        <PhoneNumberModal
          agentId={showPhoneModal.id}
          onClose={() => setShowPhoneModal(null)}
          onSaved={() => { setShowPhoneModal(null); loadAgents(); }}
        />
      )}
      {showBatchModal && (
        <NewBatchModal
          agents={agents}
          leadLists={leadLists}
          onClose={() => setShowBatchModal(false)}
          onLaunched={() => { setShowBatchModal(false); loadBatches(); }}
        />
      )}
    </DashboardLayout>
  );
}
