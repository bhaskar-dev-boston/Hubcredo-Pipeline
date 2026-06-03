import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../lib/auth";

const router: IRouter = Router();

/* -------------------------------------------------------------------------- */
/*                                GET CAMPAIGNS                               */
/* -------------------------------------------------------------------------- */

router.get(
  "/campaigns",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select(`*, campaign_analytics(*), campaign_sequences(*)`)
        .eq("user_id", req.userId!)
        .order("created_at", { ascending: false });

      if (error) { res.status(500).json({ error: "Failed to fetch campaigns" }); return; }
      res.json(data || []);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch campaigns" });
    }
  }
);

/* -------------------------------------------------------------------------- */
/*                              GET SINGLE CAMPAIGN                           */
/* -------------------------------------------------------------------------- */

router.get(
  "/campaigns/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select(`*, campaign_analytics(*), campaign_sequences(*)`)
        .eq("id", req.params.id)
        .eq("user_id", req.userId!)
        .single();

      if (error || !data) { res.status(404).json({ error: "Campaign not found" }); return; }
      res.json(data);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch campaign" });
    }
  }
);

/* -------------------------------------------------------------------------- */
/*                               CREATE CAMPAIGN                              */
/* -------------------------------------------------------------------------- */

router.post(
  "/campaigns",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const { name, sending_domain, lead_list_id, sequences = [] } = req.body;

      if (!name || !sending_domain) {
        res.status(400).json({ error: "name and sending_domain are required" });
        return;
      }

      const { data: campaign, error: campaignError } = await supabase
        .from("email_campaigns")
        .insert({ user_id: req.userId!, name, sending_domain, lead_list_id: lead_list_id || null, status: "draft" })
        .select()
        .single();

      if (campaignError || !campaign) {
        console.error(campaignError);
        res.status(500).json({ error: "Failed to create campaign" });
        return;
      }

      if (Array.isArray(sequences) && sequences.length > 0) {
        const sequenceRows = sequences.map((seq: any, index: number) => ({
          campaign_id: campaign.id,
          step_number: seq.step_number || index + 1,
          subject: seq.subject || "",
          body: seq.body || "",
          delay_days: seq.delay_days || 0,
        }));
        const { error: seqErr } = await supabase.from("campaign_sequences").insert(sequenceRows);
        if (seqErr) console.error(seqErr);
      }

      const { data: fullCampaign } = await supabase
        .from("email_campaigns")
        .select(`*, campaign_sequences(*)`)
        .eq("id", campaign.id)
        .single();

      res.json(fullCampaign);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create campaign" });
    }
  }
);

/* -------------------------------------------------------------------------- */
/*                              UPDATE SEQUENCES                              */
/* -------------------------------------------------------------------------- */

router.put(
  "/campaigns/:id/sequences",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const { sequences } = req.body;
      if (!Array.isArray(sequences)) { res.status(400).json({ error: "sequences must be an array" }); return; }

      await supabase.from("campaign_sequences").delete().eq("campaign_id", req.params.id);

      if (sequences.length > 0) {
        const rows = sequences.map((seq: any, index: number) => ({
          campaign_id: req.params.id,
          step_number: seq.step_number || index + 1,
          subject: seq.subject || "",
          body: seq.body || "",
          delay_days: seq.delay_days || 0,
        }));
        await supabase.from("campaign_sequences").insert(rows);
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update sequences" });
    }
  }
);

/* -------------------------------------------------------------------------- */
/*                               DELETE CAMPAIGN                              */
/* -------------------------------------------------------------------------- */

router.delete(
  "/campaigns/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      await supabase.from("campaign_sequences").delete().eq("campaign_id", req.params.id);
      await supabase.from("campaign_analytics").delete().eq("campaign_id", req.params.id);

      const { error } = await supabase
        .from("email_campaigns")
        .delete()
        .eq("id", req.params.id)
        .eq("user_id", req.userId!);

      if (error) { res.status(500).json({ error: "Failed to delete campaign" }); return; }
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete campaign" });
    }
  }
);

/* -------------------------------------------------------------------------- */
/*                              AI COPY GENERATION                            */
/* -------------------------------------------------------------------------- */

router.post(
  "/campaigns/:id/ai-copy",
  requireAuth,
  async (_req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const sequences = [
        {
          step_number: 1,
          subject: "Quick question about your industry outreach",
          body: `Hi {{first_name}},\n\nI came across your profile and noticed you're a founder in your industry.\n\nWe're helping companies improve reply rates and automate personalized outreach.\n\nWould you be open to a quick conversation this week?\n\nBest,\n{{sender_name}}`,
          delay_days: 0,
        },
        {
          step_number: 2,
          subject: "Following up",
          body: `Hi {{first_name}},\n\nJust wanted to follow up on my previous email.\n\nWould love to show you how teams are using AI-powered outreach to increase meetings booked.\n\nInterested?\n\nBest,\n{{sender_name}}`,
          delay_days: 3,
        },
      ];
      res.json({ sequences });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to generate AI copy" });
    }
  }
);

/* -------------------------------------------------------------------------- */
/*                              LAUNCH CAMPAIGN                               */
/* -------------------------------------------------------------------------- */
//
// Flow:
//   1. POST /api/v2/campaigns          → create campaign as Draft in Instantly
//   2. POST /api/v2/leads/add          → push leads from our lead_list into Instantly campaign
//   3. POST /api/v2/campaigns/{id}/activate → activate the campaign

router.post(
  "/campaigns/:id/launch",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
      if (!INSTANTLY_API_KEY) {
        res.status(500).json({ error: "INSTANTLY_API_KEY is not set in environment variables" });
        return;
      }

      // ── 1. Fetch our campaign + sequences ─────────────────────────────────
      const { data: campaign, error: fetchError } = await supabase
        .from("email_campaigns")
        .select(`*, campaign_sequences(*)`)
        .eq("id", req.params.id)
        .single();

      if (fetchError || !campaign) {
        res.status(404).json({ error: "Campaign not found" });
        return;
      }

      const sortedSteps = ((campaign.campaign_sequences as any[]) || []).sort(
        (a, b) => a.step_number - b.step_number
      );

      // ── 2. Build Instantly create-campaign payload ─────────────────────────
      const steps = sortedSteps.map((seq: any, index: number) => ({
        type: "email",
        delay: index === 0 ? 0 : (seq.delay_days ?? 0),
        variants: [
          {
            subject: seq.subject || "Quick question",
            body: seq.body || "Hi {{firstName}}",
          },
        ],
      }));

      const createPayload: Record<string, any> = {
        name: campaign.name,
        campaign_schedule: {
          schedules: [
            {
              name: "Default",
              timing: { from: "09:00", to: "17:00" },
              days: { "0": false, "1": true, "2": true, "3": true, "4": true, "5": true, "6": false },
              timezone: "America/Chicago",
            },
          ],
        },
      };

      if (steps.length > 0) {
        createPayload.sequences = [{ steps }];
      }

      console.log("INSTANTLY CREATE PAYLOAD:", JSON.stringify(createPayload, null, 2));

      // ── STEP 1: Create the campaign in Instantly ───────────────────────────
      const createRes = await fetch("https://api.instantly.ai/api/v2/campaigns", {
        method: "POST",
        headers: { Authorization: `Bearer ${INSTANTLY_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(createPayload),
      });

      const createText = await createRes.text();
      console.log("INSTANTLY CREATE STATUS:", createRes.status);
      console.log("INSTANTLY CREATE RESPONSE:", createText);

      if (!createRes.ok) {
        res.status(502).json({
          error: `Instantly create failed (${createRes.status})`,
          instantly_error: (() => { try { return JSON.parse(createText); } catch { return createText; } })(),
        });
        return;
      }

      const instantlyData = JSON.parse(createText);
      const instantlyCampaignId = instantlyData.id;

      // ── STEP 2: Push leads from our lead_list into Instantly ───────────────
      if (campaign.lead_list_id) {
        try {
          // Fetch all leads from our Supabase lead list (paginate if needed)
          const { data: leads, error: leadsError } = await supabase
            .from("leads")
            .select("email, first_name, last_name, company_name, job_title, linkedin_url")
            .eq("lead_list_id", campaign.lead_list_id)
            .limit(1000);

          if (leadsError) {
            console.warn("Could not fetch leads:", leadsError.message);
          } else if (leads && leads.length > 0) {
            // Map to Instantly lead shape — email is required
            const instantlyLeads = leads
              .filter((l: any) => !!l.email)
              .map((l: any) => ({
                email: l.email,
                first_name: l.first_name || undefined,
                last_name: l.last_name || undefined,
                company_name: l.company_name || undefined,
                job_title: l.job_title || undefined,
              }));

            if (instantlyLeads.length > 0) {
              const leadsRes = await fetch("https://api.instantly.ai/api/v2/leads/add", {
                method: "POST",
                headers: { Authorization: `Bearer ${INSTANTLY_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  campaign_id: instantlyCampaignId,
                  leads: instantlyLeads,
                  skip_if_in_campaign: true,
                }),
              });

              const leadsText = await leadsRes.text();
              console.log("INSTANTLY LEADS STATUS:", leadsRes.status);
              console.log("INSTANTLY LEADS RESPONSE:", leadsText);

              if (!leadsRes.ok) {
                // Non-fatal — log warning, still activate
                console.warn("Failed to add leads to Instantly:", leadsText);
              } else {
                console.log(`Added ${instantlyLeads.length} leads to Instantly campaign`);
              }
            }
          }
        } catch (leadsErr: any) {
          // Non-fatal — log and continue to activation
          console.warn("Error pushing leads:", leadsErr?.message);
        }
      }

      // ── STEP 3: Activate the campaign ─────────────────────────────────────
      const activateRes = await fetch(
        `https://api.instantly.ai/api/v2/campaigns/${instantlyCampaignId}/activate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${INSTANTLY_API_KEY}`, "Content-Type": "application/json" },
        }
      );

      const activateText = await activateRes.text();
      console.log("INSTANTLY ACTIVATE STATUS:", activateRes.status);
      console.log("INSTANTLY ACTIVATE RESPONSE:", activateText);

      if (!activateRes.ok) {
        console.warn("Instantly activation warning:", activateText);
      }

      // ── STEP 4: Update our DB ──────────────────────────────────────────────
      await supabase
        .from("email_campaigns")
        .update({
          status: "active",
          external_campaign_id: instantlyCampaignId || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", req.params.id);

      res.json({
        success: true,
        message: "Campaign launched successfully",
        instantly: instantlyData,
      });
    } catch (err: any) {
      console.error("LAUNCH ERROR:", err);
      res.status(500).json({
        error: "Launch failed — internal server error",
        details: err?.message ?? String(err),
      });
    }
  }
);

export default router;