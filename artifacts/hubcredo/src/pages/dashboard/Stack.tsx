import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  useGetCurrentStack,
  useCreateStack,
  useListTools,
  useListIcps,
  useGetOutreachSettings,
} from "@workspace/api-client-react";
import { Layers, Zap, Loader2, ExternalLink, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import type { ToolItem, Tool, Icp, OutreachSettings } from "@workspace/api-client-react";

const CATEGORY_COLORS: Record<string, string> = {
  crm: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  outreach: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  enrichment: "text-green-400 bg-green-400/10 border-green-400/20",
  analytics: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  automation: "text-pink-400 bg-pink-400/10 border-pink-400/20",
  other: "text-[#888888] bg-[#2A2A2A] border-[#444]",
};

function categoryColor(category?: string) {
  return CATEGORY_COLORS[(category ?? "").toLowerCase()] ?? CATEGORY_COLORS.other;
}

export default function Stack() {
  const { toast } = useToast();
  const { data: stack, isLoading: stackLoading, refetch } = useGetCurrentStack();
  const { data: tools = [], isLoading: toolsLoading } = useListTools();
  const { data: icps = [] } = useListIcps();
  const { data: outreachSettings } = useGetOutreachSettings();
  const createStack = useCreateStack();
  const [activeTab, setActiveTab] = useState<"recommended" | "catalogue">("recommended");

  const currentIcp = (icps as Icp[])[0];
  const currentOutreach = outreachSettings as OutreachSettings | undefined;

  async function handleBuildStack() {
    if (!currentIcp || !currentOutreach) {
      toast({
        title: "Setup required",
        description: "Complete your ICP and outreach settings in the Settings page first.",
        variant: "destructive",
      });
      return;
    }
    try {
      await createStack.mutateAsync({ data: { icp_id: currentIcp.id, settings_id: currentOutreach.id } });
      toast({ title: "Stack built!", description: "Your personalised sales stack is ready." });
      refetch();
    } catch {
      toast({ title: "Error", description: "Could not build stack.", variant: "destructive" });
    }
  }

  return (
    <DashboardLayout>
      <div className="p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1
              style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", letterSpacing: "0.04em" }}
              className="text-white mb-1"
            >
              My Stack
            </h1>
            <p className="text-[#888888] text-sm">Your personalised GTM toolkit</p>
          </div>
          <button
            onClick={handleBuildStack}
            disabled={createStack.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-[#F5A623] text-[#0E0E0E] text-sm font-semibold rounded-lg hover:bg-[#E09612] transition-colors disabled:opacity-50"
          >
            {createStack.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Rebuild stack
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg p-1 w-fit">
          {(["recommended", "catalogue"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab ? "bg-[#F5A623] text-[#0E0E0E]" : "text-[#888888] hover:text-white"
              }`}
            >
              {tab === "recommended" ? "My Stack" : "All Tools"}
            </button>
          ))}
        </div>

        {activeTab === "recommended" ? (
          stackLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-[#888888] animate-spin" />
            </div>
          ) : !stack ? (
            <div className="bg-[#1C1C1C] border border-dashed border-[#2A2A2A] rounded-xl p-16 text-center">
              <Layers className="w-12 h-12 text-[#888888] mx-auto mb-4" />
              <h3 className="text-white font-semibold mb-2">No stack built yet</h3>
              <p className="text-[#888888] text-sm mb-6 max-w-sm mx-auto">
                Build your personalised GTM stack based on your company stage, ICP, and sales motion.
              </p>
              <button
                onClick={handleBuildStack}
                disabled={createStack.isPending}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#F5A623] text-[#0E0E0E] text-sm font-semibold rounded-lg hover:bg-[#E09612] transition-colors disabled:opacity-50 mx-auto"
              >
                {createStack.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Build my stack
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="px-3 py-1.5 bg-[#F5A623]/10 border border-[#F5A623]/20 rounded-full text-[#F5A623] text-xs font-medium">
                  {stack.tools.length} tools recommended
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {stack.tools.map((tool: ToolItem) => (
                  <div
                    key={tool.slug}
                    className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-xl p-5 hover:border-[#444] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          {tool.is_required && <CheckCircle className="w-3.5 h-3.5 text-[#F5A623] shrink-0" />}
                          <p className="text-sm font-semibold text-white">{tool.tool_name}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${categoryColor(tool.category)}`}>
                          {tool.category}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-[#888888] leading-relaxed mb-2">{tool.reason}</p>
                    <p className="text-xs text-[#888888]/60 capitalize">{tool.phase}</p>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : (
          toolsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-[#888888] animate-spin" />
            </div>
          ) : (tools as Tool[]).length === 0 ? (
            <p className="text-[#888888] text-sm text-center py-8">No tools in catalogue.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(tools as Tool[]).map((tool) => (
                <div
                  key={tool.id}
                  className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-xl p-5 hover:border-[#444] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <p className="text-sm font-semibold text-white mb-1">{tool.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${categoryColor(tool.category)}`}>
                        {tool.category}
                      </span>
                    </div>
                    {tool.referral_url && (
                      <a
                        href={tool.referral_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#888888] hover:text-[#F5A623] transition-colors shrink-0"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                  {tool.description && (
                    <p className="text-xs text-[#888888] leading-relaxed mb-2">{tool.description}</p>
                  )}
                  {tool.pricing_summary && (
                    <p className="text-xs text-[#888888]/60 mt-1">{tool.pricing_summary}</p>
                  )}
                  {tool.phase && (
                    <p className="text-xs text-[#888888]/50 mt-1 capitalize">{tool.phase}</p>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </DashboardLayout>
  );
}
