// src/pages/dashboard/CRM.tsx
// ─────────────────────────────────────────────────────────────────────────────
// HubCredo CRM — powered by Attio API
// Tabs: Contacts · Companies · Deals · Notes · Tasks
// Attribution: "Powered by Attio" shown per ToS requirement
//
// FIX: ContactDetail was calling /crm/tasks?linked_record_id=xxx without
// linked_record_object. Attio requires BOTH params together — sending only
// linked_record_id causes 400 "Either both linked_object and linked_record_id
// must be provided together, or neither parameter should be provided."

import { useState, useEffect, useCallback, type ReactNode } from "react";
import {
  Users, Building2, Kanban, FileText, CheckSquare,
  Search, Plus, RefreshCw, Loader2, X,
  CheckCircle2, Circle, Trash2, ExternalLink, AlertCircle,
  Mail, Calendar,
} from "lucide-react";

// ─── API helper ───────────────────────────────────────────────────────────────

const API = "/api";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token");

  console.log("JWT TOKEN:", token);

  const res = await fetch(`${API}${path}`, {
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

  if (!res.ok) {
    console.error("CRM API ERROR:", body);
    throw new Error(body?.error || `HTTP ${res.status}`);
  }

  return body;
}

// ─── Attio value extractor ────────────────────────────────────────────────────

function av(values: any[], i = 0): string {
  const v = values?.[i];
  if (!v) return "—";
  if (v.email_address) return v.email_address;
  if (v.domain) return v.domain;
  if (v.original_url) return v.original_url;
  if (v.full_name) return v.full_name;
  if (v.option?.title) return v.option.title;
  return v.value != null ? String(v.value) : "—";
}

function initials(name: string): string {
  return name.split(" ").filter(Boolean).map(p => p[0]).slice(0, 2).join("").toUpperCase() || "?";
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "contacts" | "companies" | "deals" | "notes" | "tasks";

interface Person { id: { record_id: string }; values: Record<string, any[]> }
interface Company { id: { record_id: string }; values: Record<string, any[]> }
interface AttioList { id: { list_id: string }; name: string; api_slug: string }
interface ListEntry { id: { entry_id: string; list_id: string }; attribute_values: Record<string, any[]> }
interface Note { id: { note_id: string }; title: string; content_plaintext: string; created_at: string; parent_record_id: string }
interface Task {
  id: { task_id: string }; content: string; deadline_at: string | null;
  is_completed: boolean; created_at: string;
  linked_records: Array<{ target_record_id: string }>
}
interface Member { id: { workspace_member_id: string }; first_name: string; last_name: string; email_address: string }

// ─── Colour helpers ───────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700", "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700", "bg-cyan-100 text-cyan-700",
];
function avatarColor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export default function CRM() {
  const [tab, setTab] = useState<Tab>("contacts");
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    apiFetch("/crm/connection").then(() => setConnected(true)).catch(() => setConnected(false));
  }, []);

  if (connected === null) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-[#2563EB]" />
    </div>
  );

  if (!connected) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <AlertCircle className="w-10 h-10 text-[#94A3B8]" />
      <p className="font-semibold text-[#0A0A0A]">Attio not connected</p>
      <p className="text-sm text-[#64748B]">Go to Settings → CRM to connect your Attio workspace.</p>
    </div>
  );

  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: "contacts",  label: "Contacts",  icon: <Users className="w-4 h-4" /> },
    { id: "companies", label: "Companies", icon: <Building2 className="w-4 h-4" /> },
    { id: "deals",     label: "Deals",     icon: <Kanban className="w-4 h-4" /> },
    { id: "notes",     label: "Notes",     icon: <FileText className="w-4 h-4" /> },
    { id: "tasks",     label: "Tasks",     icon: <CheckSquare className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#F8FAFC]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-0 bg-white border-b border-[#E2E8F0]">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-[#0A0A0A] tracking-tight">CRM</h1>
          <span className="text-[11px] text-[#94A3B8] border border-[#E2E8F0] rounded px-1.5 py-0.5">
            Powered by Attio
          </span>
        </div>
        <div className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-all -mb-px
                ${tab === t.id
                  ? "border-[#2563EB] text-[#2563EB] bg-[#EFF6FF]"
                  : "border-transparent text-[#64748B] hover:text-[#0A0A0A] hover:bg-[#F1F5F9]"}`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-auto p-6">
        {tab === "contacts"  && <ContactsTab />}
        {tab === "companies" && <CompaniesTab />}
        {tab === "deals"     && <DealsTab />}
        {tab === "notes"     && <NotesTab />}
        {tab === "tasks"     && <TasksTab />}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CONTACTS TAB
// ═════════════════════════════════════════════════════════════════════════════

function ContactsTab() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Person | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const LIMIT = 25;

  const load = useCallback(async (q: string, off: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
      if (q) params.set("q", q);
      const d = await apiFetch<{ data: Person[] }>(`/crm/people?${params}`);
      if (off === 0) setPeople(d.data);
      else setPeople(prev => [...prev, ...d.data]);
      setHasMore(d.data.length === LIMIT);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { setOffset(0); load(query, 0); }, [query]);

  return (
    <div className="flex gap-5 h-full">
      {/* List */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Search bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-[#E2E8F0] rounded-xl
                focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
            />
          </div>
          <button onClick={() => load(query, 0)}
            className="p-2.5 rounded-xl border border-[#E2E8F0] bg-white hover:bg-[#F1F5F9] transition-colors">
            <RefreshCw className="w-4 h-4 text-[#64748B]" />
          </button>
        </div>

        {/* Table */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide">Job Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide">Company</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F8FAFC]">
              {loading && people.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-12 text-[#94A3B8]">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                </td></tr>
              ) : people.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-12 text-[#94A3B8] text-sm">No contacts found</td></tr>
              ) : people.map(p => {
                const name    = av(p.values.name ?? []);
                const email   = av(p.values.email_addresses ?? []);
                const title   = av(p.values.job_title ?? []);
                const company = av(p.values.company ?? []);
                return (
                  <tr key={p.id.record_id}
                    onClick={() => setSelected(p)}
                    className="hover:bg-[#F8FAFC] cursor-pointer transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${avatarColor(name)}`}>
                          {initials(name)}
                        </div>
                        <span className="font-medium text-[#0A0A0A] truncate">{name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#475569] truncate max-w-[180px]">{email}</td>
                    <td className="px-4 py-3 text-[#475569]">{title}</td>
                    <td className="px-4 py-3 text-[#475569]">{company}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {hasMore && (
            <div className="flex justify-center p-3 border-t border-[#F1F5F9]">
              <button onClick={() => { const next = offset + LIMIT; setOffset(next); load(query, next); }}
                disabled={loading}
                className="text-sm text-[#2563EB] font-medium hover:underline disabled:opacity-50">
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && <ContactDetail person={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ─── Contact detail side panel ────────────────────────────────────────────────

function ContactDetail({ person, onClose }: { person: Person; onClose: () => void }) {
  const recordId = person.id.record_id;
  const name     = av(person.values.name ?? []);
  const email    = av(person.values.email_addresses ?? []);
  const title    = av(person.values.job_title ?? []);
  const linkedin = av(person.values.linkedin ?? []);

  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [noteText, setNoteText] = useState("");
  const [taskText, setTaskText] = useState("");
  const [taskDeadline, setTaskDeadline] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [activePanel, setActivePanel] = useState<"notes" | "tasks">("notes");

  useEffect(() => {
    apiFetch<{ notes: Note[] }>(`/crm/notes?parent_object=people&parent_record_id=${recordId}`)
      .then(d => setNotes(d.notes))
      .catch(() => {});

    // ✅ FIX: Always send linked_record_object=people alongside linked_record_id.
    // Attio API requires BOTH params together — omitting linked_record_object causes
    // 400 "Either both linked_object and linked_record_id must be provided together,
    // or neither parameter should be provided."
    apiFetch<{ tasks: Task[] }>(`/crm/tasks?linked_record_id=${recordId}&linked_record_object=people`)
      .then(d => setTasks(d.tasks))
      .catch(() => {});
  }, [recordId]);

  async function addNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      const note = await apiFetch<Note>("/crm/notes", {
        method: "POST",
        body: JSON.stringify({
          parent_object: "people", parent_record_id: recordId,
          title: "HubCredo note", content: noteText.trim(),
        }),
      });
      setNotes(prev => [note, ...prev]);
      setNoteText("");
    } finally { setSavingNote(false); }
  }

  async function addTask() {
    if (!taskText.trim()) return;
    setSavingTask(true);
    try {
      const task = await apiFetch<Task>("/crm/tasks", {
        method: "POST",
        body: JSON.stringify({
          content: taskText.trim(),
          deadline_at: taskDeadline || null,
          linked_record_object: "people",
          linked_record_id: recordId,
        }),
      });
      setTasks(prev => [task, ...prev]);
      setTaskText("");
      setTaskDeadline("");
    } finally { setSavingTask(false); }
  }

  async function completeTask(taskId: string) {
    await apiFetch(`/crm/tasks/${taskId}/complete`, { method: "PATCH" });
    setTasks(prev => prev.map(t => t.id.task_id === taskId ? { ...t, is_completed: true } : t));
  }

  async function deleteNote(noteId: string) {
    await apiFetch(`/crm/notes/${noteId}`, { method: "DELETE" });
    setNotes(prev => prev.filter(n => n.id.note_id !== noteId));
  }

  return (
    <div className="w-80 shrink-0 bg-white border border-[#E2E8F0] rounded-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-[#F1F5F9]">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${avatarColor(name)}`}>
            {initials(name)}
          </div>
          <div>
            <p className="font-semibold text-[#0A0A0A] text-sm leading-tight">{name}</p>
            <p className="text-xs text-[#64748B]">{title !== "—" ? title : email}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#F1F5F9] transition-colors">
          <X className="w-4 h-4 text-[#64748B]" />
        </button>
      </div>

      {/* Quick info */}
      <div className="p-4 border-b border-[#F1F5F9] space-y-1.5">
        {email !== "—" && (
          <div className="flex items-center gap-2 text-xs text-[#475569]">
            <Mail className="w-3.5 h-3.5 text-[#94A3B8]" />{email}
          </div>
        )}
        {linkedin !== "—" && (
          <div className="flex items-center gap-2 text-xs text-[#475569]">
            <ExternalLink className="w-3.5 h-3.5 text-[#94A3B8]" />
            <a href={linkedin} target="_blank" rel="noopener noreferrer"
              className="text-[#2563EB] hover:underline truncate">LinkedIn</a>
          </div>
        )}
      </div>

      {/* Panel toggle */}
      <div className="flex border-b border-[#F1F5F9]">
        {(["notes", "tasks"] as const).map(p => (
          <button key={p} onClick={() => setActivePanel(p)}
            className={`flex-1 py-2 text-xs font-semibold capitalize transition-colors
              ${activePanel === p ? "text-[#2563EB] border-b-2 border-[#2563EB]" : "text-[#64748B] hover:text-[#0A0A0A]"}`}>
            {p} {p === "notes" ? `(${notes.length})` : `(${tasks.filter(t => !t.is_completed).length})`}
          </button>
        ))}
      </div>

      {/* Notes panel */}
      {activePanel === "notes" && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {notes.length === 0 && <p className="text-xs text-[#94A3B8] text-center pt-4">No notes yet</p>}
            {notes.map(n => (
              <div key={n.id.note_id} className="group bg-[#F8FAFC] rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-[#0A0A0A] leading-relaxed flex-1">{n.content_plaintext}</p>
                  <button onClick={() => deleteNote(n.id.note_id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-50">
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                </div>
                <p className="text-[10px] text-[#94A3B8] mt-1">
                  {new Date(n.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </p>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-[#F1F5F9]">
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Add a note…"
              rows={2}
              className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl
                focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] resize-none"
            />
            <button onClick={addNote} disabled={savingNote || !noteText.trim()}
              className="mt-1.5 w-full py-1.5 rounded-lg text-xs font-semibold bg-[#2563EB] text-white
                hover:bg-[#1D4ED8] disabled:opacity-50 transition-colors">
              {savingNote ? "Saving…" : "Add Note"}
            </button>
          </div>
        </div>
      )}

      {/* Tasks panel */}
      {activePanel === "tasks" && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {tasks.length === 0 && <p className="text-xs text-[#94A3B8] text-center pt-4">No tasks yet</p>}
            {tasks.map(t => (
              <div key={t.id.task_id}
                className={`flex items-start gap-2 p-2.5 rounded-xl border
                  ${t.is_completed ? "opacity-50 bg-[#F8FAFC] border-[#E2E8F0]" : "bg-white border-[#E2E8F0]"}`}>
                <button onClick={() => !t.is_completed && completeTask(t.id.task_id)}>
                  {t.is_completed
                    ? <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                    : <Circle className="w-4 h-4 text-[#94A3B8] shrink-0 hover:text-[#2563EB]" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs leading-relaxed ${t.is_completed ? "line-through text-[#94A3B8]" : "text-[#0A0A0A]"}`}>
                    {t.content}
                  </p>
                  {t.deadline_at && (
                    <p className="text-[10px] text-[#94A3B8] flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3" />
                      {new Date(t.deadline_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-[#F1F5F9] space-y-1.5">
            <input value={taskText} onChange={e => setTaskText(e.target.value)}
              placeholder="Add a task…"
              className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl
                focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]" />
            <input type="date" value={taskDeadline} onChange={e => setTaskDeadline(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl
                focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]" />
            <button onClick={addTask} disabled={savingTask || !taskText.trim()}
              className="w-full py-1.5 rounded-lg text-xs font-semibold bg-[#0A0A0A] text-white
                hover:bg-[#1e1e1e] disabled:opacity-50 transition-colors">
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
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ data: Company[] }>("/crm/companies?limit=50")
      .then(d => setCompanies(d.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC]">
            <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide">Company</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide">Domain</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide">Location</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F8FAFC]">
          {loading ? (
            <tr><td colSpan={3} className="text-center py-12">
              <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#94A3B8]" />
            </td></tr>
          ) : companies.length === 0 ? (
            <tr><td colSpan={3} className="text-center py-12 text-[#94A3B8] text-sm">No companies found</td></tr>
          ) : companies.map(c => {
            const name     = av(c.values.name ?? []);
            const domain   = av(c.values.domains ?? []);
            const location = av(c.values.primary_location ?? []);
            return (
              <tr key={c.id.record_id} className="hover:bg-[#F8FAFC] transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${avatarColor(name)}`}>
                      {initials(name)}
                    </div>
                    <span className="font-medium text-[#0A0A0A]">{name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[#475569]">
                  {domain !== "—" ? (
                    <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer"
                      className="text-[#2563EB] hover:underline flex items-center gap-1">
                      {domain}<ExternalLink className="w-3 h-3" />
                    </a>
                  ) : "—"}
                </td>
                <td className="px-4 py-3 text-[#475569]">{location}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DEALS TAB
// ═════════════════════════════════════════════════════════════════════════════

function DealsTab() {
  const [lists, setLists] = useState<AttioList[]>([]);
  const [activeList, setActiveList] = useState<AttioList | null>(null);
  const [entries, setEntries] = useState<ListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);

  useEffect(() => {
    apiFetch<{ lists: AttioList[] }>("/crm/lists")
      .then(d => { setLists(d.lists); if (d.lists.length > 0) setActiveList(d.lists[0]); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activeList) return;
    setLoadingEntries(true);
    apiFetch<{ data: ListEntry[] }>(`/crm/lists/${activeList.id.list_id}/entries?limit=50`)
      .then(d => setEntries(d.data))
      .finally(() => setLoadingEntries(false));
  }, [activeList]);

  async function createList() {
    if (!newListName.trim()) return;
    setCreatingList(true);
    try {
      const list = await apiFetch<AttioList>("/crm/lists", {
        method: "POST",
        body: JSON.stringify({ name: newListName.trim(), parent_object: "people" }),
      });
      setLists(prev => [...prev, list]);
      setActiveList(list);
      setNewListName("");
    } finally { setCreatingList(false); }
  }

  async function removeEntry(listId: string, entryId: string) {
    await apiFetch(`/crm/lists/${listId}/entries/${entryId}`, { method: "DELETE" });
    setEntries(prev => prev.filter(e => e.id.entry_id !== entryId));
  }

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <Loader2 className="w-5 h-5 animate-spin text-[#94A3B8]" />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        {lists.map(l => (
          <button key={l.id.list_id} onClick={() => setActiveList(l)}
            className={`px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all
              ${activeList?.id.list_id === l.id.list_id
                ? "bg-[#2563EB] text-white shadow-sm"
                : "bg-white border border-[#E2E8F0] text-[#475569] hover:border-[#2563EB] hover:text-[#2563EB]"}`}>
            {l.name}
          </button>
        ))}
        <div className="flex items-center gap-2 ml-2">
          <input value={newListName} onChange={e => setNewListName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && createList()}
            placeholder="New list…"
            className="px-3 py-1.5 text-sm bg-white border border-[#E2E8F0] rounded-xl
              focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] w-32" />
          <button onClick={createList} disabled={creatingList || !newListName.trim()}
            className="p-1.5 rounded-xl bg-[#2563EB] text-white hover:bg-[#1D4ED8] disabled:opacity-50">
            {creatingList ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {activeList && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#F1F5F9]">
            <h3 className="text-sm font-semibold text-[#0A0A0A]">{activeList.name}</h3>
            <span className="text-xs text-[#94A3B8]">{entries.length} entries</span>
          </div>
          {loadingEntries ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-[#94A3B8]" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-center text-sm text-[#94A3B8] py-10">No entries in this list</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[#F8FAFC]">
                {entries.map(e => {
                  const stageVal = e.attribute_values?.stage?.[0];
                  const stage = stageVal?.option?.title ?? stageVal?.value ?? null;
                  const valueVal = e.attribute_values?.value?.[0]?.currency_value;
                  return (
                    <tr key={e.id.entry_id} className="hover:bg-[#F8FAFC] transition-colors group">
                      <td className="px-4 py-3 font-medium text-[#0A0A0A]">{e.id.entry_id.slice(0, 8)}…</td>
                      <td className="px-4 py-3">
                        {stage && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
                            {stage}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#475569]">
                        {valueVal != null ? `$${Number(valueVal).toLocaleString()}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => removeEntry(activeList.id.list_id, e.id.entry_id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-red-50">
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {lists.length === 0 && (
        <div className="text-center py-12 text-[#94A3B8] text-sm">
          No lists yet. Create one above to start tracking deals.
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// NOTES TAB
// ═════════════════════════════════════════════════════════════════════════════

function NotesTab() {
  const [recordId, setRecordId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-4 py-3 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
        <p className="text-xs text-[#92400E]">
          Notes are linked to specific contacts. Open a contact in the <strong>Contacts</strong> tab to view
          and add notes. You can also add a note to any contact by their record ID below.
        </p>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-3">
        <h4 className="text-sm font-semibold text-[#0A0A0A]">Add Note to Contact</h4>
        <input value={recordId} onChange={e => setRecordId(e.target.value)}
          placeholder="Attio Person record_id"
          className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl
            focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]" />
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Note title"
          className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl
            focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]" />
        <textarea value={content} onChange={e => setContent(e.target.value)}
          placeholder="Note content…" rows={4}
          className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl
            focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] resize-none" />
        <button
          disabled={saving || !recordId.trim() || !content.trim()}
          onClick={async () => {
            setSaving(true);
            try {
              await apiFetch("/crm/notes", {
                method: "POST",
                body: JSON.stringify({
                  parent_object: "people", parent_record_id: recordId,
                  title: title || "Note", content,
                }),
              });
              setTitle(""); setContent(""); setRecordId("");
            } finally { setSaving(false); }
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#2563EB] text-white
            hover:bg-[#1D4ED8] disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {saving ? "Saving…" : "Add Note"}
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TASKS TAB
// ═════════════════════════════════════════════════════════════════════════════

function TasksTab() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "done">("open");
  const [content, setContent] = useState("");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [assigneeId, setAssigneeId] = useState("");

  useEffect(() => {
    apiFetch<{ members: Member[] }>("/crm/workspace/members")
      .then(d => setMembers(d.members ?? [])).catch(() => {});
  }, []);

  const loadTasks = useCallback(() => {
    setLoading(true);
    // Global tasks (no linked_record_id) — no linked_record_object needed
    const params = filter === "all" ? "?limit=50" : `?is_completed=${filter === "done"}&limit=50`;
    apiFetch<{ tasks: Task[] }>(`/crm/tasks${params}`)
      .then(d => setTasks(d.tasks))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  async function addTask() {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const task = await apiFetch<Task>("/crm/tasks", {
        method: "POST",
        body: JSON.stringify({
          content: content.trim(),
          deadline_at: deadline || null,
          assignee_id: assigneeId || null,
          // No linked_record — global task
        }),
      });
      setTasks(prev => [task, ...prev]);
      setContent(""); setDeadline(""); setAssigneeId("");
    } finally { setSaving(false); }
  }

  async function completeTask(id: string) {
    await apiFetch(`/crm/tasks/${id}/complete`, { method: "PATCH" });
    setTasks(prev => prev.map(t => t.id.task_id === id ? { ...t, is_completed: true } : t));
  }

  async function deleteTask(id: string) {
    await apiFetch(`/crm/tasks/${id}`, { method: "DELETE" });
    setTasks(prev => prev.filter(t => t.id.task_id !== id));
  }

  return (
    <div className="max-w-2xl space-y-4">
      {/* Create task */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-3">
        <h4 className="text-sm font-semibold text-[#0A0A0A]">New Task</h4>
        <input value={content} onChange={e => setContent(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && addTask()}
          placeholder="Task description…"
          className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl
            focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]" />
        <div className="flex items-center gap-3">
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
            className="flex-1 px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl
              focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]" />
          {members.length > 0 && (
            <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
              className="flex-1 px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl
                focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]">
              <option value="">Unassigned</option>
              {members.map(m => (
                <option key={m.id.workspace_member_id} value={m.id.workspace_member_id}>
                  {m.first_name} {m.last_name}
                </option>
              ))}
            </select>
          )}
          <button onClick={addTask} disabled={saving || !content.trim()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#2563EB] text-white
              hover:bg-[#1D4ED8] disabled:opacity-50 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </div>
      </div>

      {/* Filter + list */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
        <div className="flex items-center gap-1 p-3 border-b border-[#F1F5F9]">
          {(["all", "open", "done"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors
                ${filter === f ? "bg-[#2563EB] text-white" : "text-[#64748B] hover:bg-[#F1F5F9]"}`}>
              {f}
            </button>
          ))}
          <button onClick={loadTasks} className="ml-auto p-1 rounded-lg hover:bg-[#F1F5F9] transition-colors">
            <RefreshCw className="w-3.5 h-3.5 text-[#94A3B8]" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-[#94A3B8]" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-center text-sm text-[#94A3B8] py-10">No tasks</p>
        ) : (
          <div className="divide-y divide-[#F8FAFC]">
            {tasks.map(t => (
              <div key={t.id.task_id}
                className={`flex items-start gap-3 px-4 py-3 group transition-colors hover:bg-[#F8FAFC]
                  ${t.is_completed ? "opacity-50" : ""}`}>
                <button onClick={() => !t.is_completed && completeTask(t.id.task_id)} className="mt-0.5">
                  {t.is_completed
                    ? <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
                    : <Circle className="w-4 h-4 text-[#CBD5E1] hover:text-[#2563EB] transition-colors" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm text-[#0A0A0A] ${t.is_completed ? "line-through" : ""}`}>
                    {t.content}
                  </p>
                  {t.deadline_at && (
                    <p className="text-xs text-[#94A3B8] flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3" />
                      Due {new Date(t.deadline_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  )}
                </div>
                <button onClick={() => deleteTask(t.id.task_id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}