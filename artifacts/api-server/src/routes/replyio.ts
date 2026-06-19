// ============================================================
// replyio.ts  –  Reply.io API Routes
// Place at: artifacts/api-server/src/routes/replyio.ts
//
// app.ts mounts the router at /api, so these paths become:
//   /replyio/validate  →  /api/replyio/validate  ✅
// ============================================================

import { Router, Request, Response } from "express";
import { logger } from "../lib/logger";

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
  return res.json() as Promise<T>;
}

// GET /api/replyio/validate
router.get("/replyio/validate", async (_req: Request, res: Response) => {
  const apiKey = process.env.REPLY_IO_API_KEY;
  if (!apiKey) {
    res.json({ valid: false, error: "REPLY_IO_API_KEY not set" });
    return;
  }
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
    logger.error("Reply.io validate error:", msg);
    res.json({ valid: false, error: msg });
  }
});

// GET /api/replyio/sequences
router.get("/replyio/sequences", async (_req: Request, res: Response) => {
  try {
    const data = await replyFetch<{ items?: unknown[] } | unknown[]>("GET", "/sequences");
    const sequences = Array.isArray(data) ? data : (data as { items?: unknown[] }).items ?? [];
    res.json({ sequences });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/replyio/sequences/:id/contacts
router.get("/replyio/sequences/:id/contacts", async (req: Request, res: Response) => {
  try {
    const data = await replyFetch<{ items?: unknown[] } | unknown[]>("GET", `/sequences/${req.params.id}/contacts/extended`);
    const contacts = Array.isArray(data) ? data : (data as { items?: unknown[] }).items ?? [];
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
    if (!sequenceId)     { res.status(400).json({ error: "sequenceId is required" }); return; }

    // Upsert contact
    let contactId: number;
    try {
      const existing = await replyFetch<{ items?: { id: number }[] }>(
        "GET", `/contacts?email=${encodeURIComponent(contact.email)}`
      );
      const found = existing.items?.[0];
      if (found?.id) {
        contactId = found.id;
      } else {
        const created = await replyFetch<{ id: number }>("POST", "/contacts", contact);
        contactId = created.id;
      }
    } catch {
      const created = await replyFetch<{ id: number }>("POST", "/contacts", contact);
      contactId = created.id;
    }

    // Add to sequence
    await replyFetch("POST", `/sequences/${sequenceId}/contacts`, { contactId });

    res.status(201).json({ contact: { id: contactId, email: contact.email }, enrolled: true });
  } catch (err: unknown) {
    logger.error("Reply.io enroll error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    const data = await replyFetch<{ items?: unknown[] }>("GET", "/webhooks");
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

export default router;