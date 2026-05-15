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
  crm: "bg-blue-50 border-blue-200 text-blue-700",
  outreach: "bg-purple-50 border-purple-200 text-purple-700",
  enrichment: "bg-green-50 border-green-200 text-green-700",
  analytics: "bg-yellow-50 border-yellow-200 text-yellow-700",
  automation: "bg-pink-50 border-pink-200 text-pink-700",
  other: "bg-[#F5F7FA] border-[#E2E8F0] text-[#64748B]",
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
      toast({ title: "Setup required", description: "Complete your ICP and outreach settings in Settings first.", variant: "destructive" });
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
        <div className="flex items-center justify-between mb-8 pt-2">
          <div>
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", letterSpacing: "0.04em" }} className="text-[#0A0A0A] mb-1">
              My Stack
            </h1>
            <p className="text-[#64748B] text-sm">Your personalised GTM toolkit</p>
          </div>
          <button
            onClick={handleBuildStack}
            disabled={createStack.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
          >
            {createStack.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Rebuild stack
          </button>
        </div>

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
          stackLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-[#64748B] animate-spin" />
            </div>
          ) : !stack ? (
            <div className="bg-white border border-dashed border-[#E2E8F0] rounded-xl p-16 text-center">
              <Layers className="w-12 h-12 text-[#CBD5E1] mx-auto mb-4" />
              <h3 className="text-[#0A0A0A] font-semibold mb-2">No stack built yet</h3>
              <p className="text-[#64748B] text-sm mb-6 max-w-sm mx-auto">
                Build your personalised GTM stack based on your company stage, ICP, and sales motion.
              </p>
              <button
                onClick={handleBuildStack}
                disabled={createStack.isPending}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
              >
                {createStack.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Build my stack
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="px-3 py-1.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-full text-[#2563EB] text-xs font-medium">
                  {stack.tools.length} tools recommended
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {stack.tools.map((tool: ToolItem) => (
                  <div
                    key={tool.slug}
                    className="bg-white border border-[#E2E8F0] rounded-xl p-5 hover:border-[#CBD5E1] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                  >
                    <div className="flex items-start gap-2 mb-3">
                      {tool.is_required && <CheckCircle className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#0A0A0A] mb-1.5">{tool.tool_name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${categoryColor(tool.category)}`}>
                          {tool.category}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-[#64748B] leading-relaxed mb-2">{tool.reason}</p>
                    <p className="text-xs text-[#94A3B8] capitalize">{tool.phase}</p>
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
