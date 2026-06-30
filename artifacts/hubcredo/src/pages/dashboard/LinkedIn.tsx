import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import { useGetMe, useListLeadLists } from "@workspace/api-client-react";
import {
  Linkedin, CheckCircle2, Loader2, Plus, Pencil, Trash2, Play, Pause,
  Sparkles, X, ShieldAlert, Users, Send, MessageSquare, Settings,
  BarChart2, UserCheck, MessageCircle, Clock, ChevronDown, ChevronUp,
  Zap, Mail, RefreshCcw, FileText, ArrowLeft, SendHorizonal, RefreshCw,
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
  attachments?: unknown[];
}

interface ReplySeq {
  id: number;
  name: string;
  status: "active" | "paused" | "stopped";
  isArchived: boolean;
}

interface ReplyContact {
  email: string;
  firstName: string;
  lastName: string;
  status: {
    status: string;
    replied: boolean;
    delivered: boolean;
    opened: boolean;
    clicked: boolean;
    bounced: boolean;
  };
}

interface ReplyStats {
  total: number;
  active: number;
  replied: number;
  opened: number;
  bounced: number;
}

interface ReplyLIStats {
  totalPeopleContacted: number;
  connectionsSent: number;
  acceptedAutomatedConnections: number;
  automatedConnectionsConversionRate: number;
  messagesSent: number;
  replies: number;
  repliesConversionRate: number;
}

// FIX: threadId is the v3 inbox thread ID — used for messages & reply API calls.
// personId is the contact ID (display only, may be null for deleted contacts).
interface ReplyLIThread {
  threadId: number;
  personId: number | null;
  name: string;
  email?: string | null;
  linkedInUrl?: string | null;
  sequenceId?: number | null;
  sequenceName?: string | null;
  channel?: string;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  unreadCount?: number;
  status?: string | null;
  category?: string | null;
}

interface ReplyLIMessage {
  id?: string | number;
  text: string;
  isOutgoing: boolean;
  sentAt: string;
  fromName?: string | null;
}

interface ReplyLIAccount {
  connected: boolean;
  profile_name?: string | null;
  email?: string | null;
  subscription?: string | null;
  account_id?: string | null;
  profile_url?: string | null;
  photo_url?: string | null;
  status?: string | null;
  cookie_status?: string | null;
  reason?: string;
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

  const [replyMode, setReplyMode] = useState(false);
  const [replyConnected, setReplyConnected] = useState(false);
  const [replySeqs, setReplySeqs] = useState<ReplySeq[]>([]);
  const [replySeqsLoading, setReplySeqsLoading] = useState(false);
  const [replySelectedId, setReplySelectedId] = useState<number | null>(null);
  const [replyContacts, setReplyContacts] = useState<ReplyContact[]>([]);
  const [replyStats, setReplyStats] = useState<ReplyStats | null>(null);
  const [replyDetailLoading, setReplyDetailLoading] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollSeqId, setEnrollSeqId] = useState<number | null>(null);
  const [enrollEmail, setEnrollEmail] = useState("");
  const [enrollFirst, setEnrollFirst] = useState("");
  const [enrollLast, setEnrollLast] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [replyLIAccount, setReplyLIAccount] = useState<ReplyLIAccount | null>(null);
  const [replyLIAccountLoading, setReplyLIAccountLoading] = useState(false);
  const [replyLIWizard, setReplyLIWizard] = useState(false);
  const [replyLIName, setReplyLIName] = useState("");
  const [replyLIConnMsg, setReplyLIConnMsg] = useState("");
  const [replyLIFollowup, setReplyLIFollowup] = useState("");
  const [replyLIFollowupDelay, setReplyLIFollowupDelay] = useState(3);
  const [replyLICreating, setReplyLICreating] = useState(false);
  const [replyLIActivatingId, setReplyLIActivatingId] = useState<number | null>(null);
  const [replyLIPausingId, setReplyLIPausingId] = useState<number | null>(null);
  const [replyLIDeletingId, setReplyLIDeletingId] = useState<number | null>(null);
  const [replyLIDeleteConfirmId, setReplyLIDeleteConfirmId] = useState<number | null>(null);
  const [replyLIEnrollListId, setReplyLIEnrollListId] = useState("");
  const [replyLIEnrollingList, setReplyLIEnrollingList] = useState(false);
  const [replyLIStats, setReplyLIStats] = useState<ReplyLIStats | null>(null);
  const [replyLIInbox, setReplyLIInbox] = useState<ReplyLIThread[]>([]);
  const [replyLIInboxLoading, setReplyLIInboxLoading] = useState(false);
  const [replyLIOpenThread, setReplyLIOpenThread] = useState<ReplyLIThread | null>(null);
  const [replyLIMessages, setReplyLIMessages] = useState<ReplyLIMessage[]>([]);
  const [replyLIMessagesLoading, setReplyLIMessagesLoading] = useState(false);
  const [replyLIMessageInput, setReplyLIMessageInput] = useState("");
  const [replyLISending, setReplyLISending] = useState(false);
  const replyLIMessagesEndRef = useRef<HTMLDivElement>(null);



const [liLaunchModalOpen, setLiLaunchModalOpen] = useState(false);
const [liLaunchSeqId, setLiLaunchSeqId] = useState<number | null>(null);
const [liLaunchEmailsPerDay, setLiLaunchEmailsPerDay] = useState<number>(30);
const [liLaunchListId, setLiLaunchListId] = useState<string>("");
const [liLaunching, setLiLaunching] = useState(false);

  const LINKEDIN_TEMPLATES = [
    { name: "Cold outreach", connection_message: "Hi {{firstName}}, I help B2B companies build reliable sales infrastructure. Thought we'd connect well — open to it?", followup_message: "Hey {{firstName}}, thanks for connecting! I work with founders to set up scalable outbound. Worth a quick 15-min chat?" },
    { name: "Value-first", connection_message: "Hi {{firstName}}, I noticed your profile and wanted to connect — I share insights on outbound strategy relevant to your space.", followup_message: "Hey {{firstName}}, great to connect! Are you exploring ways to scale your pipeline? Happy to share what's been working." },
    { name: "Direct ask", connection_message: "Hi {{firstName}}, I help companies like yours improve outbound results 2-3x. Would love to connect and see if there's a fit.", followup_message: "" },
    { name: "Industry peer", connection_message: "Hi {{firstName}}, we're both in the B2B space and I'd love to stay connected. I work on GTM infrastructure and outreach automation.", followup_message: "Hey {{firstName}}, great to be connected! Would you be open to a 15-min call to explore if what I do could help your team?" },
  ];

  useEffect(() => {
    fetch(apiUrl("/replyio/validate"), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setReplyConnected(d.valid))
      .catch(() => setReplyConnected(false));
  }, []);

  useEffect(() => {
    if (!replyConnected) return;
    setReplyLIAccountLoading(true);
    fetch(apiUrl("/replyio/linkedin-account"), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d: ReplyLIAccount) => setReplyLIAccount(d))
      .catch(() => setReplyLIAccount({ connected: false }))
      .finally(() => setReplyLIAccountLoading(false));
  }, [replyConnected]);

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
    if (chatMessages.length > 0) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (replyLIMessages.length > 0) replyLIMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replyLIMessages]);

  async function loadReplySeqs() {
    setReplySeqsLoading(true);
    try {
      const res = await fetch(apiUrl("/replyio/sequences"), { headers: authHeaders() });
      const data = await res.json();
      setReplySeqs((data.sequences || []).filter((s: ReplySeq) => !s.isArchived));
    } catch {
      toast({ title: "Failed to load Reply.io sequences", variant: "destructive" });
    } finally {
      setReplySeqsLoading(false);
    }
  }

  async function loadReplyDetail(id: number) {
    setReplySelectedId(id);
    setReplyDetailLoading(true);
    setReplyLIStats(null);
    try {
      const [cRes, sRes] = await Promise.all([
        fetch(apiUrl(`/replyio/sequences/${id}/contacts`), { headers: authHeaders() }),
        fetch(apiUrl(`/replyio-linkedin/sequences/${id}/li-stats`), { headers: authHeaders() }),
      ]);
      if (cRes.ok) setReplyContacts((await cRes.json()).contacts ?? []);
      if (sRes.ok) {
        const li = await sRes.json() as ReplyLIStats;
        setReplyLIStats(li);
        setReplyStats({ total: li.totalPeopleContacted, active: 0, replied: li.replies, opened: 0, bounced: 0 });
      }
    } finally {
      setReplyDetailLoading(false);
    }
  }

  async function handleEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!enrollSeqId || !enrollEmail.trim()) return;
    setEnrolling(true);
    try {
      const res = await fetch(apiUrl("/replyio/enroll"), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          contact: { email: enrollEmail.trim(), firstName: enrollFirst || undefined, lastName: enrollLast || undefined },
          sequenceId: enrollSeqId,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Contact enrolled!", description: `${enrollEmail} added to Reply.io sequence.` });
      setEnrollOpen(false);
      setEnrollEmail(""); setEnrollFirst(""); setEnrollLast("");
      if (replySelectedId === enrollSeqId) loadReplyDetail(enrollSeqId);
    } catch (err: unknown) {
      toast({ title: "Enroll failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setEnrolling(false);
    }
  }

  function handleToggleReplyMode(on: boolean) {
    setReplyMode(on);
    if (on && replySeqs.length === 0) loadReplySeqs();
  }

  function resetLIWizard() {
    setReplyLIName(""); setReplyLIConnMsg(""); setReplyLIFollowup("");
    setReplyLIFollowupDelay(3); setReplyLIEnrollListId("");
  }

  async function handleCreateReplyLISeq() {
    if (!replyLIName.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    setReplyLICreating(true);
    try {
      const steps = [
        { type: "linkedin", delay_days: 0, body: replyLIConnMsg.trim() }, // body can be "" — empty connect note is fine
        ...(replyLIFollowup.trim() ? [{ type: "linkedin", delay_days: replyLIFollowupDelay, body: replyLIFollowup.trim() }] : []),
      ];
      const res = await fetch(apiUrl("/replyio-linkedin/sequences/create"), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: replyLIName.trim(),
          steps,
          ...(replyLIEnrollListId ? { lead_list_id: replyLIEnrollListId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok && data.code === "STEPS_FAILED") {
        toast({ title: "LinkedIn account not linked in Reply.io", description: "Go to Reply.io → Settings → LinkedIn Accounts and connect your account first, then create the sequence again.", variant: "destructive" });
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Failed to create sequence");
      if (res.status === 207 && data.enrollError) {
        toast({ title: `Sequence "${data.name}" created`, description: data.enrollCode === "NO_STEPS" ? "Add a LinkedIn step in Reply.io, then enroll leads manually." : `Enroll skipped: ${data.enrollError}`, variant: "destructive" });
        setReplyLIWizard(false); resetLIWizard(); loadReplySeqs();
        return;
      }
      if (data.enrolled > 0) {
        toast({ title: "Sequence created! 🎉", description: `Enrolled ${data.enrolled} of ${data.total} leads.` });
      } else if (replyLIEnrollListId) {
        toast({ title: `Sequence "${data.name}" created`, description: "0 leads enrolled — ensure your leads have emails populated.", variant: "destructive" });
      } else {
        toast({ title: "Sequence created!", description: `"${data.name}" is ready in Reply.io.` });
      }
      setReplyLIWizard(false); resetLIWizard(); loadReplySeqs();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not create sequence", variant: "destructive" });
    } finally {
      setReplyLICreating(false);
    }
  }
  function openLiLaunchModal(id: number) {
  setLiLaunchSeqId(id);
  setLiLaunchEmailsPerDay(30);
  setLiLaunchListId("");
  setLiLaunchModalOpen(true);
}

async function handleConfirmLiLaunch() {
  if (!liLaunchSeqId) return;
  setLiLaunching(true);
  try {
    // Step 1: update connections/day limit via settings PATCH
    const settingsRes = await fetch(apiUrl(`/replyio-linkedin/sequences/${liLaunchSeqId}/settings`), {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ emailsCountPerDay: liLaunchEmailsPerDay }),
    });
    if (!settingsRes.ok) {
      const d = await settingsRes.json();
      throw new Error(d.error ?? "Failed to update daily limit");
    }

    // Step 2: activate (enroll leads if selected + start sequence)
    const res = await fetch(apiUrl(`/replyio-linkedin/sequences/${liLaunchSeqId}/activate`), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        lead_list_id: liLaunchListId || undefined,
      }),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
    setReplySeqs((prev) => prev.map((s) => s.id === liLaunchSeqId ? { ...s, status: "active" } : s));
    toast({
      title: "Sequence activated! 🚀",
      description: liLaunchListId
        ? `LinkedIn outreach started · ${liLaunchEmailsPerDay} actions/day`
        : `Sequence is now active · ${liLaunchEmailsPerDay} actions/day`,
    });
    setLiLaunchModalOpen(false);
  } catch (err) {
    toast({ title: "Activation failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
  } finally {
    setLiLaunching(false);
  }
}
  async function handlePauseLIReply(id: number) {
    setReplyLIPausingId(id);
    try {
      const res = await fetch(apiUrl(`/replyio/sequences/${id}/pause-seq`), { method: "POST", headers: authHeaders() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setReplySeqs((prev) => prev.map((s) => s.id === id ? { ...s, status: "paused" } : s));
      toast({ title: "Sequence paused." });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setReplyLIPausingId(null);
    }
  }

  async function handleDeleteLIReplySeq(id: number) {
    setReplyLIDeletingId(id);
    try {
      const res = await fetch(apiUrl(`/replyio/sequences/${id}`), { method: "DELETE", headers: authHeaders() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setReplySeqs((prev) => prev.filter((s) => s.id !== id));
      if (replySelectedId === id) { setReplySelectedId(null); setReplyContacts([]); setReplyStats(null); setReplyLIStats(null); }
      setReplyLIDeleteConfirmId(null);
      toast({ title: "Sequence deleted." });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setReplyLIDeletingId(null);
    }
  }

  async function handleEnrollListLI(seqId: number, listId: string) {
    if (!listId) { toast({ title: "Select a lead list first", variant: "destructive" }); return; }
    setReplyLIEnrollingList(true);
    try {
      const res = await fetch(apiUrl(`/replyio-linkedin/sequences/${seqId}/enroll-list`), {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ lead_list_id: listId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.enrolled === 0) {
        toast({ title: "0 leads enrolled", description: "Leads need a LinkedIn URL to join LinkedIn sequences. Ensure your leads have linkedin_url populated.", variant: "destructive" });
      } else {
        toast({ title: "Leads enrolled!", description: `${data.enrolled} of ${data.total} contacts added.` });
      }
      if (replySelectedId === seqId) loadReplyDetail(seqId);
    } catch (err) {
      toast({ title: "Enroll failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setReplyLIEnrollingList(false);
    }
  }

  // ── Reply.io LinkedIn Inbox functions ─────────────────────
  // FIX: All inbox API calls now use threadId (v3 inbox thread ID),
  // not personId (contact ID). The backend returns threadId in the
  // normalised thread object from GET /v3/inbox/threads.

  async function loadReplyLIInbox(seqId?: number) {
    setReplyLIInboxLoading(true);
    try {
      const qs = seqId ? `?sequenceId=${seqId}` : "";
      const res = await fetch(apiUrl(`/replyio-linkedin/inbox${qs}`), { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setReplyLIInbox(data.threads ?? []);
      } else {
        toast({ title: "Failed to load LinkedIn inbox", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to load LinkedIn inbox", variant: "destructive" });
    } finally {
      setReplyLIInboxLoading(false);
    }
  }

  // FIX: use thread.threadId (v3 thread ID) for the messages API call
  async function openReplyLIThread(thread: ReplyLIThread) {
    setReplyLIOpenThread(thread);
    setReplyLIMessages([]);
    setReplyLIMessageInput("");
    setReplyLIMessagesLoading(true);
    try {
      const res = await fetch(
        apiUrl(`/replyio-linkedin/inbox/${thread.threadId}/messages`), // ← threadId not personId
        { headers: authHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setReplyLIMessages(data.messages ?? []);
      } else {
        toast({ title: "Failed to load messages", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to load messages", variant: "destructive" });
    } finally {
      setReplyLIMessagesLoading(false);
    }
  }

  // FIX: use replyLIOpenThread.threadId for refresh
  async function refreshReplyLIMessages() {
    if (!replyLIOpenThread) return;
    setReplyLIMessagesLoading(true);
    try {
      const res = await fetch(
        apiUrl(`/replyio-linkedin/inbox/${replyLIOpenThread.threadId}/messages`), // ← threadId
        { headers: authHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setReplyLIMessages(data.messages ?? []);
      }
    } finally {
      setReplyLIMessagesLoading(false);
    }
  }

  // FIX: use thread.threadId for reply URL; body is { channel, message }
  async function handleReplyLISendMessage() {
    if (!replyLIOpenThread || !replyLIMessageInput.trim() || replyLISending) return;
    const text = replyLIMessageInput.trim();
    setReplyLIMessageInput("");
    setReplyLISending(true);
    const optimistic: ReplyLIMessage = {
      id: `opt-${Date.now()}`,
      text,
      isOutgoing: true,
      sentAt: new Date().toISOString(),
    };
    setReplyLIMessages((prev) => [...prev, optimistic]);
    try {
      const res = await fetch(
        apiUrl(`/replyio-linkedin/inbox/${replyLIOpenThread.threadId}/reply`), // ← threadId
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            channel: replyLIOpenThread.channel ?? "linkedIn", // ← channel, not sequenceId
            message: text,
          }),
        }
      );
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to send");
      }
      // Update inbox list preview using threadId as the key
      setReplyLIInbox((prev) =>
        prev.map((t) =>
          t.threadId === replyLIOpenThread.threadId // ← match on threadId
            ? { ...t, lastMessage: text, lastMessageAt: new Date().toISOString() }
            : t
        )
      );
    } catch (err) {
      setReplyLIMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setReplyLIMessageInput(text);
      toast({ title: "Failed to send message", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setReplyLISending(false);
    }
  }

  function formatReplyLITime(ts: string | null | undefined): string {
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

  async function loadAnalytics(seqId: string) {
    setLoadingAnalytics((prev) => ({ ...prev, [seqId]: true }));
    try {
      const res = await fetch(apiUrl(`/linkedin/sequences/${seqId}/analytics`), { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAnalyticsMap((prev) => ({ ...prev, [seqId]: data }));
      }
    } catch { }
    finally { setLoadingAnalytics((prev) => ({ ...prev, [seqId]: false })); }
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
      if (res.ok) { const data = await res.json(); setInbox(data.chats || []); }
      else { toast({ title: "Failed to load inbox", variant: "destructive" }); }
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
        setChatMessages((data.messages || []).filter((m: ChatMessage) => !m.hidden && !m.is_event));
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
    const optimisticMsg: ChatMessage = { id: `optimistic-${Date.now()}`, text, is_sender: true, timestamp: new Date().toISOString() };
    setChatMessages((prev) => [...prev, optimisticMsg]);
    try {
      const res = await fetch(apiUrl(`/linkedin/inbox/${openChat.id}/messages`), {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ text }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to send"); }
      setInbox((prev) => prev.map((c) => c.id === openChat.id ? { ...c, last_message_text: text, last_message_sender_is_me: true, timestamp: new Date().toISOString() } : c));
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
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
  }

  async function refreshAnalyticsFromLinkedIn(seqId: string) {
    setRefreshingAnalytics((prev) => ({ ...prev, [seqId]: true }));
    try {
      const res = await fetch(apiUrl(`/linkedin/analytics/${seqId}/refresh`), { method: "POST", headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.analytics) setAnalyticsMap((prev) => ({ ...prev, [seqId]: { ...prev[seqId], ...data.analytics } }));
        toast({ title: `Synced ${data.synced} update${data.synced !== 1 ? "s" : ""} from LinkedIn`, description: data.synced === 0 ? "No new connections or replies detected." : undefined });
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
      toast({ title: "Outreach launched!", description: `${d.leads_queued} connection requests sent. ${d.sends_today}/${d.daily_limit} today.${d.skipped ? ` ${d.skipped} skipped.` : ""}${!d.via_unipile ? " (Simulation mode)" : ""}` });
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

  const inputClass = "w-full px-3 py-2.5 text-sm bg-white border border-[rgba(107,78,255,0.2)] rounded-lg text-[#1E1B4B] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[rgba(107,78,255,0.15)] focus:border-[#6B4EFF] transition-colors";
  const lists = leadLists as LeadList[];
  const replySelectedSeq = replySeqs.find((s) => s.id === replySelectedId);

  function renderAccountSection() {
    if (loading) {
      return (
        <div className="bg-white border border-[rgba(107,78,255,0.15)] rounded-xl p-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[#6B4EFF]" />
        </div>
      );
    }

    if (replyMode) {
      if (replyLIAccountLoading) {
        return (
          <div className="bg-white border border-[rgba(107,78,255,0.15)] rounded-xl p-6 flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-[#6B4EFF]" />
            <span className="text-sm text-[#6B7280]">Fetching LinkedIn account from Reply.io…</span>
          </div>
        );
      }
      if (replyLIAccount?.connected) {
        return (
          <div className="bg-white border border-[rgba(107,78,255,0.15)] rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#F5F3FF] rounded-xl flex items-center justify-center shrink-0">
                <Linkedin className="w-5 h-5 text-[#6B4EFF]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-[#1E1B4B]">{replyLIAccount.profile_name ?? "LinkedIn account"}</p>
                  <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3" /> Active via Reply.io
                  </span>
                  {replyLIAccount.subscription && (
                    <span className="text-xs bg-[#F5F3FF] text-[#6B4EFF] px-2 py-0.5 rounded-full border border-[rgba(107,78,255,0.2)] font-medium">
                      {replyLIAccount.subscription}
                    </span>
                  )}
                </div>
                {replyLIAccount.email && <p className="text-xs text-[#6B7280] mt-0.5">{replyLIAccount.email}</p>}
                <p className="text-xs text-[#9CA3AF] mt-0.5">LinkedIn steps are handled automatically by Reply.io</p>
              </div>
              <a href="https://app.reply.io/settings/linkedin-accounts" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 border border-[rgba(107,78,255,0.2)] text-[#6B4EFF] text-xs font-medium rounded-lg hover:bg-[#F5F3FF] transition-colors shrink-0">
                <Settings className="w-3.5 h-3.5" /> Manage
              </a>
            </div>
          </div>
        );
      }
      return (
        <div className="bg-white border border-[rgba(107,78,255,0.15)] rounded-xl p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
              <Linkedin className="w-5 h-5 text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#1E1B4B]">No LinkedIn account in Reply.io</p>
              <p className="text-xs text-[#6B7280] mt-1 mb-4">You need to add a LinkedIn account in Reply.io settings before you can send LinkedIn sequences.</p>
              <a href="https://app.reply.io/settings/linkedin-accounts" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 text-white text-xs font-semibold rounded-lg transition-colors"
                style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
                <Settings className="w-3.5 h-3.5" /> Add LinkedIn account
              </a>
            </div>
          </div>
        </div>
      );
    }

    if (account && account.status === "connected") {
      return (
        <div className="bg-white border border-[rgba(107,78,255,0.15)] rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#F5F3FF] rounded-xl flex items-center justify-center">
                <Linkedin className="w-5 h-5 text-[#6B4EFF]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-[#1E1B4B]">{account.profile_name ?? "LinkedIn connected"}</p>
                  <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3" /> Active
                  </span>
                </div>
                <p className="text-xs text-[#6B7280] mt-0.5">Daily limit: {account.daily_limit} sends · {account.sends_today ?? 0} sent today</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setDailyLimit(account.daily_limit); setShowLimitEditor(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-[rgba(107,78,255,0.2)] text-[#6B4EFF] text-xs font-medium rounded-lg hover:bg-[#F5F3FF] transition-colors">
                <Settings className="w-3.5 h-3.5" /> Limit
              </button>
              <button onClick={handleDisconnect} className="px-3 py-1.5 border border-red-200 text-red-500 text-xs font-medium rounded-lg hover:bg-red-50 transition-colors">
                Disconnect
              </button>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-[#6B7280] mb-1.5">
              <span>Sends today</span><span>{account.sends_today ?? 0} / {account.daily_limit}</span>
            </div>
            <div className="w-full bg-[#F5F3FF] rounded-full h-1.5">
              <div className="h-1.5 rounded-full transition-all"
                style={{ width: `${Math.min(100, ((account.sends_today ?? 0) / account.daily_limit) * 100)}%`, background: "linear-gradient(90deg, #6B4EFF, #8B5CF6)" }} />
            </div>
          </div>
          {showLimitEditor && (
            <div className="mt-4 pt-4 border-t border-[rgba(107,78,255,0.1)] space-y-3">
              <p className="text-sm font-medium text-[#1E1B4B]">Update daily limit</p>
              <div className="flex items-center gap-3">
                <input type="range" min={1} max={30} value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))} className="flex-1 accent-[#6B4EFF]" />
                <span className="w-12 text-center text-sm font-bold text-[#6B4EFF] bg-[#F5F3FF] border border-[rgba(107,78,255,0.2)] rounded-lg py-1.5">{dailyLimit}</span>
              </div>
              <p className="text-xs text-[#9CA3AF]">We recommend 15 sends/day to stay below LinkedIn's detection threshold.</p>
              <div className="flex gap-2">
                <button onClick={handleUpdateLimit} disabled={savingLimit}
                  className="flex items-center gap-1.5 px-4 py-2 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
                  {savingLimit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {savingLimit ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setShowLimitEditor(false)} className="px-4 py-2 border border-[rgba(107,78,255,0.2)] text-[#6B7280] text-sm font-semibold rounded-lg hover:bg-[#F5F3FF] transition-colors">Cancel</button>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="bg-white border border-[rgba(107,78,255,0.15)] rounded-xl p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-[#F5F3FF] rounded-xl flex items-center justify-center shrink-0">
            <Linkedin className="w-5 h-5 text-[#6B4EFF]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#1E1B4B]">No LinkedIn account connected</p>
            <p className="text-xs text-[#6B7280] mt-1 mb-5">Connect your LinkedIn account to start sending automated connection requests and follow-ups.</p>
            <button onClick={handleConnectLinkedIn} disabled={connecting}
              className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              )}
              {connecting ? "Redirecting to Unipile…" : "Connect LinkedIn"}
            </button>
            <p className="text-xs text-[#9CA3AF] mt-3">You'll be securely redirected to connect your LinkedIn account via Unipile.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1E1B4B] flex items-center gap-2.5">
              <Linkedin className="w-6 h-6 text-[#6B4EFF]" /> LinkedIn Outreach
            </h1>
            <p className="text-sm text-[#6B7280] mt-1">Send connection requests and follow-ups to leads automatically.</p>
          </div>
          {!replyMode && (
            <button onClick={() => openBuilder()}
              className="flex items-center gap-2 px-4 py-2.5 text-white text-sm font-semibold rounded-xl transition-colors shrink-0"
              style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
              <Plus className="w-4 h-4" /> New sequence
            </button>
          )}
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
          <h2 className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-widest mb-3">Your LinkedIn account</h2>
          {renderAccountSection()}
        </section>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 border-b border-[rgba(107,78,255,0.12)]">
          <button
            onClick={() => { setActiveTab("sequences"); setOpenChat(null); }}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${activeTab === "sequences" ? "border-[#6B4EFF] text-[#6B4EFF]" : "border-transparent text-[#6B7280] hover:text-[#1E1B4B]"}`}>
            Sequences
          </button>
          <button
            onClick={() => {
              setActiveTab("inbox");
              setOpenChat(null);
              setReplyLIOpenThread(null);
              if (replyMode) {
                if (replyLIInbox.length === 0) loadReplyLIInbox(replySelectedId ?? undefined);
              } else {
                if (inbox.length === 0) loadInbox();
              }
            }}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${activeTab === "inbox" ? "border-[#6B4EFF] text-[#6B4EFF]" : "border-transparent text-[#6B7280] hover:text-[#1E1B4B]"}`}>
            <Mail className="w-3.5 h-3.5" /> LinkedIn Inbox
            {(replyMode ? replyLIInbox : inbox).some((c) => ((c as { unread_count?: number; unreadCount?: number }).unread_count ?? (c as { unreadCount?: number }).unreadCount ?? 0) > 0) && (
              <span className="w-2 h-2 bg-[#6B4EFF] rounded-full" />
            )}
          </button>
        </div>

        {/* ── INBOX PANEL ── */}
        {activeTab === "inbox" && (
          <section className="pt-2">
            {replyMode ? (
              replyLIOpenThread ? (
                /* Thread / conversation view */
                <div className="bg-white border border-[rgba(107,78,255,0.15)] rounded-2xl overflow-hidden flex flex-col shadow-sm" style={{ height: "560px" }}>
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(107,78,255,0.1)] bg-[#F5F3FF] shrink-0">
                    <button onClick={() => setReplyLIOpenThread(null)} className="p-1.5 text-[#6B7280] hover:text-[#1E1B4B] hover:bg-white rounded-lg transition-colors">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                      style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
                      {(replyLIOpenThread.name ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1E1B4B] truncate">{replyLIOpenThread.name ?? "Unknown contact"}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-[#9CA3AF]">LinkedIn · via Reply.io</p>
                        {replyLIOpenThread.status && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 font-medium">
                            {replyLIOpenThread.status}
                          </span>
                        )}
                      </div>
                    </div>
                    <button onClick={refreshReplyLIMessages} className="p-1.5 text-[#6B7280] hover:text-[#1E1B4B] hover:bg-white rounded-lg transition-colors">
                      <RefreshCcw className={`w-3.5 h-3.5 ${replyLIMessagesLoading ? "animate-spin" : ""}`} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#FAFAF9]">
                    {replyLIMessagesLoading ? (
                      <div className="flex flex-col items-center justify-center h-full gap-2">
                        <Loader2 className="w-5 h-5 animate-spin text-[#6B4EFF]" />
                        <p className="text-xs text-[#9CA3AF]">Loading messages…</p>
                      </div>
                    ) : replyLIMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full gap-2">
                        <MessageCircle className="w-8 h-8 text-[#D1C9FF]" />
                        <p className="text-sm text-[#9CA3AF]">No messages yet</p>
                      </div>
                    ) : (
                      <>
                        {replyLIMessages.map((msg, i) => (
                          <div key={msg.id ?? i} className={`flex ${msg.isOutgoing ? "justify-end" : "justify-start"}`}>
                            {!msg.isOutgoing && (
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mr-2 mt-0.5"
                                style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
                                {(replyLIOpenThread.name ?? "?").charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className={`max-w-[72%] flex flex-col gap-0.5 ${msg.isOutgoing ? "items-end" : "items-start"}`}>
                              <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${msg.isOutgoing ? "text-white rounded-br-sm" : "bg-white border border-[rgba(107,78,255,0.12)] text-[#1E1B4B] rounded-bl-sm shadow-sm"}`}
                                style={msg.isOutgoing ? { background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" } : {}}>
                                {msg.text || <span className="italic opacity-60">📎 Attachment</span>}
                              </div>
                              <span className="text-[10px] text-[#9CA3AF] px-1">{formatReplyLITime(msg.sentAt)}</span>
                            </div>
                          </div>
                        ))}
                        <div ref={replyLIMessagesEndRef} />
                      </>
                    )}
                  </div>

                  <div className="px-4 py-3 border-t border-[rgba(107,78,255,0.1)] bg-white shrink-0">
                    <div className="flex items-end gap-2">
                      <textarea
                        value={replyLIMessageInput}
                        onChange={(e) => setReplyLIMessageInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleReplyLISendMessage(); } }}
                        placeholder="Type a message… (Enter to send)"
                        rows={2}
                        className="flex-1 px-3 py-2.5 text-sm bg-[#F5F3FF] border border-[rgba(107,78,255,0.2)] rounded-xl text-[#1E1B4B] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[rgba(107,78,255,0.15)] focus:border-[#6B4EFF] transition-colors resize-none"
                      />
                      <button onClick={handleReplyLISendMessage} disabled={!replyLIMessageInput.trim() || replyLISending}
                        className="p-2.5 text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                        style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
                        {replyLISending ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizonal className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-[#9CA3AF] mt-1.5 px-1">Sent via Reply.io · Delivered to LinkedIn</p>
                  </div>
                </div>
              ) : (
                /* Thread list */
                replyLIInboxLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 className="w-6 h-6 animate-spin text-[#6B4EFF]" />
                    <p className="text-xs text-[#6B7280]">Loading messages from Reply.io…</p>
                  </div>
                ) : replyLIInbox.length === 0 ? (
                  <div className="bg-white border border-dashed border-[rgba(107,78,255,0.2)] rounded-xl p-10 text-center">
                    <Mail className="w-8 h-8 text-[#D1C9FF] mx-auto mb-3" />
                    <p className="text-sm font-medium text-[#1E1B4B]">No messages yet</p>
                    <p className="text-xs text-[#6B7280] mt-1">LinkedIn replies will appear here once your connections start responding.</p>
                    <button onClick={() => loadReplyLIInbox(replySelectedId ?? undefined)}
                      className="mt-4 inline-flex items-center gap-1.5 text-xs text-[#6B4EFF] hover:text-[#8B5CF6] transition-colors">
                      <RefreshCcw className="w-3 h-3" /> Refresh inbox
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-[#9CA3AF]">{replyLIInbox.length} conversation{replyLIInbox.length !== 1 ? "s" : ""}</p>
                      <button onClick={() => loadReplyLIInbox(replySelectedId ?? undefined)}
                        className="flex items-center gap-1.5 text-xs text-[#6B7280] hover:text-[#1E1B4B] transition-colors">
                        <RefreshCcw className="w-3 h-3" /> Refresh
                      </button>
                    </div>
                    {replyLIInbox.map((thread) => {
                      const hasUnread = (thread.unreadCount ?? 0) > 0;
                      return (
                        // FIX: key on threadId (unique v3 thread ID), not personId (may be null)
                        <button key={thread.threadId} onClick={() => openReplyLIThread(thread)}
                          className={`w-full text-left bg-white border rounded-xl p-4 transition-all hover:shadow-md ${hasUnread ? "border-[#6B4EFF] bg-[#F5F3FF]" : "border-[rgba(107,78,255,0.15)]"}`}>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                              style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
                              {(thread.name ?? "?").charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className={`text-sm truncate ${hasUnread ? "font-semibold text-[#1E1B4B]" : "font-medium text-[#1E1B4B]"}`}>
                                  {thread.name ?? <span className="text-[#9CA3AF] italic font-normal">Unknown contact</span>}
                                </p>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {thread.lastMessageAt && (
                                    <span className={`text-[10px] ${hasUnread ? "text-[#6B4EFF] font-medium" : "text-[#9CA3AF]"}`}>
                                      {formatReplyLITime(thread.lastMessageAt)}
                                    </span>
                                  )}
                                  {hasUnread && (
                                    <span className="min-w-[18px] h-[18px] text-white text-[10px] rounded-full flex items-center justify-center font-bold px-1"
                                      style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
                                      {thread.unreadCount}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {thread.status && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 font-medium shrink-0">
                                    {thread.status}
                                  </span>
                                )}
                                <p className={`text-xs truncate ${hasUnread ? "text-[#1E1B4B]" : "text-[#6B7280]"}`}>
                                  {thread.lastMessage ?? <span className="text-[#9CA3AF] italic">Tap to open</span>}
                                </p>
                              </div>
                            </div>
                            <MessageCircle className="w-4 h-4 text-[#D1C9FF] shrink-0" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              )
            ) : (
              /* ── Native Unipile inbox ── */
              openChat ? (
                <div className="bg-white border border-[rgba(107,78,255,0.15)] rounded-2xl overflow-hidden flex flex-col shadow-sm" style={{ height: "560px" }}>
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(107,78,255,0.1)] bg-[#F5F3FF] shrink-0">
                    <button onClick={() => setOpenChat(null)} className="p-1.5 text-[#6B7280] hover:text-[#1E1B4B] hover:bg-white rounded-lg transition-colors">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
                      {(openChat.display_name ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1E1B4B] truncate">{openChat.display_name ?? "Unknown contact"}</p>
                      <p className="text-xs text-[#9CA3AF]">LinkedIn · via Unipile</p>
                    </div>
                    <button onClick={refreshMessages} className="p-1.5 text-[#6B7280] hover:text-[#1E1B4B] hover:bg-white rounded-lg transition-colors">
                      <RefreshCcw className={`w-3.5 h-3.5 ${loadingMessages ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#FAFAF9]">
                    {loadingMessages ? (
                      <div className="flex flex-col items-center justify-center h-full gap-2">
                        <Loader2 className="w-5 h-5 animate-spin text-[#6B4EFF]" />
                        <p className="text-xs text-[#9CA3AF]">Loading messages…</p>
                      </div>
                    ) : chatMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full gap-2">
                        <MessageCircle className="w-8 h-8 text-[#D1C9FF]" />
                        <p className="text-sm text-[#9CA3AF]">No messages yet</p>
                      </div>
                    ) : (
                      <>
                        {chatMessages.map((msg) => (
                          <div key={msg.id} className={`flex ${msg.is_sender ? "justify-end" : "justify-start"}`}>
                            {!msg.is_sender && (
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mr-2 mt-0.5" style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
                                {(openChat.display_name ?? "?").charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className={`max-w-[72%] flex flex-col gap-0.5 ${msg.is_sender ? "items-end" : "items-start"}`}>
                              <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${msg.is_sender ? "text-white rounded-br-sm" : "bg-white border border-[rgba(107,78,255,0.12)] text-[#1E1B4B] rounded-bl-sm shadow-sm"}`}
                                style={msg.is_sender ? { background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" } : {}}>
                                {msg.text ?? <span className="italic opacity-60">📎 Attachment</span>}
                              </div>
                              {msg.timestamp && <span className="text-[10px] text-[#9CA3AF] px-1">{formatMessageTime(msg.timestamp)}</span>}
                            </div>
                          </div>
                        ))}
                        <div ref={messagesEndRef} />
                      </>
                    )}
                  </div>
                  <div className="px-4 py-3 border-t border-[rgba(107,78,255,0.1)] bg-white shrink-0">
                    <div className="flex items-end gap-2">
                      <textarea ref={inputRef} value={messageInput} onChange={(e) => setMessageInput(e.target.value)} onKeyDown={handleInputKeyDown}
                        placeholder="Type a message… (Enter to send, Shift+Enter for newline)" rows={2}
                        className="flex-1 px-3 py-2.5 text-sm bg-[#F5F3FF] border border-[rgba(107,78,255,0.2)] rounded-xl text-[#1E1B4B] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[rgba(107,78,255,0.15)] focus:border-[#6B4EFF] transition-colors resize-none" />
                      <button onClick={handleSendMessage} disabled={!messageInput.trim() || sendingMessage}
                        className="p-2.5 text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                        style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
                        {sendingMessage ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizonal className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-[#9CA3AF] mt-1.5 px-1">Sent via Unipile · Delivered to LinkedIn</p>
                  </div>
                </div>
              ) : !account ? (
                <div className="bg-white border border-dashed border-[rgba(107,78,255,0.2)] rounded-xl p-10 text-center">
                  <Linkedin className="w-8 h-8 text-[#D1C9FF] mx-auto mb-3" />
                  <p className="text-sm font-medium text-[#1E1B4B]">LinkedIn not connected</p>
                  <p className="text-xs text-[#6B7280] mt-1">Connect your account above to see your inbox.</p>
                </div>
              ) : loadingInbox ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-[#6B4EFF]" />
                  <p className="text-xs text-[#6B7280]">Loading messages from LinkedIn…</p>
                </div>
              ) : inbox.length === 0 ? (
                <div className="bg-white border border-dashed border-[rgba(107,78,255,0.2)] rounded-xl p-10 text-center">
                  <Mail className="w-8 h-8 text-[#D1C9FF] mx-auto mb-3" />
                  <p className="text-sm font-medium text-[#1E1B4B]">No messages yet</p>
                  <p className="text-xs text-[#6B7280] mt-1">LinkedIn replies will appear here once your connections start responding.</p>
                  <button onClick={loadInbox} className="mt-4 inline-flex items-center gap-1.5 text-xs text-[#6B4EFF] hover:text-[#8B5CF6] transition-colors">
                    <RefreshCcw className="w-3 h-3" /> Refresh inbox
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-[#9CA3AF]">{inbox.length} conversation{inbox.length !== 1 ? "s" : ""}</p>
                    <button onClick={loadInbox} className="flex items-center gap-1.5 text-xs text-[#6B7280] hover:text-[#1E1B4B] transition-colors">
                      <RefreshCcw className="w-3 h-3" /> Refresh
                    </button>
                  </div>
                  {inbox.map((chat) => {
                    const hasUnread = (chat.unread_count ?? 0) > 0;
                    return (
                      <button key={chat.id} onClick={() => openChatPanel(chat)}
                        className={`w-full text-left bg-white border rounded-xl p-4 transition-all hover:shadow-md ${hasUnread ? "border-[#6B4EFF] bg-[#F5F3FF]" : "border-[rgba(107,78,255,0.15)]"}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
                            {(chat.display_name ?? "?").charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-sm truncate ${hasUnread ? "font-semibold text-[#1E1B4B]" : "font-medium text-[#1E1B4B]"}`}>
                                {chat.display_name ?? <span className="text-[#9CA3AF] italic font-normal">Unknown contact</span>}
                              </p>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {chat.timestamp && <span className={`text-[10px] ${hasUnread ? "text-[#6B4EFF] font-medium" : "text-[#9CA3AF]"}`}>{formatTime(chat.timestamp)}</span>}
                                {hasUnread && (
                                  <span className="min-w-[18px] h-[18px] text-white text-[10px] rounded-full flex items-center justify-center font-bold px-1" style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
                                    {chat.unread_count}
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className={`text-xs mt-0.5 truncate ${hasUnread ? "text-[#1E1B4B]" : "text-[#6B7280]"}`}>
                              {chat.last_message_sender_is_me && <span className="text-[#9CA3AF]">You: </span>}
                              {chat.last_message_text ?? <span className="text-[#9CA3AF] italic">Tap to open</span>}
                            </p>
                          </div>
                          <MessageCircle className="w-4 h-4 text-[#D1C9FF] shrink-0" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )
            )}
          </section>
        )}

        {/* ── SEQUENCES TAB ── */}
        {activeTab === "sequences" && (
          <section>
            <div className="flex items-center justify-between pt-4 mb-4">
              <h2 className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-widest">Sequences</h2>
              <div className="flex items-center gap-1 p-1 bg-[#F5F3FF] border border-[rgba(107,78,255,0.15)] rounded-xl">
                <button onClick={() => handleToggleReplyMode(false)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${!replyMode ? "bg-white text-[#6B4EFF] shadow-sm border border-[rgba(107,78,255,0.2)]" : "text-[#6B7280] hover:text-[#1E1B4B]"}`}>
                  Native (Unipile)
                </button>
                <button onClick={() => { if (replyConnected) handleToggleReplyMode(true); }} disabled={!replyConnected}
                  title={!replyConnected ? "Connect Reply.io in Settings → Integrations first" : undefined}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${replyMode ? "bg-white text-[#6B4EFF] shadow-sm border border-[rgba(107,78,255,0.2)]" : !replyConnected ? "text-[#C4C4C4] cursor-not-allowed" : "text-[#6B7280] hover:text-[#1E1B4B]"}`}>
                  <svg width="12" height="12" viewBox="0 0 32 32" fill="none">
                    <path d="M8 10h10a4 4 0 010 8H12v4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="22" cy="22" r="2.5" fill="currentColor" />
                  </svg>
                  Reply.io
                  {replyConnected && !replyMode && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                  {!replyConnected && <span className="text-[10px] font-normal text-[#C4C4C4]">(not connected)</span>}
                </button>
              </div>
            </div>

            {/* ── Native mode ── */}
            {!replyMode && (
              sequences.length === 0 ? (
                <div className="bg-white border border-dashed border-[rgba(107,78,255,0.2)] rounded-xl p-10 flex flex-col items-center gap-3 text-center">
                  <div className="w-12 h-12 bg-[#F5F3FF] rounded-2xl flex items-center justify-center">
                    <Send className="w-5 h-5 text-[#6B4EFF]" />
                  </div>
                  <p className="text-sm font-semibold text-[#1E1B4B]">No sequences yet</p>
                  <p className="text-xs text-[#6B7280] max-w-xs">Create a sequence with a connection request template and optional follow-up message.</p>
                  <button onClick={() => openBuilder()}
                    className="mt-1 flex items-center gap-2 px-4 py-2.5 text-white text-sm font-semibold rounded-xl transition-colors"
                    style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
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
                      <div key={seq.id} className="bg-white border border-[rgba(107,78,255,0.15)] rounded-xl overflow-hidden shadow-sm">
                        <div className="p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-semibold text-[#1E1B4B]">{seq.name}</h3>
                                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${seq.is_active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-[#F5F3FF] text-[#9CA3AF] border-[rgba(107,78,255,0.15)]"}`}>
                                  {seq.is_active ? "Active" : "Inactive"}
                                </span>
                              </div>
                              {seq.lead_lists && (
                                <p className="text-xs text-[#6B7280] mt-1 flex items-center gap-1.5">
                                  <Users className="w-3.5 h-3.5 text-[#6B4EFF]" />{seq.lead_lists.label}
                                </p>
                              )}
                              <p className="text-xs text-[#9CA3AF] mt-1.5 line-clamp-2">{seq.connection_message}</p>
                              <div className="flex flex-wrap gap-3 mt-2">
                                <span className="text-xs text-[#6B7280] flex items-center gap-1"><Send className="w-3 h-3 text-[#6B4EFF]" /> {seq.daily_limit}/day limit</span>
                                {seq.followup_message && (
                                  <span className="text-xs text-[#6B7280] flex items-center gap-1"><MessageSquare className="w-3 h-3 text-[#8B5CF6]" /> Follow-up in {seq.followup_delay_days}d</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {!seq.is_active ? (
                                <div className="flex flex-col items-end gap-1">
                                  <button onClick={() => handleLaunch(seq)} disabled={launchingId === seq.id}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                                    style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
                                    {launchingId === seq.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Launch
                                  </button>
                                  <span className="text-[10px] text-[#9CA3AF] flex items-center gap-0.5"><Zap className="w-2.5 h-2.5 text-[#6B4EFF]" /> 1 cr/send</span>
                                </div>
                              ) : (
                                <button onClick={() => handlePause(seq)} disabled={pausingId === seq.id}
                                  className="flex items-center gap-1.5 px-3 py-1.5 border border-[rgba(107,78,255,0.2)] text-[#6B7280] text-xs font-medium rounded-lg hover:bg-[#F5F3FF] transition-colors disabled:opacity-50">
                                  {pausingId === seq.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />} Pause
                                </button>
                              )}
                              <button onClick={() => openBuilder(seq)} className="p-1.5 text-[#9CA3AF] hover:text-[#6B4EFF] hover:bg-[#F5F3FF] rounded-lg transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDelete(seq.id)} disabled={deletingId === seq.id} className="p-1.5 text-[#9CA3AF] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                                {deletingId === seq.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        </div>
                        <button onClick={() => toggleAnalytics(seq.id)}
                          className="w-full flex items-center justify-between px-5 py-2.5 bg-[#F5F3FF] border-t border-[rgba(107,78,255,0.1)] text-xs font-medium text-[#6B7280] hover:bg-[#EDE9FF] hover:text-[#6B4EFF] transition-colors">
                          <span className="flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5 text-[#6B4EFF]" /> Analytics</span>
                          {isLoadingA ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6B4EFF]" /> : isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                        {isExpanded && (
                          <div className="px-5 py-4 border-t border-[rgba(107,78,255,0.1)] bg-[#FAFAF9]">
                            {isLoadingA ? (
                              <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-[#6B4EFF]" /></div>
                            ) : analytics ? (
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  {[
                                    { label: "Contacted", value: analytics.total_contacted, icon: <Send className="w-3.5 h-3.5 text-[#6B4EFF]" />, color: "text-[#1E1B4B]", sub: undefined },
                                    { label: "Connected", value: analytics.connected, icon: <UserCheck className="w-3.5 h-3.5 text-[#6B4EFF]" />, color: "text-[#6B4EFF]", sub: analytics.total_contacted > 0 ? `${getAcceptanceRate(analytics)}% rate` : undefined },
                                    { label: "Replied", value: analytics.replied, icon: <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />, color: "text-emerald-600", sub: analytics.connected > 0 ? `${getReplyRate(analytics)}% rate` : undefined },
                                    { label: "Follow-ups", value: analytics.followups_pending, icon: <Clock className="w-3.5 h-3.5 text-amber-500" />, color: "text-amber-600", sub: `${analytics.followups_sent} sent` },
                                  ].map((stat) => (
                                    <div key={stat.label} className="bg-white rounded-xl border border-[rgba(107,78,255,0.12)] p-3 shadow-sm">
                                      <div className="flex items-center gap-1.5 mb-1">{stat.icon}<span className="text-xs text-[#6B7280]">{stat.label}</span></div>
                                      <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                                      {stat.sub && <p className="text-xs text-[#9CA3AF] mt-0.5">{stat.sub}</p>}
                                    </div>
                                  ))}
                                </div>
                                {analytics.total_contacted > 0 && (
                                  <div className="bg-white rounded-xl border border-[rgba(107,78,255,0.12)] p-4 shadow-sm">
                                    <p className="text-xs font-semibold text-[#1E1B4B] mb-3">Funnel</p>
                                    <div className="space-y-2.5">
                                      {[
                                        { label: "Contacted", value: analytics.total_contacted, pct: 100, color: "bg-[#D1C9FF]", textColor: "text-[#6B7280]" },
                                        { label: "Connected", value: analytics.connected, pct: getAcceptanceRate(analytics), color: "bg-[#6B4EFF]", textColor: "text-[#6B4EFF]" },
                                        { label: "Replied", value: analytics.replied, pct: analytics.total_contacted > 0 ? Math.round((analytics.replied / analytics.total_contacted) * 100) : 0, color: "bg-emerald-500", textColor: "text-emerald-600" },
                                      ].map((bar) => (
                                        <div key={bar.label}>
                                          <div className={`flex justify-between text-xs ${bar.textColor} mb-1`}>
                                            <span>{bar.label}</span><span>{bar.value}{bar.pct !== 100 ? ` (${bar.pct}%)` : ""}</span>
                                          </div>
                                          <div className="w-full bg-[#F5F3FF] rounded-full h-2">
                                            <div className={`${bar.color} h-2 rounded-full transition-all`} style={{ width: `${bar.pct}%` }} />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <div className="flex items-center gap-3 pt-1">
                                  <button onClick={() => loadAnalytics(seq.id)} className="text-xs text-[#6B4EFF] hover:text-[#8B5CF6] transition-colors">Refresh analytics</button>
                                  <button onClick={() => refreshAnalyticsFromLinkedIn(seq.id)} disabled={refreshingAnalytics[seq.id]}
                                    className="flex items-center gap-1 text-xs text-[#6B4EFF] hover:text-[#8B5CF6] transition-colors disabled:opacity-50">
                                    {refreshingAnalytics[seq.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />} Sync from LinkedIn
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-[#9CA3AF] text-center py-4">No analytics data yet. Launch the sequence first.</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* ── Reply.io mode ── */}
            {replyMode && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-[#9CA3AF] uppercase tracking-widest font-medium">Reply.io Sequences</p>
                    <p className="text-xs text-[#6B7280] mt-0.5">Create and manage LinkedIn sequences via Reply.io</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={loadReplySeqs} className="flex items-center gap-1 text-xs text-[#6B4EFF] hover:text-[#8B5CF6]">
                      <RefreshCw className="w-3 h-3" /> Refresh
                    </button>
                    <button onClick={() => { setEnrollSeqId(replySelectedId); setEnrollOpen(true); }} disabled={!replySelectedId}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[#6B4EFF] text-xs font-semibold rounded-lg border border-[rgba(107,78,255,0.3)] hover:bg-[#F5F3FF] disabled:opacity-40 transition-colors">
                      <Users className="w-3 h-3" /> Enroll Contact
                    </button>
                    <button onClick={() => { setReplyLIWizard(true); resetLIWizard(); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-colors"
                      style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
                      <Plus className="w-3.5 h-3.5" /> New Sequence
                    </button>
                  </div>
                </div>

                {replySeqsLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-[#6B4EFF]" /></div>
                ) : replySeqs.length === 0 ? (
                  <div className="bg-white border border-dashed border-[rgba(107,78,255,0.2)] rounded-xl p-10 text-center">
                    <div className="w-12 h-12 bg-[#F5F3FF] rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                        <path d="M8 10h10a4 4 0 010 8H12v4" stroke="#6B4EFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="22" cy="22" r="2.5" fill="#6B4EFF" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-[#1E1B4B]">No Reply.io sequences yet</p>
                    <p className="text-xs text-[#6B7280] mt-1">Create your first LinkedIn sequence directly from HubCredo.</p>
                    <button onClick={() => { setReplyLIWizard(true); resetLIWizard(); }}
                      className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-colors"
                      style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
                      <Plus className="w-3.5 h-3.5" /> Create first sequence
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      {replySeqs.map((seq) => (
                        <div key={seq.id}
                          className={`rounded-xl border transition-all ${replySelectedId === seq.id ? "bg-[#F5F3FF] border-[rgba(107,78,255,0.4)]" : "bg-white border-[rgba(107,78,255,0.12)] hover:border-[rgba(107,78,255,0.3)] hover:bg-[#F5F3FF]/50"}`}>
                          <button className="w-full text-left px-4 pt-3 pb-2" onClick={() => loadReplyDetail(seq.id)}>
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${seq.status === "active" ? "bg-emerald-400" : seq.status === "paused" ? "bg-amber-400" : "bg-gray-300"}`} />
                              <span className="text-sm font-medium text-[#1E1B4B] truncate">{seq.name}</span>
                            </div>
                            <span className={`mt-1 inline-flex text-xs px-1.5 py-0.5 rounded-full capitalize font-medium ${seq.status === "active" ? "bg-emerald-50 text-emerald-700" : seq.status === "paused" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                              {seq.status}
                            </span>
                          </button>
                          <div className="flex items-center gap-1 px-4 pb-2">
                            {seq.status !== "active" ? (
  <button onClick={() => openLiLaunchModal(seq.id)}
    className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700">
    <Play className="w-2.5 h-2.5" /> Launch
  </button>
                            ) : (
                              <button onClick={() => handlePauseLIReply(seq.id)} disabled={replyLIPausingId === seq.id}
                                className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 hover:text-amber-700 disabled:opacity-50">
                                {replyLIPausingId === seq.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Pause className="w-2.5 h-2.5" />} Pause
                              </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); setReplyLIDeleteConfirmId(seq.id); }}
                              className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-[#9CA3AF] hover:text-red-500 transition-colors">
                              <Trash2 className="w-2.5 h-2.5" /> Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="lg:col-span-2">
                      {!replySelectedSeq ? (
                        <div className="bg-white border border-dashed border-[rgba(107,78,255,0.15)] rounded-xl flex items-center justify-center h-48">
                          <p className="text-sm text-[#9CA3AF]">Select a sequence to view contacts</p>
                        </div>
                      ) : replyDetailLoading ? (
                        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-[#6B4EFF]" /></div>
                      ) : (
                        <div className="space-y-3">
                          {replyLIStats && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {[
                                { label: "Total contacted",  value: replyLIStats.totalPeopleContacted, sub: null,                                   color: "text-[#1E1B4B]"   },
                                { label: "Connections sent", value: replyLIStats.connectionsSent,       sub: null,                                   color: "text-[#6B4EFF]"   },
                                { label: "Accepted / Rate", value: replyLIStats.acceptedAutomatedConnections, sub: `${replyLIStats.automatedConnectionsConversionRate}%`, color: "text-emerald-600" },
                                { label: "Messages sent",    value: replyLIStats.messagesSent,          sub: null,                                   color: "text-blue-600"    },
                                { label: "Replies / Rate",   value: replyLIStats.replies,               sub: `${replyLIStats.repliesConversionRate}%`, color: "text-indigo-600" },
                              ].map(({ label, value, sub, color }) => (
                                <div key={label} className="bg-white border border-[rgba(107,78,255,0.1)] rounded-xl p-3 text-center">
                                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                                  {sub && <p className="text-xs font-semibold text-[#6B4EFF]">{sub}</p>}
                                  <p className="text-[10px] text-[#9CA3AF] mt-0.5">{label}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="bg-white border border-[rgba(107,78,255,0.12)] rounded-xl p-4">
                            <p className="text-xs font-semibold text-[#1E1B4B] mb-2">Enroll from lead list</p>
                            <div className="flex gap-2">
                              <select value={replyLIEnrollListId} onChange={(e) => setReplyLIEnrollListId(e.target.value)}
                                className="flex-1 px-3 py-2 border border-[rgba(107,78,255,0.2)] rounded-lg text-xs focus:outline-none focus:border-[#6B4EFF] bg-white">
                                <option value="">Select a lead list…</option>
                                {lists.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                              </select>
                              <button onClick={() => handleEnrollListLI(replySelectedId!, replyLIEnrollListId)}
                                disabled={!replyLIEnrollListId || replyLIEnrollingList}
                                className="flex items-center gap-1.5 px-3 py-2 text-white text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition-colors"
                                style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
                                {replyLIEnrollingList ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Enroll list
                              </button>
                            </div>
                          </div>

                          <div className="bg-white border border-[rgba(107,78,255,0.12)] rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-sm font-semibold text-[#1E1B4B]">
                                {replySelectedSeq.name}
                                <span className="ml-2 text-xs text-[#9CA3AF] font-normal">{replyContacts.length} contacts</span>
                              </p>
                              <button onClick={() => { setEnrollSeqId(replySelectedId); setEnrollOpen(true); }} className="text-xs text-[#6B4EFF] font-medium hover:underline">+ Add contact</button>
                            </div>
                            {replyContacts.length === 0 ? (
                              <div className="text-center py-6">
                                <p className="text-sm text-[#9CA3AF]">No contacts yet</p>
                                <button onClick={() => { setEnrollSeqId(replySelectedId); setEnrollOpen(true); }} className="mt-2 text-xs text-[#6B4EFF] hover:underline font-medium">Enroll first contact →</button>
                              </div>
                            ) : (
                              <div className="divide-y divide-gray-50">
                                {replyContacts.map((c) => (
                                  <div key={c.email} className="flex items-center justify-between py-2.5 gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <div className="w-7 h-7 rounded-full bg-[#F5F3FF] flex items-center justify-center text-xs font-semibold text-[#6B4EFF] flex-shrink-0">
                                        {(c.firstName?.[0] ?? c.email[0]).toUpperCase()}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-xs font-medium text-[#1E1B4B] truncate">{c.firstName} {c.lastName}</p>
                                        <p className="text-[11px] text-[#9CA3AF] truncate">{c.email}</p>
                                      </div>
                                    </div>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize flex-shrink-0 ${c.status?.status === "active" ? "bg-emerald-50 text-emerald-700" : c.status?.status === "finished" ? "bg-purple-50 text-purple-700" : "bg-gray-100 text-gray-500"}`}>
                                      {c.status?.status?.replace(/_/g, " ") ?? "unknown"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </div>

      {/* ── Sequence builder modal ── */}
      {showBuilder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white border border-[rgba(107,78,255,0.2)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-[rgba(107,78,255,0.1)] px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-base font-bold text-[#1E1B4B]">{editingSeq ? "Edit sequence" : "New sequence"}</h2>
              <button onClick={() => setShowBuilder(false)} className="p-1.5 text-[#9CA3AF] hover:text-[#1E1B4B] hover:bg-[#F5F3FF] rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">Sequence name</label>
                <input value={seqName} onChange={(e) => setSeqName(e.target.value)} placeholder="My LinkedIn Sequence" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">Lead list</label>
                <select value={seqListId} onChange={(e) => setSeqListId(e.target.value)} className={inputClass}>
                  <option value="">No list selected</option>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-[#1E1B4B]">
                    Connection request message <span className="text-[#9CA3AF] font-normal">(max 300 chars)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button onClick={handlePrefill} disabled={prefilling} className="flex items-center gap-1 text-xs text-[#6B4EFF] hover:text-[#8B5CF6] transition-colors disabled:opacity-50">
                      {prefilling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} AI fill
                    </button>
                    <div className="relative">
                      <button onClick={() => setShowTemplates(!showTemplates)} className="flex items-center gap-1 text-xs text-[#6B7280] hover:text-[#1E1B4B] transition-colors">
                        <FileText className="w-3 h-3" /> Templates
                      </button>
                      {showTemplates && (
                        <div className="absolute right-0 top-6 z-20 bg-white border border-[rgba(107,78,255,0.15)] rounded-xl shadow-lg w-72 p-1.5">
                          {LINKEDIN_TEMPLATES.map((t, i) => (
                            <button key={i} onClick={() => { setConnMsg(t.connection_message); if (t.followup_message) setFollowupMsg(t.followup_message); setShowTemplates(false); }}
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#F5F3FF] transition-colors">
                              <p className="text-xs font-semibold text-[#1E1B4B]">{t.name}</p>
                              <p className="text-xs text-[#6B7280] truncate mt-0.5">{t.connection_message.slice(0, 65)}…</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <textarea value={connMsg} onChange={(e) => setConnMsg(e.target.value)} placeholder="Hi {{firstName}}, I noticed you work in… Open to connecting?" rows={4} maxLength={300} className={`${inputClass} resize-none`} />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-[#9CA3AF]">Use {"{{firstName}}"} as a personalisation token.</p>
                  <span className={`text-xs ${connMsg.length > 280 ? "text-amber-500" : "text-[#9CA3AF]"}`}>{connMsg.length}/300</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">Follow-up message <span className="text-[#9CA3AF] font-normal">(optional)</span></label>
                <textarea value={followupMsg} onChange={(e) => setFollowupMsg(e.target.value)} placeholder="Hey {{firstName}}, thanks for connecting! …" rows={3} className={`${inputClass} resize-none`} />
              </div>
              {followupMsg.trim() && (
                <div>
                  <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">
                    Send follow-up after <span className="text-[#6B4EFF] font-bold">{followupDelay} day{followupDelay !== 1 ? "s" : ""}</span>
                  </label>
                  <input type="range" min={1} max={14} value={followupDelay} onChange={(e) => setFollowupDelay(Number(e.target.value))} className="w-full accent-[#6B4EFF]" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">Sequence daily limit <span className="text-[#9CA3AF] font-normal">(max 30)</span></label>
                <div className="flex items-center gap-3">
                  <input type="range" min={1} max={30} value={seqDailyLimit} onChange={(e) => setSeqDailyLimit(Number(e.target.value))} className="flex-1 accent-[#6B4EFF]" />
                  <span className="w-12 text-center text-sm font-bold text-[#6B4EFF] bg-[#F5F3FF] border border-[rgba(107,78,255,0.2)] rounded-lg py-1.5">{seqDailyLimit}</span>
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-[rgba(107,78,255,0.1)] px-6 py-4 flex gap-3 rounded-b-2xl">
              <button onClick={handleSaveSeq} disabled={savingSeq}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
                {savingSeq ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {savingSeq ? "Saving…" : editingSeq ? "Update sequence" : "Create sequence"}
              </button>
              <button onClick={() => setShowBuilder(false)} className="px-5 py-2.5 border border-[rgba(107,78,255,0.2)] text-[#6B7280] text-sm font-semibold rounded-xl hover:bg-[#F5F3FF] transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reply.io LinkedIn Sequence wizard ── */}
      {replyLIWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white border border-[rgba(107,78,255,0.15)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(107,78,255,0.1)] flex-shrink-0">
              <div>
                <h3 className="text-sm font-bold text-[#1E1B4B]">New LinkedIn Sequence via Reply.io</h3>
                <p className="text-xs text-[#6B7280] mt-0.5">Connection request + optional follow-up message</p>
              </div>
              <button onClick={() => setReplyLIWizard(false)} className="text-[#9CA3AF] hover:text-[#1E1B4B]"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1.5">Sequence name <span className="text-red-400">*</span></label>
                <input autoFocus value={replyLIName} onChange={(e) => setReplyLIName(e.target.value)} placeholder="e.g. Q3 LinkedIn Outreach"
                  className="w-full px-3 py-2 border border-[rgba(107,78,255,0.2)] rounded-lg text-sm focus:outline-none focus:border-[#6B4EFF] focus:ring-2 focus:ring-[rgba(107,78,255,0.1)]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1.5">Apply template (optional)</label>
                <div className="grid grid-cols-2 gap-2">
                  {LINKEDIN_TEMPLATES.map((t) => (
                    <button key={t.name} onClick={() => { setReplyLIConnMsg(t.connection_message); setReplyLIFollowup(t.followup_message); }}
                      className="text-left px-3 py-2 bg-[#F5F3FF] hover:bg-[#EDE9FE] border border-[rgba(107,78,255,0.15)] rounded-lg text-xs font-medium text-[#6B4EFF] transition-colors">
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1.5">
  Step 1 — Connection request message <span className="font-normal text-[#9CA3AF]">(optional, max 300 chars)</span>
</label>
<textarea value={replyLIConnMsg} onChange={(e) => setReplyLIConnMsg(e.target.value)} rows={3}
  placeholder="Leave blank to send a plain connection request with no note, or write something like: Hi {{firstName}}, I help B2B teams build reliable sales infrastructure…"
  className="w-full px-3 py-2 border border-[rgba(107,78,255,0.2)] rounded-lg text-sm focus:outline-none focus:border-[#6B4EFF] resize-none" />
<p className="text-[10px] text-[#9CA3AF] text-right mt-0.5">{replyLIConnMsg.length}/300</p>              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1.5">Step 2 — Follow-up message <span className="font-normal text-[#9CA3AF]">(optional)</span></label>
                <textarea value={replyLIFollowup} onChange={(e) => setReplyLIFollowup(e.target.value)} rows={3}
                  placeholder="Hey {{firstName}}, thanks for connecting! Would you be open to a quick chat?"
                  className="w-full px-3 py-2 border border-[rgba(107,78,255,0.2)] rounded-lg text-sm focus:outline-none focus:border-[#6B4EFF] resize-none" />
                {replyLIFollowup && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-[#6B7280]">Send after</span>
                    <input type="number" min={1} max={30} value={replyLIFollowupDelay} onChange={(e) => setReplyLIFollowupDelay(Number(e.target.value))}
                      className="w-16 px-2 py-1 border border-[rgba(107,78,255,0.2)] rounded-lg text-xs text-center focus:outline-none focus:border-[#6B4EFF]" />
                    <span className="text-xs text-[#6B7280]">days after connection accepted</span>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1.5">Enroll a lead list (optional)</label>
                <select value={replyLIEnrollListId} onChange={(e) => setReplyLIEnrollListId(e.target.value)}
                  className="w-full px-3 py-2 border border-[rgba(107,78,255,0.2)] rounded-lg text-sm focus:outline-none focus:border-[#6B4EFF]">
                  <option value="">Skip — enroll manually later</option>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
                {replyLIEnrollListId && <p className="text-[11px] text-[#9CA3AF] mt-1">All approved leads from this list will be enrolled when the sequence is created.</p>}
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-[rgba(107,78,255,0.1)] flex-shrink-0">
              <button onClick={() => setReplyLIWizard(false)} className="flex-1 py-2 border border-[rgba(107,78,255,0.2)] text-sm font-semibold text-[#6B7280] rounded-xl hover:bg-[#F5F3FF]">Cancel</button>
             <button onClick={handleCreateReplyLISeq} disabled={replyLICreating || !replyLIName.trim()}
  className="flex-1 py-2 text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
  style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
  {replyLICreating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : <><CheckCircle2 className="w-4 h-4" /> Create sequence</>}
</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reply.io enroll modal ── */}
      {enrollOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white border border-[rgba(107,78,255,0.2)] rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(107,78,255,0.1)]">
              <h3 className="text-sm font-semibold text-[#1E1B4B]">Enroll Contact in Reply.io</h3>
              <button onClick={() => setEnrollOpen(false)} className="text-[#9CA3AF] hover:text-[#1E1B4B]"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleEnroll} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1">Sequence</label>
                <select value={enrollSeqId ?? ""} onChange={(e) => setEnrollSeqId(Number(e.target.value))} className={inputClass}>
                  <option value="">Select sequence…</option>
                  {replySeqs.filter((s) => s.status === "active").map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1">Email <span className="text-red-500">*</span></label>
                <input type="email" required value={enrollEmail} onChange={(e) => setEnrollEmail(e.target.value)} placeholder="name@company.com" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[#6B7280] mb-1">First name</label>
                  <input value={enrollFirst} onChange={(e) => setEnrollFirst(e.target.value)} placeholder="Jane" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B7280] mb-1">Last name</label>
                  <input value={enrollLast} onChange={(e) => setEnrollLast(e.target.value)} placeholder="Smith" className={inputClass} />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEnrollOpen(false)} className="flex-1 py-2 border border-[rgba(107,78,255,0.2)] text-[#6B7280] text-sm font-medium rounded-lg hover:bg-[#F5F3FF]">Cancel</button>
                <button type="submit" disabled={enrolling || !enrollEmail || !enrollSeqId}
                  className="flex-1 py-2 text-white text-sm font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center gap-1.5"
                  style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}>
                  {enrolling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  {enrolling ? "Enrolling…" : "Enroll"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {replyLIDeleteConfirmId !== null && (
        <>
          <div className="fixed inset-0 bg-black/20 z-[60] backdrop-blur-[2px]" onClick={() => setReplyLIDeleteConfirmId(null)} />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="bg-white border border-[rgba(107,78,255,0.15)] rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-[#1E1B4B] font-semibold text-base">Delete sequence?</p>
                  <p className="text-[#6B7280] text-sm mt-1">This will permanently delete the sequence and all its contacts from Reply.io.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setReplyLIDeleteConfirmId(null)} className="flex-1 py-2.5 border border-[rgba(107,78,255,0.2)] text-[#6B7280] text-sm font-semibold rounded-lg hover:bg-[#F5F3FF]">
                  Cancel
                </button>
                <button onClick={() => handleDeleteLIReplySeq(replyLIDeleteConfirmId!)} disabled={replyLIDeletingId === replyLIDeleteConfirmId}
                  className="flex-1 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {replyLIDeletingId === replyLIDeleteConfirmId
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>
                    : <><Trash2 className="w-4 h-4" /> Yes, delete</>}
                </button>
              </div>
            </div>
          </div>
        </>
      )}



      {/* ── LinkedIn Launch modal ── */}
{liLaunchModalOpen && (
  <>
    <div
      className="fixed inset-0 bg-black/20 z-[60] backdrop-blur-[2px]"
      onClick={() => !liLaunching && setLiLaunchModalOpen(false)}
    />
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="bg-white border border-[rgba(107,78,255,0.15)] rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-[#F5F3FF] rounded-xl flex items-center justify-center shrink-0">
            <Linkedin className="w-5 h-5 text-[#6B4EFF]" />
          </div>
          <div>
            <p className="text-[#1E1B4B] font-semibold text-base">Launch LinkedIn Sequence</p>
            <p className="text-[#6B7280] text-sm mt-0.5">Set your daily limit, then go live.</p>
          </div>
        </div>

        {/* Lead list */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
            Enroll lead list <span className="font-normal normal-case text-[#9CA3AF]">(if not already enrolled)</span>
          </label>
          <select
            value={liLaunchListId}
            onChange={(e) => setLiLaunchListId(e.target.value)}
            className="w-full px-3 py-2.5 border border-[rgba(107,78,255,0.2)] rounded-lg text-sm text-[#1E1B4B] focus:outline-none focus:border-[#6B4EFF] bg-white"
          >
            <option value="">Skip — contacts already enrolled</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
          {liLaunchListId && (
            <p className="text-[11px] text-[#6B7280]">
              Leads will be enrolled before the sequence starts.
            </p>
          )}
        </div>

        {/* Daily limit */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
            Max LinkedIn actions per day
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={100}
              value={liLaunchEmailsPerDay}
              onChange={(e) =>
                setLiLaunchEmailsPerDay(Math.max(1, Math.min(100, Number(e.target.value) || 1)))
              }
              className="w-24 px-3 py-2.5 border border-[rgba(107,78,255,0.2)] rounded-lg text-sm text-[#1E1B4B] focus:outline-none focus:border-[#6B4EFF] focus:ring-2 focus:ring-[rgba(107,78,255,0.1)] bg-white text-center font-mono"
            />
            <div className="flex gap-1.5 flex-wrap">
              {[10, 20, 30, 50].map((v) => (
                <button
                  key={v}
                  onClick={() => setLiLaunchEmailsPerDay(v)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                    liLaunchEmailsPerDay === v
                      ? "text-white border-[#6B4EFF]"
                      : "bg-white text-[#6B7280] border-[rgba(107,78,255,0.2)] hover:border-[#6B4EFF] hover:text-[#6B4EFF]"
                  }`}
                  style={liLaunchEmailsPerDay === v ? { background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" } : {}}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-[#9CA3AF]">
            Keep under 30/day to stay within LinkedIn's safe automation threshold.
          </p>
          {liLaunchEmailsPerDay > 50 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-700">
                High limit detected. Values above 50/day risk LinkedIn account restrictions.
              </p>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => setLiLaunchModalOpen(false)}
            disabled={liLaunching}
            className="flex-1 py-2.5 border border-[rgba(107,78,255,0.2)] text-[#6B7280] text-sm font-semibold rounded-lg hover:bg-[#F5F3FF] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmLiLaunch}
            disabled={liLaunching}
            className="flex-1 py-2.5 text-white text-sm font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            style={{ background: "linear-gradient(135deg, #6B4EFF, #8B5CF6)" }}
          >
            {liLaunching
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Launching…</>
              : <><Play className="w-4 h-4" /> Go Live</>}
          </button>
        </div>

      </div>
    </div>
  </>
)}
    </DashboardLayout>
  );
}