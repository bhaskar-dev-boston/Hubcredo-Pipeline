// src/routes/crm.ts
// API key read from process.env.ATTIO_API_KEY (Replit Secret)

import { Router, type IRouter, type Response } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import {
  Workspace, People, Companies, Lists, Notes, Tasks, Attributes, Webhooks,
  AttioError,
} from "../lib/attioService";

const router: IRouter = Router();

function getApiKey(): string | null {
  return process.env.ATTIO_API_KEY ?? null;
}

function requireApiKey(res: Response): string | null {
  const key = getApiKey();
  if (!key) {
    res.status(503).json({ error: "ATTIO_API_KEY not configured in server secrets" });
    return null;
  }
  return key;
}

function handleAttioError(err: unknown, res: Response) {
  if (err instanceof AttioError) {
    res.status(err.status >= 400 && err.status < 500 ? err.status : 502).json({ error: err.message });
  } else {
    res.status(500).json({ error: "Internal error" });
  }
}

async function getFieldMapping(userId: string): Promise<Record<string, boolean>> {
  const { data } = await supabase
    .from("crm_connections")
    .select("field_mapping")
    .eq("user_id", userId)
    .single();
  return (data?.field_mapping as Record<string, boolean>) ?? {
    first_name: true, last_name: true, email: true,
    job_title: true, company_name: true, linkedin_url: true,
  };
}

async function getAttioListId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("crm_connections")
    .select("attio_list_id")
    .eq("user_id", userId)
    .single();
  return data?.attio_list_id ?? null;
}

// ─── CONNECTION STATUS ────────────────────────────────────────────────────────

router.get("/crm/connection", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = getApiKey();
  if (!key) { res.status(404).json({ error: "ATTIO_API_KEY not set in server secrets" }); return; }
  try {
    const ws = await Workspace.self(key);
    res.json({ connected: true, workspace_id: ws.workspace_id, workspace_name: ws.name, source: "env" });
  } catch (err) { handleAttioError(err, res); }
});

// ─── USER PREFERENCES ────────────────────────────────────────────────────────

router.get("/crm/preferences", requireAuth, async (req: AuthenticatedRequest, res) => {
  const { data } = await supabase
    .from("crm_connections")
    .select("field_mapping, attio_list_id")
    .eq("user_id", req.userId!)
    .single();
  res.json({
    field_mapping: data?.field_mapping ?? {
      first_name: true, last_name: true, email: true,
      job_title: true, company_name: true, linkedin_url: true,
    },
    attio_list_id: data?.attio_list_id ?? null,
  });
});

router.put("/crm/preferences", requireAuth, async (req: AuthenticatedRequest, res) => {
  const { field_mapping, attio_list_id } = req.body as {
    field_mapping?: Record<string, boolean>;
    attio_list_id?: string | null;
  };
  await supabase.from("crm_connections").upsert({
    user_id: req.userId!,
    crm_type: "attio",
    access_token: "env",
    ...(field_mapping ? { field_mapping } : {}),
    ...(attio_list_id !== undefined ? { attio_list_id } : {}),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,crm_type" });
  res.json({ success: true });
});

// ─── WORKSPACE ────────────────────────────────────────────────────────────────

router.get("/crm/workspace/members", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { res.json({ members: await Workspace.members(key) }); }
  catch (err) { handleAttioError(err, res); }
});

// ─── PEOPLE ───────────────────────────────────────────────────────────────────
//
// FIX: Two bugs were here causing 400 "Body payload validation error":
//
// BUG 1 — Wrong sorts format:
//   ❌ sorts: [{ attribute: { slug: "created_at" }, direction: "desc" }]
//   ✅ sorts: [{ attribute: "created_at", direction: "desc" }]
//
// BUG 2 — Wrong filter format:
//   ❌ filter: { filters: [{ attribute: { slug: "email_addresses" }, condition: "contains", value: q }] }
//   ✅ filter: { "email_addresses": { "email_address": { "$contains": q } } }
//      or for name:  { "$or": [{ name: { first_name: { "$contains": q } } }, ...] }
//
// Attio v2 does NOT accept { filters: [...] } — that format does not exist in the API.

router.get("/crm/people", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try {
    const { q, limit = "25", offset = "0" } = req.query as Record<string, string>;
    const parsedLimit = Math.min(parseInt(limit) || 25, 100);
    const parsedOffset = parseInt(offset) || 0;

    // ── User-scoping: only show contacts synced by this user ───────────────
    const { data: userLeads } = await supabase
      .from("leads")
      .select("email")
      .eq("user_id", req.userId!)
      .not("crm_contact_id", "is", null);

    const userEmails = (userLeads || []).map((l: any) => l.email?.toLowerCase()).filter(Boolean) as string[];

    if (userEmails.length === 0) {
      // User has no synced leads — return empty
      res.json({ data: [], next_page_offset: null });
      return;
    }

    // ✅ Correct Attio v2 sorts format — attribute is a plain string slug
    const sorts = [{ attribute: "created_at", direction: "desc" as const }];

    let filter: Record<string, any> | undefined;

    if (q?.trim()) {
      const search = q.trim();
      if (search.includes("@")) {
        filter = {
          email_addresses: { email_address: { "$contains": search } },
        };
      } else {
        filter = {
          "$or": [
            { name: { first_name: { "$contains": search } } },
            { name: { last_name: { "$contains": search } } },
          ],
        };
      }
    }

    const result = await People.query(key, { limit: parsedLimit, offset: parsedOffset, sorts, filter });

    // Filter to only include people whose email is in the user's synced leads
    if (result?.data) {
      result.data = result.data.filter((person: any) => {
        const emails: string[] = (person.values?.email_addresses || [])
          .map((e: any) => (e.email_address || "").toLowerCase())
          .filter(Boolean);
        return emails.some((email) => userEmails.includes(email));
      });
    }

    res.json(result);
  } catch (err) {
    console.error("CRM PEOPLE ERROR:", err);
    handleAttioError(err, res);
  }
});

router.get("/crm/people/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { res.json(await People.get(key, req.params.id)); }
  catch (err) { handleAttioError(err, res); }
});

router.patch("/crm/people/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { res.json(await People.update(key, req.params.id, req.body.values)); }
  catch (err) { handleAttioError(err, res); }
});

router.delete("/crm/people/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { await People.delete(key, req.params.id); res.json({ success: true }); }
  catch (err) { handleAttioError(err, res); }
});

// ─── COMPANIES ────────────────────────────────────────────────────────────────

router.get("/crm/companies", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const { limit = "25", offset = "0" } = req.query as Record<string, string>;
  try {
    res.json(await Companies.query(key, {
      limit: Math.min(parseInt(limit), 100),
      offset: parseInt(offset),
      // ✅ Correct sorts format for companies too
      sorts: [{ attribute: "created_at", direction: "desc" }],
    }));
  } catch (err) { handleAttioError(err, res); }
});

// ─── LISTS ────────────────────────────────────────────────────────────────────

router.get("/crm/lists", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { res.json({ lists: await Lists.list(key) }); }
  catch (err) { handleAttioError(err, res); }
});

router.post("/crm/lists", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const { name, parent_object = "people" } = req.body as { name: string; parent_object?: any };
  try { res.status(201).json(await Lists.create(key, name, parent_object)); }
  catch (err) { handleAttioError(err, res); }
});

router.get("/crm/lists/:id/entries", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const { limit = "50", offset = "0" } = req.query as Record<string, string>;
  try {
    res.json(await Lists.entries(key, req.params.id, {
      limit: parseInt(limit),
      offset: parseInt(offset),
    }));
  } catch (err) { handleAttioError(err, res); }
});

router.post("/crm/lists/:id/entries", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const { target_object, record_id } = req.body as { target_object: string; record_id: string };
  try {
    res.status(201).json({ entry_id: await Lists.addEntry(key, req.params.id, target_object, record_id) });
  } catch (err) { handleAttioError(err, res); }
});

router.patch("/crm/lists/:listId/entries/:entryId", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try {
    await Lists.updateEntry(key, req.params.listId, req.params.entryId, req.body.values);
    res.json({ success: true });
  } catch (err) { handleAttioError(err, res); }
});

router.delete("/crm/lists/:listId/entries/:entryId", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try {
    await Lists.removeEntry(key, req.params.listId, req.params.entryId);
    res.json({ success: true });
  } catch (err) { handleAttioError(err, res); }
});

// ─── NOTES ────────────────────────────────────────────────────────────────────

router.get("/crm/notes", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const { parent_object, parent_record_id } = req.query as Record<string, string>;
  try { res.json({ notes: await Notes.list(key, parent_object, parent_record_id) }); }
  catch (err) { handleAttioError(err, res); }
});

router.post("/crm/notes", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const { parent_object, parent_record_id, title, content } = req.body as {
    parent_object: any; parent_record_id: string; title: string; content: string;
  };
  try {
    res.status(201).json(await Notes.create(key, {
      parentObject: parent_object,
      parentRecordId: parent_record_id,
      title,
      content,
    }));
  } catch (err) { handleAttioError(err, res); }
});

router.delete("/crm/notes/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { await Notes.delete(key, req.params.id); res.json({ success: true }); }
  catch (err) { handleAttioError(err, res); }
});

// ─── TASKS ────────────────────────────────────────────────────────────────────

router.get("/crm/tasks", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const {
    is_completed,
    linked_record_id,
    linked_record_object, // Attio requires this alongside linked_record_id
    limit = "50",
  } = req.query as Record<string, string>;
  try {
    res.json({ tasks: await Tasks.list(key, {
      isCompleted: is_completed === undefined ? undefined : is_completed === "true",
      linkedRecordId: linked_record_id,
      linkedRecordObject: linked_record_object ?? "people", // default to "people"
      limit: parseInt(limit),
    })});
  } catch (err) { handleAttioError(err, res); }
});

router.post("/crm/tasks", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const { content, deadline_at, assignee_id, linked_record_object, linked_record_id } = req.body as {
    content: string; deadline_at?: string; assignee_id?: string;
    linked_record_object?: string; linked_record_id?: string;
  };
  try {
    res.status(201).json(await Tasks.create(key, {
      content,
      deadlineAt: deadline_at,
      assigneeId: assignee_id,
      linkedRecordObject: linked_record_object,
      linkedRecordId: linked_record_id,
    }));
  } catch (err) { handleAttioError(err, res); }
});

router.patch("/crm/tasks/:id/complete", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { await Tasks.complete(key, req.params.id); res.json({ success: true }); }
  catch (err) { handleAttioError(err, res); }
});

router.delete("/crm/tasks/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { await Tasks.delete(key, req.params.id); res.json({ success: true }); }
  catch (err) { handleAttioError(err, res); }
});

// ─── ATTRIBUTES ───────────────────────────────────────────────────────────────

router.get("/crm/attributes/:objectSlug", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { res.json({ attributes: await Attributes.list(key, req.params.objectSlug) }); }
  catch (err) { handleAttioError(err, res); }
});

router.post("/crm/attributes/:objectSlug", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { res.status(201).json(await Attributes.create(key, req.params.objectSlug, req.body)); }
  catch (err) { handleAttioError(err, res); }
});

// ─── WEBHOOKS ─────────────────────────────────────────────────────────────────

router.get("/crm/webhooks", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { res.json({ webhooks: await Webhooks.list(key) }); }
  catch (err) { handleAttioError(err, res); }
});

router.post("/crm/webhooks", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const { target_url, subscriptions } = req.body as { target_url: string; subscriptions: string[] };
  try { res.status(201).json(await Webhooks.create(key, { targetUrl: target_url, subscriptions })); }
  catch (err) { handleAttioError(err, res); }
});

router.delete("/crm/webhooks/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  try { await Webhooks.delete(key, req.params.id); res.json({ success: true }); }
  catch (err) { handleAttioError(err, res); }
});

// ─── LEAD SYNC ────────────────────────────────────────────────────────────────

router.post("/crm/sync/lead/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const { data: lead } = await supabase
    .from("leads").select("*")
    .eq("id", req.params.id).eq("user_id", req.userId!).single();
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

    const { record_id: personRecordId } = await People.upsert(key, {
      first_name: mapping.first_name ? lead.first_name : undefined,
      last_name: mapping.last_name ? lead.last_name : undefined,
      email: mapping.email ? lead.email : undefined,
      job_title: mapping.job_title ? lead.job_title : undefined,
      linkedin: mapping.linkedin_url ? lead.linkedin_url : undefined,
      company_record_id: companyRecordId,
    });

    const listId = await getAttioListId(req.userId!);
    let listEntryId: string | undefined;
    if (listId && personRecordId) {
      listEntryId = await Lists.addEntry(key, listId, "people", personRecordId);
    }

    await supabase.from("leads").update({
      crm_contact_id: personRecordId,
      crm_sync_status: "synced",
      crm_sync_error: null,
      crm_synced_at: new Date().toISOString(),
      attio_company_id: companyRecordId ?? null,
      attio_list_entry_id: listEntryId ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", req.params.id);

    await supabase.from("crm_sync_log").insert({
      user_id: req.userId!, lead_id: req.params.id,
      crm_type: "attio", operation: "upsert_person", status: "success",
    });

    res.json({ success: true, crm_contact_id: personRecordId });
  } catch (err: any) {
    await supabase.from("leads").update({
      crm_sync_status: "error", crm_sync_error: err.message,
      updated_at: new Date().toISOString(),
    }).eq("id", req.params.id);
    handleAttioError(err, res);
  }
});

// ─── SYNC ALL APPROVED LEADS IN A LEAD LIST ───────────────────────────────────

router.post("/crm/sync-list/:listId", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const mapping = await getFieldMapping(req.userId!);
  const attioListId = await getAttioListId(req.userId!);

  const { data: leads } = await supabase
    .from("leads").select("*")
    .eq("user_id", req.userId!)
    .eq("lead_list_id", req.params.listId)
    .eq("review_status", "approved");

  if (!leads?.length) { res.json({ total: 0, succeeded: 0, failed: 0 }); return; }

  let succeeded = 0, failed = 0;
  for (const lead of leads) {
    await new Promise(r => setTimeout(r, 50));
    try {
      let companyRecordId: string | undefined;
      if (mapping.company_name && lead.company_domain) {
        try {
          const { record_id } = await Companies.upsert(key, { name: lead.company_name, domain: lead.company_domain });
          companyRecordId = record_id;
        } catch { /* skip company */ }
      }
      const { record_id: personRecordId } = await People.upsert(key, {
        first_name: mapping.first_name ? lead.first_name : undefined,
        last_name: mapping.last_name ? lead.last_name : undefined,
        email: mapping.email ? lead.email : undefined,
        job_title: mapping.job_title ? lead.job_title : undefined,
        linkedin: mapping.linkedin_url ? lead.linkedin_url : undefined,
        company_record_id: companyRecordId,
      });
      if (attioListId && personRecordId) {
        try { await Lists.addEntry(key, attioListId, "people", personRecordId); } catch { /* already in list */ }
      }
      await supabase.from("leads").update({
        crm_contact_id: personRecordId, crm_sync_status: "synced",
        crm_sync_error: null, crm_synced_at: new Date().toISOString(),
        attio_company_id: companyRecordId ?? null, updated_at: new Date().toISOString(),
      }).eq("id", lead.id);
      succeeded++;
    } catch (err: any) {
      await supabase.from("leads").update({ crm_sync_status: "error", crm_sync_error: err.message }).eq("id", lead.id);
      failed++;
    }
  }
  res.json({ total: leads.length, succeeded, failed });
});

router.post("/crm/sync/bulk", requireAuth, async (req: AuthenticatedRequest, res) => {
  const key = requireApiKey(res); if (!key) return;
  const mapping = await getFieldMapping(req.userId!);
  const { data: leads } = await supabase
    .from("leads").select("*")
    .eq("user_id", req.userId!)
    .eq("review_status", "approved")
    .neq("crm_sync_status", "synced");

  if (!leads?.length) { res.json({ total: 0, succeeded: 0, failed: 0 }); return; }

  let succeeded = 0, failed = 0;
  for (const lead of leads) {
    await new Promise(r => setTimeout(r, 50)); // respect 25 writes/sec
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
      const { record_id } = await People.upsert(key, {
        first_name: lead.first_name, last_name: lead.last_name,
        email: lead.email, job_title: lead.job_title,
        linkedin: lead.linkedin_url, company_record_id: companyRecordId,
      });
      await supabase.from("leads").update({
        crm_contact_id: record_id, crm_sync_status: "synced",
        crm_sync_error: null, crm_synced_at: new Date().toISOString(),
        attio_company_id: companyRecordId ?? null, updated_at: new Date().toISOString(),
      }).eq("id", lead.id);
      succeeded++;
    } catch {
      await supabase.from("leads").update({ crm_sync_status: "error" }).eq("id", lead.id);
      failed++;
    }
  }
  res.json({ total: leads.length, succeeded, failed });
});

export default router;