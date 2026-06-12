// src/lib/crmSync.ts
// ─────────────────────────────────────────────────────────────────────────────
// HubCredo CRM Sync Service — Attio v2
//
// FIXES vs old version:
//  1. Removed dependency on broken `AttioClient` wrapper from ./attio
//  2. All Attio API calls go directly through the correct attioService functions
//  3. upsertPerson uses PUT ?matching_attribute=email_addresses (correct assert endpoint)
//  4. addActivity uses POST /notes (Attio v2 — no "activity" endpoint exists)
//  5. email_addresses payload shape: [{ email_address: "..." }] not bare string
//  6. name payload shape: [{ first_name, last_name, full_name }] object, not string
//  7. linkedin payload shape: [{ value: "..." }] not bare string
//  8. company_name synced only when company_domain is available (Attio requires domain for upsert)

import { supabase } from "./supabase";
import type { Logger } from "pino";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CRMSyncStatus = "not_synced" | "synced" | "pending" | "error";

export interface FieldMapping {
  first_name: boolean;
  last_name: boolean;
  email: boolean;
  job_title: boolean;
  company_name: boolean;
  linkedin_url: boolean;
  [key: string]: boolean;
}

export interface CRMConnection {
  id: string;
  user_id: string;
  crm_type: "attio";
  access_token: string;
  refresh_token?: string;
  workspace_id?: string;
  field_mapping: FieldMapping;
  connected_at: string;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  user_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  job_title?: string;
  company_name?: string;
  company_domain?: string;  // needed for company upsert matching
  linkedin_url?: string;
  crm_contact_id?: string;
  crm_sync_status: CRMSyncStatus;
  crm_sync_error?: string;
  crm_synced_at?: string;
  [key: string]: unknown;
}

// ─── Attio v2 direct fetch helper ────────────────────────────────────────────

const ATTIO_BASE = "https://api.attio.com/v2";

async function attioRequest<T = any>(
  accessToken: string,
  path: string,
  options: RequestInit = {},
  retries = 3
): Promise<T> {
  const url = `${ATTIO_BASE}${path}`;

  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });

    // Rate limit — exponential backoff
    if (res.status === 429) {
      const wait = parseInt(res.headers.get("Retry-After") ?? "1", 10) * 1000;
      await new Promise(r => setTimeout(r, Math.max(wait, 500 * Math.pow(2, i))));
      continue;
    }

    if (res.status === 204) return undefined as T;

    if (!res.ok) {
      let message = `Attio API error ${res.status}`;
      try {
        const errBody = await res.json() as any;
        message = errBody?.message ?? errBody?.error ?? message;
      } catch {}
      throw new Error(message);
    }

    return res.json() as Promise<T>;
  }

  throw new Error("Attio rate limit: retries exhausted");
}

// ─── Attio v2 — Upsert person (assert endpoint) ───────────────────────────────
// PUT /v2/objects/people/records?matching_attribute=email_addresses
// Requires email. Correct payload shapes per Attio v2 docs.

async function attioUpsertPerson(
  accessToken: string,
  lead: Lead,
  mapping: FieldMapping,
  companyRecordId: string | null
): Promise<string> {
  if (!lead.email) {
    throw new Error("Cannot sync to Attio: lead has no email address (required for matching)");
  }

  const values: Record<string, any> = {};

  // email_addresses: array of { email_address } objects — NOT bare strings
  values.email_addresses = [{ email_address: lead.email }];

  // name: must include first_name, last_name AND full_name together
  if ((mapping.first_name || mapping.last_name) && (lead.first_name || lead.last_name)) {
    const fn = lead.first_name ?? "";
    const ln = lead.last_name ?? "";
    values.name = [{ first_name: fn, last_name: ln, full_name: `${fn} ${ln}`.trim() }];
  }

  // job_title: [{ value: "..." }]
  if (mapping.job_title && lead.job_title) {
    values.job_title = [{ value: lead.job_title }];
  }

  // linkedin: [{ value: "..." }] — NOT a bare string
  if (mapping.linkedin_url && lead.linkedin_url) {
    values.linkedin = [{ value: lead.linkedin_url }];
  }

  // company: only link if we have a resolved company record_id
  if (companyRecordId) {
    values.company = [{ target_object: "companies", target_record_id: companyRecordId }];
  }

  const result = await attioRequest<any>(
    accessToken,
    "/objects/people/records?matching_attribute=email_addresses",
    {
      method: "PUT",
      body: JSON.stringify({ data: { values } }),
    }
  );

  const recordId = result?.data?.id?.record_id;
  if (!recordId) throw new Error("Attio upsert returned no record_id");
  return recordId;
}

// ─── Attio v2 — Upsert company ────────────────────────────────────────────────
// PUT /v2/objects/companies/records?matching_attribute=domains
// domain is required for unique matching. Returns record_id or null.

async function attioUpsertCompany(
  accessToken: string,
  companyName: string | undefined,
  companyDomain: string
): Promise<string | null> {
  try {
    const values: Record<string, any> = {
      domains: [{ domain: companyDomain }],
    };
    if (companyName) {
      values.name = [{ value: companyName }];
    }

    const result = await attioRequest<any>(
      accessToken,
      "/objects/companies/records?matching_attribute=domains",
      {
        method: "PUT",
        body: JSON.stringify({ data: { values } }),
      }
    );

    return result?.data?.id?.record_id ?? null;
  } catch {
    // Don't fail the whole sync if company upsert fails
    return null;
  }
}

// ─── Attio v2 — Create note (used for activity logging) ──────────────────────
// POST /v2/notes
// Attio has no generic "activity" endpoint — notes are the correct mechanism.

async function attioCreateNote(
  accessToken: string,
  personRecordId: string,
  title: string,
  content: string
): Promise<void> {
  await attioRequest(accessToken, "/notes", {
    method: "POST",
    body: JSON.stringify({
      data: {
        format: "plaintext",
        title,
        content,
        parent_object: "people",
        parent_record_id: personRecordId,
      },
    }),
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// CRMSyncService
// ═════════════════════════════════════════════════════════════════════════════

export class CRMSyncService {
  private logger?: Logger;

  constructor(
    // attioConfig removed — no longer needed; access_token comes from crm_connections row
    _attioConfig?: unknown,
    logger?: Logger
  ) {
    this.logger = logger;
  }

  // ─── Connection management ─────────────────────────────────────────────────

  async getCRMConnection(userId: string): Promise<CRMConnection | null> {
    try {
      const { data, error } = await supabase
        .from("crm_connections")
        .select("*")
        .eq("user_id", userId)
        .eq("crm_type", "attio")
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // not found
        this.logger?.error({ error, userId }, "Failed to fetch CRM connection");
        throw error;
      }

      return data as CRMConnection;
    } catch (error) {
      this.logger?.error({ error, userId }, "Error getting CRM connection");
      throw error;
    }
  }

  async saveCRMConnection(
    userId: string,
    accessToken: string,
    refreshToken: string | undefined,
    workspaceId: string | undefined,
    fieldMapping: FieldMapping = {
      first_name: true,
      last_name: true,
      email: true,
      job_title: true,
      company_name: true,
      linkedin_url: true,
    }
  ): Promise<CRMConnection> {
    try {
      const { data, error } = await supabase
        .from("crm_connections")
        .upsert(
          {
            user_id: userId,
            crm_type: "attio",
            access_token: accessToken,
            refresh_token: refreshToken,
            workspace_id: workspaceId,
            field_mapping: fieldMapping,
            connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,crm_type" }
        )
        .select()
        .single();

      if (error) {
        this.logger?.error({ error, userId }, "Failed to save CRM connection");
        throw error;
      }

      this.logger?.info({ userId }, "CRM connection saved");
      return data as CRMConnection;
    } catch (error) {
      this.logger?.error({ error, userId }, "Error saving CRM connection");
      throw error;
    }
  }

  async disconnectCRM(userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from("crm_connections")
        .delete()
        .eq("user_id", userId)
        .eq("crm_type", "attio");

      if (error) {
        this.logger?.error({ error, userId }, "Failed to disconnect CRM");
        throw error;
      }

      this.logger?.info({ userId }, "CRM disconnected");
    } catch (error) {
      this.logger?.error({ error, userId }, "Error disconnecting CRM");
      throw error;
    }
  }

  async updateFieldMapping(userId: string, fieldMapping: FieldMapping): Promise<CRMConnection> {
    try {
      const { data, error } = await supabase
        .from("crm_connections")
        .update({
          field_mapping: fieldMapping,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("crm_type", "attio")
        .select()
        .single();

      if (error) {
        this.logger?.error({ error, userId }, "Failed to update field mapping");
        throw error;
      }

      this.logger?.info({ userId }, "Field mapping updated");
      return data as CRMConnection;
    } catch (error) {
      this.logger?.error({ error, userId }, "Error updating field mapping");
      throw error;
    }
  }

  // ─── Lead sync ─────────────────────────────────────────────────────────────

  /**
   * Sync a lead to Attio when approved.
   *
   * Flow:
   *  1. Load CRM connection (access_token + field_mapping)
   *  2. If lead has company_domain → upsert company first, get company record_id
   *  3. Upsert person with correct Attio v2 payload shapes
   *  4. Update leads table with crm_contact_id and sync status
   */
  async syncLeadOnApproval(
    userId: string,
    lead: Lead
  ): Promise<{ success: boolean; contactId?: string; error?: string }> {
    try {
      const connection = await this.getCRMConnection(userId);
      if (!connection) {
        return { success: false, error: "CRM not connected" };
      }

      if (!lead.email) {
        return { success: false, error: "Lead has no email address — required for Attio sync" };
      }

      const { access_token, field_mapping: mapping } = connection;

      // Step 1: Upsert company if we have a domain (domain is required for unique matching in Attio)
      let companyRecordId: string | null = null;
      if (mapping.company_name && lead.company_domain) {
        companyRecordId = await attioUpsertCompany(
          access_token,
          lead.company_name,
          lead.company_domain
        );
      }

      // Step 2: Upsert person (assert endpoint — creates or updates by email)
      const personRecordId = await attioUpsertPerson(
        access_token,
        lead,
        mapping,
        companyRecordId
      );

      // Step 3: Update lead row in Supabase
      const { error: updateError } = await supabase
        .from("leads")
        .update({
          crm_contact_id: personRecordId,
          crm_sync_status: "synced",
          crm_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead.id)
        .eq("user_id", userId);

      if (updateError) {
        this.logger?.error({ error: updateError, leadId: lead.id }, "Failed to update lead with CRM contact ID");
        throw updateError;
      }

      this.logger?.info({ leadId: lead.id, personRecordId }, "Lead synced to Attio");
      return { success: true, contactId: personRecordId };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.logger?.error({ error, userId, leadId: lead.id }, "Failed to sync lead to Attio");

      // Mark lead as error in Supabase
      try {
        await supabase
          .from("leads")
          .update({
            crm_sync_status: "error",
            crm_sync_error: errorMessage,
            updated_at: new Date().toISOString(),
          })
          .eq("id", lead.id)
          .eq("user_id", userId);
      } catch (updateError) {
        this.logger?.error({ updateError }, "Failed to update lead error status");
      }

      return { success: false, error: errorMessage };
    }
  }

  // ─── Activity logging ──────────────────────────────────────────────────────

  /**
   * Log an outreach activity as a Note on the Attio person record.
   *
   * Attio v2 has no generic "activity" endpoint — Notes are the correct mechanism.
   * The crmContactId here is the Attio person record_id stored in leads.crm_contact_id.
   */
  async addActivityToContact(
    userId: string,
    leadId: string,
    crmContactId: string,
    activityType: "email_open" | "email_reply" | "linkedin_connection",
    details?: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const connection = await this.getCRMConnection(userId);
      if (!connection) {
        return { success: false, error: "CRM not connected" };
      }

      const activityTitles: Record<string, string> = {
        email_open: "Email Opened",
        email_reply: "Email Replied",
        linkedin_connection: "LinkedIn Connection Accepted",
      };

      const activityDescriptions: Record<string, string> = {
        email_open: "The lead opened an outreach email.",
        email_reply: "The lead replied to an outreach email.",
        linkedin_connection: "The lead accepted a LinkedIn connection request.",
      };

      const title = activityTitles[activityType] ?? activityType;
      let content = activityDescriptions[activityType] ?? activityType;

      // Append any extra details as key: value lines
      if (details && Object.keys(details).length > 0) {
        const detailLines = Object.entries(details)
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join("\n");
        content = `${content}\n\n${detailLines}`;
      }

      await attioCreateNote(connection.access_token, crmContactId, title, content);

      this.logger?.info({ leadId, crmContactId, activityType }, "Activity note added to Attio contact");
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.logger?.error({ error, userId, leadId, crmContactId }, "Failed to add activity to Attio contact");
      return { success: false, error: errorMessage };
    }
  }

  // ─── Sync status ───────────────────────────────────────────────────────────

  async getLeadSyncStatus(
    userId: string,
    leadId: string
  ): Promise<{
    status: CRMSyncStatus;
    contactId?: string;
    error?: string;
    syncedAt?: string;
  }> {
    try {
      const { data, error } = await supabase
        .from("leads")
        .select("crm_sync_status, crm_contact_id, crm_sync_error, crm_synced_at")
        .eq("id", leadId)
        .eq("user_id", userId)
        .single();

      if (error) {
        this.logger?.error({ error, leadId, userId }, "Failed to get lead sync status");
        throw error;
      }

      return {
        status: data.crm_sync_status as CRMSyncStatus,
        contactId: data.crm_contact_id ?? undefined,
        error: data.crm_sync_error ?? undefined,
        syncedAt: data.crm_synced_at ?? undefined,
      };
    } catch (error) {
      this.logger?.error({ error, leadId }, "Error getting lead sync status");
      throw error;
    }
  }

  // ─── Bulk sync ─────────────────────────────────────────────────────────────

  /**
   * Sync multiple leads in sequence (respects Attio rate limits — 25 writes/sec).
   * Returns per-lead results.
   */
  async bulkSyncLeads(
    userId: string,
    leads: Lead[]
  ): Promise<Array<{ leadId: string; success: boolean; contactId?: string; error?: string }>> {
    const results: Array<{ leadId: string; success: boolean; contactId?: string; error?: string }> = [];

    for (const lead of leads) {
      const result = await this.syncLeadOnApproval(userId, lead);
      results.push({ leadId: lead.id, ...result });

      // Respect 25 writes/sec — small delay between records
      await new Promise(r => setTimeout(r, 50));
    }

    return results;
  }
}