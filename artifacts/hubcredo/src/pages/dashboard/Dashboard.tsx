import { useLocation } from "wouter";
import { ArrowRight, Users, Layers, Target, TrendingUp, Zap, Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  useGetDashboardSummary,
  useGetCurrentAnalysis,
  useGetCurrentStack,
  useListIcps,
  useGetOutreachSettings,
  useCreateStack,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import type { Icp, OutreachSettings } from "@workspace/api-client-react";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: analysis } = useGetCurrentAnalysis();
  const { data: stack } = useGetCurrentStack();
  const { data: icps = [] } = useListIcps();
  const { data: outreachSettings } = useGetOutreachSettings();
  const createStack = useCreateStack();

  const currentIcp = (icps as Icp[])[0];
  const currentOutreach = outreachSettings as OutreachSettings | undefined;

  const stats = [
    {
      label: "Total Leads",
      value: summary?.total_leads ?? "—",
      icon: Users,
      href: "/dashboard/leads",
      color: "text-blue-400",
    },
    {
      label: "Approved Leads",
      value: summary?.approved_leads ?? "—",
      icon: TrendingUp,
      href: "/dashboard/leads",
      color: "text-green-400",
    },
    {
      label: "Lead Lists",
      value: summary?.lead_lists_count ?? "—",
      icon: Target,
      href: "/dashboard/leads",
      color: "text-purple-400",
    },
    {
      label: "Stack Tools",
      value: summary?.stack_tools_count ?? "—",
      icon: Layers,
      href: "/dashboard/stack",
      color: "text-[#F5A623]",
    },
  ];

  async function handleBuildStack() {
    if (!currentIcp || !currentOutreach) {
      toast({
        title: "Setup required",
        description: "Please complete your ICP and outreach settings first.",
        variant: "destructive",
      });
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
      <div className="p-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <h1
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", letterSpacing: "0.04em" }}
            className="text-white mb-1"
          >
            Dashboard
          </h1>
          <p className="text-[#888888] text-sm">Your sales infrastructure at a glance</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map(({ label, value, icon: Icon, href, color }) => (
            <button
              key={label}
              onClick={() => setLocation(href)}
              className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-xl p-5 text-left hover:border-[#444] transition-colors group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-8 h-8 bg-[#2A2A2A] rounded-lg flex items-center justify-center">
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <ArrowRight className="w-4 h-4 text-[#444] group-hover:text-[#888] transition-colors" />
              </div>
              <p className="text-2xl font-bold text-white mb-1">
                {summaryLoading ? <Loader2 className="w-5 h-5 animate-spin inline" /> : value}
              </p>
              <p className="text-xs text-[#888888]">{label}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Analysis card */}
          <div className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Company Analysis</h2>
              <span className={`text-xs px-2 py-1 rounded-full border font-medium ${
                analysis?.processing_status === "completed"
                  ? "bg-green-500/10 border-green-500/20 text-green-400"
                  : "bg-[#F5A623]/10 border-[#F5A623]/20 text-[#F5A623]"
              }`}>
                {analysis ? analysis.processing_status : "None"}
              </span>
            </div>
            {analysis ? (
              <div className="space-y-2">
                <p className="text-sm text-white font-medium">{analysis.company_name}</p>
                <p className="text-xs text-[#888888]">{analysis.website_url}</p>
                {analysis.product_summary && (
                  <p className="text-xs text-[#888888] mt-2 line-clamp-2">{analysis.product_summary}</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-[#888888]">No analysis yet. Go through onboarding to analyse your website.</p>
                <button
                  onClick={() => setLocation("/onboarding")}
                  className="text-sm text-[#F5A623] hover:text-[#E09612] transition-colors flex items-center gap-1"
                >
                  Start analysis <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Stack card */}
          <div className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Sales Stack</h2>
              <span className={`text-xs px-2 py-1 rounded-full border font-medium ${
                stack ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-[#2A2A2A] border-[#444] text-[#888888]"
              }`}>
                {stack ? "Built" : "Not built"}
              </span>
            </div>
            {stack ? (
              <div className="space-y-2">
                {stack.tools.slice(0, 3).map((tool) => (
                  <div key={tool.slug} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#F5A623]" />
                    <span className="text-sm text-white">{tool.tool_name}</span>
                    <span className="text-xs text-[#888888]">· {tool.category}</span>
                  </div>
                ))}
                {stack.tools.length > 3 && (
                  <p className="text-xs text-[#888888]">+{stack.tools.length - 3} more tools</p>
                )}
                <button
                  onClick={() => setLocation("/dashboard/stack")}
                  className="text-sm text-[#F5A623] hover:text-[#E09612] transition-colors flex items-center gap-1 mt-2"
                >
                  View full stack <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-[#888888]">Build your personalised GTM stack based on your ICP and stage.</p>
                <button
                  onClick={handleBuildStack}
                  disabled={createStack.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-[#F5A623] text-[#0E0E0E] text-sm font-semibold rounded-lg hover:bg-[#E09612] transition-colors disabled:opacity-50"
                >
                  {createStack.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Build my stack
                </button>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-xl p-6 lg:col-span-2">
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
                  className="flex items-center gap-3 p-4 border border-[#2A2A2A] rounded-lg hover:bg-[#2A2A2A] hover:border-[#444] transition-colors text-left"
                >
                  <div className="w-8 h-8 bg-[#F5A623]/10 rounded-lg flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-[#F5A623]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{title}</p>
                    <p className="text-xs text-[#888888]">{sub}</p>
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
