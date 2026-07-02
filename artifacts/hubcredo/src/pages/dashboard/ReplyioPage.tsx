
// ============================================================
// ReplyioPage.tsx  –  Reply.io Outreach Dashboard (self-contained)
// Place at: artifacts/hubcredo/src/pages/dashboard/ReplyioPage.tsx
//
// This file is fully self-contained — no separate hook or component files needed.
// Only external dependency: replyioApi.ts in src/lib/replyioApi.ts
//
// Wire up:
//   1. Router  → add <Route path="/replyio" element={<ReplyioPage />} />
//   2. Sidebar → add { label: "Reply.io Outreach", path: "/replyio" } to nav items
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { replyioApi, ReplySequence, ReplySequenceContact, ReplyStats } from "../../lib/replyioApi";
import { getToken } from "@/lib/auth";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function liApiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

interface LiStats {
  totalPeopleContacted: number;
  connectionsSent: number;
  acceptedAutomatedConnections: number;
  automatedConnectionsConversionRate: number;
  messagesSent: number;
  replies: number;
  repliesConversionRate: number;
}

// ── useReplyio hook (inlined) ─────────────────────────────────

interface UseReplyioReturn {
  isConnected: boolean;
  connectionLoading: boolean;
  connectedUser: { email: string; name: string } | null;
  checkConnection: () => Promise<void>;
  sequences: ReplySequence[];
  sequencesLoading: boolean;
  fetchSequences: () => Promise<void>;
  selectedSequenceId: number | null;
  setSelectedSequenceId: (id: number | null) => void;
  sequenceContacts: ReplySequenceContact[];
  sequenceStats: ReplyStats | null;
  liStats: LiStats | null;
  contactsLoading: boolean;
  fetchSequenceData: (id: number) => Promise<void>;
  enrolling: boolean;
  enrollContact: (payload: {
    email: string;
    firstName?: string;
    lastName?: string;
    title?: string;
    company?: string;
    linkedInProfile?: string;
    phone?: string;
    sequenceId: number;
  }) => Promise<void>;
  pausingContactId: number | null;
  pauseContact: (sequenceId: number, contactId: number) => Promise<void>;
  webhooks: unknown[];
  webhooksLoading: boolean;
  fetchWebhooks: () => Promise<void>;
  registeringWebhook: boolean;
  registerWebhook: (event: string, callbackUrl: string) => Promise<void>;
  error: string | null;
  successMessage: string | null;
  clearMessages: () => void;
}

function useReplyio(): UseReplyioReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [connectedUser, setConnectedUser] = useState<{ email: string; name: string } | null>(null);
  const [sequences, setSequences] = useState<ReplySequence[]>([]);
  const [sequencesLoading, setSequencesLoading] = useState(false);
  const [selectedSequenceId, setSelectedSequenceId] = useState<number | null>(null);
  const [sequenceContacts, setSequenceContacts] = useState<ReplySequenceContact[]>([]);
  const [sequenceStats, setSequenceStats] = useState<ReplyStats | null>(null);
  const [liStats, setLiStats] = useState<LiStats | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [pausingContactId, setPausingContactId] = useState<number | null>(null);
  const [webhooks, setWebhooks] = useState<unknown[]>([]);
  const [webhooksLoading, setWebhooksLoading] = useState(false);
  const [registeringWebhook, setRegisteringWebhook] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const clearMessages = () => { setError(null); setSuccessMessage(null); };

  const toast = (msg: string, type: "success" | "error") => {
    if (type === "success") setSuccessMessage(msg);
    else setError(msg);
    setTimeout(() => { setSuccessMessage(null); setError(null); }, 4000);
  };

  const checkConnection = useCallback(async () => {
    setConnectionLoading(true);
    try {
      const result = await replyioApi.validate();
      setIsConnected(result.valid);
      setConnectedUser(result.user ?? null);
    } catch {
      setIsConnected(false);
      setConnectedUser(null);
    } finally {
      setConnectionLoading(false);
    }
  }, []);

  useEffect(() => { checkConnection(); }, [checkConnection]);

  const fetchSequences = useCallback(async () => {
    setSequencesLoading(true);
    try {
      const { sequences } = await replyioApi.listSequences();
      setSequences(sequences);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to load sequences", "error");
    } finally {
      setSequencesLoading(false);
    }
  }, []);

  useEffect(() => { if (isConnected) fetchSequences(); }, [isConnected, fetchSequences]);

  const fetchSequenceData = useCallback(async (id: number) => {
    setContactsLoading(true);
    try {
      const [{ contacts }, stats, liStatsData] = await Promise.all([
        replyioApi.listContacts(id),
        replyioApi.getStats(id).catch(() => null),
        liApiFetch<LiStats>(`/api/replyio-linkedin/sequences/${id}/li-stats`).catch(() => null),
      ]);
      setSequenceContacts(contacts);
      setSequenceStats(stats);
      setLiStats(liStatsData);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to load sequence data", "error");
    } finally {
      setContactsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSequenceId !== null) fetchSequenceData(selectedSequenceId);
  }, [selectedSequenceId, fetchSequenceData]);

  const enrollContact = useCallback(async (payload: {
    email: string; firstName?: string; lastName?: string; title?: string;
    company?: string; linkedInProfile?: string; phone?: string; sequenceId: number;
  }) => {
    setEnrolling(true);
    try {
      const { sequenceId, ...contact } = payload;
      await replyioApi.enroll({ contact, sequenceId });
      toast(`${payload.email} enrolled successfully`, "success");
      if (selectedSequenceId === payload.sequenceId) await fetchSequenceData(payload.sequenceId);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to enroll contact", "error");
      throw err;
    } finally {
      setEnrolling(false);
    }
  }, [selectedSequenceId, fetchSequenceData]);

  const pauseContact = useCallback(async (sequenceId: number, contactId: number) => {
    setPausingContactId(contactId);
    try {
      await replyioApi.pauseContact(sequenceId, contactId);
      toast("Contact paused", "success");
      await fetchSequenceData(sequenceId);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to pause contact", "error");
    } finally {
      setPausingContactId(null);
    }
  }, [fetchSequenceData]);

  const fetchWebhooks = useCallback(async () => {
    setWebhooksLoading(true);
    try {
      const { webhooks } = await replyioApi.listWebhooks();
      setWebhooks(webhooks);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to load webhooks", "error");
    } finally {
      setWebhooksLoading(false);
    }
  }, []);

  const registerWebhook = useCallback(async (event: string, callbackUrl: string) => {
    setRegisteringWebhook(true);
    try {
      await replyioApi.registerWebhook(event, callbackUrl);
      toast("Webhook registered", "success");
      await fetchWebhooks();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to register webhook", "error");
    } finally {
      setRegisteringWebhook(false);
    }
  }, [fetchWebhooks]);

  return {
    isConnected, connectionLoading, connectedUser, checkConnection,
    sequences, sequencesLoading, fetchSequences,
    selectedSequenceId, setSelectedSequenceId,
    sequenceContacts, sequenceStats, liStats, contactsLoading, fetchSequenceData,
    enrolling, enrollContact,
    pausingContactId, pauseContact,
    webhooks, webhooksLoading, fetchWebhooks, registeringWebhook, registerWebhook,
    error, successMessage, clearMessages,
  };
}

// ── EnrollModal (inlined) ─────────────────────────────────────

interface EnrollModalProps {
  open: boolean;
  onClose: () => void;
  sequences: ReplySequence[];
  enrolling: boolean;
  onEnroll: (payload: {
    email: string; firstName?: string; lastName?: string; title?: string;
    company?: string; linkedInProfile?: string; phone?: string; sequenceId: number;
  }) => Promise<void>;
  prefill?: { email?: string; firstName?: string; lastName?: string; title?: string; company?: string; linkedInProfile?: string; };
}

function EnrollModal({ open, onClose, sequences, enrolling, onEnroll, prefill }: EnrollModalProps) {
  const [form, setForm] = useState({
    email: prefill?.email ?? "", firstName: prefill?.firstName ?? "",
    lastName: prefill?.lastName ?? "", title: prefill?.title ?? "",
    company: prefill?.company ?? "", linkedInProfile: prefill?.linkedInProfile ?? "",
    phone: "", sequenceId: "",
  });
  const [formError, setFormError] = useState<string | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async () => {
    setFormError(null);
    if (!form.email) return setFormError("Email is required");
    if (!form.sequenceId) return setFormError("Please select a sequence");
    try {
      await onEnroll({
        email: form.email,
        firstName: form.firstName || undefined, lastName: form.lastName || undefined,
        title: form.title || undefined, company: form.company || undefined,
        linkedInProfile: form.linkedInProfile || undefined, phone: form.phone || undefined,
        sequenceId: parseInt(form.sequenceId),
      });
      onClose();
    } catch { /* error shown by hook toast, modal stays open */ }
  };

  if (!open) return null;
  const available = sequences.filter((s) => !s.isArchived && s.status === "active");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.07 1.18 2 2 0 012.03 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-gray-900">Enroll in Sequence</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Sequence <span className="text-red-500">*</span>
            </label>
            {available.length === 0 ? (
              <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">No active sequences found in your Reply.io account.</p>
            ) : (
              <select value={form.sequenceId} onChange={set("sequenceId")}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white">
                <option value="">Select a sequence…</option>
                {available.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
          <div className="border-t border-gray-100 pt-1">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Contact Details</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { k: "email", label: "Email", type: "email", ph: "name@company.com", req: true },
                { k: "phone", label: "Phone", type: "tel", ph: "+1 555 000 0000" },
                { k: "firstName", label: "First Name", ph: "Jane" },
                { k: "lastName", label: "Last Name", ph: "Smith" },
                { k: "title", label: "Job Title", ph: "Head of Marketing" },
                { k: "company", label: "Company", ph: "Acme Inc." },
              ].map(({ k, label, type, ph, req }) => (
                <div key={k}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    {label} {req && <span className="text-red-500">*</span>}
                  </label>
                  <input type={type ?? "text"} value={(form as Record<string, string>)[k]}
                    onChange={set(k)} placeholder={ph}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                </div>
              ))}
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">LinkedIn URL</label>
              <input value={form.linkedInProfile} onChange={set("linkedInProfile")}
                placeholder="https://linkedin.com/in/janesmith"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
          </div>
          {formError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>}
        </div>
        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={enrolling || available.length === 0}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {enrolling ? (
              <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4" />
                <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>Enrolling…</>
            ) : "Enroll Contact"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Small UI pieces ───────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-green-100 text-green-700", paused: "bg-amber-100 text-amber-700",
    stopped: "bg-gray-100 text-gray-500", replied: "bg-blue-100 text-blue-700",
    bounced: "bg-red-100 text-red-600", finished: "bg-purple-100 text-purple-700",
    in_progress: "bg-violet-100 text-violet-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[status] ?? "bg-gray-100 text-gray-500"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col gap-1 shadow-sm">
      <span className="text-2xl font-bold text-gray-900">{value}</span>
      <span className={`text-xs font-medium ${accent}`}>{label}</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-5 h-5 text-violet-500" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function SequenceRow({ seq, selected, onSelect }: { seq: ReplySequence; selected: boolean; onSelect: () => void; }) {
  return (
    <button onClick={onSelect}
      className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between transition-all ${
        selected ? "bg-violet-50 border border-violet-200" : "bg-white border border-gray-100 hover:border-violet-200 hover:bg-violet-50/40"
      }`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${seq.status === "active" ? "bg-green-400" : seq.status === "paused" ? "bg-amber-400" : "bg-gray-300"}`} />
        <span className="text-sm font-medium text-gray-800 truncate">{seq.name}</span>
      </div>
      <StatusBadge status={seq.status} />
    </button>
  );
}

function ContactRow({ contact, sequenceId, onPause, pausing }: {
  contact: ReplySequenceContact; sequenceId: number;
  onPause: (seqId: number, contactId: number) => void; pausing: boolean;
}) {
  const s = contact.status ?? {};
  const flags = [
    s.replied   && { label: "Replied",   cls: "text-blue-600" },
    s.opened    && { label: "Opened",    cls: "text-violet-600" },
    s.clicked   && { label: "Clicked",   cls: "text-indigo-600" },
    s.bounced   && { label: "Bounced",   cls: "text-red-500" },
    s.delivered && !s.opened && { label: "Delivered", cls: "text-gray-500" },
  ].filter(Boolean) as { label: string; cls: string }[];

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-xs font-semibold text-violet-700 flex-shrink-0">
          {(contact.firstName?.[0] ?? contact.email[0]).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{contact.firstName} {contact.lastName}</p>
          <p className="text-xs text-gray-400 truncate">{contact.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {flags.map((f) => (
          <span key={f.label} className={`text-xs font-medium hidden sm:inline ${f.cls}`}>{f.label}</span>
        ))}
        <StatusBadge status={s.status ?? "unknown"} />
        {contact.id && s.status !== "paused" && (
          <button onClick={() => onPause(sequenceId, contact.id!)} disabled={pausing}
            title="Pause this contact"
            className="ml-1 text-gray-300 hover:text-amber-500 transition-colors disabled:opacity-50">
            {pausing ? <Spinner /> : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function WebhookPanel({ webhooks, loading, registering, onFetch, onRegister }: {
  webhooks: unknown[]; loading: boolean; registering: boolean;
  onFetch: () => void; onRegister: (event: string, url: string) => void;
}) {
  const [event, setEvent] = useState("email_replied");
  const [url, setUrl] = useState("");
  const EVENTS = ["email_replied", "email_opened", "email_clicked", "email_bounced", "contact_finished"];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Webhook Config</h3>
        <button onClick={onFetch} className="text-xs text-violet-600 hover:text-violet-800 font-medium">
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {(webhooks as { id: number; eventType: string; url: string }[]).length === 0 ? (
        <p className="text-sm text-gray-400">No webhooks registered yet.</p>
      ) : (
        <ul className="divide-y divide-gray-50 text-sm">
          {(webhooks as { id: number; eventType: string; url: string }[]).map((w) => (
            <li key={w.id} className="py-2 flex items-center justify-between gap-2">
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">{w.eventType}</span>
              <span className="text-xs text-gray-400 truncate max-w-xs">{w.url}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-gray-100 pt-4 space-y-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Register New Webhook</p>
        <select value={event} onChange={(e) => setEvent(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white">
          {EVENTS.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <input value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="https://yourdomain.com/api/replyio/webhook-receiver"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500" />
        <button onClick={() => { if (url) onRegister(event, url); }} disabled={registering || !url}
          className="w-full py-2 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
          {registering ? "Registering…" : "Register Webhook"}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function ReplyioPage() {
  const {
    isConnected, connectionLoading, connectedUser,
    sequences, sequencesLoading, fetchSequences,
    selectedSequenceId, setSelectedSequenceId,
    sequenceContacts, sequenceStats, liStats, contactsLoading,
    enrolling, enrollContact,
    pausingContactId, pauseContact,
    webhooks, webhooksLoading, fetchWebhooks,
    registeringWebhook, registerWebhook,
    error, successMessage,
  } = useReplyio();

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [showWebhooks, setShowWebhooks] = useState(false);
  const selectedSequence = sequences.find((s) => s.id === selectedSequenceId) ?? null;

  if (connectionLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-gray-500">
        <Spinner /><span className="text-sm">Checking Reply.io connection…</span>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="max-w-lg mx-auto mt-16 px-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.8">
              <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Reply.io Not Connected</h2>
          <p className="text-sm text-gray-500">
            Add <code className="bg-gray-100 px-1 rounded text-xs font-mono">REPLY_IO_API_KEY</code> to your{" "}
            <code className="bg-gray-100 px-1 rounded text-xs font-mono">.env</code> file in{" "}
            <code className="bg-gray-100 px-1 rounded text-xs font-mono">artifacts/api-server</code> and restart the server.
          </p>
          <div className="bg-gray-50 rounded-xl p-4 text-left font-mono text-xs text-gray-700 leading-relaxed">
            # artifacts/api-server/.env<br />
            REPLY_IO_API_KEY=your_api_key_here
          </div>
          <p className="text-xs text-gray-400">Get your API key from <strong>Reply.io → Settings → API</strong></p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto space-y-6">
      {/* Toast */}
      {(error || successMessage) && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg flex items-center gap-2 ${
          error ? "bg-red-600 text-white" : "bg-green-600 text-white"
        }`}>
          {error
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6" strokeLinecap="round"/></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          }
          {error ?? successMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Reply.io Outreach</h1>
            <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />Connected
            </span>
          </div>
          {connectedUser && <p className="text-sm text-gray-400 mt-0.5">{connectedUser.email}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowWebhooks(!showWebhooks); if (!showWebhooks) fetchWebhooks(); }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11A2.97 2.97 0 0018 8a3 3 0 000-6 3 3 0 00-3 3c0 .24.04.47.09.7L8.04 9.81A3 3 0 006 9a3 3 0 000 6 2.97 2.97 0 002.04-.81l7.12 4.16A3 3 0 0018 22a3 3 0 000-6z" />
            </svg>
            Webhooks
          </button>
          <button onClick={fetchSequences}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            {sequencesLoading ? <Spinner /> : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6M1 20v-6h6" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            Refresh
          </button>
          <button onClick={() => setEnrollOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-colors shadow-sm">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
            </svg>
            Enroll Contact
          </button>
        </div>
      </div>

      {/* Webhooks panel */}
      {showWebhooks && (
        <WebhookPanel webhooks={webhooks} loading={webhooksLoading} registering={registeringWebhook}
          onFetch={fetchWebhooks} onRegister={registerWebhook} />
      )}

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Sequences list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-gray-700">Sequences</h2>
            <span className="text-xs text-gray-400">{sequences.length} total</span>
          </div>
          {sequencesLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : sequences.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm text-gray-400">No sequences found.</p>
              <p className="text-xs text-gray-300">Create one in Reply.io first.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sequences.map((seq) => (
                <SequenceRow key={seq.id} seq={seq} selected={selectedSequenceId === seq.id}
                  onSelect={() => setSelectedSequenceId(seq.id)} />
              ))}
            </div>
          )}
        </div>

        {/* Sequence detail */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedSequence ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center justify-center h-64">
              <div className="text-center space-y-2">
                <svg className="mx-auto text-gray-200" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p className="text-sm text-gray-400">Select a sequence to view contacts</p>
              </div>
            </div>
          ) : (
            <>
              {liStats && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                    <p className="text-2xl font-bold text-gray-800">{liStats.totalPeopleContacted}</p>
                    <p className="text-xs text-gray-400 mt-1">Total contacted</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                    <p className="text-2xl font-bold text-violet-600">{liStats.connectionsSent}</p>
                    <p className="text-xs text-gray-400 mt-1">Connections sent</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                    <p className="text-2xl font-bold text-violet-600">{liStats.acceptedAutomatedConnections}</p>
                    <p className="text-xs text-violet-500 font-medium mt-0.5">{liStats.automatedConnectionsConversionRate.toFixed(2)}%</p>
                    <p className="text-xs text-gray-400 mt-0.5">Accepted / Rate</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                    <p className="text-2xl font-bold text-gray-800">{liStats.messagesSent}</p>
                    <p className="text-xs text-gray-400 mt-1">Messages sent</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center col-span-2 sm:col-span-1">
                    <p className="text-2xl font-bold text-violet-600">{liStats.replies}</p>
                    <p className="text-xs text-violet-500 font-medium mt-0.5">{liStats.repliesConversionRate.toFixed(2)}%</p>
                    <p className="text-xs text-gray-400 mt-0.5">Replies / Rate</p>
                  </div>
                </div>
              )}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-800">
                    {selectedSequence.name}
                    <span className="ml-2 text-xs text-gray-400 font-normal">
                      {sequenceContacts.length} contact{sequenceContacts.length !== 1 ? "s" : ""}
                    </span>
                  </h3>
                  <button onClick={() => setEnrollOpen(true)}
                    className="text-xs text-violet-600 font-medium hover:text-violet-800">
                    + Add contact
                  </button>
                </div>
                {contactsLoading ? (
                  <div className="flex justify-center py-10"><Spinner /></div>
                ) : sequenceContacts.length === 0 ? (
                  <div className="text-center py-10 space-y-3">
                    <p className="text-sm text-gray-400">No contacts in this sequence yet.</p>
                    <button onClick={() => setEnrollOpen(true)}
                      className="text-sm text-violet-600 font-medium hover:text-violet-800">
                      Enroll your first contact →
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {sequenceContacts.map((c) => (
                      <ContactRow key={c.email} contact={c} sequenceId={selectedSequenceId!}
                        onPause={pauseContact} pausing={pausingContactId === c.id} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Enroll Modal */}
      <EnrollModal open={enrollOpen} onClose={() => setEnrollOpen(false)}
        sequences={sequences} enrolling={enrolling} onEnroll={enrollContact} />
    </div>
  );
}
