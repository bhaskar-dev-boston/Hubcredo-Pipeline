import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import {
  GetOutreachSettingsResponse,
  CreateOutreachSettingsBody,
  UpdateOutreachSettingsBody,
  UpdateOutreachSettingsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/settings/outreach", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data, error } = await supabase
    .from("outreach_settings")
    .select("*")
    .eq("user_id", req.userId!)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "No outreach settings found" });
    return;
  }

  res.json(GetOutreachSettingsResponse.parse(data));
});

router.post("/settings/outreach", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = CreateOutreachSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Mark old settings as not current
  await supabase
    .from("outreach_settings")
    .update({ is_current: false })
    .eq("user_id", req.userId!);

  const { data, error } = await supabase
    .from("outreach_settings")
    .insert({
      user_id: req.userId!,
      ...parsed.data,
      is_current: true,
    })
    .select()
    .single();

  if (error || !data) {
    req.log.error({ error }, "Failed to create outreach settings");
    res.status(500).json({ error: "Failed to create settings" });
    return;
  }

  res.status(201).json(data);
});

router.patch("/settings/outreach", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = UpdateOutreachSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Try to find existing current settings
  const { data: existing } = await supabase
    .from("outreach_settings")
    .select("id")
    .eq("user_id", req.userId!)
    .eq("is_current", true)
    .single();

  if (!existing) {
    // No settings yet — create them
    const { data, error } = await supabase
      .from("outreach_settings")
      .insert({
        user_id: req.userId!,
        ...parsed.data,
        is_current: true,
      })
      .select()
      .single();

    if (error || !data) {
      req.log.error({ error }, "Failed to create outreach settings");
      res.status(500).json({ error: "Failed to create settings" });
      return;
    }

    res.status(201).json(UpdateOutreachSettingsResponse.parse(data));
    return;
  }

  const { data, error } = await supabase
    .from("outreach_settings")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", existing.id)
    .select()
    .single();

  if (error || !data) {
    req.log.error({ error }, "Failed to update settings");
    res.status(500).json({ error: "Update failed" });
    return;
  }

  res.json(UpdateOutreachSettingsResponse.parse(data));
});

// ── Per-user integration key management ─────────────────────
router.get("/settings/integrations/:service", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data } = await supabase
    .from("user_integrations")
    .select("service, workspace_id, updated_at")
    .eq("user_id", req.userId!)
    .eq("service", req.params.service)
    .maybeSingle();
  if (!data) { res.json({ connected: false, service: req.params.service }); return; }
  res.json({ connected: true, service: data.service, workspace_id: data.workspace_id ?? null, updated_at: data.updated_at });
});

router.put("/settings/integrations/:service", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { api_key, workspace_id } = req.body as { api_key?: string; workspace_id?: string };
  if (!api_key?.trim()) { res.status(400).json({ error: "api_key is required" }); return; }
  const { error } = await supabase
    .from("user_integrations")
    .upsert(
      { user_id: req.userId!, service: req.params.service, api_key: api_key.trim(), workspace_id: workspace_id?.trim() ?? null, updated_at: new Date().toISOString() },
      { onConflict: "user_id,service" }
    );
  if (error) { req.log.error({ error }, "Failed to save integration"); res.status(500).json({ error: "Failed to save" }); return; }
  res.json({ success: true });
});

router.delete("/settings/integrations/:service", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  await supabase.from("user_integrations").delete().eq("user_id", req.userId!).eq("service", req.params.service);
  res.json({ success: true });
});

export default router;
