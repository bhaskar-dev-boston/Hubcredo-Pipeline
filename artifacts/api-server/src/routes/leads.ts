import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import {
  ListLeadListsResponse,
  CreateLeadListBody,
  GetCurrentLeadListResponse,
  GetLeadListParams,
  GetLeadListResponse,
  ListLeadsQueryParams,
  ListLeadsResponse,
  ReviewLeadParams,
  ReviewLeadBody,
  ReviewLeadResponse,
  BulkReviewLeadsBody,
  BulkReviewLeadsResponse,
} from "@workspace/api-zod";
import { upsertAttioPerson, DEFAULT_FIELD_MAPPING, type FieldMapping } from "../lib/attio";

// Basic email validator — catches blanks, missing @, missing domain/TLD, stray spaces, etc.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function isValidEmail(email: string | null | undefined): boolean {
  return !!email && EMAIL_RE.test(email.trim());
}

async function syncLeadToCrmIfConnected(userId: string, leadId: string, lead: Record<string, any>): Promise<void> {
  try {
    const { data: connection } = await supabase
      .from("crm_connections")
      .select("access_token, field_mapping")
      .eq("user_id", userId)
      .single();

    if (!connection) return;

    const recordId = await upsertAttioPerson(
      connection.access_token,
      lead as any,
      (connection.field_mapping as FieldMapping) ?? DEFAULT_FIELD_MAPPING
    );

    await supabase
      .from("leads")
      .update({
        crm_contact_id: recordId,
        crm_sync_status: "synced",
        crm_sync_error: null,
        crm_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Sync failed";
    await supabase
      .from("leads")
      .update({
        crm_sync_status: "error",
        crm_sync_error: errMsg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);
  }
}

const router: IRouter = Router();

// Lead Lists
router.get("/lead-lists", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data, error } = await supabase
    .from("lead_lists")
    .select("*")
    .eq("user_id", req.userId!)
    .order("created_at", { ascending: false });

  if (error) {
    req.log.error({ error }, "Failed to list lead lists");
    res.status(500).json({ error: "Failed to fetch lead lists" });
    return;
  }

  res.json(ListLeadListsResponse.parse(data || []));
});

router.post("/lead-lists", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = CreateLeadListBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { data, error } = await supabase
    .from("lead_lists")
    .insert({
      user_id: req.userId!,
      icp_id: parsed.data.icp_id,
      label: parsed.data.label || "Lead List 1",
      processing_status: "pending",
      status: "pending",
    })
    .select()
    .single();

  if (error || !data) {
    req.log.error({ error }, "Failed to create lead list");
    res.status(500).json({ error: "Failed to create lead list" });
    return;
  }

  res.status(201).json(GetLeadListResponse.parse(data));
});

router.get("/lead-lists/current", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data, error } = await supabase
    .from("lead_lists")
    .select("*")
    .eq("user_id", req.userId!)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "No lead list found" });
    return;
  }

  res.json(GetCurrentLeadListResponse.parse(data));
});

router.get("/lead-lists/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetLeadListParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { data, error } = await supabase
    .from("lead_lists")
    .select("*")
    .eq("id", params.data.id)
    .eq("user_id", req.userId!)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Lead list not found" });
    return;
  }

  res.json(GetLeadListResponse.parse(data));
});

router.delete("/lead-lists/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: "Missing list id" });
    return;
  }

  // Delete all leads in this list first (cascade)
  await supabase
    .from("leads")
    .delete()
    .eq("lead_list_id", id)
    .eq("user_id", req.userId!);

  const { error } = await supabase
    .from("lead_lists")
    .delete()
    .eq("id", id)
    .eq("user_id", req.userId!);

  if (error) {
    req.log.error({ error }, "Failed to delete lead list");
    res.status(500).json({ error: "Failed to delete lead list" });
    return;
  }

  res.json({ success: true });
});

// Leads
router.get("/leads", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const queryParams = ListLeadsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  let query = supabase
    .from("leads")
    .select("*")
    .eq("user_id", req.userId!)
    .order("created_at", { ascending: false });

  if (queryParams.data.lead_list_id) {
    query = query.eq("lead_list_id", queryParams.data.lead_list_id);
  }
  if (queryParams.data.review_status) {
    query = query.eq("review_status", queryParams.data.review_status);
  }
  if (queryParams.data.industry) {
    query = query.eq("industry", queryParams.data.industry);
  }
  if (queryParams.data.company_size) {
    query = query.eq("company_size", queryParams.data.company_size);
  }
  if (queryParams.data.hq_country) {
    query = query.eq("hq_country", queryParams.data.hq_country);
  }

  const { data, error } = await query;

  if (error) {
    req.log.error({ error }, "Failed to list leads");
    res.status(500).json({ error: "Failed to fetch leads" });
    return;
  }

  res.json(ListLeadsResponse.parse(data || []));
});

router.patch("/leads/:id/review", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = ReviewLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = ReviewLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { data, error } = await supabase
    .from("leads")
    .update({
      review_status: parsed.data.review_status,
      rejection_reason: parsed.data.rejection_reason ?? null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.data.id)
    .eq("user_id", req.userId!)
    .select()
    .single();

  if (error || !data) {
    req.log.error({ error }, "Failed to review lead");
    res.status(500).json({ error: "Review failed" });
    return;
  }

  // Fire-and-forget CRM sync when a lead is approved
  if (parsed.data.review_status === "approved") {
    syncLeadToCrmIfConnected(req.userId!, params.data.id, data).catch(() => {});
  }

  res.json(ReviewLeadResponse.parse(data));
});

// POST /api/leads/upload-manual — bulk insert leads from CSV/Excel upload
// Only rows with a valid email OR a LinkedIn URL are kept; everything else is dropped.
router.post("/leads/upload-manual", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { list_name, leads: rawLeads } = req.body as {
    list_name?: string;
    leads: Array<Record<string, unknown>>;
  };

  if (!Array.isArray(rawLeads) || rawLeads.length === 0) {
    res.status(400).json({ error: "No leads provided" });
    return;
  }

  const label = list_name?.trim() || `Upload ${new Date().toLocaleDateString()}`;

  // Create the lead list
  const { data: list, error: listErr } = await supabase
    .from("lead_lists")
    .insert({
      user_id: req.userId!,
      label,
      source: "manual",
      status: "ready",
      processing_status: "complete",
      total_count: rawLeads.length,
    })
    .select()
    .single();

  if (listErr || !list) {
    res.status(500).json({ error: "Failed to create lead list" });
    return;
  }

  // Map CSV rows to lead records — only keep rows that have a valid email
  // and/or a LinkedIn URL. Rows with neither are dropped entirely.
  const leadsToInsert: Array<Record<string, unknown>> = [];
  let skippedNoContact = 0;
  let skippedInvalidEmail = 0;

  for (const row of rawLeads) {
    const rawEmail = (row.email || row.Email || row["Email Address"] || "").toString().trim();
    const linkedinUrl =
      (row.linkedin_url || row.linkedin || row["LinkedIn URL"] || row["LinkedIn"] || "").toString().trim() || null;

    const emailValid = isValidEmail(rawEmail);
    if (rawEmail && !emailValid) skippedInvalidEmail++;

    const email = emailValid ? rawEmail : null;

    // Require at least one usable contact channel
    if (!email && !linkedinUrl) {
      skippedNoContact++;
      continue;
    }

    // custom_fields is passed as a nested object by the frontend mapper.
    // Sanitise: accept only plain-object with string keys (\w+) and string values.
    let customFields: Record<string, string> | null = null;
    if (row.custom_fields && typeof row.custom_fields === "object" && !Array.isArray(row.custom_fields)) {
      const raw = row.custom_fields as Record<string, unknown>;
      const safe: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) {
        // Key must be a valid identifier-like string; value must coerce to a non-empty string
        if (/^\w+$/.test(k) && v !== null && v !== undefined) {
          const strVal = String(v).trim();
          if (strVal) safe[k] = strVal;
        }
      }
      if (Object.keys(safe).length > 0) customFields = safe;
    }

    leadsToInsert.push({
      user_id: req.userId!,
      lead_list_id: list.id,
      first_name: row.first_name || row.firstName || row["First Name"] || row["first name"] || null,
      last_name: row.last_name || row.lastName || row["Last Name"] || row["last name"] || null,
      email,
      linkedin_url: linkedinUrl,
      job_title: row.job_title || row.title || row["Job Title"] || row["Title"] || null,
      company_name: row.company_name || row.company || row["Company"] || row["Company Name"] || null,
      company_domain: row.company_domain || row["Company Domain"] || row["Website"] || null,
      company_size: row.company_size || row["Company Size"] || null,
      industry: row.industry || row["Industry"] || null,
      hq_country: row.hq_country || row.country || row["Country"] || null,
      hq_city: row.hq_city || row.city || row["City"] || null,
      seniority: row.seniority || row["Seniority"] || null,
      department: row.department || row["Department"] || null,
      custom_fields: customFields,
      review_status: "pending",
    });
  }

  if (leadsToInsert.length === 0) {
    await supabase.from("lead_lists").delete().eq("id", list.id);
    res.status(400).json({
      error: "No leads with a valid email or LinkedIn URL were found in this upload.",
      total: rawLeads.length,
      skipped_no_contact: skippedNoContact,
      skipped_invalid_email: skippedInvalidEmail,
    });
    return;
  }

  const { data: insertedLeads, error: leadsErr } = await supabase
    .from("leads")
    .insert(leadsToInsert)
    .select("id");

  if (leadsErr) {
    // Clean up the list we just created
    await supabase.from("lead_lists").delete().eq("id", list.id);
    res.status(500).json({ error: "Failed to insert leads: " + leadsErr.message });
    return;
  }

  // Update total_count with actual inserted count
  await supabase
    .from("lead_lists")
    .update({ total_count: insertedLeads?.length ?? 0 })
    .eq("id", list.id);

  res.status(201).json({
    list_id: list.id,
    list_label: label,
    inserted: insertedLeads?.length ?? 0,
    total: rawLeads.length,
    skipped_no_contact: skippedNoContact,       // rows with neither a valid email nor a LinkedIn URL
    skipped_invalid_email: skippedInvalidEmail, // rows where an email was present but malformed
  });
});

router.post("/leads/bulk-review", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = BulkReviewLeadsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { data, error } = await supabase
    .from("leads")
    .update({
      review_status: parsed.data.review_status,
      rejection_reason: parsed.data.rejection_reason ?? null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in("id", parsed.data.lead_ids)
    .eq("user_id", req.userId!)
    .select();

  if (error) {
    req.log.error({ error }, "Failed to bulk review leads");
    res.status(500).json({ error: "Bulk review failed" });
    return;
  }

  // Fire-and-forget CRM sync for all approved leads
  if (parsed.data.review_status === "approved" && data?.length) {
    for (const lead of data) {
      syncLeadToCrmIfConnected(req.userId!, lead.id, lead).catch(() => {});
    }
  }

  res.json(BulkReviewLeadsResponse.parse({ updated_count: data?.length ?? 0 }));
});

export default router;