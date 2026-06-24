// src/lib/hubspotService.ts
// ─────────────────────────────────────────────────────────────────────────────
// HubCredo → HubSpot service layer
// Mirrors the shape of attioService.ts so crm-hubspot.ts routes map 1:1
// onto the same patterns as crm.ts.
//
// Auth: process.env.HUBSPOT_API_KEY — a Private App access token (NOT the
// legacy Developer API Key, NOT the legacy hapikey). Generate this in
// HubSpot under Settings → Integrations → Private Apps → Create a private app,
// then grant the scopes listed in HUBSPOT_SETUP.md.
//
// Rate limits (Private App / standard tier): 100 requests / 10 sec burst,
// ~150 req/10sec sustained depending on subscription tier. We retry on 429
// with Retry-After, same backoff strategy as attioService.ts.
//
// Versioning: HubSpot moved to date-based versioning (2026-03). We use the
// legacy-but-still-supported /crm/v3/ paths throughout, since v3 continues
// to work during the deprecation window and matches the vast majority of
// community examples and tooling. Swap BASE_CRM if you want to pin to
// /crm/objects/2026-03/ instead — the object/property shapes are identical.
//
// KEY GOTCHAS baked into this file (see HubSpot community threads):
//  1. Companies have NO enforced-unique idProperty out of the box. "domain"
//     is documented as the "primary identifier" but HubSpot does NOT enforce
//     uniqueness on it, so blind batch-upsert-by-domain can silently attach
//     to the wrong record. We search-by-domain first, then create or PATCH
//     by resolved ID — never trust batch upsert blindly for companies.
//  2. Contact batch upsert by email works but has reported 409-vs-207
//     inconsistencies on conflict. For the critical single-lead sync path we
//     use single-record endpoints (search by email → create or patch) for
//     reliability. Batch upsert is offered separately for bulk operations
//     where partial-failure tolerance is acceptable.
//  3. Note/Task → Company associations are unreliable when set inline at
//     creation time (community-reported: "one or more associations are not
//     valid", or association silently ignored). Note/Task → Contact
//     associations work fine inline. We always create first, then associate
//     via a separate PUT call — this works for both contacts and companies.
//  4. Associations require numeric HubSpot object IDs, never email or domain.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_CRM = "https://api.hubapi.com/crm/v3";

// ─── Known HubSpot default association type IDs (HUBSPOT_DEFINED category) ──
// These are stable across all HubSpot accounts — confirmed via HubSpot docs
// and community threads. If you ever need a custom/labeled association,
// fetch it dynamically via GET /crm/v4/associations/{from}/{to}/labels.
export const AssociationTypeId = {
  NOTE_TO_CONTACT: 202,
  CONTACT_TO_NOTE: 201,
  NOTE_TO_COMPANY: 190,
  COMPANY_TO_NOTE: 189,
  TASK_TO_CONTACT: 204,
  CONTACT_TO_TASK: 203,
  TASK_TO_COMPANY: 192,
  COMPANY_TO_TASK: 191,
  TASK_TO_DEAL: 216,
  DEAL_TO_TASK: 215,
  CONTACT_TO_COMPANY: 279, // primary company association (unlabeled default also works)
  CONTACT_TO_DEAL: 4,
  DEAL_TO_CONTACT: 3,
  COMPANY_TO_DEAL: 6,
  DEAL_TO_COMPANY: 5,
} as const;

// ─── Core fetch wrapper with 429 retry ───────────────────────────────────────

export class HubSpotError extends Error {
  constructor(message: string, public status: number, public body?: unknown) {
    super(message);
    this.name = "HubSpotError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function req<T = any>(
  apiKey: string,
  path: string,
  options: RequestInit = {},
  retries = 4
): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE_CRM}${path}`;
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });

    if (res.status === 429) {
      const wait = parseInt(res.headers.get("Retry-After") ?? "1", 10) * 1000;
      await sleep(Math.max(wait, 500 * Math.pow(2, i)));
      continue;
    }

    if (!res.ok) {
      let body: any;
      let msg = `HubSpot ${res.status}`;
      try {
        body = await res.json();
        msg = body?.message ?? msg;
      } catch {
        /* non-JSON error body */
      }
      throw new HubSpotError(msg, res.status, body);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }
  throw new HubSpotError("Rate limit — retries exhausted", 429);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HSObject<P = Record<string, any>> {
  id: string;
  properties: P;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  associations?: Record<string, { results: Array<{ id: string; type: string }> }>;
}

export interface HSSearchResult<P = Record<string, any>> {
  total: number;
  results: HSObject<P>[];
  paging?: { next?: { after: string; link?: string } };
}

export interface HSFilter {
  propertyName: string;
  operator:
    | "EQ" | "NEQ" | "LT" | "LTE" | "GT" | "GTE"
    | "BETWEEN" | "IN" | "NOT_IN"
    | "HAS_PROPERTY" | "NOT_HAS_PROPERTY"
    | "CONTAINS_TOKEN" | "NOT_CONTAINS_TOKEN";
  value?: string;
  values?: string[];
}

export interface HSSearchOptions {
  filterGroups?: Array<{ filters: HSFilter[] }>; // OR'd groups, AND'd within a group
  query?: string;
  sorts?: string[]; // e.g. ["-createdate"] for desc, ["lastname"] for asc
  properties?: string[];
  limit?: number;
  after?: string;
}

// ─── Search helper (shared by contacts/companies/deals) ─────────────────────

async function search<P = Record<string, any>>(
  apiKey: string,
  objectType: string,
  opts: HSSearchOptions = {}
): Promise<HSSearchResult<P>> {
  const body: Record<string, any> = {
    limit: opts.limit ?? 25,
  };
  if (opts.filterGroups?.length) body.filterGroups = opts.filterGroups;
  if (opts.query) body.query = opts.query;
  if (opts.sorts?.length) body.sorts = opts.sorts;
  if (opts.properties?.length) body.properties = opts.properties;
  if (opts.after) body.after = opts.after;

  return req<HSSearchResult<P>>(apiKey, `/objects/${objectType}/search`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Build a single-filter filterGroups array — the common case. */
export function eqFilter(propertyName: string, value: string): HSSearchOptions["filterGroups"] {
  return [{ filters: [{ propertyName, operator: "EQ", value }] }];
}

// ─── Generic association helper ──────────────────────────────────────────────
// Used after creating notes/tasks, since inline associations to companies are
// unreliable per HubSpot community reports. Works for any object pair.

async function associate(
  apiKey: string,
  fromType: string,
  fromId: string,
  toType: string,
  toId: string,
  associationTypeId: number
): Promise<void> {
  await req(
    apiKey,
    `/objects/${fromType}/${fromId}/associations/${toType}/${toId}/${associationTypeId}`,
    { method: "PUT" }
  );
}

async function removeAssociation(
  apiKey: string,
  fromType: string,
  fromId: string,
  toType: string,
  toId: string,
  associationTypeId: number
): Promise<void> {
  await req(
    apiKey,
    `/objects/${fromType}/${fromId}/associations/${toType}/${toId}/${associationTypeId}`,
    { method: "DELETE" }
  );
}

// ─── Account / Token info ────────────────────────────────────────────────────
// Private app tokens don't have a "/self" equivalent like Attio. We use the
// access-tokens introspection endpoint (oauth) which also works for private
// app tokens to confirm the token is valid and fetch the portal (hub) ID.

export const Account = {
  async info(apiKey: string): Promise<{ hub_id: string; app_id?: string; scopes: string[] }> {
    // /account-info/v3/details works for Private App tokens AND Service Keys
    // (unlike oauth/v1/access-tokens which only works for OAuth tokens)
    const d = await req<any>(
      apiKey,
      `https://api.hubapi.com/account-info/v3/details`,
      {}
    );
    return {
      hub_id: String(d.portalId),
      scopes: [],  // account-info endpoint doesn't return scopes — not needed for connection check
    };
  },
};
// ─── Contacts ─────────────────────────────────────────────────────────────────

export interface ContactFields {
  first_name?: string;
  last_name?: string;
  email?: string;
  job_title?: string;
  linkedin?: string;
  phone?: string;
  company_record_id?: string; // HubSpot company object ID to associate
  custom?: Record<string, string>;
}

function contactPropertiesFromFields(fields: ContactFields): Record<string, string> {
  const properties: Record<string, string> = {};
  if (fields.email) properties.email = fields.email;
  if (fields.first_name) properties.firstname = fields.first_name;
  if (fields.last_name) properties.lastname = fields.last_name;
  if (fields.job_title) properties.jobtitle = fields.job_title;
  // HubSpot's default contact property for LinkedIn is a custom property in
  // most portals (no universal built-in slug) — we write to a conventional
  // custom property name. Create this property once via Attributes.create
  // (see bottom) if it doesn't already exist in the portal.
  if (fields.linkedin) properties.hubcredo_linkedin_url = fields.linkedin;
  if (fields.phone) properties.phone = fields.phone;
  if (fields.custom) Object.assign(properties, fields.custom);
  return properties;
}

export const Contacts = {
  /**
   * Upsert by email: search first, then PATCH if found or POST if not.
   * Deliberately avoids the batch/upsert endpoint for single-record sync —
   * community reports show inconsistent 409 vs 207 behavior on conflicts.
   */
  async upsert(apiKey: string, fields: ContactFields): Promise<{ record_id: string }> {
    if (!fields.email) {
      throw new HubSpotError("Cannot sync: lead has no email address (required for HubSpot matching)", 400);
    }
    const properties = contactPropertiesFromFields(fields);

    const existing = await search<{ email: string }>(apiKey, "contacts", {
      filterGroups: eqFilter("email", fields.email),
      properties: ["email"],
      limit: 1,
    });

    let recordId: string;
    if (existing.results.length > 0) {
      recordId = existing.results[0].id;
      await req(apiKey, `/objects/contacts/${recordId}`, {
        method: "PATCH",
        body: JSON.stringify({ properties }),
      });
    } else {
      const created = await req<HSObject>(apiKey, `/objects/contacts`, {
        method: "POST",
        body: JSON.stringify({ properties }),
      });
      recordId = created.id;
    }

    if (fields.company_record_id) {
      try {
        await associate(apiKey, "contacts", recordId, "companies", fields.company_record_id, AssociationTypeId.CONTACT_TO_COMPANY);
      } catch {
        // Some portals require the unlabeled default association instead of
        // a specific typeId — fall back to HubSpot's default association.
        try {
          await req(apiKey, `/objects/contact/${recordId}/associations/default/company/${fields.company_record_id}`, { method: "PUT" });
        } catch { /* don't fail the whole sync over an association hiccup */ }
      }
    }

    return { record_id: recordId };
  },

  async get(apiKey: string, recordId: string, properties?: string[]): Promise<HSObject> {
    const qs = properties?.length ? `?properties=${properties.join(",")}` : "";
    return req(apiKey, `/objects/contacts/${recordId}${qs}`);
  },

  async getByEmail(apiKey: string, email: string): Promise<HSObject | null> {
    const result = await search(apiKey, "contacts", { filterGroups: eqFilter("email", email), limit: 1 });
    return result.results[0] ?? null;
  },

  async update(apiKey: string, recordId: string, properties: Record<string, string>): Promise<HSObject> {
    return req(apiKey, `/objects/contacts/${recordId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties }),
    });
  },

  async delete(apiKey: string, recordId: string): Promise<void> {
    await req(apiKey, `/objects/contacts/${recordId}`, { method: "DELETE" });
  },

  async query(
    apiKey: string,
    opts: { q?: string; limit?: number; after?: string } = {}
  ): Promise<HSSearchResult> {
    if (opts.q?.trim()) {
      const term = opts.q.trim();
      if (term.includes("@")) {
        return search(apiKey, "contacts", { filterGroups: eqFilter("email", term), limit: opts.limit ?? 25, after: opts.after });
      }
      // HubSpot's free-text `query` searches default searchable props
      // (firstname, lastname, email, company, phone, etc.)
      return search(apiKey, "contacts", { query: term, limit: opts.limit ?? 25, after: opts.after });
    }
    // No query — list endpoint (GET) is cheaper than search for unfiltered listing
    const qs = new URLSearchParams({ limit: String(opts.limit ?? 25) });
    if (opts.after) qs.set("after", opts.after);
    return req(apiKey, `/objects/contacts?${qs}`);
  },

  /** Bulk upsert via native batch endpoint — acceptable partial-failure risk for bulk ops only. */
  async batchUpsert(
    apiKey: string,
    items: Array<{ email: string; properties: Record<string, string> }>
  ): Promise<any> {
    return req(apiKey, `/objects/contacts/batch/upsert`, {
      method: "POST",
      body: JSON.stringify({
        inputs: items.map((it) => ({ id: it.email, idProperty: "email", properties: it.properties })),
      }),
    });
  },
};

// ─── Companies ────────────────────────────────────────────────────────────────

export const Companies = {
  /**
   * Upsert by domain. HubSpot does NOT enforce uniqueness on "domain", so we
   * search-then-create/patch rather than trusting batch/upsert with domain
   * as idProperty (community-confirmed footgun — see file header).
   */
  async upsert(apiKey: string, fields: { name?: string; domain?: string; custom?: Record<string, string> }): Promise<{ record_id: string }> {
    if (!fields.domain) {
      throw new HubSpotError("company_domain required for HubSpot matching", 400);
    }
    const properties: Record<string, string> = { domain: fields.domain };
    if (fields.name) properties.name = fields.name;
    if (fields.custom) Object.assign(properties, fields.custom);

    const existing = await search(apiKey, "companies", {
      filterGroups: eqFilter("domain", fields.domain),
      properties: ["domain"],
      limit: 1,
    });

    if (existing.results.length > 0) {
      const recordId = existing.results[0].id;
      await req(apiKey, `/objects/companies/${recordId}`, {
        method: "PATCH",
        body: JSON.stringify({ properties }),
      });
      return { record_id: recordId };
    }

    const created = await req<HSObject>(apiKey, `/objects/companies`, {
      method: "POST",
      body: JSON.stringify({ properties }),
    });
    return { record_id: created.id };
  },

  async get(apiKey: string, recordId: string): Promise<HSObject> {
    return req(apiKey, `/objects/companies/${recordId}`);
  },

  async query(apiKey: string, opts: { limit?: number; after?: string } = {}): Promise<HSSearchResult> {
    const qs = new URLSearchParams({ limit: String(opts.limit ?? 25) });
    if (opts.after) qs.set("after", opts.after);
    return req(apiKey, `/objects/companies?${qs}`);
  },
};

// ─── Deals (Attio "Lists" rough equivalent for pipeline tracking) ────────────

export const Deals = {
  async create(
    apiKey: string,
    fields: { dealname: string; pipeline?: string; dealstage?: string; amount?: string; custom?: Record<string, string> }
  ): Promise<HSObject> {
    const properties: Record<string, string> = { dealname: fields.dealname };
    if (fields.pipeline) properties.pipeline = fields.pipeline;
    if (fields.dealstage) properties.dealstage = fields.dealstage;
    if (fields.amount) properties.amount = fields.amount;
    if (fields.custom) Object.assign(properties, fields.custom);
    return req(apiKey, `/objects/deals`, { method: "POST", body: JSON.stringify({ properties }) });
  },

  async get(apiKey: string, recordId: string): Promise<HSObject> {
    return req(apiKey, `/objects/deals/${recordId}`);
  },

  async update(apiKey: string, recordId: string, properties: Record<string, string>): Promise<HSObject> {
    return req(apiKey, `/objects/deals/${recordId}`, { method: "PATCH", body: JSON.stringify({ properties }) });
  },

  async delete(apiKey: string, recordId: string): Promise<void> {
    await req(apiKey, `/objects/deals/${recordId}`, { method: "DELETE" });
  },

  async query(apiKey: string, opts: { limit?: number; after?: string } = {}): Promise<HSSearchResult> {
    const qs = new URLSearchParams({ limit: String(opts.limit ?? 25) });
    if (opts.after) qs.set("after", opts.after);
    return req(apiKey, `/objects/deals?${qs}`);
  },

  async associateContact(apiKey: string, dealId: string, contactId: string): Promise<void> {
    await associate(apiKey, "deals", dealId, "contacts", contactId, AssociationTypeId.DEAL_TO_CONTACT);
  },

  async associateCompany(apiKey: string, dealId: string, companyId: string): Promise<void> {
    await associate(apiKey, "deals", dealId, "companies", companyId, AssociationTypeId.DEAL_TO_COMPANY);
  },

  /** Pipeline + stage metadata — needed to populate a "choose pipeline/stage" UI. */
  async pipelines(apiKey: string): Promise<any[]> {
    const d = await req<any>(apiKey, `/pipelines/deals`);
    return d.results ?? [];
  },
};

// ─── Lists (static contact lists — closest HubSpot equivalent to Attio Lists) ─
// HubSpot Lists API v3 lives outside /crm/v3 — base path is /crm/v3/lists
// (introduced as a replacement for the legacy /contacts/v1/lists endpoints).

const LISTS_BASE = "https://api.hubapi.com/crm/v3/lists";

export const Lists = {
  async list(apiKey: string): Promise<any[]> {
    const d = await req<any>(apiKey, LISTS_BASE.replace(BASE_CRM, ""), {});
    return d.lists ?? d.results ?? [];
  },

  async create(apiKey: string, name: string, objectTypeId: "0-1" | "0-2" = "0-1"): Promise<any> {
    // 0-1 = contacts, 0-2 = companies (HubSpot standard object type IDs)
    return req(apiKey, LISTS_BASE.replace(BASE_CRM, ""), {
      method: "POST",
      body: JSON.stringify({ name, objectTypeId, processingType: "MANUAL" }),
    });
  },

  async addMembers(apiKey: string, listId: string, recordIds: string[]): Promise<any> {
    return req(apiKey, `${LISTS_BASE.replace(BASE_CRM, "")}/${listId}/memberships/add`, {
      method: "PUT",
      body: JSON.stringify(recordIds),
    });
  },

  async removeMembers(apiKey: string, listId: string, recordIds: string[]): Promise<any> {
    return req(apiKey, `${LISTS_BASE.replace(BASE_CRM, "")}/${listId}/memberships/remove`, {
      method: "PUT",
      body: JSON.stringify(recordIds),
    });
  },

  async members(apiKey: string, listId: string, opts: { limit?: number; after?: string } = {}): Promise<any> {
    const qs = new URLSearchParams({ limit: String(opts.limit ?? 50) });
    if (opts.after) qs.set("after", opts.after);
    return req(apiKey, `${LISTS_BASE.replace(BASE_CRM, "")}/${listId}/memberships?${qs}`, {});
  },
};

// ─── Notes ────────────────────────────────────────────────────────────────────
// Always create-then-associate (see file header gotcha #3) — never rely on
// inline `associations` in the create body for company associations.

export const Notes = {
  async create(
    apiKey: string,
    opts: {
      content: string;
      timestamp?: string; // ISO 8601, defaults to now
      parentObject: "contacts" | "companies" | "deals";
      parentRecordId: string;
      ownerId?: string;
    }
  ): Promise<HSObject> {
    const properties: Record<string, string> = {
      hs_note_body: opts.content,
      hs_timestamp: opts.timestamp ?? new Date().toISOString(),
    };
    if (opts.ownerId) properties.hubspot_owner_id = opts.ownerId;

    const note = await req<HSObject>(apiKey, `/objects/notes`, {
      method: "POST",
      body: JSON.stringify({ properties }),
    });

    const typeId =
      opts.parentObject === "contacts" ? AssociationTypeId.NOTE_TO_CONTACT :
      opts.parentObject === "companies" ? AssociationTypeId.NOTE_TO_COMPANY :
      undefined; // deals: use default association below

    try {
      if (typeId) {
        await associate(apiKey, "notes", note.id, opts.parentObject, opts.parentRecordId, typeId);
      } else {
        await req(apiKey, `/objects/notes/${note.id}/associations/default/${opts.parentObject}/${opts.parentRecordId}`, { method: "PUT" });
      }
    } catch {
      // Note exists even if association fails — don't throw, but the caller
      // should know it's "orphaned". Surface via return value if needed.
    }

    return note;
  },

  async list(apiKey: string, parentObject: string, parentRecordId: string): Promise<HSObject[]> {
    // List notes associated with a record by reading the record with the
    // notes association expanded, then batch-reading those note IDs.
    const record = await req<HSObject>(apiKey, `/objects/${parentObject}/${parentRecordId}?associations=notes`);
    const noteIds = record.associations?.notes?.results.map((r) => r.id) ?? [];
    if (noteIds.length === 0) return [];
    const batch = await req<{ results: HSObject[] }>(apiKey, `/objects/notes/batch/read`, {
      method: "POST",
      body: JSON.stringify({ properties: ["hs_note_body", "hs_timestamp"], inputs: noteIds.map((id) => ({ id })) }),
    });
    return batch.results;
  },

  async delete(apiKey: string, noteId: string): Promise<void> {
    await req(apiKey, `/objects/notes/${noteId}`, { method: "DELETE" });
  },
};

// ─── Tasks ────────────────────────────────────────────────────────────────────

export const Tasks = {
  async create(
    apiKey: string,
    opts: {
      content: string; // task body
      subject?: string;
      deadlineAt?: string; // ISO 8601 — maps to hs_timestamp (HubSpot has no separate due-date field)
      ownerId?: string;
      priority?: "LOW" | "MEDIUM" | "HIGH";
      status?: "NOT_STARTED" | "IN_PROGRESS" | "WAITING" | "COMPLETED" | "DEFERRED";
      taskType?: "CALL" | "EMAIL" | "TODO";
      linkedRecordObject?: "contacts" | "companies" | "deals";
      linkedRecordId?: string;
    }
  ): Promise<HSObject> {
    const properties: Record<string, string> = {
      hs_task_body: opts.content,
      hs_timestamp: opts.deadlineAt ?? new Date().toISOString(),
      hs_task_status: opts.status ?? "NOT_STARTED",
      hs_task_priority: opts.priority ?? "MEDIUM",
      hs_task_type: opts.taskType ?? "TODO",
    };
    if (opts.subject) properties.hs_task_subject = opts.subject;
    if (opts.ownerId) properties.hubspot_owner_id = opts.ownerId;

    const task = await req<HSObject>(apiKey, `/objects/tasks`, {
      method: "POST",
      body: JSON.stringify({ properties }),
    });

    if (opts.linkedRecordId && opts.linkedRecordObject) {
      const typeId =
        opts.linkedRecordObject === "contacts" ? AssociationTypeId.TASK_TO_CONTACT :
        opts.linkedRecordObject === "companies" ? AssociationTypeId.TASK_TO_COMPANY :
        AssociationTypeId.TASK_TO_DEAL;
      try {
        await associate(apiKey, "tasks", task.id, opts.linkedRecordObject, opts.linkedRecordId, typeId);
      } catch { /* see Notes.create rationale */ }
    }

    return task;
  },

  async list(
    apiKey: string,
    opts: { status?: string; linkedRecordId?: string; linkedRecordObject?: string; limit?: number } = {}
  ): Promise<HSObject[]> {
    if (opts.linkedRecordId && opts.linkedRecordObject) {
      const record = await req<HSObject>(apiKey, `/objects/${opts.linkedRecordObject}/${opts.linkedRecordId}?associations=tasks`);
      const taskIds = record.associations?.tasks?.results.map((r) => r.id) ?? [];
      if (taskIds.length === 0) return [];
      const batch = await req<{ results: HSObject[] }>(apiKey, `/objects/tasks/batch/read`, {
        method: "POST",
        body: JSON.stringify({
          properties: ["hs_task_body", "hs_task_status", "hs_timestamp", "hs_task_subject"],
          inputs: taskIds.map((id) => ({ id })),
        }),
      });
      let results = batch.results;
      if (opts.status) results = results.filter((t) => t.properties.hs_task_status === opts.status);
      return results;
    }
    const qs = new URLSearchParams({ limit: String(opts.limit ?? 50) });
    const d = await req<HSSearchResult>(apiKey, `/objects/tasks?${qs}`);
    return d.results;
  },

  async complete(apiKey: string, taskId: string): Promise<void> {
    await req(apiKey, `/objects/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: { hs_task_status: "COMPLETED" } }),
    });
  },

  async delete(apiKey: string, taskId: string): Promise<void> {
    await req(apiKey, `/objects/tasks/${taskId}`, { method: "DELETE" });
  },
};

// ─── Custom Properties ("Attributes" in Attio parlance) ──────────────────────

export const Properties = {
  async list(apiKey: string, objectType: string): Promise<any[]> {
    const d = await req<any>(apiKey, `/properties/${objectType}`);
    return d.results ?? [];
  },

  async create(
    apiKey: string,
    objectType: string,
    opts: {
      name: string; // api slug — lowercase, underscores
      label: string;
      type: "string" | "number" | "bool" | "enumeration" | "date" | "datetime";
      fieldType: "text" | "number" | "select" | "checkbox" | "date" | "textarea";
      groupName?: string;
      options?: Array<{ label: string; value: string }>;
    }
  ): Promise<any> {
    return req(apiKey, `/properties/${objectType}`, {
      method: "POST",
      body: JSON.stringify({
        name: opts.name,
        label: opts.label,
        type: opts.type,
        fieldType: opts.fieldType,
        groupName: opts.groupName ?? `${objectType}information`,
        options: opts.options,
      }),
    });
  },

  async archive(apiKey: string, objectType: string, propertyName: string): Promise<void> {
    await req(apiKey, `/properties/${objectType}/${propertyName}`, { method: "DELETE" });
  },
};

// ─── Webhooks (App-level subscriptions — Developer Account, not Private App) ─
// IMPORTANT: Webhook *subscriptions* are configured at the HubSpot Developer
// Account / App level (Settings > Webhooks in the app's dev account), not
// via a Private App token. A Private App token CANNOT manage webhook
// subscriptions — that requires the app's Developer API Key or an app-scoped
// OAuth flow tied to the public/connected app. We expose this service for
// completeness (matching attioService.ts 1:1) but it will only function if
// HUBSPOT_DEVELOPER_API_KEY is also configured and the calling app has a
// registered Developer Account App ID.

export const Webhooks = {
  async getSettings(devApiKey: string, appId: string): Promise<any> {
    return req(devApiKey, `https://api.hubapi.com/webhooks/v3/${appId}/settings`, {});
  },

  async setSettings(devApiKey: string, appId: string, targetUrl: string, maxConcurrentRequests = 10): Promise<any> {
    return req(devApiKey, `https://api.hubapi.com/webhooks/v3/${appId}/settings`, {
      method: "PUT",
      body: JSON.stringify({ targetUrl, maxConcurrentRequests }),
    });
  },

  async subscribe(
    devApiKey: string,
    appId: string,
    eventType:
      | "contact.creation" | "contact.propertyChange" | "contact.deletion"
      | "company.creation" | "company.propertyChange" | "company.deletion"
      | "deal.creation" | "deal.propertyChange" | "deal.deletion",
    propertyName?: string
  ): Promise<any> {
    return req(devApiKey, `https://api.hubapi.com/webhooks/v3/${appId}/subscriptions`, {
      method: "POST",
      body: JSON.stringify({ eventType, propertyName, active: true }),
    });
  },

  async list(devApiKey: string, appId: string): Promise<any[]> {
    const d = await req<any>(devApiKey, `https://api.hubapi.com/webhooks/v3/${appId}/subscriptions`, {});
    return d.results ?? [];
  },

  async delete(devApiKey: string, appId: string, subscriptionId: string): Promise<void> {
    await req(devApiKey, `https://api.hubapi.com/webhooks/v3/${appId}/subscriptions/${subscriptionId}`, { method: "DELETE" });
  },
};

// ─── Value extractor (mirrors atVal from attioService.ts) ────────────────────
// HubSpot properties are flat strings, not Attio's array-of-objects shape, so
// this is mostly a passthrough — kept for call-site symmetry with crm.ts.

export function hsVal(properties: Record<string, any> | undefined, key: string): string | null {
  return properties?.[key] ?? null;
}