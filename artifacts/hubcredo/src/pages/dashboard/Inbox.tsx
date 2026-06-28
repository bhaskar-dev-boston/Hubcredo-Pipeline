import { useState, useEffect, useCallback, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Inbox as InboxIcon, Loader2, Mail, MailOpen, RefreshCw,
  Tag, Send, ChevronDown, X, CornerDownLeft, ArrowUpRight, ArrowDownLeft,
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

// Shape returned by GET /api/replyio/inbox/threads
interface InboxThread {
  threadId: number;
  contactId: number | null;
  name: string;
  email: string | null;
  sequenceId: number | null;
  sequenceName: string | null;
  subject: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
  isRead: boolean;
  unreadCount: number;
  category: string | null;
  hasMeetingIntent: boolean;
  status: string | null;
}

// Shape returned by GET /api/replyio/inbox/threads/:id/messages
interface ThreadMessage {
  id: number;
  text: string;
  isOutgoing: boolean;
  sentAt: string;
  fromName: string | null;
  subject: string | null;
  fromEmail: string | null;
  to: string[];
  channel: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function MessageBubble({ msg }: { msg: ThreadMessage }) {
  const isSent = msg.isOutgoing;
  const senderInitial = (msg.fromName || msg.fromEmail || "?")[0].toUpperCase();

  return (
    <div className={`flex gap-3 ${isSent ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
        isSent
          ? "bg-gradient-to-br from-[#6B4EFF] to-[#8B5CF6] text-white"
          : "bg-[#F5F3FF] text-[#6B4EFF] border border-[rgba(107,78,255,0.2)]"
      }`}>
        {isSent ? "Y" : senderInitial}
      </div>

      <div className={`max-w-[80%] flex flex-col gap-1 ${isSent ? "items-end" : "items-start"}`}>
        <div className="flex items-center gap-2 mb-0.5">
          {isSent ? (
            <>
              <span className="text-xs text-[#9CA3AF]">{formatDateTime(msg.sentAt)}</span>
              <span className="text-xs font-medium text-[#6B7280]">You</span>
              <ArrowUpRight className="w-3 h-3 text-[#6B4EFF]" />
            </>
          ) : (
            <>
              <ArrowDownLeft className="w-3 h-3 text-[#0D9488]" />
              <span className="text-xs font-medium text-[#6B7280]">
                {msg.fromName || msg.fromEmail || "Contact"}
              </span>
              <span className="text-xs text-[#9CA3AF]">{formatDateTime(msg.sentAt)}</span>
            </>
          )}
        </div>
        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isSent
            ? "bg-[#6B4EFF] text-white rounded-tr-sm"
            : "bg-white border border-[rgba(107,78,255,0.15)] text-[#1E1B4B] rounded-tl-sm shadow-sm"
        }`}>
          {/* Strip HTML tags from body — Reply.io sends HTML for emails */}
          {msg.text
            ? msg.text.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim() || msg.text
            : <span className="opacity-50 italic">No content</span>}
        </div>
      </div>
    </div>
  );
}

function ReplyComposer({
  thread,
  onSent,
}: {
  thread: InboxThread;
  onSent: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleSend() {
    if (!body.trim()) return;
    setSending(true);
    try {
      const res = await apiFetch(`/api/replyio/inbox/threads/${thread.threadId}/reply`, {
        method: "POST",
        body: JSON.stringify({ message: body.trim() }),
      });
      if (res.ok) {
        toast({ title: "Reply sent!" });
        setBody("");
        setOpen(false);
        onSent();
      } else {
        const err = await res.json().catch(() => ({}));
        toast({
          title: "Failed to send reply",
          description: err?.error ?? "Unknown error",
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
          Reply to {thread.name}
        </div>
        <ChevronDown className={`w-4 h-4 text-[#9CA3AF] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-5 pb-4">
          <div className="flex flex-col gap-1 mb-3 text-xs text-[#6B7280] bg-[#F9FAFB] border border-[rgba(107,78,255,0.1)] rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="w-8 font-medium text-[#9CA3AF]">To</span>
              <span className="text-[#6B7280]">{thread.email ?? thread.name}</span>
            </div>
            {thread.subject && (
              <div className="flex items-center gap-2">
                <span className="w-8 font-medium text-[#9CA3AF]">Sub</span>
                <span className="truncate text-[#6B7280]">Re: {thread.subject}</span>
              </div>
            )}
          </div>

          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => { setBody(e.target.value); handleInput(); }}
            onKeyDown={handleKeyDown}
            placeholder="Write your reply… (⌘ Enter to send)"
            rows={3}
            className="w-full resize-none rounded-lg border border-[rgba(107,78,255,0.2)] bg-white px-4 py-3 text-sm text-[#1E1B4B] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[rgba(107,78,255,0.2)] focus:border-[#6B4EFF] transition-all leading-relaxed shadow-sm"
            style={{ minHeight: 80 }}
          />

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-[#9CA3AF]">
              <kbd className="px-1.5 py-0.5 bg-[#F5F3FF] border border-[rgba(107,78,255,0.2)] rounded text-[10px] font-mono text-[#6B4EFF]">⌘ Enter</kbd> to send
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setBody(""); setOpen(false); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#6B7280] hover:text-[#1E1B4B] rounded-lg hover:bg-[#F5F3FF] transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Discard
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
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<InboxThread | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [refreshing, setRefreshing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchThreads = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await apiFetch("/api/replyio/inbox/threads");
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads ?? []);
      } else {
        setThreads([]);
        toast({ title: "Failed to load inbox", variant: "destructive" });
      }
    } catch {
      setThreads([]);
      toast({ title: "Error loading inbox", variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function fetchMessages(thread: InboxThread) {
    setMessagesLoading(true);
    setMessages([]);
    try {
      const res = await apiFetch(`/api/replyio/inbox/threads/${thread.threadId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
      } else {
        toast({ title: "Failed to load messages", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error loading messages", variant: "destructive" });
    } finally {
      setMessagesLoading(false);
    }
  }

  function handleOpen(thread: InboxThread) {
    setSelected(thread);
    fetchMessages(thread);
    // Mark as read optimistically in local state
    if (!thread.isRead) {
      setThreads((prev) =>
        prev.map((t) => t.threadId === thread.threadId ? { ...t, isRead: true, unreadCount: 0 } : t)
      );
    }
  }

  const filtered = filter === "unread" ? threads.filter((t) => !t.isRead) : threads;
  const unreadCount = threads.filter((t) => !t.isRead).length;

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
                <span className="text-base font-normal bg-[#6B4EFF] text-white px-2.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </h1>
            <p className="text-[#6B7280] text-sm">Email conversations from your Reply.io sequences</p>
          </div>
          <button
            onClick={() => fetchThreads(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 border border-[rgba(107,78,255,0.2)] text-[#6B7280] text-sm font-medium rounded-lg hover:bg-[#F5F3FF] hover:text-[#6B4EFF] hover:border-[#6B4EFF] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Left: Thread list */}
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
                  {filter === "unread" ? "No unread replies" : "No conversations yet"}
                </p>
                <p className="text-xs text-[#9CA3AF] mt-1">
                  {filter === "unread" ? "You're all caught up!" : "Replies from your sequences will appear here"}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map((thread) => {
                  const isSelected = selected?.threadId === thread.threadId;
                  return (
                    <button
                      key={thread.threadId}
                      onClick={() => handleOpen(thread)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                        isSelected
                          ? "bg-[#F0EEFF] border-[#6B4EFF]"
                          : thread.isRead
                          ? "bg-white border-[rgba(107,78,255,0.1)] hover:border-[rgba(107,78,255,0.3)] hover:bg-[#F9F8FF]"
                          : "bg-white border-[rgba(107,78,255,0.2)] hover:border-[#6B4EFF] hover:bg-[#F0EEFF]"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="shrink-0 mt-0.5">
                          {thread.isRead
                            ? <MailOpen className={`w-4 h-4 ${isSelected ? "text-[#6B4EFF]" : "text-[#9CA3AF]"}`} />
                            : <Mail className="w-4 h-4 text-[#6B4EFF]" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-sm truncate ${
                              isSelected ? "text-[#6B4EFF] font-semibold"
                              : thread.isRead ? "text-[#6B7280]"
                              : "text-[#1E1B4B] font-semibold"
                            }`}>
                              {thread.name}
                            </p>
                            <span className={`text-xs shrink-0 ${isSelected ? "text-[#6B4EFF]" : "text-[#9CA3AF]"}`}>
                              {timeAgo(thread.lastMessageAt)}
                            </span>
                          </div>
                          <p className={`text-xs truncate mt-0.5 ${
                            isSelected ? "text-[#8B5CF6]"
                            : thread.isRead ? "text-[#9CA3AF]"
                            : "text-[#6B7280]"
                          }`}>
                            {thread.subject || thread.lastMessage || "(no subject)"}
                          </p>
                          {thread.sequenceName && (
                            <p className={`text-xs mt-0.5 truncate ${isSelected ? "text-[#6B4EFF]" : "text-[rgba(107,78,255,0.6)]"}`}>
                              {thread.sequenceName}
                            </p>
                          )}
                        </div>
                        {!thread.isRead && (
                          <div className="w-2 h-2 bg-[#6B4EFF] rounded-full shrink-0 mt-1.5" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Messages + composer */}
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
                        {selected.name}
                        {selected.email && <span className="text-[#9CA3AF]"> · {selected.email}</span>}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {selected.category && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#F5F3FF] border border-[rgba(107,78,255,0.2)] rounded-lg text-xs text-[#6B4EFF] font-medium">
                        <Tag className="w-3 h-3" />
                        {selected.category}
                      </div>
                    )}
                    <button
                      onClick={() => fetchMessages(selected)}
                      className="p-1.5 text-[#9CA3AF] hover:text-[#6B4EFF] hover:bg-[#F5F3FF] rounded-lg transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${messagesLoading ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 bg-[#FDFCFF]" style={{ maxHeight: 420 }}>
                  {messagesLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-5 h-5 text-[#6B4EFF] animate-spin" />
                      <span className="ml-2 text-sm text-[#6B7280]">Loading conversation…</span>
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="text-sm text-[#9CA3AF] text-center py-8 italic">No messages found</p>
                  ) : (
                    <>
                      {messages.map((msg) => (
                        <MessageBubble key={msg.id} msg={msg} />
                      ))}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>

                <ReplyComposer
                  key={selected.threadId}
                  thread={selected}
                  onSent={() => {
                    fetchMessages(selected);
                    fetchThreads(true);
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