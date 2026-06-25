// ============================================================
// replyio.ts  –  Reply.io API Routes (per-user API keys)
//
// AUTH: Reply.io v3 uses ONLY "Authorization: Bearer <key>"
//
// ENROLL FLOW (verified from official v3 OpenAPI spec):
//   Step 1: POST /v3/contacts/import  { items, options: { sequenceId } }
//           → returns items[].id for each contact
//   Step 2: POST /v3/sequences/{id}/contact-links/bulk  { contactIds: [...] }
//           → synchronously enrolls contacts; Reply.io indexes immediately
// ============================================================

import { Router, Request, Response } from "express";
import { logger } from "../lib/logger";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { supabase } from "../lib/supabase";

const router = Router();
const REPLY_BASE = "https://api.reply.io/v3";

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

async function replyFetch<T>(
  method: string,
  path: string,
  body?: unknown,
  apiKey?: string
): Promise<T> {
  const key = apiKey ?? process.env.REPLY_IO_API_KEY;
  if (!key) throw new Error("No Reply.io API key configured");

  const res = await fetch(`${REPLY_BASE}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${key}`,
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

async function assignEmailAccountToSequence(
  sequenceId: number | string,
  emailAccountId: number,
  apiKey: string
): Promise<void> {
  await replyFetch<unknown>(
    "POST",
    `/sequences/${sequenceId}/email-account-links`,
    { emailAccountId },
    apiKey
  );
}


// ── Convert plain text body to Reply.io HTML + fix variables ─
// Reply.io renders "message" as HTML. Plain text = one giant block.
// We need to:
//   1. Convert {{firstName}} → {{ firstName }} (spaces, Reply.io format)
//   2. Convert [First Name] bracket vars → {{ firstName }}
//   3. Wrap each paragraph in <p> tags, preserve line breaks as <br>
function toReplyHtml(text: string): string {
  if (!text) return text;

  // Step 1: fix variables — {{firstName}} → {{ firstName }}
  let result = text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key: string) => {
    const normalized = key.trim().toLowerCase().replace(/\s+/g, "");
    return REPLY_VAR_MAP[normalized] ?? `{{ ${key.trim()} }}`;
  });

  // Step 2: bracket vars [First Name] → {{ firstName }}
  result = result
  .replace(/\[First Name\]/gi,    "{{FirstName}}")
  .replace(/\[Last Name\]/gi,     "{{LastName}}")
  .replace(/\[Full Name\]/gi,     "{{FullName}}")
  .replace(/\[Company\]/gi,       "{{CompanyName}}")
  .replace(/\[Job Title\]/gi,     "{{JobTitle}}")
  .replace(/\[Industry\]/gi,      "{{Industry}}")
  .replace(/\[Country\]/gi,       "{{Country}}")
  .replace(/\[City\]/gi,          "{{City}}");
  // Step 3: convert plain text to HTML paragraphs
  // Split on double newlines (paragraphs), then handle single newlines as <br>
  const paragraphs = result.split(/\n\n+/);
  const html = paragraphs
    .map((para) => {
      const inner = para
        .trim()
        .replace(/\n/g, "<br>");
      return inner ? `<p>${inner}</p>` : "";
    })
    .filter(Boolean)
    .join("\n");

  return html;
}

// Updated REPLY_VAR_MAP (keyed by normalized no-space lowercase):
const REPLY_VAR_MAP: Record<string, string> = {
  "firstname":   "{{FirstName}}",
  "lastname":    "{{LastName}}",
  "fullname":    "{{FullName}}",
  "companyname": "{{CompanyName}}",
  "company":     "{{CompanyName}}",
  "title":       "{{JobTitle}}",
  "jobtitle":    "{{JobTitle}}",
  "email":       "{{Email}}",
  "industry":    "{{Industry}}",
  "country":     "{{Country}}",
  "city":        "{{City}}",
};// ─────────────────────────────────────────────────────────────
// CORE ENROLL HELPER
// Verified from official v3 OpenAPI spec:
//   1. POST /v3/contacts/import with options.sequenceId
//      → upserts contacts, returns items[].id
//   2. POST /v3/sequences/{id}/contact-links/bulk with contactIds[]
//      → synchronously enrolls; indexed immediately for /start
// ─────────────────────────────────────────────────────────────
async function importAndEnrollLeads(
  leads: Array<{
    email: string;
    first_name?: string | null;
    last_name?: string | null;
    company_name?: string | null;
    job_title?: string | null;
    linkedin_url?: string | null;
  }>,
  seqId: string,
  apiKey: string
): Promise<{ enrolled: number; total: number }> {
  const total = leads.length;
  if (total === 0) return { enrolled: 0, total: 0 };

  // Step 1: Import contacts into Reply.io and capture their IDs.
  // options.sequenceId is a single int (not an array) per the v3 spec.
  const importPayload = {
    items: leads.map((l) => ({
      email: l.email,
    ...(l.first_name ? { firstName: l.first_name.split(" ")[0] } : {}),
...(l.last_name
  ? { lastName: l.last_name }
  : l.first_name && l.first_name.includes(" ")
    ? { lastName: l.first_name.split(" ").slice(1).join(" ") }
    : {}),
      ...(l.company_name ? { company: l.company_name }   : {}),
      ...(l.job_title    ? { title: l.job_title }        : {}),
      ...(l.linkedin_url ? { linkedInUrl: l.linkedin_url } : {}),
    })),
    options: {
  overwriteExisting: true,   // ← update firstName if contact already exists
  skipExisting: false,       // ← don't skip, fix the data
  skipWithoutEmails: true,
},
  };

  const importResult = await replyFetch<{
    items: Array<{ id: number | null; status: string; error: string | null }>;
    added: number;
    updated: number;
    skipped: number;
    failed: number;
  }>("POST", "/contacts/import", importPayload, apiKey);

  logger.info(
    `Reply.io /contacts/import: added=${importResult.added} updated=${importResult.updated} ` +
    `skipped=${importResult.skipped} failed=${importResult.failed} for seq ${seqId}`
  );

  // Collect all resolved contact IDs (created, updated, or skipped all return an id)
  const contactIds = importResult.items
    .filter((item) => item.id != null)
    .map((item) => item.id as number);

  if (contactIds.length === 0) {
    logger.warn(`Reply.io importAndEnrollLeads: no contact IDs returned from import for seq ${seqId}`);
    return { enrolled: 0, total };
  }

  // Step 2: Bulk-enroll into sequence using the correct endpoint:
  // POST /v3/sequences/{id}/contact-links/bulk  { contactIds: [...] }
  // This is synchronous — Reply.io indexes these immediately.
  const bulkResult = await replyFetch<{
    added: number[];
    notProcessed: Record<string, { error: number; errorDetails: string | null }>;
  }>("POST", `/sequences/${seqId}/contact-links/bulk`, { contactIds }, apiKey);

  const enrolled = bulkResult.added?.length ?? 0;
  const notProcessed = Object.keys(bulkResult.notProcessed ?? {}).length;

  logger.info(
    `Reply.io /contact-links/bulk: enrolled=${enrolled} notProcessed=${notProcessed} for seq ${seqId}`
  );

  if (notProcessed > 0) {
    logger.warn(
      `Reply.io notProcessed details: ${JSON.stringify(bulkResult.notProcessed)}`
    );
  }

  return { enrolled, total };
}

// ─────────────────────────────────────────────────────────────
//  ROUTES
// ─────────────────────────────────────────────────────────────

router.get("/replyio/validate", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.json({ valid: false, error: "No Reply.io API key configured" }); return; }
  try {
    const user = await replyFetch<{ email: string; firstName?: string; lastName?: string }>(
      "GET", "/whoami", undefined, apiKey
    );
    res.json({
      valid: true,
      user: {
        email: user.email,
        name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Reply.io User",
      },
    });
  } catch (err: unknown) {
    res.json({ valid: false, error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/replyio/email-accounts/status", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  const account = await getEmailAccount(apiKey);
  res.json({ connected: !!account, account: account ?? null });
});

router.get("/replyio/email-accounts", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key" }); return; }
  try {
    const data = await replyFetch<{ items: Array<{ id: number; email: string; connectionStatus: string; alias?: string }> }>(
      "GET", "/email-accounts?my=true&top=100", undefined, apiKey
    );
    res.json({ accounts: data.items ?? [] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

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

router.get("/replyio/sequences/:id/contacts", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  try {
    const data = await replyFetch<any>("GET", `/sequences/${req.params.id}/contacts`, undefined, apiKey);
    const contacts = Array.isArray(data) ? data : data.items ?? [];
    res.json({ contacts });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/replyio/sequences/:id/stats", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  try {
    const data = await replyFetch<any>("GET", `/sequences/${req.params.id}/contacts?top=1000`, undefined, apiKey);
    const contacts: Array<{
      status: { status: string; replied: boolean; delivered: boolean; opened: boolean; clicked: boolean; bounced: boolean };
    }> = Array.isArray(data) ? data : data.items ?? [];

    res.json({
      sequenceId: Number(req.params.id),
      total:   contacts.length,
      active:  contacts.filter((c) => c.status?.status === "Active").length,
      replied: contacts.filter((c) => c.status?.replied).length,
      opened:  contacts.filter((c) => c.status?.opened).length,
      clicked: contacts.filter((c) => c.status?.clicked).length,
      bounced: contacts.filter((c) => c.status?.bounced).length,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/replyio/contacts", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  try {
    const contact = await replyFetch<{ id: number; email: string }>("POST", "/contacts", req.body, apiKey);
    res.status(201).json({ contact });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/replyio/enroll", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  try {
    const { contact, sequenceId } = req.body as {
      contact: { email: string; [k: string]: unknown };
      sequenceId: number;
    };
    if (!contact?.email) { res.status(400).json({ error: "contact.email is required" }); return; }
    if (!sequenceId)     { res.status(400).json({ error: "sequenceId is required" }); return; }

    // Import single contact to get/create their ID
    const importResult = await replyFetch<{
      items: Array<{ id: number | null; status: string; error: string | null }>;
    }>("POST", "/contacts/import", {
      items: [{
  ...contact,
  email: contact.email,
  ...(contact.firstName ? { firstName: (contact.firstName as string).split(" ")[0] } : {}),
}],
      options: { skipExisting: true, skipWithoutEmails: true },
    }, apiKey);

    const contactId = importResult.items?.[0]?.id;
    if (!contactId) throw new Error("Could not create or find contact in Reply.io");

    // Enroll via the correct bulk endpoint
    await replyFetch("POST", `/sequences/${sequenceId}/contact-links/bulk`, { contactIds: [contactId] }, apiKey);
    res.status(201).json({ contact: { id: contactId, email: contact.email }, enrolled: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Reply.io enroll error: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

router.post(
  "/replyio/sequences/:seqId/contacts/:contactId/pause",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const apiKey = await getUserReplyApiKey(req.userId!);
    try {
      await replyFetch("POST", `/sequences/${req.params.seqId}/contacts/${req.params.contactId}/pause`, undefined, apiKey);
      res.json({ success: true });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
);

router.get("/replyio/webhooks", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  try {
    const data = await replyFetch<any>("GET", "/webhooks", undefined, apiKey);
    res.json({ webhooks: data.items ?? [] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/replyio/webhooks", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  try {
    const { event, callbackUrl } = req.body;
    if (!event || !callbackUrl) { res.status(400).json({ error: "event and callbackUrl required" }); return; }
    const webhook = await replyFetch<{ id: number }>("POST", "/webhooks", {
      eventType: event,
      url: callbackUrl,
      scope: "personal",
      enabled: true,
      payloadConfig: { includeEmailUrl: true, includeEmailText: true, includeProspectCustomFields: true },
    }, apiKey);
    res.status(201).json(webhook);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/replyio/linkedin-accounts", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }
  try {
    const data = await replyFetch<any[]>("GET", "/linkedin-accounts", undefined, apiKey);
    res.json({ accounts: Array.isArray(data) ? data : [] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err), accounts: [] });
  }
});

router.post("/replyio/webhook-receiver", (req: Request, res: Response) => {
  const event = req.body?.eventType ?? req.body?.type ?? "unknown";
  logger.info(`Reply.io webhook received: ${event}`);
  res.status(200).json({ received: true });
});

router.post("/replyio/sequences", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }
  try {
    const { name, steps } = req.body as {
      name: string;
      steps?: Array<{ type?: string; delay_days?: number; subject?: string; body: string }>;
    };
    if (!name) { res.status(400).json({ error: "name is required" }); return; }

    const sequence = await replyFetch<{ id: number; name: string; status: string }>(
      "POST", "/sequences", { name }, apiKey
    );

    const stepErrors: string[] = [];
    if (steps?.length) {
      for (const step of steps) {
        const stepType = step.type ?? "email";
        // AFTER
const variant: Record<string, string> = { message: toReplyHtml(step.body) };
if (stepType === "email" && step.subject) {
  // Normalize variables in subject too (e.g. {{firstName}} → {{ firstName }})
  variant.subject = step.subject.replace(
    /\{\{\s*([^}]+?)\s*\}\}/g,
    (_match: string, key: string) => {
      const normalized = key.trim().toLowerCase().replace(/\s+/g, "");
      const REPLY_VAR_MAP: Record<string, string> = {
  "firstname":   "{{FirstName}}",
  "lastname":    "{{LastName}}",
  "fullname":    "{{FullName}}",
  "companyname": "{{CompanyName}}",
  "company":     "{{CompanyName}}",
  "title":       "{{JobTitle}}",
  "jobtitle":    "{{JobTitle}}",
  "email":       "{{Email}}",
  "industry":    "{{Industry}}",
  "country":     "{{Country}}",
  "city":        "{{City}}",
};
      return REPLY_VAR_MAP[normalized] ?? `{{ ${key.trim()} }}`;
    }
  );
}
        try {
          await replyFetch("POST", `/sequences/${sequence.id}/steps`, {
            type: stepType,
            delayInMinutes: (step.delay_days ?? 0) * 1440,
            variants: [variant],
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
// Verified flow from official v3 OpenAPI spec:
//   1. Resolve & assign mailbox
//   2. POST /v3/contacts/import  → get contact IDs
//   3. POST /v3/sequences/{id}/contact-links/bulk  → enroll synchronously
//   4. POST /v3/sequences/{id}/start
router.post("/replyio/sequences/:id/activate", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }

  const seqId = String(req.params.id);
  const { emailAccountId, lead_list_id } = req.body as {
    emailAccountId?: number;
    lead_list_id?: string;
  };

  try {
    // ── Step 1: Resolve mailbox ──────────────────────────────
    let resolvedAccountId: number;
    let resolvedEmail: string;

    if (emailAccountId) {
      const data = await replyFetch<{ items: Array<{ id: number; email: string; connectionStatus: string }> }>(
        "GET", "/email-accounts?my=true&top=100", undefined, apiKey
      );
      const found = (data.items ?? []).find((a) => a.id === emailAccountId);
      if (!found) { res.status(400).json({ error: "Selected email account not found in Reply.io." }); return; }
      resolvedAccountId = found.id;
      resolvedEmail = found.email;
    } else {
      const account = await getEmailAccount(apiKey);
      if (!account) {
        res.status(402).json({
          error: "No connected email account found in Reply.io.",
          needsEmailConnect: true,
          connectUrl: "https://app.reply.io/settings/email-accounts",
        });
        return;
      }
      resolvedAccountId = account.id;
      resolvedEmail = account.email;
    }

    // ── Step 2: Link mailbox to sequence ─────────────────────
    await assignEmailAccountToSequence(seqId, resolvedAccountId, apiKey);

    // ── Step 3: Import + enroll leads ────────────────────────
    let enrollResult: { enrolled: number; total: number } | null = null;

    if (lead_list_id) {
      // No review_status filter — enroll all leads with valid emails
      const { data: leads, error: dbErr } = await supabase
        .from("leads")
        .select("email, first_name, last_name, company_name, job_title, linkedin_url")
        .eq("lead_list_id", lead_list_id)
        .not("email", "is", null);

      if (dbErr) { res.status(500).json({ error: dbErr.message }); return; }

      if (!leads || leads.length === 0) {
        res.status(400).json({ error: "No leads with valid emails found in the selected list." });
        return;
      }

      enrollResult = await importAndEnrollLeads(
        leads.filter((l) => !!l.email) as Array<{
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          company_name?: string | null;
          job_title?: string | null;
          linkedin_url?: string | null;
        }>,
        seqId,
        apiKey
      );

      if (enrollResult.enrolled === 0) {
        res.status(400).json({
          error: "No contacts could be enrolled. Check that leads have valid emails and are not already finished in this sequence.",
        });
        return;
      }
    }

    // ── Step 4: Start sequence ────────────────────────────────
    await replyFetch("POST", `/sequences/${seqId}/start`, undefined, apiKey);

    res.json({
      success: true,
      emailAccount: resolvedEmail,
      emailAccountId: resolvedAccountId,
      ...(enrollResult ? { enrolled: enrollResult.enrolled, total: enrollResult.total } : {}),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Reply.io activate sequence ${seqId} error: ${msg}`);
    res.status(400).json({ error: msg });
  }
});

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
// Same two-step flow: import → bulk contact-links
router.post("/replyio/sequences/:id/enroll-list", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }
  try {
    const { lead_list_id } = req.body as { lead_list_id: string };
    if (!lead_list_id) { res.status(400).json({ error: "lead_list_id is required" }); return; }

    const seqId = String(req.params.id);

    // No review_status filter
    const { data: leads, error: dbErr } = await supabase
      .from("leads")
      .select("email, first_name, last_name, company_name, job_title, linkedin_url")
      .eq("lead_list_id", lead_list_id)
      .not("email", "is", null);

    if (dbErr) { res.status(500).json({ error: dbErr.message }); return; }
    if (!leads || leads.length === 0) {
      res.json({ enrolled: 0, total: 0, message: "No leads with emails found in this list" });
      return;
    }

    const result = await importAndEnrollLeads(
      leads.filter((l) => !!l.email) as Array<{
        email: string;
        first_name?: string | null;
        last_name?: string | null;
        company_name?: string | null;
        job_title?: string | null;
        linkedin_url?: string | null;
      }>,
      seqId,
      apiKey
    );

    res.json({ enrolled: result.enrolled, total: result.total });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Reply.io enroll-list error: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

router.delete("/replyio/sequences/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }
  const seqId = Number(req.params.id);
  if (!seqId || seqId < 1) { res.status(400).json({ error: "Invalid sequence id" }); return; }
  try {
    await replyFetch("DELETE", `/sequences/${seqId}`, undefined, apiKey);
    res.status(204).send();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("400") ? 400 : msg.includes("403") ? 403 : msg.includes("429") ? 429 : 500;
    logger.error(`Reply.io delete sequence ${seqId} error: ${msg}`);
    res.status(status).json({ error: msg });
  }
});

export default router;