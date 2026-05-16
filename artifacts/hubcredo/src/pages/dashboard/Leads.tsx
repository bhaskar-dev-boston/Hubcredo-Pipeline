import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  useListLeadLists,
  useCreateLeadList,
  useListLeads,
  useTriggerLeadScraping,
  useReviewLead,
  useListIcps,
  useGetMe,
} from "@workspace/api-client-react";
import { Users, Plus, Loader2, ThumbsUp, ThumbsDown, ExternalLink, Zap, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Lead, LeadList, Icp } from "@workspace/api-client-react";

export default function Leads() {
  const { toast } = useToast();
  const [showNewList, setShowNewList] = useState(false);
  const [listLabel, setListLabel] = useState("");
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [scraping, setScraping] = useState(false);

  const { data: me } = useGetMe();
  const { data: leadLists = [], isLoading: listsLoading, refetch: refetchLists } = useListLeadLists();
  const { data: leads = [], isLoading: leadsLoading, refetch: refetchLeads } = useListLeads(
    selectedListId ? { lead_list_id: selectedListId } : undefined
  );
  const { data: icps = [] } = useListIcps();
  const createLeadList = useCreateLeadList();
  const triggerScraping = useTriggerLeadScraping();
  const reviewLead = useReviewLead();

  const currentIcp = (icps as Icp[])[0];
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

  async function handleGenerateLeads() {
    if (!me) {
      toast({ title: "Not signed in", description: "Please sign in and try again.", variant: "destructive" });
      return;
    }
    if (!currentIcp) {
      toast({ title: "ICP required", description: "Set up your ICP in Settings before generating leads.", variant: "destructive" });
      return;
    }

    setScraping(true);
    try {
      let listId = activeListId;

      // Auto-create a list if none exists
      if (!listId) {
        const newList = await createLeadList.mutateAsync({
          data: { icp_id: currentIcp.id, label: "Lead List 1" },
        });
        listId = newList.id;
        setSelectedListId(newList.id);
        await refetchLists();
      }

      await triggerScraping.mutateAsync({
        data: { user_id: me.id, icp_id: currentIcp.id, lead_list_id: listId },
      });

      toast({
        title: "Lead generation started!",
        description: "Your n8n workflow is running. Leads will appear here in a few minutes.",
      });
      setTimeout(() => refetchLeads(), 8000);
    } catch {
      toast({ title: "Error", description: "Could not start lead scraping. Check your n8n workflow is active.", variant: "destructive" });
    } finally {
      setScraping(false);
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
    if (status === "approved") return "bg-green-50 border-green-200 text-green-700";
    if (status === "rejected") return "bg-red-50 border-red-200 text-red-600";
    return "bg-[#F5F7FA] border-[#E2E8F0] text-[#64748B]";
  };

  return (
    <DashboardLayout>
      <div className="p-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 pt-2">
          <div>
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", letterSpacing: "0.04em" }} className="text-[#0A0A0A] mb-1">
              My Leads
            </h1>
            <p className="text-[#64748B] text-sm">Generate and manage qualified prospects from LinkedIn</p>
          </div>
        </div>

        {/* ── MAIN TRIGGER CARD ── */}
        <div className="bg-[#2563EB] rounded-xl p-6 mb-8 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="w-12 h-12 bg-white/15 rounded-xl flex items-center justify-center shrink-0">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-base mb-0.5">Generate LinkedIn leads</p>
            <p className="text-blue-100 text-sm leading-relaxed">
              Triggers your n8n scraping workflow with your ICP targeting.
              {selectedList
                ? <> Running against <span className="font-semibold text-white">"{selectedList.label}"</span>.</>
                : lists.length === 0
                ? " A new list will be created automatically."
                : " Using your most recent list."}
            </p>
            {!currentIcp && (
              <p className="text-yellow-200 text-xs mt-1.5">⚠ No ICP found — set one up in Settings first.</p>
            )}
          </div>
          <button
            onClick={handleGenerateLeads}
            disabled={scraping || !currentIcp}
            className="flex items-center gap-2.5 px-6 py-3 bg-white text-[#2563EB] font-bold rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50 shrink-0 text-sm"
          >
            {scraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {scraping ? "Scraping…" : "Generate leads"}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left — lists */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 mb-3">
              <p className="text-xs text-[#64748B] uppercase tracking-widest font-medium">Lead lists</p>
              <button
                onClick={() => setShowNewList(true)}
                className="flex items-center gap-1 text-xs text-[#2563EB] hover:text-[#1D4ED8] transition-colors font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            </div>

            {listsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-[#64748B] animate-spin" />
              </div>
            ) : lists.length === 0 ? (
              <div className="bg-white border border-dashed border-[#E2E8F0] rounded-xl p-6 text-center">
                <Users className="w-8 h-8 text-[#CBD5E1] mx-auto mb-2" />
                <p className="text-sm text-[#64748B]">No lists yet</p>
                <p className="text-xs text-[#94A3B8] mt-1">One will be created when you generate leads</p>
              </div>
            ) : (
              lists.map((list) => (
                <button
                  key={list.id}
                  onClick={() => setSelectedListId(list.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                    activeListId === list.id
                      ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#2563EB]"
                      : "bg-white border-[#E2E8F0] text-[#0A0A0A] hover:border-[#CBD5E1] hover:bg-[#F5F7FA]"
                  }`}
                >
                  <p className="text-sm font-medium truncate">{list.label || "Untitled list"}</p>
                  <p className={`text-xs mt-0.5 capitalize ${activeListId === list.id ? "text-[#2563EB]/70" : "text-[#64748B]"}`}>{list.status}</p>
                </button>
              ))
            )}

            {showNewList && (
              <div className="bg-white border border-[#2563EB]/30 rounded-xl p-4 space-y-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                <input
                  autoFocus
                  value={listLabel}
                  onChange={(e) => setListLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateList()}
                  placeholder="List name"
                  className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-[#0A0A0A] placeholder:text-[#64748B] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 transition-colors"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateList}
                    disabled={createLeadList.isPending}
                    className="flex-1 py-2 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
                  >
                    {createLeadList.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Create"}
                  </button>
                  <button
                    onClick={() => setShowNewList(false)}
                    className="flex-1 py-2 border border-[#E2E8F0] text-[#64748B] text-sm rounded-lg hover:bg-[#F5F7FA] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ICP summary */}
            {currentIcp && (
              <div className="mt-4 p-3 bg-[#F5F7FA] border border-[#E2E8F0] rounded-lg">
                <p className="text-xs font-medium text-[#0A0A0A] mb-1">Active ICP targeting</p>
                {currentIcp.job_titles?.length ? (
                  <p className="text-xs text-[#64748B]">{currentIcp.job_titles.slice(0, 3).join(", ")}{currentIcp.job_titles.length > 3 ? ` +${currentIcp.job_titles.length - 3}` : ""}</p>
                ) : null}
                {currentIcp.industries?.length ? (
                  <p className="text-xs text-[#64748B] mt-0.5">{currentIcp.industries.slice(0, 2).join(", ")}</p>
                ) : null}
              </div>
            )}
          </div>

          {/* Right — leads */}
          <div className="lg:col-span-2 space-y-4">
            {activeListId && selectedList && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#64748B] uppercase tracking-widest font-medium">
                  {leadsLoading ? "Loading…" : `${(leads as Lead[]).length} leads in "${selectedList.label}"`}
                </p>
                {lists.length > 1 && (
                  <div className="relative">
                    <select
                      value={activeListId}
                      onChange={(e) => setSelectedListId(e.target.value)}
                      className="appearance-none text-xs text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg pl-3 pr-7 py-1.5 focus:outline-none cursor-pointer"
                    >
                      {lists.map((l) => <option key={l.id} value={l.id}>{l.label || "Untitled list"}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#2563EB] pointer-events-none" />
                  </div>
                )}
              </div>
            )}

            {leadsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-[#64748B] animate-spin" />
              </div>
            ) : (leads as Lead[]).length === 0 ? (
              <div className="bg-white border border-dashed border-[#E2E8F0] rounded-xl p-16 text-center">
                <Users className="w-10 h-10 text-[#CBD5E1] mx-auto mb-3" />
                <p className="text-[#0A0A0A] font-medium mb-1">No leads yet</p>
                <p className="text-sm text-[#64748B] mb-4">Click the blue "Generate leads" button above to kick off your n8n workflow.</p>
                <button
                  onClick={handleGenerateLeads}
                  disabled={scraping || !currentIcp}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
                >
                  {scraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Generate leads
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {(leads as Lead[]).map((lead) => {
                  const displayName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown";
                  return (
                    <div
                      key={lead.id}
                      className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex items-start gap-4 hover:border-[#CBD5E1] transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB] text-sm font-bold shrink-0">
                        {displayName[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-[#0A0A0A]">{displayName}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${statusPill(lead.review_status)}`}>
                            {lead.review_status ?? "new"}
                          </span>
                        </div>
                        <p className="text-xs text-[#64748B] mt-0.5">
                          {lead.job_title}{lead.company_name ? ` · ${lead.company_name}` : ""}
                        </p>
                        {lead.email && <p className="text-xs text-[#64748B] mt-0.5">{lead.email}</p>}
                        {lead.linkedin_url && (
                          <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:text-[#1D4ED8] mt-1 transition-colors">
                            LinkedIn <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      {(!lead.review_status || lead.review_status === "pending") && (
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => handleReview(lead.id, "approved")}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E2E8F0] text-[#64748B] hover:text-green-600 hover:border-green-200 hover:bg-green-50 transition-colors"
                            title="Approve"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleReview(lead.id, "rejected")}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E2E8F0] text-[#64748B] hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                            title="Reject"
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
