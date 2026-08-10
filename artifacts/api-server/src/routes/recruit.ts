import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { aggregateSignals, computeFingerprint, type RawPosting } from "../lib/jobSignalsAggregate";
import { triggerScrape, triggerCandidateSearch } from "../lib/n8nTrigger";

const router: IRouter = Router();

// Finds (or creates) a lead_lists row for this user with the given label —
// e.g. "Imported clients" — mirroring how "Imported candidates" already works.
// No new columns needed: label/source/status/total_count already exist on lead_lists.
async function getOrCreateLeadList(userId: string, label: string, source: string): Promise<string> {
  const { data: existing } = await supabase
    .from("lead_lists")
    .select("id")
    .eq("user_id", userId)
    .eq("label", label)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("lead_lists")
    .insert({
      user_id: userId,
      label,
      source,
      status: "active",
      total_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(`Failed to create lead list "${label}": ${error?.message ?? "unknown error"}`);
  }
  return created.id;
}

async function bumpLeadListCount(listId: string): Promise<void> {
  const { data } = await supabase.from("lead_lists").select("total_count").eq("id", listId).single();
  await supabase
    .from("lead_lists")
    .update({ total_count: (data?.total_count ?? 0) + 1, updated_at: new Date().toISOString() })
    .eq("id", listId);
}

// ── Dashboard stats ────────────────────────────────────────────────────────────

router.get("/recruit/dashboard", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.userId!;
  try {
    const [rolesRes, candidatesRes, submissionsRes, interviewsRes] = await Promise.all([
      supabase.from("roles").select("id", { count: "exact" }).eq("user_id", userId).eq("status", "active"),
      supabase.from("applications").select("id", { count: "exact" })
        .eq("user_id", userId)
        .in("stage", ["contacted", "responded", "screening", "shortlisted"]),
      supabase.from("applications").select("id", { count: "exact" })
        .eq("user_id", userId).eq("stage", "submitted"),
      supabase.from("interviews").select("id", { count: "exact" })
        .eq("user_id", userId)
        .gte("scheduled_at", new Date(Date.now() - 7 * 86400000).toISOString())
        .lte("scheduled_at", new Date(Date.now() + 7 * 86400000).toISOString()),
    ]);

    res.json({
      open_roles: rolesRes.count ?? 0,
      candidates_in_play: candidatesRes.count ?? 0,
      awaiting_client: submissionsRes.count ?? 0,
      interviews_this_week: interviewsRes.count ?? 0,
    });
  } catch (err) {
    req.log.error({ err }, "recruit dashboard stats failed");
    res.status(500).json({ error: "Failed to load dashboard stats" });
  }
});

// ── Roles ──────────────────────────────────────────────────────────────────────

router.get("/recruit/roles", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data, error } = await supabase
    .from("roles")
    .select("*, clients:client_id(id, first_name, last_name, company_name)")
    .eq("user_id", req.userId!)
    .order("created_at", { ascending: false });

  if (error) {
    req.log.error({ error }, "Failed to list roles");
    res.status(500).json({ error: "Failed to fetch roles" });
    return;
  }
  res.json(data ?? []);
});

router.post("/recruit/roles", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { title, client_id, description, must_have_skills, nice_to_have_skills,
          salary_min, salary_max, currency, location, remote_ok } = req.body;

  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  if (client_id) {
    const { data: clientRow } = await supabase
      .from("leads")
      .select("id")
      .eq("id", client_id)
      .eq("user_id", req.userId!)
      .maybeSingle();
    if (!clientRow) {
      res.status(403).json({ error: "client not found or access denied" });
      return;
    }
  }

  const { data, error } = await supabase
    .from("roles")
    .insert({
      user_id: req.userId!,
      title,
      client_id: client_id ?? null,
      description: description ?? null,
      must_have_skills: must_have_skills ?? [],
      nice_to_have_skills: nice_to_have_skills ?? [],
      salary_min: salary_min ?? null,
      salary_max: salary_max ?? null,
      currency: currency ?? "USD",
      location: location ?? null,
      remote_ok: remote_ok ?? false,
      status: "active",
      brief_parse_status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    req.log.error({ error }, "Failed to create role");
    res.status(500).json({ error: "Failed to create role" });
    return;
  }
  res.status(201).json(data);
});

router.get("/recruit/roles/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data, error } = await supabase
    .from("roles")
    .select("*, clients:client_id(id, first_name, last_name, company_name, email)")
    .eq("id", req.params.id)
    .eq("user_id", req.userId!)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Role not found" });
    return;
  }
  res.json(data);
});

router.patch("/recruit/roles/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if ("client_id" in req.body && req.body.client_id) {
    const { data: clientRow } = await supabase
      .from("leads")
      .select("id")
      .eq("id", req.body.client_id)
      .eq("user_id", req.userId!)
      .maybeSingle();
    if (!clientRow) {
      res.status(403).json({ error: "client not found or access denied" });
      return;
    }
  }

  const allowed = [
    "title", "client_id", "description", "must_have_skills", "nice_to_have_skills",
    "salary_min", "salary_max", "currency", "location", "remote_ok",
    "status", "brief_parse_status",
  ];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }

  const { data, error } = await supabase
    .from("roles")
    .update(updates)
    .eq("id", req.params.id)
    .eq("user_id", req.userId!)
    .select()
    .single();

  if (error || !data) {
    req.log.error({ error }, "Failed to update role");
    res.status(500).json({ error: "Failed to update role" });
    return;
  }
  res.json(data);
});

router.delete("/recruit/roles/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { error } = await supabase
    .from("roles")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .eq("user_id", req.userId!);

  if (error) {
    res.status(500).json({ error: "Failed to close role" });
    return;
  }
  res.status(204).send();
});

// ── Applications (pipeline) ────────────────────────────────────────────────────

router.get("/recruit/applications", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { role_id } = req.query;
  let query = supabase
    .from("applications")
    .select("*, candidate:lead_id(id, first_name, last_name, email, job_title, company_name, linkedin_url)")
    .eq("user_id", req.userId!);

  if (role_id) query = query.eq("role_id", role_id as string);
  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) {
    req.log.error({ error }, "Failed to list applications");
    res.status(500).json({ error: "Failed to fetch applications" });
    return;
  }
  res.json(data ?? []);
});

router.post("/recruit/applications", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { role_id, lead_id, stage, notes } = req.body;
  if (!role_id || !lead_id) {
    res.status(400).json({ error: "role_id and lead_id are required" });
    return;
  }

  const { data: roleRow } = await supabase
    .from("roles")
    .select("id")
    .eq("id", role_id)
    .eq("user_id", req.userId!)
    .maybeSingle();
  if (!roleRow) {
    res.status(403).json({ error: "role not found or access denied" });
    return;
  }

  const { data: leadRow } = await supabase
    .from("leads")
    .select("id")
    .eq("id", lead_id)
    .eq("user_id", req.userId!)
    .maybeSingle();
  if (!leadRow) {
    res.status(403).json({ error: "lead not found or access denied" });
    return;
  }

  await supabase
    .from("leads")
    .update({ audience_type: "candidate", updated_at: new Date().toISOString() })
    .eq("id", lead_id)
    .eq("user_id", req.userId!);

  const { data, error } = await supabase
    .from("applications")
    .insert({
      user_id: req.userId!,
      role_id,
      lead_id,
      stage: stage ?? "sourced",
      notes: notes ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    req.log.error({ error }, "Failed to create application");
    res.status(500).json({ error: "Failed to create application" });
    return;
  }
  res.status(201).json(data);
});

router.patch("/recruit/applications/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const allowed = ["stage", "notes", "match_score", "rejection_reason"];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }

  const { data, error } = await supabase
    .from("applications")
    .update(updates)
    .eq("id", req.params.id)
    .eq("user_id", req.userId!)
    .select()
    .single();

  if (error || !data) {
    res.status(500).json({ error: "Failed to update application" });
    return;
  }
  res.json(data);
});

// ── Clients (leads WHERE audience_type='client') ───────────────────────────────

router.get("/recruit/clients", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { search, status } = req.query;

  let query = supabase
    .from("leads")
    .select("*")
    .eq("user_id", req.userId!)
    .eq("audience_type", "client")
    .order("updated_at", { ascending: false });

  if (search) {
    query = query.or(
      `company_name.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`
    );
  }
  if (status) query = query.eq("review_status", status as string);

  const { data, error } = await query;
  if (error) {
    req.log.error({ error }, "Failed to list clients");
    res.status(500).json({ error: "Failed to fetch clients" });
    return;
  }

  const clientIds = (data ?? []).map((c) => c.id);
  let roleCounts: Record<string, number> = {};
  if (clientIds.length > 0) {
    const { data: roles } = await supabase
      .from("roles")
      .select("client_id")
      .in("client_id", clientIds)
      .eq("status", "active");

    for (const r of roles ?? []) {
      roleCounts[r.client_id] = (roleCounts[r.client_id] ?? 0) + 1;
    }
  }

  res.json(
    (data ?? []).map((c) => ({ ...c, open_roles_count: roleCounts[c.id] ?? 0 }))
  );
});

router.post("/recruit/clients", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { first_name, last_name, email, company_name, job_title, linkedin_url, fee_model } = req.body;

  let leadListId: string | null = null;
  try {
    leadListId = await getOrCreateLeadList(req.userId!, "Imported clients", "manual_add");
  } catch (err) {
    req.log.error({ err }, "Failed to resolve Imported clients list — continuing without list tag");
  }

  const { data, error } = await supabase
    .from("leads")
    .insert({
      user_id: req.userId!,
      first_name: first_name ?? null,
      last_name: last_name ?? null,
      email: email ?? null,
      company_name: company_name ?? null,
      job_title: job_title ?? null,
      linkedin_url: linkedin_url ?? null,
      audience_type: "client",
      review_status: "approved",
      fee_model: fee_model ?? null,
      lead_list_id: leadListId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    req.log.error({ error }, "Failed to create client");
    res.status(500).json({ error: "Failed to create client" });
    return;
  }
  if (leadListId) await bumpLeadListCount(leadListId);
  res.status(201).json(data);
});

// ── Candidates (leads WHERE audience_type='candidate') ─────────────────────────

router.get("/recruit/candidates", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { search, skills, location, limit = "50", offset = "0" } = req.query;

  let query = supabase
    .from("leads")
    .select("*")
    .eq("user_id", req.userId!)
    .eq("audience_type", "candidate")
    .order("updated_at", { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,job_title.ilike.%${search}%,company_name.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) {
    req.log.error({ error }, "Failed to list candidates");
    res.status(500).json({ error: "Failed to fetch candidates" });
    return;
  }
  res.json(data ?? []);
});

router.get("/recruit/candidates/search", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { q, skills, location, role_id, limit = "50" } = req.query;

  let networkQuery = supabase
    .from("leads")
    .select("*, _network:id")
    .eq("user_id", req.userId!)
    .eq("audience_type", "candidate")
    .limit(Number(limit));

  if (q) {
    networkQuery = networkQuery.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,job_title.ilike.%${q}%,company_name.ilike.%${q}%`
    );
  }

  const { data: networkCandidates } = await networkQuery;

  let roleSkills: string[] = [];
  if (role_id) {
    const { data: role } = await supabase
      .from("roles")
      .select("must_have_skills, nice_to_have_skills")
      .eq("id", role_id as string)
      .eq("user_id", req.userId!)
      .maybeSingle();
    if (role) {
      roleSkills = [...(role.must_have_skills ?? []), ...(role.nice_to_have_skills ?? [])];
    }
  }

  res.json({
    network: (networkCandidates ?? []).map((c) => ({ ...c, in_network: true })),
    role_skills: roleSkills,
  });
});

// ── Candidate Sourcing (LinkedIn profile search via n8n) ────────────────────────

router.post("/recruit/candidates/trigger", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { role, location, experience, max_items } = req.body;

  if (!role?.trim()) {
    res.status(400).json({ error: "role is required" });
    return;
  }

  try {
    await triggerCandidateSearch({
      userId: req.userId!,
      role: role.trim(),
      location: location || "India",
      experience,
      maxItems: max_items,
    });
    res.status(202).json({ triggered: true });
  } catch (err) {
    req.log.error({ err }, "Failed to trigger candidate search");
    res.status(502).json({ error: "Could not reach the candidate sourcing workflow" });
  }
});

// Sourced candidates are auto-persisted by the n8n "Candidate Sourcing" branch as
// soon as they're scraped — no separate "add to network" step. This is the single
// list both the Search tab (optionally filtered by the role just searched) and the
// My Candidates tab (unfiltered — everything ever sourced) read from.
router.get("/recruit/candidate-signals", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { role, min_score, q } = req.query;

  let query = supabase
    .from("candidate_sourcing_raw")
    .select("*")
    .eq("user_id", req.userId!)
    .order("job_seeking_score", { ascending: false })
    .order("scraped_at", { ascending: false });

  if (role) query = query.ilike("search_role", `%${role}%`);
  if (min_score) query = query.gte("job_seeking_score", Number(min_score));
  if (q) {
    query = query.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,headline.ilike.%${q}%,current_title.ilike.%${q}%,current_company.ilike.%${q}%`
    );
  }

  const { data: candidates, error } = await query;
  if (error) {
    req.log.error({ error }, "Failed to list candidate signals");
    res.status(500).json({ error: "Failed to fetch candidate signals" });
    return;
  }

  res.json(candidates ?? []);
});

// Real delete — removes the row from Supabase entirely, scoped to the owner so
// one user can't delete another's sourced candidates.
router.delete("/recruit/candidate-signals/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { error, count } = await supabase
    .from("candidate_sourcing_raw")
    .delete({ count: "exact" })
    .eq("id", req.params.id)
    .eq("user_id", req.userId!);

  if (error) {
    req.log.error({ error }, "Failed to delete candidate signal");
    res.status(500).json({ error: "Failed to delete candidate" });
    return;
  }
  if (!count) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }
  res.status(204).send();
});

// ── Job Signals ─────────────────────────────────────────────────────────────────

router.get("/recruit/job-signals", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { days_open_min, days_open_max, reposted } = req.query;

  const sinceIso = new Date(Date.now() - 30 * 86400000).toISOString();

  const { data: rawRows, error } = await supabase
    .from("job_signal_raw_postings")
    .select("id, source, company_name, company_domain, role_title, location, work_model, salary_min, salary_max, scraped_at")
    .eq("user_id", req.userId!)
    .gte("scraped_at", sinceIso)
    .order("scraped_at", { ascending: true });

  if (error) {
    req.log.error({ error }, "Failed to list job signal raw postings");
    res.status(500).json({ error: "Failed to fetch job signals" });
    return;
  }

  let signals = aggregateSignals((rawRows ?? []) as RawPosting[]);

  if (reposted === "true") signals = signals.filter((s) => s.reposted);
  if (days_open_min) signals = signals.filter((s) => s.days_open >= Number(days_open_min));
  if (days_open_max) signals = signals.filter((s) => s.days_open <= Number(days_open_max));

  const domains = Array.from(new Set(signals.map((s) => s.company_domain).filter(Boolean))) as string[];
  let clientByDomain: Record<string, string> = {};
  if (domains.length > 0) {
    const { data: clients } = await supabase
      .from("leads")
      .select("id, company_domain")
      .eq("user_id", req.userId!)
      .eq("audience_type", "client")
      .in("company_domain", domains);
    for (const c of clients ?? []) {
      if (c.company_domain) clientByDomain[c.company_domain] = c.id;
    }
  }

  const { data: dismissals } = await supabase
    .from("job_signal_dismissals")
    .select("fingerprint")
    .eq("user_id", req.userId!);
  const dismissedSet = new Set((dismissals ?? []).map((d) => d.fingerprint));

  const enriched = signals
    .filter((s) => !dismissedSet.has(s.id))
    .map((s) => ({
      ...s,
      client_id: s.company_domain ? clientByDomain[s.company_domain] ?? null : null,
    }));

  const sourceHealth = (["linkedin", "indeed"] as const).map((source) => {
    const rowsForSource = (rawRows ?? []).filter((r) => r.source === source);
    const lastSuccessAt = rowsForSource.length > 0
      ? rowsForSource[rowsForSource.length - 1].scraped_at
      : null;
    const degraded = !lastSuccessAt || (Date.now() - new Date(lastSuccessAt).getTime()) > 48 * 3600000;
    return { source, last_success_at: lastSuccessAt, degraded };
  });

  const trackingStartedAt = (rawRows ?? [])[0]?.scraped_at ?? null;

  res.json({ signals: enriched, source_health: sourceHealth, tracking_started_at: trackingStartedAt });
});

router.post("/recruit/job-signals/trigger", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { source, keyword, location, experience, industry, country, max_jobs } = req.body;

  if (!keyword) {
    res.status(400).json({ error: "keyword is required" });
    return;
  }
  if (!source || !["linkedin", "indeed", "both"].includes(source)) {
    res.status(400).json({ error: "source must be 'linkedin', 'indeed', or 'both'" });
    return;
  }

  try {
    await triggerScrape({
      userId: req.userId!,
      source,
      keyword,
      location,
      experience,
      industry,
      country: country || "IN",
      maxJobs: max_jobs,
    });
    res.status(202).json({ triggered: true });
  } catch (err) {
    req.log.error({ err }, "Failed to trigger job signal scrape");
    res.status(502).json({ error: "Could not reach the scraping workflow" });
  }
});

router.post("/recruit/job-signals/:fingerprint/add-to-pipeline", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { company_name, company_domain } = req.body;
  if (!company_name) {
    res.status(400).json({ error: "company_name is required" });
    return;
  }

  let clientId: string | null = null;

  if (company_domain) {
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("user_id", req.userId!)
      .eq("audience_type", "client")
      .eq("company_domain", company_domain)
      .maybeSingle();
    if (existing) clientId = existing.id;
  }

  if (!clientId) {
    let leadListId: string;
    try {
      leadListId = await getOrCreateLeadList(req.userId!, "Job Signal Clients", "job_signals");
    } catch (err) {
      req.log.error({ err }, "Failed to create Job Signal Clients lead list");
      res.status(500).json({ error: "Failed to create lead list for client" });
      return;
    }

    const { data: created, error } = await supabase
      .from("leads")
      .insert({
        user_id: req.userId!,
        company_name,
        company_domain: company_domain ?? null,
        audience_type: "client",
        review_status: "prospect",
        lead_list_id: leadListId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      req.log.error({ error }, "Failed to create client from job signal");
      res.status(500).json({ error: "Failed to add client" });
      return;
    }
    clientId = created.id;
    await bumpLeadListCount(leadListId);
  }

  res.json({ client_id: clientId });
});

router.post("/recruit/job-signals/:fingerprint/dismiss", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { error } = await supabase
    .from("job_signal_dismissals")
    .upsert(
      { user_id: req.userId!, fingerprint: req.params.fingerprint },
      { onConflict: "user_id,fingerprint" }
    );

  if (error) {
    req.log.error({ error }, "Failed to dismiss job signal");
    res.status(500).json({ error: "Failed to dismiss" });
    return;
  }
  res.json({ dismissed: true });
});

router.post("/recruit/job-signals/:fingerprint/pitch", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { message, company_name } = req.body;
  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const { error } = await supabase.from("job_signal_pitches").insert({
    user_id: req.userId!,
    fingerprint: req.params.fingerprint,
    company_name: company_name ?? "",
    message: message.trim(),
    created_at: new Date().toISOString(),
  });

  if (error) {
    req.log.error({ error }, "Failed to queue pitch");
    res.status(500).json({ error: "Failed to queue pitch" });
    return;
  }
  res.json({ queued: true });
});



// ── Client Sourcing (LinkedIn recruiter/TA contact search via n8n) ─────────────
// Reads client_sourcing_raw — sourced recruiter/TA contacts at target companies,
// same pattern as candidate-signals reads candidate_sourcing_raw.

router.get("/recruit/client-signals", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { min_score, q } = req.query;

  let query = supabase
    .from("client_sourcing_raw")
    .select("*")
    .eq("user_id", req.userId!)
    .order("hiring_signal_score", { ascending: false })
    .order("scraped_at", { ascending: false });

  if (min_score) query = query.gte("hiring_signal_score", Number(min_score));
  if (q) {
    query = query.or(
      `company_name.ilike.%${q}%,about.ilike.%${q}%,company_linkedin_url.ilike.%${q}%`
    );
  }

  const { data, error } = await query;
  if (error) {
    req.log.error({ error }, "Failed to list client signals");
    res.status(500).json({ error: "Failed to fetch client signals" });
    return;
  }
  res.json(data ?? []);
});

router.delete("/recruit/client-signals/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { error, count } = await supabase
    .from("client_sourcing_raw")
    .delete({ count: "exact" })
    .eq("id", req.params.id)
    .eq("user_id", req.userId!);

  if (error) {
    req.log.error({ error }, "Failed to delete client signal");
    res.status(500).json({ error: "Failed to delete contact" });
    return;
  }
  if (!count) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }
  res.status(204).send();
});

router.post("/recruit/client-signals/:id/add-to-pipeline", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data: contact } = await supabase
    .from("client_sourcing_raw")
    .select("*")
    .eq("id", req.params.id)
    .eq("user_id", req.userId!)
    .maybeSingle();

  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  let leadListId: string;
  try {
    leadListId = await getOrCreateLeadList(req.userId!, "Sourced Clients", "client_sourcing");
  } catch (err) {
    req.log.error({ err }, "Failed to create Sourced Clients lead list");
    res.status(500).json({ error: "Failed to create lead list for client" });
    return;
  }

  const { data: created, error } = await supabase
  .from("leads")
  .insert({
    user_id: req.userId!,
    first_name: contact.first_name ?? null,
    last_name: contact.last_name ?? null,
    company_name: contact.company_name,
    email: contact.contact_email,
    linkedin_url: contact.company_linkedin_url,
    audience_type: "client",
    review_status: "prospect",
    lead_list_id: leadListId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
    .select("id")
    .single();

  if (error) {
    req.log.error({ error }, "Failed to create client from sourced contact");
    res.status(500).json({ error: "Failed to add client" });
    return;
  }
  await bumpLeadListCount(leadListId);
  res.json({ client_id: created.id });
});


export default router;