import { useState, useEffect, useCallback, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Inbox as InboxIcon,
  Loader2,
  Mail,
  MailOpen,
  RefreshCw,
  Tag,
  Send,
  ChevronDown,
  X,
  CornerDownLeft,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";

async function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(opts?.headers ?? {}),
    },
  });
}

interface InboxReply {
  id: string;
  thread_id?: string | null;
  campaign_id?: string | null;
  from_email: string;
  from_name?: string | null;
  subject?: string | null;
  body?: string | null;
  received_at: string;
  is_read: boolean;
  eaccount?: string | null;
  email_campaigns?: { name: string; sending_domain: string } | null;
}

interface ThreadMessage {
  id: string;
  direction: "sent" | "received";
  from_email: string;
  from_name?: string | null;
  to_email?: string | null;
  subject?: string | null;
  body?: string | null;
  timestamp: string;
  eaccount?: string | null;
  is_unread: boolean;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MessageBubble({ msg, myEmail }: { msg: ThreadMessage; myEmail: string }) {
  const isSent = msg.direction === "sent";
  const initial = (msg.from_name || msg.from_email)[0]?.toUpperCase() ?? "?";

  return (
    <div className={`flex gap-3 ${isSent ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
          isSent
            ? "bg-gradient-to-br from-[#6B4EFF] to-[#8B5CF6] text-white"
            : "bg-[#F5F3FF] text-[#6B4EFF] border border-[rgba(107,78,255,0.2)]"
        }`}
      >
        {isSent ? (myEmail[0]?.toUpperCase() ?? "Y") : initial}
      </div>

      <div className={`max-w-[80%] ${isSent ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <div className="flex items-center gap-2 mb-0.5">
          {isSent ? (
            <>
              <span className="text-xs text-[#9CA3AF]">{formatDateTime(msg.timestamp)}</span>
              <span className="text-xs font-medium text-[#6B7280]">You</span>
              <ArrowUpRight className="w-3 h-3 text-[#6B4EFF]" />
            </>
          ) : (
            <>
              <ArrowDownLeft className="w-3 h-3 text-[#0D9488]" />
              <span className="text-xs font-medium text-[#6B7280]">
                {msg.from_name || msg.from_email}
              </span>
              <span className="text-xs text-[#9CA3AF]">{formatDateTime(msg.timestamp)}</span>
            </>
          )}
        </div>
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isSent
              ? "bg-[#6B4EFF] text-white rounded-tr-sm"
              : "bg-white border border-[rgba(107,78,255,0.15)] text-[#1E1B4B] rounded-tl-sm shadow-sm"
          }`}
        >
          {msg.body || <span className="opacity-50 italic">No content</span>}
        </div>
      </div>
    </div>
  );
}

function ReplyComposer({
  selected,
  myEmail,
  onSent,
}: {
  selected: InboxReply;
  myEmail: string;
  onSent: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const replySubject = selected.subject
    ? selected.subject.startsWith("Re:")
      ? selected.subject
      : `Re: ${selected.subject}`
    : "Re: (no subject)";

  async function handleSend() {
    if (!body.trim()) return;
    setSending(true);
    try {
      const res = await apiFetch(`/api/inbox/${selected.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ subject: replySubject, body: body.trim() }),
      });
      if (res.ok) {
        const json = await res.json();
        toast({ title: `Reply sent from ${json.eaccount ?? myEmail}!` });
        setBody("");
        setOpen(false);
        onSent();
      } else {
        const err = await res.json().catch(() => ({}));
        toast({
          title: "Failed to send reply",
          description: err?.details ?? err?.error ?? "Unknown error",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Network error sending reply", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  return (
    <div className="border-t border-[rgba(107,78,255,0.12)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#F5F3FF] transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-[#1E1B4B]">
          <CornerDownLeft className="w-4 h-4 text-[#6B4EFF]" />
          Reply to {selected.from_name || selected.from_email}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-[#9CA3AF] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-5 pb-4">
          <div className="flex flex-col gap-1 mb-3 text-xs text-[#6B7280] bg-[#F9FAFB] border border-[rgba(107,78,255,0.1)] rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="w-8 font-medium text-[#9CA3AF]">From</span>
              <span className="text-[#1E1B4B] font-medium">{myEmail}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-8 font-medium text-[#9CA3AF]">To</span>
              <span className="text-[#6B7280]">{selected.from_email}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-8 font-medium text-[#9CA3AF]">Sub</span>
              <span className="truncate text-[#6B7280]">{replySubject}</span>
            </div>
          </div>

          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => { setBody(e.target.value); handleInput(); }}
            onKeyDown={handleKeyDown}
            placeholder="Write your reply…"
            rows={3}
            className="w-full resize-none rounded-lg border border-[rgba(107,78,255,0.2)] bg-white px-4 py-3 text-sm text-[#1E1B4B] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[rgba(107,78,255,0.2)] focus:border-[#6B4EFF] transition-all leading-relaxed shadow-sm"
            style={{ minHeight: 80 }}
          />

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-[#9CA3AF]">
              <kbd className="px-1.5 py-0.5 bg-[#F5F3FF] border border-[rgba(107,78,255,0.2)] rounded text-[10px] font-mono text-[#6B4EFF]">⌘ Enter</kbd>{" "}
              to send
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setBody(""); setOpen(false); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#6B7280] hover:text-[#1E1B4B] rounded-lg hover:bg-[#F5F3FF] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Discard
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !body.trim()}
                className="flex items-center gap-2 px-4 py-1.5 bg-[#6B4EFF] hover:bg-[#5B3FE0] text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {sending ? "Sending…" : "Send Reply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Inbox() {
  const { toast } = useToast();
  const [replies, setReplies] = useState<InboxReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<InboxReply | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [myEmail, setMyEmail] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [refreshing, setRefreshing] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const fetchReplies = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await apiFetch("/api/inbox");
      if (res.ok) {
        const data = await res.json();
        const arr: InboxReply[] = Array.isArray(data) ? data : [];
        setReplies(arr);
        const first = arr.find((r) => r.eaccount);
        if (first?.eaccount) setMyEmail(first.eaccount);
      } else {
        setReplies([]);
        toast({ title: "Failed to load inbox", variant: "destructive" });
      }
    } catch {
      setReplies([]);
      toast({ title: "Error loading inbox", variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchReplies(); }, [fetchReplies]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread]);

  async function fetchThread(reply: InboxReply) {
    setThreadLoading(true);
    setThread([]);
    try {
      const res = await apiFetch(`/api/inbox/${reply.id}/thread`);
      if (res.ok) {
        const data = await res.json();
        setThread(data.messages ?? []);
        const sentMsg = (data.messages ?? []).find((m: ThreadMessage) => m.direction === "sent");
        if (sentMsg?.eaccount) setMyEmail(sentMsg.eaccount);
        else if (sentMsg?.from_email) setMyEmail(sentMsg.from_email);
      } else {
        setThread([{
          id: reply.id,
          direction: "received",
          from_email: reply.from_email,
          from_name: reply.from_name ?? null,
          subject: reply.subject ?? null,
          body: reply.body ?? null,
          timestamp: reply.received_at,
          eaccount: reply.eaccount ?? null,
          is_unread: !reply.is_read,
        }]);
      }
    } catch {
      setThread([]);
    } finally {
      setThreadLoading(false);
    }
  }

  async function handleOpen(reply: InboxReply) {
    setSelected(reply);
    fetchThread(reply);
    if (!reply.is_read) {
      const res = await apiFetch(`/api/inbox/${reply.id}/read`, { method: "PATCH" });
      if (res.ok) {
        setReplies((prev) => prev.map((r) => r.id === reply.id ? { ...r, is_read: true } : r));
        setSelected((prev) => prev ? { ...prev, is_read: true } : prev);
      }
    }
  }

  const filtered = filter === "unread" ? replies.filter((r) => !r.is_read) : replies;
  const unreadCount = replies.filter((r) => !r.is_read).length;

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 pt-2">
          <div>
            <h1
              style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: "2rem", letterSpacing: "0.04em" }}
              className="text-[#1E1B4B] mb-1 flex items-center gap-3"
            >
              Reply Inbox
              {unreadCount > 0 && (
                <span
                  className="text-base font-normal bg-[#6B4EFF] text-white px-2.5 py-0.5 rounded-full"
                  style={{ fontFamily: "inherit" }}
                >
                  {unreadCount}
                </span>
              )}
            </h1>
            <p className="text-[#6B7280] text-sm">Full conversation history — sent & received</p>
          </div>
          <button
            onClick={() => fetchReplies(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 border border-[rgba(107,78,255,0.2)] text-[#6B7280] text-sm font-medium rounded-lg hover:bg-[#F5F3FF] hover:text-[#6B4EFF] hover:border-[#6B4EFF] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Left: Reply list */}
          <div className="lg:col-span-2">
            <div className="flex items-center mb-3 bg-[#F5F3FF] rounded-xl border border-[rgba(107,78,255,0.12)] overflow-hidden">
              {(["all", "unread"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                    filter === f
                      ? "bg-white text-[#6B4EFF] border-b-2 border-[#6B4EFF]"
                      : "text-[#6B7280] hover:text-[#6B4EFF]"
                  }`}
                >
                  {f === "unread" ? `Unread (${unreadCount})` : "All"}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 text-[#6B4EFF] animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-[#F8F7FF] border border-[rgba(107,78,255,0.12)] rounded-xl p-10 text-center">
                <InboxIcon className="w-8 h-8 text-[#C4B5FD] mx-auto mb-2" />
                <p className="text-sm font-medium text-[#1E1B4B]">
                  {filter === "unread" ? "No unread replies" : "No replies yet"}
                </p>
                <p className="text-xs text-[#9CA3AF] mt-1">
                  {filter === "unread" ? "You're all caught up!" : "Replies from your campaigns will appear here"}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map((reply) => {
                  const isSelected = selected?.id === reply.id;
                  return (
                    <button
                      key={reply.id}
                      onClick={() => handleOpen(reply)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                        isSelected
                          ? "bg-[#F0EEFF] border-[#6B4EFF]"
                          : reply.is_read
                          ? "bg-white border-[rgba(107,78,255,0.1)] hover:border-[rgba(107,78,255,0.3)] hover:bg-[#F9F8FF]"
                          : "bg-white border-[rgba(107,78,255,0.2)] hover:border-[#6B4EFF] hover:bg-[#F0EEFF]"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="shrink-0 mt-0.5">
                          {reply.is_read
                            ? <MailOpen className={`w-4 h-4 ${isSelected ? "text-[#6B4EFF]" : "text-[#9CA3AF]"}`} />
                            : <Mail className="w-4 h-4 text-[#6B4EFF]" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-sm truncate ${
                              isSelected ? "text-[#6B4EFF] font-semibold"
                              : reply.is_read ? "text-[#6B7280]"
                              : "text-[#1E1B4B] font-semibold"
                            }`}>
                              {reply.from_name || reply.from_email}
                            </p>
                            <span className={`text-xs shrink-0 ${isSelected ? "text-[#6B4EFF]" : "text-[#9CA3AF]"}`}>
                              {timeAgo(reply.received_at)}
                            </span>
                          </div>
                          <p className={`text-xs truncate mt-0.5 ${
                            isSelected ? "text-[#8B5CF6]"
                            : reply.is_read ? "text-[#9CA3AF]"
                            : "text-[#6B7280]"
                          }`}>
                            {reply.subject || "(no subject)"}
                          </p>
                          {reply.email_campaigns && (
                            <p className={`text-xs mt-0.5 truncate ${isSelected ? "text-[#6B4EFF]" : "text-[rgba(107,78,255,0.6)]"}`}>
                              {reply.email_campaigns.name}
                            </p>
                          )}
                        </div>
                        {!reply.is_read && (
                          <div className="w-2 h-2 bg-[#6B4EFF] rounded-full shrink-0 mt-1.5" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Thread + composer */}
          <div className="lg:col-span-3 flex flex-col">
            {selected ? (
              <div className="bg-white border border-[rgba(107,78,255,0.15)] rounded-xl overflow-hidden flex flex-col shadow-sm" style={{ minHeight: 500 }}>
                {/* Thread header */}
                <div className="px-5 py-4 border-b border-[rgba(107,78,255,0.1)] flex items-start justify-between bg-[#FAFAFA]">
                  <div>
                    <h2 className="text-base font-semibold text-[#1E1B4B] leading-tight">
                      {selected.subject || "(no subject)"}
                    </h2>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-[#6B7280]">
                        {selected.from_name || selected.from_email}
                        <span className="text-[#9CA3AF]"> · {selected.from_email}</span>
                      </span>
                    </div>
                  </div>
                  {selected.email_campaigns && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#F5F3FF] border border-[rgba(107,78,255,0.2)] rounded-lg text-xs text-[#6B4EFF] font-medium shrink-0">
                      <Tag className="w-3 h-3" />
                      {selected.email_campaigns.name}
                    </div>
                  )}
                </div>

                {/* Thread messages */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 bg-[#FDFCFF]" style={{ maxHeight: 420 }}>
                  {threadLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-5 h-5 text-[#6B4EFF] animate-spin" />
                      <span className="ml-2 text-sm text-[#6B7280]">Loading conversation…</span>
                    </div>
                  ) : thread.length === 0 ? (
                    <p className="text-sm text-[#9CA3AF] text-center py-8 italic">No messages found</p>
                  ) : (
                    <>
                      {thread.map((msg) => (
                        <MessageBubble key={msg.id} msg={msg} myEmail={myEmail} />
                      ))}
                      <div ref={threadEndRef} />
                    </>
                  )}
                </div>

                <ReplyComposer
                  key={selected.id}
                  selected={selected}
                  myEmail={myEmail}
                  onSent={() => {
                    fetchThread(selected);
                    fetchReplies(true);
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-center border border-[rgba(107,78,255,0.12)] rounded-xl bg-[#F8F7FF]">
                <InboxIcon className="w-10 h-10 text-[#C4B5FD] mb-3" />
                <p className="text-[#6B7280] font-medium">Select a conversation</p>
                <p className="text-sm text-[#9CA3AF] mt-1">Full sent & received history will appear here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}