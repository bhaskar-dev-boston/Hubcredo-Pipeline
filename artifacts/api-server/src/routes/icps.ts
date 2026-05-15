import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import {
  ListIcpsResponse,
  CreateIcpBody,
  GetCurrentIcpResponse,
  UpdateIcpParams,
  UpdateIcpBody,
  UpdateIcpResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/icps", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data, error } = await supabase
    .from("icps")
    .select("*")
    .eq("user_id", req.userId!)
    .order("created_at", { ascending: false });

  if (error) {
    req.log.error({ error }, "Failed to list ICPs");
    res.status(500).json({ error: "Failed to fetch ICPs" });
    return;
  }

  res.json(ListIcpsResponse.parse(data || []));
});

router.post("/icps", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = CreateIcpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Mark old ICPs as not current
  await supabase
    .from("icps")
    .update({ is_current: false })
    .eq("user_id", req.userId!);

  const { data, error } = await supabase
    .from("icps")
    .insert({
      user_id: req.userId!,
      ...parsed.data,
      is_current: true,
    })
    .select()
    .single();

  if (error || !data) {
    req.log.error({ error }, "Failed to create ICP");
    res.status(500).json({ error: "Failed to create ICP" });
    return;
  }

  res.status(201).json(data);
});

router.get("/icps/current", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data, error } = await supabase
    .from("icps")
    .select("*")
    .eq("user_id", req.userId!)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "No ICP found" });
    return;
  }

  res.json(GetCurrentIcpResponse.parse(data));
});

router.patch("/icps/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = UpdateIcpParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateIcpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { data, error } = await supabase
    .from("icps")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", params.data.id)
    .eq("user_id", req.userId!)
    .select()
    .single();

  if (error || !data) {
    req.log.error({ error }, "Failed to update ICP");
    res.status(500).json({ error: "Update failed" });
    return;
  }

  res.json(UpdateIcpResponse.parse(data));
});

export default router;
