import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Mail, Plus, Loader2, Zap, Send, BarChart2, Inbox,
  Trash2, Play, Pause, ChevronRight, ChevronDown,
  CheckCircle2, Clock, AlertCircle, Sparkles, X,
  ExternalLink, Edit3, Globe, Users, ArrowRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { useListLeadLists, useListIcps } from "@workspace/api-client-react";
import type { LeadList } from "@workspace/api-client-react";

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

interface CampaignAnalytics {
  sent_count: number;
  opened_count: number;
  replied_count: number;
  bounced_count: number;
}

interface CampaignSequence {
  id?: string;
  step_number: number;
  subject: string;
  body: string;
  delay_days: number;
}

interface Campaign {
  id: string;
  name: string;
  sending_domain: string;
  lead_list_id?: string | null;
  status: "draft" | "active" | "paused" | "completed";
  external_campaign_id?: string | null;
  created_at: string;
  campaign_analytics?: CampaignAnalytics | CampaignAnalytics[];
  campaign_sequences?: CampaignSequence[];
}

interface DomainWarmup {
  id: string;
  domain: string;
  status: "warming" | "ready" | "paused" | "failed";
  score: number;
  provider: string;
  started_at?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: "Draft", color: "bg-[#F5F7FA] border-[#E2E8F0] text-[#64748B]", icon: <Edit3 className="w-3 h-3" /> },
  active: { label: "Active", color: "bg-green-50 border-green-200 text-green-700", icon: <Play className="w-3 h-3" /> },
  paused: { label: "Paused", color: "bg-amber-50 border-amber-200 text-amber-700", icon: <Pause className="w-3 h-3" /> },
  completed: { label: "Done", color: "bg-blue-50 border-blue-200 text-blue-700", icon: <CheckCircle2 className="w-3 h-3" /> },
};

function WarmupProgress({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 80 ? "bg-green-500" : pct >= 40 ? "bg-amber-400" : "bg-[#2563EB]";
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <div className="flex-1 bg-[#E2E8F0] rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-[#0A0A0A] shrink-0">{pct}%</span>
    </div>
  );
}

function AnalyticsCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
      <p className="text-xs text-[#64748B] mb-1">{label}</p>
      <p className="text-2xl font-bold text-[#0A0A0A]">{value.toLocaleString()}</p>
      {sub && <p className="text-xs text-[#94A3B8] mt-0.5">{sub}</p>}
    </div>
  );
}

export default function Campaigns() {
  const { toast } = useToast();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [warmupDomains, setWarmupDomains] = useState<DomainWarmup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Campaign | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create wizard
  const [wizard, setWizard] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [wizardName, setWizardName] = useState("");
  const [wizardDomain, setWizardDomain] = useState("");
  const [wizardListId, setWizardListId] = useState<string>("");
  const [sequences, setSequences] = useState<CampaignSequence[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);

  // Warmup add
  const [warmupInput, setWarmupInput] = useState("");
  const [warmupAdding, setWarmupAdding] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: leadLists = [] } = useListLeadLists();
  const { data: icps = [] } = useListIcps();
  const lists = leadLists as LeadList[];

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, wRes] = await Promise.all([
        apiFetch("/api/campaigns"),
        apiFetch("/api/domain-warmup"),
      ]);
      if (cRes.ok) setCampaigns(await cRes.json());
      if (wRes.ok) setWarmupDomains(await wRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function loadDetail(id: string) {
    setSelectedId(id);
    setWizard(false);
    setDetailLoading(true);
    try {
      const res = await apiFetch(`/api/campaigns/${id}`);
      if (res.ok) setDetail(await res.json());
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleAddWarmup() {
    if (!warmupInput.trim()) return;
    setWarmupAdding(true);
    try {
      const res = await apiFetch("/api/domain-warmup", {
        method: "POST",
        body: JSON.stringify({ domain: warmupInput.trim() }),
      });
      if (res.ok) {
        const newEntry = await res.json();
        setWarmupDomains((prev) => [newEntry, ...prev]);
        setWarmupInput("");
        toast({ title: "Warmup started", description: `${warmupInput.trim()} is now warming up.` });
      } else {
        const err = await res.json();
        toast({ title: "Error", description: err.error || "Could not start warmup.", variant: "destructive" });
      }
    } finally {
      setWarmupAdding(false);
    }
  }

  async function handleMarkReady(warmup: DomainWarmup) {
    const res = await apiFetch(`/api/domain-warmup/${warmup.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "ready", score: 100 }),
    });
    if (res.ok) {
      setWarmupDomains((prev) => prev.map((w) => w.id === warmup.id ? { ...w, status: "ready", score: 100 } : w));
      toast({ title: "Domain ready", description: `${warmup.domain} is ready to send.` });
    }
  }

  async function handleRemoveWarmup(id: string) {
    await apiFetch(`/api/domain-warmup/${id}`, { method: "DELETE" });
    setWarmupDomains((prev) => prev.filter((w) => w.id !== id));
  }

  async function handleGenerateAI() {
    setAiLoading(true);
    try {
      const tmpRes = await apiFetch("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({ name: "__tmp__", sending_domain: wizardDomain || "example.com", sequences: [] }),
      });
      if (!tmpRes.ok) throw new Error("Could not create temp campaign");
      const tmp = await tmpRes.json() as Campaign;

      const aiRes = await apiFetch(`/api/campaigns/${tmp.id}/ai-copy`, { method: "POST" });
      await apiFetch(`/api/campaigns/${tmp.id}`, { method: "DELETE" });

      if (aiRes.ok) {
        const { sequences: aiSeqs } = await aiRes.json() as { sequences: CampaignSequence[] };
        setSequences(aiSeqs);
        toast({ title: "AI copy generated!", description: "Review and edit before launching." });
      }
    } catch {
      toast({ title: "Error", description: "Could not generate AI copy.", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  }

  async function handleCreateCampaign() {
    setSaving(true);
    try {
      const res = await apiFetch("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: wizardName,
          sending_domain: wizardDomain,
          lead_list_id: wizardListId || null,
          sequences,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const created = await res.json() as Campaign;
      setCampaigns((prev) => [created, ...prev]);
      setWizard(false);
      resetWizard();
      await loadDetail(created.id);
      toast({ title: "Campaign created!", description: `"${created.name}" is ready to launch.` });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not create campaign.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleLaunch(id: string) {
    setLaunching(true);
    try {
      const res = await apiFetch(`/api/campaigns/${id}/launch`, { method: "POST" });
      const data = await res.json() as { success: boolean; message?: string };
      if (data.success) {
        toast({ title: "Campaign launched!", description: data.message || "Your campaign is now active." });
        setCampaigns((prev) => prev.map((c) => c.id === id ? { ...c, status: "active" } : c));
        if (detail?.id === id) setDetail((prev) => prev ? { ...prev, status: "active" } : prev);
      }
    } catch {
      toast({ title: "Error", description: "Could not launch campaign.", variant: "destructive" });
    } finally {
      setLaunching(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await apiFetch(`/api/campaigns/${id}`, { method: "DELETE" });
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      if (selectedId === id) { setSelectedId(null); setDetail(null); }
      setDeleteId(null);
      toast({ title: "Campaign deleted" });
    } finally {
      setDeleting(false);
    }
  }

  async function handleUpdateSequences() {
    if (!detail) return;
    const res = await apiFetch(`/api/campaigns/${detail.id}/sequences`, {
      method: "PUT",
      body: JSON.stringify({ sequences: detail.campaign_sequences || [] }),
    });
    if (res.ok) {
      toast({ title: "Sequences saved" });
    }
  }

  function resetWizard() {
    setStep(1);
    setWizardName("");
    setWizardDomain("");
    setWizardListId("");
    setSequences([]);
  }

  function addSequenceStep() {
    setSequences((prev) => [
      ...prev,
      { step_number: prev.length + 1, subject: "", body: "", delay_days: prev.length === 0 ? 0 : 3 },
    ]);
  }

  const analytics = detail
    ? (Array.isArray(detail.campaign_analytics) ? detail.campaign_analytics[0] : detail.campaign_analytics)
    : null;

  const readyDomains = warmupDomains.filter((w) => w.status === "ready");

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 pt-2">
          <div>
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", letterSpacing: "0.04em" }} className="text-[#0A0A0A] mb-1">
              Campaigns
            </h1>
            <p className="text-[#64748B] text-sm">Build and send email outreach from your warmed domains</p>
          </div>
          <button
            onClick={() => { setWizard(true); setSelectedId(null); setDetail(null); resetWizard(); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors"
          >
            <Plus className="w-4 h-4" /> New Campaign
          </button>
        </div>

        {/* ── Domain Warmup Section ── */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#EFF6FF] rounded-lg flex items-center justify-center">
                <Globe className="w-4 h-4 text-[#2563EB]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#0A0A0A]">Domain Warmup</p>
                <p className="text-xs text-[#64748B]">Warm your sending domains before launching campaigns</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={warmupInput}
                onChange={(e) => setWarmupInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddWarmup()}
                placeholder="yourdomain.com"
                className="w-44 px-3 py-1.5 border border-[#E2E8F0] rounded-lg text-sm text-[#0A0A0A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              />
              <button
                onClick={handleAddWarmup}
                disabled={warmupAdding || !warmupInput.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
              >
                {warmupAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add
              </button>
            </div>
          </div>

          {warmupDomains.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-[#E2E8F0] rounded-lg">
              <Globe className="w-8 h-8 text-[#CBD5E1] mx-auto mb-2" />
              <p className="text-sm text-[#64748B]">No domains warming yet</p>
              <p className="text-xs text-[#94A3B8] mt-0.5">Add a domain you purchased to start the warmup process</p>
            </div>
          ) : (
            <div className="space-y-2">
              {warmupDomains.map((w) => (
                <div key={w.id} className="flex items-center gap-4 p-3 bg-[#F5F7FA] rounded-lg border border-[#E2E8F0]">
                  <div className="flex items-center gap-2 w-48 shrink-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${w.status === "ready" ? "bg-green-500" : w.status === "failed" ? "bg-red-500" : "bg-amber-400 animate-pulse"}`} />
                    <span className="text-sm font-medium text-[#0A0A0A] truncate">{w.domain}</span>
                  </div>
                  <WarmupProgress score={w.score} />
                  <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 capitalize ${
                    w.status === "ready" ? "bg-green-50 border-green-200 text-green-700" :
                    w.status === "failed" ? "bg-red-50 border-red-200 text-red-600" :
                    "bg-amber-50 border-amber-200 text-amber-700"
                  }`}>
                    {w.status}
                  </span>
                  <div className="flex items-center gap-2 shrink-0 ml-auto">
                    {w.status === "warming" && (
                      <button
                        onClick={() => handleMarkReady(w)}
                        className="text-xs text-[#2563EB] hover:underline font-medium"
                      >
                        Mark ready
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveWarmup(w.id)}
                      className="w-6 h-6 flex items-center justify-center rounded text-[#94A3B8] hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Main Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Campaign list */}
          <div className="space-y-2">
            <p className="text-xs text-[#64748B] uppercase tracking-widest font-medium px-1 mb-3">Your Campaigns</p>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 text-[#64748B] animate-spin" />
              </div>
            ) : campaigns.length === 0 ? (
              <div className="bg-white border border-dashed border-[#E2E8F0] rounded-xl p-8 text-center">
                <Mail className="w-8 h-8 text-[#CBD5E1] mx-auto mb-2" />
                <p className="text-sm text-[#64748B]">No campaigns yet</p>
                <button
                  onClick={() => { setWizard(true); setSelectedId(null); setDetail(null); resetWizard(); }}
                  className="mt-3 text-xs text-[#2563EB] font-medium hover:underline"
                >
                  Create your first →
                </button>
              </div>
            ) : (
              campaigns.map((c) => {
                const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.draft;
                const a = Array.isArray(c.campaign_analytics) ? c.campaign_analytics[0] : c.campaign_analytics;
                return (
                  <div
                    key={c.id}
                    onClick={() => loadDetail(c.id)}
                    className={`group cursor-pointer bg-white border rounded-xl p-4 transition-all ${
                      selectedId === c.id
                        ? "border-[#2563EB] shadow-[0_0_0_3px_rgba(37,99,235,0.1)]"
                        : "border-[#E2E8F0] hover:border-[#CBD5E1] hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-[#0A0A0A] leading-tight flex-1 truncate">{c.name}</p>
                      <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border shrink-0 ${cfg.color}`}>
                        {cfg.icon}{cfg.label}
                      </span>
                    </div>
                    <p className="text-xs text-[#64748B] mt-1 truncate">{c.sending_domain}</p>
                    {a && (
                      <div className="flex items-center gap-3 mt-2 text-xs text-[#94A3B8]">
                        <span>{a.sent_count} sent</span>
                        <span>{a.opened_count} opened</span>
                        <span>{a.replied_count} replied</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Right: Detail / Wizard */}
          <div className="lg:col-span-2">
            {/* ── CREATE WIZARD ── */}
            {wizard && (
              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                {/* Step indicator */}
                <div className="flex border-b border-[#E2E8F0]">
                  {([1, 2, 3] as const).map((s) => (
                    <div
                      key={s}
                      className={`flex-1 py-3 text-center text-xs font-semibold transition-colors ${
                        step === s ? "text-[#2563EB] border-b-2 border-[#2563EB] bg-[#EFF6FF]" :
                        step > s ? "text-green-600 bg-green-50" : "text-[#94A3B8]"
                      }`}
                    >
                      {step > s ? <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" /> : null}
                      {s === 1 ? "1. Setup" : s === 2 ? "2. Sequences" : "3. Review"}
                    </div>
                  ))}
                </div>

                <div className="p-6">
                  {/* Step 1: Setup */}
                  {step === 1 && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-1.5">Campaign Name</label>
                        <input
                          value={wizardName}
                          onChange={(e) => setWizardName(e.target.value)}
                          placeholder="e.g. Q3 SaaS Founders Outreach"
                          className="w-full px-3 py-2.5 border border-[#E2E8F0] rounded-lg text-sm text-[#0A0A0A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-1.5">
                          Sending Domain
                          {readyDomains.length > 0 && <span className="ml-2 text-green-600 normal-case font-normal">({readyDomains.length} ready)</span>}
                        </label>
                        {readyDomains.length > 0 ? (
                          <select
                            value={wizardDomain}
                            onChange={(e) => setWizardDomain(e.target.value)}
                            className="w-full px-3 py-2.5 border border-[#E2E8F0] rounded-lg text-sm text-[#0A0A0A] focus:outline-none focus:border-[#2563EB] bg-white"
                          >
                            <option value="">Select a domain…</option>
                            {readyDomains.map((d) => <option key={d.id} value={d.domain}>{d.domain}</option>)}
                            <option value="__custom__">Enter manually…</option>
                          </select>
                        ) : null}
                        {(wizardDomain === "__custom__" || readyDomains.length === 0) && (
                          <input
                            value={wizardDomain === "__custom__" ? "" : wizardDomain}
                            onChange={(e) => setWizardDomain(e.target.value)}
                            placeholder="yourdomain.com"
                            className="w-full mt-2 px-3 py-2.5 border border-[#E2E8F0] rounded-lg text-sm text-[#0A0A0A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                          />
                        )}
                        {readyDomains.length === 0 && (
                          <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> No warmed domains yet — add one above before launching
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-1.5">Lead List (optional)</label>
                        <select
                          value={wizardListId}
                          onChange={(e) => setWizardListId(e.target.value)}
                          className="w-full px-3 py-2.5 border border-[#E2E8F0] rounded-lg text-sm text-[#0A0A0A] focus:outline-none focus:border-[#2563EB] bg-white"
                        >
                          <option value="">No list selected</option>
                          {lists.map((l) => <option key={l.id} value={l.id}>{l.label || "Untitled list"}</option>)}
                        </select>
                      </div>
                      <button
                        onClick={() => { if (wizardName && wizardDomain) setStep(2); }}
                        disabled={!wizardName.trim() || !wizardDomain.trim() || wizardDomain === "__custom__"}
                        className="w-full py-2.5 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        Continue <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Step 2: Sequences */}
                  {step === 2 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-[#0A0A0A]">Email Sequences ({sequences.length} steps)</p>
                        <button
                          onClick={handleGenerateAI}
                          disabled={aiLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB] text-xs font-semibold rounded-lg hover:bg-[#DBEAFE] transition-colors disabled:opacity-50"
                        >
                          {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          AI Generate
                        </button>
                      </div>

                      {sequences.length === 0 ? (
                        <div className="border border-dashed border-[#E2E8F0] rounded-lg p-8 text-center">
                          <Mail className="w-8 h-8 text-[#CBD5E1] mx-auto mb-2" />
                          <p className="text-sm text-[#64748B] mb-3">No steps yet</p>
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={handleGenerateAI} disabled={aiLoading} className="flex items-center gap-1.5 px-3 py-2 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50">
                              {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                              Auto-generate from ICP
                            </button>
                            <button onClick={addSequenceStep} className="px-3 py-2 border border-[#E2E8F0] text-[#64748B] text-sm font-semibold rounded-lg hover:bg-[#F5F7FA] transition-colors">
                              Add blank step
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                          {sequences.map((seq, i) => (
                            <div key={i} className="border border-[#E2E8F0] rounded-lg overflow-hidden">
                              <div className="flex items-center gap-3 px-3 py-2 bg-[#F5F7FA] border-b border-[#E2E8F0]">
                                <span className="w-5 h-5 bg-[#2563EB] rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className="text-xs text-[#64748B]">Day</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={seq.delay_days}
                                    onChange={(e) => setSequences((prev) => prev.map((s, j) => j === i ? { ...s, delay_days: parseInt(e.target.value) || 0 } : s))}
                                    className="w-14 px-2 py-0.5 border border-[#E2E8F0] rounded text-xs text-center bg-white focus:outline-none focus:border-[#2563EB]"
                                  />
                                </div>
                                <button onClick={() => setSequences((prev) => prev.filter((_, j) => j !== i))} className="text-[#94A3B8] hover:text-red-500 transition-colors">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <div className="p-3 space-y-2">
                                <input
                                  value={seq.subject}
                                  onChange={(e) => setSequences((prev) => prev.map((s, j) => j === i ? { ...s, subject: e.target.value } : s))}
                                  placeholder="Subject line"
                                  className="w-full px-2.5 py-1.5 border border-[#E2E8F0] rounded text-sm text-[#0A0A0A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#2563EB] bg-white"
                                />
                                <textarea
                                  value={seq.body}
                                  onChange={(e) => setSequences((prev) => prev.map((s, j) => j === i ? { ...s, body: e.target.value } : s))}
                                  placeholder="Email body…"
                                  rows={4}
                                  className="w-full px-2.5 py-1.5 border border-[#E2E8F0] rounded text-xs text-[#0A0A0A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#2563EB] bg-white resize-none font-mono leading-relaxed"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {sequences.length > 0 && (
                        <button onClick={addSequenceStep} className="flex items-center gap-1.5 text-xs text-[#2563EB] hover:underline font-medium">
                          <Plus className="w-3.5 h-3.5" /> Add follow-up step
                        </button>
                      )}

                      <div className="flex gap-3 pt-2">
                        <button onClick={() => setStep(1)} className="px-4 py-2.5 border border-[#E2E8F0] text-[#64748B] text-sm font-semibold rounded-lg hover:bg-[#F5F7FA] transition-colors">
                          Back
                        </button>
                        <button
                          onClick={() => { if (sequences.length > 0) setStep(3); }}
                          disabled={sequences.length === 0}
                          className="flex-1 py-2.5 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          Review <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Review & Save */}
                  {step === 3 && (
                    <div className="space-y-4">
                      <div className="bg-[#F5F7FA] rounded-lg p-4 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-[#64748B]">Campaign name</span>
                          <span className="font-semibold text-[#0A0A0A]">{wizardName}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-[#64748B]">Sending domain</span>
                          <span className="font-mono text-[#0A0A0A]">{wizardDomain}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-[#64748B]">Lead list</span>
                          <span className="text-[#0A0A0A]">{wizardListId ? (lists.find((l) => l.id === wizardListId)?.label ?? "Unknown") : "None selected"}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-[#64748B]">Email steps</span>
                          <span className="font-semibold text-[#0A0A0A]">{sequences.length} step{sequences.length !== 1 ? "s" : ""}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {sequences.map((seq, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 bg-white border border-[#E2E8F0] rounded-lg">
                            <span className="w-6 h-6 bg-[#EFF6FF] rounded-full text-[#2563EB] text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[#0A0A0A] truncate">{seq.subject || "(no subject)"}</p>
                              <p className="text-xs text-[#64748B]">Day {seq.delay_days}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-3">
                        <button onClick={() => setStep(2)} className="px-4 py-2.5 border border-[#E2E8F0] text-[#64748B] text-sm font-semibold rounded-lg hover:bg-[#F5F7FA] transition-colors">
                          Back
                        </button>
                        <button
                          onClick={handleCreateCampaign}
                          disabled={saving}
                          className="flex-1 py-2.5 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          {saving ? "Saving…" : "Save Campaign"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── CAMPAIGN DETAIL ── */}
            {!wizard && selectedId && (
              detailLoading ? (
                <div className="flex items-center justify-center py-24">
                  <Loader2 className="w-6 h-6 text-[#64748B] animate-spin" />
                </div>
              ) : detail ? (
                <div className="space-y-5">
                  {/* Detail header */}
                  <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-bold text-[#0A0A0A] leading-tight">{detail.name}</h2>
                        <p className="text-sm text-[#64748B] mt-0.5 font-mono">{detail.sending_domain}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {detail.status === "draft" && (
                          <button
                            onClick={() => handleLaunch(detail.id)}
                            disabled={launching}
                            className="flex items-center gap-2 px-4 py-2 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
                          >
                            {launching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            Launch
                          </button>
                        )}
                        {detail.status === "active" && (
                          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 text-sm font-semibold rounded-lg">
                            <Play className="w-3.5 h-3.5" /> Active
                          </span>
                        )}
                        <button
                          onClick={() => setDeleteId(detail.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Analytics */}
                  {analytics && (
                    <div>
                      <p className="text-xs text-[#64748B] uppercase tracking-widest font-medium mb-3">Analytics</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <AnalyticsCard label="Sent" value={analytics.sent_count} />
                        <AnalyticsCard label="Opened" value={analytics.opened_count} sub={analytics.sent_count > 0 ? `${Math.round((analytics.opened_count / analytics.sent_count) * 100)}% rate` : undefined} />
                        <AnalyticsCard label="Replied" value={analytics.replied_count} sub={analytics.sent_count > 0 ? `${Math.round((analytics.replied_count / analytics.sent_count) * 100)}% rate` : undefined} />
                        <AnalyticsCard label="Bounced" value={analytics.bounced_count} />
                      </div>
                    </div>
                  )}

                  {/* Sequences */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-[#64748B] uppercase tracking-widest font-medium">Email Sequence</p>
                      {detail.campaign_sequences && detail.campaign_sequences.length > 0 && (
                        <button onClick={handleUpdateSequences} className="text-xs text-[#2563EB] hover:underline font-medium">
                          Save changes
                        </button>
                      )}
                    </div>
                    {!detail.campaign_sequences || detail.campaign_sequences.length === 0 ? (
                      <div className="bg-white border border-dashed border-[#E2E8F0] rounded-xl p-6 text-center text-sm text-[#64748B]">
                        No email steps yet
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {detail.campaign_sequences
                          .sort((a, b) => a.step_number - b.step_number)
                          .map((seq, i) => (
                          <div key={seq.id || i} className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-2 bg-[#F5F7FA] border-b border-[#E2E8F0]">
                              <span className="w-5 h-5 bg-[#2563EB] rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                              <span className="text-xs text-[#64748B]">Day {seq.delay_days}</span>
                              <span className="text-xs font-medium text-[#0A0A0A] flex-1 truncate">{seq.subject}</span>
                            </div>
                            <div className="px-4 py-3">
                              <pre className="text-xs text-[#64748B] whitespace-pre-wrap leading-relaxed font-sans line-clamp-4">{seq.body}</pre>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null
            )}

            {/* Empty state when nothing selected */}
            {!wizard && !selectedId && (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <Mail className="w-10 h-10 text-[#CBD5E1] mb-3" />
                <p className="text-[#64748B] font-medium">Select a campaign to view details</p>
                <p className="text-sm text-[#94A3B8] mt-1">or create a new one to get started</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirm */}
      {deleteId && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50 backdrop-blur-[2px]" onClick={() => setDeleteId(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-[#0A0A0A] font-semibold text-base">Delete campaign?</p>
                  <p className="text-[#64748B] text-sm mt-1">This will permanently delete the campaign, all sequences, and analytics. This cannot be undone.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 border border-[#E2E8F0] text-[#64748B] text-sm font-semibold rounded-lg hover:bg-[#F5F7FA] transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteId)}
                  disabled={deleting}
                  className="flex-1 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
