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
//
// STATS: sourced from the `replyio_events` Supabase table, populated by
// /replyio/webhook-receiver. Requires webhooks subscribed once via
// POST /replyio/setup-stats-webhooks for eventType: email_sent, email_opened,
// email_link_clicked, email_replied, email_bounced (confirmed against
// Reply's official event catalog at docs.reply.io/webhook-events).
// Requires this table to exist:
//
//   create table replyio_events (
//     id bigint generated always as identity primary key,
//     reply_event_id uuid not null unique,
//     event_type text not null,
//     sequence_id bigint,
//     contact_id bigint,
//     contact_email text,
//     occurred_at timestamptz not null,
//     raw jsonb not null,
//     created_at timestamptz default now()
//   );
//   create index idx_replyio_events_seq on replyio_events (sequence_id, event_type);
// ============================================================

import { Router, Request, Response } from "express";
import { logger } from "../lib/logger";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { supabase } from "../lib/supabase";

const router = Router();
const REPLY_BASE = "https://api.reply.io/v3";

// Reply.io's /contacts/import requires a syntactically valid email for every
// item — one bad email fails the WHOLE batch (no per-item tolerance). So we
// must validate here, not just check for presence, before ever calling it.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function isValidEmail(email: string | null | undefined): email is string {
  return !!email && EMAIL_RE.test(email.trim());
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
  } catch { /* fall through */ }
  return process.env.REPLY_IO_API_KEY ?? "";
}

async function replyFetch<T>(
  method: string,
  path: string,
  body?: unknown,
  apiKey?: string,
  baseUrl: string = REPLY_BASE
): Promise<T> {
  const key = apiKey ?? process.env.REPLY_IO_API_KEY;
  if (!key) throw new Error("No Reply.io API key configured");

  const res = await fetch(`${baseUrl}${path}`, {
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

// ── Normalise a raw template var name to a camelCase Reply.io custom variable name ──
// Strips the description after the first ':' so "THE TRIGGER: examples..." → "theTrigger"
// Also strips trailing non-alphanumeric chars (e.g. trailing "." from long names).
function toCamelCaseVar(raw: string): string {
  const base = raw.split(":")[0].trim();
  const hasSeparators = /[^a-zA-Z0-9]/.test(base);
  const isAllUpper = base === base.toUpperCase();
  const isAllLower = base === base.toLowerCase();

  // Already mixed-case with no separators (e.g. "whatDroveTheValue") — this is
  // almost certainly a CSV custom-field key used verbatim in the template.
  // Preserve it exactly, only ensure the first char is lowercase, so the
  // registered Reply.io field name matches the CSV key exactly.
  if (!hasSeparators && !isAllUpper && !isAllLower) {
    return base.charAt(0).toLowerCase() + base.slice(1);
  }

  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+([a-z0-9])/g, (_: string, c: string) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]+$/, "");
}

// ── Convert plain text body to Reply.io HTML + fix variables ─
function toReplyHtml(text: string): string {
  if (!text) return text;

  let result = text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key: string) => {
    const normalized = key.trim().toLowerCase().replace(/\s+/g, "");
    // Standard Reply.io vars (e.g. {{FirstName}}) stay as-is
    if (REPLY_VAR_MAP[normalized]) return REPLY_VAR_MAP[normalized];
    // Custom vars: normalize to camelCase so Reply.io can match them to contact custom variables
    return `{{${toCamelCaseVar(key)}}}`;
  });

  // Bracket-style placeholders → Reply.io standard variables.
  // Must match exactly the values in REPLY_VAR_MAP so they are never misclassified
  // as custom variables and accidentally registered as custom fields.
  result = result
    .replace(/\[First Name\]/gi,  "{{FirstName}}")
    .replace(/\[Last Name\]/gi,   "{{LastName}}")
    .replace(/\[Full Name\]/gi,   "{{FullName}}")
    .replace(/\[Company\]/gi,     "{{Company}}")   // Reply.io standard is {{Company}}
    .replace(/\[Job Title\]/gi,   "{{Title}}")     // Reply.io standard is {{Title}}
    .replace(/\[Industry\]/gi,    "{{Industry}}")
    .replace(/\[Country\]/gi,     "{{Country}}")
    .replace(/\[City\]/gi,        "{{City}}")
    .replace(/\[Phone\]/gi,       "{{Phone}}")
    .replace(/\[Website\]/gi,     "{{Website}}")
    .replace(/\[LinkedIn\]/gi,    "{{LinkedIn}}");

  const paragraphs = result.split(/\n\n+/);
  const html = paragraphs
    .map((para) => {
      const inner = para.trim().replace(/\n/g, "<br>");
      return inner ? `<p>${inner}</p>` : "";
    })
    .filter(Boolean)
    .join("\n");

  return html;
}

// ── Strip quoted replies, disclaimers, and signatures from email body ──
function cleanEmailBody(raw: string): string {
  if (!raw) return "";

  // 1. Strip HTML — remove blockquotes and gmail quote divs entirely first
  let text = raw
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
    .replace(/<div[^>]*class="[^"]*quote[^"]*"[\s\S]*?<\/div>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  // 2. Decode HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // 3. Split into lines and stop at noise markers
  const lines = text.split("\n").map((l) => l.trim());

  const cleanLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Stop at quoted reply header: "On Sun, Jun 28... wrote:"
    if (/^On .+wrote:$/i.test(line)) break;
    // Stop at multi-line "On ... wrote:" that got collapsed
    if (/^On .{10,}wrote:/i.test(line)) break;
    // Stop at "Sun Jun 28, 2026, at 6:39 PM Name :" style attribution
    if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun).+\d{4}.+\d+:\d+/i.test(line)) break;
    // Stop at > quoted text
    if (line.startsWith(">")) break;
    // Stop at disclaimer blocks
    if (/^Disclaimer:/i.test(line)) break;
    if (/^This email is governed by/i.test(line)) break;
    if (/^Messages from '.+' mail server/i.test(line)) break;
    if (/^If you are not the intended/i.test(line)) break;
    if (/^If you have received (this|the) (message|email) in error/i.test(line)) break;
    if (/^Please also scan/i.test(line)) break;
    if (/^Thank you for your time/i.test(line)) break;
    // Stop at signature separator
    if (line === "--") break;

    cleanLines.push(line);
  }

  // 4. Collapse excessive blank lines and trim
  return cleanLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
// Reply.io built-in variable names (verified from Reply.io docs).
// These are the ONLY variable names Reply.io recognises without pre-registration.
// Anything else must be created as a custom field via POST /v3/custom-fields first.
const REPLY_VAR_MAP: Record<string, string> = {
  "firstname":   "{{FirstName}}",
  "lastname":    "{{LastName}}",
  "fullname":    "{{FullName}}",
  "companyname": "{{Company}}",   // Reply.io standard is {{Company}}, NOT {{CompanyName}}
  "company":     "{{Company}}",
  "title":       "{{Title}}",     // Reply.io standard is {{Title}}, NOT {{JobTitle}}
  "jobtitle":    "{{Title}}",
  "email":       "{{Email}}",
  "phone":       "{{Phone}}",
  "industry":    "{{Industry}}",
  "country":     "{{Country}}",
  "city":        "{{City}}",
  "website":     "{{Website}}",
  "linkedin":    "{{LinkedIn}}",
};

// Lowercase set of the standard var names emitted by REPLY_VAR_MAP (for filtering)
const REPLY_STANDARD_VAR_NAMES = new Set(
  Object.values(REPLY_VAR_MAP).map((v) => v.replace(/\{\{|\}\}/g, "").toLowerCase())
);

/**
 * Extract custom variable names from already-processed Reply.io HTML
 * (i.e. vars are already in {{camelCase}} form).
 * Excludes built-in Reply.io standard variables.
 */
function extractCustomVarNamesFromHtml(html: string): string[] {
  const found = new Set<string>();
  const re = /\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const name = m[1];
    if (!REPLY_STANDARD_VAR_NAMES.has(name.toLowerCase())) {
      found.add(name);
    }
  }
  return [...found];
}

/**
 * Ensure every custom variable name in `varNames` exists as a registered
 * custom field in the Reply.io account. Creates missing fields as fieldType "text".
 * Must be called BEFORE creating sequence steps that use these variables,
 * otherwise Reply.io rejects the step with "Unrecognized variables found".
 *
 * IMPORTANT: this must hit the v3 endpoint (POST/GET /v3/custom-fields, using
 * `title`/`fieldType`). The v1 endpoint (`/v1/custom-fields`, `name`/`type`)
 * writes to a completely separate field registry that the v3 sequence editor
 * (and v3 contact import) never reads from — fields created there will always
 * show up as "Unrecognized variables" in the Reply.io UI even though the
 * v1 API call itself "succeeds".
 */
async function ensureCustomFieldsExist(varNames: string[], apiKey: string): Promise<void> {
  if (varNames.length === 0) return;
  try {
    const existing = await replyFetch<Array<{ id: number; title: string; fieldType: string }>>(
      "GET", "/custom-fields", undefined, apiKey
    );
    const existingTitles = new Set((Array.isArray(existing) ? existing : []).map((f) => f.title.toLowerCase()));
    for (const name of varNames) {
      if (!existingTitles.has(name.toLowerCase())) {
        try {
          await replyFetch("POST", "/custom-fields", { title: name, fieldType: "text", orgWide: false }, apiKey);
          logger.info(`Reply.io custom field created: "${name}"`);
        } catch (err) {
          // Log but don't fail the whole request — field may already exist under a slightly
          // different casing (409 duplicateName), or the account may have hit its field limit
          // (409 limitExceeded).
          logger.warn(`Reply.io custom field creation skipped for "${name}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  } catch (err) {
    logger.warn(`Reply.io ensureCustomFieldsExist: could not list custom fields — ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─────────────────────────────────────────────────────────────
// CORE ENROLL HELPER
// ─────────────────────────────────────────────────────────────

// Map standard frontend field keys → DB column names, so var_map values like
// "companyName" can resolve to the correct lead field.
const STANDARD_FIELD_TO_DB: Record<string, string> = {
  firstName:     "first_name",
  lastName:      "last_name",
  email:         "email",
  companyName:   "company_name",
  title:         "job_title",
  industry:      "industry",
  hqCountry:     "hq_country",
  hqCity:        "hq_city",
  linkedInUrl:   "linkedin_url",
  researchBlurb: "research_blurb",
};

/** Build the customFields array to pass to Reply.io on contact import.
 *  - All custom_fields keys become custom fields automatically.
 *  - varMap entries (rawTemplateVar → fieldKey) override/supplement them:
 *      "" or missing  → auto-resolved from custom_fields by normalized key match
 *      "__csv__<key>" → pull from custom_fields[key]
 *      standard key   → pull from the corresponding DB field on the lead
 */
function buildCustomVariables(
  lead: Record<string, unknown>,
  varMap: Record<string, string>
): Array<{ name: string; value: string }> {
  const vars: Record<string, string> = {};

  // 1. Seed with all custom_fields (keys already camelCase from upload)
  // 1. Seed with all custom_fields (keys already camelCase from upload)
const cf = (lead.custom_fields ?? {}) as Record<string, string>;
for (const [k, v] of Object.entries(cf)) {
  if (!k || v == null || !String(v).trim()) continue;
  const canonical = toCamelCaseVar(k);
  vars[canonical] = String(v);
  if (!(k in vars)) vars[k] = String(v); // keep raw key too, in case a field was registered unnormalized
}

  // 2. Apply explicit varMap entries
  for (const [rawVar, fieldKey] of Object.entries(varMap)) {
    if (!fieldKey) continue; // "" means auto-resolve from custom_fields — already done above
    const replyVarName = toCamelCaseVar(rawVar); // normalised name used in template
    let value: string | undefined;
    if (fieldKey.startsWith("__csv__")) {
      const csvKey = fieldKey.slice("__csv__".length);
      value = cf[csvKey];
    } else {
      // Standard field: map through DB column name
      const dbKey = STANDARD_FIELD_TO_DB[fieldKey] ?? fieldKey;
      const raw = lead[dbKey];
      value = raw != null ? String(raw) : undefined;
    }
    if (value != null && value.trim()) vars[replyVarName] = value;
  }

  return Object.entries(vars).map(([name, value]) => ({ name, value }));
}

interface EnrollLead {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  job_title?: string | null;
  linkedin_url?: string | null;
  custom_fields?: Record<string, string> | null;
  [key: string]: unknown;
}

async function importAndEnrollLeads(
  leads: EnrollLead[],
  seqId: string,
  apiKey: string,
  varMap: Record<string, string> = {}
): Promise<{ enrolled: number; total: number }> {
  const total = leads.length;
  if (total === 0) return { enrolled: 0, total: 0 };

  const importPayload = {
    items: leads.map((l) => {
      const customFields = buildCustomVariables(l, varMap);
      return {
        email: l.email,
        ...(l.first_name ? { firstName: l.first_name.split(" ")[0] } : {}),
        ...(l.last_name
          ? { lastName: l.last_name }
          : l.first_name && l.first_name.includes(" ")
            ? { lastName: l.first_name.split(" ").slice(1).join(" ") }
            : {}),
        ...(l.company_name ? { company: l.company_name }     : {}),
        ...(l.job_title    ? { title: l.job_title }          : {}),
        ...(l.linkedin_url ? { linkedInUrl: l.linkedin_url } : {}),
        // NOTE: Reply.io's v3 /v3/contacts/import contact-patch model calls this
        // array `customFields` (items shaped { id?, name?, value }) — NOT
        // `customVariables`. Sending it under the wrong key means Reply.io
        // silently ignores it and the contact is created with no custom data,
        // even though the import call itself returns 200/created.
        ...(customFields.length > 0 ? { customFields } : {}),
      };
    }),
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
    `Reply.io /contacts/import: added=${importResult.added} updated=${importResult.updated} ` +
    `skipped=${importResult.skipped} failed=${importResult.failed} for seq ${seqId}`
  );

  const contactIds = importResult.items
    .filter((item) => item.id != null)
    .map((item) => item.id as number);

  if (contactIds.length === 0) {
    logger.warn(`Reply.io importAndEnrollLeads: no contact IDs returned from import for seq ${seqId}`);
    return { enrolled: 0, total };
  }

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
    logger.warn(`Reply.io notProcessed details: ${JSON.stringify(bulkResult.notProcessed)}`);
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

    // Classify each sequence as "email" or "linkedin" once, server-side, so the
    // Campaigns and LinkedIn pages don't each maintain their own (and
    // potentially inconsistent) filtering logic.
    //
    // Primary signal: Reply.io populates `linkedInAccounts` on a sequence once
    // a LinkedIn account is linked via POST /sequences/{id}/linkedin-account-links
    // (see replyio-linkedin.ts → sequences/create). A non-empty array means the
    // sequence is LinkedIn-based.
    //
    // Fallback: name-matching, for any older sequence created before this field
    // was consistently populated, or if the list endpoint omits the field.
    const classified = sequences.map((s: any) => {
      const hasLinkedInAccount = Array.isArray(s.linkedInAccounts) && s.linkedInAccounts.length > 0;
      const nameLooksLinkedIn = /linkedin/i.test(s.name ?? "");
      const channel: "email" | "linkedin" = hasLinkedInAccount || nameLooksLinkedIn ? "linkedin" : "email";
      return { ...s, channel };
    });

    res.json({ sequences: classified });
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

// ── EMAIL STATS — sourced from replyio_events (populated by webhooks), ──
// ── not Reply's contact-status API, which doesn't reliably expose these ──
router.get("/replyio/sequences/:id/stats", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const sequenceId = Number(req.params.id);
  if (!sequenceId) { res.status(400).json({ error: "Invalid sequence id" }); return; }

  try {
    const { data, error } = await supabase
      .from("replyio_events")
      .select("event_type, contact_id")
      .eq("sequence_id", sequenceId);

    if (error) { res.status(500).json({ error: error.message }); return; }

    const rows = data ?? [];
    const distinctContacts = (type: string) =>
      new Set(rows.filter((r) => r.event_type === type).map((r) => r.contact_id)).size;

    const total     = distinctContacts("email_sent");
    const delivered = total; // email_sent IS Reply's delivery confirmation event
    const opened    = distinctContacts("email_opened");
    const clicked   = distinctContacts("email_link_clicked");
    const replied   = distinctContacts("email_replied");
    const bounced   = distinctContacts("email_bounced");

    const pct = (n: number) => (total > 0 ? Number(((n / total) * 100).toFixed(1)) : 0);

    res.json({
      sequenceId,
      total,
      active: 0,
      delivered,
      opened,
      clicked,
      replied,
      bounced,
      deliveredPercentage: pct(delivered),
      openedPercentage:    pct(opened),
      repliedPercentage:   pct(replied),
      bouncedPercentage:   pct(bounced),
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
    if (!isValidEmail(contact.email)) { res.status(400).json({ error: "contact.email is not a valid email address" }); return; }
    if (!sequenceId)     { res.status(400).json({ error: "sequenceId is required" }); return; }

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

// ── ONE-TIME SETUP — subscribes to the 5 events /stats depends on ──
// Call this once (e.g. from the browser console while logged in, or a
// Settings → Integrations button) after connecting a Reply.io API key.
// Safe to re-run — Reply.io returns an error for events already
// subscribed, which is logged per-event and doesn't fail the whole call.
router.post("/replyio/setup-stats-webhooks", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }

  const webhookUrl = `${req.protocol}://${req.get("host")}/api/replyio/webhook-receiver`;
  const events = ["email_sent", "email_opened", "email_link_clicked", "email_replied", "email_bounced"];

  const results: Array<{ event: string; ok: boolean; detail: string }> = [];

  for (const eventType of events) {
    try {
      const webhook = await replyFetch<{ id: number }>("POST", "/webhooks", {
        eventType,
        url: webhookUrl,
        scope: "personal",
        enabled: true,
        payloadConfig: { includeEmailUrl: false, includeEmailText: false, includeProspectCustomFields: false },
      }, apiKey);
      results.push({ event: eventType, ok: true, detail: `subscribed, id=${webhook.id}` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`Reply.io setup-stats-webhooks: ${eventType} failed — ${msg}`);
      results.push({ event: eventType, ok: false, detail: msg });
    }
  }

  res.json({ results });
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

// ── WEBHOOK RECEIVER — real handler: persists events to Supabase ──
// Payload shape confirmed against docs.reply.io/webhook-event-payloads:
// { event: { id, type, date }, sequence_fields: { id }, contact_fields: { id, email } }
router.post("/replyio/webhook-receiver", async (req: Request, res: Response) => {
  const body = req.body as {
    event?: { id?: string; type?: string; date?: string };
    sequence_fields?: { id?: number };
    contact_fields?: { id?: number; email?: string };
  };

  const eventId = body.event?.id;
  const eventType = body.event?.type;

  if (!eventId || !eventType) {
    // Ack anyway — malformed payload isn't worth a retry storm from Reply's side
    logger.warn(`Reply.io webhook received with missing event id/type: ${JSON.stringify(body).slice(0, 300)}`);
    res.status(200).json({ received: true });
    return;
  }

  try {
    const { error } = await supabase.from("replyio_events").insert({
      reply_event_id: eventId,
      event_type: eventType,
      sequence_id: body.sequence_fields?.id ?? null,
      contact_id: body.contact_fields?.id ?? null,
      contact_email: body.contact_fields?.email ?? null,
      occurred_at: body.event?.date ?? new Date().toISOString(),
      raw: body,
    });
    if (error) {
      // Unique constraint violation on reply_event_id = duplicate delivery, not an error
      logger.info(`Reply.io webhook ${eventId} (${eventType}) not inserted (likely duplicate): ${error.message}`);
    } else {
      logger.info(`Reply.io webhook stored: ${eventType} (seq ${body.sequence_fields?.id ?? "?"})`);
    }
  } catch (err: unknown) {
    logger.error(`Reply.io webhook-receiver error: ${err instanceof Error ? err.message : String(err)}`);
  }

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
      // Pre-process all variants so we can inspect the final variable names
      const processedSteps = steps.map((step) => {
        const stepType = step.type ?? "email";
        const message = toReplyHtml(step.body);
        let subject = "";
        if (stepType === "email" && step.subject) {
          subject = step.subject.replace(
            /\{\{\s*([^}]+?)\s*\}\}/g,
            (_match: string, key: string) => {
              const normalized = key.trim().toLowerCase().replace(/\s+/g, "");
              if (REPLY_VAR_MAP[normalized]) return REPLY_VAR_MAP[normalized];
              return `{{${toCamelCaseVar(key)}}}`;
            }
          );
        }
        return { stepType, message, subject, delay_days: step.delay_days };
      });

      // Collect all custom variable names used across all steps and register them
      // in Reply.io BEFORE creating the steps. Reply.io rejects steps that reference
      // variables that don't exist yet as registered custom fields.
      const allCustomVars = new Set<string>();
      for (const s of processedSteps) {
        for (const v of extractCustomVarNamesFromHtml(s.message)) allCustomVars.add(v);
        if (s.subject) {
          for (const v of extractCustomVarNamesFromHtml(s.subject)) allCustomVars.add(v);
        }
      }
      if (allCustomVars.size > 0) {
        logger.info(`Reply.io seq ${sequence.id}: ensuring custom fields exist: ${[...allCustomVars].join(", ")}`);
        await ensureCustomFieldsExist([...allCustomVars], apiKey);
      }

      for (const s of processedSteps) {
        const variant: Record<string, string> = { message: s.message };
        if (s.subject) variant.subject = s.subject;
        try {
          await replyFetch("POST", `/sequences/${sequence.id}/steps`, {
            type: s.stepType,
            delayInMinutes: (s.delay_days ?? 0) * 1440,
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

router.post("/replyio/sequences/:id/activate", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }

  const seqId = String(req.params.id);
  const { emailAccountId, lead_list_id, var_map } = req.body as {
    emailAccountId?: number;
    lead_list_id?: string;
    var_map?: Record<string, string>;
  };

  try {
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

    await assignEmailAccountToSequence(seqId, resolvedAccountId, apiKey);

    let enrollResult: { enrolled: number; total: number } | null = null;

    if (lead_list_id) {
      const { data: leads, error: dbErr } = await supabase
        .from("leads")
        .select("email, first_name, last_name, company_name, job_title, linkedin_url, custom_fields")
        .eq("lead_list_id", lead_list_id)
        .not("email", "is", null);

      if (dbErr) { res.status(500).json({ error: dbErr.message }); return; }

      if (!leads || leads.length === 0) {
        res.status(400).json({ error: "No leads with valid emails found in the selected list." });
        return;
      }

      const validLeads = leads.filter((l) => isValidEmail(l.email));
      const skippedInvalidEmail = leads.length - validLeads.length;

      if (validLeads.length === 0) {
        res.status(400).json({
          error: "No leads with a valid email found in the selected list.",
          code: "NO_VALID_EMAILS",
        });
        return;
      }

      enrollResult = await importAndEnrollLeads(validLeads as EnrollLead[], seqId, apiKey, var_map ?? {});

      if (enrollResult.enrolled === 0) {
        res.status(400).json({
          error: "No contacts could be enrolled. Check that leads have valid emails and are not already finished in this sequence.",
        });
        return;
      }

      if (skippedInvalidEmail > 0) {
        logger.warn(`Reply.io activate seq ${seqId}: skipped ${skippedInvalidEmail} lead(s) with invalid email format`);
      }
    }

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

router.post("/replyio/sequences/:id/enroll-list", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }
  try {
    const { lead_list_id, var_map } = req.body as { lead_list_id: string; var_map?: Record<string, string> };
    if (!lead_list_id) { res.status(400).json({ error: "lead_list_id is required" }); return; }

    const seqId = String(req.params.id);

    const { data: leads, error: dbErr } = await supabase
      .from("leads")
      .select("email, first_name, last_name, company_name, job_title, linkedin_url, custom_fields")
      .eq("lead_list_id", lead_list_id)
      .not("email", "is", null);

    if (dbErr) { res.status(500).json({ error: dbErr.message }); return; }
    if (!leads || leads.length === 0) {
      res.json({ enrolled: 0, total: 0, message: "No leads with emails found in this list" });
      return;
    }

    const validLeads = leads.filter((l) => isValidEmail(l.email));
    const skippedInvalidEmail = leads.length - validLeads.length;

    if (validLeads.length === 0) {
      res.json({ enrolled: 0, total: leads.length, message: "No leads with a valid email found in this list", skippedInvalidEmail });
      return;
    }

    const result = await importAndEnrollLeads(validLeads as EnrollLead[], seqId, apiKey, var_map ?? {});

    if (skippedInvalidEmail > 0) {
      logger.warn(`Reply.io enroll-list seq ${seqId}: skipped ${skippedInvalidEmail} lead(s) with invalid email format`);
    }

    res.json({ enrolled: result.enrolled, total: result.total, skippedInvalidEmail });
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

// ─────────────────────────────────────────────────────────────
//  EMAIL INBOX — list threads (email channel only)
// ─────────────────────────────────────────────────────────────

interface ReplyV3Thread {
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

router.get("/replyio/inbox/threads", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }

  const sequenceId = req.query.sequenceId as string | undefined;

  try {
    const data = await replyFetch<{ items: ReplyV3Thread[]; hasMore: boolean }>(
      "GET", "/inbox/threads?top=1000", undefined, apiKey
    );

    let threads = (data.items ?? []).filter((t) => t.channel === "email");

    if (sequenceId) {
      threads = threads.filter((t) => t.sequence?.id === Number(sequenceId));
    }

    const normalised = threads.map((t) => ({
      threadId:         t.id,
      contactId:        t.contact.id,
      name:             t.contact.fullName ?? t.contact.email ?? `Thread ${t.id}`,
      email:            t.contact.email ?? null,
      sequenceId:       t.sequence?.id ?? null,
      sequenceName:     t.sequence?.name ?? null,
      subject:          t.subject ?? null,
      lastMessage:      t.bodyPreview ?? null,
      lastMessageAt:    t.lastActivityDate,
      isRead:           t.isRead,
      unreadCount:      t.isRead ? 0 : 1,
      category:         t.category?.name ?? null,
      hasMeetingIntent: t.hasMeetingIntent,
      status:           t.status?.state ?? null,
    }));

    res.json({ threads: normalised });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Reply.io inbox threads error: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// ─────────────────────────────────────────────────────────────
//  EMAIL INBOX — messages in a thread
// ─────────────────────────────────────────────────────────────

router.get("/replyio/inbox/threads/:threadId/messages", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
        status: { state: string; code: string | null } | null;
        subject?: string | null;
        fromAddress?: string | null;
        to?: string[] | null;
      }>;
      hasMore: boolean;
    }>("GET", `/inbox/threads/${threadId}/messages?top=200`, undefined, apiKey);

    const messages = (raw.items ?? []).map((m, i) => ({
      id:         i,
      text:       cleanEmailBody(m.body ?? ""),
      isOutgoing: m.isOutbound,
      sentAt:     m.date,
      fromName:   m.fromName ?? null,
      subject:    m.subject ?? null,
      fromEmail:  m.fromAddress ?? null,
      to:         m.to ?? [],
      channel:    m.channel,
    }));

    res.json({ messages });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Reply.io thread messages error for ${threadId}: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// ─────────────────────────────────────────────────────────────
//  EMAIL INBOX — send reply in a thread
// ─────────────────────────────────────────────────────────────

router.post("/replyio/inbox/threads/:threadId/reply", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }

  const { threadId } = req.params;
  const { message } = req.body as { message: string };

  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

  try {
    await replyFetch(
      "POST",
      `/inbox/threads/${threadId}/messages`,
      { channel: "email", message: message.trim() },
      apiKey
    );
    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Reply.io inbox reply error for thread ${threadId}: ${msg}`);
    res.status(500).json({ error: msg });
  }
});


router.patch("/replyio/sequences/:id/settings", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }

  const seqId = Number(req.params.id);
  const { emailsCountPerDay } = req.body as { emailsCountPerDay?: number };

  if (!emailsCountPerDay || emailsCountPerDay < 1) {
    res.status(400).json({ error: "emailsCountPerDay must be a positive integer" });
    return;
  }

  try {
    // First, GET the current sequence to read existing settings (all required fields must be sent back)
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

    // PATCH with merged settings — all 7 required fields must be present
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
    logger.error(`Reply.io update sequence settings error for ${seqId}: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

export default router;