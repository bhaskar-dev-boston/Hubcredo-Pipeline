// src/lib/attio.ts
const ATTIO_BASE = "https://api.attio.com/v2";

export interface LeadForSync {
  id?: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  job_title: string | null;
  company_name: string | null;
  linkedin_url: string | null;
  company_domain: string | null;
  hq_country: string | null;
}

export type FieldMapping = Record<string, boolean>;

export const DEFAULT_FIELD_MAPPING: FieldMapping = {
  first_name: true,
  last_name: true,
  email: true,
  job_title: true,
  company_name: true,
  linkedin_url: true,
};

export interface AttioSyncResult {
  success: boolean;
  person_record_id: string | null;
  company_record_id: string | null;
  list_entry_id: string | null;
  error?: string;
}

async function attioFetch(url: string, options: RequestInit, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, options);
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") ?? "1", 10);
      const delay = Math.max(retryAfter * 1000, 1000 * Math.pow(2, attempt));
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    return res;
  }
  throw new Error(`Attio rate limit exceeded after ${retries} retries`);
}

export async function testAttioConnection(
  apiKey: string
): Promise<{ success: boolean; workspace_id?: string; workspace_name?: string }> {
  try {
    const res = await attioFetch(`${ATTIO_BASE}/self`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    });
    if (!res.ok) return { success: false };
    const data = (await res.json()) as any;
    return {
      success: true,
      workspace_id: data?.data?.workspace?.workspace_id ?? undefined,
      workspace_name: data?.data?.workspace?.name ?? undefined,
    };
  } catch {
    return { success: false };
  }
}

export async function fetchAttioLists(
  apiKey: string
): Promise<Array<{ id: string; name: string; api_slug: string }>> {
  try {
    const res = await attioFetch(`${ATTIO_BASE}/lists`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    return (data?.data ?? []).map((l: any) => ({
      id: l.id?.list_id ?? l.id,
      name: l.name,
      api_slug: l.api_slug,
    }));
  } catch {
    return [];
  }
}

// ─── Company upsert ───────────────────────────────────────────────────────────
// ONLY match on domains (unique). Skip entirely if no domain exists.
// Never send primary_location — Attio rejects raw country strings.

async function upsertAttioCompany(apiKey: string, lead: LeadForSync): Promise<string | null> {
  if (!lead.company_domain) return null; // domain is required for unique matching

  const values: Record<string, any> = {};
  if (lead.company_name) values["name"] = [{ value: lead.company_name }];
  values["domains"] = [{ domain: lead.company_domain }];
  // primary_location intentionally omitted — Attio rejects raw country strings

  try {
    const res = await attioFetch(
      `${ATTIO_BASE}/objects/companies/records?matching_attribute=domains`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ data: { values } }),
      }
    );
    if (!res.ok) return null;
    const result = (await res.json()) as any;
    return result?.data?.id?.record_id ?? null;
  } catch {
    return null;
  }
}

// ─── Person upsert ────────────────────────────────────────────────────────────
// Always match on email_addresses (unique). Throw if no email.
// email_addresses format: [{ email_address: "..." }] per Attio v2 spec.

export async function upsertAttioPerson(
  apiKey: string,
  lead: LeadForSync,
  fieldMapping: FieldMapping
): Promise<{ record_id: string | null; company_record_id: string | null }> {
  if (!lead.email) {
    throw new Error("Cannot sync: lead has no email address (required for Attio matching)");
  }

  const values: Record<string, any> = {};

  // email_addresses: array of objects with email_address key
  values["email_addresses"] = [{ email_address: lead.email }];

  // name: must include first_name, last_name AND full_name together
  if ((fieldMapping["first_name"] || fieldMapping["last_name"]) && (lead.first_name || lead.last_name)) {
    const firstName = lead.first_name ?? "";
    const lastName = lead.last_name ?? "";
    values["name"] = [{ first_name: firstName, last_name: lastName, full_name: [firstName, lastName].filter(Boolean).join(" ") }];
  }

  if (fieldMapping["job_title"] && lead.job_title) {
    values["job_title"] = [{ value: lead.job_title }];
  }

  // Company: only if domain exists (domain is required for unique company matching)
  let companyRecordId: string | null = null;
  if (fieldMapping["company_name"] && lead.company_domain) {
    companyRecordId = await upsertAttioCompany(apiKey, lead);
    if (companyRecordId) {
      values["company"] = [{ target_object: "companies", target_record_id: companyRecordId }];
    }
  }

  const res = await attioFetch(
    `${ATTIO_BASE}/objects/people/records?matching_attribute=email_addresses`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ data: { values } }),
    }
  );

  if (!res.ok) {
    let errMsg = `Attio API error: ${res.status}`;
    try {
      const errData = (await res.json()) as any;
      errMsg = errData?.message ?? errMsg;
    } catch {}
    throw new Error(errMsg);
  }

  const result = (await res.json()) as any;
  return { record_id: result?.data?.id?.record_id ?? null, company_record_id: companyRecordId };
}

export async function addAttioListEntry(apiKey: string, listId: string, personRecordId: string): Promise<string | null> {
  try {
    const res = await attioFetch(`${ATTIO_BASE}/lists/${listId}/entries`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ data: { record: { target_object: "people", target_record_id: personRecordId } } }),
    });
    if (!res.ok) return null;
    const result = (await res.json()) as any;
    return result?.data?.id?.entry_id ?? null;
  } catch {
    return null;
  }
}

export async function addAttioNote(apiKey: string, recordId: string, title: string, content: string): Promise<void> {
  await attioFetch(`${ATTIO_BASE}/notes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { format: "plaintext", title, content, parent_object: "people", parent_record_id: recordId } }),
  });
}

export async function syncLeadToAttio(
  apiKey: string,
  lead: LeadForSync,
  fieldMapping: FieldMapping,
  listId?: string | null
): Promise<AttioSyncResult> {
  try {
    const { record_id, company_record_id } = await upsertAttioPerson(apiKey, lead, fieldMapping);
    if (!record_id) {
      return { success: false, person_record_id: null, company_record_id: null, list_entry_id: null, error: "Person upsert returned no record_id" };
    }
    let list_entry_id: string | null = null;
    if (listId && record_id) {
      list_entry_id = await addAttioListEntry(apiKey, listId, record_id);
    }
    return { success: true, person_record_id: record_id, company_record_id, list_entry_id };
  } catch (err) {
    return { success: false, person_record_id: null, company_record_id: null, list_entry_id: null, error: err instanceof Error ? err.message : "Unknown error" };
  }
}