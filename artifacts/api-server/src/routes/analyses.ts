import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import {
  ListAnalysesResponse,
  GetCurrentAnalysisResponse,
  GetAnalysisParams,
  GetAnalysisResponse,
  CreateAnalysisBody,
  UpdateAnalysisParams,
  UpdateAnalysisBody,
  UpdateAnalysisResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/analyses", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data, error } = await supabase
    .from("company_analyses")
    .select("*")
    .eq("user_id", req.userId!)
    .order("created_at", { ascending: false });

  if (error) {
    req.log.error({ error }, "Failed to list analyses");
    res.status(500).json({ error: "Failed to fetch analyses" });
    return;
  }

  res.json(ListAnalysesResponse.parse(data || []));
});

router.post("/analyses", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = CreateAnalysisBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Mark old analyses as not current
  await supabase
    .from("company_analyses")
    .update({ is_current: false })
    .eq("user_id", req.userId!);

  const { data, error } = await supabase
    .from("company_analyses")
    .insert({
      user_id: req.userId!,
      website_url: parsed.data.website_url,
      processing_status: "pending",
      is_current: true,
    })
    .select()
    .single();

  if (error || !data) {
    req.log.error({ error }, "Failed to create analysis");
    res.status(500).json({ error: "Failed to create analysis" });
    return;
  }

  res.status(201).json(GetAnalysisResponse.parse(data));
});

router.get("/analyses/current", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data, error } = await supabase
    .from("company_analyses")
    .select("*")
    .eq("user_id", req.userId!)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "No analysis found" });
    return;
  }

  res.json(GetCurrentAnalysisResponse.parse(data));
});

router.get("/analyses/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetAnalysisParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { data, error } = await supabase
    .from("company_analyses")
    .select("*")
    .eq("id", params.data.id)
    .eq("user_id", req.userId!)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }

  res.json(GetAnalysisResponse.parse(data));
});

router.patch("/analyses/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = UpdateAnalysisParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateAnalysisBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { data, error } = await supabase
    .from("company_analyses")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", params.data.id)
    .eq("user_id", req.userId!)
    .select()
    .single();

  if (error || !data) {
    req.log.error({ error }, "Failed to update analysis");
    res.status(500).json({ error: "Update failed" });
    return;
  }

  res.json(UpdateAnalysisResponse.parse(data));
});

export default router;
