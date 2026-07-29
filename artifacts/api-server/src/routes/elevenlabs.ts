import { Router, type IRouter, type Request, type Response } from "express";
import { createHmac } from "crypto";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

const EL_BASE = "https://api.elevenlabs.io/v1/convai";

function elHeaders() {
  const key = process.env["ELEVENLABS_API_KEY"];
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  return { "Content-Type": "application/json", "xi-api-key": key };
}

async function elFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${EL_BASE}${path}`, {
    ...opts,
    headers: { ...elHeaders(), ...(opts.headers as Record<string, string> ?? {}) },
  });
  return res;
}

// ─── AGENTS ──────────────────────────────────────────────────────────────────
// Agents are NOT stored locally. ElevenLabs is the single source of truth —
// every route here just proxies to ElevenLabs and returns its response as-is.

// ElevenLabs' list endpoint only returns summary fields (agent_id, name,
// created_at) — voice/language/prompt/phone live in conversation_config,
// which is only returned by the per-agent detail endpoint. We flatten
// that here so the frontend always gets a consistent shape regardless
// of which route it hit.
function normalizeAgent(raw: Record<string, any>): Record<string, unknown> {
  const cfg = raw.conversation_config ?? {};
  const agentCfg = cfg.agent ?? {};
  const ttsCfg = cfg.tts ?? {};
  const phoneNumbers: Record<string, any>[] = raw.phone_numbers ?? [];

  return {
    agent_id: raw.agent_id,
    name: raw.name ?? "Untitled Agent",
    first_message: agentCfg.first_message ?? "",
    system_prompt: agentCfg.prompt?.prompt ?? "",
    voice_id: ttsCfg.voice_id ?? null,
    language: agentCfg.language ?? "en",
    phone_number_id: phoneNumbers[0]?.phone_number_id ?? null,
    phone_number: phoneNumbers[0]?.phone_number ?? null,
    status: "published",
  };
}

router.get("/elevenlabs/agents", requireAuth, async (_req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const listRes = await elFetch("/agents");
    if (!listRes.ok) {
      const body = await listRes.text();
      res.status(listRes.status).json({ error: `ElevenLabs error: ${body}` }); return;
    }
    const listData = await listRes.json() as { agents?: Record<string, any>[] };
    const summaries = listData.agents ?? [];

    // Fetch full config per agent in parallel so voice/language/phone are
    // populated on the list view, not just on the detail view.
    const detailed = await Promise.all(
      summaries.map(async (a) => {
        try {
          const detailRes = await elFetch(`/agents/${a.agent_id}`);
          if (!detailRes.ok) return normalizeAgent(a);
          const detail = await detailRes.json() as Record<string, any>;
          return normalizeAgent(detail);
        } catch {
          return normalizeAgent(a);
        }
      })
    );

    res.json({ agents: detailed });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.post("/elevenlabs/agents", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { name, first_message, system_prompt, voice_id, language = "en" } = req.body as Record<string, string>;
  if (!name || !system_prompt) {
    res.status(400).json({ error: "name and system_prompt are required" }); return;
  }

  try {
    const elRes = await elFetch("/agents/create", {
      method: "POST",
      body: JSON.stringify({
        name,
        conversation_config: {
          agent: {
            language,
            prompt: { prompt: system_prompt },
            first_message: first_message ?? "",
          },
          tts: { voice_id: voice_id ?? "21m00Tcm4TlvDq8ikWAM" },
        },
      }),
    });

    if (!elRes.ok) {
      const body = await elRes.text();
      res.status(elRes.status).json({ error: `ElevenLabs error: ${body}` }); return;
    }

    const elData = await elRes.json() as { agent_id: string };
    // The create response only returns { agent_id }, so fetch full detail
    // to return the same flat shape everywhere else.
    const detailRes = await elFetch(`/agents/${elData.agent_id}`);
    const detail = detailRes.ok ? await detailRes.json() as Record<string, any> : { agent_id: elData.agent_id, name };
    res.json({ agent: normalizeAgent(detail) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.get("/elevenlabs/agents/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const elRes = await elFetch(`/agents/${req.params.id}`);
    if (!elRes.ok) {
      const body = await elRes.text();
      res.status(elRes.status).json({ error: `ElevenLabs error: ${body}` }); return;
    }
    const elData = await elRes.json() as Record<string, any>;
    res.json({ agent: normalizeAgent(elData) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.patch("/elevenlabs/agents/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { first_message, system_prompt, voice_id, language } = req.body as Record<string, string>;

  try {
    const elRes = await elFetch(`/agents/${req.params.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        conversation_config: {
          agent: {
            ...(language ? { language } : {}),
            ...(system_prompt ? { prompt: { prompt: system_prompt } } : {}),
            ...(first_message !== undefined ? { first_message } : {}),
          },
          ...(voice_id ? { tts: { voice_id } } : {}),
        },
      }),
    });

    if (!elRes.ok) {
      const body = await elRes.text();
      res.status(elRes.status).json({ error: `ElevenLabs error: ${body}` }); return;
    }

    const elData = await elRes.json() as Record<string, any>;
    res.json({ agent: normalizeAgent(elData) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.delete("/elevenlabs/agents/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const elRes = await elFetch(`/agents/${req.params.id}`, { method: "DELETE" });
    if (!elRes.ok) {
      const body = await elRes.text();
      res.status(elRes.status).json({ error: `ElevenLabs error: ${body}` }); return;
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── PHONE NUMBERS ───────────────────────────────────────────────────────────

router.post("/elevenlabs/phone-numbers", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { phone_number, twilio_account_sid, twilio_auth_token } = req.body as Record<string, string>;

  if (!phone_number || !twilio_account_sid || !twilio_auth_token) {
    res.status(400).json({ error: "phone_number, twilio_account_sid and twilio_auth_token are required" }); return;
  }

  try {
    const elRes = await elFetch("/phone-numbers", {
      method: "POST",
      body: JSON.stringify({
        provider_config: {
          type: "twilio",
          phone_number,
          account_sid: twilio_account_sid,
          auth_token: twilio_auth_token,
        },
      }),
    });

    if (!elRes.ok) {
      const body = await elRes.text();
      res.status(elRes.status).json({ error: `ElevenLabs error: ${body}` }); return;
    }

    const elData = await elRes.json() as { phone_number_id: string };
    res.json({ phone_number_id: elData.phone_number_id });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── SINGLE CALL ─────────────────────────────────────────────────────────────
// Ad-hoc single outbound call using a published agent. This is the only
// write here that touches our DB — one `calls` row so the webhook has
// something to match the transcript/outcome back to.

router.post("/elevenlabs/calls", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { agent_id, agent_phone_number_id, to_number, lead_id } = req.body as {
    agent_id: string;
    agent_phone_number_id: string;
    to_number: string;
    lead_id?: string;
  };

  if (!agent_id || !agent_phone_number_id || !to_number) {
    res.status(400).json({ error: "agent_id, agent_phone_number_id and to_number are required" }); return;
  }

  let dynamicVariables: Record<string, string> = {};
  if (lead_id) {
    const { data: lead } = await supabase
      .from("leads")
      .select("first_name, last_name, company_name")
      .eq("id", lead_id)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (lead) {
      dynamicVariables = {
        lead_name: lead.first_name ? `${lead.first_name} ${lead.last_name ?? ""}`.trim() : "there",
        company: lead.company_name ?? "",
      };
    }
  }

  try {
    const elRes = await elFetch("/twilio/outbound-call", {
      method: "POST",
      body: JSON.stringify({
        agent_id,
        agent_phone_number_id,
        to_number,
        conversation_initiation_client_data: { dynamic_variables: dynamicVariables },
      }),
    });

    if (!elRes.ok) {
      const body = await elRes.text();
      res.status(elRes.status).json({ error: `ElevenLabs error: ${body}` }); return;
    }

    const elData = await elRes.json() as Record<string, unknown>;

    await supabase.from("calls").insert({
      user_id: req.userId!,
      lead_id: lead_id ?? null,
      phone_number: to_number,
      status: "dialed",
    });

    res.json({ call: elData });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── BATCH CALLING ───────────────────────────────────────────────────────────

router.post("/elevenlabs/batches", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { call_name, agent_id, agent_phone_number_id, lead_list_id, scheduled_time_unix } = req.body as {
    call_name: string;
    agent_id: string;
    agent_phone_number_id: string;
    lead_list_id: string;
    scheduled_time_unix?: number;
  };

  if (!call_name || !agent_id || !agent_phone_number_id || !lead_list_id) {
    res.status(400).json({ error: "call_name, agent_id, agent_phone_number_id and lead_list_id are required" }); return;
  }

  const { data: leads, error: leadsErr } = await supabase
    .from("leads")
    .select("id, first_name, last_name, company_name, phone")
    .eq("lead_list_id", lead_list_id)
    .eq("user_id", req.userId!)
    .not("phone", "is", null);

  if (leadsErr) { res.status(500).json({ error: "Failed to fetch leads" }); return; }
  if (!leads || leads.length === 0) {
    res.status(400).json({ error: "No leads with phone numbers found in this list" }); return;
  }

  const recipients = leads.map((l: Record<string, any>) => ({
    phone_number: l.phone,
    conversation_initiation_client_data: {
      dynamic_variables: {
        lead_name: l.first_name ? `${l.first_name} ${l.last_name ?? ""}`.trim() : "there",
        company: l.company_name ?? "",
      },
    },
  }));

  try {
    const body: Record<string, unknown> = {
      call_name,
      agent_id,
      agent_phone_number_id,
      recipients,
    };
    if (scheduled_time_unix) body.scheduled_time_unix = scheduled_time_unix;

    const elRes = await elFetch("/batch-calling/submit", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!elRes.ok) {
      const errBody = await elRes.text();
      res.status(elRes.status).json({ error: `ElevenLabs error: ${errBody}` }); return;
    }

    const elData = await elRes.json() as { id: string; status: string };

    const { data: batch, error: batchErr } = await supabase
      .from("call_batches")
      .insert({
        user_id: req.userId!,
        elevenlabs_batch_id: elData.id,
        call_name,
        elevenlabs_agent_id: agent_id,
        agent_phone_number_id,
        lead_list_id,
        scheduled_time: scheduled_time_unix ? new Date(scheduled_time_unix * 1000).toISOString() : null,
        status: elData.status ?? "pending",
        total_calls: leads.length,
      })
      .select()
      .single();

    if (batchErr) { res.status(500).json({ error: "Batch submitted to ElevenLabs but failed to save to DB" }); return; }

    // Create one calls row per recipient. `phone` is our stable correlation
    // key used by the post-call webhook to match back to this batch row.
    const callRows = (leads as Record<string, any>[]).map(l => ({
      user_id: req.userId!,
      batch_db_id: batch.id,
      lead_id: l.id,
      phone_number: l.phone,
      lead_name: l.first_name ? `${l.first_name} ${l.last_name ?? ""}`.trim() : null,
      company: l.company_name ?? null,
      status: "pending",
    }));

    await supabase.from("calls").insert(callRows);

    res.json({ batch });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.get("/elevenlabs/batches", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data, error } = await supabase
    .from("call_batches")
    .select("*")
    .eq("user_id", req.userId!)
    .order("created_at", { ascending: false });

  if (error) { res.status(500).json({ error: "Failed to fetch batches" }); return; }
  res.json({ batches: data ?? [] });
});

// Get batch + poll ElevenLabs for live status and per-recipient reconciliation
router.get("/elevenlabs/batches/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { id } = req.params;
  const { data: batch, error } = await supabase
    .from("call_batches")
    .select("*")
    .eq("id", id)
    .eq("user_id", req.userId!)
    .single();

  if (error || !batch) { res.status(404).json({ error: "Batch not found" }); return; }

  try {
    const elRes = await elFetch(`/batch-calling/${batch.elevenlabs_batch_id}`);
    if (elRes.ok) {
      const elData = await elRes.json() as Record<string, any>;
      const statsJson = {
        total_calls_dispatched: elData.total_calls_dispatched ?? 0,
        total_calls_scheduled: elData.total_calls_scheduled ?? 0,
        total_calls_finished: elData.total_calls_finished ?? 0,
      };

      await supabase
        .from("call_batches")
        .update({ status: elData.status ?? batch.status, stats_json: statsJson, updated_at: new Date().toISOString() })
        .eq("id", id);

      batch.status = elData.status ?? batch.status;
      batch.stats_json = statsJson;

      const elCalls: Record<string, any>[] = elData.calls ?? elData.recipients ?? [];
      if (elCalls.length > 0) {
        await reconcileCallsFromBatchData(String(id), elCalls);
      }
    }
  } catch {
    // Best-effort — return what we have in DB
  }

  res.json({ batch });
});

async function reconcileCallsFromBatchData(batchDbId: string, elCalls: Record<string, any>[]) {
  for (const elCall of elCalls) {
    const phone = elCall.phone_number as string | undefined;
    const conversationId = elCall.conversation_id as string | undefined;
    const status = elCall.status as string | undefined;
    const outcome = elCall.call_outcome as string | undefined;

    if (!phone) continue;

    const { data: callRow } = await supabase
      .from("calls")
      .select("id, elevenlabs_conversation_id")
      .eq("batch_db_id", batchDbId)
      .eq("phone_number", phone)
      .maybeSingle();

    if (!callRow) continue;

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (status) updates.status = status;
    if (outcome) updates.outcome = outcome;
    if (conversationId && !callRow.elevenlabs_conversation_id) {
      updates.elevenlabs_conversation_id = conversationId;
    }

    await supabase.from("calls").update(updates).eq("id", callRow.id);
  }
}

router.get("/elevenlabs/batches/:id/calls", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { id } = req.params;

  const { data: batch } = await supabase
    .from("call_batches")
    .select("id")
    .eq("id", id)
    .eq("user_id", req.userId!)
    .single();

  if (!batch) { res.status(404).json({ error: "Batch not found" }); return; }

  const { data, error } = await supabase
    .from("calls")
    .select("*")
    .eq("batch_db_id", id)
    .order("created_at", { ascending: true });

  if (error) { res.status(500).json({ error: "Failed to fetch calls" }); return; }
  res.json({ calls: data ?? [] });
});

// ─── WEBHOOK RECEIVER ────────────────────────────────────────────────────────
// ElevenLabs POSTs here when a call ends (no user auth token — external caller).
// Optionally verify HMAC-SHA256 signature using ELEVENLABS_WEBHOOK_SECRET.
//
// NOTE: since agents are no longer stored locally, we can't resolve a
// conversation back to a user via agent_id anymore. Matching is now purely
// by phone_number against the most recent unmatched `calls` row, regardless
// of which agent placed it. This is a deliberate trade-off for simplicity —
// it can misattribute a call only in the rare case where two different
// users are dialing the exact same phone number at the same time.

router.post("/webhooks/elevenlabs", async (req: Request, res: Response): Promise<void> => {
  const webhookSecret = process.env["ELEVENLABS_WEBHOOK_SECRET"];
  if (webhookSecret) {
    const signature = (req.headers["elevenlabs-signature"] ?? req.headers["x-elevenlabs-signature"]) as string | undefined;

    if (!signature) {
      res.status(401).json({ error: "Missing webhook signature" }); return;
    }

    try {
      const parts = Object.fromEntries(signature.split(",").map(p => {
        const idx = p.indexOf("=");
        return [p.slice(0, idx), p.slice(idx + 1)];
      }));
      const timestamp = parts["t"] ?? "";
      const receivedSig = parts["v0"] ?? parts["v1"] ?? "";

      const rawBytes: Buffer | undefined = (req as any).rawBody;
      const rawBodyStr = rawBytes ? rawBytes.toString("utf8") : "";
      const payload = `${timestamp}.${rawBodyStr}`;
      const expected = createHmac("sha256", webhookSecret).update(payload).digest("hex");

      if (!receivedSig || receivedSig !== expected) {
        res.status(401).json({ error: "Invalid webhook signature" }); return;
      }
    } catch {
      res.status(401).json({ error: "Signature verification failed" }); return;
    }
  }

  // Respond immediately so ElevenLabs does not time out
  res.json({ received: true });

  const payload = req.body as Record<string, any>;
  const data = payload.data ?? payload;
  const conversationId: string | undefined = data.conversation_id;
  const status: string = data.status ?? "done";
  const outcome: string | undefined = data.call_outcome ?? data.analysis?.call_successful;
  const recipientPhone: string | undefined = data.metadata?.phone_number ?? data.to_number;

  if (!conversationId) return;

  (async () => {
    try {
      let callId: string | null = null;

      // 1. Match by conversation_id if already stamped
      const { data: byConvId } = await supabase
        .from("calls")
        .select("id")
        .eq("elevenlabs_conversation_id", conversationId)
        .maybeSingle();

      if (byConvId) {
        callId = byConvId.id;
      } else if (recipientPhone) {
        // 2. Match the most recent unmatched pending call for this phone number
        const { data: byPhone } = await supabase
          .from("calls")
          .select("id")
          .eq("phone_number", recipientPhone)
          .is("elevenlabs_conversation_id", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (byPhone) {
          callId = byPhone.id;
          await supabase.from("calls")
            .update({ elevenlabs_conversation_id: conversationId })
            .eq("id", callId);
        }
      }

      if (!callId) {
        console.warn(`[ElevenLabs webhook] No matching calls row for conversation ${conversationId}`);
        return;
      }

      // 3. Update status / outcome
      await supabase
        .from("calls")
        .update({
          status,
          outcome: outcome ?? null,
          elevenlabs_conversation_id: conversationId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", callId);

      // 4. Fetch and store transcript
      const transcriptRes = await elFetch(`/conversations/${conversationId}`);
      if (transcriptRes.ok) {
        const tData = await transcriptRes.json() as Record<string, any>;

        const transcript = Array.isArray(tData.transcript)
          ? (tData.transcript as Record<string, any>[])
              .map(t => `${t.role ?? "?"}: ${t.message ?? ""}`)
              .join("\n")
          : typeof tData.transcript === "string"
            ? tData.transcript
            : null;

        const durationSeconds: number | null =
          tData.metadata?.call_duration_secs ?? tData.call_duration_secs ?? null;

        await supabase
          .from("calls")
          .update({
            transcript: transcript ?? null,
            duration_seconds: durationSeconds,
            updated_at: new Date().toISOString(),
          })
          .eq("id", callId);
      }

      // 5. Audio upload to Google Drive
      // TODO: When GOOGLE_SERVICE_ACCOUNT_KEY + DRIVE_RECORDINGS_FOLDER_ID are set,
      // fetch raw audio from GET /conversations/:id/audio, upload to Drive, and
      // store the resulting shareable URL in calls.drive_share_url.

    } catch (err) {
      console.error("[ElevenLabs webhook] Post-processing error:", err);
    }
  })();
});

export default router;