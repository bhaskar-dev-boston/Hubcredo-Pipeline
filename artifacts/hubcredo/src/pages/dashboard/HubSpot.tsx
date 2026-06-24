// src/pages/dashboard/HubSpot.tsx
// Full HubSpot CRM frontend — mirrors CRM.tsx (Attio) but for HubSpot
// Tabs: Contacts · Companies · Deals · Lists · Sync

import { useState, useEffect, useCallback, type ReactNode } from "react";
import {
  Users, Building2, Kanban, List, RefreshCw,
  Search, Plus, Loader2, X, Trash2,
  CheckCircle2, Circle, Mail, Calendar, ExternalLink,
  AlertCircle, CheckSquare, Settings2, Upload,
  ArrowRight, Phone, Briefcase, BarChart3,
} from "lucide-react";
import { getToken } from "@/lib/auth";

// ─── API helper ───────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
  let body: any = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface HSContact {
  id: string;
  properties: {
    email?: string; firstname?: string; lastname?: string;
    jobtitle?: string; company?: string; phone?: string;
    hubcredo_linkedin_url?: string;
  };
}
interface HSCompany {
  id: string;
  properties: { name?: string; domain?: string; city?: string; state?: string; numberofemployees?: string };
}
interface HSDeal {
  id: string;
  properties: { dealname?: string; dealstage?: string; amount?: string; closedate?: string; pipeline?: string };
}
interface HSList { listId: string; name: string; objectTypeId?: string }
interface HSNote { id: string; properties: { hs_note_body?: string; hs_timestamp?: string } }
interface HSTask {
  id: string;
  properties: {
    hs_task_subject?: string; hs_task_body?: string;
    hs_task_status?: string; hs_task_priority?: string; hs_timestamp?: string;
  };
}
type Tab = "contacts" | "companies" | "deals" | "lists" | "sync";

// ─── Design tokens — HubCredo purple/indigo theme ─────────────────────────────

const PRIMARY       = "#6366f1";           // indigo-500
const PRIMARY_LIGHT = "rgba(99,102,241,.1)";
const PRIMARY_RING  = "rgba(99,102,241,.25)";
const PRIMARY_DARK  = "#4f46e5";           // indigo-600

const inputCls = `w-full px-3.5 py-2.5 text-sm text-gray-800
  bg-white border border-gray-200 rounded-xl placeholder:text-gray-400
  focus:outline-none focus:ring-2 focus:ring-[rgba(99,102,241,.25)] focus:border-[#6366f1]
  transition-colors`;
const divider  = "divide-y divide-gray-100";
const rowHover = "hover:bg-gray-50 transition-colors";
const theadCls = "border-b border-gray-100 bg-gray-50/80";
const thCls    = "text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-widest";
const tdMuted  = "px-4 py-3 text-gray-500 text-sm";

const AVATAR_COLORS = [
  "bg-indigo-50 text-indigo-600", "bg-violet-50 text-violet-600",
  "bg-purple-50 text-purple-600", "bg-blue-50 text-blue-600",
  "bg-cyan-50 text-cyan-600",     "bg-indigo-100 text-indigo-700",
];
function avatarColor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.split(" ").filter(Boolean).map(p => p[0]).slice(0, 2).join("").toUpperCase() || "?";
}
function fullName(c: HSContact) {
  const f = c.properties.firstname ?? "";
  const l = c.properties.lastname ?? "";
  return [f, l].filter(Boolean).join(" ") || c.properties.email || c.id;
}
function stageBadge(stage?: string) {
  if (!stage) return null;
  const label = stage.replace(/_/g, " ").replace(/\b\w/g, s => s.toUpperCase());
  const colorMap: Record<string, string> = {
    appointmentscheduled:  "bg-blue-50 text-blue-700 border-blue-200",
    qualifiedtobuy:        "bg-indigo-50 text-indigo-700 border-indigo-200",
    presentationscheduled: "bg-violet-50 text-violet-700 border-violet-200",
    decisionmakerboughtin: "bg-purple-50 text-purple-700 border-purple-200",
    contractsent:          "bg-amber-50 text-amber-700 border-amber-200",
    closedwon:             "bg-green-50 text-green-700 border-green-200",
    closedlost:            "bg-red-50 text-red-700 border-red-200",
  };
  const cls = colorMap[stage.toLowerCase()] ?? "bg-gray-50 text-gray-600 border-gray-200";
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${cls}`}>{label}</span>;
}

// ─── Primary button helper ────────────────────────────────────────────────────

const btnPrimary: React.CSSProperties = {
  background: `linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY_DARK} 100%)`,
  boxShadow: `0 2px 8px ${PRIMARY_RING}`,
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export default function HubSpot() {
  const [tab, setTab]           = useState<Tab>("contacts");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [hubId, setHubId]       = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ connected: boolean; hub_id: string }>("/crm-hs/connection")
      .then(d => { setConnected(true); setHubId(d.hub_id); })
      .catch(() => setConnected(false));
  }, []);

  if (connected === null) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: PRIMARY }} />
    </div>
  );

  if (!connected) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <AlertCircle className="w-10 h-10 text-gray-300" />
      <p className="font-semibold text-gray-800">HubSpot not connected</p>
      <p className="text-sm text-gray-500 max-w-xs">
        Add <code className="bg-gray-100 px-1 rounded text-xs">HUBSPOT_API_KEY</code> to your server secrets to connect your HubSpot portal.
      </p>
    </div>
  );

  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: "contacts",  label: "Contacts",  icon: <Users className="w-4 h-4" /> },
    { id: "companies", label: "Companies", icon: <Building2 className="w-4 h-4" /> },
    { id: "deals",     label: "Deals",     icon: <Kanban className="w-4 h-4" /> },
    { id: "lists",     label: "Lists",     icon: <List className="w-4 h-4" /> },
    { id: "sync",      label: "Sync",      icon: <Upload className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#f8f8fc] text-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-0 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-3">
          {/* HubSpot icon tinted in brand purple */}
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: PRIMARY_LIGHT }}>
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill={PRIMARY}>
              <path d="M22.164 12.567c0-1.37-.37-2.652-1.017-3.75a5.334 5.334 0 0 0-2.5-2.118V4.573a1.89 1.89 0 0 0 1.094-1.705 1.89 1.89 0 0 0-1.89-1.89 1.89 1.89 0 0 0-1.89 1.89c0 .763.452 1.42 1.107 1.718v2.072a7.578 7.578 0 0 0-2.276.878L9.346 4.143a2.47 2.47 0 0 0 .085-.626 2.484 2.484 0 0 0-4.968 0 2.484 2.484 0 0 0 2.484 2.484c.464 0 .897-.13 1.265-.353l5.36 3.24a7.56 7.56 0 0 0-1.13 4.027v.002l.001.007a7.576 7.576 0 0 0 1.24 4.168l-1.506 1.507a1.906 1.906 0 0 0-.552-.085 1.922 1.922 0 1 0 1.922 1.922 1.91 1.91 0 0 0-.085-.553l1.49-1.49a7.585 7.585 0 0 0 4.426 1.416c4.18 0 7.585-3.405 7.585-7.585v-.657zm-7.585 5.103a5.103 5.103 0 1 1 0-10.206 5.103 5.103 0 0 1 0 10.206z"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">HubSpot CRM</h1>
          {hubId && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded border"
              style={{ color: PRIMARY, background: PRIMARY_LIGHT, borderColor: PRIMARY_RING }}>
              Hub #{hubId}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-all -mb-px
                ${tab === t.id
                  ? "border-indigo-500 text-indigo-600 bg-indigo-50/50"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 bg-[#f8f8fc]">
        {tab === "contacts"  && <ContactsTab />}
        {tab === "companies" && <CompaniesTab />}
        {tab === "deals"     && <DealsTab />}
        {tab === "lists"     && <ListsTab />}
        {tab === "sync"      && <SyncTab />}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CONTACTS TAB
// ═════════════════════════════════════════════════════════════════════════════

function ContactsTab() {
  const [contacts, setContacts] = useState<HSContact[]>([]);
  const [loading, setLoading]   = useState(true);
  const [query, setQuery]       = useState("");
  const [selected, setSelected] = useState<HSContact | null>(null);
  const [after, setAfter]       = useState<string | undefined>();
  const [hasMore, setHasMore]   = useState(false);
  const [syncing, setSyncing]   = useState<string | null>(null);
  const LIMIT = 25;

  const load = useCallback(async (q: string, cursor?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT) });
      if (q) params.set("q", q);
      if (cursor) params.set("after", cursor);
      const d = await apiFetch<{ total: number; results: HSContact[]; paging?: { next?: { after: string } } }>(
        `/crm-hs/contacts?${params}`
      );
      if (!cursor) setContacts(d.results ?? []);
      else setContacts(prev => [...prev, ...(d.results ?? [])]);
      const nextCursor = d.paging?.next?.after;
      setHasMore(!!nextCursor);
      setAfter(nextCursor);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { setAfter(undefined); load(query); }, [query]);

  async function syncLead(contactId: string) {
    setSyncing(contactId);
    try { await apiFetch(`/crm-hs/sync/lead/${contactId}`, { method: "POST" }); }
    catch { /* silent */ } finally { setSyncing(null); }
  }

  return (
    <div className="flex gap-5">
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search by name or email…" className={`${inputCls} pl-9`} />
          </div>
          <button onClick={() => load(query)}
            className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 shadow-sm transition-colors">
            <RefreshCw className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className={theadCls}>
                <th className={thCls}>Name</th>
                <th className={thCls}>Email</th>
                <th className={thCls}>Job Title</th>
                <th className={thCls}>Company</th>
              </tr>
            </thead>
            <tbody className={divider}>
              {loading && contacts.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-300" />
                </td></tr>
              ) : contacts.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-12 text-gray-400 text-sm">
                  No synced contacts yet — use the Sync tab to push leads to HubSpot.
                </td></tr>
              ) : contacts.map(c => {
                const name = fullName(c);
                return (
                  <tr key={c.id} onClick={() => setSelected(c)} className={`${rowHover} cursor-pointer`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${avatarColor(name)}`}>
                          {initials(name)}
                        </div>
                        <span className="font-medium text-gray-800 truncate">{name}</span>
                      </div>
                    </td>
                    <td className={tdMuted}>{c.properties.email || "—"}</td>
                    <td className={tdMuted}>{c.properties.jobtitle || "—"}</td>
                    <td className={tdMuted}>{c.properties.company || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hasMore && (
            <div className="flex justify-center p-3 border-t border-gray-100">
              <button onClick={() => load(query, after)} disabled={loading}
                className="text-sm font-medium hover:underline disabled:opacity-50" style={{ color: PRIMARY }}>
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <ContactDetail contact={selected} onClose={() => setSelected(null)}
          onSync={syncLead} syncing={syncing} />
      )}
    </div>
  );
}

function ContactDetail({ contact, onClose, onSync, syncing }: {
  contact: HSContact; onClose: () => void;
  onSync: (id: string) => void; syncing: string | null;
}) {
  const name = fullName(contact);
  const [notes, setNotes]               = useState<HSNote[]>([]);
  const [tasks, setTasks]               = useState<HSTask[]>([]);
  const [noteText, setNoteText]         = useState("");
  const [taskSubject, setTaskSubject]   = useState("");
  const [taskDeadline, setTaskDeadline] = useState("");
  const [savingNote, setSavingNote]     = useState(false);
  const [savingTask, setSavingTask]     = useState(false);
  const [panel, setPanel]               = useState<"notes" | "tasks">("notes");

  useEffect(() => {
    apiFetch<{ notes: HSNote[] }>(`/crm-hs/notes?parent_object=contacts&parent_record_id=${contact.id}`)
      .then(d => setNotes(d.notes ?? [])).catch(() => {});
    apiFetch<{ tasks: HSTask[] }>(`/crm-hs/tasks?linked_record_id=${contact.id}&linked_record_object=contacts`)
      .then(d => setTasks(d.tasks ?? [])).catch(() => {});
  }, [contact.id]);

  async function addNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      const note = await apiFetch<HSNote>("/crm-hs/notes", {
        method: "POST",
        body: JSON.stringify({ parent_object: "contacts", parent_record_id: contact.id, content: noteText.trim() }),
      });
      setNotes(prev => [note, ...prev]);
      setNoteText("");
    } finally { setSavingNote(false); }
  }

  async function addTask() {
    if (!taskSubject.trim()) return;
    setSavingTask(true);
    try {
      const task = await apiFetch<HSTask>("/crm-hs/tasks", {
        method: "POST",
        body: JSON.stringify({
          subject: taskSubject.trim(), content: taskSubject.trim(),
          deadline_at: taskDeadline || null,
          linked_record_object: "contacts", linked_record_id: contact.id,
        }),
      });
      setTasks(prev => [task, ...prev]);
      setTaskSubject(""); setTaskDeadline("");
    } finally { setSavingTask(false); }
  }

  async function completeTask(taskId: string) {
    await apiFetch(`/crm-hs/tasks/${taskId}/complete`, { method: "PATCH" });
    setTasks(prev => prev.map(t => t.id === taskId
      ? { ...t, properties: { ...t.properties, hs_task_status: "COMPLETED" } } : t));
  }

  async function deleteNote(noteId: string) {
    await apiFetch(`/crm-hs/notes/${noteId}`, { method: "DELETE" });
    setNotes(prev => prev.filter(n => n.id !== noteId));
  }

  const panelInput = `w-full px-3 py-2 text-xs text-gray-800 bg-gray-50 border border-gray-200 rounded-xl
    placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400`;
  const isSyncing = syncing === contact.id;

  return (
    <div className="w-80 shrink-0 bg-white border border-gray-100 rounded-2xl flex flex-col overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${avatarColor(name)}`}>
            {initials(name)}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm leading-tight">{name}</p>
            <p className="text-xs text-gray-500">{contact.properties.jobtitle || contact.properties.company || "—"}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Info */}
      <div className="p-4 border-b border-gray-100 space-y-1.5">
        {contact.properties.email && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Mail className="w-3.5 h-3.5 text-gray-400" />{contact.properties.email}
          </div>
        )}
        {contact.properties.phone && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Phone className="w-3.5 h-3.5 text-gray-400" />{contact.properties.phone}
          </div>
        )}
        {contact.properties.hubcredo_linkedin_url && (
          <div className="flex items-center gap-2 text-xs">
            <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
            <a href={contact.properties.hubcredo_linkedin_url} target="_blank" rel="noopener noreferrer"
              className="hover:underline truncate" style={{ color: PRIMARY }}>LinkedIn</a>
          </div>
        )}
        <button onClick={() => onSync(contact.id)} disabled={isSyncing}
          className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-60"
          style={btnPrimary}>
          {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {isSyncing ? "Syncing…" : "Re-sync to HubSpot"}
        </button>
        <a href={`https://app.hubspot.com/contacts/${contact.id}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
          <ExternalLink className="w-3 h-3" /> View in HubSpot
        </a>
      </div>

      {/* Tab toggle */}
      <div className="flex border-b border-gray-100">
        {(["notes", "tasks"] as const).map(p => (
          <button key={p} onClick={() => setPanel(p)}
            className={`flex-1 py-2 text-xs font-semibold capitalize transition-colors
              ${panel === p ? "border-b-2 border-indigo-500 text-indigo-600 bg-indigo-50/40" : "text-gray-400 hover:text-gray-700"}`}>
            {p} {p === "notes" ? `(${notes.length})` : `(${tasks.filter(t => t.properties.hs_task_status !== "COMPLETED").length})`}
          </button>
        ))}
      </div>

      {/* Notes */}
      {panel === "notes" && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {notes.length === 0 && <p className="text-xs text-gray-400 text-center pt-4">No notes yet</p>}
            {notes.map(n => (
              <div key={n.id} className="group bg-gray-50 rounded-xl p-3 border border-gray-100">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-gray-700 leading-relaxed flex-1">{n.properties.hs_note_body || "—"}</p>
                  <button onClick={() => deleteNote(n.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-50">
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                </div>
                {n.properties.hs_timestamp && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    {new Date(n.properties.hs_timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-gray-100">
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
              placeholder="Add a note…" rows={2} className={`${panelInput} resize-none`} />
            <button onClick={addNote} disabled={savingNote || !noteText.trim()}
              className="mt-1.5 w-full py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 transition-opacity"
              style={btnPrimary}>
              {savingNote ? "Saving…" : "Add Note"}
            </button>
          </div>
        </div>
      )}

      {/* Tasks */}
      {panel === "tasks" && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {tasks.length === 0 && <p className="text-xs text-gray-400 text-center pt-4">No tasks yet</p>}
            {tasks.map(t => {
              const done = t.properties.hs_task_status === "COMPLETED";
              return (
                <div key={t.id}
                  className={`flex items-start gap-2 p-2.5 rounded-xl border ${done ? "opacity-40 bg-gray-50 border-gray-100" : "bg-white border-gray-200 shadow-sm"}`}>
                  <button onClick={() => !done && completeTask(t.id)}>
                    {done
                      ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: PRIMARY }} />
                      : <Circle className="w-4 h-4 text-gray-300 shrink-0 hover:text-indigo-500 transition-colors" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs leading-relaxed ${done ? "line-through text-gray-400" : "text-gray-800"}`}>
                      {t.properties.hs_task_subject || t.properties.hs_task_body || "—"}
                    </p>
                    {t.properties.hs_timestamp && (
                      <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        {new Date(t.properties.hs_timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="p-3 border-t border-gray-100 space-y-1.5">
            <input value={taskSubject} onChange={e => setTaskSubject(e.target.value)}
              placeholder="Task subject…" className={panelInput} />
            <input type="date" value={taskDeadline} onChange={e => setTaskDeadline(e.target.value)}
              className={panelInput} />
            <button onClick={addTask} disabled={savingTask || !taskSubject.trim()}
              className="w-full py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 transition-opacity"
              style={btnPrimary}>
              {savingTask ? "Saving…" : "Add Task"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPANIES TAB
// ═════════════════════════════════════════════════════════════════════════════

function CompaniesTab() {
  const [companies, setCompanies] = useState<HSCompany[]>([]);
  const [loading, setLoading]     = useState(true);
  const [after, setAfter]         = useState<string | undefined>();
  const [hasMore, setHasMore]     = useState(false);

  async function load(cursor?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "25" });
      if (cursor) params.set("after", cursor);
      const d = await apiFetch<{ results: HSCompany[]; paging?: { next?: { after: string } } }>(
        `/crm-hs/companies?${params}`
      );
      if (!cursor) setCompanies(d.results ?? []);
      else setCompanies(prev => [...prev, ...(d.results ?? [])]);
      const next = d.paging?.next?.after;
      setHasMore(!!next); setAfter(next);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button onClick={() => { setAfter(undefined); load(); }}
          className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 shadow-sm transition-colors">
          <RefreshCw className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className={theadCls}>
              <th className={thCls}>Company</th>
              <th className={thCls}>Domain</th>
              <th className={thCls}>Location</th>
              <th className={thCls}>Employees</th>
            </tr>
          </thead>
          <tbody className={divider}>
            {loading && companies.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-12">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-300" />
              </td></tr>
            ) : companies.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-12 text-gray-400 text-sm">No companies found</td></tr>
            ) : companies.map(c => {
              const name = c.properties.name || c.id;
              const loc  = [c.properties.city, c.properties.state].filter(Boolean).join(", ");
              return (
                <tr key={c.id} className={rowHover}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${avatarColor(name)}`}>
                        {initials(name)}
                      </div>
                      <span className="font-medium text-gray-800">{name}</span>
                    </div>
                  </td>
                  <td className={tdMuted}>
                    {c.properties.domain ? (
                      <a href={`https://${c.properties.domain}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:underline" style={{ color: PRIMARY }}>
                        {c.properties.domain}<ExternalLink className="w-3 h-3" />
                      </a>
                    ) : "—"}
                  </td>
                  <td className={tdMuted}>{loc || "—"}</td>
                  <td className={tdMuted}>{c.properties.numberofemployees || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {hasMore && (
          <div className="flex justify-center p-3 border-t border-gray-100">
            <button onClick={() => load(after)} disabled={loading}
              className="text-sm font-medium hover:underline disabled:opacity-50" style={{ color: PRIMARY }}>
              {loading ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DEALS TAB
// ═════════════════════════════════════════════════════════════════════════════

function DealsTab() {
  const [deals, setDeals]         = useState<HSDeal[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [dealName, setDealName]   = useState("");
  const [dealStage, setDealStage] = useState("appointmentscheduled");
  const [amount, setAmount]       = useState("");
  const [creating, setCreating]   = useState(false);
  const [deleting, setDeleting]   = useState<string | null>(null);

  async function loadDeals() {
    setLoading(true);
    try {
      const d = await apiFetch<{ results: HSDeal[] }>("/crm-hs/deals?limit=50");
      setDeals(d.results ?? []);
    } finally { setLoading(false); }
  }
  useEffect(() => { loadDeals(); }, []);

  async function createDeal() {
    if (!dealName.trim()) return;
    setCreating(true);
    try {
      const deal = await apiFetch<HSDeal>("/crm-hs/deals", {
        method: "POST",
        body: JSON.stringify({ dealname: dealName.trim(), dealstage: dealStage, amount: amount || undefined }),
      });
      setDeals(prev => [deal, ...prev]);
      setDealName(""); setAmount(""); setShowForm(false);
    } finally { setCreating(false); }
  }

  async function deleteDeal(id: string) {
    setDeleting(id);
    try { await apiFetch(`/crm-hs/deals/${id}`, { method: "DELETE" }); setDeals(prev => prev.filter(d => d.id !== id)); }
    finally { setDeleting(null); }
  }

  const stages = [
    { value: "appointmentscheduled",  label: "Appointment Scheduled" },
    { value: "qualifiedtobuy",        label: "Qualified to Buy" },
    { value: "presentationscheduled", label: "Presentation Scheduled" },
    { value: "decisionmakerboughtin", label: "Decision Maker Bought-In" },
    { value: "contractsent",          label: "Contract Sent" },
    { value: "closedwon",             label: "Closed Won" },
    { value: "closedlost",            label: "Closed Lost" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{deals.length} deals</p>
        <div className="flex gap-2">
          <button onClick={loadDeals} className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 shadow-sm transition-colors">
            <RefreshCw className="w-4 h-4 text-gray-400" />
          </button>
          <button onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm transition-opacity"
            style={btnPrimary}>
            <Plus className="w-4 h-4" /> New Deal
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">Create Deal</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 font-medium mb-1 block">Deal Name *</label>
              <input value={dealName} onChange={e => setDealName(e.target.value)}
                placeholder="e.g. Acme Corp — Enterprise Plan" className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium mb-1 block">Stage</label>
              <select value={dealStage} onChange={e => setDealStage(e.target.value)} className={inputCls}>
                {stages.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium mb-1 block">Amount ($)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0" className={inputCls} />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={createDeal} disabled={creating || !dealName.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
              style={btnPrimary}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {creating ? "Creating…" : "Create Deal"}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className={theadCls}>
              <th className={thCls}>Deal Name</th>
              <th className={thCls}>Stage</th>
              <th className={thCls}>Amount</th>
              <th className={thCls}>Close Date</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody className={divider}>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-300" />
              </td></tr>
            ) : deals.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-400 text-sm">No deals yet — create your first one above.</td></tr>
            ) : deals.map(d => (
              <tr key={d.id} className={`${rowHover} group`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-gray-300 shrink-0" />
                    <span className="font-medium text-gray-800">{d.properties.dealname || "—"}</span>
                  </div>
                </td>
                <td className="px-4 py-3">{stageBadge(d.properties.dealstage)}</td>
                <td className={tdMuted}>{d.properties.amount ? `$${Number(d.properties.amount).toLocaleString()}` : "—"}</td>
                <td className={tdMuted}>
                  {d.properties.closedate
                    ? new Date(d.properties.closedate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => deleteDeal(d.id)} disabled={deleting === d.id}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-red-50">
                    {deleting === d.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-300" />
                      : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LISTS TAB
// ═════════════════════════════════════════════════════════════════════════════

function ListsTab() {
  const [lists, setLists]                   = useState<HSList[]>([]);
  const [activeList, setActiveList]         = useState<HSList | null>(null);
  const [members, setMembers]               = useState<string[]>([]);
  const [loading, setLoading]               = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [newName, setNewName]               = useState("");
  const [creating, setCreating]             = useState(false);

  useEffect(() => {
    apiFetch<{ lists: HSList[] }>("/crm-hs/lists")
      .then(d => { const ls = d.lists ?? []; setLists(ls); if (ls.length > 0) setActiveList(ls[0]); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activeList) return;
    setLoadingMembers(true);
    apiFetch<{ results?: string[]; memberships?: Array<{ recordId: string }> }>(
      `/crm-hs/lists/${activeList.listId}/members?limit=50`
    )
      .then(d => { const ids = d.results ?? (d.memberships ?? []).map(m => m.recordId); setMembers(ids); })
      .catch(() => setMembers([]))
      .finally(() => setLoadingMembers(false));
  }, [activeList]);

  async function createList() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const list = await apiFetch<HSList>("/crm-hs/lists", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), object_type_id: "0-1" }),
      });
      setLists(prev => [...prev, list]);
      setActiveList(list);
      setNewName("");
    } finally { setCreating(false); }
  }

  if (loading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        {lists.map(l => (
          <button key={l.listId} onClick={() => setActiveList(l)}
            className={`px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all
              ${activeList?.listId === l.listId
                ? "text-white shadow-sm"
                : "bg-white border border-gray-200 text-gray-600 hover:text-indigo-500 hover:border-indigo-300"}`}
            style={activeList?.listId === l.listId ? btnPrimary : {}}>
            {l.name}
          </button>
        ))}
        <div className="flex items-center gap-2 ml-1">
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && createList()}
            placeholder="New list…"
            className="px-3 py-1.5 text-sm text-gray-800 bg-white border border-gray-200 rounded-xl
              placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 w-36" />
          <button onClick={createList} disabled={creating || !newName.trim()}
            className="p-1.5 rounded-xl text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            style={btnPrimary}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {activeList && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">{activeList.name}</h3>
              <p className="text-xs text-gray-400 mt-0.5">List ID: {activeList.listId}</p>
            </div>
            <span className="text-xs text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-lg">
              {members.length} member{members.length !== 1 ? "s" : ""}
            </span>
          </div>
          {loadingMembers ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              <List className="w-8 h-8 mx-auto mb-2 text-gray-200" />
              No members in this list yet
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className={theadCls}><th className={thCls}>Contact ID</th><th className={thCls}>HubSpot Link</th></tr></thead>
              <tbody className={divider}>
                {members.map((id, i) => (
                  <tr key={`${id}-${i}`} className={rowHover}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{id}</td>
                    <td className="px-4 py-3">
                      <a href={`https://app.hubspot.com/contacts/${id}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs hover:underline" style={{ color: PRIMARY }}>
                        View in HubSpot <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {lists.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          <List className="w-10 h-10 mx-auto mb-3 text-gray-200" />
          No lists yet — create your first one above.
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SYNC TAB
// ═════════════════════════════════════════════════════════════════════════════

function SyncTab() {
  const FIELDS = [
    { key: "first_name",   label: "First Name" },
    { key: "last_name",    label: "Last Name" },
    { key: "email",        label: "Email" },
    { key: "job_title",    label: "Job Title" },
    { key: "company_name", label: "Company Name" },
    { key: "linkedin_url", label: "LinkedIn URL" },
  ];

  const [fieldMapping, setFieldMapping] = useState<Record<string, boolean>>({
    first_name: true, last_name: true, email: true,
    job_title: true, company_name: true, linkedin_url: true,
  });
  const [hubspotListId, setHubspotListId] = useState("");
  const [lists, setLists]               = useState<HSList[]>([]);
  const [savingPrefs, setSavingPrefs]   = useState(false);
  const [prefsSaved, setPrefsSaved]     = useState(false);
  const [bulkResult, setBulkResult]     = useState<{ total: number; succeeded: number; failed: number } | null>(null);
  const [bulkLoading, setBulkLoading]   = useState(false);
  const [loadingPrefs, setLoadingPrefs] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<{ field_mapping: Record<string, boolean>; hubspot_list_id: string | null }>("/crm-hs/preferences"),
      apiFetch<{ lists: HSList[] }>("/crm-hs/lists").catch(() => ({ lists: [] })),
    ]).then(([prefs, listsData]) => {
      setFieldMapping(prefs.field_mapping ?? fieldMapping);
      setHubspotListId(prefs.hubspot_list_id ?? "");
      setLists(listsData.lists ?? []);
    }).finally(() => setLoadingPrefs(false));
  }, []);

  async function savePrefs() {
    setSavingPrefs(true);
    try {
      await apiFetch("/crm-hs/preferences", {
        method: "PUT",
        body: JSON.stringify({ field_mapping: fieldMapping, hubspot_list_id: hubspotListId || null }),
      });
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 2500);
    } finally { setSavingPrefs(false); }
  }

  async function syncBulk() {
    setBulkLoading(true); setBulkResult(null);
    try {
      const r = await apiFetch<{ total: number; succeeded: number; failed: number }>("/crm-hs/sync/bulk", { method: "POST" });
      setBulkResult(r);
    } catch { setBulkResult({ total: 0, succeeded: 0, failed: 0 }); }
    finally { setBulkLoading(false); }
  }

  if (loadingPrefs) return <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>;

  return (
    <div className="flex flex-col gap-5 max-w-2xl">

      {/* Bulk sync */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" style={{ color: PRIMARY }} />
              Bulk Sync
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Push all <span className="font-medium text-gray-700">approved leads</span> that haven't been synced yet to HubSpot.
            </p>
          </div>
          <button onClick={syncBulk} disabled={bulkLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shrink-0 disabled:opacity-60 transition-opacity"
            style={btnPrimary}>
            {bulkLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Syncing…</>
              : <><Upload className="w-4 h-4" /> Sync Now</>}
          </button>
        </div>

        {bulkResult && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              { label: "Total",     value: bulkResult.total,     color: "text-gray-800" },
              { label: "Succeeded", value: bulkResult.succeeded, color: "text-green-600" },
              { label: "Failed",    value: bulkResult.failed,    color: bulkResult.failed > 0 ? "text-red-500" : "text-gray-400" },
            ].map(s => (
              <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Field mapping */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Settings2 className="w-4 h-4" style={{ color: PRIMARY }} />
          Field Mapping
        </h3>
        <p className="text-sm text-gray-500 mb-4">Choose which lead fields get synced to HubSpot contacts.</p>
        <div className="grid grid-cols-2 gap-2.5">
          {FIELDS.map(f => (
            <label key={f.key}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all select-none
                ${fieldMapping[f.key]
                  ? "border-indigo-200 bg-indigo-50/50"
                  : "border-gray-200 bg-white hover:border-gray-300"}`}
              onClick={() => setFieldMapping(prev => ({ ...prev, [f.key]: !prev[f.key] }))}>
              <div
                className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors
                  ${fieldMapping[f.key] ? "border-indigo-500" : "border-gray-300"}`}
                style={fieldMapping[f.key] ? { background: PRIMARY } : {}}>
                {fieldMapping[f.key] && <CheckSquare className="w-3 h-3 text-white" />}
              </div>
              <span className="text-sm text-gray-700">{f.label}</span>
            </label>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <label className="text-sm font-medium text-gray-700 block mb-2">Add synced contacts to list (optional)</label>
          <select value={hubspotListId} onChange={e => setHubspotListId(e.target.value)} className={inputCls}>
            <option value="">— None —</option>
            {lists.map(l => <option key={l.listId} value={l.listId}>{l.name}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1.5">Every contact synced from HubCredo will be added to this list automatically.</p>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button onClick={savePrefs} disabled={savingPrefs}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
            style={btnPrimary}>
            {savingPrefs ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {savingPrefs ? "Saving…" : "Save Preferences"}
          </button>
          {prefsSaved && (
            <div className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 className="w-4 h-4" /> Saved!
            </div>
          )}
        </div>
      </div>

      {/* Info card */}
      <div className="rounded-2xl p-4 border text-sm" style={{ background: PRIMARY_LIGHT, borderColor: PRIMARY_RING }}>
        <p className="font-semibold mb-1" style={{ color: PRIMARY }}>How sync works</p>
        <ul className="space-y-1 text-gray-600 text-xs">
          <li className="flex items-start gap-1.5"><ArrowRight className="w-3 h-3 shrink-0 mt-0.5" style={{ color: PRIMARY }} /> Each lead is matched by email — existing contacts are updated, new ones are created.</li>
          <li className="flex items-start gap-1.5"><ArrowRight className="w-3 h-3 shrink-0 mt-0.5" style={{ color: PRIMARY }} /> Company records are created or matched by domain, then associated to the contact.</li>
          <li className="flex items-start gap-1.5"><ArrowRight className="w-3 h-3 shrink-0 mt-0.5" style={{ color: PRIMARY }} /> Only <strong>approved</strong> leads are eligible for bulk sync.</li>
          <li className="flex items-start gap-1.5"><ArrowRight className="w-3 h-3 shrink-0 mt-0.5" style={{ color: PRIMARY }} /> You can also sync individual leads from the Leads page.</li>
        </ul>
      </div>
    </div>
  );
}