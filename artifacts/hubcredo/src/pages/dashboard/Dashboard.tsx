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
    { label: "Total Leads", value: summary?.total_leads ?? "—", icon: Users, href: "/dashboard/leads", color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Approved Leads", value: summary?.approved_leads ?? "—", icon: TrendingUp, href: "/dashboard/leads", color: "text-green-600", bg: "bg-green-50" },
    { label: "Lead Lists", value: summary?.lead_lists_count ?? "—", icon: Target, href: "/dashboard/leads", color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Stack Tools", value: summary?.stack_tools_count ?? "—", icon: Layers, href: "/dashboard/stack", color: "text-[#2563EB]", bg: "bg-[#EFF6FF]" },
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
      <div className="p-8 max-w-5xl mx-auto">
        <div className="mb-8 pt-2">
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", letterSpacing: "0.04em" }} className="text-[#0A0A0A] mb-1">
            Dashboard
          </h1>
          <p className="text-[#64748B] text-sm">Your sales infrastructure at a glance</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map(({ label, value, icon: Icon, href, color, bg }) => (
            <button
              key={label}
              onClick={() => setLocation(href)}
              className="bg-white border border-[#E2E8F0] rounded-xl p-5 text-left hover:border-[#CBD5E1] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all group shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <ArrowRight className="w-4 h-4 text-[#CBD5E1] group-hover:text-[#94A3B8] transition-colors" />
              </div>
              <p className="text-2xl font-bold text-[#0A0A0A] mb-1">
                {summaryLoading ? <Loader2 className="w-5 h-5 animate-spin inline text-[#64748B]" /> : value}
              </p>
              <p className="text-xs text-[#64748B]">{label}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Analysis card */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[#0A0A0A] font-semibold">Company Analysis</h2>
              <span className={`text-xs px-2 py-1 rounded-full border font-medium ${
                analysis?.processing_status === "completed"
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-[#EFF6FF] border-[#BFDBFE] text-[#2563EB]"
              }`}>
                {analysis ? analysis.processing_status : "None"}
              </span>
            </div>
            {analysis ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-[#0A0A0A]">{analysis.company_name}</p>
                <p className="text-xs text-[#64748B]">{analysis.website_url}</p>
                {analysis.product_summary && (
                  <p className="text-xs text-[#64748B] mt-2 line-clamp-2">{analysis.product_summary}</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-[#64748B]">No analysis yet. Go through onboarding to analyse your website.</p>
                <button onClick={() => setLocation("/onboarding")} className="text-sm text-[#2563EB] hover:text-[#1D4ED8] transition-colors flex items-center gap-1">
                  Start analysis <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Stack card */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[#0A0A0A] font-semibold">Sales Stack</h2>
              <span className={`text-xs px-2 py-1 rounded-full border font-medium ${
                stack ? "bg-green-50 border-green-200 text-green-700" : "bg-[#F5F7FA] border-[#E2E8F0] text-[#64748B]"
              }`}>
                {stack ? "Built" : "Not built"}
              </span>
            </div>
            {stack ? (
              <div className="space-y-2">
                {stack.tools.slice(0, 3).map((tool) => (
                  <div key={tool.slug} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
                    <span className="text-sm text-[#0A0A0A]">{tool.tool_name}</span>
                    <span className="text-xs text-[#64748B]">· {tool.category}</span>
                  </div>
                ))}
                {stack.tools.length > 3 && <p className="text-xs text-[#64748B]">+{stack.tools.length - 3} more tools</p>}
                <button onClick={() => setLocation("/dashboard/stack")} className="text-sm text-[#2563EB] hover:text-[#1D4ED8] transition-colors flex items-center gap-1 mt-2">
                  View full stack <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-[#64748B]">Build your personalised GTM stack based on your ICP and stage.</p>
                <button
                  onClick={handleBuildStack}
                  disabled={createStack.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
                >
                  {createStack.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Build my stack
                </button>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 lg:col-span-2 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <h2 className="text-[#0A0A0A] font-semibold mb-4">Quick actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { href: "/dashboard/leads", icon: Users, title: "Generate leads", sub: "Find LinkedIn prospects" },
                { href: "/dashboard/stack", icon: Layers, title: "View stack", sub: "Your GTM toolkit" },
                { href: "/dashboard/settings", icon: Target, title: "Update ICP", sub: "Refine your targeting" },
              ].map(({ href, icon: Icon, title, sub }) => (
                <button
                  key={href}
                  onClick={() => setLocation(href)}
                  className="flex items-center gap-3 p-4 border border-[#E2E8F0] rounded-lg hover:bg-[#F5F7FA] hover:border-[#CBD5E1] transition-colors text-left"
                >
                  <div className="w-8 h-8 bg-[#EFF6FF] rounded-lg flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-[#2563EB]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#0A0A0A]">{title}</p>
                    <p className="text-xs text-[#64748B]">{sub}</p>
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
