import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Inbox as InboxIcon, Loader2, Mail, MailOpen, RefreshCw, Circle, Tag } from "lucide-react";
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
  campaign_id?: string | null;
  from_email: string;
  from_name?: string | null;
  subject?: string | null;
  body?: string | null;
  received_at: string;
  is_read: boolean;
  email_campaigns?: { name: string; sending_domain: string } | null;
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

export default function Inbox() {
  const { toast } = useToast();
  const [replies, setReplies] = useState<InboxReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<InboxReply | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [refreshing, setRefreshing] = useState(false);

  const fetchReplies = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await apiFetch("/api/inbox");
      if (res.ok) setReplies(await res.json());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchReplies(); }, [fetchReplies]);

  async function handleOpen(reply: InboxReply) {
    setSelected(reply);
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
      <div className="p-4 sm:p-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 pt-2">
          <div>
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", letterSpacing: "0.04em" }} className="text-[#0A0A0A] mb-1 flex items-center gap-3">
              Reply Inbox
              {unreadCount > 0 && (
                <span className="text-base font-normal bg-[#2563EB] text-white px-2.5 py-0.5 rounded-full" style={{ fontFamily: "inherit" }}>
                  {unreadCount}
                </span>
              )}
            </h1>
            <p className="text-[#64748B] text-sm">Replies from your email campaigns, all in one place</p>
          </div>
          <button
            onClick={() => fetchReplies(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 border border-[#E2E8F0] text-[#64748B] text-sm font-medium rounded-lg hover:bg-[#F5F7FA] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Left: Reply list */}
          <div className="lg:col-span-2">
            {/* Filter tabs */}
            <div className="flex items-center gap-1 mb-3 bg-[#F5F7FA] rounded-lg p-1">
              {(["all", "unread"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors capitalize ${
                    filter === f ? "bg-white text-[#0A0A0A] shadow-sm" : "text-[#64748B] hover:text-[#0A0A0A]"
                  }`}
                >
                  {f === "unread" ? `Unread (${unreadCount})` : "All"}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 text-[#64748B] animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-white border border-dashed border-[#E2E8F0] rounded-xl p-10 text-center">
                <InboxIcon className="w-8 h-8 text-[#CBD5E1] mx-auto mb-2" />
                <p className="text-sm font-medium text-[#0A0A0A]">
                  {filter === "unread" ? "No unread replies" : "No replies yet"}
                </p>
                <p className="text-xs text-[#94A3B8] mt-1">
                  {filter === "unread" ? "You're all caught up!" : "Replies from your campaigns will appear here"}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map((reply) => (
                  <button
                    key={reply.id}
                    onClick={() => handleOpen(reply)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                      selected?.id === reply.id
                        ? "bg-[#EFF6FF] border-[#BFDBFE]"
                        : reply.is_read
                        ? "bg-white border-[#E2E8F0] hover:border-[#CBD5E1] hover:bg-[#F5F7FA]"
                        : "bg-white border-[#E2E8F0] hover:border-[#2563EB]/30"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="shrink-0 mt-0.5">
                        {reply.is_read
                          ? <MailOpen className="w-4 h-4 text-[#94A3B8]" />
                          : <Mail className="w-4 h-4 text-[#2563EB]" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm truncate ${reply.is_read ? "text-[#64748B]" : "text-[#0A0A0A] font-semibold"}`}>
                            {reply.from_name || reply.from_email}
                          </p>
                          <span className="text-xs text-[#94A3B8] shrink-0">{timeAgo(reply.received_at)}</span>
                        </div>
                        <p className={`text-xs truncate mt-0.5 ${reply.is_read ? "text-[#94A3B8]" : "text-[#64748B]"}`}>
                          {reply.subject || "(no subject)"}
                        </p>
                        {reply.email_campaigns && (
                          <p className="text-xs text-[#2563EB]/70 mt-0.5 truncate">
                            {reply.email_campaigns.name}
                          </p>
                        )}
                      </div>
                      {!reply.is_read && (
                        <div className="w-2 h-2 bg-[#2563EB] rounded-full shrink-0 mt-1.5" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Reply detail */}
          <div className="lg:col-span-3">
            {selected ? (
              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                {/* Email header */}
                <div className="px-6 py-4 border-b border-[#E2E8F0]">
                  <h2 className="text-base font-semibold text-[#0A0A0A] mb-2 leading-tight">
                    {selected.subject || "(no subject)"}
                  </h2>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#2563EB] to-[#7C3AED] flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {(selected.from_name || selected.from_email)[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#0A0A0A]">
                        {selected.from_name || selected.from_email}
                      </p>
                      <p className="text-xs text-[#64748B]">{selected.from_email}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-[#94A3B8]">{new Date(selected.received_at).toLocaleString()}</p>
                      {selected.email_campaigns && (
                        <p className="text-xs text-[#2563EB] mt-0.5">
                          via {selected.email_campaigns.name}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Email body */}
                <div className="px-6 py-5">
                  {selected.body ? (
                    <pre className="text-sm text-[#0A0A0A] whitespace-pre-wrap leading-relaxed font-sans">
                      {selected.body}
                    </pre>
                  ) : (
                    <p className="text-sm text-[#94A3B8] italic">No message body</p>
                  )}
                </div>

                {/* Campaign tag */}
                {selected.email_campaigns && (
                  <div className="px-6 pb-4">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg text-xs text-[#2563EB] font-medium">
                      <Tag className="w-3 h-3" />
                      {selected.email_campaigns.name} · {selected.email_campaigns.sending_domain}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-center border border-dashed border-[#E2E8F0] rounded-xl bg-white">
                <InboxIcon className="w-10 h-10 text-[#CBD5E1] mb-3" />
                <p className="text-[#64748B] font-medium">Select a reply to read it</p>
                <p className="text-sm text-[#94A3B8] mt-1">Replies from your active campaigns show here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
