import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";

const N8N_DOMAIN_FINDER_WEBHOOK = "https://shreyahubcredo.app.n8n.cloud/webhook/lead-domain-finder";

const router: IRouter = Router();

router.get("/domains", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data, error } = await supabase
    .from("domains")
    .select("*")
    .eq("user_id", req.userId!)
    .order("created_at", { ascending: false });

  if (error) {
    req.log.error({ error }, "Failed to fetch domains");
    res.status(500).json({ error: "Failed to fetch domains" });
    return;
  }

  res.json(data || []);
});

router.post("/domains/find", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { keyword, industry, purpose } = req.body as {
    keyword?: unknown;
    industry?: unknown;
    purpose?: unknown;
  };

  if (!keyword || typeof keyword !== "string" || !keyword.trim()) {
    res.status(400).json({ error: "keyword is required" });
    return;
  }

  const payload: Record<string, string> = {
    user_id: req.userId!,
    keyword: keyword.trim(),
    purpose: purpose && typeof purpose === "string" && purpose.trim() ? purpose.trim() : "outreach",
  };

  if (industry && typeof industry === "string" && industry.trim()) {
    payload.industry = industry.trim();
  }

  try {
    const response = await fetch(N8N_DOMAIN_FINDER_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      req.log.warn({ status: response.status }, "n8n domain finder webhook returned non-OK");
      res.status(502).json({ error: "Domain finder service returned an error", domains: [] });
      return;
    }

    let data: unknown;
    const text = await response.text();
    try {
      data = JSON.parse(text);
    } catch {
      req.log.warn({ text }, "n8n domain finder returned non-JSON");
      res.json({ domains: [] });
      return;
    }

    if (Array.isArray(data)) {
      res.json({ domains: data });
    } else if (data && typeof data === "object" && "domains" in data) {
      res.json(data);
    } else if (data && typeof data === "object") {
      const firstArray = Object.values(data as Record<string, unknown>).find(Array.isArray);
      res.json({ domains: firstArray ?? [] });
    } else {
      res.json({ domains: [] });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to call domain finder webhook");
    res.status(502).json({ error: "Could not reach domain finder service", domains: [] });
  }
});


// ── Domain Warmup ─────────────────────────────────────────────────────────────

router.get(
  "/domain-warmup",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from("domain_warmup")
        .select("*")
        .eq("user_id", req.userId!)
        .order("created_at", { ascending: false });

      if (error) {
        res.status(500).json({ error: "Failed to fetch warmup domains" });
        return;
      }
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/domain-warmup",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const { domain } = req.body;

      if (!domain || typeof domain !== "string" || !domain.trim()) {
        res.status(400).json({ error: "domain is required" });
        return;
      }

      // Check if already warming this domain
      const { data: existing } = await supabase
        .from("domain_warmup")
        .select("id")
        .eq("user_id", req.userId!)
        .eq("domain", domain.trim())
        .single();

      if (existing) {
        res.status(409).json({ error: "Domain is already being warmed up" });
        return;
      }

      const { data, error } = await supabase
        .from("domain_warmup")
        .insert({
          user_id: req.userId!,
          domain: domain.trim(),
          status: "warming",
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        res.status(500).json({ error: "Failed to add domain to warmup" });
        return;
      }

      res.json(data);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.delete(
  "/domain-warmup/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const { error } = await supabase
        .from("domain_warmup")
        .delete()
        .eq("id", req.params.id)
        .eq("user_id", req.userId!);

      if (error) {
        res.status(500).json({ error: "Failed to remove warmup domain" });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
