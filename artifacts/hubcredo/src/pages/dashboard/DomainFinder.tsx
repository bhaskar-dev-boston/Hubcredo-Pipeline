import { useState, useEffect, useCallback, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Globe, Search, Loader2, Briefcase, Sparkles, AlertCircle, ExternalLink, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";

interface DomainResult {
  id?: string;
  domain?: string | null;
  company_name?: string | null;
  website?: string | null;
  industry?: string | null;
  purpose?: string | null;
  keyword?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(opts?.headers ?? {}),
    },
  });
  return res;
}

const POLL_INTERVAL_MS = 10_000;

export default function DomainFinder() {
  const { toast } = useToast();
  const [keyword, setKeyword] = useState("");
  const [industry, setIndustry] = useState("");
  const [purpose, setPurpose] = useState("");
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingStored, setLoadingStored] = useState(true);
  const [storedDomains, setStoredDomains] = useState<DomainResult[]>([]);
  const [newDomainsAdded, setNewDomainsAdded] = useState(false);

  const knownCountRef = useRef<number>(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── fetch domains from Supabase (same as refetchLeads in Leads.tsx) ───────
  const fetchDomains = useCallback(async (silent = false) => {
    if (!silent) setLoadingStored(true);
    try {
      const res = await apiFetch("/api/domains");
      if (!res.ok) throw new Error("Failed to load");
      const data: DomainResult[] = await res.json();
      setStoredDomains(data);
      knownCountRef.current = data.length;
    } catch {
      // silent
    } finally {
      if (!silent) setLoadingStored(false);
    }
  }, []);

  // ── background poll: detect new domains silently ─────────────────────────
  const pollForNewDomains = useCallback(async () => {
    if (searching) return;
    try {
      const res = await apiFetch("/api/domains");
      if (!res.ok) return;
      const data: DomainResult[] = await res.json();
      if (data.length > knownCountRef.current) {
        knownCountRef.current = data.length;
        setStoredDomains(data);
        setNewDomainsAdded(true);
      }
    } catch {
      // silent
    }
  }, [searching]);

  // ── on mount: load + start background poll ────────────────────────────────
  useEffect(() => {
    fetchDomains();
    pollTimerRef.current = setInterval(pollForNewDomains, POLL_INTERVAL_MS);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [fetchDomains, pollForNewDomains]);

  // ── manual refresh ────────────────────────────────────────────────────────
  async function handleRefresh() {
    setRefreshing(true);
    setNewDomainsAdded(false);
    try {
      await fetchDomains(true);
      toast({ title: "Refreshed", description: "Domain list is up to date." });
    } catch {
      toast({ title: "Refresh failed", description: "Could not reload domains.", variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  }

  // ── search handler — same pattern as handleGenerateLeads in Leads.tsx ─────
  async function handleFind(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;

    setSearching(true);
    setNewDomainsAdded(false);

    try {
      const res = await apiFetch("/api/domains/find", {
        method: "POST",
        body: JSON.stringify({
          keyword: keyword.trim(),
          industry: industry.trim() || undefined,
          purpose: purpose.trim() || "outreach",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Domain search failed");

      toast({
        title: "Search started!",
        description: "Your AI workflow is running. Domains will appear here shortly.",
      });

      // ── Same as Leads.tsx: setTimeout → refetch after delay ──
      setTimeout(() => fetchDomains(true), 5000);
      setTimeout(() => fetchDomains(true), 10000);
      setTimeout(() => fetchDomains(true), 18000);

    } catch (err: unknown) {
      toast({
        title: "Search failed",
        description: err instanceof Error ? err.message : "Could not reach domain finder service.",
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-8 max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-6 sm:mb-8 pt-2">
          <h1
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", letterSpacing: "0.04em" }}
            className="text-[#0A0A0A] mb-1"
          >
            Domain Finder
          </h1>
          <p className="text-[#64748B] text-sm">
            Get available domains for the right industry and right purpose
          </p>
        </div>

        {/* Search card */}
        <div className="relative bg-gradient-to-br from-[#2563EB] to-[#7C3AED] rounded-2xl p-6 sm:p-8 mb-8 overflow-hidden">
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
          <div className="relative">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Globe className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white font-semibold text-base leading-tight">Find company domains</p>
                <p className="text-blue-100 text-xs">Enter a keyword — industry and purpose are optional</p>
              </div>
            </div>

            <form onSubmit={handleFind} className="flex flex-col gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder='Keyword — e.g. "fitness app", "saas crm", "healthcare startup" *'
                  required
                  className="w-full pl-9 pr-4 py-3 bg-white/15 border border-white/25 rounded-xl text-white placeholder:text-white/40 text-sm focus:outline-none focus:bg-white/20 focus:border-white/50 transition-all"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
                  <input
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="Industry — optional, e.g. fintech"
                    className="w-full pl-9 pr-4 py-3 bg-white/15 border border-white/25 rounded-xl text-white placeholder:text-white/40 text-sm focus:outline-none focus:bg-white/20 focus:border-white/50 transition-all"
                  />
                </div>
                <div className="flex-1 relative">
                  <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
                  <input
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="Purpose — optional, e.g. partnership"
                    className="w-full pl-9 pr-4 py-3 bg-white/15 border border-white/25 rounded-xl text-white placeholder:text-white/40 text-sm focus:outline-none focus:bg-white/20 focus:border-white/50 transition-all"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={searching || !keyword.trim()}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-white text-[#2563EB] font-bold rounded-xl hover:bg-blue-50 transition-all disabled:opacity-50 shadow-lg active:scale-95 text-sm"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {searching ? "Searching…" : "Find domains"}
              </button>
            </form>
          </div>
        </div>

        {/* Searching spinner — shown while POST is in flight */}
        {searching && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-14 h-14 bg-[#EFF6FF] rounded-2xl flex items-center justify-center">
              <Globe className="w-7 h-7 text-[#2563EB] animate-pulse" />
            </div>
            <div className="text-center">
              <p className="text-[#0A0A0A] font-semibold mb-1">AI is finding domains…</p>
              <p className="text-[#64748B] text-sm">This usually takes 10–20 seconds</p>
              <div className="mt-3 flex items-center justify-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 bg-[#2563EB] rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Initial loading skeleton */}
        {!searching && loadingStored && (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`flex items-center gap-3 px-5 py-3.5 ${i < 4 ? "border-b border-[#F1F5F9]" : ""}`}>
                <div className="w-7 h-7 rounded-lg bg-[#F1F5F9] animate-pulse shrink-0" />
                <div className="flex-1 h-4 bg-[#F1F5F9] rounded animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {/* New domains banner */}
        {newDomainsAdded && !searching && (
          <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl">
            <div className="flex items-center gap-2 text-sm text-[#1D4ED8] font-medium">
              <Sparkles className="w-4 h-4 shrink-0" />
              New domains were added!
            </div>
            <button
              onClick={() => setNewDomainsAdded(false)}
              className="text-xs text-[#2563EB] hover:text-[#1D4ED8] font-semibold shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Domain list — always renders from storedDomains (direct from Supabase) */}
        {!searching && !loadingStored && storedDomains.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-[#64748B] uppercase tracking-widest font-semibold">
                {storedDomains.length} available domain{storedDomains.length !== 1 ? "s" : ""} saved
              </p>
              <button
                onClick={handleRefresh}
                disabled={refreshing || searching}
                title="Refresh domain list from database"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E2E8F0] rounded-xl text-xs font-semibold text-[#475569] hover:bg-[#F5F7FA] hover:border-[#CBD5E1] transition-all disabled:opacity-50 shadow-sm active:scale-95"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              {storedDomains.map((d, i) => {
                const domainVal = d.domain || d.website || null;
                const href = domainVal
                  ? domainVal.startsWith("http") ? domainVal : `https://${domainVal}`
                  : null;
                const label = domainVal ?? d.company_name ?? "Unknown";
                return (
                  <div
                    key={d.id ?? i}
                    className={`flex items-center gap-3 px-5 py-3.5 hover:bg-[#F5F7FA] transition-colors ${i < storedDomains.length - 1 ? "border-b border-[#F1F5F9]" : ""}`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB] font-bold text-xs shrink-0">
                      {label[0]?.toUpperCase() ?? "?"}
                    </div>
                    <span className="flex-1 text-sm text-[#0A0A0A] font-medium truncate">{label}</span>
                    {d.keyword && (
                      <span className="hidden sm:inline text-xs text-[#64748B] bg-[#F5F7FA] border border-[#E2E8F0] px-2 py-0.5 rounded-full shrink-0">
                        {d.keyword}
                      </span>
                    )}
                    {href && (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="shrink-0 flex items-center gap-1 text-xs text-[#2563EB] hover:text-[#1D4ED8] transition-colors ml-2">
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Visit</span>
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!searching && !loadingStored && storedDomains.length === 0 && (
          <div className="bg-white border border-dashed border-[#E2E8F0] rounded-2xl p-16 text-center">
            <div className="w-12 h-12 bg-[#F5F7FA] rounded-xl flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6 text-[#64748B]" />
            </div>
            <p className="text-[#0A0A0A] font-semibold mb-1">No domains yet</p>
            <p className="text-[#64748B] text-sm mb-4">
              Enter a keyword above to discover available company domains.
            </p>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}