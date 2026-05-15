import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.userId!;

  // Run all queries in parallel
  const [leadsResult, stackResult, leadListsResult, recentLeadsResult] = await Promise.all([
    supabase
      .from("leads")
      .select("review_status")
      .eq("user_id", userId),
    supabase
      .from("stack_recommendations")
      .select("tools")
      .eq("user_id", userId)
      .eq("is_current", true)
      .limit(1)
      .single(),
    supabase
      .from("lead_lists")
      .select("id")
      .eq("user_id", userId),
    supabase
      .from("leads")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const leads = leadsResult.data || [];
  const totalLeads = leads.length;
  const approvedLeads = leads.filter((l) => l.review_status === "approved").length;
  const pendingLeads = leads.filter((l) => l.review_status === "pending").length;
  const rejectedLeads = leads.filter((l) => l.review_status === "rejected").length;

  const stackTools = stackResult.data?.tools;
  const stackToolsCount = Array.isArray(stackTools) ? stackTools.length : 0;
  const leadListsCount = leadListsResult.data?.length ?? 0;
  const recentLeads = recentLeadsResult.data || [];

  const summary = {
    total_leads: totalLeads,
    approved_leads: approvedLeads,
    pending_leads: pendingLeads,
    rejected_leads: rejectedLeads,
    stack_tools_count: stackToolsCount,
    lead_lists_count: leadListsCount,
    recent_leads: recentLeads,
  };

  res.json(GetDashboardSummaryResponse.parse(summary));
});

export default router;
