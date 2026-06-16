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
    { label: "Total Leads", value: summary?.total_leads ?? "—", icon: Users, href: "/dashboard/leads", color: "text-[#818cf8]", bg: "bg-[rgba(99,102,241,.15)]" },
    { label: "Approved Leads", value: summary?.approved_leads ?? "—", icon: TrendingUp, href: "/dashboard/leads", color: "text-[#34d399]", bg: "bg-[rgba(16,185,129,.1)]" },
    { label: "Lead Lists", value: summary?.lead_lists_count ?? "—", icon: Target, href: "/dashboard/leads", color: "text-[#c084fc]", bg: "bg-[rgba(124,58,237,.15)]" },
    { label: "Stack Tools", value: summary?.stack_tools_count ?? "—", icon: Layers, href: "/dashboard/stack", color: "text-[#4f46e5]", bg: "bg-[#eef2ff]" },
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
          <h1 style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: "2rem", letterSpacing: "0.04em" }} className="text-white mb-1">
            Dashboard
          </h1>
          <p className="text-[rgba(255,255,255,.5)] text-sm">Your sales infrastructure at a glance</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map(({ label, value, icon: Icon, href, color, bg }) => (
            <button
              key={label}
              onClick={() => setLocation(href)}
              className="bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] rounded-xl p-5 text-left hover:border-[rgba(255,255,255,.15)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition-all group shadow-none"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <ArrowRight className="w-4 h-4 text-[#CBD5E1] group-hover:text-[rgba(255,255,255,.35)] transition-colors" />
              </div>
              <p className="text-2xl font-bold text-white mb-1">
                {summaryLoading ? <Loader2 className="w-5 h-5 animate-spin inline text-[rgba(255,255,255,.5)]" /> : value}
              </p>
              <p className="text-xs text-[rgba(255,255,255,.5)]">{label}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Analysis card */}
          <div className="bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] rounded-xl p-6 shadow-none">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Company Analysis</h2>
              <span className={`text-xs px-2 py-1 rounded-full border font-medium ${
                analysis?.processing_status === "completed"
                  ? "bg-[rgba(16,185,129,.1)] border-[rgba(52,211,153,.25)] text-[#34d399]"
                  : analysis
                  ? "bg-[#eef2ff] border-[#c7d2fe] text-[#4f46e5]"
                  : "bg-[rgba(255,255,255,.04)] border-[rgba(255,255,255,.08)] text-[rgba(255,255,255,.5)]"
              }`}>
                {analysis ? analysis.processing_status : "None"}
              </span>
            </div>
            {analysis ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-white">{analysis.company_name || "Your company"}</p>
                  <p className="text-xs text-[rgba(255,255,255,.5)] mt-0.5">{analysis.website_url}</p>
                </div>
                {analysis.product_summary && (
                  <p className="text-xs text-[rgba(255,255,255,.5)] line-clamp-2 leading-relaxed">{analysis.product_summary}</p>
                )}
                <button
                  onClick={handleTriggerAnalysis}
                  disabled={triggerAnalysis.isPending}
                  className="flex items-center gap-2 px-3 py-2 bg-[#4f46e5] text-white text-xs font-semibold rounded-lg hover:bg-[#4338ca] transition-colors disabled:opacity-50 mt-1"
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
                <p className="text-sm text-[rgba(255,255,255,.5)]">No analysis yet. Go through onboarding to set your website URL first.</p>
                <button onClick={() => setLocation("/onboarding")} className="text-sm text-[#4f46e5] hover:text-[#4338ca] transition-colors flex items-center gap-1">
                  Start onboarding <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Stack card */}
          <div className="bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] rounded-xl p-6 shadow-none">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Sales Stack</h2>
              <span className={`text-xs px-2 py-1 rounded-full border font-medium ${
                stack ? "bg-[rgba(16,185,129,.1)] border-[rgba(52,211,153,.25)] text-[#34d399]" : "bg-[rgba(255,255,255,.04)] border-[rgba(255,255,255,.08)] text-[rgba(255,255,255,.5)]"
              }`}>
                {stack ? "Built" : "Not built"}
              </span>
            </div>
            {stack ? (
              <div className="space-y-2">
                {stack.tools.slice(0, 3).map((tool) => (
                  <div key={tool.slug} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#4f46e5]" />
                    <span className="text-sm text-white">{tool.tool_name}</span>
                    <span className="text-xs text-[rgba(255,255,255,.5)]">· {tool.category}</span>
                  </div>
                ))}
                {stack.tools.length > 3 && <p className="text-xs text-[rgba(255,255,255,.5)]">+{stack.tools.length - 3} more tools</p>}
                <button onClick={() => setLocation("/dashboard/stack")} className="text-sm text-[#4f46e5] hover:text-[#4338ca] transition-colors flex items-center gap-1 mt-2">
                  View full stack <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-[rgba(255,255,255,.5)]">Build your personalised GTM stack based on your ICP and stage.</p>
                <button
                  onClick={handleBuildStack}
                  disabled={createStack.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-[#4f46e5] text-white text-sm font-semibold rounded-lg hover:bg-[#4338ca] transition-colors disabled:opacity-50"
                >
                  {createStack.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Build my stack
                </button>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] rounded-xl p-6 lg:col-span-2 shadow-none">
            <h2 className="text-white font-semibold mb-4">Quick actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { href: "/dashboard/leads", icon: Users, title: "Generate leads", sub: "Find LinkedIn prospects" },
                { href: "/dashboard/stack", icon: Layers, title: "View stack", sub: "Your GTM toolkit" },
                { href: "/dashboard/settings", icon: Target, title: "Update ICP", sub: "Refine your targeting" },
              ].map(({ href, icon: Icon, title, sub }) => (
                <button
                  key={href}
                  onClick={() => setLocation(href)}
                  className="flex items-center gap-3 p-4 border border-[rgba(255,255,255,.08)] rounded-lg hover:bg-[rgba(255,255,255,.04)] hover:border-[rgba(255,255,255,.15)] transition-colors text-left"
                >
                  <div className="w-8 h-8 bg-[#eef2ff] rounded-lg flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-[#4f46e5]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{title}</p>
                    <p className="text-xs text-[rgba(255,255,255,.5)]">{sub}</p>
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
