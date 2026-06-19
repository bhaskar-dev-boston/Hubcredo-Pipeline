// ============================================================
// replyio.ts  –  Reply.io API Routes
// Place at: artifacts/api-server/src/routes/replyio.ts
// ============================================================

import { Router, Request, Response } from "express";
import { logger } from "../lib/logger";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { supabase } from "../lib/supabase";

const router = Router();

const REPLY_BASE = "https://api.reply.io/v3";

async function replyFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
  const apiKey = process.env.REPLY_IO_API_KEY;
  if (!apiKey) throw new Error("REPLY_IO_API_KEY is not set");

  const res = await fetch(`${REPLY_BASE}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
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

async function getEmailAccount(): Promise<{ id: number; email: string } | null> {
  try {
    const data = await replyFetch<any>("GET", "/email-accounts?my=true&top=100");
    const accounts: Array<{ id: number; email: string; connectionStatus: string }> = data.items ?? [];
    if (accounts.length === 0) return null;
    const preferred = process.env.REPLY_IO_DEFAULT_EMAIL ?? "sg6640770@gmail.com";
    return (
      accounts.find((a) => a.email === preferred) ??
      accounts.find((a) => a.connectionStatus === "connected") ??
      accounts[0]
    );
  } catch {
    return null;
  }
}

async function assignEmailAccountToSequence(sequenceId: number | string, emailAccountId: number): Promise<void> {
  await replyFetch<unknown>("POST", `/sequences/${sequenceId}/email-account-links`, { emailAccountId });
}

// GET /api/replyio/validate
router.get("/replyio/validate", async (_req: Request, res: Response) => {
  const apiKey = process.env.REPLY_IO_API_KEY;
  if (!apiKey) { res.json({ valid: false, error: "REPLY_IO_API_KEY not set" }); return; }
  try {
    const user = await replyFetch<{ email: string; firstName?: string; lastName?: string }>("GET", "/whoami");
    res.json({
      valid: true,
      user: {
        email: user.email,
        name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Reply.io User",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Reply.io validate error: ${msg}`);
    res.json({ valid: false, error: msg });
  }
});

// GET /api/replyio/email-accounts/status
router.get("/replyio/email-accounts/status", async (_req: Request, res: Response) => {
  const account = await getEmailAccount();
  res.json({ connected: !!account, account: account ?? null });
});

// GET /api/replyio/sequences
router.get("/replyio/sequences", async (_req: Request, res: Response) => {
  try {
    const data = await replyFetch<any>("GET", "/sequences");
    const sequences = Array.isArray(data) ? data : data.items ?? [];
    res.json({ sequences });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/replyio/sequences/:id/contacts
router.get("/replyio/sequences/:id/contacts", async (req: Request, res: Response) => {
  try {
    const data = await replyFetch<any>("GET", `/sequences/${req.params.id}/contacts/extended`);
    const contacts = Array.isArray(data) ? data : data.items ?? [];
    res.json({ contacts });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/replyio/sequences/:id/stats
router.get("/replyio/sequences/:id/stats", async (req: Request, res: Response) => {
  try {
    const data = await replyFetch<unknown>("GET", `/statistics/sequences/${req.params.id}`);
    res.json(data);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/replyio/contacts
router.post("/replyio/contacts", async (req: Request, res: Response) => {
  try {
    const contact = await replyFetch<{ id: number; email: string }>("POST", "/contacts", req.body);
    res.status(201).json({ contact });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/replyio/enroll
router.post("/replyio/enroll", async (req: Request, res: Response) => {
  try {
    const { contact, sequenceId } = req.body as {
      contact: { email: string; [k: string]: unknown };
      sequenceId: number;
    };
    if (!contact?.email) { res.status(400).json({ error: "contact.email is required" }); return; }
    if (!sequenceId) { res.status(400).json({ error: "sequenceId is required" }); return; }

    let contactId: number;
    try {
      const existing = await replyFetch<any>("GET", `/contacts?email=${encodeURIComponent(contact.email)}`);
      const found = existing.items?.[0];
      contactId = found?.id
        ? found.id
        : (await replyFetch<{ id: number }>("POST", "/contacts", contact)).id;
    } catch {
      contactId = (await replyFetch<{ id: number }>("POST", "/contacts", contact)).id;
    }

    await replyFetch("POST", `/sequences/${sequenceId}/contacts`, { contactId });
    res.status(201).json({ contact: { id: contactId, email: contact.email }, enrolled: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Reply.io enroll error: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// POST /api/replyio/sequences/:seqId/contacts/:contactId/pause
router.post("/replyio/sequences/:seqId/contacts/:contactId/pause", async (req: Request, res: Response) => {
  try {
    await replyFetch("POST", `/sequences/${req.params.seqId}/contacts/${req.params.contactId}/pause`);
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/replyio/webhooks
router.get("/replyio/webhooks", async (_req: Request, res: Response) => {
  try {
    const data = await replyFetch<any>("GET", "/webhooks");
    res.json({ webhooks: data.items ?? [] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/replyio/webhooks
router.post("/replyio/webhooks", async (req: Request, res: Response) => {
  try {
    const { event, callbackUrl } = req.body;
    if (!event || !callbackUrl) { res.status(400).json({ error: "event and callbackUrl required" }); return; }
    const webhook = await replyFetch<{ id: number }>("POST", "/webhooks", {
      eventType: event,
      url: callbackUrl,
      scope: "personal",
      enabled: true,
      payloadConfig: { includeEmailUrl: true, includeEmailText: true, includeProspectCustomFields: true },
    });
    res.status(201).json(webhook);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/replyio/webhook-receiver
router.post("/replyio/webhook-receiver", (req: Request, res: Response) => {
  const event = req.body?.eventType ?? req.body?.type ?? "unknown";
  logger.info(`Reply.io webhook received: ${event}`);
  res.status(200).json({ received: true });
});

// POST /api/replyio/sequences — create sequence with steps + auto-assign email account
router.post("/replyio/sequences", requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  const req = _req as AuthenticatedRequest;
  try {
    const { name, steps } = req.body as {
      name: string;
      steps?: Array<{ type?: string; delay_days?: number; subject?: string; body: string }>;
    };
    if (!name) { res.status(400).json({ error: "name is required" }); return; }

    const sequence = await replyFetch<{ id: number; name: string; status: string }>(
      "POST", "/sequences", { name }
    );

    const stepErrors: string[] = [];
    if (steps && Array.isArray(steps) && steps.length > 0) {
      for (const step of steps) {
        const stepType = step.type ?? "email";
        const variant: Record<string, string> = { message: step.body };
        if (stepType === "email" && step.subject) variant.subject = step.subject;
        try {
          await replyFetch("POST", `/sequences/${sequence.id}/steps`, {
            type: stepType,
            delayInMinutes: (step.delay_days ?? 0) * 1440,
            variants: [variant],
          });
        } catch (stepErr: unknown) {
          const msg = stepErr instanceof Error ? stepErr.message : String(stepErr);
          logger.warn(`Failed to add step to sequence ${sequence.id}: ${msg}`);
          stepErrors.push(msg);
        }
      }
    }

    const emailAccount = await getEmailAccount();
    if (emailAccount) {
      try {
        await assignEmailAccountToSequence(sequence.id, emailAccount.id);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn(`Could not assign email account to new sequence: ${msg}`);
      }
    }

    res.status(201).json({ ...sequence, stepErrors, emailAccountConnected: !!emailAccount });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Reply.io create sequence error: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// POST /api/replyio/sequences/:id/activate
router.post("/replyio/sequences/:id/activate", async (req: Request, res: Response) => {
  try {
    const seqId = String(req.params.id); 

    const emailAccount = await getEmailAccount();
    if (!emailAccount) {
      res.status(402).json({
        error: "No email account connected to Reply.io.",
        needsGmailConnect: true,
        connectUrl: "https://app.reply.io/settings/email-accounts",
      });
      return;
    }

    await assignEmailAccountToSequence(seqId, emailAccount.id);

    // Check contacts exist before starting
    const contactsData = await replyFetch<any>("GET", `/sequences/${seqId}/contacts?top=1`);
    const contactCount = contactsData?.items?.length ?? 0;

    if (contactCount === 0) {
      res.status(400).json({
        error: "Add contacts to this sequence before launching. Use 'Enroll list' to add leads first.",
        code: "noContacts",
      });
      return;
    }

    await replyFetch("POST", `/sequences/${seqId}/start`);
    res.json({ success: true, emailAccount: emailAccount.email });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("noContacts")) {
      res.status(400).json({
        error: "Add contacts to this sequence before launching.",
        code: "noContacts",
      });
      return;
    }
    logger.error(`Reply.io activate error: ${msg}`);
    res.status(400).json({ error: msg });
  }
});

// POST /api/replyio/sequences/:id/pause-seq
router.post("/replyio/sequences/:id/pause-seq", async (req: Request, res: Response) => {
  try {
    await replyFetch("POST", `/sequences/${req.params.id}/pause`);
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/replyio/sequences/:id/enroll-list
// Uses correct leads schema:
//   review_status (not status), job_title (not title), company_name (not company)
router.post("/replyio/sequences/:id/enroll-list", requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  const req = _req as AuthenticatedRequest;
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
      added: number;
      updated: number;
      skipped: number;
      failed: number;
    }>("POST", "/contacts/import", { items, sequenceIds: [sequenceId] });

    const enrolled = (result.added ?? 0) + (result.updated ?? 0);
    const errors = result.items?.filter((i) => i.error).map((i) => i.error as string) ?? [];

    res.json({
      enrolled,
      total: items.length,
      added: result.added,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
      errors,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Reply.io enroll-list error: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

export default router;