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

  res.json(ReviewLeadResponse.parse(data));
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

  res.json(BulkReviewLeadsResponse.parse({ updated_count: data?.length ?? 0 }));
});

export default router;
