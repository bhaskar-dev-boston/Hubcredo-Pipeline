import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Globe, Loader2, RefreshCw, Wallet, CheckCircle,
  AlertCircle, Mail, Shield, Clock, Zap,
  ChevronDown, ChevronRight, Server, Thermometer, Send,
  Key, Copy, Check, Inbox, BarChart3, Tag, Activity,
  Wifi, WifiOff, Hash, Calendar, ExternalLink,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function authFetch(path: string, opts?: RequestInit) {
  return fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(opts?.headers ?? {}),
    },
  });
}

// ─── API types based on InboxKit docs ──────────────────────────────────────

interface InboxKitDomain {
  uid: string;
  name: string;
  status: string;
  registration_years?: number;
  created_at?: string;
  tld?: string;
  price?: string;
  renewal_date?: string;
  whois_privacy?: boolean;
  forwarding_url?: string;
  forwarding_email?: string;
  dmarc_email?: string;
  catch_all_email?: string;
  nameservers?: string[];
  nameserver_match_status?: "matched" | "moved" | "pending" | "unknown";
  actual_nameservers?: string[];
  assigned_mailboxes?: string | number;
  available_mailboxes?: string | number;
  connection_type?: string;
  tags?: string[];
  payment_type?: string;
  [key: string]: unknown;
}

interface InboxKitMailbox {
  uid: string;
  domain_name: string;
  username: string;
  first_name?: string;
  last_name?: string;
  platform?: string;
  status: string;
  forwarding_email?: string;
  profile_picture?: string | null;
  is_admin?: boolean;
  tags?: string[];
  sequencers?: unknown[];
  createdAt?: string;
  updatedAt?: string;
  renewal_date?: string;
  mailbox_update_status?: string;
  sequencer_status?: string;
  dns_propagation_status?: string;
  renewal_cycle?: string;
  renewal_status?: string;
  // credentials (loaded separately)
  smtp_host?: string;
  smtp_port?: number;
  imap_host?: string;
  imap_port?: number;
  [key: string]: unknown;
}

interface WalletData {
  balance?: number;
  total?: number;
  used?: number;
  currency?: string;
}

function copyToClipboard(text: string, label: string, setCopied: (k: string) => void) {
  navigator.clipboard.writeText(text).then(() => {
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  });
}

// ─── Color helpers ─────────────────────────────────────────────────────────

function statusColor(s: string) {
  const lower = (s ?? "").toLowerCase();
  if (lower === "active" || lower === "ready" || lower === "matched") {
    return { bg: "rgba(16,185,129,.1)", border: "rgba(16,185,129,.25)", text: "#059669" };
  }
  if (lower.includes("warm") || lower === "moved") {
    return { bg: "rgba(245,158,11,.1)", border: "rgba(245,158,11,.25)", text: "#D97706" };
  }
  if (lower === "pending" || lower === "processing" || lower === "queued") {
    return { bg: "rgba(99,102,241,.1)", border: "rgba(99,102,241,.2)", text: "#6366F1" };
  }
  if (lower === "unknown" || lower === "na") {
    return { bg: "rgba(107,114,128,.1)", border: "rgba(107,114,128,.2)", text: "#6B7280" };
  }
  return { bg: "rgba(107,114,128,.1)", border: "rgba(107,114,128,.2)", text: "#6B7280" };
}

function nsStatusIcon(s: string) {
  if (s === "matched") return <Wifi className="w-3 h-3 text-emerald-500" />;
  if (s === "moved") return <WifiOff className="w-3 h-3 text-amber-500" />;
  return <WifiOff className="w-3 h-3 text-gray-400" />;
}

function platformBadge(platform: string) {
  if (!platform) return null;
  const isGoogle = platform.toUpperCase().includes("GOOGLE");
  const isMicrosoft = platform.toUpperCase().includes("MICROSOFT") || platform.toUpperCase().includes("365");
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
      isGoogle
        ? "bg-blue-50 text-blue-600 border-blue-100"
        : isMicrosoft
        ? "bg-orange-50 text-orange-600 border-orange-100"
        : "bg-gray-50 text-gray-500 border-gray-100"
    }`}>
      {isGoogle ? "Google" : isMicrosoft ? "M365" : platform}
    </span>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function InboxKitPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<WalletData | null>(null);

  const [domains, setDomains] = useState<InboxKitDomain[]>([]);
  const [domainsLoading, setDomainsLoading] = useState(false);

  // Per-domain mailbox state: uid → mailboxes | "loading" | "error"
  const [domainMailboxes, setDomainMailboxes] = useState<
    Record<string, InboxKitMailbox[] | "loading" | "error">
  >({});

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState("");

  // ── Fetch helpers ──

  const checkConnection = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/inboxkit/validate");
      const data = await res.json();
      setConnected(data.connected);
      if (data.connected && data.wallet) setWallet(data.wallet);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDomains = useCallback(async () => {
    setDomainsLoading(true);
    try {
      const res = await authFetch("/api/inboxkit/domains");
      if (res.ok) {
        const data = await res.json();
        setDomains(data.domains ?? []);
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Failed to load domains", description: err.error ?? "Could not fetch domains.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", description: "Could not reach InboxKit API.", variant: "destructive" });
    } finally {
      setDomainsLoading(false);
    }
  }, []);

  // Fetch mailboxes for a specific domain on expand
  const fetchMailboxesForDomain = useCallback(async (domainName: string, uid: string) => {
    setDomainMailboxes(prev => ({ ...prev, [uid]: "loading" }));
    try {
      const res = await authFetch(`/api/inboxkit/mailboxes/by-domain?domain=${encodeURIComponent(domainName)}`);
      if (res.ok) {
        const data = await res.json();
        setDomainMailboxes(prev => ({ ...prev, [uid]: data.mailboxes ?? [] }));
      } else {
        setDomainMailboxes(prev => ({ ...prev, [uid]: "error" }));
      }
    } catch {
      setDomainMailboxes(prev => ({ ...prev, [uid]: "error" }));
    }
  }, []);

  useEffect(() => { checkConnection(); }, [checkConnection]);
  useEffect(() => { if (connected) fetchDomains(); }, [connected]);

  function handleRefresh() {
    setDomainMailboxes({});
    setExpanded(new Set());
    checkConnection();
    fetchDomains();
  }

  function toggleExpand(d: InboxKitDomain) {
    const uid = d.uid;
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
        // Fetch mailboxes lazily if not already loaded
        if (!domainMailboxes[uid]) {
          fetchMailboxesForDomain(d.name, uid);
        }
      }
      return next;
    });
  }

  // ── Derived stats ──

  const totalAssigned = domains.reduce((acc, d) => {
    const n = Number(d.assigned_mailboxes ?? 0);
    return acc + (isNaN(n) ? 0 : n);
  }, 0);

  const allMailboxesList = Object.values(domainMailboxes).flatMap(v =>
    Array.isArray(v) ? v : []
  );
  const totalMailboxCount = totalAssigned > 0 ? totalAssigned : allMailboxesList.length;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1E1B4B] tracking-tight">InboxKit</h1>
            <p className="text-sm text-[#6B7280] mt-0.5">Purchased domains and mailbox infrastructure</p>
          </div>
          {connected && (
            <button
              onClick={handleRefresh}
              disabled={domainsLoading}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-[#6B4EFF] bg-[#F5F3FF] border border-[rgba(107,78,255,.2)] rounded-lg hover:bg-[#EDE9FE] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${domainsLoading ? "animate-spin" : ""}`} /> Refresh
            </button>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-[#6B4EFF] animate-spin" />
          </div>
        )}

        {/* Not connected */}
        {!loading && connected === false && (
          <div className="bg-white border border-[rgba(107,78,255,.12)] rounded-2xl p-10 text-center shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-[#F5F3FF] border border-[rgba(107,78,255,.2)] flex items-center justify-center mx-auto mb-4">
              <Globe className="w-7 h-7 text-[#6B4EFF]" />
            </div>
            <h2 className="text-lg font-semibold text-[#1E1B4B] mb-2">InboxKit not connected</h2>
            <p className="text-sm text-[#6B7280] max-w-sm mx-auto mb-6">
              Add your InboxKit API key and Workspace ID in Settings to view your purchased domains and mailboxes.
            </p>
            <button
              onClick={() => setLocation("/dashboard/settings?tab=integrations")}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#6B4EFF] text-white text-sm font-semibold rounded-xl hover:bg-[#5B3FE0] transition-colors"
            >
              <Zap className="w-4 h-4" /> Connect InboxKit
            </button>
          </div>
        )}

        {/* Connected */}
        {!loading && connected === true && (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                {
                  icon: <CheckCircle className="w-5 h-5 text-emerald-500" />,
                  label: "Status",
                  value: "Connected",
                  valueClass: "text-emerald-600",
                },
                {
                  icon: <Globe className="w-5 h-5 text-[#6B4EFF]" />,
                  label: "Domains",
                  value: domainsLoading ? null : `${domains.length}`,
                },
                {
                  icon: <Inbox className="w-5 h-5 text-[#6B4EFF]" />,
                  label: "Mailboxes",
                  value: domainsLoading ? null : `${totalMailboxCount}`,
                },
                ...(wallet
                  ? [{
                      icon: <Wallet className="w-5 h-5 text-[#6B4EFF]" />,
                      label: "Wallet Balance",
                      value: wallet.balance != null
                        ? `${wallet.currency ?? ""}${Number(wallet.balance).toFixed(2)}`
                        : "—",
                    }]
                  : []),
              ].map(({ icon, label, value, valueClass }) => (
                <div key={label} className="bg-white border border-[rgba(107,78,255,.12)] rounded-xl p-4 shadow-sm flex items-center gap-3">
                  <div className="shrink-0">{icon}</div>
                  <div>
                    <p className="text-xs text-[#9CA3AF] font-medium uppercase tracking-wider">{label}</p>
                    <p className={`text-sm font-semibold text-[#1E1B4B] ${(valueClass as string) ?? ""}`}>
                      {value === null
                        ? <Loader2 className="w-4 h-4 animate-spin inline text-[#6B4EFF]" />
                        : value}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Domains table */}
            <div className="bg-white border border-[rgba(107,78,255,.12)] rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(107,78,255,.08)]">
                <h2 className="text-sm font-semibold text-[#1E1B4B] flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#6B4EFF]" /> Domains &amp; Mailboxes
                </h2>
                <span className="text-xs text-[#9CA3AF]">
                  {domains.length} domain{domains.length !== 1 ? "s" : ""} · {totalMailboxCount} mailbox{totalMailboxCount !== 1 ? "es" : ""}
                </span>
              </div>

              {domainsLoading ? (
                <div className="flex items-center justify-center py-14">
                  <Loader2 className="w-5 h-5 text-[#6B4EFF] animate-spin" />
                </div>
              ) : domains.length === 0 ? (
                <div className="py-14 text-center">
                  <Globe className="w-8 h-8 text-[#C4B5FD] mx-auto mb-3" />
                  <p className="text-sm text-[#6B7280]">No purchased domains yet</p>
                  <p className="text-xs text-[#9CA3AF] mt-1">Purchase domains through the Domain Finder.</p>
                </div>
              ) : (
                <div className="divide-y divide-[rgba(107,78,255,.06)]">
                  {domains.map((d) => {
                    const isOpen = expanded.has(d.uid);
                    const sc = statusColor(d.status);
                    const nsMatch = d.nameserver_match_status;
                    const assignedCount = Number(d.assigned_mailboxes ?? 0);
                    const availableCount = Number(d.available_mailboxes ?? 0);
                    const mboxState = domainMailboxes[d.uid];
                    const mboxes = Array.isArray(mboxState) ? mboxState : [];

                    return (
                      <div key={d.uid}>
                        {/* Domain row */}
                        <button
                          className="w-full flex items-center gap-4 px-6 py-4 hover:bg-[#FAFAFE] transition-colors text-left"
                          onClick={() => toggleExpand(d)}
                        >
                          <div className="w-9 h-9 rounded-xl bg-[#F5F3FF] border border-[rgba(107,78,255,.15)] flex items-center justify-center shrink-0">
                            <Globe className="w-4 h-4 text-[#6B4EFF]" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-[#1E1B4B]">{d.name}</p>
                              {d.tld && (
                                <span className="text-[10px] font-mono text-[#9CA3AF] bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded">
                                  .{d.tld}
                                </span>
                              )}
                              {nsMatch && (
                                <span className="flex items-center gap-1 text-[10px] font-medium" style={statusColor(nsMatch)}>
                                  {nsStatusIcon(nsMatch)} {nsMatch}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 mt-1 flex-wrap">
                              {d.renewal_date && (
                                <span className="flex items-center gap-1 text-xs text-[#9CA3AF]">
                                  <Calendar className="w-3 h-3" />
                                  Renews {new Date(d.renewal_date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                                </span>
                              )}
                              <span className="flex items-center gap-1 text-xs text-[#9CA3AF]">
                                <Mail className="w-3 h-3" />
                                {assignedCount} assigned · {availableCount} available
                              </span>
                              {d.connection_type && (
                                <span className="text-xs text-[#9CA3AF]">{d.connection_type}</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className="text-xs font-medium px-2.5 py-0.5 rounded-full border capitalize"
                              style={{ background: sc.bg, borderColor: sc.border, color: sc.text }}
                            >
                              {d.status}
                            </span>
                            {isOpen
                              ? <ChevronDown className="w-4 h-4 text-[#9CA3AF]" />
                              : <ChevronRight className="w-4 h-4 text-[#9CA3AF]" />}
                          </div>
                        </button>

                        {/* Expanded panel */}
                        {isOpen && (
                          <div className="bg-[#FAFAFE] border-t border-[rgba(107,78,255,.06)]">
                            {/* Domain detail strip */}
                            <div className="px-6 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-[rgba(107,78,255,.06)]">
                              {d.dmarc_email && (
                                <div>
                                  <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-0.5 flex items-center gap-1">
                                    <Shield className="w-3 h-3" /> DMARC Email
                                  </p>
                                  <p className="text-xs font-mono text-[#1E1B4B] truncate">{d.dmarc_email}</p>
                                </div>
                              )}
                              {d.forwarding_url && (
                                <div>
                                  <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-0.5 flex items-center gap-1">
                                    <ExternalLink className="w-3 h-3" /> Forwarding URL
                                  </p>
                                  <p className="text-xs text-[#1E1B4B] truncate">{d.forwarding_url}</p>
                                </div>
                              )}
                              {d.nameservers && d.nameservers.length > 0 && (
                                <div className="col-span-2">
                                  <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-0.5 flex items-center gap-1">
                                    <Server className="w-3 h-3" /> Nameservers
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    {d.nameservers.map((ns) => (
                                      <span key={ns} className="text-[10px] font-mono bg-white border border-[rgba(107,78,255,.1)] text-[#6B7280] px-1.5 py-0.5 rounded">
                                        {ns}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {d.tags && d.tags.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-0.5 flex items-center gap-1">
                                    <Tag className="w-3 h-3" /> Tags
                                  </p>
                                  <div className="flex gap-1 flex-wrap">
                                    {d.tags.map((t) => (
                                      <span key={t} className="text-[10px] bg-[#EDE9FE] text-[#6B4EFF] px-1.5 py-0.5 rounded">
                                        {t}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Mailboxes */}
                            <div className="px-6 py-4">
                              {mboxState === "loading" && (
                                <div className="flex items-center gap-2 py-4 text-sm text-[#9CA3AF]">
                                  <Loader2 className="w-4 h-4 animate-spin" /> Loading mailboxes…
                                </div>
                              )}
                              {mboxState === "error" && (
                                <div className="py-4 flex items-center gap-2 text-sm text-red-500">
                                  <AlertCircle className="w-4 h-4" /> Failed to load mailboxes.
                                </div>
                              )}
                              {Array.isArray(mboxState) && mboxes.length === 0 && (
                                <div className="py-6 text-center">
                                  <Inbox className="w-6 h-6 text-[#C4B5FD] mx-auto mb-2" />
                                  <p className="text-xs text-[#6B7280]">No mailboxes found for this domain.</p>
                                </div>
                              )}
                              {Array.isArray(mboxState) && mboxes.length > 0 && (
                                <div className="space-y-3">
                                  <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
                                    {mboxes.length} Mailbox{mboxes.length !== 1 ? "es" : ""}
                                  </p>
                                  {mboxes.map((m, mi) => {
                                    const email = `${m.username}@${m.domain_name}`;
                                    const displayName = [m.first_name, m.last_name].filter(Boolean).join(" ") || m.username;
                                    const mStatus = m.status ?? "active";
                                    const mc = statusColor(mStatus);
                                    const seqStatus = m.sequencer_status;
                                    const dnsStatus = m.dns_propagation_status;
                                    const mKey = m.uid ?? `${d.uid}-${mi}`;

                                    return (
                                      <div key={mKey} className="bg-white border border-[rgba(107,78,255,.1)] rounded-xl overflow-hidden">
                                        {/* Mailbox header */}
                                        <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(107,78,255,.06)]">
                                          <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                                            <Mail className="w-4 h-4 text-emerald-600" />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <p className="text-sm font-semibold text-[#1E1B4B] truncate">{email}</p>
                                              <button
                                                onClick={() => copyToClipboard(email, mKey, setCopied)}
                                                className="text-[#9CA3AF] hover:text-[#6B4EFF] transition-colors shrink-0"
                                                title="Copy email"
                                              >
                                                {copied === mKey
                                                  ? <Check className="w-3.5 h-3.5 text-emerald-500" />
                                                  : <Copy className="w-3.5 h-3.5" />}
                                              </button>
                                              {m.platform && platformBadge(m.platform)}
                                            </div>
                                            <div className="flex items-center gap-3 mt-0.5">
                                              {displayName && (
                                                <span className="text-xs text-[#9CA3AF]">{displayName}</span>
                                              )}
                                              {m.uid && (
                                                <span className="text-[10px] font-mono text-[#C4B5FD] truncate">
                                                  {m.uid.slice(0, 8)}…
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          <span
                                            className="text-xs font-medium px-2 py-0.5 rounded-full border capitalize shrink-0"
                                            style={{ background: mc.bg, borderColor: mc.border, color: mc.text }}
                                          >
                                            {mStatus}
                                          </span>
                                        </div>

                                        {/* Mailbox detail grid */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y divide-[rgba(107,78,255,.06)]">
                                          {/* Sequencer status */}
                                          <div className="px-4 py-3">
                                            <p className="text-[10px] text-[#9CA3AF] font-semibold uppercase tracking-wider flex items-center gap-1 mb-1">
                                              <Activity className="w-3 h-3" /> Sequencer
                                            </p>
                                            {seqStatus ? (
                                              <span
                                                className="text-xs font-medium capitalize px-1.5 py-0.5 rounded border"
                                                style={statusColor(seqStatus)}
                                              >
                                                {seqStatus}
                                              </span>
                                            ) : (
                                              <p className="text-xs text-[#9CA3AF]">—</p>
                                            )}
                                          </div>

                                          {/* DNS propagation */}
                                          <div className="px-4 py-3">
                                            <p className="text-[10px] text-[#9CA3AF] font-semibold uppercase tracking-wider flex items-center gap-1 mb-1">
                                              <Wifi className="w-3 h-3" /> DNS
                                            </p>
                                            {dnsStatus ? (
                                              <span
                                                className="text-xs font-medium capitalize px-1.5 py-0.5 rounded border"
                                                style={statusColor(dnsStatus)}
                                              >
                                                {dnsStatus}
                                              </span>
                                            ) : (
                                              <p className="text-xs text-[#9CA3AF]">—</p>
                                            )}
                                          </div>

                                          {/* Renewal */}
                                          <div className="px-4 py-3">
                                            <p className="text-[10px] text-[#9CA3AF] font-semibold uppercase tracking-wider flex items-center gap-1 mb-1">
                                              <Calendar className="w-3 h-3" /> Renewal
                                            </p>
                                            <p className="text-xs text-[#1E1B4B] capitalize">
                                              {m.renewal_cycle ?? "—"}
                                              {m.renewal_status && m.renewal_status !== "na" && (
                                                <span className="ml-1 text-[#9CA3AF]">({m.renewal_status})</span>
                                              )}
                                            </p>
                                          </div>

                                          {/* Created */}
                                          <div className="px-4 py-3">
                                            <p className="text-[10px] text-[#9CA3AF] font-semibold uppercase tracking-wider flex items-center gap-1 mb-1">
                                              <Clock className="w-3 h-3" /> Created
                                            </p>
                                            <p className="text-xs text-[#1E1B4B]">
                                              {m.createdAt
                                                ? new Date(m.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                                                : "—"}
                                            </p>
                                          </div>
                                        </div>

                                        {/* Tags row if any */}
                                        {m.tags && m.tags.length > 0 && (
                                          <div className="px-4 py-2 border-t border-[rgba(107,78,255,.06)] flex items-center gap-2 flex-wrap">
                                            <Tag className="w-3 h-3 text-[#9CA3AF]" />
                                            {m.tags.map((t: string) => (
                                              <span key={t} className="text-[10px] bg-[#EDE9FE] text-[#6B4EFF] px-1.5 py-0.5 rounded">
                                                {t}
                                              </span>
                                            ))}
                                          </div>
                                        )}

                                        {/* Sequencers linked */}
                                        {m.sequencers && (m.sequencers as unknown[]).length > 0 && (
                                          <div className="px-4 py-2 border-t border-[rgba(107,78,255,.06)]">
                                            <p className="text-[10px] text-[#9CA3AF] font-semibold uppercase tracking-wider mb-1">
                                              Sequencers ({(m.sequencers as unknown[]).length})
                                            </p>
                                            <div className="flex flex-wrap gap-1">
                                              {(m.sequencers as any[]).map((s: any, si: number) => (
                                                <span key={si} className="text-[10px] bg-gray-50 border border-gray-100 text-[#6B7280] px-1.5 py-0.5 rounded font-mono">
                                                  {typeof s === "string" ? s : s?.name ?? s?.uid ?? JSON.stringify(s)}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Info cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  icon: Shield,
                  title: "DMARC configured",
                  desc: "All purchased domains have DMARC email forwarding automatically set up for deliverability protection.",
                },
                {
                  icon: BarChart3,
                  title: "Email warm-up",
                  desc: "Mailboxes created via InboxKit are pre-warmed for better inbox placement across ESP providers.",
                },
                {
                  icon: AlertCircle,
                  title: "DNS propagation",
                  desc: "New domains may take 24–48 hours to fully propagate. Check nameserver status in each domain row.",
                },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="bg-[#F5F3FF] border border-[rgba(107,78,255,.12)] rounded-xl p-4">
                  <Icon className="w-4 h-4 text-[#6B4EFF] mb-2" />
                  <p className="text-xs font-semibold text-[#1E1B4B]">{title}</p>
                  <p className="text-xs text-[#6B7280] mt-1 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}