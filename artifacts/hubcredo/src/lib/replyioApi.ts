// ============================================================
// replyioApi.ts  –  Frontend API client for Reply.io routes
// Place at: artifacts/hubcredo/src/lib/replyioApi.ts
//   (drop it in src/lib/ alongside auth.ts)
// ============================================================

import { getToken } from "@/lib/auth";

const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/replyio`;

async function apiFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `Request failed: ${res.status}`);
  return data as T;
}

// ── Types ─────────────────────────────────────────────────────

export interface ReplySequence {
  id: number;
  name: string;
  status: "active" | "paused" | "stopped";
  created: string;
  isArchived: boolean;
  health: string;
}

export interface ReplySequenceContact {
  id?: number;
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

export interface EnrollContactPayload {
  contact: {
    email: string;
    firstName?: string;
    lastName?: string;
    title?: string;
    company?: string;
    linkedInProfile?: string;
    phone?: string;
    country?: string;
  };
  sequenceId: number;
}

// ── API Methods ───────────────────────────────────────────────

export const replyioApi = {
  /** Test whether the API key is configured and valid */
  validate: () =>
    apiFetch<{ valid: boolean; user?: { email: string; name: string }; error?: string }>(
      "GET",
      "/validate"
    ),

  /** Fetch all sequences in the Reply.io account */
  listSequences: () =>
    apiFetch<{ sequences: ReplySequence[] }>("GET", "/sequences"),

  /** Fetch contacts enrolled in a specific sequence */
  listContacts: (sequenceId: number) =>
    apiFetch<{ contacts: ReplySequenceContact[] }>(
      "GET",
      `/sequences/${sequenceId}/contacts`
    ),

  /** Fetch stats for a specific sequence */
  getStats: (sequenceId: number) =>
    apiFetch<ReplyStats>("GET", `/sequences/${sequenceId}/stats`),

  /** Create or find a contact (upsert) */
  upsertContact: (contact: EnrollContactPayload["contact"]) =>
    apiFetch<{ contact: { id: number; email: string } }>("POST", "/contacts", contact),

  /** Create contact + enroll them in a sequence in one call */
  enroll: (payload: EnrollContactPayload) =>
    apiFetch<{ contact: { id: number; email: string }; enrolled: boolean }>(
      "POST",
      "/enroll",
      payload
    ),

  /** Pause a contact inside a sequence */
  pauseContact: (sequenceId: number, contactId: number) =>
    apiFetch<{ success: boolean }>(
      "POST",
      `/sequences/${sequenceId}/contacts/${contactId}/pause`
    ),

  /** List registered webhooks */
  listWebhooks: () => apiFetch<{ webhooks: unknown[] }>("GET", "/webhooks"),

  /** Register a new webhook */
  registerWebhook: (event: string, callbackUrl: string) =>
    apiFetch<{ id: number }>("POST", "/webhooks", { event, callbackUrl }),
};