import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { spendCreditsFixed, getCreditBalance } from "../lib/credits";
import {
  unipileAvailable,
  createUnipileHostedAuthLink,
  resolveLinkedInProfile,
  sendLinkedInInvitation,
  sendLinkedInMessage,
  getUnipileAccount,
  listChats,
  getChatMessages,
  sendMessage,
} from "../lib/unipile";

const LINKEDIN_SEND_COST = 1;
const router: IRouter = Router();

/* ─────────────────────────────────────────────────────────────────────────── */
/*  HELPERS                                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */

function extractLinkedInSlug(linkedinUrl: string): string | null {
  try {
    const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
    if (match) return match[1].replace(/\/$/, "");
    if (!linkedinUrl.includes("/")) return linkedinUrl.trim();
    return null;
  } catch {
    return null;
  }
}

function personalise(
  template: string,
  lead: { first_name?: string | null; last_name?: string | null }
) {
  return template
    .replace(/\{\{firstName\}\}/gi, lead.first_name || "")
    .replace(/\{\{lastName\}\}/gi, lead.last_name || "")
    .trim();
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  CONNECT LINKEDIN — Unipile Hosted Auth                                     */
/* ─────────────────────────────────────────────────────────────────────────── */

router.get(
  "/linkedin/connect/start",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!unipileAvailable) {
      res.status(501).json({
        error: "Unipile not configured",
        setup: "Add UNIPILE_DSN and UNIPILE_API_KEY environment variables.",
      });
      return;
    }

    const appBase =
      process.env.APP_BASE_URL ||
      `http://localhost:${process.env.FRONTEND_PORT || 5173}`;

    try {
      const { url: hostedUrl } = await createUnipileHostedAuthLink({
        userId: req.userId!,
        successRedirectUrl: `${appBase}/dashboard/linkedin?li_connected=1`,
        failureRedirectUrl: `${appBase}/dashboard/linkedin?li_error=connection_failed`,
        notifyUrl: `${process.env.API_BASE_URL || "http://localhost:3000"}/api/linkedin/connect/webhook`,
      });
      res.json({ url: hostedUrl });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start connection";
      res.status(500).json({ error: msg });
    }
  }
);

router.post("/linkedin/connect/webhook", async (req, res): Promise<void> => {
  const { status, account_id, name: userId } = req.body as {
    status: string;
    account_id: string;
    name: string;
  };

  if (status !== "CREATION_SUCCESS" && status !== "RECONNECTED") {
    res.json({ ok: true });
    return;
  }

  if (!userId || !account_id) {
    res.status(400).json({ error: "Missing userId or account_id" });
    return;
  }

  try {
    let profileName: string | null = null;
    try {
      const acct = await getUnipileAccount(account_id);
      profileName = acct?.name || null;
    } catch { /* non-critical */ }

    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from("linkedin_accounts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const payload = {
      unipile_account_id: account_id,
      status: "connected",
      profile_name: profileName,
      connected_at: now,
      updated_at: now,
    };

    if (existing) {
      await supabase.from("linkedin_accounts").update(payload).eq("user_id", userId);
    } else {
      await supabase.from("linkedin_accounts").insert({
        user_id: userId,
        ...payload,
        daily_limit: 15,
        sends_today: 0,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Unipile webhook error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

router.post("/linkedin/relation/webhook", async (req, res): Promise<void> => {
  const { event, account_id, user_provider_id, user_public_identifier, user_full_name } =
    req.body as {
      event: string;
      account_id: string;
      user_provider_id: string;
      user_public_identifier: string;
      user_full_name: string;
    };

  if (event !== "new_relation") { res.json({ ok: true }); return; }

  try {
    const { data: liAccount } = await supabase
      .from("linkedin_accounts")
      .select("user_id")
      .eq("unipile_account_id", account_id)
      .maybeSingle();

    if (!liAccount) { res.json({ ok: true }); return; }

    const userId = liAccount.user_id;

    const { data: leads } = await supabase
      .from("leads")
      .select("id, sequence_id, followup_message_scheduled_at")
      .eq("user_id", userId)
      .eq("linkedin_status", "request_sent")
      .ilike("linkedin_url", `%${user_public_identifier}%`);

    if (!leads || leads.length === 0) { res.json({ ok: true }); return; }

    const lead = leads[0];

    await supabase
      .from("leads")
      .update({ linkedin_status: "connected", updated_at: new Date().toISOString() })
      .eq("id", lead.id);

    await supabase.from("linkedin_outreach_log").insert({
      user_id: userId,
      lead_id: lead.id,
      action: "connected",
      notes: `${user_full_name} accepted the connection request`,
    });

    if (lead.sequence_id) {
      const { data: seq } = await supabase
        .from("linkedin_sequences")
        .select("followup_message, followup_delay_days")
        .eq("id", lead.sequence_id)
        .single();

      if (seq?.followup_message) {
        const sendAt = new Date(
          Date.now() + (seq.followup_delay_days ?? 2) * 24 * 60 * 60 * 1000
        ).toISOString();

        await supabase.from("linkedin_followup_queue").insert({
          user_id: userId,
          lead_id: lead.id,
          sequence_id: lead.sequence_id,
          unipile_account_id: account_id,
          provider_id: user_provider_id,
          message: seq.followup_message,
          send_at: sendAt,
          status: "pending",
        });
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Relation webhook error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

/* ─────────────────────────────────────────────────────────────────────────── */
/*  ACCOUNT                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

router.get(
  "/linkedin/account",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { data, error } = await supabase
      .from("linkedin_accounts")
      .select(
        "id, status, daily_limit, connected_at, sends_today, sends_reset_at, last_used_at, profile_name, unipile_account_id"
      )
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (error) {
      req.log.error({ error }, "Failed to get linkedin account");
      res.status(500).json({ error: "Failed to fetch LinkedIn account" });
      return;
    }

    if (!data) { res.json(null); return; }

    const today = new Date().toISOString().slice(0, 10);
    const sends_today = data.sends_reset_at === today ? data.sends_today : 0;
    res.json({ ...data, sends_today });
  }
);

router.patch(
  "/linkedin/account",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { daily_limit } = req.body as { daily_limit?: number };
    const limit = Math.min(Math.max(1, Number(daily_limit) || 15), 30);

    const { data, error } = await supabase
      .from("linkedin_accounts")
      .update({ daily_limit: limit, updated_at: new Date().toISOString() })
      .eq("user_id", req.userId!)
      .select("id, status, daily_limit, connected_at, sends_today")
      .single();

    if (error || !data) { res.status(404).json({ error: "No LinkedIn account found" }); return; }
    res.json(data);
  }
);

router.delete(
  "/linkedin/account",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { error } = await supabase
      .from("linkedin_accounts")
      .update({ status: "disconnected", unipile_account_id: null, updated_at: new Date().toISOString() })
      .eq("user_id", req.userId!);

    if (error) { res.status(500).json({ error: "Failed to disconnect" }); return; }
    res.json({ success: true });
  }
);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  SEQUENCES — CRUD                                                           */
/* ─────────────────────────────────────────────────────────────────────────── */

router.get(
  "/linkedin/sequences",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { data, error } = await supabase
      .from("linkedin_sequences")
      .select("*, lead_lists(id, label)")
      .eq("user_id", req.userId!)
      .order("created_at", { ascending: false });

    if (error) { res.status(500).json({ error: "Failed to fetch sequences" }); return; }
    res.json(data || []);
  }
);

router.post(
  "/linkedin/sequences",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { name, connection_message, followup_message, followup_delay_days, lead_list_id, daily_limit } =
      req.body as {
        name?: string;
        connection_message: string;
        followup_message?: string;
        followup_delay_days?: number;
        lead_list_id?: string;
        daily_limit?: number;
      };

    if (!connection_message || connection_message.trim().length < 10) {
      res.status(400).json({ error: "Connection message is required (min 10 characters)" }); return;
    }
    if (connection_message.length > 300) {
      res.status(400).json({ error: "Connection message must be 300 characters or less" }); return;
    }

    const limit = Math.min(Math.max(1, Number(daily_limit) || 15), 30);

    const { data, error } = await supabase
      .from("linkedin_sequences")
      .insert({
        user_id: req.userId!,
        name: (name || "My LinkedIn Sequence").trim(),
        connection_message: connection_message.trim(),
        followup_message: followup_message?.trim() ?? null,
        followup_delay_days: followup_delay_days ?? 2,
        lead_list_id: lead_list_id ?? null,
        daily_limit: limit,
        is_active: false,
      })
      .select("*, lead_lists(id, label)")
      .single();

    if (error) { res.status(500).json({ error: "Failed to create sequence" }); return; }
    res.status(201).json(data);
  }
);

router.put(
  "/linkedin/sequences/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { id } = req.params;
    const { name, connection_message, followup_message, followup_delay_days, lead_list_id, daily_limit } =
      req.body as {
        name?: string;
        connection_message?: string;
        followup_message?: string;
        followup_delay_days?: number;
        lead_list_id?: string | null;
        daily_limit?: number;
      };

    if (connection_message && connection_message.length > 300) {
      res.status(400).json({ error: "Connection message must be 300 characters or less" }); return;
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name.trim();
    if (connection_message !== undefined) updates.connection_message = connection_message.trim();
    if (followup_message !== undefined) updates.followup_message = followup_message?.trim() ?? null;
    if (followup_delay_days !== undefined) updates.followup_delay_days = followup_delay_days;
    if (lead_list_id !== undefined) updates.lead_list_id = lead_list_id;
    if (daily_limit !== undefined) updates.daily_limit = Math.min(Math.max(1, Number(daily_limit)), 30);

    const { data, error } = await supabase
      .from("linkedin_sequences")
      .update(updates)
      .eq("id", id)
      .eq("user_id", req.userId!)
      .select("*, lead_lists(id, label)")
      .single();

    if (error || !data) { res.status(404).json({ error: "Sequence not found" }); return; }
    res.json(data);
  }
);

router.delete(
  "/linkedin/sequences/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { error } = await supabase
      .from("linkedin_sequences")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.userId!);

    if (error) { res.status(500).json({ error: "Failed to delete sequence" }); return; }
    res.json({ success: true });
  }
);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  LAUNCH SEQUENCE                                                            */
/* ─────────────────────────────────────────────────────────────────────────── */

router.post(
  "/linkedin/sequences/:id/launch",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { id } = req.params;

    const { data: seq, error: seqErr } = await supabase
      .from("linkedin_sequences")
      .select("*")
      .eq("id", id)
      .eq("user_id", req.userId!)
      .single();

    if (seqErr || !seq) { res.status(404).json({ error: "Sequence not found" }); return; }
    if (!seq.lead_list_id) { res.status(400).json({ error: "Assign a lead list to this sequence first" }); return; }

    const { data: account, error: accErr } = await supabase
      .from("linkedin_accounts")
      .select("*")
      .eq("user_id", req.userId!)
      .eq("status", "connected")
      .maybeSingle();

    if (accErr || !account) { res.status(400).json({ error: "Connect your LinkedIn account first" }); return; }

    if (!account.unipile_account_id && unipileAvailable) {
      res.status(400).json({ error: "LinkedIn account not linked to Unipile — please reconnect." }); return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const sendsToday = account.sends_reset_at === today ? account.sends_today : 0;
    if (sendsToday >= account.daily_limit) {
      res.status(429).json({ error: `Daily limit reached (${account.daily_limit} sends). Resets tomorrow.` }); return;
    }

    const remaining = account.daily_limit - sendsToday;

    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select("id, first_name, last_name, linkedin_url, linkedin_status")
      .eq("lead_list_id", seq.lead_list_id)
      .eq("user_id", req.userId!)
      .eq("linkedin_status", "not_contacted")
      .not("linkedin_url", "is", null)
      .limit(remaining);

    if (leadsErr) { res.status(500).json({ error: "Failed to fetch leads" }); return; }
    if (!leads || leads.length === 0) {
      res.status(400).json({ error: "No eligible leads found (all contacted or no LinkedIn URLs)" }); return;
    }

    const totalCreditCost = leads.length * LINKEDIN_SEND_COST;
    const creditSpend = await spendCreditsFixed(req.userId!, totalCreditCost, `linkedin_sequence ×${leads.length}`);
    if (!creditSpend.success) {
      const balance = await getCreditBalance(req.userId!);
      res.status(402).json({
        error: "Insufficient credits",
        required: totalCreditCost,
        balance,
        message: `This sequence will send ${leads.length} invitations (${totalCreditCost} credits). You have ${balance} credits.`,
      });
      return;
    }

    const results = { sent: 0, skipped: 0, errors: 0 };
    const sentLeadIds: string[] = [];

    for (const lead of leads) {
      const slug = extractLinkedInSlug(lead.linkedin_url);
      if (!slug) { results.skipped++; continue; }

      try {
        if (unipileAvailable && account.unipile_account_id) {
          const profile = await resolveLinkedInProfile({
            accountId: account.unipile_account_id,
            publicIdentifier: slug,
          });
          const message = personalise(seq.connection_message, lead);
          await sendLinkedInInvitation({
            accountId: account.unipile_account_id,
            providerId: profile.provider_id,
            message,
          });
        }
        sentLeadIds.push(lead.id);
        results.sent++;
        await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));
      } catch (err) {
        req.log.warn({ err, leadId: lead.id }, "Failed to invite lead, skipping");
        results.errors++;
      }
    }

    if (sentLeadIds.length === 0) {
      res.status(400).json({ error: "Could not send any invitations. Check LinkedIn URLs.", details: results }); return;
    }

    await supabase
      .from("leads")
      .update({ linkedin_status: "request_sent", updated_at: new Date().toISOString() })
      .in("id", sentLeadIds)
      .eq("user_id", req.userId!);

    await supabase.from("linkedin_outreach_log").insert(
      sentLeadIds.map((leadId) => ({
        user_id: req.userId!,
        lead_id: leadId,
        sequence_id: id,
        action: "connection_request",
        notes: unipileAvailable ? "via Unipile" : "simulated",
      }))
    );

    await supabase
      .from("linkedin_sequences")
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq("id", id);

    const newSendsToday = sendsToday + sentLeadIds.length;
    await supabase
      .from("linkedin_accounts")
      .update({
        sends_today: newSendsToday,
        sends_reset_at: today,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", req.userId!);

    res.json({
      success: true,
      leads_queued: sentLeadIds.length,
      skipped: results.skipped,
      errors: results.errors,
      sends_today: newSendsToday,
      daily_limit: account.daily_limit,
      via_unipile: unipileAvailable,
    });
  }
);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  PAUSE SEQUENCE                                                             */
/* ─────────────────────────────────────────────────────────────────────────── */

router.post(
  "/linkedin/sequences/:id/pause",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { id } = req.params;
    await supabase
      .from("linkedin_sequences")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", req.userId!);
    await supabase
      .from("linkedin_followup_queue")
      .update({ status: "paused" })
      .eq("sequence_id", id)
      .eq("user_id", req.userId!)
      .eq("status", "pending");
    res.json({ success: true });
  }
);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  ANALYTICS — GET                                                            */
/*                                                                             */
/*  Fix: Add no-cache headers so the browser never returns 304.               */
/*  Reads from our own DB (linkedin_outreach_log) — always fresh.             */
/* ─────────────────────────────────────────────────────────────────────────── */

router.get(
  "/linkedin/sequences/:id/analytics",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { id } = req.params;

    // Prevent browser/proxy caching — this is the root cause of 304 responses
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Surrogate-Control": "no-store",
    });

    const [{ data: logs }, { data: followups }, { data: leads }] = await Promise.all([
      supabase
        .from("linkedin_outreach_log")
        .select("action, created_at")
        .eq("sequence_id", id)
        .eq("user_id", req.userId!),
      supabase
        .from("linkedin_followup_queue")
        .select("status")
        .eq("sequence_id", id)
        .eq("user_id", req.userId!),
      // Count leads by status for a more accurate "contacted" number
      supabase
        .from("leads")
        .select("id, linkedin_status")
        .eq("user_id", req.userId!)
        .in("linkedin_status", ["request_sent", "connected", "replied"]),
    ]);

    const actions = logs || [];
    const fups = followups || [];

    const contacted = actions.filter((l) => l.action === "connection_request").length;
    const connected = actions.filter((l) => l.action === "connected").length;
    const replied   = actions.filter((l) => l.action === "replied").length;
    const followups_pending = fups.filter((f) => f.status === "pending").length;
    const followups_sent    = fups.filter((f) => f.status === "sent").length;

    const connected_rate = contacted > 0 ? Math.round((connected / contacted) * 100) : 0;
    const replied_rate   = connected > 0 ? Math.round((replied   / connected) * 100) : 0;

    res.json({
      contacted,
      connected,
      replied,
      follow_ups: followups_pending,
      followups_pending,
      followups_sent,
      connected_rate,
      replied_rate,
      // Legacy field names in case frontend uses them
      total_contacted: contacted,
    });
  }
);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  ANALYTICS REFRESH — "Sync from LinkedIn"                                  */
/*                                                                             */
/*  Improved matching: uses BOTH slug-based and name-based matching.          */
/*  Also saves provider_id on leads when found in chat attendees.             */
/* ─────────────────────────────────────────────────────────────────────────── */

router.post(
  "/linkedin/analytics/:id/refresh",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { id } = req.params;

    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    });

    const [{ data: seq }, { data: account }] = await Promise.all([
      supabase
        .from("linkedin_sequences")
        .select("id, lead_list_id")
        .eq("id", id)
        .eq("user_id", req.userId!)
        .single(),
      supabase
        .from("linkedin_accounts")
        .select("unipile_account_id")
        .eq("user_id", req.userId!)
        .maybeSingle(),
    ]);

    if (!seq) { res.status(404).json({ error: "Sequence not found" }); return; }
    if (!account?.unipile_account_id || !unipileAvailable) {
      res.json({ synced: 0, note: "LinkedIn not connected via Unipile" }); return;
    }

    try {
      // Load all leads that were contacted in this sequence
      const { data: leads } = await supabase
        .from("leads")
        .select("id, first_name, last_name, linkedin_url, linkedin_status")
        .eq("lead_list_id", seq.lead_list_id)
        .eq("user_id", req.userId!)
        .in("linkedin_status", ["request_sent", "connected"]);

      if (!leads || leads.length === 0) {
        res.json({ synced: 0, note: "No contacted leads to check" }); return;
      }

      // Build lookup maps
      // Map 1: slug → lead  (from linkedin_url)
      const slugMap = new Map<string, typeof leads[0]>();
      // Map 2: "firstname lastname" lowercase → lead  (name fallback)
      const nameMap = new Map<string, typeof leads[0]>();

      for (const lead of leads) {
        const slug = extractLinkedInSlug(lead.linkedin_url || "");
        if (slug) slugMap.set(slug.toLowerCase(), lead);

        const fullName = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim().toLowerCase();
        if (fullName) nameMap.set(fullName, lead);
      }

      // Fetch chats from Unipile (enriched with display_name + last message)
      const chatResult = await listChats(account.unipile_account_id, 100);
      const chats = chatResult.items || [];

      let synced = 0;
      const now = new Date().toISOString();

      for (const chat of chats) {
        // Try to match the chat to one of our leads
        let matchedLead: typeof leads[0] | undefined;

        // Strategy 1: match by public_identifier in chat attendees
        // attendee_provider_id is sometimes a slug-like identifier
        const attendeeId = (chat.attendee_provider_id ?? "").toLowerCase();
        if (attendeeId) matchedLead = slugMap.get(attendeeId);

        // Strategy 2: match by display_name vs lead full name
        if (!matchedLead) {
          const chatName = (chat.display_name ?? "").trim().toLowerCase();
          if (chatName) matchedLead = nameMap.get(chatName);
        }

        if (!matchedLead) continue;

        const theyReplied = chat.last_message_sender_is_me === false;

        if (theyReplied && matchedLead.linkedin_status !== "replied") {
          // Update lead status → replied
          await supabase
            .from("leads")
            .update({ linkedin_status: "replied", updated_at: now })
            .eq("id", matchedLead.id)
            .eq("user_id", req.userId!);

          // Avoid duplicate log entries
          const { data: existingLog } = await supabase
            .from("linkedin_outreach_log")
            .select("id")
            .eq("lead_id", matchedLead.id)
            .eq("action", "replied")
            .maybeSingle();

          if (!existingLog) {
            await supabase.from("linkedin_outreach_log").insert({
              user_id: req.userId!,
              lead_id: matchedLead.id,
              sequence_id: id,
              action: "replied",
              notes: "Detected via Unipile chat sync",
            });
          }
          synced++;
        } else if (!theyReplied && matchedLead.linkedin_status === "request_sent") {
          // Chat exists → they accepted → mark connected
          await supabase
            .from("leads")
            .update({ linkedin_status: "connected", updated_at: now })
            .eq("id", matchedLead.id)
            .eq("user_id", req.userId!);

          const { data: existingLog } = await supabase
            .from("linkedin_outreach_log")
            .select("id")
            .eq("lead_id", matchedLead.id)
            .eq("action", "connected")
            .maybeSingle();

          if (!existingLog) {
            await supabase.from("linkedin_outreach_log").insert({
              user_id: req.userId!,
              lead_id: matchedLead.id,
              sequence_id: id,
              action: "connected",
              notes: "Detected via Unipile chat sync",
            });
          }
          synced++;
        }
      }

      // Return fresh analytics from DB after sync
      const { data: logs } = await supabase
        .from("linkedin_outreach_log")
        .select("action")
        .eq("sequence_id", id)
        .eq("user_id", req.userId!);

      const actions = logs || [];
      const contacted      = actions.filter((l) => l.action === "connection_request").length;
      const connected      = actions.filter((l) => l.action === "connected").length;
      const replied        = actions.filter((l) => l.action === "replied").length;
      const connected_rate = contacted > 0 ? Math.round((connected / contacted) * 100) : 0;
      const replied_rate   = connected > 0 ? Math.round((replied   / connected) * 100) : 0;

      res.json({
        synced,
        analytics: {
          contacted,
          connected,
          replied,
          connected_rate,
          replied_rate,
          total_contacted: contacted,
        },
      });
    } catch (err: any) {
      req.log.warn({ err }, "Analytics refresh error");
      res.status(500).json({ error: "Analytics refresh failed", details: err.message });
    }
  }
);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  LINKEDIN INBOX — list chats                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

router.get(
  "/linkedin/inbox",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { data: account } = await supabase
      .from("linkedin_accounts")
      .select("unipile_account_id, status")
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!account?.unipile_account_id || !unipileAvailable) {
      res.json({ chats: [], note: "LinkedIn not connected via Unipile" });
      return;
    }

    try {
      const result = await listChats(account.unipile_account_id, 50);
      res.json({ chats: result.items || [] });
    } catch (err: any) {
      req.log.warn({ err }, "Failed to fetch LinkedIn chats");
      res.json({ chats: [], error: err.message });
    }
  }
);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  CHAT MESSAGES — GET                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */

router.get(
  "/linkedin/inbox/:chatId/messages",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { chatId } = req.params;

    const { data: account } = await supabase
      .from("linkedin_accounts")
      .select("unipile_account_id, status")
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!account?.unipile_account_id || !unipileAvailable) {
      res.status(400).json({ error: "LinkedIn not connected via Unipile" });
      return;
    }

    try {
      const result = await getChatMessages(chatId, 50);
      // Reverse so oldest message is first (chronological order for chat UI)
      const messages = (result.items ?? []).reverse();
      res.json({ messages });
    } catch (err: any) {
      req.log.warn({ err }, "Failed to fetch chat messages");
      res.status(500).json({ error: err.message });
    }
  }
);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  CHAT MESSAGES — POST (send)                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

router.post(
  "/linkedin/inbox/:chatId/messages",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { chatId } = req.params;
    const { text } = req.body as { text: string };

    if (!text || !text.trim()) {
      res.status(400).json({ error: "Message text is required" });
      return;
    }

    const { data: account } = await supabase
      .from("linkedin_accounts")
      .select("unipile_account_id, status")
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!account?.unipile_account_id || !unipileAvailable) {
      res.status(400).json({ error: "LinkedIn not connected via Unipile" });
      return;
    }
    if (account.status !== "connected") {
      res.status(400).json({ error: "LinkedIn account is not connected" });
      return;
    }

    try {
      const result = await sendMessage({ chatId, text: text.trim() });
      res.json({ success: true, message_id: result.id });
    } catch (err: any) {
      req.log.warn({ err }, "Failed to send LinkedIn message");
      res.status(500).json({ error: err.message });
    }
  }
);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  OUTREACH LOG                                                               */
/* ─────────────────────────────────────────────────────────────────────────── */

router.get(
  "/linkedin/outreach-log",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { lead_list_id } = req.query as { lead_list_id?: string };

    let query = supabase
      .from("linkedin_outreach_log")
      .select("*, leads(id, first_name, last_name, company_name, linkedin_status)")
      .eq("user_id", req.userId!)
      .order("created_at", { ascending: false })
      .limit(100);

    if (lead_list_id) query = query.eq("leads.lead_list_id", lead_list_id);

    const { data, error } = await query;
    if (error) { res.status(500).json({ error: "Failed to fetch outreach log" }); return; }
    res.json(data || []);
  }
);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  UPDATE LEAD STATUS                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */

router.patch(
  "/linkedin/leads/:leadId/status",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { leadId } = req.params;
    const { linkedin_status } = req.body as {
      linkedin_status: "not_contacted" | "request_sent" | "connected" | "replied" | "paused";
    };

    const valid = ["not_contacted", "request_sent", "connected", "replied", "paused"];
    if (!valid.includes(linkedin_status)) {
      res.status(400).json({ error: "Invalid linkedin_status value" }); return;
    }

    const { data, error } = await supabase
      .from("leads")
      .update({ linkedin_status, updated_at: new Date().toISOString() })
      .eq("id", leadId)
      .eq("user_id", req.userId!)
      .select("id, linkedin_status")
      .single();

    if (error || !data) { res.status(404).json({ error: "Lead not found" }); return; }

    if (linkedin_status === "replied") {
      await supabase.from("linkedin_outreach_log").insert({
        user_id: req.userId!,
        lead_id: leadId,
        action: "paused",
        notes: "multichannel guard: lead replied",
      });
      await supabase
        .from("linkedin_followup_queue")
        .update({ status: "cancelled" })
        .eq("lead_id", leadId)
        .eq("status", "pending");
    }

    res.json(data);
  }
);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  AI PREFILL                                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */

router.get(
  "/linkedin/ai-prefill",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const [{ data: icps }, { data: settings }] = await Promise.all([
      supabase.from("icps").select("*").eq("user_id", req.userId!).limit(1),
      supabase.from("outreach_settings").select("*").eq("user_id", req.userId!).maybeSingle(),
    ]);

    const icp = icps?.[0];
    const jobTitles = icp?.job_titles?.join(", ") || "decision makers";
    const industries = icp?.industries?.join(", ") || "SaaS";
    const framework = settings?.messaging_framework || "";

    const connection_message = `Hi {{firstName}}, I help ${industries} companies build reliable sales infrastructure. ${
      framework ? `Our approach: ${framework.slice(0, 60)}.` : ""
    } Open to a quick connect?`.slice(0, 300);

    const followup_message = `Hey {{firstName}}, thanks for connecting! I work with ${jobTitles} at ${industries} companies to set up scalable outbound. Happy to share what's been working — worth a 15-min chat?`;

    res.json({ connection_message, followup_message });
  }
);

export default router;