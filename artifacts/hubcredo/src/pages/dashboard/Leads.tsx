import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TagInput } from "@/components/ui/TagInput";
import {
  useListLeadLists,
  useCreateLeadList,
  useListLeads,
  useTriggerLeadScraping,
  useReviewLead,
  useListIcps,
  useGetMe,
  useGetCurrentLeadList,
} from "@workspace/api-client-react";
import { Users, Plus, Loader2, ThumbsUp, ThumbsDown, ExternalLink, Zap } from "lucide-react";
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
  const selectedList = (leadLists as LeadList[]).find((l) => l.id === selectedListId);

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
    } catch {
      toast({ title: "Error", description: "Could not create lead list.", variant: "destructive" });
    }
  }

  async function handleGenerateLeads() {
    if (!selectedListId || !currentIcp || !me) {
      toast({ title: "Setup required", description: "Make sure you have an ICP and a lead list selected.", variant: "destructive" });
      return;
    }
    setScraping(true);
    try {
      await triggerScraping.mutateAsync({
        data: {
          user_id: me.id,
          icp_id: currentIcp.id,
          lead_list_id: selectedListId,
        },
      });
      toast({ title: "Lead generation started", description: "This may take a few minutes. Leads will appear here when ready." });
      setTimeout(() => refetchLeads(), 8000);
    } catch {
      toast({ title: "Error", description: "Could not start lead scraping.", variant: "destructive" });
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

  const statusColor = (status?: string | null) => {
    if (status === "approved") return "text-green-400 bg-green-400/10 border-green-400/20";
    if (status === "rejected") return "text-red-400 bg-red-400/10 border-red-400/20";
    return "text-[#888888] bg-[#2A2A2A] border-[#444]";
  };

  return (
    <DashboardLayout>
      <div className="p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1
              style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", letterSpacing: "0.04em" }}
              className="text-white mb-1"
            >
              My Leads
            </h1>
            <p className="text-[#888888] text-sm">Generate and manage qualified prospects</p>
          </div>
          <button
            onClick={() => setShowNewList(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#F5A623] text-[#0E0E0E] text-sm font-semibold rounded-lg hover:bg-[#E09612] transition-colors"
          >
            <Plus className="w-4 h-4" /> New list
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left — lists */}
          <div className="space-y-3">
            <p className="text-xs text-[#888888] uppercase tracking-widest font-medium">Lead lists</p>
            {listsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-[#888888] animate-spin" />
              </div>
            ) : (leadLists as LeadList[]).length === 0 ? (
              <div className="bg-[#1C1C1C] border border-dashed border-[#2A2A2A] rounded-xl p-6 text-center">
                <Users className="w-8 h-8 text-[#888888] mx-auto mb-2" />
                <p className="text-sm text-[#888888]">No lists yet</p>
                <button
                  onClick={() => setShowNewList(true)}
                  className="text-xs text-[#F5A623] hover:text-[#E09612] mt-1 transition-colors"
                >
                  Create one
                </button>
              </div>
            ) : (
              (leadLists as LeadList[]).map((list) => (
                <button
                  key={list.id}
                  onClick={() => setSelectedListId(list.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors ${
                    selectedListId === list.id
                      ? "bg-[#F5A623]/5 border-[#F5A623]/30"
                      : "bg-[#1C1C1C] border-[#2A2A2A] hover:border-[#444]"
                  }`}
                >
                  <p className="text-sm font-medium text-white">{list.label || "Untitled list"}</p>
                  <p className="text-xs text-[#888888] mt-0.5 capitalize">{list.status}</p>
                </button>
              ))
            )}

            {/* New list form */}
            {showNewList && (
              <div className="bg-[#1C1C1C] border border-[#F5A623]/30 rounded-xl p-4 space-y-3">
                <input
                  autoFocus
                  value={listLabel}
                  onChange={(e) => setListLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateList()}
                  placeholder="List name"
                  className="w-full px-3 py-2 bg-[#0E0E0E] border border-[#2A2A2A] rounded-lg text-sm text-white placeholder:text-[#888888] focus:outline-none focus:border-[#F5A623] transition-colors"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateList}
                    disabled={createLeadList.isPending}
                    className="flex-1 py-2 bg-[#F5A623] text-[#0E0E0E] text-sm font-semibold rounded-lg hover:bg-[#E09612] transition-colors disabled:opacity-50"
                  >
                    {createLeadList.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Create"}
                  </button>
                  <button
                    onClick={() => setShowNewList(false)}
                    className="flex-1 py-2 border border-[#2A2A2A] text-[#888888] text-sm rounded-lg hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right — generate + leads */}
          <div className="lg:col-span-2 space-y-5">
            {/* Generate section */}
            {selectedList && (
              <div className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-semibold text-sm">Generate leads for "{selectedList.label || "list"}"</h3>
                  <Zap className="w-4 h-4 text-[#F5A623]" />
                </div>
                {currentIcp ? (
                  <div className="text-xs text-[#888888]">
                    Using ICP: {currentIcp.job_titles?.slice(0, 2).join(", ") || "All titles"} · {currentIcp.industries?.slice(0, 2).join(", ") || "All industries"}
                  </div>
                ) : (
                  <p className="text-xs text-[#F5A623]">No ICP set. Go to Settings to define your target audience.</p>
                )}
                <button
                  onClick={handleGenerateLeads}
                  disabled={scraping || !currentIcp}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#F5A623] text-[#0E0E0E] text-sm font-semibold rounded-lg hover:bg-[#E09612] transition-colors disabled:opacity-50"
                >
                  {scraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Generate leads via LinkedIn
                </button>
              </div>
            )}

            {!selectedListId ? (
              <div className="bg-[#1C1C1C] border border-dashed border-[#2A2A2A] rounded-xl p-12 text-center">
                <Users className="w-10 h-10 text-[#888888] mx-auto mb-3" />
                <p className="text-white font-medium mb-1">Select a lead list</p>
                <p className="text-sm text-[#888888]">Choose a list on the left to view and generate leads</p>
              </div>
            ) : leadsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-[#888888] animate-spin" />
              </div>
            ) : (leads as Lead[]).length === 0 ? (
              <div className="bg-[#1C1C1C] border border-dashed border-[#2A2A2A] rounded-xl p-12 text-center">
                <p className="text-sm text-[#888888]">No leads in this list yet. Generate some above.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-[#888888] uppercase tracking-widest font-medium">{(leads as Lead[]).length} leads</p>
                {(leads as Lead[]).map((lead) => {
                  const displayName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown";
                  return (
                    <div
                      key={lead.id}
                      className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-xl p-4 flex items-start gap-4 hover:border-[#444] transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full bg-[#F5A623]/10 border border-[#F5A623]/20 flex items-center justify-center text-[#F5A623] text-sm font-bold shrink-0">
                        {displayName[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-white">{displayName}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor(lead.review_status)}`}>
                            {lead.review_status ?? "new"}
                          </span>
                        </div>
                        <p className="text-xs text-[#888888] mt-0.5">
                          {lead.job_title}{lead.company_name ? ` · ${lead.company_name}` : ""}
                        </p>
                        {lead.email && (
                          <p className="text-xs text-[#888888] mt-0.5">{lead.email}</p>
                        )}
                        {lead.linkedin_url && (
                          <a
                            href={lead.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-[#F5A623] hover:text-[#E09612] mt-1 transition-colors"
                          >
                            LinkedIn <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      {!lead.review_status || lead.review_status === "pending" ? (
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => handleReview(lead.id, "approved")}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#2A2A2A] text-[#888888] hover:text-green-400 hover:border-green-400/30 transition-colors"
                            title="Approve"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleReview(lead.id, "rejected")}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#2A2A2A] text-[#888888] hover:text-red-400 hover:border-red-400/30 transition-colors"
                            title="Reject"
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : null}
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
