// ============================================================
// replyio.ts  –  Reply.io API Routes (per-user API keys)
// ============================================================

import { Router, Request, Response } from "express";
import { logger } from "../lib/logger";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { supabase } from "../lib/supabase";

const router = Router();
const REPLY_BASE = "https://api.reply.io/v3";

// ── Per-user key lookup (falls back to env var) ──────────────
async function getUserReplyApiKey(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from("user_integrations")
      .select("api_key")
      .eq("user_id", userId)
      .eq("service", "replyio")
      .maybeSingle();
    if (data?.api_key) return data.api_key;
  } catch { /* fall through */ }
  return process.env.REPLY_IO_API_KEY ?? "";
}

async function replyFetch<T>(method: string, path: string, body?: unknown, apiKey?: string): Promise<T> {
  const key = apiKey ?? process.env.REPLY_IO_API_KEY;
  if (!key) throw new Error("No Reply.io API key configured");
  const res = await fetch(`${REPLY_BASE}${path}`, {
    method,
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reply.io ${res.status}: ${text}`);
  }
  if (res.status === 204) return {} as T;
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return {} as T;
  return res.json() as Promise<T>;
}

async function getEmailAccount(apiKey: string): Promise<{ id: number; email: string } | null> {
  try {
    const data = await replyFetch<any>("GET", "/email-accounts?my=true&top=100", undefined, apiKey);
    const accounts: Array<{ id: number; email: string; connectionStatus: string }> = data.items ?? [];
    if (accounts.length === 0) return null;
    const preferred = process.env.REPLY_IO_DEFAULT_EMAIL ?? "";
    return (
      (preferred ? accounts.find((a) => a.email === preferred) : null) ??
      accounts.find((a) => a.connectionStatus === "connected") ??
      accounts[0]
    );
  } catch {
    return null;
  }
}

async function assignEmailAccountToSequence(sequenceId: number | string, emailAccountId: number, apiKey: string): Promise<void> {
  await replyFetch<unknown>("POST", `/sequences/${sequenceId}/email-account-links`, { emailAccountId }, apiKey);
}

// GET /api/replyio/validate
router.get("/replyio/validate", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.json({ valid: false, error: "No Reply.io API key configured" }); return; }
  try {
    const user = await replyFetch<{ email: string; firstName?: string; lastName?: string }>("GET", "/whoami", undefined, apiKey);
    res.json({
      valid: true,
      user: {
        email: user.email,
        name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Reply.io User",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.json({ valid: false, error: msg });
  }
});

// GET /api/replyio/email-accounts/status
router.get("/replyio/email-accounts/status", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  const account = await getEmailAccount(apiKey);
  res.json({ connected: !!account, account: account ?? null });
});

// GET /api/replyio/sequences — list campaigns
router.get("/replyio/sequences", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured. Add it in Settings → Integrations." }); return; }
  try {
    const data = await replyFetch<any>("GET", "/sequences", undefined, apiKey);
    const sequences = Array.isArray(data) ? data : data.items ?? [];
    res.json({ sequences });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/replyio/sequences/:id/steps — step types for channel detection
router.get("/replyio/sequences/:id/steps", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }
  try {
    const data = await replyFetch<any>("GET", `/sequences/${req.params.id}/steps`, undefined, apiKey);
    const steps = Array.isArray(data) ? data : data.items ?? data.steps ?? [];
    res.json({ steps });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/replyio/sequences/:id/contacts
router.get("/replyio/sequences/:id/contacts", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  try {
    const data = await replyFetch<any>("GET", `/sequences/${req.params.id}/contacts/extended`, undefined, apiKey);
    const contacts = Array.isArray(data) ? data : data.items ?? [];
    res.json({ contacts });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/replyio/sequences/:id/stats
router.get("/replyio/sequences/:id/stats", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  try {
    const data = await replyFetch<unknown>("GET", `/statistics/sequences/${req.params.id}`, undefined, apiKey);
    res.json(data);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/replyio/contacts
router.post("/replyio/contacts", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  try {
    const contact = await replyFetch<{ id: number; email: string }>("POST", "/contacts", req.body, apiKey);
    res.status(201).json({ contact });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/replyio/enroll
router.post("/replyio/enroll", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  try {
    const { contact, sequenceId } = req.body as {
      contact: { email: string; [k: string]: unknown };
      sequenceId: number;
    };
    if (!contact?.email) { res.status(400).json({ error: "contact.email is required" }); return; }
    if (!sequenceId) { res.status(400).json({ error: "sequenceId is required" }); return; }

    let contactId: number;
    try {
      const existing = await replyFetch<any>("GET", `/contacts?email=${encodeURIComponent(contact.email)}`, undefined, apiKey);
      const found = existing.items?.[0];
      contactId = found?.id
        ? found.id
        : (await replyFetch<{ id: number }>("POST", "/contacts", contact, apiKey)).id;
    } catch {
      contactId = (await replyFetch<{ id: number }>("POST", "/contacts", contact, apiKey)).id;
    }

    await replyFetch("POST", `/sequences/${sequenceId}/contacts`, { contactId }, apiKey);
    res.status(201).json({ contact: { id: contactId, email: contact.email }, enrolled: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Reply.io enroll error: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// POST /api/replyio/sequences/:seqId/contacts/:contactId/pause
router.post("/replyio/sequences/:seqId/contacts/:contactId/pause", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  try {
    await replyFetch("POST", `/sequences/${req.params.seqId}/contacts/${req.params.contactId}/pause`, undefined, apiKey);
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/replyio/webhooks
router.get("/replyio/webhooks", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  try {
    const data = await replyFetch<any>("GET", "/webhooks", undefined, apiKey);
    res.json({ webhooks: data.items ?? [] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/replyio/webhooks
router.post("/replyio/webhooks", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  try {
    const { event, callbackUrl } = req.body;
    if (!event || !callbackUrl) { res.status(400).json({ error: "event and callbackUrl required" }); return; }
    const webhook = await replyFetch<{ id: number }>("POST", "/webhooks", {
      eventType: event, url: callbackUrl, scope: "personal", enabled: true,
      payloadConfig: { includeEmailUrl: true, includeEmailText: true, includeProspectCustomFields: true },
    }, apiKey);
    res.status(201).json(webhook);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/replyio/linkedin-accounts — list connected LinkedIn accounts
// GET /api/replyio/linkedin-accounts — list connected LinkedIn accounts
router.get("/replyio/linkedin-accounts", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }
  try {
    // ✅ v3 endpoint, returns a plain array
    const data = await replyFetch<any[]>("GET", "/linkedin-accounts", undefined, apiKey);
    const accounts = Array.isArray(data) ? data : [];
    res.json({ accounts });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err), accounts: [] });
  }
});
// POST /api/replyio/webhook-receiver  (no auth — n8n calls this)
router.post("/replyio/webhook-receiver", (req: Request, res: Response) => {
  const event = req.body?.eventType ?? req.body?.type ?? "unknown";
  logger.info(`Reply.io webhook received: ${event}`);
  res.status(200).json({ received: true });
});

// POST /api/replyio/sequences — create sequence
router.post("/replyio/sequences", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }
  try {
    const { name, steps } = req.body as {
      name: string;
      steps?: Array<{ type?: string; delay_days?: number; subject?: string; body: string }>;
    };
    if (!name) { res.status(400).json({ error: "name is required" }); return; }

    const sequence = await replyFetch<{ id: number; name: string; status: string }>("POST", "/sequences", { name }, apiKey);

    const stepErrors: string[] = [];
    if (steps && Array.isArray(steps) && steps.length > 0) {
      for (const step of steps) {
        const stepType = step.type ?? "email";
        const variant: Record<string, string> = { message: step.body };
        if (stepType === "email" && step.subject) variant.subject = step.subject;
        try {
          await replyFetch("POST", `/sequences/${sequence.id}/steps`, {
            type: stepType, delayInMinutes: (step.delay_days ?? 0) * 1440, variants: [variant],
          }, apiKey);
        } catch (stepErr: unknown) {
          const msg = stepErr instanceof Error ? stepErr.message : String(stepErr);
          logger.warn(`Failed to add step to sequence ${sequence.id}: ${msg}`);
          stepErrors.push(msg);
        }
      }
    }

    const emailAccount = await getEmailAccount(apiKey);
    if (emailAccount) {
      try { await assignEmailAccountToSequence(sequence.id, emailAccount.id, apiKey); } catch { /* ignore */ }
    }

    res.status(201).json({ ...sequence, stepErrors, emailAccountConnected: !!emailAccount });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Reply.io create sequence error: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// POST /api/replyio/sequences/:id/activate
router.post("/replyio/sequences/:id/activate", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }
  try {
    const seqId = String(req.params.id);
    const emailAccount = await getEmailAccount(apiKey);
    if (!emailAccount) {
      res.status(402).json({ error: "No email account connected to Reply.io.", needsGmailConnect: true, connectUrl: "https://app.reply.io/settings/email-accounts" });
      return;
    }
    await assignEmailAccountToSequence(seqId, emailAccount.id, apiKey);
    const contactsData = await replyFetch<any>("GET", `/sequences/${seqId}/contacts?top=1`, undefined, apiKey);
    if ((contactsData?.items?.length ?? 0) === 0) {
      res.status(400).json({ error: "Add contacts to this sequence before launching.", code: "noContacts" });
      return;
    }
    await replyFetch("POST", `/sequences/${seqId}/start`, undefined, apiKey);
    res.json({ success: true, emailAccount: emailAccount.email });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Reply.io activate error: ${msg}`);
    res.status(400).json({ error: msg });
  }
});

// POST /api/replyio/sequences/:id/pause-seq
router.post("/replyio/sequences/:id/pause-seq", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  try {
    await replyFetch("POST", `/sequences/${req.params.id}/pause`, undefined, apiKey);
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/replyio/sequences/:id/enroll-list
router.post("/replyio/sequences/:id/enroll-list", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }
  try {
    const { lead_list_id } = req.body as { lead_list_id: string };
    if (!lead_list_id) { res.status(400).json({ error: "lead_list_id is required" }); return; }

    const sequenceId = Number(req.params.id);
    const { data: leads, error: dbErr } = await supabase
      .from("leads")
      .select("email, first_name, last_name, company_name, job_title, linkedin_url")
      .eq("lead_list_id", lead_list_id)
      .eq("review_status", "approved")
      .not("email", "is", null);

    if (dbErr) { res.status(500).json({ error: dbErr.message }); return; }
    if (!leads || leads.length === 0) {
      res.json({ enrolled: 0, total: 0, message: "No approved leads with emails in this list" });
      return;
    }

    const items = leads
      .filter((l) => !!l.email)
      .map((l) => ({
        email: l.email as string,
        ...(l.first_name   ? { firstName: l.first_name }     : {}),
        ...(l.last_name    ? { lastName: l.last_name }       : {}),
        ...(l.company_name ? { company: l.company_name }     : {}),
        ...(l.job_title    ? { title: l.job_title }          : {}),
        ...(l.linkedin_url ? { linkedInUrl: l.linkedin_url } : {}),
      }));

    const result = await replyFetch<{
      items: Array<{ id: number; status: string; error: string | null }>;
      added: number; updated: number; skipped: number; failed: number;
    }>("POST", "/contacts/import", { items, sequenceIds: [sequenceId] }, apiKey);

    const enrolled = (result.added ?? 0) + (result.updated ?? 0);
    const errors = result.items?.filter((i) => i.error).map((i) => i.error as string) ?? [];
    res.json({ enrolled, total: items.length, added: result.added, updated: result.updated, skipped: result.skipped, failed: result.failed, errors });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Reply.io enroll-list error: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

export default router;
