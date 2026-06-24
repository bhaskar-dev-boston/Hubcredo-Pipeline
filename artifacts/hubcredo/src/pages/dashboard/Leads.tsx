import { useState } from "react";
import { getToken } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  useListLeadLists,
  useCreateLeadList,
  useDeleteLeadList,
  useListLeads,
  useTriggerLeadScraping,
  useReviewLead,
  useListIcps,
  useGetMe,
  getListIcpsQueryKey,
  useSyncLeadToCrm,
  useGetCrmConnection,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Users, Plus, Loader2, ThumbsUp, ThumbsDown, ExternalLink, Zap, ChevronDown, Sparkles, ArrowRight, X, Building2, MapPin, Briefcase, Mail, Globe, Trash2, AlertTriangle, Linkedin, RefreshCw, CheckCircle2, AlertCircle, Clock, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Lead, LeadList, Icp } from "@workspace/api-client-react";
import { useCreditStore } from "@/store/creditStore";

export default function Leads() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [showNewList, setShowNewList] = useState(false);
  const [listLabel, setListLabel] = useState("");
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [scraping, setScraping] = useState(false);
  const [profileLead, setProfileLead] = useState<Lead | null>(null);
  const [leadCount, setLeadCount] = useState(5);
  const [deleteConfirmList, setDeleteConfirmList] = useState<LeadList | null>(null);
  const { balance, deductOptimistic, fetchBalance } = useCreditStore();

  const { data: me } = useGetMe();
  const { data: leadLists = [], isLoading: listsLoading, refetch: refetchLists } = useListLeadLists();
  const { data: leads = [], isLoading: leadsLoading, refetch: refetchLeads } = useListLeads(
    selectedListId ? { lead_list_id: selectedListId } : undefined
  );
  const { data: icps = [], refetch: refetchIcps } = useListIcps();
  const createLeadList = useCreateLeadList();
  const deleteLeadListMutation = useDeleteLeadList();
  const triggerScraping = useTriggerLeadScraping();
  const reviewLead = useReviewLead();
  const syncLead = useSyncLeadToCrm();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: crmConnection } = useGetCrmConnection({ query: { retry: false } as any });
  const hasCrm = !!crmConnection;
  const [syncingLeadId, setSyncingLeadId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingHubspot, setSyncingHubspot] = useState(false);
  const [enriching, setEnriching] = useState(false);

  async function handleEnrichList() {
    if (!activeListId) return;
    setEnriching(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/webhooks/enrich-list/${activeListId}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.sent === 0) {
          toast({ title: "Nothing to enrich", description: "No leads with LinkedIn URLs found in this list.", variant: "destructive" });
        } else {
          toast({ title: "Enrichment triggered", description: `${data.sent} LinkedIn profile${data.sent !== 1 ? "s" : ""} sent for enrichment. Results will appear shortly.` });
        }
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Enrichment failed", description: err.error ?? "Could not trigger enrichment.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Enrichment error", description: "An error occurred.", variant: "destructive" });
    } finally {
      setEnriching(false);
    }
  }

  async function handleSyncHubspot() {
    if (!activeListId) return;
    setSyncingHubspot(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/crm-hs/sync-list/${activeListId}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        const skippedNote = data.skipped > 0 ? ` (${data.skipped} skipped — no email address)` : "";
        const failNote = data.failed > 0 ? ` · ${data.failed} failed` : "";
        toast({
          title: data.succeeded > 0 ? "HubSpot sync complete" : data.skipped > 0 ? "Nothing to sync" : "HubSpot sync failed",
          description: data.succeeded > 0
            ? `${data.succeeded} lead${data.succeeded !== 1 ? "s" : ""} synced to HubSpot${skippedNote}${failNote}.`
            : `No leads could be synced — HubSpot requires an email address for each contact.${failNote}`,
          variant: data.succeeded > 0 ? "default" : "destructive",
        });
        await refetchLeads();
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "HubSpot sync failed", description: err.error ?? "Could not sync leads to HubSpot.", variant: "destructive" });
      }
    } catch {
      toast({ title: "HubSpot sync error", description: "An error occurred.", variant: "destructive" });
    } finally {
      setSyncingHubspot(false);
    }
  }

  async function handleSyncAllApproved() {
    if (!activeListId) return;
    setSyncingAll(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/crm/sync-list/${activeListId}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        toast({ title: "CRM sync complete", description: `${data.succeeded} of ${data.total} approved leads synced to Attio.` });
        await refetchLeads();
      } else {
        toast({ title: "Sync failed", description: "Could not sync leads to CRM.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Sync error", description: "An error occurred.", variant: "destructive" });
    } finally {
      setSyncingAll(false);
    }
  }

  async function handleSyncLeadToCrm(leadId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSyncingLeadId(leadId);
    try {
      const result = await syncLead.mutateAsync({ id: leadId });
      if (result.success) {
        toast({ title: "Synced to Attio", description: "Lead contact updated in your CRM." });
      } else {
        toast({ title: "Sync failed", description: result.error ?? "Unknown error", variant: "destructive" });
      }
      await refetchLeads();
    } catch {
      toast({ title: "Sync error", description: "Could not sync lead to CRM.", variant: "destructive" });
    } finally {
      setSyncingLeadId(null);
    }
  }

  const currentIcp = (icps as Icp[])[0];
  const hasIcp =
    !!currentIcp &&
    ((currentIcp.job_titles?.length ?? 0) > 0 || (currentIcp.industries?.length ?? 0) > 0);
  const lists = leadLists as LeadList[];
  const activeListId = selectedListId ?? lists[0]?.id ?? null;
  const selectedList = lists.find((l) => l.id === activeListId);

  async function handleCreateList() {
    if (!listLabel.trim()) return;
    if (!currentIcp) {
      toast({ title: "ICP required", description: "Set up your ICP in Settings first.", variant: "destructive" });
      return;
    }
    try {
      const list = await createLeadList.mutateAsync({ data: { icp_id: currentIcp.id, label: listLabel.trim() } });
      setListLabel("");
      setShowNewList(false);
      setSelectedListId(list.id);
      await refetchLists();
      return list;
    } catch {
      toast({ title: "Error", description: "Could not create lead list.", variant: "destructive" });
      return null;
    }
  }

  async function handleAutoFill() {
    toast({ title: "Feature unavailable", description: "Auto-fill will be available soon.", variant: "destructive" });
  }

  async function handleGenerateLeads() {
    if (!me) {
      toast({ title: "Not signed in", description: "Please sign in and try again.", variant: "destructive" });
      return;
    }
    if (!hasIcp) {
      toast({ title: "ICP required", description: "Fill in your ICP in Settings before generating leads.", variant: "destructive" });
      return;
    }

    const safeCount = Math.max(5, Math.floor(leadCount));
    const totalCost = Math.max(1, Math.ceil(safeCount / 25));

    if (balance !== null && balance < totalCost) {
      toast({
        title: "Not enough credits",
        description: `${safeCount} leads costs ${totalCost} credit${totalCost !== 1 ? "s" : ""} but you only have ${balance}. Top up in Billing.`,
        variant: "destructive",
      });
      return;
    }

    setScraping(true);
    deductOptimistic(totalCost);

    try {
      const listNumber = lists.length + 1;
      const newList = await createLeadList.mutateAsync({
        data: { icp_id: currentIcp.id, label: `Lead List ${listNumber}` },
      });
      const listId = newList.id;
      setSelectedListId(newList.id);
      await refetchLists();

      await triggerScraping.mutateAsync({
        data: { user_id: me.id, icp_id: currentIcp.id, lead_list_id: listId, lead_count: safeCount },
      });

      toast({
        title: "Lead generation started!",
        description: `Generating ${safeCount} unique leads in "Lead List ${listNumber}" (${totalCost} credit${totalCost !== 1 ? "s" : ""} deducted). Check back in a few minutes.`,
      });
      setTimeout(() => refetchLeads(), 8000);
    } catch (err: unknown) {
      fetchBalance();
      const msg = err instanceof Error ? err.message : "Could not start lead scraping. Check your n8n workflow is active.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setScraping(false);
    }
  }

  async function handleDeleteList(list: LeadList) {
    try {
      await deleteLeadListMutation.mutateAsync({ id: list.id });
      setDeleteConfirmList(null);
      if (selectedListId === list.id) setSelectedListId(null);
      await refetchLists();
      toast({ title: "List deleted", description: `"${list.label}" and all its leads have been removed.` });
    } catch {
      toast({ title: "Error", description: "Could not delete the list. Please try again.", variant: "destructive" });
    }
  }

  async function handleReview(leadId: string, status: string) {
    try {
      await reviewLead.mutateAsync({ id: leadId, data: { review_status: status } });
      refetchLeads();
    } catch {
      toast({ title: "Error", description: "Could not update lead.", variant: "destructive" });
    }
  }

  const statusPill = (status?: string | null) => {
    if (status === "approved") return "bg-[rgba(13,148,136,0.1)] border-[rgba(13,148,136,0.25)] text-[#0D9488]";
    if (status === "rejected") return "bg-[rgba(239,68,68,0.08)] border-[rgba(239,68,68,0.2)] text-[#EF4444]";
    return "bg-[#F5F3FF] border-[rgba(107,78,255,0.2)] text-[#6B4EFF]";
  };

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-5 pt-2">
          <div>
            <h1 style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: "2rem", letterSpacing: "0.04em" }} className="text-[#1E1B4B] mb-1">
              My Leads
            </h1>
            <p className="text-[#6B7280] text-sm">Generate and manage qualified prospects from LinkedIn</p>
          </div>
        </div>

        {/* ── MAIN TRIGGER CARD ── */}
        {!hasIcp ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8 flex gap-4 items-start">
            <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800 mb-0.5">Fill in your ICP to generate leads</p>
              <p className="text-sm text-amber-700 leading-relaxed mb-3">
                The AI needs at least your <strong>target job titles</strong> or <strong>target industries</strong> to find the right prospects.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setLocation("/dashboard/settings")}
                  className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 transition-colors"
                >
                  Fill in ICP manually <ArrowRight className="w-3 h-3" />
                </button>
                <button
                  onClick={handleAutoFill}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-amber-300 text-amber-700 text-xs font-semibold rounded-lg hover:bg-amber-50 transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  Auto-fill from website analysis
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-[#6B4EFF] rounded-xl p-6 mb-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
              <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-base mb-0.5">Generate LinkedIn leads</p>
                <p className="text-purple-100 text-sm leading-relaxed">
                  Triggers your Engine with your ICP targeting. It may take <b>up to 5 minutes</b> to give you the best results.
                  {selectedList
                    ? <> Running against <span className="font-semibold text-white">"{selectedList.label}"</span>.</>
                    : lists.length === 0
                    ? " A new list will be created automatically."
                    : " Using your most recent list."}
                </p>
              </div>
              <button
                onClick={handleGenerateLeads}
                disabled={scraping}
                className="flex items-center gap-2.5 px-6 py-3 bg-white text-[#6B4EFF] font-bold rounded-lg hover:bg-[#F5F3FF] transition-colors disabled:opacity-50 shrink-0 text-sm shadow-sm"
              >
                {scraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {scraping ? "Scraping…" : "Generate leads"}
              </button>
            </div>

            {/* Lead count selector */}
            <div className="mt-4 pt-4 border-t border-white/20 flex flex-wrap items-center gap-3">
              <span className="text-purple-100 text-xs font-medium">Number of leads:</span>
              <div className="flex items-center gap-2">
                {[5, 10, 25, 50].map((n) => (
                  <button
                    key={n}
                    onClick={() => setLeadCount(n)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                      leadCount === n
                        ? "bg-white text-[#6B4EFF] shadow-sm"
                        : "bg-white/20 text-white hover:bg-white/30"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={5}
                    max={500}
                    value={leadCount}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) setLeadCount(Math.max(5, Math.min(500, v)));
                    }}
                    className="w-16 px-2 py-1 rounded-md text-xs font-semibold bg-white/20 text-white border border-white/30 focus:outline-none focus:border-white focus:bg-white/30 text-center placeholder:text-white/60 transition-colors"
                    placeholder="Custom"
                  />
                </div>
              </div>
              <span className="text-white/70 text-xs ml-auto">
                Cost: <span className="text-white font-semibold">{Math.max(1, Math.ceil(leadCount / 25))} credit{Math.max(1, Math.ceil(leadCount / 25)) !== 1 ? "s" : ""}</span>
                <span className="text-purple-200/70"> (25 leads/$1)</span>
                {balance !== null && <span className="text-purple-200"> · you have {balance.toLocaleString()}</span>}
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left — lists */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 mb-3">
              <p className="text-xs text-[#9CA3AF] uppercase tracking-widest font-medium">Lead lists</p>
              <button
                onClick={() => setShowNewList(true)}
                className="flex items-center gap-1 text-xs text-[#6B4EFF] hover:text-[#5B3FE0] transition-colors font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            </div>

            {listsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-[#6B4EFF] animate-spin" />
              </div>
            ) : lists.length === 0 ? (
              <div className="bg-[#F8F7FF] border border-dashed border-[rgba(107,78,255,0.2)] rounded-xl p-6 text-center">
                <Users className="w-8 h-8 text-[#C4B5FD] mx-auto mb-2" />
                <p className="text-sm text-[#6B7280]">No lists yet</p>
                <p className="text-xs text-[#9CA3AF] mt-1">One will be created when you generate leads</p>
              </div>
            ) : (
              lists.map((list) => (
                <div
                  key={list.id}
                  className={`group relative flex items-center rounded-lg border transition-colors ${
                    activeListId === list.id
                      ? "bg-[#F5F3FF] border-[#6B4EFF]"
                      : "bg-white border-[rgba(107,78,255,0.12)] hover:border-[rgba(107,78,255,0.3)] hover:bg-[#FAFAFE]"
                  }`}
                >
                  <button
                    onClick={() => setSelectedListId(list.id)}
                    className="flex-1 text-left px-4 py-3 min-w-0"
                  >
                    <p className={`text-sm font-medium truncate ${activeListId === list.id ? "text-[#6B4EFF]" : "text-[#1E1B4B]"}`}>
                      {list.label || "Untitled list"}
                    </p>
                    <p className={`text-xs mt-0.5 capitalize ${activeListId === list.id ? "text-[rgba(107,78,255,0.6)]" : "text-[#9CA3AF]"}`}>{list.status}</p>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmList(list); }}
                    className="opacity-0 group-hover:opacity-100 mr-2 shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-[#9CA3AF] hover:text-red-500 hover:bg-[rgba(239,68,68,0.08)] transition-all"
                    title="Delete list"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}

            {showNewList && (
              <div className="bg-white border border-[rgba(107,78,255,0.2)] rounded-xl p-4 space-y-3 shadow-sm">
                <input
                  autoFocus
                  value={listLabel}
                  onChange={(e) => setListLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateList()}
                  placeholder="List name"
                  className="w-full px-3 py-2 bg-[#F9FAFB] border border-[rgba(107,78,255,0.15)] rounded-lg text-sm text-[#1E1B4B] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#6B4EFF] focus:ring-2 focus:ring-[rgba(107,78,255,0.15)] transition-colors"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateList}
                    disabled={createLeadList.isPending}
                    className="flex-1 py-2 bg-[#6B4EFF] text-white text-sm font-semibold rounded-lg hover:bg-[#5B3FE0] transition-colors disabled:opacity-50"
                  >
                    {createLeadList.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Create"}
                  </button>
                  <button
                    onClick={() => setShowNewList(false)}
                    className="flex-1 py-2 border border-[rgba(107,78,255,0.15)] text-[#6B7280] text-sm rounded-lg hover:bg-[#F5F3FF] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ICP summary */}
            {currentIcp && (
              <div className="mt-4 p-3 bg-[#F8F7FF] border border-[rgba(107,78,255,0.12)] rounded-lg">
                <p className="text-xs font-medium text-[#1E1B4B] mb-1">Active ICP targeting</p>
                {currentIcp.job_titles?.length ? (
                  <p className="text-xs text-[#6B7280]">{currentIcp.job_titles.slice(0, 3).join(", ")}{currentIcp.job_titles.length > 3 ? ` +${currentIcp.job_titles.length - 3}` : ""}</p>
                ) : null}
                {currentIcp.industries?.length ? (
                  <p className="text-xs text-[#6B7280] mt-0.5">{currentIcp.industries.slice(0, 2).join(", ")}</p>
                ) : null}
              </div>
            )}
          </div>

          {/* Right — leads */}
          <div className="lg:col-span-2 space-y-4">
            {activeListId && selectedList && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#9CA3AF] uppercase tracking-widest font-medium">
                  {leadsLoading ? "Loading…" : `${(leads as Lead[]).length} leads in "${selectedList.label}"`}
                </p>
                <div className="flex items-center gap-2">
                  {activeListId && (
                    <button
                      onClick={handleEnrichList}
                      disabled={enriching}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50"
                      style={{ background: "rgba(16,185,129,.1)", borderColor: "rgba(16,185,129,.25)", color: "#059669" }}
                      title="Send all LinkedIn URLs in this list to enrichment webhook"
                    >
                      {enriching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                      Enrich via LinkedIn
                    </button>
                  )}
                  {(leads as Lead[]).some((l) => l.review_status === "approved") && (
                    <button
                      onClick={handleSyncHubspot}
                      disabled={syncingHubspot}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50"
                      style={{ background: "rgba(255,122,89,.1)", borderColor: "rgba(255,122,89,.25)", color: "#FF7A59" }}
                    >
                      {syncingHubspot ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      Sync to HubSpot
                    </button>
                  )}
                  {hasCrm && (leads as Lead[]).some((l) => l.review_status === "approved") && (
                    <button
                      onClick={handleSyncAllApproved}
                      disabled={syncingAll}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#F5F3FF] border border-[rgba(107,78,255,0.2)] text-[#6B4EFF] rounded-lg hover:bg-[#EDE9FE] transition-colors disabled:opacity-50"
                    >
                      {syncingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      Sync to Attio
                    </button>
                  )}
                  {lists.length > 1 && (
                    <div className="relative">
                      <select
                        value={activeListId}
                        onChange={(e) => setSelectedListId(e.target.value)}
                        className="appearance-none text-xs text-[#6B4EFF] bg-[#F5F3FF] border border-[rgba(107,78,255,0.2)] rounded-lg pl-3 pr-7 py-1.5 focus:outline-none cursor-pointer"
                      >
                        {lists.map((l) => <option key={l.id} value={l.id}>{l.label || "Untitled list"}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#6B4EFF] pointer-events-none" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {leadsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-[#6B4EFF] animate-spin" />
              </div>
            ) : (leads as Lead[]).length === 0 ? (
              <div className="bg-[#F8F7FF] border border-dashed border-[rgba(107,78,255,0.2)] rounded-xl p-16 text-center">
                <Users className="w-10 h-10 text-[#C4B5FD] mx-auto mb-3" />
                <p className="text-[#1E1B4B] font-medium mb-1">No leads yet</p>
                <p className="text-sm text-[#6B7280] mb-4">Click the "Generate leads" button above to kick off your n8n workflow.</p>
                <button
                  onClick={handleGenerateLeads}
                  disabled={scraping || !currentIcp}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#6B4EFF] text-white text-sm font-semibold rounded-lg hover:bg-[#5B3FE0] transition-colors disabled:opacity-50"
                >
                  {scraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Generate leads
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {(leads as Lead[]).map((lead) => {
                  const displayName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown";
                  const linkedinStatus = (lead as Lead & { linkedin_status?: string }).linkedin_status;
                  return (
                    <div
                      key={lead.id}
                      onClick={() => setProfileLead(lead)}
                      className="bg-white border border-[rgba(107,78,255,0.12)] rounded-xl p-4 flex items-start gap-4 hover:border-[#6B4EFF] hover:shadow-[0_2px_12px_rgba(107,78,255,0.1)] transition-all cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#F5F3FF] border border-[rgba(107,78,255,0.2)] flex items-center justify-center text-[#6B4EFF] text-sm font-bold shrink-0 overflow-hidden">
                        {lead.profile_picture_url ? (
                          <img
                            src={lead.profile_picture_url}
                            alt={displayName}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const el = e.currentTarget;
                              el.style.display = "none";
                              el.parentElement!.textContent = displayName[0]?.toUpperCase() ?? "?";
                            }}
                          />
                        ) : (
                          displayName[0]?.toUpperCase() ?? "?"
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-[#1E1B4B]">{displayName}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${statusPill(lead.review_status)}`}>
                            {lead.review_status ?? "new"}
                          </span>
                          {linkedinStatus && linkedinStatus !== "not_contacted" && (
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${
                              linkedinStatus === "request_sent" ? "bg-amber-50 text-amber-700 border-amber-200" :
                              linkedinStatus === "connected"    ? "bg-[rgba(13,148,136,0.1)] text-[#0D9488] border-[rgba(13,148,136,0.25)]" :
                              linkedinStatus === "replied"      ? "bg-[#F5F3FF] text-[#6B4EFF] border-[rgba(107,78,255,0.2)]" :
                              "bg-[#F9FAFB] text-[#9CA3AF] border-[#E5E7EB]"
                            }`}>
                              <Linkedin className="w-2.5 h-2.5" />
                              {linkedinStatus === "request_sent" ? "Sent" :
                               linkedinStatus === "connected"    ? "Connected" :
                               linkedinStatus === "replied"      ? "Replied" : "Paused"}
                            </span>
                          )}
                          {hasCrm && lead.review_status === "approved" && (
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${
                              lead.crm_sync_status === "synced" ? "bg-[rgba(13,148,136,0.1)] text-[#0D9488] border-[rgba(13,148,136,0.25)]" :
                              lead.crm_sync_status === "error"  ? "bg-[rgba(239,68,68,0.08)] text-[#EF4444] border-[rgba(239,68,68,0.2)]" :
                              "bg-[#F9FAFB] text-[#9CA3AF] border-[#E5E7EB]"
                            }`}>
                              {lead.crm_sync_status === "synced" ? <CheckCircle2 className="w-2.5 h-2.5" /> :
                               lead.crm_sync_status === "error"  ? <AlertCircle className="w-2.5 h-2.5" /> :
                               <Clock className="w-2.5 h-2.5" />}
                              {lead.crm_sync_status === "synced" ? "CRM synced" :
                               lead.crm_sync_status === "error"  ? "CRM error" : "Not synced"}
                            </span>
                          )}
                          {lead.review_status === "approved" && lead.crm_contact_id?.startsWith("hs:") && (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium"
                              style={{ background: "rgba(255,122,89,.1)", color: "#FF7A59", borderColor: "rgba(255,122,89,.3)" }}>
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              HubSpot synced
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#6B7280] mt-0.5">
                          {lead.job_title}{lead.company_name ? ` · ${lead.company_name}` : ""}
                        </p>
                        {lead.email && <p className="text-xs text-[#6B7280] mt-0.5">{lead.email}</p>}
                        {(lead as any).phone && <p className="text-xs text-[#6B7280] mt-0.5">{(lead as any).phone}</p>}
                        {lead.linkedin_url && (
                          <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs text-[#6B4EFF] hover:text-[#5B3FE0] mt-1 transition-colors">
                            LinkedIn <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {hasCrm && lead.review_status === "approved" && (
                          <button
                            onClick={(e) => handleSyncLeadToCrm(lead.id, e)}
                            disabled={syncingLeadId === lead.id}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${
                              lead.crm_sync_status === "synced"
                                ? "border-[rgba(13,148,136,0.25)] text-[#0D9488] hover:bg-[rgba(13,148,136,0.1)]"
                                : lead.crm_sync_status === "error"
                                ? "border-[rgba(239,68,68,0.2)] text-[#EF4444] hover:bg-[rgba(239,68,68,0.08)]"
                                : "border-[rgba(107,78,255,0.15)] text-[#9CA3AF] hover:text-[#6B4EFF] hover:border-[rgba(107,78,255,0.3)] hover:bg-[#F5F3FF]"
                            }`}
                          >
                            {syncingLeadId === lead.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <RefreshCw className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {(!lead.review_status || lead.review_status === "pending") && (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleReview(lead.id, "approved"); }}
                              className="w-8 h-8 flex items-center justify-center rounded-lg border border-[rgba(107,78,255,0.15)] text-[#9CA3AF] hover:text-[#0D9488] hover:border-[rgba(13,148,136,0.25)] hover:bg-[rgba(13,148,136,0.08)] transition-colors"
                              title="Approve"
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleReview(lead.id, "rejected"); }}
                              className="w-8 h-8 flex items-center justify-center rounded-lg border border-[rgba(107,78,255,0.15)] text-[#9CA3AF] hover:text-[#EF4444] hover:border-[rgba(239,68,68,0.2)] hover:bg-[rgba(239,68,68,0.08)] transition-colors"
                              title="Reject"
                            >
                              <ThumbsDown className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── PROFILE SLIDE-OVER ── */}
      {profileLead && (() => {
        const lead = profileLead;
        const displayName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown";
        const linkedinStatus = (lead as Lead & { linkedin_status?: string }).linkedin_status;
        return (
          <>
            <div
              className="fixed inset-0 bg-black/20 z-40 backdrop-blur-[1px]"
              onClick={() => setProfileLead(null)}
            />
            <div className="fixed top-0 right-0 h-full w-full max-w-md bg-white border-l border-[rgba(107,78,255,0.15)] z-50 shadow-2xl flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(107,78,255,0.1)] bg-[#FAFAFE]">
                <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-widest">Lead profile</p>
                <button
                  onClick={() => setProfileLead(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F5F3FF] text-[#9CA3AF] hover:text-[#6B4EFF] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* Identity block */}
                <div className="px-6 py-6 border-b border-[rgba(107,78,255,0.1)]">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-full bg-[#F5F3FF] border-2 border-[rgba(107,78,255,0.2)] flex items-center justify-center text-[#6B4EFF] text-xl font-bold shrink-0 overflow-hidden">
                      {lead.profile_picture_url ? (
                        <img
                          src={lead.profile_picture_url}
                          alt={displayName}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const el = e.currentTarget;
                            el.style.display = "none";
                            el.parentElement!.textContent = displayName[0]?.toUpperCase() ?? "?";
                          }}
                        />
                      ) : (
                        displayName[0]?.toUpperCase() ?? "?"
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-semibold text-[#1E1B4B] leading-tight">{displayName}</h2>
                      {lead.job_title && <p className="text-sm text-[#6B7280] mt-0.5">{lead.job_title}</p>}
                      {lead.company_name && <p className="text-sm text-[#6B7280]">{lead.company_name}</p>}
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className={`inline-block text-xs px-2.5 py-0.5 rounded-full border font-medium ${statusPill(lead.review_status)}`}>
                          {lead.review_status ?? "new"}
                        </span>
                        {linkedinStatus && linkedinStatus !== "not_contacted" && (
                          <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full border font-medium ${
                            linkedinStatus === "request_sent" ? "bg-amber-50 text-amber-700 border-amber-200" :
                            linkedinStatus === "connected"    ? "bg-[rgba(13,148,136,0.1)] text-[#0D9488] border-[rgba(13,148,136,0.25)]" :
                            linkedinStatus === "replied"      ? "bg-[#F5F3FF] text-[#6B4EFF] border-[rgba(107,78,255,0.2)]" :
                            "bg-[#F9FAFB] text-[#9CA3AF] border-[#E5E7EB]"
                          }`}>
                            <Linkedin className="w-3 h-3" />
                            {linkedinStatus === "request_sent" ? "Request sent" :
                             linkedinStatus === "connected"    ? "Connected" :
                             linkedinStatus === "replied"      ? "Replied on LinkedIn" : "LI paused"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="px-6 py-5 space-y-5">
                  {(lead.email || lead.linkedin_url) && (
                    <div>
                      <p className="text-xs font-semibold text-[#1E1B4B] uppercase tracking-widest mb-2">Contact</p>
                      <div className="space-y-2">
                        {lead.email && (
                          <div className="flex items-center gap-3">
                            <Mail className="w-4 h-4 text-[#9CA3AF] shrink-0" />
                            <a href={`mailto:${lead.email}`} className="text-sm text-[#6B4EFF] hover:text-[#5B3FE0] hover:underline truncate transition-colors">{lead.email}</a>
                          </div>
                        )}
                        {lead.phone && (
                          <div className="flex items-center gap-3">
                            <Phone className="w-4 h-4 text-[#9CA3AF] shrink-0" />
                            <a href={`tel:${lead.phone}`} className="text-sm text-[#6B4EFF] hover:text-[#5B3FE0] hover:underline truncate transition-colors">
                              {lead.phone}
                            </a>
                          </div>
                        )}
                        {lead.linkedin_url && (
                          <div className="flex items-center gap-3">
                            <ExternalLink className="w-4 h-4 text-[#9CA3AF] shrink-0" />
                            <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-sm text-[#6B4EFF] hover:text-[#5B3FE0] hover:underline truncate transition-colors">
                              LinkedIn profile
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {(lead.seniority || lead.department) && (
                    <div>
                      <p className="text-xs font-semibold text-[#1E1B4B] uppercase tracking-widest mb-2">Role</p>
                      <div className="space-y-2">
                        {lead.seniority && (
                          <div className="flex items-center gap-3">
                            <Briefcase className="w-4 h-4 text-[#9CA3AF] shrink-0" />
                            <span className="text-sm text-[#1E1B4B] capitalize">{lead.seniority}</span>
                          </div>
                        )}
                        {lead.department && (
                          <div className="flex items-center gap-3">
                            <Users className="w-4 h-4 text-[#9CA3AF] shrink-0" />
                            <span className="text-sm text-[#1E1B4B]">{lead.department}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {(lead.company_name || lead.company_domain || lead.company_size || lead.industry) && (
                    <div>
                      <p className="text-xs font-semibold text-[#1E1B4B] uppercase tracking-widest mb-2">Company</p>
                      <div className="space-y-2">
                        {lead.company_name && (
                          <div className="flex items-center gap-3">
                            <Building2 className="w-4 h-4 text-[#9CA3AF] shrink-0" />
                            <span className="text-sm text-[#1E1B4B]">{lead.company_name}</span>
                          </div>
                        )}
                        {lead.company_domain && (
                          <div className="flex items-center gap-3">
                            <Globe className="w-4 h-4 text-[#9CA3AF] shrink-0" />
                            <a href={`https://${lead.company_domain}`} target="_blank" rel="noopener noreferrer" className="text-sm text-[#6B4EFF] hover:text-[#5B3FE0] hover:underline transition-colors">{lead.company_domain}</a>
                          </div>
                        )}
                        {lead.company_size && (
                          <div className="flex items-center gap-3">
                            <Users className="w-4 h-4 text-[#9CA3AF] shrink-0" />
                            <span className="text-sm text-[#1E1B4B]">{lead.company_size} employees</span>
                          </div>
                        )}
                        {lead.industry && (
                          <div className="flex items-center gap-3">
                            <Briefcase className="w-4 h-4 text-[#9CA3AF] shrink-0" />
                            <span className="text-sm text-[#1E1B4B]">{lead.industry}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {(lead.hq_city || lead.hq_country) && (
                    <div>
                      <p className="text-xs font-semibold text-[#1E1B4B] uppercase tracking-widest mb-2">Location</p>
                      <div className="flex items-center gap-3">
                        <MapPin className="w-4 h-4 text-[#9CA3AF] shrink-0" />
                        <span className="text-sm text-[#1E1B4B]">
                          {[lead.hq_city, lead.hq_country].filter(Boolean).join(", ")}
                        </span>
                      </div>
                    </div>
                  )}

                  {lead.research_blurb && (
                    <div>
                      <p className="text-xs font-semibold text-[#1E1B4B] uppercase tracking-widest mb-2">AI Research Notes</p>
                      <p className="text-sm text-[#6B7280] leading-relaxed bg-[#F8F7FF] border border-[rgba(107,78,255,0.12)] rounded-lg p-3">{lead.research_blurb}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* CRM sync status in panel */}
              {hasCrm && lead.review_status === "approved" && (
                <div className="px-6 py-3 border-t border-[rgba(107,78,255,0.1)]">
                  <div className={`flex items-center justify-between p-3 rounded-lg border ${
                    lead.crm_sync_status === "synced" ? "bg-[rgba(13,148,136,0.08)] border-[rgba(13,148,136,0.2)]" :
                    lead.crm_sync_status === "error"  ? "bg-[rgba(239,68,68,0.06)] border-[rgba(239,68,68,0.15)]" :
                    "bg-[#F8F7FF] border-[rgba(107,78,255,0.12)]"
                  }`}>
                    <div className="flex items-center gap-2">
                      {lead.crm_sync_status === "synced" ? <CheckCircle2 className="w-4 h-4 text-[#0D9488]" /> :
                       lead.crm_sync_status === "error"  ? <AlertCircle className="w-4 h-4 text-[#EF4444]" /> :
                       <Clock className="w-4 h-4 text-[#9CA3AF]" />}
                      <div>
                        <p className={`text-xs font-medium ${
                          lead.crm_sync_status === "synced" ? "text-[#0D9488]" :
                          lead.crm_sync_status === "error"  ? "text-[#EF4444]" : "text-[#1E1B4B]"
                        }`}>
                          {lead.crm_sync_status === "synced" ? "Synced to Attio" :
                           lead.crm_sync_status === "error"  ? "Sync failed" : "Not synced to CRM"}
                        </p>
                        {lead.crm_sync_status === "error" && lead.crm_sync_error && (
                          <p className="text-xs text-[#EF4444] mt-0.5 truncate max-w-[200px]">{lead.crm_sync_error}</p>
                        )}
                        {lead.crm_sync_status === "synced" && lead.crm_synced_at && (
                          <p className="text-xs text-[#0D9488]/70 mt-0.5">{new Date(lead.crm_synced_at).toLocaleString()}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleSyncLeadToCrm(lead.id, e)}
                      disabled={syncingLeadId === lead.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[rgba(107,78,255,0.15)] bg-white text-[#6B7280] rounded-lg hover:border-[#6B4EFF] hover:text-[#6B4EFF] transition-colors disabled:opacity-50"
                    >
                      {syncingLeadId === lead.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      {lead.crm_sync_status === "synced" ? "Re-sync" : "Sync now"}
                    </button>
                  </div>
                </div>
              )}

              {/* Footer actions */}
              {(!lead.review_status || lead.review_status === "pending") && (
                <div className="px-6 py-4 border-t border-[rgba(107,78,255,0.1)] flex gap-3">
                  <button
                    onClick={() => { handleReview(lead.id, "approved"); setProfileLead(null); }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#0D9488] text-white text-sm font-semibold rounded-lg hover:bg-[#0B7A6E] transition-colors"
                  >
                    <ThumbsUp className="w-4 h-4" /> Approve
                  </button>
                  <button
                    onClick={() => { handleReview(lead.id, "rejected"); setProfileLead(null); }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-[rgba(107,78,255,0.15)] text-[#6B7280] text-sm font-semibold rounded-lg hover:bg-[rgba(239,68,68,0.08)] hover:text-[#EF4444] hover:border-[rgba(239,68,68,0.2)] transition-colors"
                  >
                    <ThumbsDown className="w-4 h-4" /> Reject
                  </button>
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/* ── DELETE CONFIRMATION DIALOG ── */}
      {deleteConfirmList && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-50 backdrop-blur-[2px]"
            onClick={() => setDeleteConfirmList(null)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-[rgba(107,78,255,0.15)] rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-[rgba(239,68,68,0.08)] rounded-xl flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-[#1E1B4B] font-semibold text-base leading-tight">Delete this list?</p>
                  <p className="text-[#6B7280] text-sm mt-1 leading-relaxed">
                    <span className="font-medium text-[#1E1B4B]">"{deleteConfirmList.label || "Untitled list"}"</span> and all the leads inside it will be permanently deleted. This cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirmList(null)}
                  className="flex-1 py-2.5 border border-[rgba(107,78,255,0.15)] text-[#6B7280] text-sm font-semibold rounded-lg hover:bg-[#F5F3FF] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteList(deleteConfirmList)}
                  disabled={deleteLeadListMutation.isPending}
                  className="flex-1 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleteLeadListMutation.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Trash2 className="w-4 h-4" />}
                  {deleteLeadListMutation.isPending ? "Deleting…" : "Yes, delete"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}