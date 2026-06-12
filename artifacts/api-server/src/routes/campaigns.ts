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
/*                         SYNC ANALYTICS FROM INSTANTLY                      */
/* -------------------------------------------------------------------------- */

router.post(
  "/campaigns/:id/sync",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
      if (!INSTANTLY_API_KEY) {
        res.status(500).json({ error: "INSTANTLY_API_KEY not set" });
        return;
      }

      // Get campaign from our DB
      const { data: campaign } = await supabase
        .from("email_campaigns")
        .select("external_campaign_id")
        .eq("id", req.params.id)
        .eq("user_id", req.userId!)
        .single();

      if (!campaign?.external_campaign_id) {
        res.status(404).json({ error: "No Instantly campaign linked" });
        return;
      }

      // ✅ FIXED: correct v2 endpoint — campaign ID goes as query param, not path segment
      const analyticsRes = await fetch(
        `https://api.instantly.ai/api/v2/campaigns/analytics?id=${campaign.external_campaign_id}`,
        {
          headers: { Authorization: `Bearer ${INSTANTLY_API_KEY}` },
        }
      );

      if (!analyticsRes.ok) {
        const errText = await analyticsRes.text();
        console.error("Instantly analytics error:", analyticsRes.status, errText);
        res.status(502).json({ error: "Failed to fetch from Instantly", details: errText });
        return;
      }

      // ✅ v2 returns an array — grab first item
      const analyticsRaw: any = await analyticsRes.json();
      console.log("INSTANTLY ANALYTICS:", JSON.stringify(analyticsRaw, null, 2));

      const analyticsData = Array.isArray(analyticsRaw) ? analyticsRaw[0] : analyticsRaw;

      if (!analyticsData) {
        res.status(404).json({ error: "No analytics data returned from Instantly" });
        return;
      }

      // ✅ FIXED: correct v2 field names
      const sent    = analyticsData.emails_sent_count    ?? analyticsData.total_sent    ?? 0;
      const opened  = analyticsData.emails_opened_count  ?? analyticsData.total_opened  ?? 0;
      const replied = analyticsData.emails_replied_count ?? analyticsData.total_replied ?? 0;
      const bounced = analyticsData.emails_bounced_count ?? analyticsData.total_bounced ?? 0;
      const clicked = analyticsData.emails_clicked_count ?? analyticsData.total_clicked ?? 0;

      // Upsert into campaign_analytics
      const { error: upsertErr } = await supabase
        .from("campaign_analytics")
        .upsert(
          {
            campaign_id:   req.params.id,
            sent_count:    sent,
            opened_count:  opened,
            replied_count: replied,
            bounced_count: bounced,
            clicked_count: clicked,
            updated_at:    new Date().toISOString(),
          },
          { onConflict: "campaign_id" }
        );

      if (upsertErr) {
        console.error("Analytics upsert error:", upsertErr);
      }

      res.json({
        success: true,
        analytics: { sent, opened, replied, bounced, clicked },
        raw: analyticsData,
      });
    } catch (err: any) {
      console.error("SYNC ERROR:", err);
      res.status(500).json({ error: "Sync failed", details: err?.message });
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
        .insert({
          user_id:        req.userId!,
          name,
          sending_domain,
          lead_list_id:   lead_list_id || null,
          status:         "draft",
        })
        .select()
        .single();

      if (campaignError || !campaign) {
        console.error(campaignError);
        res.status(500).json({ error: "Failed to create campaign" });
        return;
      }

      if (Array.isArray(sequences) && sequences.length > 0) {
        const sequenceRows = sequences.map((seq: any, index: number) => ({
          campaign_id:  campaign.id,
          user_id:      req.userId!,
          step_number:  seq.step_number || index + 1,
          subject:      seq.subject     || "",
          body:         seq.body        || "",
          delay_days:   seq.delay_days  || 0,
        }));
        const { error: seqErr } = await supabase.from("campaign_sequences").insert(sequenceRows);
        if (seqErr) console.error("SEQ INSERT ERROR:", seqErr);
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
      if (!Array.isArray(sequences)) {
        res.status(400).json({ error: "sequences must be an array" });
        return;
      }

      await supabase.from("campaign_sequences").delete().eq("campaign_id", req.params.id);

      if (sequences.length > 0) {
        const rows = sequences.map((seq: any, index: number) => ({
          campaign_id: req.params.id,
          user_id:     req.userId!,
          step_number: seq.step_number || index + 1,
          subject:     seq.subject     || "",
          body:        seq.body        || "",
          delay_days:  seq.delay_days  || 0,
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

router.post(
  "/campaigns/:id/launch",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
      const SENDING_EMAIL     = process.env.SENDING_EMAIL;

      if (!INSTANTLY_API_KEY) {
        res.status(500).json({ error: "INSTANTLY_API_KEY is not set" });
        return;
      }
      if (!SENDING_EMAIL) {
        res.status(500).json({ error: "SENDING_EMAIL is not set" });
        return;
      }

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

      const steps = sortedSteps.map((seq: any, index: number) => ({
        type:  "email",
        delay: index === 0 ? 0 : (seq.delay_days ?? 0),
        variants: [
          {
            subject: seq.subject || "Quick question",
            body:    seq.body    || "Hi {{firstName}}",
          },
        ],
      }));

      const createPayload: Record<string, any> = {
        name:           campaign.name,
        email_list:     [SENDING_EMAIL],
        open_tracking:  true,
        link_tracking:  true,
        campaign_schedule: {
          schedules: [
            {
              name:   "Default",
              timing: { from: "00:00", to: "23:59" },
              days:   { "0": true, "1": true, "2": true, "3": true, "4": true, "5": true, "6": true },
              timezone: "Asia/Kolkata",
            },
          ],
        },
      };

      if (steps.length > 0) {
        createPayload.sequences = [{ steps }];
      }

      console.log("INSTANTLY CREATE PAYLOAD:", JSON.stringify(createPayload, null, 2));

      // STEP 1: Create
      const createRes = await fetch("https://api.instantly.ai/api/v2/campaigns", {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${INSTANTLY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createPayload),
      });

      const createText = await createRes.text();
      console.log("INSTANTLY CREATE STATUS:",   createRes.status);
      console.log("INSTANTLY CREATE RESPONSE:", createText);

      if (!createRes.ok) {
        res.status(502).json({
          error:           `Instantly create failed (${createRes.status})`,
          instantly_error: (() => { try { return JSON.parse(createText); } catch { return createText; } })(),
        });
        return;
      }

      const instantlyData       = JSON.parse(createText);
      const instantlyCampaignId = instantlyData.id;

      // STEP 1.5: PATCH email_list fallback
      try {
        const patchRes = await fetch(
          `https://api.instantly.ai/api/v2/campaigns/${instantlyCampaignId}`,
          {
            method:  "PATCH",
            headers: {
              Authorization:  `Bearer ${INSTANTLY_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ email_list: [SENDING_EMAIL] }),
          }
        );
        console.log("INSTANTLY PATCH STATUS:", patchRes.status);
      } catch (patchErr: any) {
        console.warn("Patch non-fatal:", patchErr?.message);
      }

      // STEP 2: Push leads
      if (campaign.lead_list_id) {
        try {
          const { data: leads, error: leadsError } = await supabase
            .from("leads")
            .select("email, first_name, last_name, company_name, job_title")
            .eq("lead_list_id", campaign.lead_list_id)
            .limit(1000);

          if (!leadsError && leads && leads.length > 0) {
            const instantlyLeads = leads
              .filter((l: any) => !!l.email)
              .map((l: any) => ({
                email:        l.email,
                first_name:   l.first_name   || undefined,
                last_name:    l.last_name    || undefined,
                company_name: l.company_name || undefined,
                job_title:    l.job_title    || undefined,
              }));

            if (instantlyLeads.length > 0) {
              const leadsRes = await fetch("https://api.instantly.ai/api/v2/leads/add", {
                method:  "POST",
                headers: {
                  Authorization:  `Bearer ${INSTANTLY_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  campaign_id:          instantlyCampaignId,
                  leads:                instantlyLeads,
                  skip_if_in_campaign:  true,
                }),
              });
              const leadsText = await leadsRes.text();
              console.log("INSTANTLY LEADS STATUS:",   leadsRes.status);
              console.log("INSTANTLY LEADS RESPONSE:", leadsText);
            }
          }
        } catch (leadsErr: any) {
          console.warn("Error pushing leads:", leadsErr?.message);
        }
      }

      // STEP 3: Activate — NO Content-Type, NO body
      const activateRes = await fetch(
        `https://api.instantly.ai/api/v2/campaigns/${instantlyCampaignId}/activate`,
        {
          method:  "POST",
          headers: { Authorization: `Bearer ${INSTANTLY_API_KEY}` },
        }
      );

      const activateText = await activateRes.text();
      console.log("INSTANTLY ACTIVATE STATUS:",   activateRes.status);
      console.log("INSTANTLY ACTIVATE RESPONSE:", activateText);

      if (!activateRes.ok) {
        const activateError = (() => { try { return JSON.parse(activateText); } catch { return activateText; } })();
        await supabase
          .from("email_campaigns")
          .update({
            status:               "error",
            external_campaign_id: instantlyCampaignId,
            updated_at:           new Date().toISOString(),
          })
          .eq("id", req.params.id);

        res.status(502).json({
          error:           `Activation failed (${activateRes.status})`,
          instantly_error: activateError,
        });
        return;
      }

      // STEP 4: Update DB
      await supabase
        .from("email_campaigns")
        .update({
          status:               "active",
          external_campaign_id: instantlyCampaignId,
          updated_at:           new Date().toISOString(),
        })
        .eq("id", req.params.id);

      // STEP 5: Init analytics row
      await supabase.from("campaign_analytics").upsert(
        {
          campaign_id:   req.params.id,
          sent_count:    0,
          opened_count:  0,
          replied_count: 0,
          bounced_count: 0,
          clicked_count: 0,
        },
        { onConflict: "campaign_id" }
      );

      res.json({
        success:   true,
        message:   "Campaign launched and activated successfully",
        instantly: instantlyData,
      });
    } catch (err: any) {
      console.error("LAUNCH ERROR:", err);
      res.status(500).json({ error: "Launch failed", details: err?.message ?? String(err) });
    }
  }
);


/* -------------------------------------------------------------------------- */
/*                        LIST LEADS FROM INSTANTLY                           */
/* -------------------------------------------------------------------------- */

router.get(
  "/campaigns/:id/leads",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
      if (!INSTANTLY_API_KEY) {
        res.status(500).json({ error: "INSTANTLY_API_KEY not set" });
        return;
      }

      // Get the external_campaign_id from our DB
      const { data: campaign } = await supabase
        .from("email_campaigns")
        .select("external_campaign_id")
        .eq("id", req.params.id)
        .eq("user_id", req.userId!)
        .single();

      if (!campaign?.external_campaign_id) {
        res.status(404).json({ error: "No Instantly campaign linked" });
        return;
      }

      const limit = parseInt(req.query.limit as string) || 20;
      const starting_after = req.query.starting_after as string | undefined;

      // Instantly v2: POST /api/v2/leads/list
      const body: Record<string, any> = {
        filter: { campaign_id: campaign.external_campaign_id },
        limit,
      };
      if (starting_after) body.starting_after = starting_after;

      const leadsRes = await fetch("https://api.instantly.ai/api/v2/leads/list", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${INSTANTLY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!leadsRes.ok) {
        const errText = await leadsRes.text();
        res.status(502).json({ error: "Failed to fetch leads from Instantly", details: errText });
        return;
      }

      const data = await leadsRes.json();
      res.json(data); // { items: [...], next_starting_after: "..." }
    } catch (err: any) {
      console.error("LEADS FETCH ERROR:", err);
      res.status(500).json({ error: "Failed to fetch leads", details: err?.message });
    }
  }
);

export default router;