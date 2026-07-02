import { Router, Response } from "express";
import { logger } from "../lib/logger";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { supabase } from "../lib/supabase";

const router = Router();
const REPLY_BASE = "https://api.reply.io/v3";

const LI_HEALTHY_STATUSES = new Set(["enabled"]);


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

// Reply.io's /contacts/import requires a syntactically valid email for every
// item — one bad email fails the WHOLE batch (no per-item tolerance). So we
// must validate here, not just check for presence, before ever calling it.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function isValidEmail(email: string | null | undefined): email is string {
  return !!email && EMAIL_RE.test(email.trim());
}

function toReplyHtml(text: string): string {
  if (!text) return text;
  let result = text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key: string) => {
    const normalized = key.trim().toLowerCase().replace(/\s+/g, "");
    return REPLY_VAR_MAP[normalized] ?? `{{ ${key.trim()} }}`;
  });
  result = result
    .replace(/\[First Name\]/gi,  "{{FirstName}}")
    .replace(/\[Last Name\]/gi,   "{{LastName}}")
    .replace(/\[Full Name\]/gi,   "{{FullName}}")
    .replace(/\[Company\]/gi,     "{{CompanyName}}")
    .replace(/\[Job Title\]/gi,   "{{JobTitle}}")
    .replace(/\[Industry\]/gi,    "{{Industry}}")
    .replace(/\[Country\]/gi,     "{{Country}}")
    .replace(/\[City\]/gi,        "{{City}}");
  const paragraphs = result.split(/\n\n+/);
  return paragraphs
    .map((para) => {
      const inner = para.trim().replace(/\n/g, "<br>");
      return inner ? `<p>${inner}</p>` : "";
    })
    .filter(Boolean)
    .join("\n");
}

async function getUserReplyApiKey(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from("user_integrations")
      .select("api_key")
      .eq("user_id", userId)
      .eq("service", "replyio")
      .maybeSingle();
    if (data?.api_key) return data.api_key;
  } catch {
    /* fall through */
  }
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
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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

interface LinkedInStep {
  type: "linkedIn";
  actionType: "connect" | "message";
  delayInMinutes: number;
  executionMode: "automatic" | "manual";
  variants: Array<{ message: string; isEnabled: boolean }>;
}

function buildConnectStep(message: string, delayInMinutes = 0): LinkedInStep {
  return {
    type: "linkedIn",
    actionType: "connect",
    delayInMinutes,
    executionMode: "automatic",
    variants: [{ message: toReplyHtml(message), isEnabled: true }],
  };
}

function buildMessageStep(message: string, delayInMinutes: number): LinkedInStep {
  return {
    type: "linkedIn",
    actionType: "message",
    delayInMinutes,
    executionMode: "automatic",
    variants: [{ message: toReplyHtml(message), isEnabled: true }],
  };
}

interface ReplySequence {
  id: number;
  name: string;
  status: "new" | "active" | "paused";
  isArchived: boolean;
  health: "healthy" | "stalled" | "degraded" | "blocked";
  linkedInAccounts?: Array<{ id: number; name: string; profileUrl: string | null; status: string }>;
  steps?: Array<{ type: string; [key: string]: unknown }>;
}

interface ReplyLinkedInAccount {
  id: number;
  name: string;
  status: "disabled" | "enabled" | "dailyLimitReached" | "cookieInvalid";
  profileUrl: string | null;
  photoUrl: string | null;
  ownerUserId: number;
  accountType?: "public" | "salesNavigator" | "premium" | null;
}

async function getSequence(seqId: string, apiKey: string): Promise<ReplySequence | null> {
  try {
    return await replyFetch<ReplySequence>("GET", `/sequences/${seqId}`, undefined, apiKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("404") || msg.includes("sequence.notFound") || msg.includes("not found")) {
      return null;
    }
    throw err;
  }
}

async function listLinkedInAccounts(apiKey: string): Promise<ReplyLinkedInAccount[]> {
  try {
    const data = await replyFetch<ReplyLinkedInAccount[]>("GET", "/linkedin-accounts", undefined, apiKey);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    logger.warn(`[LinkedIn] listLinkedInAccounts error: ${err}`);
    return [];
  }
}

async function getLinkedInAccount(apiKey: string): Promise<ReplyLinkedInAccount | null> {
  const accounts = await listLinkedInAccounts(apiKey);
  if (accounts.length === 0) return null;
  const healthy = accounts.find((a) => LI_HEALTHY_STATUSES.has(a.status));
  const chosen = healthy ?? accounts[0];
  logger.info(`[LinkedIn] Found LI account: ${JSON.stringify(chosen)}`);
  return chosen;
}

async function preflightCheck(
  seqId: string,
  apiKey: string
): Promise<{ status: number; error: string; code: string; connectUrl?: string } | null> {
  const seq = await getSequence(seqId, apiKey);

  if (!seq) {
    return {
      status: 404,
      error: `Sequence ${seqId} not found in Reply.io. It may have been deleted.`,
      code: "SEQ_NOT_FOUND",
    };
  }

  if (seq.status === "new") {
    return {
      status: 400,
      error: `Sequence "${seq.name}" has no steps yet (status: new). Open Reply.io, go to this sequence, and add at least one LinkedIn step before enrolling contacts.`,
      code: "NO_STEPS",
    };
  }

  if (!seq.steps || seq.steps.length === 0) {
    return {
      status: 400,
      error: `Sequence "${seq.name}" has no steps. Open Reply.io and add at least one LinkedIn step before enrolling contacts.`,
      code: "NO_STEPS",
    };
  }

  const linkedInAccount = await getLinkedInAccount(apiKey);
  if (!linkedInAccount) {
    return {
      status: 400,
      error: "No LinkedIn account connected in Reply.io. Go to Reply.io → Settings → LinkedIn Accounts and connect your account.",
      code: "NO_LINKEDIN_ACCOUNT",
      connectUrl: "https://app.reply.io/settings/linkedin-accounts",
    };
  }

  if (linkedInAccount.status === "cookieInvalid") {
    return {
      status: 400,
      error: `Your LinkedIn account "${linkedInAccount.name}" needs to be reconnected in Reply.io (session expired).`,
      code: "LINKEDIN_COOKIE_INVALID",
      connectUrl: "https://app.reply.io/settings/linkedin-accounts",
    };
  }

  if (linkedInAccount.status === "dailyLimitReached") {
    return {
      status: 400,
      error: `Your LinkedIn account "${linkedInAccount.name}" has hit its daily limit in Reply.io. Try again tomorrow or raise the limit in Reply.io settings.`,
      code: "LINKEDIN_DAILY_LIMIT_REACHED",
      connectUrl: "https://app.reply.io/settings/linkedin-accounts",
    };
  }

  if (linkedInAccount.status === "disabled") {
    return {
      status: 400,
      error: `Your LinkedIn account "${linkedInAccount.name}" is disabled in Reply.io. Re-enable it under Settings → LinkedIn Accounts.`,
      code: "LINKEDIN_ACCOUNT_DISABLED",
      connectUrl: "https://app.reply.io/settings/linkedin-accounts",
    };
  }

  return null;
}

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

  const importPayload = {
    items: leads.map((l) => ({
      email: l.email,
      ...(l.first_name ? { firstName: l.first_name.split(" ")[0] } : {}),
      ...(l.last_name
        ? { lastName: l.last_name }
        : l.first_name && l.first_name.includes(" ")
          ? { lastName: l.first_name.split(" ").slice(1).join(" ") }
          : {}),
      ...(l.company_name ? { company: l.company_name } : {}),
      ...(l.job_title ? { title: l.job_title } : {}),
      ...(l.linkedin_url ? { linkedInUrl: l.linkedin_url } : {}),
    })),
    options: {
      overwriteExisting: true,
      skipExisting: false,
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
    `[LinkedIn] /contacts/import: added=${importResult.added} updated=${importResult.updated} ` +
      `skipped=${importResult.skipped} failed=${importResult.failed} for seq ${seqId}`
  );

  const contactIds = importResult.items
    .filter((item) => item.id != null)
    .map((item) => item.id as number);

  if (contactIds.length === 0) {
    logger.warn(`[LinkedIn] No contact IDs returned from import for seq ${seqId}`);
    return { enrolled: 0, total };
  }

  const bulkResult = await replyFetch<{
    added: number[];
    notProcessed: Record<string, { error: number; errorDetails: string | null }>;
  }>("POST", `/sequences/${seqId}/contact-links/bulk`, { contactIds }, apiKey);

  const enrolled = bulkResult.added?.length ?? 0;
  const notProcessed = Object.keys(bulkResult.notProcessed ?? {}).length;

  logger.info(`[LinkedIn] /contact-links/bulk: enrolled=${enrolled} notProcessed=${notProcessed} for seq ${seqId}`);

  if (notProcessed > 0) {
    logger.warn(`[LinkedIn] notProcessed: ${JSON.stringify(bulkResult.notProcessed)}`);
  }

  return { enrolled, total };
}

// ─────────────────────────────────────────────────────────────
//  ROUTES
// ─────────────────────────────────────────────────────────────

router.get("/replyio-linkedin/sequences", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }
  try {
    const data = await replyFetch<{ items: ReplySequence[]; hasMore: boolean }>(
      "GET", "/sequences?top=1000", undefined, apiKey
    );
    const sequences = data.items ?? [];

    // Only return sequences that are actually LinkedIn-based. Previously this
    // route returned every non-archived sequence (email included), which
    // inflated LinkedIn counts anywhere this endpoint was consumed (e.g. the
    // Dashboard's "LinkedIn Outreach" card).
    const linkedInOnly = sequences.filter((s) => {
      if (s.isArchived) return false;
      const hasLinkedInAccount = Array.isArray(s.linkedInAccounts) && s.linkedInAccounts.length > 0;
      const nameLooksLinkedIn = /linkedin/i.test(s.name ?? "");
      return hasLinkedInAccount || nameLooksLinkedIn;
    });

    res.json({ sequences: linkedInOnly });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
router.get("/replyio-linkedin/account-status", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }
  try {
    const account = await getLinkedInAccount(apiKey);
    res.json({ connected: !!account, account: account ?? null });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post(
  "/replyio-linkedin/sequences/:id/enroll-list",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const apiKey = await getUserReplyApiKey(req.userId!);
    if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }

    const seqId = String(req.params.id);
    const { lead_list_id } = req.body as { lead_list_id: string };

    if (!lead_list_id) { res.status(400).json({ error: "lead_list_id is required" }); return; }

    try {
      const blocked = await preflightCheck(seqId, apiKey);
      if (blocked) {
        res.status(blocked.status).json({
          error: blocked.error,
          code: blocked.code,
          ...(blocked.connectUrl ? { connectUrl: blocked.connectUrl } : {}),
        });
        return;
      }

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

      // Reply.io's /contacts/import requires a syntactically valid email for
      // every item — checking !!l.email isn't enough, it just checks presence.
      const validLeads = leads.filter((l) => isValidEmail(l.email));
      const skipped = leads.length - validLeads.length;

      if (validLeads.length === 0) {
        res.status(400).json({
          error: "No leads with a valid email found in the selected list. Reply.io requires a valid email to enroll a contact, even for LinkedIn-only sequences.",
          code: "NO_VALID_EMAILS",
          skipped,
        });
        return;
      }

      const result = await importAndEnrollLeads(
        validLeads as Array<{
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

      if (result.enrolled === 0) {
        res.status(400).json({
          error: "No contacts could be enrolled. They may already be active or finished in this sequence.",
          code: "ENROLL_FAILED",
          total: result.total,
        });
        return;
      }

      res.json({ success: true, enrolled: result.enrolled, total: result.total, skippedInvalidEmail: skipped });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[LinkedIn] enroll-list error for seq ${seqId}: ${msg}`);
      res.status(500).json({ error: msg });
    }
  }
);

router.post(
  "/replyio-linkedin/sequences/:id/activate",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const apiKey = await getUserReplyApiKey(req.userId!);
    if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }

    const seqId = String(req.params.id);
    const { lead_list_id } = req.body as { lead_list_id?: string };

    try {
      // ── 1. Verify LinkedIn account is healthy (skip status/steps check
      //        because a freshly-created sequence is always "new" with steps
      //        already added — the old preflightCheck would wrongly block it)
      const linkedInAccount = await getLinkedInAccount(apiKey);
      if (!linkedInAccount) {
        res.status(400).json({
          error: "No LinkedIn account connected in Reply.io. Go to Reply.io → Settings → LinkedIn Accounts and connect your account.",
          code: "NO_LINKEDIN_ACCOUNT",
          connectUrl: "https://app.reply.io/settings/linkedin-accounts",
        });
        return;
      }

      if (linkedInAccount.status === "cookieInvalid") {
        res.status(400).json({
          error: `Your LinkedIn account "${linkedInAccount.name}" needs to be reconnected in Reply.io (session expired).`,
          code: "LINKEDIN_COOKIE_INVALID",
          connectUrl: "https://app.reply.io/settings/linkedin-accounts",
        });
        return;
      }

      if (linkedInAccount.status === "disabled") {
        res.status(400).json({
          error: `Your LinkedIn account "${linkedInAccount.name}" is disabled in Reply.io.`,
          code: "LINKEDIN_ACCOUNT_DISABLED",
          connectUrl: "https://app.reply.io/settings/linkedin-accounts",
        });
        return;
      }

      // ── 2. Optionally enroll a lead list first
      let enrollResult: { enrolled: number; total: number } | null = null;

      if (lead_list_id) {
        const { data: leads, error: dbErr } = await supabase
          .from("leads")
          .select("email, first_name, last_name, company_name, job_title, linkedin_url")
          .eq("lead_list_id", lead_list_id)
          .not("email", "is", null);

        if (dbErr) { res.status(500).json({ error: dbErr.message }); return; }
        if (!leads || leads.length === 0) {
          res.status(400).json({ error: "No leads with valid emails found." });
          return;
        }

        const validLeads = leads.filter((l) => isValidEmail(l.email));
        if (validLeads.length === 0) {
          res.status(400).json({
            error: "No leads with a valid email found. Reply.io requires a valid email to enroll a contact.",
            code: "NO_VALID_EMAILS",
          });
          return;
        }

        enrollResult = await importAndEnrollLeads(
          validLeads as Array<{
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
          res.status(400).json({ error: "No contacts could be enrolled.", code: "ENROLL_FAILED" });
          return;
        }

        // ── 3. Give Reply.io a moment to process newly enrolled contacts
        //        before calling /start — without this, Reply.io returns
        //        400 sequenceAction.noContacts immediately after enrollment
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // ── 4. Start the sequence — idempotent per docs (already active = 200)
      try {
        await replyFetch("POST", `/sequences/${seqId}/start`, undefined, apiKey);
      } catch (startErr: unknown) {
        const startMsg = startErr instanceof Error ? startErr.message : String(startErr);

        // Reply.io returns 400 with code sequenceAction.noContacts when there
        // are no contacts yet. If we just enrolled some, wait longer and retry.
        if (startMsg.includes("noContacts") && enrollResult && enrollResult.enrolled > 0) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          await replyFetch("POST", `/sequences/${seqId}/start`, undefined, apiKey);
        } else {
          throw startErr;
        }
      }

      res.json({
        success: true,
        ...(enrollResult ? { enrolled: enrollResult.enrolled, total: enrollResult.total } : {}),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[LinkedIn] activate seq ${seqId} error: ${msg}`);

      // Surface a clean error to the frontend
      if (msg.includes("noContacts")) {
        res.status(400).json({
          error: "Sequence has no contacts yet. Enroll contacts first, then activate.",
          code: "NO_CONTACTS",
        });
      } else if (msg.includes("noEmailAccounts")) {
        res.status(400).json({
          error: "Sequence has no email accounts assigned. This is a LinkedIn-only sequence — check Reply.io settings.",
          code: "NO_EMAIL_ACCOUNTS",
        });
      } else {
        res.status(400).json({ error: msg });
      }
    }
  }
);

router.post(
  "/replyio-linkedin/sequences/:id/pause-seq",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const apiKey = await getUserReplyApiKey(req.userId!);
    if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }
    const seqId = String(req.params.id);
    try {
      await replyFetch("POST", `/sequences/${seqId}/pause`, undefined, apiKey);
      res.json({ success: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[LinkedIn] pause seq ${seqId} error: ${msg}`);
      res.status(400).json({ error: msg });
    }
  }
);

router.delete(
  "/replyio-linkedin/sequences/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const apiKey = await getUserReplyApiKey(req.userId!);
    if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }
    const seqId = String(req.params.id);
    try {
      await replyFetch("DELETE", `/sequences/${seqId}`, undefined, apiKey);
      res.json({ success: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[LinkedIn] delete seq ${seqId} error: ${msg}`);
      res.status(400).json({ error: msg });
    }
  }
);

router.post(
  "/replyio-linkedin/sequences/create",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const apiKey = await getUserReplyApiKey(req.userId!);
    if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }

    const { name, steps, lead_list_id } = req.body as {
      name: string;
      steps?: Array<{ type?: string; delay_days?: number; body: string }>;
      lead_list_id?: string;
    };

    if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
    if (!steps?.length) { res.status(400).json({ error: "At least one step is required" }); return; }

    try {
      const linkedInAccount = await getLinkedInAccount(apiKey);

      if (!linkedInAccount) {
        res.status(400).json({
          error: "No LinkedIn account connected in Reply.io. Go to Reply.io → Settings → LinkedIn Accounts and connect your account first.",
          code: "NO_LINKEDIN_ACCOUNT",
          connectUrl: "https://app.reply.io/settings/linkedin-accounts",
        });
        return;
      }

      if (linkedInAccount.status !== "enabled") {
        const statusMessages: Record<string, string> = {
          disabled: "is disabled",
          dailyLimitReached: "has hit its daily limit",
          cookieInvalid: "needs to be reconnected (session expired)",
        };
        res.status(400).json({
          error: `Your LinkedIn account "${linkedInAccount.name}" ${statusMessages[linkedInAccount.status] ?? "is not usable right now"} in Reply.io. Fix this under Settings → LinkedIn Accounts, then try again.`,
          code: "LINKEDIN_ACCOUNT_NOT_READY",
          connectUrl: "https://app.reply.io/settings/linkedin-accounts",
        });
        return;
      }

      const builtSteps = steps.map((step, i) =>
        i === 0
          ? buildConnectStep(step.body, (step.delay_days ?? 0) * 1440)
          : buildMessageStep(step.body, (step.delay_days ?? 0) * 1440)
      );

      const sequence = await replyFetch<ReplySequence>(
        "POST", "/sequences", { name: name.trim() }, apiKey
      );

      logger.info(`[LinkedIn] Created sequence id=${sequence.id} name="${sequence.name}"`);

      await replyFetch(
        "POST",
        `/sequences/${sequence.id}/linkedin-account-links`,
        { linkedInAccountId: linkedInAccount.id },
        apiKey
      );

      logger.info(`[LinkedIn] Assigned LinkedIn account ${linkedInAccount.id} to seq ${sequence.id}`);

      const bulkStepResults = await replyFetch<Array<{ id: number; error: number | null; errorDetails: string | null }>>(
        "POST", `/sequences/${sequence.id}/steps/bulk`, builtSteps, apiKey
      );

      const failedSteps = (bulkStepResults ?? []).filter((r) => r.error != null);
      if (failedSteps.length > 0) {
        logger.warn(`[LinkedIn] Some steps failed to add: ${JSON.stringify(failedSteps)}`);
      }

      logger.info(`[LinkedIn] Added ${(bulkStepResults ?? []).length} steps to seq ${sequence.id}`);

      if (lead_list_id) {
        const { data: leads, error: dbErr } = await supabase
          .from("leads")
          .select("email, first_name, last_name, company_name, job_title, linkedin_url")
          .eq("lead_list_id", lead_list_id)
          .not("email", "is", null);

        // Reply.io's /contacts/import requires a syntactically valid email for
        // every item — one bad email fails the whole batch. Filter before sending.
        const validLeads = (leads ?? []).filter((l) => isValidEmail(l.email));

        if (dbErr || validLeads.length === 0) {
          res.status(207).json({
            id: sequence.id,
            name: sequence.name,
            enrolled: 0,
            total: 0,
            enrollError: dbErr?.message ?? "No leads with a valid email found. Reply.io requires a valid email to enroll a contact.",
          });
          return;
        }

        const enrollResult = await importAndEnrollLeads(
          validLeads as Array<{
            email: string;
            first_name?: string | null;
            last_name?: string | null;
            company_name?: string | null;
            job_title?: string | null;
            linkedin_url?: string | null;
          }>,
          String(sequence.id),
          apiKey
        );

        res.status(201).json({
          id: sequence.id,
          name: sequence.name,
          enrolled: enrollResult.enrolled,
          total: enrollResult.total,
        });
        return;
      }

      res.status(201).json({ id: sequence.id, name: sequence.name, enrolled: 0, total: 0 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[LinkedIn] create-sequence error: ${msg}`);
      const code = /sequence\.\w+/.exec(msg)?.[0];
      res.status(400).json({
        error: msg,
        ...(code ? { code: "STEPS_FAILED", replyCode: code } : { code: "CREATE_FAILED" }),
        connectUrl: "https://app.reply.io/settings/linkedin-accounts",
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────
//  LINKEDIN STATS — using official Reply.io v3 API
//  POST https://api.reply.io/v3/reporting/linkedin/overview
// ─────────────────────────────────────────────────────────────

// Exact response shape from the v3 API spec
interface ReplyV3LinkedInOverview {
  connectionsSent?: number;
  connectionsAccepted?: number;
  connectionsAcceptedPercentage?: number;
  messagesSent?: number;
  replied?: number;
  repliedPercentage?: number;
  inMailsSent?: number;
  inMailsReplied?: number;
  inMailsRepliedPercentage?: number;
  connectionNotesSent?: number;
  connectionNotesReplied?: number;
  connectionNotesRepliedPercentage?: number;
  profileViews?: number;
  likes?: number;
  follows?: number;
  endorses?: number;
  regularMessagesSent?: number;
  regularMessagesReplied?: number;
  regularMessagesRepliedPercentage?: number;
}

// What your frontend expects (keep your existing contract)
interface ReplyLIStats {
  totalPeopleContacted: number;
  connectionsSent: number;
  acceptedAutomatedConnections: number;
  automatedConnectionsConversionRate: number;
  messagesSent: number;
  replies: number;
  repliesConversionRate: number;
  inMailsSent: number;
  inMailsReplied: number;
  inMailsConversionRate: number;
  connectionNotesSent: number;
  connectionNotesReplied: number;
  connectionNotesConversionRate: number;
  profileViews: number;
  likes: number;
  follows: number;
  endorses: number;
  regularMessagesSent: number;
  regularMessagesReplied: number;
  regularMessagesConversionRate: number;
}

router.get(
  "/replyio-linkedin/sequences/:id/li-stats",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const apiKey = await getUserReplyApiKey(req.userId!);
    if (!apiKey) {
      res.status(401).json({ error: "No Reply.io API key configured" });
      return;
    }

    const seqId = req.params.id;
    const sequenceIdNum = parseInt(seqId, 10);

    if (isNaN(sequenceIdNum)) {
      res.status(400).json({ error: "Invalid sequence ID" });
      return;
    }

    // Optional date range from query params
    const { from, to, dateRangePreset } = req.query as {
      from?: string;
      to?: string;
      dateRangePreset?: "lastWeek" | "lastMonth" | "lastYear" | "allTime";
    };

    // Build the filters object — "filters" key is REQUIRED by the v3 API
    // sequenceIds filters to just this sequence's stats
    const filters: Record<string, unknown> = {
      sequenceIds: [sequenceIdNum],
    };

    if (from && to) {
      filters.from = from;
      filters.to = to;
    } else if (dateRangePreset) {
      filters.dateRangePreset = dateRangePreset;
    } else {
      // Default to all time so stats aren't empty for new sequences
      filters.dateRangePreset = "allTime";
    }

    try {
      // ✅ Correct: api.reply.io (NOT run.reply.io) with Bearer auth
      const overviewRes = await fetch(
        "https://api.reply.io/v3/reporting/linkedin/overview",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ filters }),
        }
      );

      if (!overviewRes.ok) {
        const text = await overviewRes.text();
        throw new Error(
          `Reply.io v3 reporting ${overviewRes.status}: ${text}`
        );
      }

      const raw = (await overviewRes.json()) as ReplyV3LinkedInOverview;

      // Map v3 field names → your frontend's expected field names
      const stats: ReplyLIStats = {
        // v3 doesn't have a dedicated "totalPeopleContacted";
        // connectionsSent is the best proxy (people who received an outreach)
        totalPeopleContacted:               raw.connectionsSent                  ?? 0,
        connectionsSent:                    raw.connectionsSent                  ?? 0,
        acceptedAutomatedConnections:       raw.connectionsAccepted              ?? 0,
        automatedConnectionsConversionRate: raw.connectionsAcceptedPercentage    ?? 0,
        messagesSent:                       raw.messagesSent                     ?? 0,
        replies:                            raw.replied                          ?? 0,
        repliesConversionRate:              raw.repliedPercentage                ?? 0,
        inMailsSent:                        raw.inMailsSent                      ?? 0,
        inMailsReplied:                     raw.inMailsReplied                   ?? 0,
        inMailsConversionRate:              raw.inMailsRepliedPercentage         ?? 0,
        connectionNotesSent:                raw.connectionNotesSent              ?? 0,
        connectionNotesReplied:             raw.connectionNotesReplied           ?? 0,
        connectionNotesConversionRate:      raw.connectionNotesRepliedPercentage ?? 0,
        profileViews:                       raw.profileViews                     ?? 0,
        likes:                              raw.likes                            ?? 0,
        follows:                            raw.follows                          ?? 0,
        endorses:                           raw.endorses                         ?? 0,
        regularMessagesSent:                raw.regularMessagesSent              ?? 0,
        regularMessagesReplied:             raw.regularMessagesReplied           ?? 0,
        regularMessagesConversionRate:      raw.regularMessagesRepliedPercentage ?? 0,
      };

      res.json(stats);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[LinkedIn] li-stats error for seq ${seqId}: ${msg}`);
      res.status(500).json({ error: msg });
    }
  }
);
// ─────────────────────────────────────────────────────────────
//  INBOX — list threads
//  GET /api/replyio-linkedin/inbox
//  Query: ?sequenceId=xxx  ?channel=linkedIn
//
//  Uses v3: GET /v3/inbox/threads
//  Docs: https://docs.reply.io/api-reference/inbox/list-inbox-threads
// ─────────────────────────────────────────────────────────────

interface ReplyV3InboxThread {
  id: number;
  channel: "email" | "linkedIn" | "unknown";
  isRead: boolean;
  subject: string | null;
  bodyPreview: string | null;
  lastActivityDate: string;
  isLastMessagePlanned: boolean;
  contact: {
    id: number | null;
    ownerId: number | null;
    fullName: string | null;
    email: string | null;
    linkedInProfileUrl: string | null;
    phone: string | null;
    companyName: string | null;
    title: string | null;
    isDeleted: boolean;
  };
  sequence: { id: number; name: string } | null;
  category: { id: number; name: string } | null;
  hasMeetingIntent: boolean;
  status: { state: "ok" | "needsAttention" };
}

router.get(
  "/replyio-linkedin/inbox",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const apiKey = await getUserReplyApiKey(req.userId!);
    if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }

    const sequenceId    = req.query.sequenceId as string | undefined;
    const channelFilter = (req.query.channel as string | undefined) ?? "linkedIn";

    try {
      const data = await replyFetch<{ items: ReplyV3InboxThread[]; hasMore: boolean }>(
        "GET", "/inbox/threads?top=1000", undefined, apiKey
      );

      let threads = data.items ?? [];

      // Filter by channel (default: linkedIn only)
      if (channelFilter) {
        threads = threads.filter((t) => t.channel === channelFilter);
      }

      // Optionally filter to a specific sequence
      if (sequenceId) {
        threads = threads.filter((t) => t.sequence?.id === Number(sequenceId));
      }

      // Normalise to the shape the frontend expects.
      // threadId = v3 inbox thread ID — used for ALL subsequent messages/reply calls.
      // personId = contact ID for display only (may be null for deleted contacts).
      const normalised = threads.map((t) => ({
        threadId:      t.id,
        personId:      t.contact.id,
        name:          t.contact.fullName ?? t.contact.email ?? `Thread ${t.id}`,
        email:         t.contact.email ?? null,
        linkedInUrl:   t.contact.linkedInProfileUrl ?? null,
        sequenceId:    t.sequence?.id ?? null,
        sequenceName:  t.sequence?.name ?? null,
        lastMessage:   t.bodyPreview ?? null,
        lastMessageAt: t.lastActivityDate,
        unreadCount:   t.isRead ? 0 : 1,
        status:        t.status?.state ?? null,
        category:      t.category?.name ?? null,
        channel:       t.channel,
      }));

      res.json({ threads: normalised });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[LinkedIn] inbox list error: ${msg}`);
      res.status(500).json({ error: msg });
    }
  }
);

// ─────────────────────────────────────────────────────────────
//  INBOX — messages in a thread
//  GET /api/replyio-linkedin/inbox/:threadId/messages
//
//  Uses v3: GET /v3/inbox/threads/{id}/messages
//  Docs: https://docs.reply.io/api-reference/inbox/list-messages-in-an-inbox-thread
//
//  NOTE: param is threadId (the v3 inbox thread ID), NOT a person/contact ID.
// ─────────────────────────────────────────────────────────────

interface ReplyInboxMessage {
  id?: string | number;
  text: string;
  isOutgoing: boolean;
  sentAt: string;
  fromName?: string | null;
}

router.get(
  "/replyio-linkedin/inbox/:threadId/messages",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const apiKey = await getUserReplyApiKey(req.userId!);
    if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }

    const { threadId } = req.params;

    try {
      const raw = await replyFetch<{
        items: Array<{
          channel: "email" | "linkedIn";
          date: string;
          body: string | null;
          fromName: string | null;
          isOutbound: boolean;
          status: { state: string; code: string | null; occurredAt: string | null } | null;
          subject?: string | null;
          fromAddress?: string | null;
          to?: string[] | null;
        }>;
        hasMore: boolean;
      }>("GET", `/inbox/threads/${threadId}/messages?top=200`, undefined, apiKey);

      const messages: ReplyInboxMessage[] = (raw.items ?? []).map((m, i) => ({
        id:         i,
        text:       m.body ?? "",
        isOutgoing: m.isOutbound,
        sentAt:     m.date,
        fromName:   m.fromName ?? null,
      }));

      res.json({ messages });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[LinkedIn] inbox messages error for thread ${threadId}: ${msg}`);
      res.status(500).json({ error: msg });
    }
  }
);

// ─────────────────────────────────────────────────────────────
//  INBOX — send reply in a thread
//  POST /api/replyio-linkedin/inbox/:threadId/reply
//  Body: { message: string, channel?: "linkedIn" | "email" }
//
//  Uses v3: POST /v3/inbox/threads/{id}/messages
//  Docs: https://docs.reply.io/api-reference/inbox/send-a-reply-within-a-thread
//
//  NOTE: param is threadId (the v3 inbox thread ID), NOT a person/contact ID.
//        channel must match the thread's channel — defaults to "linkedIn".
// ─────────────────────────────────────────────────────────────

router.post(
  "/replyio-linkedin/inbox/:threadId/reply",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const apiKey = await getUserReplyApiKey(req.userId!);
    if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }

    const { threadId } = req.params;
    const { message, channel = "linkedIn" } = req.body as {
      message: string;
      channel?: "linkedIn" | "email";
    };

    if (!message?.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    try {
      await replyFetch(
        "POST",
        `/inbox/threads/${threadId}/messages`,
        { channel, message: message.trim() },
        apiKey
      );
      res.json({ success: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[LinkedIn] inbox reply error for thread ${threadId}: ${msg}`);
      res.status(500).json({ error: msg });
    }
  }
);



router.patch(
  "/replyio-linkedin/sequences/:id/settings",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const apiKey = await getUserReplyApiKey(req.userId!);
    if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }

    const seqId = Number(req.params.id);
    const { emailsCountPerDay } = req.body as { emailsCountPerDay?: number };

    if (!emailsCountPerDay || emailsCountPerDay < 1) {
      res.status(400).json({ error: "emailsCountPerDay must be a positive integer" });
      return;
    }

    try {
      // GET current settings first — all 7 required fields must be sent back
      const current = await replyFetch<{
        settings: {
          emailsCountPerDay: number;
          daysToFinishProspect: number;
          emailSendingDelaySeconds: number;
          dailyThrottling: number;
          disableOpensTracking: boolean;
          repliesHandlingType: string;
          enableLinksTracking: boolean;
        };
      }>("GET", `/sequences/${seqId}`, undefined, apiKey);

      const existing = current.settings ?? {};

      const updated = await replyFetch<{ id: number; settings: { emailsCountPerDay: number } }>(
        "PATCH",
        `/sequences/${seqId}`,
        {
          settings: {
            emailsCountPerDay:        emailsCountPerDay,
            daysToFinishProspect:     existing.daysToFinishProspect     ?? 14,
            emailSendingDelaySeconds: existing.emailSendingDelaySeconds ?? 60,
            dailyThrottling:          existing.dailyThrottling          ?? 100,
            disableOpensTracking:     existing.disableOpensTracking     ?? false,
            repliesHandlingType:      existing.repliesHandlingType      ?? "markAsFinished",
            enableLinksTracking:      existing.enableLinksTracking      ?? true,
          },
        },
        apiKey
      );

      res.json({ success: true, emailsCountPerDay: updated.settings?.emailsCountPerDay });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[LinkedIn] update sequence settings error for ${seqId}: ${msg}`);
      res.status(500).json({ error: msg });
    }
  }
);

export default router;