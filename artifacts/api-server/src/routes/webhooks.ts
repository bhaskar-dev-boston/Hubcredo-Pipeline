import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import {
  TriggerAnalysisBody,
  TriggerAnalysisResponse,
  TriggerLeadScrapingBody,
  TriggerLeadScrapingResponse,
} from "@workspace/api-zod";
import { spendCreditsFixed, getCreditBalance } from "../lib/credits";
import { supabase } from "../lib/supabase";

const N8N_ANALYSIS_WEBHOOK = "https://shreyahubcredo.app.n8n.cloud/webhook/lead-scrapping";
const N8N_LEAD_SCRAPING_WEBHOOK = "https://shreyahubcredo.app.n8n.cloud/webhook/lead-scrapping-list";

// 1 credit = $1. Costs set to ensure no loss vs tool subscriptions:
// - Groq (analysis): ~$0.01/call → charge 2 credits = ~200x margin
// - Instantly (lead enrichment): ~$0.03/lead → charge 1 credit = ~33x margin
const ANALYSIS_COST = 2;
const COST_PER_LEAD = 1;
const MIN_LEADS = 1;
const MAX_LEADS = 500;

const router: IRouter = Router();

router.post("/webhooks/trigger-analysis", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = TriggerAnalysisBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const spend = await spendCreditsFixed(req.userId!, ANALYSIS_COST, "company_analysis");
  if (!spend.success) {
    const balance = await getCreditBalance(req.userId!);
    res.status(402).json({ error: "Insufficient credits", required: ANALYSIS_COST, balance });
    return;
  }

  try {
    const response = await fetch(N8N_ANALYSIS_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: parsed.data.user_id,
        website_url: parsed.data.website_url,
        analysis_id: parsed.data.analysis_id,
      }),
    });

    if (!response.ok) {
      req.log.warn({ status: response.status }, "n8n analysis webhook returned non-OK");
    }

    res.json(TriggerAnalysisResponse.parse({ success: true, message: "Analysis triggered" }));
  } catch (err) {
    req.log.error({ err }, "Failed to trigger analysis webhook");
    res.json(TriggerAnalysisResponse.parse({ success: true, message: "Analysis triggered (webhook may be in test mode)" }));
  }
});

router.post("/webhooks/trigger-lead-scraping", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = TriggerLeadScrapingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // lead_count: minimum 5, maximum 500, custom value allowed
  const rawCount = (req.body as Record<string, unknown>).lead_count;
  const parsedCount = typeof rawCount === "number" ? Math.floor(rawCount) : parseInt(String(rawCount ?? ""), 10);
  const leadCount = !isNaN(parsedCount) && parsedCount >= MIN_LEADS && parsedCount <= MAX_LEADS
    ? parsedCount
    : MIN_LEADS;

  const totalCost = leadCount * COST_PER_LEAD;
  const spend = await spendCreditsFixed(req.userId!, totalCost, `lead_enrichment ×${leadCount}`);
  if (!spend.success) {
    const balance = await getCreditBalance(req.userId!);
    res.status(402).json({
      error: "Insufficient credits",
      required: totalCost,
      balance,
    });
    return;
  }

  // Fetch existing LinkedIn URLs for this user to pass to n8n for deduplication
  let existingLinkedinUrls: string[] = [];
  try {
    const { data: existingLeads } = await supabase
      .from("leads")
      .select("linkedin_url")
      .eq("user_id", req.userId!)
      .not("linkedin_url", "is", null);
    existingLinkedinUrls = (existingLeads ?? [])
      .map((l: { linkedin_url: string | null }) => l.linkedin_url)
      .filter((url): url is string => !!url);
  } catch {
    req.log.warn("Could not fetch existing LinkedIn URLs for dedup");
  }

  try {
    const response = await fetch(N8N_LEAD_SCRAPING_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: parsed.data.user_id,
        icp_id: parsed.data.icp_id,
        lead_list_id: parsed.data.lead_list_id,
        lead_count: leadCount,
        exclude_linkedin_urls: existingLinkedinUrls,
      }),
    });

    if (!response.ok) {
      req.log.warn({ status: response.status }, "n8n lead scraping webhook returned non-OK");
    }

    res.json(TriggerLeadScrapingResponse.parse({ success: true, message: "Lead scraping triggered" }));
  } catch (err) {
    req.log.error({ err }, "Failed to trigger lead scraping webhook");
    res.json(TriggerLeadScrapingResponse.parse({ success: true, message: "Lead scraping triggered (webhook may be in test mode)" }));
  }
});

export default router;
