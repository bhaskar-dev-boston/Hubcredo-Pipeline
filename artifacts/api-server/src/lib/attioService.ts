// src/lib/attioService.ts
// ─────────────────────────────────────────────────────────────────────────────
// HubCredo → Attio service layer
// Rate limits: 100 reads/sec · 25 writes/sec → retry on 429
//
// FIX: Attio v2 query body must NOT use { filter: { filters: [...] } }.
//      Correct format is { filter: { "$and": [...] } } or a flat attribute object.
//      Sending an empty body (no filter key) is also valid and returns all records.

const BASE = "https://api.attio.com/v2";

async function req<T = any>(
  apiKey: string,
  path: string,
  options: RequestInit = {},
  retries = 4
): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
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
      const wait = parseInt(res.headers.get("Retry-After") ?? "1") * 1000;
      await sleep(Math.max(wait, 500 * Math.pow(2, i)));
      continue;
    }

    if (!res.ok) {
      let msg = `Attio ${res.status}`;
      try { msg = ((await res.json()) as any)?.message ?? msg; } catch {}
      throw new AttioError(msg, res.status);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }
  throw new AttioError("Rate limit — retries exhausted", 429);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export class AttioError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "AttioError";
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AttioRecord {
  id: { record_id: string };
  values: Record<string, any[]>;
}

export interface AttioListEntry {
  id: { entry_id: string; list_id: string };
  record_id: string;
  attribute_values: Record<string, any[]>;
}

export interface AttioList {
  id: { list_id: string };
  name: string;
  api_slug: string;
  parent_object: string;
}

export interface AttioNote {
  id: { note_id: string };
  title: string;
  content_plaintext: string;
  parent_object: string;
  parent_record_id: string;
  created_at: string;
}

export interface AttioTask {
  id: { task_id: string };
  content: string;
  deadline_at: string | null;
  is_completed: boolean;
  assignees: Array<{ referenced_actor_id: string }>;
  linked_records: Array<{ target_object: string; target_record_id: string }>;
  created_at: string;
}

export interface AttioMember {
  id: { workspace_member_id: string };
  first_name: string;
  last_name: string;
  email_address: string;
  avatar_url: string | null;
  access_level: string;
}

// ─── Attio v2 filter type ─────────────────────────────────────────────────────
// Attio uses a flat object or $and/$or combinator — NOT { filters: [...] }.
// Examples:
//   All records (no filter):     omit filter key entirely
//   By email:                    { "email_addresses": { "email_address": { "$eq": "x@y.com" } } }
//   By name:                     { "name": { "first_name": { "$eq": "John" } } }
//   Combined:                    { "$and": [ { "email_addresses": {...} }, { "name": {...} } ] }
export type AttioFilter = Record<string, any>;

export interface QueryOptions {
  // Pass a valid Attio v2 filter object, or omit for all records
  filter?: AttioFilter;
  sorts?: Array<{ attribute: string; direction: "asc" | "desc"; field?: string }>;
  limit?: number;
  offset?: number;
}

// ─── Workspace ────────────────────────────────────────────────────────────────

export const Workspace = {
  async self(apiKey: string) {
    const d = await req(apiKey, "/self");
    return {
      workspace_id: d?.data?.workspace?.workspace_id as string,
      name: d?.data?.workspace?.name as string,
    };
  },

  async members(apiKey: string): Promise<AttioMember[]> {
    const d = await req(apiKey, "/workspace_members");
    return d?.data ?? [];
  },
};

// ─── People ───────────────────────────────────────────────────────────────────

export const People = {
  async upsert(
    apiKey: string,
    fields: {
      first_name?: string;
      last_name?: string;
      email?: string;
      job_title?: string;
      linkedin?: string;
      company_record_id?: string;
      custom?: Record<string, any>;
    }
  ): Promise<{ record_id: string }> {
    const values: Record<string, any> = {};

    if (fields.first_name || fields.last_name) {
      const fn = fields.first_name ?? "";
      const ln = fields.last_name ?? "";
      values.name = [{ first_name: fn, last_name: ln, full_name: `${fn} ${ln}`.trim() }];
    }
    if (fields.email) values.email_addresses = [{ email_address: fields.email }];
    if (fields.job_title) values.job_title = [{ value: fields.job_title }];
    if (fields.linkedin) values.linkedin = [{ value: fields.linkedin }];
    if (fields.company_record_id) {
      values.company = [{ target_object: "companies", target_record_id: fields.company_record_id }];
    }
    if (fields.custom) {
      for (const [slug, val] of Object.entries(fields.custom)) {
        values[slug] = [{ value: val }];
      }
    }

    if (!fields.email) {
      throw new AttioError("Cannot sync: lead has no email address (required for Attio matching)", 400);
    }
    const d = await req(apiKey, `/objects/people/records?matching_attribute=email_addresses`, {
      method: "PUT",
      body: JSON.stringify({ data: { values } }),
    });
    return { record_id: d.data.id.record_id };
  },

  async get(apiKey: string, record_id: string): Promise<AttioRecord> {
    const d = await req(apiKey, `/objects/people/records/${record_id}`);
    return d.data;
  },

  async update(apiKey: string, record_id: string, values: Record<string, any>): Promise<AttioRecord> {
    const d = await req(apiKey, `/objects/people/records/${record_id}`, {
      method: "PATCH",
      body: JSON.stringify({ data: { values } }),
    });
    return d.data;
  },

  async delete(apiKey: string, record_id: string): Promise<void> {
    await req(apiKey, `/objects/people/records/${record_id}`, { method: "DELETE" });
  },

  /**
   * Query people records.
   *
   * KEY FIX: The body must only contain { limit, offset } for an unfiltered query.
   * For filtered queries use Attio v2 format:
   *   { filter: { "email_addresses": { "email_address": { "$eq": "x@y.com" } } } }
   * NEVER pass { filter: { filters: [...] } } — that is NOT Attio v2 and returns 400.
   */
  async query(
    apiKey: string,
    opts: QueryOptions = {}
  ): Promise<{ data: AttioRecord[]; next_page_offset?: number }> {
    const body: Record<string, any> = {
      limit: opts.limit ?? 25,
      offset: opts.offset ?? 0,
    };

    // Only add filter/sorts if explicitly provided — omitting them returns all records
    if (opts.filter && Object.keys(opts.filter).length > 0) {
      body.filter = opts.filter;
    }
    if (opts.sorts && opts.sorts.length > 0) {
      body.sorts = opts.sorts;
    }

    const d = await req(apiKey, "/objects/people/records/query", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { data: d.data ?? [], next_page_offset: d.next_page_offset };
  },
};

// ─── Companies ────────────────────────────────────────────────────────────────

export const Companies = {
  async upsert(
    apiKey: string,
    fields: {
      name?: string;
      domain?: string;
      custom?: Record<string, any>;
    }
  ): Promise<{ record_id: string }> {
    const values: Record<string, any> = {};
    if (fields.name) values.name = [{ value: fields.name }];
    if (fields.domain) values.domains = [{ domain: fields.domain }];
    if (fields.custom) {
      for (const [slug, val] of Object.entries(fields.custom)) {
        values[slug] = [{ value: val }];
      }
    }

    if (!fields.domain) throw new AttioError("company_domain required for Attio matching", 400);
    const d = await req(apiKey, `/objects/companies/records?matching_attribute=domains`, {
      method: "PUT",
      body: JSON.stringify({ data: { values } }),
    });
    return { record_id: d.data.id.record_id };
  },

  async get(apiKey: string, record_id: string): Promise<AttioRecord> {
    const d = await req(apiKey, `/objects/companies/records/${record_id}`);
    return d.data;
  },

  async query(apiKey: string, opts: QueryOptions = {}): Promise<{ data: AttioRecord[] }> {
    const body: Record<string, any> = {
      limit: opts.limit ?? 25,
      offset: opts.offset ?? 0,
    };
    if (opts.filter && Object.keys(opts.filter).length > 0) {
      body.filter = opts.filter;
    }
    if (opts.sorts && opts.sorts.length > 0) {
      body.sorts = opts.sorts;
    }

    const d = await req(apiKey, "/objects/companies/records/query", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { data: d.data ?? [] };
  },
};

// ─── Lists (Deals / Pipelines) ────────────────────────────────────────────────

export const Lists = {
  async list(apiKey: string): Promise<AttioList[]> {
    const d = await req(apiKey, "/lists");
    return d.data ?? [];
  },

  async create(apiKey: string, name: string, parentObject: "people" | "companies" | "deals"): Promise<AttioList> {
    const d = await req(apiKey, "/lists", {
      method: "POST",
      body: JSON.stringify({ data: { name, api_slug: name.toLowerCase().replace(/\s+/g, "_"), parent_object: parentObject } }),
    });
    return d.data;
  },

  async entries(
    apiKey: string,
    listId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<{ data: AttioListEntry[] }> {
    const d = await req(apiKey, `/lists/${listId}/entries/query`, {
      method: "POST",
      body: JSON.stringify({ limit: opts.limit ?? 50, offset: opts.offset ?? 0 }),
    });
    return { data: d.data ?? [] };
  },

  async addEntry(apiKey: string, listId: string, targetObject: string, recordId: string): Promise<string> {
    const d = await req(apiKey, `/lists/${listId}/entries`, {
      method: "POST",
      body: JSON.stringify({
        data: { record: { target_object: targetObject, target_record_id: recordId } },
      }),
    });
    return d.data.id.entry_id;
  },

  async updateEntry(apiKey: string, listId: string, entryId: string, values: Record<string, any>): Promise<void> {
    await req(apiKey, `/lists/${listId}/entries/${entryId}`, {
      method: "PATCH",
      body: JSON.stringify({ data: { attribute_values: values } }),
    });
  },

  async removeEntry(apiKey: string, listId: string, entryId: string): Promise<void> {
    await req(apiKey, `/lists/${listId}/entries/${entryId}`, { method: "DELETE" });
  },
};

// ─── Notes ────────────────────────────────────────────────────────────────────

export const Notes = {
  async create(
    apiKey: string,
    opts: {
      parentObject: "people" | "companies" | "deals";
      parentRecordId: string;
      title: string;
      content: string;
    }
  ): Promise<AttioNote> {
    const d = await req(apiKey, "/notes", {
      method: "POST",
      body: JSON.stringify({
        data: {
          format: "plaintext",
          title: opts.title,
          content: opts.content,
          parent_object: opts.parentObject,
          parent_record_id: opts.parentRecordId,
        },
      }),
    });
    return d.data;
  },

  async list(apiKey: string, parentObject: string, parentRecordId: string): Promise<AttioNote[]> {
    const d = await req(
      apiKey,
      `/notes?parent_object=${parentObject}&parent_record_id=${parentRecordId}&limit=50`
    );
    return d.data ?? [];
  },

  async delete(apiKey: string, noteId: string): Promise<void> {
    await req(apiKey, `/notes/${noteId}`, { method: "DELETE" });
  },
};

// ─── Tasks ────────────────────────────────────────────────────────────────────

export const Tasks = {
  async create(
    apiKey: string,
    opts: {
      content: string;
      deadlineAt?: string;
      assigneeId?: string;
      linkedRecordObject?: string;
      linkedRecordId?: string;
    }
  ): Promise<AttioTask> {
    const d = await req(apiKey, "/tasks", {
      method: "POST",
      body: JSON.stringify({
        data: {
          content: opts.content,
          deadline_at: opts.deadlineAt ?? null,
          assignees: opts.assigneeId
            ? [{ referenced_actor_type: "workspace-member", referenced_actor_id: opts.assigneeId }]
            : [],
          linked_records: opts.linkedRecordId
            ? [{ target_object: opts.linkedRecordObject, target_record_id: opts.linkedRecordId }]
            : [],
        },
      }),
    });
    return d.data;
  },

  async list(
    apiKey: string,
    opts: {
      isCompleted?: boolean;
      linkedRecordId?: string;
      linkedRecordObject?: string; // required by Attio when linkedRecordId is set
      limit?: number;
    } = {}
  ): Promise<AttioTask[]> {
    const params = new URLSearchParams();
    if (opts.isCompleted !== undefined) params.set("is_completed", String(opts.isCompleted));
    // Attio requires BOTH linked_record_id AND linked_record_object together — never one without the other
    if (opts.linkedRecordId) {
      params.set("linked_record_id", opts.linkedRecordId);
      params.set("linked_record_object", opts.linkedRecordObject ?? "people");
    }
    params.set("limit", String(opts.limit ?? 50));
    const d = await req(apiKey, `/tasks?${params}`);
    return d.data ?? [];
  },

  async complete(apiKey: string, taskId: string): Promise<void> {
    await req(apiKey, `/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ data: { is_completed: true } }),
    });
  },

  async delete(apiKey: string, taskId: string): Promise<void> {
    await req(apiKey, `/tasks/${taskId}`, { method: "DELETE" });
  },
};

// ─── Custom Attributes ────────────────────────────────────────────────────────

export const Attributes = {
  async list(apiKey: string, objectSlug: string) {
    const d = await req(apiKey, `/objects/${objectSlug}/attributes`);
    return d.data ?? [];
  },

  async create(
    apiKey: string,
    objectSlug: string,
    opts: {
      title: string;
      api_slug: string;
      type: "text" | "number" | "checkbox" | "select" | "date" | "rating" | "currency";
    }
  ) {
    const d = await req(apiKey, `/objects/${objectSlug}/attributes`, {
      method: "POST",
      body: JSON.stringify({ data: opts }),
    });
    return d.data;
  },

  async archive(apiKey: string, objectSlug: string, attributeId: string) {
    await req(apiKey, `/objects/${objectSlug}/attributes/${attributeId}`, {
      method: "PATCH",
      body: JSON.stringify({ data: { is_archived: true } }),
    });
  },
};

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export const Webhooks = {
  async list(apiKey: string) {
    const d = await req(apiKey, "/webhooks");
    return d.data ?? [];
  },

  async create(
    apiKey: string,
    opts: {
      targetUrl: string;
      subscriptions: string[];
    }
  ) {
    const d = await req(apiKey, "/webhooks", {
      method: "POST",
      body: JSON.stringify({
        data: {
          target_url: opts.targetUrl,
          subscriptions: opts.subscriptions.map(e => ({ event_type: e })),
        },
      }),
    });
    return d.data;
  },

  async delete(apiKey: string, webhookId: string) {
    await req(apiKey, `/webhooks/${webhookId}`, { method: "DELETE" });
  },
};

// ─── Value extractor ──────────────────────────────────────────────────────────

export function atVal(values: any[], index = 0): string | null {
  const v = values?.[index];
  if (!v) return null;
  if (v.email_address) return v.email_address;
  if (v.domain) return v.domain;
  if (v.original_url) return v.original_url;
  if (v.full_name) return v.full_name;
  return v.value ?? v.option?.title ?? null;
}

// ─── Filter builder helpers ───────────────────────────────────────────────────
// Use these in your API route handlers when building query filters.

/** Filter people by exact email match */
export function emailFilter(email: string): AttioFilter {
  return {
    email_addresses: { email_address: { "$eq": email } },
  };
}

/** Filter people/companies by a partial name match (email search in ContactsTab uses this) */
export function nameContainsFilter(query: string): AttioFilter {
  return {
    "$or": [
      { name: { first_name: { "$contains": query } } },
      { name: { last_name: { "$contains": query } } },
    ],
  };
}

/**
 * Build a filter for the /crm/people?q=... endpoint.
 * If the query looks like an email, filter by email; otherwise filter by name.
 */
export function peopleSearchFilter(q: string): AttioFilter {
  if (q.includes("@")) {
    return emailFilter(q);
  }
  return nameContainsFilter(q);
}