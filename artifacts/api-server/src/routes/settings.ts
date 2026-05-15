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

  // Get current settings id
  const { data: existing } = await supabase
    .from("outreach_settings")
    .select("id")
    .eq("user_id", req.userId!)
    .eq("is_current", true)
    .single();

  if (!existing) {
    res.status(404).json({ error: "No settings found" });
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

export default router;
