// src/routes/crm-hubspot.ts
// API token read from process.env.HUBSPOT_API_KEY (Replit Secret)
// This is a HubSpot Private App access token — see HUBSPOT_SETUP.md for
// exactly which scopes to grant when creating it.
//
// Mounted separately from crm.ts (Attio) per project decision: new file,
// zero risk to the working Attio integration. Same auth model as Attio —
// single shared token in env, not per-user OAuth.

import { Router, type IRouter, type Response } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import {
  Account, Contacts, Companies, Deals, Lists, Notes, Tasks, Properties, Webhooks,
  HubSpotError,
} from "../lib/hubspotService";

const router: IRouter = Router();

function getApiKey(): string | null {
  return process.env.HUBSPOT_API_KEY ?? null;
}

function requireApiKey(res: Response): string | null {
  const key = getApiKey();
  if (!key) {
    res.status(503).json({ error: "HUBSPOT_API_KEY not configured in server secrets" });
    return null;
  }
  return key;
}

function handleHsError(err: unknown, res: Response) {
  if (err instanceof HubSpotError) {
    res.status(err.status >= 400 && err.status < 500 ? err.status : 502).json({ error: err.message });
  } else {
    console.error("HUBSPOT ERROR:", err);
    res.status(500).json({ error: "Internal error" });
  }
}

async function getFieldMapping(userId: string): Promise<Record<string, boolean>> {
  const { data } = await supabase
    .from("crm_connections")
    .select("field_mapping")
    .eq("user_id", userId)
    .eq("crm_type", "hubspot")
    .single();
  return (data?.field_mapping as Record<string, boolean>) ?? {
    first_name: true, last_name: true, email: true,
    job_title: true, company_name: true, linkedin_url: true,
  };
}

async function getHubspotListId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("crm_connections")
    .select("hubspot_list_id")
    .eq("user_id", userId)
    .eq("crm_type", "hubspot")
    .single();
  return data?.hubspot_list_id ?? null;
}

// ─── CONNECTION STATUS ────────────────────────────────────────────────────────

router.get("/crm-hs/connection", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = getApiKey();
  if (!key) { res.status(404).json({ error: "HUBSPOT_API_KEY not set in server secrets" }); return; }
  try {
    const info = await Account.info(key);
    res.json({ connected: true, hub_id: info.hub_id, scopes: info.scopes, source: "env" });
  } catch (err) { handleHsError(err, res); }
});

// ─── USER PREFERENCES ────────────────────────────────────────────────────────

router.get("/crm-hs/preferences", requireAuth, async (req: AuthenticatedRequest, res) => {
  const { data } = await supabase
    .from("crm_connections")
    .select("field_mapping, hubspot_list_id")
    .eq("user_id", req.userId!)
    .eq("crm_type", "hubspot")
    .single();
  res.json({
    field_mapping: data?.field_mapping ?? {
      first_name: true, last_name: true, email: true,
      job_title: true, company_name: true, linkedin_url: true,
    },
    hubspot_list_id: data?.hubspot_list_id ?? null,
  });
});

router.put("/crm-hs/preferences", requireAuth, async (req: AuthenticatedRequest, res) => {
  const { field_mapping, hubspot_list_id } = req.body as {
    field_mapping?: Record<string, boolean>;
    hubspot_list_id?: string | null;
  };
  await supabase.from("crm_connections").upsert({
    user_id: req.userId!,
    crm_type: "hubspot",
    access_token: "env",
    ...(field_mapping ? { field_mapping } : {}),
    ...(hubspot_list_id !== undefined ? { hubspot_list_id } : {}),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,crm_type" });
  res.json({ success: true });
});

// ─── CONTACTS ─────────────────────────────────────────────────────────────────

router.get("/crm-hs/contacts", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try {
    const { q, limit = "25", after } = req.query as Record<string, string>;
    const parsedLimit = Math.min(parseInt(limit) || 25, 100);

    // ── User-scoping: only show contacts synced by this user (mirrors crm.ts) ──
    const { data: userLeads } = await supabase
      .from("leads")
      .select("email")
      .eq("user_id", req.userId!)
      .not("hubspot_contact_id", "is", null);

    const userEmails = (userLeads || []).map((l: any) => l.email?.toLowerCase()).filter(Boolean) as string[];

    if (userEmails.length === 0) {
      res.json({ total: 0, results: [] });
      return;
    }

    const result = await Contacts.query(key, { q, limit: parsedLimit, after });

    if (result?.results) {
      result.results = result.results.filter((contact: any) => {
        const email = (contact.properties?.email || "").toLowerCase();
        return email && userEmails.includes(email);
      });
    }

    res.json(result);
  } catch (err) { handleHsError(err, res); }
});

router.get("/crm-hs/contacts/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { res.json(await Contacts.get(key, String(req.params.id))); }
  catch (err) { handleHsError(err, res); }
});

router.patch("/crm-hs/contacts/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { res.json(await Contacts.update(key, String(req.params.id), req.body.properties)); }
  catch (err) { handleHsError(err, res); }
});

router.delete("/crm-hs/contacts/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { await Contacts.delete(key, String(req.params.id)); res.json({ success: true }); }
  catch (err) { handleHsError(err, res); }
});

// ─── COMPANIES ────────────────────────────────────────────────────────────────

router.get("/crm-hs/companies", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const { limit = "25", after } = req.query as Record<string, string>;
  try {
    res.json(await Companies.query(key, { limit: Math.min(parseInt(limit), 100), after }));
  } catch (err) { handleHsError(err, res); }
});

router.get("/crm-hs/companies/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { res.json(await Companies.get(key, String(req.params.id))); }
  catch (err) { handleHsError(err, res); }
});

// ─── DEALS ────────────────────────────────────────────────────────────────────

router.get("/crm-hs/deals", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const { limit = "25", after } = req.query as Record<string, string>;
  try {
    res.json(await Deals.query(key, { limit: Math.min(parseInt(limit), 100), after }));
  } catch (err) { handleHsError(err, res); }
});

router.post("/crm-hs/deals", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const { dealname, pipeline, dealstage, amount, contact_id, company_id } = req.body as {
    dealname: string; pipeline?: string; dealstage?: string; amount?: string;
    contact_id?: string; company_id?: string;
  };
  try {
    const deal = await Deals.create(key, { dealname, pipeline, dealstage, amount });
    if (contact_id) await Deals.associateContact(key, deal.id, contact_id);
    if (company_id) await Deals.associateCompany(key, deal.id, company_id);
    res.status(201).json(deal);
  } catch (err) { handleHsError(err, res); }
});

router.patch("/crm-hs/deals/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { res.json(await Deals.update(key, String(req.params.id), req.body.properties)); }
  catch (err) { handleHsError(err, res); }
});

router.delete("/crm-hs/deals/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { await Deals.delete(key, String(req.params.id)); res.json({ success: true }); }
  catch (err) { handleHsError(err, res); }
});

router.get("/crm-hs/deals/pipelines", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { res.json({ pipelines: await Deals.pipelines(key) }); }
  catch (err) { handleHsError(err, res); }
});

// ─── LISTS ────────────────────────────────────────────────────────────────────

router.get("/crm-hs/lists", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { res.json({ lists: await Lists.list(key) }); }
  catch (err) { handleHsError(err, res); }
});

router.post("/crm-hs/lists", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const { name, object_type_id = "0-1" } = req.body as { name: string; object_type_id?: "0-1" | "0-2" };
  try { res.status(201).json(await Lists.create(key, name, object_type_id)); }
  catch (err) { handleHsError(err, res); }
});

router.get("/crm-hs/lists/:id/members", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const { limit = "50", after } = req.query as Record<string, string>;
  try { res.json(await Lists.members(key, String(req.params.id), { limit: parseInt(limit), after })); }
  catch (err) { handleHsError(err, res); }
});

router.post("/crm-hs/lists/:id/members", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const { record_ids } = req.body as { record_ids: string[] };
  try { res.status(201).json(await Lists.addMembers(key, String(req.params.id), record_ids)); }
  catch (err) { handleHsError(err, res); }
});

router.delete("/crm-hs/lists/:id/members", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const { record_ids } = req.body as { record_ids: string[] };
  try { res.json(await Lists.removeMembers(key, String(req.params.id), record_ids)); }
  catch (err) { handleHsError(err, res); }
});

// ─── NOTES ────────────────────────────────────────────────────────────────────

router.get("/crm-hs/notes", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const { parent_object, parent_record_id } = req.query as Record<string, string>;
  try { res.json({ notes: await Notes.list(key, parent_object, parent_record_id) }); }
  catch (err) { handleHsError(err, res); }
});

router.post("/crm-hs/notes", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const { parent_object, parent_record_id, content, owner_id } = req.body as {
    parent_object: "contacts" | "companies" | "deals";
    parent_record_id: string;
    content: string;
    owner_id?: string;
  };
  try {
    res.status(201).json(await Notes.create(key, {
      parentObject: parent_object,
      parentRecordId: parent_record_id,
      content,
      ownerId: owner_id,
    }));
  } catch (err) { handleHsError(err, res); }
});

router.delete("/crm-hs/notes/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { await Notes.delete(key, String(req.params.id)); res.json({ success: true }); }
  catch (err) { handleHsError(err, res); }
});

// ─── TASKS ────────────────────────────────────────────────────────────────────

router.get("/crm-hs/tasks", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const { status, linked_record_id, linked_record_object, limit = "50" } = req.query as Record<string, string>;
  try {
    res.json({ tasks: await Tasks.list(key, {
      status,
      linkedRecordId: linked_record_id,
      linkedRecordObject: linked_record_object ?? "contacts",
      limit: parseInt(limit),
    })});
  } catch (err) { handleHsError(err, res); }
});

router.post("/crm-hs/tasks", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const {
    content, subject, deadline_at, owner_id, priority, task_type,
    linked_record_object, linked_record_id,
  } = req.body as {
    content: string; subject?: string; deadline_at?: string; owner_id?: string;
    priority?: "LOW" | "MEDIUM" | "HIGH"; task_type?: "CALL" | "EMAIL" | "TODO";
    linked_record_object?: "contacts" | "companies" | "deals"; linked_record_id?: string;
  };
  try {
    res.status(201).json(await Tasks.create(key, {
      content, subject, deadlineAt: deadline_at, ownerId: owner_id, priority, taskType: task_type,
      linkedRecordObject: linked_record_object, linkedRecordId: linked_record_id,
    }));
  } catch (err) { handleHsError(err, res); }
});

router.patch("/crm-hs/tasks/:id/complete", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { await Tasks.complete(key, String(req.params.id)); res.json({ success: true }); }
  catch (err) { handleHsError(err, res); }
});

router.delete("/crm-hs/tasks/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { await Tasks.delete(key, String(req.params.id)); res.json({ success: true }); }
  catch (err) { handleHsError(err, res); }
});

// ─── PROPERTIES (Attio "Attributes" equivalent) ───────────────────────────────

router.get("/crm-hs/properties/:objectType", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { res.json({ properties: await Properties.list(key, String(req.params.objectType)) }); }
  catch (err) { handleHsError(err, res); }
});

router.post("/crm-hs/properties/:objectType", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { res.status(201).json(await Properties.create(key, String(req.params.objectType), req.body)); }
  catch (err) { handleHsError(err, res); }
});

// ─── WEBHOOKS ─────────────────────────────────────────────────────────────────
// Requires HUBSPOT_DEVELOPER_API_KEY + HUBSPOT_APP_ID — see hubspotService.ts
// header comment. A Private App token alone cannot manage these.

function requireDevKey(res: Response): { devKey: string; appId: string } | null {
  const devKey = process.env.HUBSPOT_DEVELOPER_API_KEY;
  const appId = process.env.HUBSPOT_APP_ID;
  if (!devKey || !appId) {
    res.status(503).json({ error: "HUBSPOT_DEVELOPER_API_KEY and HUBSPOT_APP_ID required for webhook management" });
    return null;
  }
  return { devKey, appId };
}

router.get("/crm-hs/webhooks", requireAuth, async (req: AuthenticatedRequest, res) => {
  const creds = requireDevKey(res); if (!creds) return;
  try { res.json({ webhooks: await Webhooks.list(creds.devKey, creds.appId) }); }
  catch (err) { handleHsError(err, res); }
});

router.post("/crm-hs/webhooks", requireAuth, async (req: AuthenticatedRequest, res) => {
  const creds = requireDevKey(res); if (!creds) return;
  const { target_url, event_type, property_name } = req.body as {
    target_url?: string; event_type: any; property_name?: string;
  };
  try {
    if (target_url) await Webhooks.setSettings(creds.devKey, creds.appId, target_url);
    res.status(201).json(await Webhooks.subscribe(creds.devKey, creds.appId, event_type, property_name));
  } catch (err) { handleHsError(err, res); }
});

router.delete("/crm-hs/webhooks/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const creds = requireDevKey(res); if (!creds) return;
  try { await Webhooks.delete(creds.devKey, creds.appId, String(req.params.id)); res.json({ success: true }); }
  catch (err) { handleHsError(err, res); }
});

// ─── LEAD SYNC ────────────────────────────────────────────────────────────────

router.post("/crm-hs/sync/lead/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const { data: lead } = await supabase
    .from("leads").select("*")
    .eq("id", String(req.params.id)).eq("user_id", req.userId!).single();
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }

  const mapping = await getFieldMapping(req.userId!);
  try {
    let companyRecordId: string | undefined;
    if (mapping.company_name && lead.company_domain) {
      try {
        const { record_id } = await Companies.upsert(key, {
          name: lead.company_name, domain: lead.company_domain,
        });
        companyRecordId = record_id;
      } catch { /* skip company if upsert fails */ }
    }

    const { record_id: contactRecordId } = await Contacts.upsert(key, {
      first_name: mapping.first_name ? lead.first_name : undefined,
      last_name: mapping.last_name ? lead.last_name : undefined,
      email: mapping.email ? lead.email : undefined,
      job_title: mapping.job_title ? lead.job_title : undefined,
      linkedin: mapping.linkedin_url ? lead.linkedin_url : undefined,
      company_record_id: companyRecordId,
    });

    const listId = await getHubspotListId(req.userId!);
    if (listId && contactRecordId) {
      try { await Lists.addMembers(key, listId, [contactRecordId]); } catch { /* already a member */ }
    }

    await supabase.from("leads").update({
      hubspot_contact_id: contactRecordId,
      hubspot_sync_status: "synced",
      hubspot_sync_error: null,
      hubspot_synced_at: new Date().toISOString(),
      hubspot_company_id: companyRecordId ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", String(req.params.id));

    await supabase.from("crm_sync_log").insert({
      user_id: req.userId!, lead_id: String(req.params.id),
      crm_type: "hubspot", operation: "upsert_contact", status: "success",
    });

    res.json({ success: true, hubspot_contact_id: contactRecordId });
  } catch (err: any) {
    await supabase.from("leads").update({
      hubspot_sync_status: "error", hubspot_sync_error: err.message,
      updated_at: new Date().toISOString(),
    }).eq("id", String(req.params.id));
    handleHsError(err, res);
  }
});

router.post("/crm-hs/sync-list/:listId", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const mapping = await getFieldMapping(req.userId!);
  const hubspotListId = await getHubspotListId(req.userId!);

  const { data: leads } = await supabase
    .from("leads").select("*")
    .eq("user_id", req.userId!)
    .eq("lead_list_id", String(req.params.listId))
    .eq("review_status", "approved");

  if (!leads?.length) { res.json({ total: 0, succeeded: 0, failed: 0 }); return; }

  let succeeded = 0, failed = 0;
  for (const lead of leads) {
    await new Promise(r => setTimeout(r, 100)); // conservative pacing vs HubSpot burst limits
    try {
      let companyRecordId: string | undefined;
      if (mapping.company_name && lead.company_domain) {
        try {
          const { record_id } = await Companies.upsert(key, { name: lead.company_name, domain: lead.company_domain });
          companyRecordId = record_id;
        } catch { /* skip company */ }
      }
      const { record_id: contactRecordId } = await Contacts.upsert(key, {
        first_name: mapping.first_name ? lead.first_name : undefined,
        last_name: mapping.last_name ? lead.last_name : undefined,
        email: mapping.email ? lead.email : undefined,
        job_title: mapping.job_title ? lead.job_title : undefined,
        linkedin: mapping.linkedin_url ? lead.linkedin_url : undefined,
        company_record_id: companyRecordId,
      });
      if (hubspotListId && contactRecordId) {
        try { await Lists.addMembers(key, hubspotListId, [contactRecordId]); } catch { /* already a member */ }
      }
      await supabase.from("leads").update({
        hubspot_contact_id: contactRecordId, hubspot_sync_status: "synced",
        hubspot_sync_error: null, hubspot_synced_at: new Date().toISOString(),
        hubspot_company_id: companyRecordId ?? null, updated_at: new Date().toISOString(),
      }).eq("id", lead.id);
      succeeded++;
    } catch (err: any) {
      await supabase.from("leads").update({ hubspot_sync_status: "error", hubspot_sync_error: err.message }).eq("id", lead.id);
      failed++;
    }
  }
  res.json({ total: leads.length, succeeded, failed });
});

router.post("/crm-hs/sync/bulk", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const mapping = await getFieldMapping(req.userId!);
  const { data: leads } = await supabase
    .from("leads").select("*")
    .eq("user_id", req.userId!)
    .eq("review_status", "approved")
    .neq("hubspot_sync_status", "synced");

  if (!leads?.length) { res.json({ total: 0, succeeded: 0, failed: 0 }); return; }

  let succeeded = 0, failed = 0;
  for (const lead of leads) {
    await new Promise(r => setTimeout(r, 100));
    try {
      let companyRecordId: string | undefined;
      if (lead.company_domain) {
        try {
          const { record_id } = await Companies.upsert(key, {
            name: lead.company_name, domain: lead.company_domain,
          });
          companyRecordId = record_id;
        } catch { /* skip company */ }
      }
      const { record_id } = await Contacts.upsert(key, {
        first_name: lead.first_name, last_name: lead.last_name,
        email: lead.email, job_title: lead.job_title,
        linkedin: lead.linkedin_url, company_record_id: companyRecordId,
      });
      await supabase.from("leads").update({
        hubspot_contact_id: record_id, hubspot_sync_status: "synced",
        hubspot_sync_error: null, hubspot_synced_at: new Date().toISOString(),
        hubspot_company_id: companyRecordId ?? null, updated_at: new Date().toISOString(),
      }).eq("id", lead.id);
      succeeded++;
    } catch {
      await supabase.from("leads").update({ hubspot_sync_status: "error" }).eq("id", lead.id);
      failed++;
    }
  }
  res.json({ total: leads.length, succeeded, failed });
});

export default router;