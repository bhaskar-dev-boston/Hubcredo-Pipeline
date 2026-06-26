import { Router, Response } from "express";
import { logger } from "../lib/logger";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { supabase } from "../lib/supabase";

const router = Router();
const REPLY_BASE = "https://api.reply.io/v3";

const LI_HEALTHY_STATUSES = new Set(["enabled"]);

// ── Variable normalisation + HTML (same as replyio.ts) ───────

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

function toReplyHtml(text: string): string {
  if (!text) return text;

  // 1. Normalise {{firstName}} → {{FirstName}} etc.
  let result = text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key: string) => {
    const normalized = key.trim().toLowerCase().replace(/\s+/g, "");
    return REPLY_VAR_MAP[normalized] ?? `{{ ${key.trim()} }}`;
  });

  // 2. Convert bracket-style [First Name] → {{FirstName}}
  result = result
    .replace(/\[First Name\]/gi,  "{{FirstName}}")
    .replace(/\[Last Name\]/gi,   "{{LastName}}")
    .replace(/\[Full Name\]/gi,   "{{FullName}}")
    .replace(/\[Company\]/gi,     "{{CompanyName}}")
    .replace(/\[Job Title\]/gi,   "{{JobTitle}}")
    .replace(/\[Industry\]/gi,    "{{Industry}}")
    .replace(/\[Country\]/gi,     "{{Country}}")
    .replace(/\[City\]/gi,        "{{City}}");

  // 3. Wrap paragraphs in <p> tags (single newlines → <br>)
  const paragraphs = result.split(/\n\n+/);
  return paragraphs
    .map((para) => {
      const inner = para.trim().replace(/\n/g, "<br>");
      return inner ? `<p>${inner}</p>` : "";
    })
    .filter(Boolean)
    .join("\n");
}

// ── Helpers ──────────────────────────────────────────────────

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

// ── LinkedIn step types ──────────────────────────────────────
//
// FIX: Do NOT embed actionType:"connect" steps inside POST /v3/sequences.
// The inline steps array in sequence creation only supports actionType:"message".
// For actionType:"connect" steps, use POST /v3/sequences/{id}/steps/bulk AFTER
// the sequence is created. See Reply.io docs:
// https://docs.reply.io/api-reference/sequences/create-a-sequence
// https://docs.reply.io/api-reference/sequence-steps/bulk-create-sequence-steps

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
    const data = await replyFetch<ReplyLinkedInAccount[]>(
      "GET",
      "/linkedin-accounts",
      undefined,
      apiKey
    );
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

  logger.info(
    `[LinkedIn] /contact-links/bulk: enrolled=${enrolled} notProcessed=${notProcessed} for seq ${seqId}`
  );

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
  if (!apiKey) {
    res.status(401).json({ error: "No Reply.io API key configured" });
    return;
  }
  try {
    const data = await replyFetch<{ items: ReplySequence[]; hasMore: boolean }>(
      "GET",
      "/sequences?top=1000",
      undefined,
      apiKey
    );
    const sequences = data.items ?? [];
    res.json({ sequences: sequences.filter((s) => !s.isArchived) });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/replyio-linkedin/account-status", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) {
    res.status(401).json({ error: "No Reply.io API key configured" });
    return;
  }
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
    if (!apiKey) {
      res.status(401).json({ error: "No Reply.io API key configured" });
      return;
    }

    const seqId = String(req.params.id);
    const { lead_list_id } = req.body as { lead_list_id: string };

    if (!lead_list_id) {
      res.status(400).json({ error: "lead_list_id is required" });
      return;
    }

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

      if (dbErr) {
        res.status(500).json({ error: dbErr.message });
        return;
      }

      if (!leads || leads.length === 0) {
        res.status(400).json({ error: "No leads with valid emails found in the selected list." });
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

      if (result.enrolled === 0) {
        res.status(400).json({
          error: "No contacts could be enrolled. They may already be active or finished in this sequence.",
          code: "ENROLL_FAILED",
          total: result.total,
        });
        return;
      }

      res.json({ success: true, enrolled: result.enrolled, total: result.total });
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
    if (!apiKey) {
      res.status(401).json({ error: "No Reply.io API key configured" });
      return;
    }

    const seqId = String(req.params.id);
    const { lead_list_id } = req.body as { lead_list_id?: string };

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

      let enrollResult: { enrolled: number; total: number } | null = null;

      if (lead_list_id) {
        const { data: leads, error: dbErr } = await supabase
          .from("leads")
          .select("email, first_name, last_name, company_name, job_title, linkedin_url")
          .eq("lead_list_id", lead_list_id)
          .not("email", "is", null);

        if (dbErr) {
          res.status(500).json({ error: dbErr.message });
          return;
        }

        if (!leads || leads.length === 0) {
          res.status(400).json({ error: "No leads with valid emails found." });
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
          res.status(400).json({ error: "No contacts could be enrolled.", code: "ENROLL_FAILED" });
          return;
        }
      }

      await replyFetch("POST", `/sequences/${seqId}/start`, undefined, apiKey);

      res.json({
        success: true,
        ...(enrollResult ? { enrolled: enrollResult.enrolled, total: enrollResult.total } : {}),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[LinkedIn] activate seq ${seqId} error: ${msg}`);
      res.status(400).json({ error: msg });
    }
  }
);

router.post(
  "/replyio-linkedin/sequences/:id/pause-seq",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const apiKey = await getUserReplyApiKey(req.userId!);
    if (!apiKey) {
      res.status(401).json({ error: "No Reply.io API key configured" });
      return;
    }
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
    if (!apiKey) {
      res.status(401).json({ error: "No Reply.io API key configured" });
      return;
    }
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

// POST /api/replyio-linkedin/sequences/create
//
// FIX APPLIED: Reply.io v3 returns 500 when you embed actionType:"connect" steps
// inside the POST /v3/sequences body. The inline steps array in sequence creation
// only accepts actionType:"message" per the official docs example.
//
// Correct approach (per docs):
//   1. POST /v3/sequences          → create sequence with name + linkedInAccounts (NO steps)
//   2. POST /v3/sequences/{id}/steps/bulk → add connect + follow-up steps separately
//
// Docs: https://docs.reply.io/api-reference/sequences/create-a-sequence
//       https://docs.reply.io/api-reference/sequence-steps/bulk-create-sequence-steps
router.post(
  "/replyio-linkedin/sequences/create",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const apiKey = await getUserReplyApiKey(req.userId!);
    if (!apiKey) {
      res.status(401).json({ error: "No Reply.io API key configured" });
      return;
    }

    const { name, steps, lead_list_id } = req.body as {
      name: string;
      steps?: Array<{ type?: string; delay_days?: number; body: string }>;
      lead_list_id?: string;
    };

    if (!name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    if (!steps?.length) {
      res.status(400).json({ error: "At least one step is required" });
      return;
    }

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
          error: `Your LinkedIn account "${linkedInAccount.name}" ${
            statusMessages[linkedInAccount.status] ?? "is not usable right now"
          } in Reply.io. Fix this under Settings → LinkedIn Accounts, then try again.`,
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

      // ── STEP 1: Create the sequence with name only ──────────────────────────────
      // DO NOT pass linkedInAccounts or steps in this call.
      // Passing linkedInAccounts inline causes Reply.io to return 500
      // (their endpoint cannot handle LinkedIn-only sequences without email accounts).
      // Docs: https://docs.reply.io/api-reference/sequences/create-a-sequence
      const sequence = await replyFetch<ReplySequence>(
        "POST",
        "/sequences",
        { name: name.trim() },
        apiKey
      );

      logger.info(`[LinkedIn] Created sequence id=${sequence.id} name="${sequence.name}"`);

      // ── STEP 2: Assign the LinkedIn account via the dedicated link endpoint ──────
      // Endpoint: POST /v3/sequences/{id}/linkedin-account-links
      // Body: { linkedInAccountId: number }
      // Docs: https://docs.reply.io/api-reference/sequence-linkedin-accounts/assign-a-linkedin-account-to-a-sequence
      await replyFetch(
        "POST",
        `/sequences/${sequence.id}/linkedin-account-links`,
        { linkedInAccountId: linkedInAccount.id },
        apiKey
      );

      logger.info(`[LinkedIn] Assigned LinkedIn account ${linkedInAccount.id} to seq ${sequence.id}`);

      // ── STEP 3: Add steps via the dedicated bulk steps endpoint ─────────────────
      // POST /v3/sequences/{id}/steps/bulk accepts all actionTypes including "connect".
      // Docs: https://docs.reply.io/api-reference/sequence-steps/bulk-create-sequence-steps
      const bulkStepResults = await replyFetch<Array<{ id: number; error: number | null; errorDetails: string | null }>>(
        "POST",
        `/sequences/${sequence.id}/steps/bulk`,
        builtSteps,
        apiKey
      );

      const failedSteps = (bulkStepResults ?? []).filter((r) => r.error != null);
      if (failedSteps.length > 0) {
        logger.warn(`[LinkedIn] Some steps failed to add: ${JSON.stringify(failedSteps)}`);
      }

      logger.info(`[LinkedIn] Added ${(bulkStepResults ?? []).length} steps to seq ${sequence.id}`);

      // ── STEP 3: Enroll leads if a list was provided ──
      if (lead_list_id) {
        const { data: leads, error: dbErr } = await supabase
          .from("leads")
          .select("email, first_name, last_name, company_name, job_title, linkedin_url")
          .eq("lead_list_id", lead_list_id)
          .not("email", "is", null);

        if (dbErr || !leads?.length) {
          res.status(207).json({
            id: sequence.id,
            name: sequence.name,
            enrolled: 0,
            total: 0,
            enrollError: dbErr?.message ?? "No leads with valid emails found.",
          });
          return;
        }

        const enrollResult = await importAndEnrollLeads(
          leads.filter((l) => !!l.email) as Array<{
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

export default router;
