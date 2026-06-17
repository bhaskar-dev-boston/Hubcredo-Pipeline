import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import { useGetMe, useListLeadLists } from "@workspace/api-client-react";
import {
  Linkedin, CheckCircle2, Loader2, Plus, Pencil, Trash2, Play, Pause,
  Sparkles, X, ShieldAlert, Users, Send, MessageSquare, Settings,
  BarChart2, UserCheck, MessageCircle, Clock, ChevronDown, ChevronUp,
  Zap, Mail, RefreshCcw, FileText, ArrowLeft, SendHorizonal,
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

interface InboxChat {
  id: string;
  display_name?: string | null;
  last_message_text?: string | null;
  last_message_sender_is_me?: boolean;
  timestamp?: string | null;
  unread_count?: number;
  attendee_provider_id?: string | null;
}

interface ChatMessage {
  id: string;
  text?: string | null;
  is_sender?: boolean;
  timestamp?: string;
  is_event?: boolean;
  hidden?: boolean;
  attachments?: any[];
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

  const [analyticsMap, setAnalyticsMap] = useState<Record<string, Analytics>>({});
  const [loadingAnalytics, setLoadingAnalytics] = useState<Record<string, boolean>>({});
  const [expandedAnalytics, setExpandedAnalytics] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<"sequences" | "inbox">("sequences");
  const [showTemplates, setShowTemplates] = useState(false);
  const [refreshingAnalytics, setRefreshingAnalytics] = useState<Record<string, boolean>>({});

  const [inbox, setInbox] = useState<InboxChat[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);

  const [openChat, setOpenChat] = useState<InboxChat | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const LINKEDIN_TEMPLATES = [
    { name: "Cold outreach", connection_message: "Hi {{firstName}}, I help B2B companies build reliable sales infrastructure. Thought we'd connect well — open to it?", followup_message: "Hey {{firstName}}, thanks for connecting! I work with founders to set up scalable outbound. Worth a quick 15-min chat?" },
    { name: "Value-first", connection_message: "Hi {{firstName}}, I noticed your profile and wanted to connect — I share insights on outbound strategy relevant to your space.", followup_message: "Hey {{firstName}}, great to connect! Are you exploring ways to scale your pipeline? Happy to share what's been working." },
    { name: "Direct ask", connection_message: "Hi {{firstName}}, I help companies like yours improve outbound results 2-3x. Would love to connect and see if there's a fit.", followup_message: "" },
    { name: "Industry peer", connection_message: "Hi {{firstName}}, we're both in the B2B space and I'd love to stay connected. I work on GTM infrastructure and outreach automation.", followup_message: "Hey {{firstName}}, great to be connected! Would you be open to a 15-min call to explore if what I do could help your team?" },
  ];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("li_connected");
    const liError = params.get("li_error");
    if (connected === "1") {
      toast({ title: "LinkedIn connected!", description: "Your account is linked. You can now launch outreach sequences." });
      window.history.replaceState({}, "", window.location.pathname);
      loadData();
    } else if (liError) {
      toast({ title: "LinkedIn connection failed", description: decodeURIComponent(liError).replace(/_/g, " "), variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

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

  useEffect(() => {
    if (chatMessages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  async function loadAnalytics(seqId: string) {
    setLoadingAnalytics((prev) => ({ ...prev, [seqId]: true }));
    try {
      const res = await fetch(apiUrl(`/linkedin/sequences/${seqId}/analytics`), { headers: authHeaders() });
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
    if (nowExpanded && !analyticsMap[seqId]) loadAnalytics(seqId);
  }

  async function handleConnectLinkedIn() {
    setConnecting(true);
    try {
      const res = await fetch(apiUrl("/linkedin/connect/start"), { headers: authHeaders() });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) throw new Error("Connect endpoint not found — check your backend routes.");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to start connection");
      window.location.href = d.url;
    } catch (err: unknown) {
      toast({ title: "Connection failed", description: (err as Error).message, variant: "destructive" });
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      await fetch(apiUrl("/linkedin/account"), { method: "DELETE", headers: authHeaders() });
      setAccount(null);
      toast({ title: "LinkedIn disconnected" });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  }

  async function handleUpdateLimit() {
    setSavingLimit(true);
    try {
      const res = await fetch(apiUrl("/linkedin/account"), {
        method: "PATCH", headers: authHeaders(),
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

  async function loadInbox() {
    setLoadingInbox(true);
    try {
      const res = await fetch(apiUrl("/linkedin/inbox"), { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setInbox(data.chats || []);
      } else {
        toast({ title: "Failed to load inbox", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to load inbox", variant: "destructive" });
    } finally {
      setLoadingInbox(false);
    }
  }

  async function openChatPanel(chat: InboxChat) {
    setOpenChat(chat);
    setChatMessages([]);
    setMessageInput("");
    setLoadingMessages(true);
    try {
      const res = await fetch(apiUrl(`/linkedin/inbox/${chat.id}/messages`), { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        const real = (data.messages || []).filter((m: ChatMessage) => !m.hidden && !m.is_event);
        setChatMessages(real);
      } else {
        toast({ title: "Failed to load messages", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to load messages", variant: "destructive" });
    } finally {
      setLoadingMessages(false);
    }
  }

  async function refreshMessages() {
    if (!openChat) return;
    setLoadingMessages(true);
    try {
      const res = await fetch(apiUrl(`/linkedin/inbox/${openChat.id}/messages`), { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setChatMessages((data.messages || []).filter((m: ChatMessage) => !m.hidden && !m.is_event));
      }
    } finally {
      setLoadingMessages(false);
    }
  }

  async function handleSendMessage() {
    if (!openChat || !messageInput.trim() || sendingMessage) return;
    const text = messageInput.trim();
    setMessageInput("");
    setSendingMessage(true);
    const optimisticMsg: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      text,
      is_sender: true,
      timestamp: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, optimisticMsg]);
    try {
      const res = await fetch(apiUrl(`/linkedin/inbox/${openChat.id}/messages`), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to send");
      }
      setInbox((prev) =>
        prev.map((c) =>
          c.id === openChat.id
            ? { ...c, last_message_text: text, last_message_sender_is_me: true, timestamp: new Date().toISOString() }
            : c
        )
      );
    } catch (err: unknown) {
      setChatMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setMessageInput(text);
      toast({ title: "Failed to send message", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSendingMessage(false);
      inputRef.current?.focus();
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  async function refreshAnalyticsFromLinkedIn(seqId: string) {
    setRefreshingAnalytics((prev) => ({ ...prev, [seqId]: true }));
    try {
      const res = await fetch(apiUrl(`/linkedin/analytics/${seqId}/refresh`), { method: "POST", headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.analytics) setAnalyticsMap((prev) => ({ ...prev, [seqId]: { ...prev[seqId], ...data.analytics } }));
        toast({
          title: `Synced ${data.synced} update${data.synced !== 1 ? "s" : ""} from LinkedIn`,
          description: data.synced === 0 ? "No new connections or replies detected." : undefined,
        });
      }
    } catch {
      toast({ title: "Sync failed", variant: "destructive" });
    } finally {
      setRefreshingAnalytics((prev) => ({ ...prev, [seqId]: false }));
    }
  }

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

  function openBuilder(seq?: Sequence) {
    if (seq) {
      setEditingSeq(seq); setSeqName(seq.name); setConnMsg(seq.connection_message);
      setFollowupMsg(seq.followup_message || ""); setFollowupDelay(seq.followup_delay_days);
      setSeqListId(seq.lead_list_id || ""); setSeqDailyLimit(seq.daily_limit);
    } else {
      setEditingSeq(null); setSeqName("My LinkedIn Sequence"); setConnMsg("");
      setFollowupMsg(""); setFollowupDelay(2); setSeqListId(""); setSeqDailyLimit(15);
    }
    setShowBuilder(true);
  }

  async function handleSaveSeq() {
    if (connMsg.trim().length < 10) { toast({ title: "Connection message too short (min 10 chars)", variant: "destructive" }); return; }
    if (connMsg.length > 300) { toast({ title: "Connection message max 300 characters", variant: "destructive" }); return; }
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
      const url = editingSeq ? apiUrl(`/linkedin/sequences/${editingSeq.id}`) : apiUrl("/linkedin/sequences");
      const res = await fetch(url, { method: editingSeq ? "PUT" : "POST", headers: authHeaders(), body: JSON.stringify(body) });
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

  async function handleLaunch(seq: Sequence) {
    if (!account || account.status !== "connected") { toast({ title: "Connect LinkedIn first", variant: "destructive" }); return; }
    setLaunchingId(seq.id);
    try {
      const res = await fetch(apiUrl(`/linkedin/sequences/${seq.id}/launch`), { method: "POST", headers: authHeaders() });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      await loadData();
      if (expandedAnalytics[seq.id]) loadAnalytics(seq.id);
      toast({
        title: "Outreach launched!",
        description: `${d.leads_queued} connection requests sent. ${d.sends_today}/${d.daily_limit} today.${d.skipped ? ` ${d.skipped} skipped.` : ""}${!d.via_unipile ? " (Simulation mode)" : ""}`,
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
      await fetch(apiUrl(`/linkedin/sequences/${seq.id}/pause`), { method: "POST", headers: authHeaders() });
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
      await fetch(apiUrl(`/linkedin/sequences/${seqId}`), { method: "DELETE", headers: authHeaders() });
      setSequences((prev) => prev.filter((s) => s.id !== seqId));
      toast({ title: "Sequence deleted" });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  function getAcceptanceRate(a: Analytics) { return !a.total_contacted ? 0 : Math.round((a.connected / a.total_contacted) * 100); }
  function getReplyRate(a: Analytics) { return !a.connected ? 0 : Math.round((a.replied / a.connected) * 100); }

  function formatTime(ts: string | null | undefined): string {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      const now = new Date();
      const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
      if (diff === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (diff === 1) return "Yesterday";
      if (diff < 7) return d.toLocaleDateString([], { weekday: "short" });
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch { return ""; }
  }

  function formatMessageTime(ts: string | null | undefined): string {
    if (!ts) return "";
    try { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
  }

  const inputClass = "w-full px-3 py-2.5 text-sm bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] rounded-lg text-white placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[rgba(79,70,229,.2)] focus:border-[rgba(99,102,241,.7)] transition-colors";
  const lists = leadLists as LeadList[];

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
              <Linkedin className="w-6 h-6 text-[#4f46e5]" />
              LinkedIn Outreach
            </h1>
            <p className="text-sm text-[rgba(255,255,255,.5)] mt-1">Send connection requests and follow-ups to leads automatically.</p>
          </div>
          <button onClick={() => openBuilder()} className="flex items-center gap-2 px-4 py-2.5 bg-[#4f46e5] text-white text-sm font-semibold rounded-xl hover:bg-[#4338ca] transition-colors shrink-0">
            <Plus className="w-4 h-4" /> New sequence
          </button>
        </div>

        {/* Warning */}
        <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Account safety reminder</p>
            <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
              LinkedIn automation carries a risk of account restriction. Keep daily limits under 30, use natural delays, and never scrape private data. HubCredo routes automation through Unipile, which handles humanisation natively.
            </p>
          </div>
        </div>

        {/* LinkedIn Account */}
        <section>
          <h2 className="text-xs font-semibold text-[rgba(255,255,255,.35)] uppercase tracking-widest mb-3">Your LinkedIn account</h2>
          {loading ? (
            <div className="bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] rounded-xl p-6 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-[rgba(255,255,255,.35)]" />
            </div>
          ) : account && account.status === "connected" ? (
            <div className="bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] rounded-xl p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[rgba(99,102,241,.15)] rounded-xl flex items-center justify-center">
                    <Linkedin className="w-5 h-5 text-[#0077B5]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white">{account.profile_name ?? "LinkedIn connected"}</p>
                      <span className="inline-flex items-center gap-1 text-xs bg-[rgba(16,185,129,.1)] text-[#34d399] px-2 py-0.5 rounded-full border border-[rgba(52,211,153,.25)]">
                        <CheckCircle2 className="w-3 h-3" /> Active
                      </span>
                    </div>
                    <p className="text-xs text-[rgba(255,255,255,.5)] mt-0.5">Daily limit: {account.daily_limit} sends · {account.sends_today ?? 0} sent today</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setDailyLimit(account.daily_limit); setShowLimitEditor(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-[rgba(255,255,255,.08)] text-[rgba(255,255,255,.5)] text-xs font-medium rounded-lg hover:bg-[rgba(255,255,255,.04)] transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5" /> Limit
                  </button>
                  <button onClick={handleDisconnect} className="px-3 py-1.5 border border-[rgba(248,113,113,.3)] text-[#f87171] text-xs font-medium rounded-lg hover:bg-[rgba(239,68,68,.1)] transition-colors">
                    Disconnect
                  </button>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-xs text-[rgba(255,255,255,.5)] mb-1.5">
                  <span>Sends today</span><span>{account.sends_today ?? 0} / {account.daily_limit}</span>
                </div>
                <div className="w-full bg-[rgba(255,255,255,.08)] rounded-full h-1.5">
                  <div className="bg-[#0077B5] h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, ((account.sends_today ?? 0) / account.daily_limit) * 100)}%` }} />
                </div>
              </div>
              {showLimitEditor && (
                <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,.08)] space-y-3">
                  <p className="text-sm font-medium text-white">Update daily limit</p>
                  <div className="flex items-center gap-3">
                    <input type="range" min={1} max={30} value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))} className="flex-1 accent-[#0077B5]" />
                    <span className="w-12 text-center text-sm font-bold text-white bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] rounded-lg py-1.5">{dailyLimit}</span>
                  </div>
                  <p className="text-xs text-[rgba(255,255,255,.35)]">We recommend 15 sends/day to stay below LinkedIn's detection threshold.</p>
                  <div className="flex gap-2">
                    <button onClick={handleUpdateLimit} disabled={savingLimit} className="flex items-center gap-1.5 px-4 py-2 bg-[#4f46e5] text-white text-sm font-semibold rounded-lg hover:bg-[#4338ca] transition-colors disabled:opacity-50">
                      {savingLimit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      {savingLimit ? "Saving…" : "Save"}
                    </button>
                    <button onClick={() => setShowLimitEditor(false)} className="px-4 py-2 border border-[rgba(255,255,255,.08)] text-[rgba(255,255,255,.5)] text-sm font-semibold rounded-lg hover:bg-[rgba(255,255,255,.04)] transition-colors">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-[rgba(255,255,255,.04)] rounded-xl flex items-center justify-center shrink-0">
                  <Linkedin className="w-5 h-5 text-[rgba(255,255,255,.35)]" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">No LinkedIn account connected</p>
                  <p className="text-xs text-[rgba(255,255,255,.5)] mt-1 mb-5">Connect your LinkedIn account to start sending automated connection requests and follow-ups.</p>
                  <button
                    onClick={handleConnectLinkedIn}
                    disabled={connecting}
                    className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-60"
                    style={{ backgroundColor: "#0077B5" }}
                    onMouseEnter={(e) => { if (!connecting) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#005e93"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#0077B5"; }}
                  >
                    {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                      </svg>
                    )}
                    {connecting ? "Redirecting to Unipile…" : "Connect LinkedIn"}
                  </button>
                  <p className="text-xs text-[rgba(255,255,255,.35)] mt-3">You'll be securely redirected to connect your LinkedIn account via Unipile.</p>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 border-b border-[rgba(255,255,255,.08)]">
          <button
            onClick={() => { setActiveTab("sequences"); setOpenChat(null); }}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${activeTab === "sequences" ? "border-[#4f46e5] text-[#4f46e5]" : "border-transparent text-[rgba(255,255,255,.5)] hover:text-white"}`}
          >
            Sequences
          </button>
          <button
            onClick={() => { setActiveTab("inbox"); setOpenChat(null); if (inbox.length === 0) loadInbox(); }}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${activeTab === "inbox" ? "border-[#0077B5] text-[#0077B5]" : "border-transparent text-[rgba(255,255,255,.5)] hover:text-white"}`}
          >
            <Mail className="w-3.5 h-3.5" /> LinkedIn Inbox
            {inbox.some((c) => (c.unread_count ?? 0) > 0) && <span className="w-2 h-2 bg-[#0077B5] rounded-full" />}
          </button>
        </div>

        {/* ── INBOX PANEL ── */}
        {activeTab === "inbox" && (
          <section className="pt-2">
            {openChat ? (
              <div className="bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] rounded-2xl overflow-hidden flex flex-col" style={{ height: "560px" }}>
                {/* Chat header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] shrink-0">
                  <button onClick={() => setOpenChat(null)} className="p-1.5 text-[rgba(255,255,255,.5)] hover:text-white hover:bg-[rgba(255,255,255,.08)] rounded-lg transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="w-8 h-8 rounded-full bg-[#0077B5] flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {(openChat.display_name ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{openChat.display_name ?? "Unknown contact"}</p>
                    <p className="text-xs text-[rgba(255,255,255,.35)]">LinkedIn · via Unipile</p>
                  </div>
                  <button onClick={refreshMessages} className="p-1.5 text-[rgba(255,255,255,.5)] hover:text-white hover:bg-[rgba(255,255,255,.08)] rounded-lg transition-colors">
                    <RefreshCcw className={`w-3.5 h-3.5 ${loadingMessages ? "animate-spin" : ""}`} />
                  </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[rgba(255,255,255,.02)]">
                  {loadingMessages ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-[#0077B5]" />
                      <p className="text-xs text-[rgba(255,255,255,.35)]">Loading messages…</p>
                    </div>
                  ) : chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                      <MessageCircle className="w-8 h-8 text-[rgba(255,255,255,.2)]" />
                      <p className="text-sm text-[rgba(255,255,255,.35)]">No messages yet</p>
                    </div>
                  ) : (
                    <>
                      {chatMessages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.is_sender ? "justify-end" : "justify-start"}`}>
                          {!msg.is_sender && (
                            <div className="w-6 h-6 rounded-full bg-[#0077B5] flex items-center justify-center text-white text-[10px] font-bold shrink-0 mr-2 mt-0.5">
                              {(openChat.display_name ?? "?").charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className={`max-w-[72%] flex flex-col gap-0.5 ${msg.is_sender ? "items-end" : "items-start"}`}>
                            <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                              msg.is_sender
                                ? "bg-[#0077B5] text-white rounded-br-sm"
                                : "bg-[rgba(255,255,255,.08)] border border-[rgba(255,255,255,.1)] text-white rounded-bl-sm"
                            }`}>
                              {msg.text ?? <span className="italic opacity-60">📎 Attachment</span>}
                            </div>
                            {msg.timestamp && (
                              <span className="text-[10px] text-[rgba(255,255,255,.35)] px-1">{formatMessageTime(msg.timestamp)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>

                {/* Input */}
                <div className="px-4 py-3 border-t border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] shrink-0">
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={inputRef}
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={handleInputKeyDown}
                      placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                      rows={2}
                      className="flex-1 px-3 py-2.5 text-sm bg-[rgba(255,255,255,.06)] border border-[rgba(255,255,255,.1)] rounded-xl text-white placeholder-[rgba(255,255,255,.3)] focus:outline-none focus:ring-2 focus:ring-[#0077B5]/30 focus:border-[#0077B5] transition-colors resize-none"
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!messageInput.trim() || sendingMessage}
                      className="p-2.5 bg-[#0077B5] text-white rounded-xl hover:bg-[#005e93] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    >
                      {sendingMessage ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizonal className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-[rgba(255,255,255,.25)] mt-1.5 px-1">Sent via Unipile · Delivered to LinkedIn</p>
                </div>
              </div>
            ) : (
              !account ? (
                <div className="bg-[rgba(255,255,255,.04)] border border-dashed border-[rgba(255,255,255,.08)] rounded-xl p-10 text-center">
                  <Linkedin className="w-8 h-8 text-[rgba(255,255,255,.2)] mx-auto mb-3" />
                  <p className="text-sm font-medium text-white">LinkedIn not connected</p>
                  <p className="text-xs text-[rgba(255,255,255,.5)] mt-1">Connect your account above to see your inbox.</p>
                </div>
              ) : loadingInbox ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-[#0077B5]" />
                  <p className="text-xs text-[rgba(255,255,255,.5)]">Loading messages from LinkedIn…</p>
                </div>
              ) : inbox.length === 0 ? (
                <div className="bg-[rgba(255,255,255,.04)] border border-dashed border-[rgba(255,255,255,.08)] rounded-xl p-10 text-center">
                  <Mail className="w-8 h-8 text-[rgba(255,255,255,.2)] mx-auto mb-3" />
                  <p className="text-sm font-medium text-white">No messages yet</p>
                  <p className="text-xs text-[rgba(255,255,255,.5)] mt-1">LinkedIn replies will appear here once your connections start responding.</p>
                  <button onClick={loadInbox} className="mt-4 inline-flex items-center gap-1.5 text-xs text-[#4f46e5] hover:text-[#4338ca] transition-colors">
                    <RefreshCcw className="w-3 h-3" /> Refresh inbox
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-[rgba(255,255,255,.35)]">{inbox.length} conversation{inbox.length !== 1 ? "s" : ""}</p>
                    <button onClick={loadInbox} className="flex items-center gap-1.5 text-xs text-[rgba(255,255,255,.5)] hover:text-white transition-colors">
                      <RefreshCcw className="w-3 h-3" /> Refresh
                    </button>
                  </div>
                  {inbox.map((chat) => {
                    const hasUnread = (chat.unread_count ?? 0) > 0;
                    return (
                      <button
                        key={chat.id}
                        onClick={() => openChatPanel(chat)}
                        className={`w-full text-left bg-[rgba(255,255,255,.04)] border rounded-xl p-4 transition-all hover:shadow-sm hover:border-[#0077B5]/30 ${hasUnread ? "border-[#0077B5]/30 bg-[rgba(0,119,181,.08)]" : "border-[rgba(255,255,255,.08)]"}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#0077B5] flex items-center justify-center text-white text-sm font-bold shrink-0">
                            {(chat.display_name ?? "?").charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-sm truncate ${hasUnread ? "font-semibold text-white" : "font-medium text-white"}`}>
                                {chat.display_name ?? <span className="text-[rgba(255,255,255,.35)] italic font-normal">Unknown contact</span>}
                              </p>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {chat.timestamp && (
                                  <span className={`text-[10px] ${hasUnread ? "text-[#0077B5] font-medium" : "text-[rgba(255,255,255,.35)]"}`}>
                                    {formatTime(chat.timestamp)}
                                  </span>
                                )}
                                {hasUnread && (
                                  <span className="min-w-[18px] h-[18px] bg-[#0077B5] text-white text-[10px] rounded-full flex items-center justify-center font-bold px-1">
                                    {chat.unread_count}
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className={`text-xs mt-0.5 truncate ${hasUnread ? "text-[rgba(255,255,255,.7)]" : "text-[rgba(255,255,255,.5)]"}`}>
                              {chat.last_message_sender_is_me && <span className="text-[rgba(255,255,255,.35)]">You: </span>}
                              {chat.last_message_text ?? <span className="text-[rgba(255,255,255,.25)] italic">Tap to open</span>}
                            </p>
                          </div>
                          <MessageCircle className="w-4 h-4 text-[rgba(255,255,255,.2)] shrink-0" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )
            )}
          </section>
        )}

        {/* ── SEQUENCES ── */}
        {activeTab === "sequences" && (
          <section>
            <h2 className="text-xs font-semibold text-[rgba(255,255,255,.35)] uppercase tracking-widest mb-3 pt-4">Sequences</h2>
            {sequences.length === 0 ? (
              <div className="bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] border-dashed rounded-xl p-10 flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 bg-[rgba(255,255,255,.04)] rounded-2xl flex items-center justify-center"><Send className="w-5 h-5 text-[rgba(255,255,255,.35)]" /></div>
                <p className="text-sm font-semibold text-white">No sequences yet</p>
                <p className="text-xs text-[rgba(255,255,255,.5)] max-w-xs">Create a sequence with a connection request template and optional follow-up message.</p>
                <button onClick={() => openBuilder()} className="mt-1 flex items-center gap-2 px-4 py-2.5 bg-[#4f46e5] text-white text-sm font-semibold rounded-xl hover:bg-[#4338ca] transition-colors">
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
                    <div key={seq.id} className="bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] rounded-xl overflow-hidden">
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm font-semibold text-white">{seq.name}</h3>
                              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${seq.is_active ? "bg-[rgba(16,185,129,.1)] text-[#34d399] border-[rgba(52,211,153,.25)]" : "bg-[rgba(255,255,255,.04)] text-[rgba(255,255,255,.5)] border-[rgba(255,255,255,.08)]"}`}>
                                {seq.is_active ? "Active" : "Inactive"}
                              </span>
                            </div>
                            {seq.lead_lists && (
                              <p className="text-xs text-[rgba(255,255,255,.5)] mt-1 flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5" />{seq.lead_lists.label}
                              </p>
                            )}
                            <p className="text-xs text-[rgba(255,255,255,.35)] mt-1.5 line-clamp-2">{seq.connection_message}</p>
                            <div className="flex flex-wrap gap-3 mt-2">
                              <span className="text-xs text-[rgba(255,255,255,.5)] flex items-center gap-1"><Send className="w-3 h-3" /> {seq.daily_limit}/day limit</span>
                              {seq.followup_message && (
                                <span className="text-xs text-[rgba(255,255,255,.5)] flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Follow-up in {seq.followup_delay_days}d</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {!seq.is_active ? (
                              <div className="flex flex-col items-end gap-1">
                                <button onClick={() => handleLaunch(seq)} disabled={launchingId === seq.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0077B5] text-white text-xs font-semibold rounded-lg hover:bg-[#005e93] transition-colors disabled:opacity-50">
                                  {launchingId === seq.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Launch
                                </button>
                                <span className="text-[10px] text-[rgba(255,255,255,.35)] flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" /> 1 cr/send</span>
                              </div>
                            ) : (
                              <button onClick={() => handlePause(seq)} disabled={pausingId === seq.id} className="flex items-center gap-1.5 px-3 py-1.5 border border-[rgba(255,255,255,.08)] text-[rgba(255,255,255,.5)] text-xs font-medium rounded-lg hover:bg-[rgba(255,255,255,.04)] transition-colors disabled:opacity-50">
                                {pausingId === seq.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />} Pause
                              </button>
                            )}
                            <button onClick={() => openBuilder(seq)} className="p-1.5 text-[rgba(255,255,255,.35)] hover:text-white hover:bg-[rgba(255,255,255,.08)] rounded-lg transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDelete(seq.id)} disabled={deletingId === seq.id} className="p-1.5 text-[rgba(255,255,255,.35)] hover:text-red-500 hover:bg-[rgba(239,68,68,.1)] rounded-lg transition-colors disabled:opacity-50">
                              {deletingId === seq.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* ✅ FIXED: Analytics toggle button — was bg-[#F8FAFC] (white) on dark UI */}
                      <button
                        onClick={() => toggleAnalytics(seq.id)}
                        className="w-full flex items-center justify-between px-5 py-2.5 bg-[rgba(255,255,255,.03)] border-t border-[rgba(255,255,255,.08)] text-xs font-medium text-[rgba(255,255,255,.5)] hover:bg-[rgba(255,255,255,.06)] hover:text-white transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <BarChart2 className="w-3.5 h-3.5 text-[#4f46e5]" /> Analytics
                        </span>
                        {isLoadingA ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      {/* ✅ FIXED: Analytics expanded panel — was bg-[#F8FAFC] (white), now fully dark */}
                      {isExpanded && (
                        <div className="px-5 py-4 border-t border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.02)]">
                          {isLoadingA ? (
                            <div className="flex justify-center py-4">
                              <Loader2 className="w-5 h-5 animate-spin text-[rgba(255,255,255,.35)]" />
                            </div>
                          ) : analytics ? (
                            <div className="space-y-4">
                              {/* Stat cards */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                  { label: "Contacted", value: analytics.total_contacted, icon: <Send className="w-3.5 h-3.5 text-[rgba(255,255,255,.5)]" />, color: "text-white", sub: undefined },
                                  { label: "Connected", value: analytics.connected, icon: <UserCheck className="w-3.5 h-3.5 text-[#0077B5]" />, color: "text-[#0077B5]", sub: analytics.total_contacted > 0 ? `${getAcceptanceRate(analytics)}% rate` : undefined },
                                  { label: "Replied", value: analytics.replied, icon: <MessageCircle className="w-3.5 h-3.5 text-[#34d399]" />, color: "text-[#34d399]", sub: analytics.connected > 0 ? `${getReplyRate(analytics)}% rate` : undefined },
                                  { label: "Follow-ups", value: analytics.followups_pending, icon: <Clock className="w-3.5 h-3.5 text-amber-400" />, color: "text-amber-400", sub: `${analytics.followups_sent} sent` },
                                ].map((stat) => (
                                  <div key={stat.label} className="bg-[rgba(255,255,255,.05)] rounded-xl border border-[rgba(255,255,255,.08)] p-3">
                                    <div className="flex items-center gap-1.5 mb-1">{stat.icon}<span className="text-xs text-[rgba(255,255,255,.5)]">{stat.label}</span></div>
                                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                                    {stat.sub && <p className="text-xs text-[rgba(255,255,255,.35)] mt-0.5">{stat.sub}</p>}
                                  </div>
                                ))}
                              </div>

                              {/* Funnel */}
                              {analytics.total_contacted > 0 && (
                                <div className="bg-[rgba(255,255,255,.05)] rounded-xl border border-[rgba(255,255,255,.08)] p-4">
                                  <p className="text-xs font-semibold text-white mb-3">Funnel</p>
                                  <div className="space-y-2.5">
                                    {[
                                      { label: "Contacted", value: analytics.total_contacted, pct: 100, color: "bg-[rgba(255,255,255,.3)]", textColor: "text-[rgba(255,255,255,.5)]" },
                                      { label: "Connected", value: analytics.connected, pct: getAcceptanceRate(analytics), color: "bg-[#0077B5]", textColor: "text-[#0077B5]" },
                                      { label: "Replied", value: analytics.replied, pct: analytics.total_contacted > 0 ? Math.round((analytics.replied / analytics.total_contacted) * 100) : 0, color: "bg-[#34d399]", textColor: "text-[#34d399]" },
                                    ].map((bar) => (
                                      <div key={bar.label}>
                                        <div className={`flex justify-between text-xs ${bar.textColor} mb-1`}>
                                          <span>{bar.label}</span><span>{bar.value}{bar.pct !== 100 ? ` (${bar.pct}%)` : ""}</span>
                                        </div>
                                        <div className="w-full bg-[rgba(255,255,255,.08)] rounded-full h-2">
                                          <div className={`${bar.color} h-2 rounded-full transition-all`} style={{ width: `${bar.pct}%` }} />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="flex items-center gap-3 pt-1">
                                <button onClick={() => loadAnalytics(seq.id)} className="text-xs text-[#4f46e5] hover:text-[#818cf8] transition-colors">Refresh analytics</button>
                                <button onClick={() => refreshAnalyticsFromLinkedIn(seq.id)} disabled={refreshingAnalytics[seq.id]} className="flex items-center gap-1 text-xs text-[#0077B5] hover:text-[#38bdf8] transition-colors disabled:opacity-50">
                                  {refreshingAnalytics[seq.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />} Sync from LinkedIn
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-[rgba(255,255,255,.35)] text-center py-4">No analytics data yet. Launch the sequence first.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      {/* ── Sequence builder modal ── */}
      {showBuilder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-[#12121f] border border-[rgba(255,255,255,.08)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#12121f] border-b border-[rgba(255,255,255,.08)] px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-base font-bold text-white">{editingSeq ? "Edit sequence" : "New sequence"}</h2>
              <button onClick={() => setShowBuilder(false)} className="p-1.5 text-[rgba(255,255,255,.35)] hover:text-white hover:bg-[rgba(255,255,255,.08)] rounded-lg transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Sequence name</label>
                <input value={seqName} onChange={(e) => setSeqName(e.target.value)} placeholder="My LinkedIn Sequence" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Lead list</label>
                <select value={seqListId} onChange={(e) => setSeqListId(e.target.value)} className={inputClass}>
                  <option value="">No list selected</option>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-white">
                    Connection request message <span className="text-[rgba(255,255,255,.35)] font-normal">(max 300 chars)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button onClick={handlePrefill} disabled={prefilling} className="flex items-center gap-1 text-xs text-[#4f46e5] hover:text-[#818cf8] transition-colors disabled:opacity-50">
                      {prefilling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} AI fill
                    </button>
                    <div className="relative">
                      <button onClick={() => setShowTemplates(!showTemplates)} className="flex items-center gap-1 text-xs text-[rgba(255,255,255,.5)] hover:text-white transition-colors">
                        <FileText className="w-3 h-3" /> Templates
                      </button>
                      {showTemplates && (
                        <div className="absolute right-0 top-6 z-20 bg-[#1a1a2e] border border-[rgba(255,255,255,.1)] rounded-xl shadow-lg w-72 p-1.5">
                          {LINKEDIN_TEMPLATES.map((t, i) => (
                            <button key={i} onClick={() => { setConnMsg(t.connection_message); if (t.followup_message) setFollowupMsg(t.followup_message); setShowTemplates(false); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-[rgba(255,255,255,.08)] transition-colors">
                              <p className="text-xs font-semibold text-white">{t.name}</p>
                              <p className="text-xs text-[rgba(255,255,255,.5)] truncate mt-0.5">{t.connection_message.slice(0, 65)}…</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <textarea value={connMsg} onChange={(e) => setConnMsg(e.target.value)} placeholder="Hi {{firstName}}, I noticed you work in… Open to connecting?" rows={4} maxLength={300} className={`${inputClass} resize-none`} />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-[rgba(255,255,255,.35)]">Use {"{{firstName}}"} as a personalisation token.</p>
                  <span className={`text-xs ${connMsg.length > 280 ? "text-amber-400" : "text-[rgba(255,255,255,.35)]"}`}>{connMsg.length}/300</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Follow-up message <span className="text-[rgba(255,255,255,.35)] font-normal">(optional)</span></label>
                <textarea value={followupMsg} onChange={(e) => setFollowupMsg(e.target.value)} placeholder="Hey {{firstName}}, thanks for connecting! …" rows={3} className={`${inputClass} resize-none`} />
              </div>
              {followupMsg.trim() && (
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">
                    Send follow-up after <span className="text-[#4f46e5] font-bold">{followupDelay} day{followupDelay !== 1 ? "s" : ""}</span>
                  </label>
                  <input type="range" min={1} max={14} value={followupDelay} onChange={(e) => setFollowupDelay(Number(e.target.value))} className="w-full accent-[#4f46e5]" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Sequence daily limit <span className="text-[rgba(255,255,255,.35)] font-normal">(max 30)</span></label>
                <div className="flex items-center gap-3">
                  <input type="range" min={1} max={30} value={seqDailyLimit} onChange={(e) => setSeqDailyLimit(Number(e.target.value))} className="flex-1 accent-[#4f46e5]" />
                  <span className="w-12 text-center text-sm font-bold text-white bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] rounded-lg py-1.5">{seqDailyLimit}</span>
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-[#12121f] border-t border-[rgba(255,255,255,.08)] px-6 py-4 flex gap-3 rounded-b-2xl">
              <button onClick={handleSaveSeq} disabled={savingSeq} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#4f46e5] text-white text-sm font-semibold rounded-xl hover:bg-[#4338ca] transition-colors disabled:opacity-50">
                {savingSeq ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {savingSeq ? "Saving…" : editingSeq ? "Update sequence" : "Create sequence"}
              </button>
              <button onClick={() => setShowBuilder(false)} className="px-5 py-2.5 border border-[rgba(255,255,255,.08)] text-[rgba(255,255,255,.5)] text-sm font-semibold rounded-xl hover:bg-[rgba(255,255,255,.04)] transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}