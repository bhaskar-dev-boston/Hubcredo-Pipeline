import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import { useGetMe, useListLeadLists } from "@workspace/api-client-react";
import {
  Linkedin,
  CheckCircle2,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Play,
  Pause,
  Sparkles,
  X,
  ShieldAlert,
  Users,
  Send,
  MessageSquare,
  Settings,
  BarChart2,
  UserCheck,
  MessageCircle,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { getToken } from "@/lib/auth";
import type { LeadList } from "@workspace/api-client-react";

const API_BASE = "/api";
function apiUrl(path: string) {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}${API_BASE}${path}`;
}
function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

type LIStatus = "connected" | "disconnected" | "paused" | "flagged";

interface LinkedInAccount {
  id: string;
  status: LIStatus;
  daily_limit: number;
  connected_at: string;
  sends_today: number;
  sends_reset_at: string;
  profile_name?: string | null;
  unipile_account_id?: string | null;
}

interface Sequence {
  id: string;
  name: string;
  connection_message: string;
  followup_message: string | null;
  followup_delay_days: number;
  lead_list_id: string | null;
  daily_limit: number;
  is_active: boolean;
  lead_lists?: { id: string; label: string } | null;
  created_at: string;
}

interface Analytics {
  total_contacted: number;
  connected: number;
  replied: number;
  followups_pending: number;
  followups_sent: number;
}

export default function LinkedIn() {
  const { toast } = useToast();
  const { data: me } = useGetMe();
  const { data: leadLists = [] } = useListLeadLists();

  const [account, setAccount] = useState<LinkedInAccount | null>(null);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const [showLimitEditor, setShowLimitEditor] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(15);
  const [savingLimit, setSavingLimit] = useState(false);

  const [showBuilder, setShowBuilder] = useState(false);
  const [editingSeq, setEditingSeq] = useState<Sequence | null>(null);
  const [seqName, setSeqName] = useState("My LinkedIn Sequence");
  const [connMsg, setConnMsg] = useState("");
  const [followupMsg, setFollowupMsg] = useState("");
  const [followupDelay, setFollowupDelay] = useState(2);
  const [seqListId, setSeqListId] = useState<string>("");
  const [seqDailyLimit, setSeqDailyLimit] = useState(15);
  const [savingSeq, setSavingSeq] = useState(false);
  const [prefilling, setPrefilling] = useState(false);

  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [pausingId, setPausingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Analytics state
  const [analyticsMap, setAnalyticsMap] = useState<Record<string, Analytics>>({});
  const [loadingAnalytics, setLoadingAnalytics] = useState<Record<string, boolean>>({});
  const [expandedAnalytics, setExpandedAnalytics] = useState<Record<string, boolean>>({});

  /* ── Handle Unipile callback params in URL ───────────────────────── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("li_connected");
    const liError = params.get("li_error");

    if (connected === "1") {
      toast({
        title: "LinkedIn connected!",
        description: "Your account is linked. You can now launch outreach sequences.",
      });
      window.history.replaceState({}, "", window.location.pathname);
      loadData();
    } else if (liError) {
      toast({
        title: "LinkedIn connection failed",
        description: decodeURIComponent(liError).replace(/_/g, " "),
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  /* ── Load account + sequences ────────────────────────────────────── */
  async function loadData() {
    setLoading(true);
    try {
      const [acctRes, seqRes] = await Promise.all([
        fetch(apiUrl("/linkedin/account"), { headers: authHeaders() }),
        fetch(apiUrl("/linkedin/sequences"), { headers: authHeaders() }),
      ]);
      if (acctRes.ok) setAccount(await acctRes.json());
      if (seqRes.ok) setSequences(await seqRes.json());
    } catch {
      toast({ title: "Error", description: "Could not load LinkedIn data.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [me]);

  /* ── Load analytics for a sequence ──────────────────────────────── */
  async function loadAnalytics(seqId: string) {
    setLoadingAnalytics((prev) => ({ ...prev, [seqId]: true }));
    try {
      const res = await fetch(apiUrl(`/linkedin/sequences/${seqId}/analytics`), {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setAnalyticsMap((prev) => ({ ...prev, [seqId]: data }));
      }
    } catch {
      // silently fail
    } finally {
      setLoadingAnalytics((prev) => ({ ...prev, [seqId]: false }));
    }
  }

  function toggleAnalytics(seqId: string) {
    const nowExpanded = !expandedAnalytics[seqId];
    setExpandedAnalytics((prev) => ({ ...prev, [seqId]: nowExpanded }));
    if (nowExpanded && !analyticsMap[seqId]) {
      loadAnalytics(seqId);
    }
  }

  /* ── Connect via Unipile Hosted Auth ─────────────────────────────── */
  async function handleConnectLinkedIn() {
    setConnecting(true);
    try {
      const res = await fetch(apiUrl("/linkedin/connect/start"), {
        headers: authHeaders(),
      });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Connect endpoint not found — check your backend routes.");
      }
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to start connection");
      window.location.href = d.url;
    } catch (err: unknown) {
      toast({
        title: "Connection failed",
        description: (err as Error).message,
        variant: "destructive",
      });
      setConnecting(false);
    }
  }

  /* ── Disconnect ──────────────────────────────────────────────────── */
  async function handleDisconnect() {
    try {
      await fetch(apiUrl("/linkedin/account"), { method: "DELETE", headers: authHeaders() });
      setAccount(null);
      toast({ title: "LinkedIn disconnected" });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  }

  /* ── Update daily limit ──────────────────────────────────────────── */
  async function handleUpdateLimit() {
    setSavingLimit(true);
    try {
      const res = await fetch(apiUrl("/linkedin/account"), {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ daily_limit: dailyLimit }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setAccount(d);
      setShowLimitEditor(false);
      toast({ title: "Daily limit updated" });
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSavingLimit(false);
    }
  }

  /* ── AI prefill ──────────────────────────────────────────────────── */
  async function handlePrefill() {
    setPrefilling(true);
    try {
      const res = await fetch(apiUrl("/linkedin/ai-prefill"), { headers: authHeaders() });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setConnMsg(d.connection_message || "");
      setFollowupMsg(d.followup_message || "");
      toast({ title: "Templates pre-filled from your ICP" });
    } catch {
      toast({ title: "Pre-fill failed", variant: "destructive" });
    } finally {
      setPrefilling(false);
    }
  }

  /* ── Sequence builder ────────────────────────────────────────────── */
  function openBuilder(seq?: Sequence) {
    if (seq) {
      setEditingSeq(seq);
      setSeqName(seq.name);
      setConnMsg(seq.connection_message);
      setFollowupMsg(seq.followup_message || "");
      setFollowupDelay(seq.followup_delay_days);
      setSeqListId(seq.lead_list_id || "");
      setSeqDailyLimit(seq.daily_limit);
    } else {
      setEditingSeq(null);
      setSeqName("My LinkedIn Sequence");
      setConnMsg("");
      setFollowupMsg("");
      setFollowupDelay(2);
      setSeqListId("");
      setSeqDailyLimit(15);
    }
    setShowBuilder(true);
  }

  async function handleSaveSeq() {
    if (connMsg.trim().length < 10) {
      toast({ title: "Connection message too short (min 10 chars)", variant: "destructive" });
      return;
    }
    if (connMsg.length > 300) {
      toast({ title: "Connection message max 300 characters", variant: "destructive" });
      return;
    }
    setSavingSeq(true);
    try {
      const body = {
        name: seqName.trim() || "My LinkedIn Sequence",
        connection_message: connMsg.trim(),
        followup_message: followupMsg.trim() || null,
        followup_delay_days: followupDelay,
        lead_list_id: seqListId || null,
        daily_limit: seqDailyLimit,
      };
      const url = editingSeq
        ? apiUrl(`/linkedin/sequences/${editingSeq.id}`)
        : apiUrl("/linkedin/sequences");
      const res = await fetch(url, {
        method: editingSeq ? "PUT" : "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      await loadData();
      setShowBuilder(false);
      toast({ title: editingSeq ? "Sequence updated" : "Sequence created" });
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSavingSeq(false);
    }
  }

  /* ── Launch / pause / delete ─────────────────────────────────────── */
  async function handleLaunch(seq: Sequence) {
    if (!account || account.status !== "connected") {
      toast({ title: "Connect LinkedIn first", variant: "destructive" });
      return;
    }
    setLaunchingId(seq.id);
    try {
      const res = await fetch(apiUrl(`/linkedin/sequences/${seq.id}/launch`), {
        method: "POST",
        headers: authHeaders(),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      await loadData();
      // Refresh analytics if expanded
      if (expandedAnalytics[seq.id]) loadAnalytics(seq.id);
      toast({
        title: "Outreach launched!",
        description: `${d.leads_queued} connection requests sent. ${d.sends_today}/${d.daily_limit} today.${
          d.skipped ? ` ${d.skipped} skipped (invalid URLs).` : ""
        }${!d.via_unipile ? " (Simulation mode — check UNIPILE_API_KEY)" : ""}`,
      });
    } catch (err: unknown) {
      toast({ title: "Launch failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLaunchingId(null);
    }
  }

  async function handlePause(seq: Sequence) {
    setPausingId(seq.id);
    try {
      await fetch(apiUrl(`/linkedin/sequences/${seq.id}/pause`), {
        method: "POST",
        headers: authHeaders(),
      });
      await loadData();
      toast({ title: "Sequence paused" });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setPausingId(null);
    }
  }

  async function handleDelete(seqId: string) {
    setDeletingId(seqId);
    try {
      await fetch(apiUrl(`/linkedin/sequences/${seqId}`), {
        method: "DELETE",
        headers: authHeaders(),
      });
      setSequences((prev) => prev.filter((s) => s.id !== seqId));
      toast({ title: "Sequence deleted" });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  /* ── Analytics helpers ───────────────────────────────────────────── */
  function getAcceptanceRate(a: Analytics) {
    if (!a.total_contacted) return 0;
    return Math.round((a.connected / a.total_contacted) * 100);
  }
  function getReplyRate(a: Analytics) {
    if (!a.connected) return 0;
    return Math.round((a.replied / a.connected) * 100);
  }

  const inputClass =
    "w-full px-3 py-2.5 text-sm bg-white border border-[#E2E8F0] rounded-lg text-[#0A0A0A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB] transition-colors";
  const lists = leadLists as LeadList[];

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0A0A0A] flex items-center gap-2.5">
              <Linkedin className="w-6 h-6 text-[#2563EB]" />
              LinkedIn Outreach
            </h1>
            <p className="text-sm text-[#64748B] mt-1">
              Send connection requests and follow-ups to leads automatically.
            </p>
          </div>
          <button
            onClick={() => openBuilder()}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#2563EB] text-white text-sm font-semibold rounded-xl hover:bg-[#1D4ED8] transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            New sequence
          </button>
        </div>

        {/* Warning banner */}
        <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Account safety reminder</p>
            <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
              LinkedIn automation carries a risk of account restriction. Keep daily limits under 30,
              use natural delays, and never scrape private data. HubCredo routes automation through
              Unipile, which handles humanisation natively.
            </p>
          </div>
        </div>

        {/* LinkedIn Account section */}
        <section>
          <h2 className="text-xs font-semibold text-[#94A3B8] uppercase tracking-widest mb-3">
            Your LinkedIn account
          </h2>

          {loading ? (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-[#94A3B8]" />
            </div>
          ) : account && account.status === "connected" ? (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                    <Linkedin className="w-5 h-5 text-[#0077B5]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#0A0A0A]">
                        {account.profile_name ? account.profile_name : "LinkedIn connected"}
                      </p>
                      <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
                        <CheckCircle2 className="w-3 h-3" /> Active
                      </span>
                    </div>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      Daily limit: {account.daily_limit} sends · {account.sends_today ?? 0} sent today
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setDailyLimit(account.daily_limit); setShowLimitEditor(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E2E8F0] text-[#64748B] text-xs font-medium rounded-lg hover:bg-[#F5F7FA] transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5" /> Limit
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="px-3 py-1.5 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-4">
                <div className="flex justify-between text-xs text-[#64748B] mb-1.5">
                  <span>Sends today</span>
                  <span>{account.sends_today ?? 0} / {account.daily_limit}</span>
                </div>
                <div className="w-full bg-[#F1F5F9] rounded-full h-1.5">
                  <div
                    className="bg-[#0077B5] h-1.5 rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, ((account.sends_today ?? 0) / account.daily_limit) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Limit editor */}
              {showLimitEditor && (
                <div className="mt-4 pt-4 border-t border-[#E2E8F0] space-y-3">
                  <p className="text-sm font-medium text-[#0A0A0A]">Update daily limit</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={30}
                      value={dailyLimit}
                      onChange={(e) => setDailyLimit(Number(e.target.value))}
                      className="flex-1 accent-[#0077B5]"
                    />
                    <span className="w-12 text-center text-sm font-bold text-[#0A0A0A] bg-[#F5F7FA] border border-[#E2E8F0] rounded-lg py-1.5">
                      {dailyLimit}
                    </span>
                  </div>
                  <p className="text-xs text-[#94A3B8]">
                    We recommend 15 sends/day to stay below LinkedIn's detection threshold.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleUpdateLimit}
                      disabled={savingLimit}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#0A0A0A] text-white text-sm font-semibold rounded-lg hover:bg-[#1a1a1a] transition-colors disabled:opacity-50"
                    >
                      {savingLimit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      {savingLimit ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => setShowLimitEditor(false)}
                      className="px-4 py-2 border border-[#E2E8F0] text-[#64748B] text-sm font-semibold rounded-lg hover:bg-[#F5F7FA] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-[#F5F7FA] rounded-xl flex items-center justify-center shrink-0">
                  <Linkedin className="w-5 h-5 text-[#94A3B8]" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#0A0A0A]">No LinkedIn account connected</p>
                  <p className="text-xs text-[#64748B] mt-1 mb-5">
                    Connect your LinkedIn account to start sending automated connection requests and follow-ups.
                  </p>
                  <button
                    onClick={handleConnectLinkedIn}
                    disabled={connecting}
                    className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-60"
                    style={{ backgroundColor: "#0077B5" }}
                    onMouseEnter={(e) => { if (!connecting) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#005e93"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#0077B5"; }}
                  >
                    {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                      </svg>
                    )}
                    {connecting ? "Redirecting to Unipile…" : "Connect LinkedIn"}
                  </button>
                  <p className="text-xs text-[#94A3B8] mt-3">
                    You'll be securely redirected to connect your LinkedIn account via Unipile.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Sequences list */}
        <section>
          <h2 className="text-xs font-semibold text-[#94A3B8] uppercase tracking-widest mb-3">
            Sequences
          </h2>
          {sequences.length === 0 ? (
            <div className="bg-white border border-[#E2E8F0] border-dashed rounded-xl p-10 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 bg-[#F5F7FA] rounded-2xl flex items-center justify-center">
                <Send className="w-5 h-5 text-[#94A3B8]" />
              </div>
              <p className="text-sm font-semibold text-[#0A0A0A]">No sequences yet</p>
              <p className="text-xs text-[#64748B] max-w-xs">
                Create a sequence with a connection request template and optional follow-up message.
              </p>
              <button
                onClick={() => openBuilder()}
                className="mt-1 flex items-center gap-2 px-4 py-2.5 bg-[#2563EB] text-white text-sm font-semibold rounded-xl hover:bg-[#1D4ED8] transition-colors"
              >
                <Plus className="w-4 h-4" /> Create first sequence
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {sequences.map((seq) => {
                const analytics = analyticsMap[seq.id];
                const isExpanded = expandedAnalytics[seq.id];
                const isLoadingA = loadingAnalytics[seq.id];

                return (
                  <div
                    key={seq.id}
                    className="bg-white border border-[#E2E8F0] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden"
                  >
                    {/* Sequence header */}
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold text-[#0A0A0A]">{seq.name}</h3>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                                seq.is_active
                                  ? "bg-green-50 text-green-700 border-green-200"
                                  : "bg-[#F5F7FA] text-[#64748B] border-[#E2E8F0]"
                              }`}
                            >
                              {seq.is_active ? "Active" : "Inactive"}
                            </span>
                          </div>
                          {seq.lead_lists && (
                            <p className="text-xs text-[#64748B] mt-1 flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5" />
                              {seq.lead_lists.label}
                            </p>
                          )}
                          <p className="text-xs text-[#94A3B8] mt-1.5 line-clamp-2">
                            {seq.connection_message}
                          </p>
                          <div className="flex flex-wrap gap-3 mt-2">
                            <span className="text-xs text-[#64748B] flex items-center gap-1">
                              <Send className="w-3 h-3" /> {seq.daily_limit}/day limit
                            </span>
                            {seq.followup_message && (
                              <span className="text-xs text-[#64748B] flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" /> Follow-up in {seq.followup_delay_days}d
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {!seq.is_active ? (
                            <button
                              onClick={() => handleLaunch(seq)}
                              disabled={launchingId === seq.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0077B5] text-white text-xs font-semibold rounded-lg hover:bg-[#005e93] transition-colors disabled:opacity-50"
                            >
                              {launchingId === seq.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                              Launch
                            </button>
                          ) : (
                            <button
                              onClick={() => handlePause(seq)}
                              disabled={pausingId === seq.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E2E8F0] text-[#64748B] text-xs font-medium rounded-lg hover:bg-[#F5F7FA] transition-colors disabled:opacity-50"
                            >
                              {pausingId === seq.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
                              Pause
                            </button>
                          )}
                          <button
                            onClick={() => openBuilder(seq)}
                            className="p-1.5 text-[#94A3B8] hover:text-[#0A0A0A] hover:bg-[#F5F7FA] rounded-lg transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(seq.id)}
                            disabled={deletingId === seq.id}
                            className="p-1.5 text-[#94A3B8] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {deletingId === seq.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Analytics toggle button */}
                    <button
                      onClick={() => toggleAnalytics(seq.id)}
                      className="w-full flex items-center justify-between px-5 py-2.5 bg-[#F8FAFC] border-t border-[#E2E8F0] text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9] transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <BarChart2 className="w-3.5 h-3.5 text-[#2563EB]" />
                        Analytics
                      </span>
                      {isLoadingA ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Analytics panel */}
                    {isExpanded && (
                      <div className="px-5 py-4 border-t border-[#E2E8F0] bg-[#F8FAFC]">
                        {isLoadingA ? (
                          <div className="flex justify-center py-4">
                            <Loader2 className="w-5 h-5 animate-spin text-[#94A3B8]" />
                          </div>
                        ) : analytics ? (
                          <div className="space-y-4">
                            {/* Stats grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              {/* Contacted */}
                              <div className="bg-white rounded-xl border border-[#E2E8F0] p-3">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Send className="w-3.5 h-3.5 text-[#64748B]" />
                                  <span className="text-xs text-[#64748B]">Contacted</span>
                                </div>
                                <p className="text-2xl font-bold text-[#0A0A0A]">{analytics.total_contacted}</p>
                              </div>

                              {/* Connected */}
                              <div className="bg-white rounded-xl border border-[#E2E8F0] p-3">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <UserCheck className="w-3.5 h-3.5 text-[#0077B5]" />
                                  <span className="text-xs text-[#64748B]">Connected</span>
                                </div>
                                <p className="text-2xl font-bold text-[#0077B5]">{analytics.connected}</p>
                                {analytics.total_contacted > 0 && (
                                  <p className="text-xs text-[#94A3B8] mt-0.5">{getAcceptanceRate(analytics)}% rate</p>
                                )}
                              </div>

                              {/* Replied */}
                              <div className="bg-white rounded-xl border border-[#E2E8F0] p-3">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <MessageCircle className="w-3.5 h-3.5 text-green-600" />
                                  <span className="text-xs text-[#64748B]">Replied</span>
                                </div>
                                <p className="text-2xl font-bold text-green-600">{analytics.replied}</p>
                                {analytics.connected > 0 && (
                                  <p className="text-xs text-[#94A3B8] mt-0.5">{getReplyRate(analytics)}% rate</p>
                                )}
                              </div>

                              {/* Follow-ups */}
                              <div className="bg-white rounded-xl border border-[#E2E8F0] p-3">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                                  <span className="text-xs text-[#64748B]">Follow-ups</span>
                                </div>
                                <p className="text-2xl font-bold text-amber-500">{analytics.followups_pending}</p>
                                <p className="text-xs text-[#94A3B8] mt-0.5">{analytics.followups_sent} sent</p>
                              </div>
                            </div>

                            {/* Funnel bar */}
                            {analytics.total_contacted > 0 && (
                              <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                                <p className="text-xs font-semibold text-[#0A0A0A] mb-3">Funnel</p>
                                <div className="space-y-2.5">
                                  {/* Contacted bar */}
                                  <div>
                                    <div className="flex justify-between text-xs text-[#64748B] mb-1">
                                      <span>Contacted</span>
                                      <span>{analytics.total_contacted}</span>
                                    </div>
                                    <div className="w-full bg-[#F1F5F9] rounded-full h-2">
                                      <div className="bg-[#64748B] h-2 rounded-full" style={{ width: "100%" }} />
                                    </div>
                                  </div>
                                  {/* Connected bar */}
                                  <div>
                                    <div className="flex justify-between text-xs text-[#0077B5] mb-1">
                                      <span>Connected</span>
                                      <span>{analytics.connected} ({getAcceptanceRate(analytics)}%)</span>
                                    </div>
                                    <div className="w-full bg-[#F1F5F9] rounded-full h-2">
                                      <div
                                        className="bg-[#0077B5] h-2 rounded-full transition-all"
                                        style={{ width: `${getAcceptanceRate(analytics)}%` }}
                                      />
                                    </div>
                                  </div>
                                  {/* Replied bar */}
                                  <div>
                                    <div className="flex justify-between text-xs text-green-600 mb-1">
                                      <span>Replied</span>
                                      <span>{analytics.replied} ({getReplyRate(analytics)}%)</span>
                                    </div>
                                    <div className="w-full bg-[#F1F5F9] rounded-full h-2">
                                      <div
                                        className="bg-green-500 h-2 rounded-full transition-all"
                                        style={{
                                          width: `${analytics.total_contacted > 0 ? Math.round((analytics.replied / analytics.total_contacted) * 100) : 0}%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Refresh button */}
                            <button
                              onClick={() => loadAnalytics(seq.id)}
                              className="text-xs text-[#2563EB] hover:text-[#1D4ED8] transition-colors"
                            >
                              Refresh analytics
                            </button>
                          </div>
                        ) : (
                          <p className="text-xs text-[#94A3B8] text-center py-4">No analytics data yet. Launch the sequence first.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── Sequence builder modal ── */}
      {showBuilder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-[#E2E8F0] px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-base font-bold text-[#0A0A0A]">
                {editingSeq ? "Edit sequence" : "New sequence"}
              </h2>
              <button
                onClick={() => setShowBuilder(false)}
                className="p-1.5 text-[#94A3B8] hover:text-[#0A0A0A] hover:bg-[#F5F7FA] rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#0A0A0A] mb-1.5">Sequence name</label>
                <input
                  value={seqName}
                  onChange={(e) => setSeqName(e.target.value)}
                  placeholder="My LinkedIn Sequence"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#0A0A0A] mb-1.5">Lead list</label>
                <select value={seqListId} onChange={(e) => setSeqListId(e.target.value)} className={inputClass}>
                  <option value="">No list selected</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>{l.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-[#0A0A0A]">
                    Connection request message <span className="text-[#94A3B8] font-normal">(max 300 chars)</span>
                  </label>
                  <button
                    onClick={handlePrefill}
                    disabled={prefilling}
                    className="flex items-center gap-1 text-xs text-[#2563EB] hover:text-[#1D4ED8] transition-colors disabled:opacity-50"
                  >
                    {prefilling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    AI fill
                  </button>
                </div>
                <textarea
                  value={connMsg}
                  onChange={(e) => setConnMsg(e.target.value)}
                  placeholder="Hi {{firstName}}, I noticed you work in… Open to connecting?"
                  rows={4}
                  maxLength={300}
                  className={`${inputClass} resize-none`}
                />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-[#94A3B8]">Use {"{{firstName}}"} as a personalisation token.</p>
                  <span className={`text-xs ${connMsg.length > 280 ? "text-amber-600" : "text-[#94A3B8]"}`}>
                    {connMsg.length}/300
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#0A0A0A] mb-1.5">
                  Follow-up message <span className="text-[#94A3B8] font-normal">(optional)</span>
                </label>
                <textarea
                  value={followupMsg}
                  onChange={(e) => setFollowupMsg(e.target.value)}
                  placeholder="Hey {{firstName}}, thanks for connecting! …"
                  rows={3}
                  className={`${inputClass} resize-none`}
                />
              </div>

              {followupMsg.trim() && (
                <div>
                  <label className="block text-sm font-medium text-[#0A0A0A] mb-1.5">
                    Send follow-up after{" "}
                    <span className="text-[#2563EB] font-bold">{followupDelay} day{followupDelay !== 1 ? "s" : ""}</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={14}
                    value={followupDelay}
                    onChange={(e) => setFollowupDelay(Number(e.target.value))}
                    className="w-full accent-[#2563EB]"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[#0A0A0A] mb-1.5">
                  Sequence daily limit <span className="text-[#94A3B8] font-normal">(max 30)</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={30}
                    value={seqDailyLimit}
                    onChange={(e) => setSeqDailyLimit(Number(e.target.value))}
                    className="flex-1 accent-[#2563EB]"
                  />
                  <span className="w-12 text-center text-sm font-bold text-[#0A0A0A] bg-[#F5F7FA] border border-[#E2E8F0] rounded-lg py-1.5">
                    {seqDailyLimit}
                  </span>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-[#E2E8F0] px-6 py-4 flex gap-3 rounded-b-2xl">
              <button
                onClick={handleSaveSeq}
                disabled={savingSeq}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#2563EB] text-white text-sm font-semibold rounded-xl hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
              >
                {savingSeq ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {savingSeq ? "Saving…" : editingSeq ? "Update sequence" : "Create sequence"}
              </button>
              <button
                onClick={() => setShowBuilder(false)}
                className="px-5 py-2.5 border border-[#E2E8F0] text-[#64748B] text-sm font-semibold rounded-xl hover:bg-[#F5F7FA] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}