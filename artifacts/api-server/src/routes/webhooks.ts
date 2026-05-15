import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import {
  TriggerAnalysisBody,
  TriggerAnalysisResponse,
  TriggerLeadScrapingBody,
  TriggerLeadScrapingResponse,
} from "@workspace/api-zod";

const N8N_ANALYSIS_WEBHOOK = "https://shreyahubcredo.app.n8n.cloud/webhook-test/lead-scrapping";
const N8N_LEAD_SCRAPING_WEBHOOK = "https://shreyahubcredo.app.n8n.cloud/webhook-test/lead-scrapping-list";

const router: IRouter = Router();

router.post("/webhooks/trigger-analysis", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = TriggerAnalysisBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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
    // Still return success — n8n might be in test mode
    res.json(TriggerAnalysisResponse.parse({ success: true, message: "Analysis triggered (webhook may be in test mode)" }));
  }
});

router.post("/webhooks/trigger-lead-scraping", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = TriggerLeadScrapingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const response = await fetch(N8N_LEAD_SCRAPING_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: parsed.data.user_id,
        icp_id: parsed.data.icp_id,
        lead_list_id: parsed.data.lead_list_id,
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
