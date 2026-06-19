import { useLocation } from "wouter";
import { ArrowRight, Users, Layers, Target, TrendingUp, Zap, Loader2, Globe } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  useGetDashboardSummary,
  useGetCurrentAnalysis,
  useGetCurrentStack,
  useListIcps,
  useGetOutreachSettings,
  useCreateStack,
  useGetMe,
  useTriggerAnalysis,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import type { Icp, OutreachSettings } from "@workspace/api-client-react";
import { CreditCostBadge } from "@/components/ui/CreditCostBadge";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: analysis, refetch: refetchAnalysis } = useGetCurrentAnalysis();
  const { data: stack } = useGetCurrentStack();
  const { data: icps = [] } = useListIcps();
  const { data: outreachSettings } = useGetOutreachSettings();
  const { data: me } = useGetMe();
  const createStack = useCreateStack();
  const triggerAnalysis = useTriggerAnalysis();

  const currentIcp = (icps as Icp[])[0];
  const currentOutreach = outreachSettings as OutreachSettings | undefined;

  async function handleTriggerAnalysis() {
    if (!analysis) {
      toast({ title: "No analysis found", description: "Go through onboarding to set your website URL first.", variant: "destructive" });
      return;
    }
    try {
      await triggerAnalysis.mutateAsync({
        data: {
          user_id: me?.id ?? "",
          website_url: analysis.website_url ?? "",
          analysis_id: analysis.id,
        },
      });
      toast({ title: "Analysis triggered!", description: "Your n8n workflow is now running. Check back in a few minutes." });
      setTimeout(() => refetchAnalysis(), 5000);
    } catch {
      toast({ title: "Error", description: "Could not trigger analysis. Check your n8n workflow is active.", variant: "destructive" });
    }
  }

  const stats = [
    { label: "Total Leads", value: summary?.total_leads ?? "—", icon: Users, href: "/dashboard/leads", color: "text-[#6B4EFF]", bg: "bg-[rgba(107,78,255,0.12)]" },
    { label: "Approved Leads", value: summary?.approved_leads ?? "—", icon: TrendingUp, href: "/dashboard/leads", color: "text-[#0D9488]", bg: "bg-[rgba(13,148,136,0.1)]" },
    { label: "Lead Lists", value: summary?.lead_lists_count ?? "—", icon: Target, href: "/dashboard/leads", color: "text-[#6B4EFF]", bg: "bg-[rgba(107,78,255,0.12)]" },
    { label: "Stack Tools", value: summary?.stack_tools_count ?? "—", icon: Layers, href: "/dashboard/stack", color: "text-[#6B4EFF]", bg: "bg-[#F5F3FF]" },
  ];

  async function handleBuildStack() {
    if (!currentIcp || !currentOutreach) {
      toast({ title: "Setup required", description: "Complete your ICP and outreach settings first.", variant: "destructive" });
      setLocation("/dashboard/settings");
      return;
    }
    try {
      await createStack.mutateAsync({ data: { icp_id: currentIcp.id, settings_id: currentOutreach.id } });
      toast({ title: "Stack built!", description: "Your personalised sales stack is ready." });
      setLocation("/dashboard/stack");
    } catch {
      toast({ title: "Error", description: "Could not build stack. Try again.", variant: "destructive" });
    }
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-8 max-w-5xl mx-auto">
        <div className="mb-6 sm:mb-8 pt-2">
          <h1
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: "2rem", letterSpacing: "0.04em" }}
            className="text-[#1E1B4B] mb-1"
          >
            Dashboard
          </h1>
          <p className="text-[#6B7280] text-sm">Your sales infrastructure at a glance</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map(({ label, value, icon: Icon, href, color, bg }) => (
            <button
              key={label}
              onClick={() => setLocation(href)}
              className="bg-white border border-[rgba(107,78,255,0.15)] rounded-xl p-5 text-left hover:border-[#6B4EFF] hover:shadow-[0_4px_16px_rgba(107,78,255,0.12)] transition-all group shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <ArrowRight className="w-4 h-4 text-[#6B7280] group-hover:text-[#6B4EFF] transition-colors" />
              </div>
              <p className="text-2xl font-bold text-[#1E1B4B] mb-1">
                {summaryLoading ? <Loader2 className="w-5 h-5 animate-spin inline text-[#6B7280]" /> : value}
              </p>
              <p className="text-xs text-[#6B7280]">{label}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Analysis card */}
          <div className="bg-white border border-[rgba(107,78,255,0.15)] rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[#1E1B4B] font-semibold">Company Analysis</h2>
              <span className={`text-xs px-2 py-1 rounded-full border font-medium ${
                analysis?.processing_status === "completed"
                  ? "bg-[rgba(13,148,136,0.1)] border-[rgba(13,148,136,0.25)] text-[#0D9488]"
                  : analysis
                  ? "bg-[#F5F3FF] border-[#C4B5FD] text-[#6B4EFF]"
                  : "bg-[#F9FAFB] border-[#E5E7EB] text-[#6B7280]"
              }`}>
                {analysis ? analysis.processing_status : "None"}
              </span>
            </div>
            {analysis ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-[#1E1B4B]">{analysis.company_name || "Your company"}</p>
                  <p className="text-xs text-[#6B7280] mt-0.5">{analysis.website_url}</p>
                </div>
                {analysis.product_summary && (
                  <p className="text-xs text-[#6B7280] line-clamp-2 leading-relaxed">{analysis.product_summary}</p>
                )}
                <button
                  onClick={handleTriggerAnalysis}
                  disabled={triggerAnalysis.isPending}
                  className="flex items-center gap-2 px-3 py-2 bg-[#6B4EFF] text-white text-xs font-semibold rounded-lg hover:bg-[#5B3FE0] transition-colors disabled:opacity-50 mt-1"
                >
                  {triggerAnalysis.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Globe className="w-3.5 h-3.5" />}
                  {triggerAnalysis.isPending ? "Running…" : "Run website analysis"}
                  {!triggerAnalysis.isPending && <CreditCostBadge action="company_analysis" variant="dark" />}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-[#6B7280]">No analysis yet. Go through onboarding to set your website URL first.</p>
                <button onClick={() => setLocation("/onboarding")} className="text-sm text-[#6B4EFF] hover:text-[#5B3FE0] transition-colors flex items-center gap-1">
                  Start onboarding <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Stack card */}
          <div className="bg-white border border-[rgba(107,78,255,0.15)] rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[#1E1B4B] font-semibold">Sales Stack</h2>
              <span className={`text-xs px-2 py-1 rounded-full border font-medium ${
                stack
                  ? "bg-[rgba(13,148,136,0.1)] border-[rgba(13,148,136,0.25)] text-[#0D9488]"
                  : "bg-[#F9FAFB] border-[#E5E7EB] text-[#6B7280]"
              }`}>
                {stack ? "Built" : "Not built"}
              </span>
            </div>
            {stack ? (
              <div className="space-y-2">
                {stack.tools.slice(0, 3).map((tool) => (
                  <div key={tool.slug} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#6B4EFF]" />
                    <span className="text-sm text-[#1E1B4B]">{tool.tool_name}</span>
                    <span className="text-xs text-[#6B7280]">· {tool.category}</span>
                  </div>
                ))}
                {stack.tools.length > 3 && <p className="text-xs text-[#6B7280]">+{stack.tools.length - 3} more tools</p>}
                <button onClick={() => setLocation("/dashboard/stack")} className="text-sm text-[#6B4EFF] hover:text-[#5B3FE0] transition-colors flex items-center gap-1 mt-2">
                  View full stack <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-[#6B7280]">Build your personalised GTM stack based on your ICP and stage.</p>
                <button
                  onClick={handleBuildStack}
                  disabled={createStack.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-[#6B4EFF] text-white text-sm font-semibold rounded-lg hover:bg-[#5B3FE0] transition-colors disabled:opacity-50"
                >
                  {createStack.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Build my stack
                </button>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="bg-white border border-[rgba(107,78,255,0.15)] rounded-xl p-6 lg:col-span-2 shadow-sm">
            <h2 className="text-[#1E1B4B] font-semibold mb-4">Quick actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { href: "/dashboard/leads", icon: Users, title: "Generate leads", sub: "Find LinkedIn prospects" },
                { href: "/dashboard/stack", icon: Layers, title: "View stack", sub: "Your GTM toolkit" },
                { href: "/dashboard/settings", icon: Target, title: "Update ICP", sub: "Refine your targeting" },
              ].map(({ href, icon: Icon, title, sub }) => (
                <button
                  key={href}
                  onClick={() => setLocation(href)}
                  className="flex items-center gap-3 p-4 border border-[rgba(107,78,255,0.15)] rounded-lg hover:bg-[#F5F3FF] hover:border-[#6B4EFF] transition-colors text-left"
                >
                  <div className="w-8 h-8 bg-[#F5F3FF] rounded-lg flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-[#6B4EFF]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#1E1B4B]">{title}</p>
                    <p className="text-xs text-[#6B7280]">{sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}