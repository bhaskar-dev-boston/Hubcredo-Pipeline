import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  useGetCurrentStack,
  useCreateStack,
  useListTools,
  useListIcps,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListIcpsQueryKey } from "@workspace/api-client-react";
import { Layers, Zap, Loader2, ExternalLink, CheckCircle, Sparkles, ArrowRight, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useLocation } from "wouter";
import type { ToolItem, Tool, Icp } from "@workspace/api-client-react";
import { recommendedTools } from "@/lib/recommendedTools";

const CATEGORY_COLORS: Record<string, string> = {
  crm:         "bg-[rgba(99,102,241,.15)] border-[rgba(129,140,248,.3)] text-[#818cf8]",
  outreach:    "bg-[rgba(124,58,237,.15)] border-[rgba(192,132,252,.3)] text-[#c084fc]",
  email:       "bg-[rgba(124,58,237,.15)] border-[rgba(192,132,252,.3)] text-[#c084fc]",
  linkedin:    "bg-sky-50 border-sky-200 text-sky-700",
  enrichment:  "bg-[rgba(16,185,129,.1)] border-[rgba(52,211,153,.25)] text-[#34d399]",
  analytics:   "bg-[rgba(234,179,8,.1)] border-yellow-200 text-[#fbbf24]",
  automation:  "bg-pink-50 border-pink-200 text-pink-700",
  warmup:      "bg-orange-50 border-orange-200 text-orange-700",
  alerts:      "bg-indigo-50 border-indigo-200 text-indigo-700",
  leads:       "bg-teal-50 border-teal-200 text-teal-700",
  other:       "bg-[rgba(255,255,255,.04)] border-[rgba(255,255,255,.08)] text-[rgba(255,255,255,.5)]",
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
  const [activeTab, setActiveTab] = useState<"recommended" | "catalogue">("recommended");

  const currentIcp = (icps as Icp[])[0];
  const hasIcp =
    !!currentIcp &&
    ((currentIcp.job_titles?.length ?? 0) > 0 || (currentIcp.industries?.length ?? 0) > 0);

  async function handleAutoFill() {
    // Auto-fill functionality - implement when useAutoFillIcp is available
    toast({ title: "Feature unavailable", description: "Auto-fill will be available soon.", variant: "destructive" });
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
      // Note: settings_id needs to be obtained from user settings
      await createStack.mutateAsync({ data: { icp_id: currentIcp.id, settings_id: "" } });
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
            <h1 style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: "2rem", letterSpacing: "0.04em" }} className="text-white mb-1">
              My Stack
            </h1>
            <p className="text-[rgba(255,255,255,.5)] text-sm">AI-powered GTM toolkit personalised to your ICP</p>
          </div>
          {hasIcp ? (
            <button
              onClick={handleBuildStack}
              disabled={createStack.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-[#4f46e5] text-white text-sm font-semibold rounded-lg hover:bg-[#4338ca] transition-colors disabled:opacity-50"
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
                    disabled={false}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[rgba(255,255,255,.04)] border border-amber-300 text-amber-700 text-xs font-semibold rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-50"
                  >
                    <Sparkles className="w-3 h-3" />
                    Auto-fill from website analysis
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] rounded-lg p-1 w-fit">
          {(["recommended", "catalogue"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab
                  ? "bg-[rgba(255,255,255,.04)] text-white shadow-none border border-[rgba(255,255,255,.08)]"
                  : "text-[rgba(255,255,255,.5)] hover:text-white"
              }`}
            >
              {tab === "recommended" ? "My Stack" : "All Tools"}
            </button>
          ))}
        </div>

        {activeTab === "recommended" ? (
          <>
            {/* ── Always-pinned core stack ── */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="w-4 h-4 text-[#4f46e5]" />
                <p className="text-xs font-semibold text-white uppercase tracking-wider">Core Outbound Stack</p>
                <span className="text-[10px] px-2 py-0.5 bg-[#eef2ff] border border-[#c7d2fe] text-[#4f46e5] rounded-full font-medium">Always recommended</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {recommendedTools.map((tool) => (
                  <div
                    key={tool.id}
                    className={`relative bg-[rgba(255,255,255,.04)] rounded-xl p-5 flex flex-col gap-3 transition-all shadow-none hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] ${
                      tool.featured
                        ? "border-2 border-[#4f46e5]"
                        : "border border-[rgba(255,255,255,.08)] hover:border-[rgba(255,255,255,.15)]"
                    }`}
                  >
                    {tool.featured && (
                      <div className="absolute -top-3 left-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[#4f46e5] text-white text-[10px] font-semibold rounded-full shadow-sm">
                          <Star className="w-2.5 h-2.5 fill-white" />
                          Most Popular
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-white mb-1">{tool.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${categoryColor(tool.id === "inboxkit" ? "other" : tool.id === "unipile" ? "linkedin" : tool.id === "instantly" ? "email" : tool.id === "attio" ? "crm" : "enrichment")}`}>
                        {tool.category}
                      </span>
                    </div>
                    <p className="text-xs text-[rgba(255,255,255,.5)] leading-relaxed flex-1">{tool.description}</p>
                    <a
                      href={tool.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center justify-center gap-1.5 w-full py-2 text-xs font-semibold rounded-lg transition-colors ${
                        tool.featured
                          ? "bg-[#4f46e5] text-white hover:bg-[#4338ca]"
                          : "bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] text-white hover:bg-[#eef2ff] hover:border-[#c7d2fe] hover:text-[#4f46e5]"
                      }`}
                    >
                      {tool.ctaLabel}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* ── AI personalised stack ── */}
            {createStack.isPending ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="relative">
                  <Sparkles className="w-9 h-9 text-[#4f46e5]" />
                  <Loader2 className="w-9 h-9 text-[#4f46e5] animate-spin absolute inset-0" />
                </div>
                <div className="text-center">
                  <p className="text-white font-semibold mb-1">AI is analysing your ICP…</p>
                  <p className="text-[rgba(255,255,255,.5)] text-sm">Generating personalised tool recommendations</p>
                </div>
              </div>
            ) : stackLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-[rgba(255,255,255,.5)] animate-spin" />
              </div>
            ) : !stack ? (
              <div className="bg-[rgba(255,255,255,.04)] border border-dashed border-[rgba(255,255,255,.08)] rounded-xl p-10 text-center">
                <Sparkles className="w-8 h-8 text-[#CBD5E1] mx-auto mb-3" />
                <h3 className="text-white font-semibold mb-1.5 text-sm">Add AI-personalised tools</h3>
                <p className="text-[rgba(255,255,255,.5)] text-xs mb-5 max-w-xs mx-auto">
                  {hasIcp
                    ? "Generate additional tool recommendations personalised to your ICP."
                    : "Fill in your ICP first to get AI-personalised tool recommendations."}
                </p>
                {hasIcp ? (
                  <button
                    onClick={handleBuildStack}
                    disabled={createStack.isPending}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#4f46e5] text-white text-xs font-semibold rounded-lg hover:bg-[#4338ca] transition-colors disabled:opacity-50"
                  >
                    {createStack.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    Generate AI stack
                  </button>
                ) : (
                  <button
                    onClick={() => setLocation("/dashboard/settings")}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 transition-colors"
                  >
                    Fill in ICP first <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[rgba(255,255,255,.5)]" />
                    <p className="text-xs font-semibold text-white uppercase tracking-wider">AI Personalised</p>
                  </div>
                  <div className="px-2.5 py-1 bg-[#eef2ff] border border-[#c7d2fe] rounded-full text-[#4f46e5] text-xs font-medium flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" />
                    {stack.tools.length} tools for your ICP
                  </div>
                  {currentIcp?.job_titles?.slice(0, 2).map((t: string) => (
                    <span key={t} className="px-2.5 py-1 bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] rounded-full text-[rgba(255,255,255,.5)] text-xs">{t}</span>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {stack.tools.map((tool: ToolItem) => (
                    <div
                      key={tool.slug}
                      className="bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] rounded-xl p-5 hover:border-[rgba(255,255,255,.15)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition-all shadow-none"
                    >
                      <div className="flex items-start gap-2 mb-3">
                        {tool.is_required && (
                          <CheckCircle className="w-4 h-4 text-[#4f46e5] shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white mb-1.5">{tool.tool_name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${categoryColor(tool.category)}`}>
                            {tool.category}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-[rgba(255,255,255,.5)] leading-relaxed mb-2">{tool.reason}</p>
                      <p className="text-xs text-[rgba(255,255,255,.35)] capitalize font-medium">{tool.phase}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          toolsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-[rgba(255,255,255,.5)] animate-spin" />
            </div>
          ) : (tools as Tool[]).length === 0 ? (
            <p className="text-[rgba(255,255,255,.5)] text-sm text-center py-8">No tools in catalogue.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(tools as Tool[]).map((tool) => (
                <div
                  key={tool.id}
                  className="bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] rounded-xl p-5 hover:border-[rgba(255,255,255,.15)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition-all shadow-none"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <p className="text-sm font-semibold text-white mb-1.5">{tool.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${categoryColor(tool.category)}`}>
                        {tool.category}
                      </span>
                    </div>
                    {tool.referral_url && (
                      <a href={tool.referral_url} target="_blank" rel="noopener noreferrer"
                        className="text-[rgba(255,255,255,.5)] hover:text-[#4f46e5] transition-colors shrink-0">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                  {tool.description && <p className="text-xs text-[rgba(255,255,255,.5)] leading-relaxed mb-2">{tool.description}</p>}
                  {tool.pricing_summary && <p className="text-xs text-[rgba(255,255,255,.35)] mt-1">{tool.pricing_summary}</p>}
                  {tool.phase && <p className="text-xs text-[rgba(255,255,255,.35)] mt-1 capitalize">{tool.phase}</p>}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </DashboardLayout>
  );
}
