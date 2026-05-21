import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  useGetCurrentStack,
  useCreateStack,
  useListTools,
  useListIcps,
  useAutoFillIcp,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListIcpsQueryKey } from "@workspace/api-client-react";
import { Layers, Zap, Loader2, ExternalLink, CheckCircle, Sparkles, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useLocation } from "wouter";
import type { ToolItem, Tool, Icp } from "@workspace/api-client-react";

const CATEGORY_COLORS: Record<string, string> = {
  crm:         "bg-blue-50 border-blue-200 text-blue-700",
  outreach:    "bg-purple-50 border-purple-200 text-purple-700",
  email:       "bg-purple-50 border-purple-200 text-purple-700",
  linkedin:    "bg-sky-50 border-sky-200 text-sky-700",
  enrichment:  "bg-green-50 border-green-200 text-green-700",
  analytics:   "bg-yellow-50 border-yellow-200 text-yellow-700",
  automation:  "bg-pink-50 border-pink-200 text-pink-700",
  warmup:      "bg-orange-50 border-orange-200 text-orange-700",
  alerts:      "bg-indigo-50 border-indigo-200 text-indigo-700",
  leads:       "bg-teal-50 border-teal-200 text-teal-700",
  other:       "bg-[#F5F7FA] border-[#E2E8F0] text-[#64748B]",
};

function categoryColor(category?: string) {
  return CATEGORY_COLORS[(category ?? "").toLowerCase()] ?? CATEGORY_COLORS.other;
}

export default function Stack() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: stack, isLoading: stackLoading, refetch } = useGetCurrentStack();
  const { data: tools = [], isLoading: toolsLoading } = useListTools();
  const { data: icps = [], refetch: refetchIcps } = useListIcps();
  const createStack = useCreateStack();
  const autoFillIcp = useAutoFillIcp();
  const [activeTab, setActiveTab] = useState<"recommended" | "catalogue">("recommended");

  const currentIcp = (icps as Icp[])[0];
  const hasIcp =
    !!currentIcp &&
    ((currentIcp.job_titles?.length ?? 0) > 0 || (currentIcp.industries?.length ?? 0) > 0);

  async function handleAutoFill() {
    try {
      await autoFillIcp.mutateAsync();
      await queryClient.invalidateQueries({ queryKey: getListIcpsQueryKey() });
      await refetchIcps();
      toast({ title: "ICP auto-filled!", description: "Your ICP has been populated from your website analysis. You can now generate your stack." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.toLowerCase().includes("no completed") || msg.toLowerCase().includes("no website") || msg.toLowerCase().includes("analysis")) {
        toast({ title: "Website analysis needed", description: "Run your website analysis on the Dashboard first, then come back here.", variant: "destructive" });
        setLocation("/dashboard");
      } else {
        toast({ title: "Auto-fill failed", description: msg || "Could not generate ICP. Try again.", variant: "destructive" });
      }
    }
  }

  async function handleBuildStack() {
    if (!hasIcp) {
      toast({
        title: "ICP required",
        description: "Fill in your ICP profile in Settings before generating a stack.",
        variant: "destructive",
      });
      return;
    }
    try {
      await createStack.mutateAsync({ data: { icp_id: currentIcp.id } });
      toast({ title: "AI stack generated!", description: "Your personalised sales stack is ready." });
      refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not build stack.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 sm:mb-8 pt-2 gap-3">
          <div>
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", letterSpacing: "0.04em" }} className="text-[#0A0A0A] mb-1">
              My Stack
            </h1>
            <p className="text-[#64748B] text-sm">AI-powered GTM toolkit personalised to your ICP</p>
          </div>
          {hasIcp ? (
            <button
              onClick={handleBuildStack}
              disabled={createStack.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
            >
              {createStack.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {createStack.isPending ? "Generating…" : "Rebuild stack"}
            </button>
          ) : null}
        </div>

        {/* ICP gate */}
        {!hasIcp && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-9 h-9 bg-amber-100 border border-amber-200 rounded-lg flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800 mb-0.5">Fill in your ICP to generate a personalised stack</p>
                <p className="text-sm text-amber-700 leading-relaxed mb-3">
                  The AI needs at least your <strong>target job titles</strong> or <strong>target industries</strong> to recommend the right tools.
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
                    disabled={autoFillIcp.isPending}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-amber-300 text-amber-700 text-xs font-semibold rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-50"
                  >
                    {autoFillIcp.isPending
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Sparkles className="w-3 h-3" />}
                    {autoFillIcp.isPending ? "Generating ICP…" : "Auto-fill from website analysis"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-[#F5F7FA] border border-[#E2E8F0] rounded-lg p-1 w-fit">
          {(["recommended", "catalogue"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab
                  ? "bg-white text-[#0A0A0A] shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-[#E2E8F0]"
                  : "text-[#64748B] hover:text-[#0A0A0A]"
              }`}
            >
              {tab === "recommended" ? "My Stack" : "All Tools"}
            </button>
          ))}
        </div>

        {activeTab === "recommended" ? (
          createStack.isPending ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="relative">
                <Sparkles className="w-10 h-10 text-[#2563EB]" />
                <Loader2 className="w-10 h-10 text-[#2563EB] animate-spin absolute inset-0" />
              </div>
              <div className="text-center">
                <p className="text-[#0A0A0A] font-semibold mb-1">AI is analysing your ICP…</p>
                <p className="text-[#64748B] text-sm">Generating personalised tool recommendations</p>
              </div>
            </div>
          ) : stackLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-[#64748B] animate-spin" />
            </div>
          ) : !stack ? (
            <div className="bg-white border border-dashed border-[#E2E8F0] rounded-xl p-16 text-center">
              <Layers className="w-12 h-12 text-[#CBD5E1] mx-auto mb-4" />
              <h3 className="text-[#0A0A0A] font-semibold mb-2">No stack generated yet</h3>
              <p className="text-[#64748B] text-sm mb-6 max-w-sm mx-auto">
                {hasIcp
                  ? "Generate your AI-powered GTM stack personalised to your ICP, outreach channels, and sales motion."
                  : "Fill in your ICP first, then generate your personalised GTM stack."}
              </p>
              {hasIcp ? (
                <button
                  onClick={handleBuildStack}
                  disabled={createStack.isPending}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
                >
                  {createStack.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Generate my AI stack
                </button>
              ) : (
                <button
                  onClick={() => setLocation("/dashboard/settings")}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 transition-colors"
                >
                  Fill in ICP first <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* ICP context banner */}
              {currentIcp && (
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="px-3 py-1.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-full text-[#2563EB] text-xs font-medium flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" />
                    {stack.tools.length} tools recommended by AI
                  </div>
                  {currentIcp.job_titles?.slice(0, 2).map((t: string) => (
                    <span key={t} className="px-2.5 py-1 bg-[#F5F7FA] border border-[#E2E8F0] rounded-full text-[#64748B] text-xs">{t}</span>
                  ))}
                  {currentIcp.industries?.slice(0, 1).map((i: string) => (
                    <span key={i} className="px-2.5 py-1 bg-[#F5F7FA] border border-[#E2E8F0] rounded-full text-[#64748B] text-xs">{i}</span>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {stack.tools.map((tool: ToolItem) => (
                  <div
                    key={tool.slug}
                    className="bg-white border border-[#E2E8F0] rounded-xl p-5 hover:border-[#CBD5E1] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                  >
                    <div className="flex items-start gap-2 mb-3">
                      {tool.is_required && (
                        <CheckCircle className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#0A0A0A] mb-1.5">{tool.tool_name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${categoryColor(tool.category)}`}>
                          {tool.category}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-[#64748B] leading-relaxed mb-2">{tool.reason}</p>
                    <p className="text-xs text-[#94A3B8] capitalize font-medium">{tool.phase}</p>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : (
          toolsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-[#64748B] animate-spin" />
            </div>
          ) : (tools as Tool[]).length === 0 ? (
            <p className="text-[#64748B] text-sm text-center py-8">No tools in catalogue.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(tools as Tool[]).map((tool) => (
                <div
                  key={tool.id}
                  className="bg-white border border-[#E2E8F0] rounded-xl p-5 hover:border-[#CBD5E1] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <p className="text-sm font-semibold text-[#0A0A0A] mb-1.5">{tool.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${categoryColor(tool.category)}`}>
                        {tool.category}
                      </span>
                    </div>
                    {tool.referral_url && (
                      <a href={tool.referral_url} target="_blank" rel="noopener noreferrer"
                        className="text-[#64748B] hover:text-[#2563EB] transition-colors shrink-0">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                  {tool.description && <p className="text-xs text-[#64748B] leading-relaxed mb-2">{tool.description}</p>}
                  {tool.pricing_summary && <p className="text-xs text-[#94A3B8] mt-1">{tool.pricing_summary}</p>}
                  {tool.phase && <p className="text-xs text-[#94A3B8] mt-1 capitalize">{tool.phase}</p>}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </DashboardLayout>
  );
}
