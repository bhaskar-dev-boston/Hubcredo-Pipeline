// ============================================================
// replyioService.ts  –  Reply.io API v3 integration
// Place at: artifacts/api-server/src/lib/replyioService.ts
// ============================================================

import { logger } from "./logger";

const REPLY_BASE_URL = "https://api.reply.io/v3";

// ── Helpers ──────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.REPLY_IO_API_KEY;
  if (!key) throw new Error("REPLY_IO_API_KEY is not set in environment variables");
  return key;
}

async function replyFetch<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const apiKey = getApiKey();
  const url = `${REPLY_BASE_URL}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const errorText = await res.text();
    logger.error(`Reply.io API error [${method} ${path}]: ${res.status} – ${errorText}`);
    throw new Error(`Reply.io API error ${res.status}: ${errorText}`);
  }

  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────

export interface ReplyContact {
  id?: number;
  email: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  companyName?: string;
  linkedInProfile?: string;
  phone?: string;
  country?: string;
  customFields?: { key: string; value: string }[];
}

export interface ReplySequence {
  id: number;
  name: string;
  status: "active" | "paused" | "stopped";
  created: string;
  isArchived: boolean;
  health: string;
}

export interface ReplySequenceContact {
  email: string;
  firstName: string;
  lastName: string;
  status: {
    status: string;
    replied: boolean;
    delivered: boolean;
    opened: boolean;
    clicked: boolean;
    bounced: boolean;
  };
  currentStep?: {
    stepId: number;
    displayStepNumber: string;
    stepNumber: number;
  };
  addedAt: string;
}

export interface ReplyStats {
  sequenceId: number;
  total: number;
  active: number;
  replied: number;
  opened: number;
  clicked: number;
  bounced: number;
}

// ── Contact Methods ───────────────────────────────────────────

export async function createContact(contact: ReplyContact): Promise<ReplyContact> {
  return replyFetch<ReplyContact>("POST", "/contacts", contact);
}

export async function getContactByEmail(email: string): Promise<ReplyContact | null> {
  try {
    const res = await replyFetch<{ items: ReplyContact[] }>(
      "GET",
      `/contacts?email=${encodeURIComponent(email)}`
    );
    return res.items?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function upsertContact(contact: ReplyContact): Promise<ReplyContact> {
  const existing = await getContactByEmail(contact.email);
  if (existing?.id) {
    logger.info(`Reply.io: Contact already exists (${contact.email}), id=${existing.id}`);
    return existing;
  }
  const created = await createContact(contact);
  logger.info(`Reply.io: Created contact ${contact.email}`);
  return created;
}

// ── Sequence Methods ──────────────────────────────────────────

export async function listSequences(): Promise<ReplySequence[]> {
  const res = await replyFetch<{ items: ReplySequence[] }>("GET", "/sequences");
  return res.items ?? [];
}

export async function addContactToSequence(
  sequenceId: number,
  contactId: number
): Promise<void> {
  await replyFetch("POST", `/sequences/${sequenceId}/contacts`, { contactId });
  logger.info(`Reply.io: Added contact ${contactId} to sequence ${sequenceId}`);
}

export async function enrollLeadInSequence(
  contact: ReplyContact,
  sequenceId: number
): Promise<{ contact: ReplyContact; enrolled: boolean }> {
  const created = await upsertContact(contact);
  if (!created.id) throw new Error("Failed to create/find contact in Reply.io");
  await addContactToSequence(sequenceId, created.id);
  return { contact: created, enrolled: true };
}

export async function listContactsInSequence(
  sequenceId: number
): Promise<ReplySequenceContact[]> {
  const res = await replyFetch<{ items: ReplySequenceContact[] }>(
    "GET",
    `/sequences/${sequenceId}/contacts/extended`
  );
  return res.items ?? [];
}

export async function pauseContactInSequence(
  sequenceId: number,
  contactId: number
): Promise<void> {
  await replyFetch("POST", `/sequences/${sequenceId}/contacts/${contactId}/pause`);
}

// ── Statistics Methods ────────────────────────────────────────

export async function getSequenceStats(sequenceId: number): Promise<ReplyStats> {
  return replyFetch<ReplyStats>("GET", `/statistics/sequences/${sequenceId}`);
}

// ── Webhook Methods ───────────────────────────────────────────

export type WebhookEvent =
  | "email_replied"
  | "email_opened"
  | "email_clicked"
  | "email_bounced"
  | "contact_finished";

export async function registerWebhook(
  event: WebhookEvent,
  callbackUrl: string
): Promise<{ id: number }> {
  return replyFetch<{ id: number }>("POST", "/webhooks", {
    eventType: event,
    url: callbackUrl,
    scope: "personal",
    enabled: true,
    payloadConfig: {
      includeEmailUrl: true,
      includeEmailText: true,
      includeProspectCustomFields: true,
    },
  });
}

export async function listWebhooks(): Promise<unknown[]> {
  const res = await replyFetch<{ items: unknown[] }>("GET", "/webhooks");
  return res.items ?? [];
}

// ── Validation ────────────────────────────────────────────────

/**
 * Test API key validity.
 * Reply.io v3 has no /whoami endpoint — we use /sequences (limit=1) as a
 * lightweight health-check instead. A 200 response means the key is valid.
 */
export async function validateApiKey(): Promise<{
  valid: boolean;
  user?: { email: string; name: string };
  error?: string;
}> {
  const key = process.env.REPLY_IO_API_KEY;
  if (!key) {
    return { valid: false, error: "REPLY_IO_API_KEY is not set" };
  }

  try {
    await replyFetch<unknown>("GET", "/sequences?page=1&limit=1");
    return { valid: true, user: { email: "Reply.io", name: "Connected" } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Reply.io validateApiKey failed:", msg);
    return { valid: false, error: msg };
  }
}