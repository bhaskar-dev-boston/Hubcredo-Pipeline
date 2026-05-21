import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { computeStackRecommendations } from "../lib/stackLogic";
import {
  ListStacksResponse,
  CreateStackBody,
  GetCurrentStackResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/stacks", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data, error } = await supabase
    .from("stack_recommendations")
    .select("*")
    .eq("user_id", req.userId!)
    .order("created_at", { ascending: false });

  if (error) {
    req.log.error({ error }, "Failed to list stacks");
    res.status(500).json({ error: "Failed to fetch stacks" });
    return;
  }

  res.json(ListStacksResponse.parse(data || []));
});

router.post("/stacks", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = CreateStackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Fetch ICP — required for AI recommendations
  const { data: icp, error: icpError } = await supabase
    .from("icps")
    .select("*")
    .eq("id", parsed.data.icp_id)
    .single();

  if (icpError || !icp) {
    res.status(400).json({ error: "ICP not found. Please complete your ICP profile in Settings first." });
    return;
  }

  // Validate the ICP has enough content to generate meaningful recommendations
  const hasJobTitles = Array.isArray(icp.job_titles) && icp.job_titles.length > 0;
  const hasIndustries = Array.isArray(icp.industries) && icp.industries.length > 0;
  if (!hasJobTitles && !hasIndustries) {
    res.status(400).json({
      error: "Your ICP has no target job titles or industries. Please fill in your ICP in Settings → ICP tab first.",
    });
    return;
  }

  // Fetch settings if provided (optional)
  let settings = {};
  if (parsed.data.settings_id) {
    const { data: s } = await supabase
      .from("outreach_settings")
      .select("*")
      .eq("id", parsed.data.settings_id)
      .single();
    if (s) settings = s;
  }

  let tools;
  try {
    tools = await computeStackRecommendations(icp, settings);
  } catch (err) {
    req.log.error({ err }, "AI stack generation failed");
    res.status(500).json({ error: "Failed to generate AI stack recommendations. Please try again." });
    return;
  }

  // Mark old as not current
  await supabase
    .from("stack_recommendations")
    .update({ is_current: false })
    .eq("user_id", req.userId!);

  const { data, error } = await supabase
    .from("stack_recommendations")
    .insert({
      user_id: req.userId!,
      icp_id: parsed.data.icp_id,
      settings_id: parsed.data.settings_id ?? null,
      tools,
      is_current: true,
    })
    .select()
    .single();

  if (error || !data) {
    req.log.error({ error }, "Failed to create stack");
    res.status(500).json({ error: "Failed to save stack recommendation" });
    return;
  }

  res.status(201).json(data);
});

router.get("/stacks/current", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data, error } = await supabase
    .from("stack_recommendations")
    .select("*")
    .eq("user_id", req.userId!)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "No stack recommendation found" });
    return;
  }

  res.json(GetCurrentStackResponse.parse(data));
});

export default router;
