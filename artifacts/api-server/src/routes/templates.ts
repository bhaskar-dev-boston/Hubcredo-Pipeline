import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";

const router: IRouter = Router();

/* ── List templates ─────────────────────────────────────────── */
router.get("/campaign-templates", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from("campaign_templates")
      .select("*")
      .eq("user_id", req.userId!)
      .order("created_at", { ascending: false });
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json(data ?? []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

/* ── Create template ────────────────────────────────────────── */
router.post("/campaign-templates", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const { name, steps } = req.body as { name: string; steps: unknown[] };
    if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
    if (!Array.isArray(steps) || steps.length === 0) { res.status(400).json({ error: "steps must be a non-empty array" }); return; }

    const { data, error } = await supabase
      .from("campaign_templates")
      .insert({ user_id: req.userId!, name: name.trim(), steps })
      .select()
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to create template" });
  }
});

/* ── Update template ────────────────────────────────────────── */
router.patch("/campaign-templates/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, steps } = req.body as { name?: string; steps?: unknown[] };
    const update: Record<string, unknown> = {};
    if (name?.trim()) update.name = name.trim();
    if (Array.isArray(steps) && steps.length > 0) update.steps = steps;
    if (Object.keys(update).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }

    const { data, error } = await supabase
      .from("campaign_templates")
      .update(update)
      .eq("id", id)
      .eq("user_id", req.userId!)
      .select()
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to update template" });
  }
});

/* ── Delete template ────────────────────────────────────────── */
router.delete("/campaign-templates/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from("campaign_templates")
      .delete()
      .eq("id", id)
      .eq("user_id", req.userId!);
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete template" });
  }
});

export default router;