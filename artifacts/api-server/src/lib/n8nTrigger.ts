// lib/n8nTrigger.ts
//
// Fires n8n workflows for (1) job-signal scraping and (2) candidate sourcing.
//
// IMPORTANT: "webhook-test" URLs only respond while the workflow is open in
// the n8n editor with "Execute workflow" (listening) turned on. Swap both
// URLs below to their Production URL (or activate the workflows) before
// relying on this outside manual testing.
//
// IMPORTANT #2: these calls have a 15s timeout, but n8n workflows that
// scrape + score + store can easily run longer than that (especially
// "Full + email search" mode). Set the Webhook node's "Respond" option to
// "Immediately" (or add a Respond to Webhook node right after validation)
// so n8n acks the request fast and keeps processing in the background —
// otherwise every trigger call here will time out even when the workflow
// eventually succeeds.

interface TriggerScrapeParams {
  userId: string;
  source: "linkedin" | "indeed" | "both";
  keyword: string;
  location?: string;
  experience?: string;
  industry?: string;
  country?: string;
  maxJobs?: number;
}

interface TriggerCandidateSearchParams {
  userId: string;
  role: string;
  location?: string;
  experience?: string;
  maxItems?: number;
}

const JOB_SIGNAL_WEBHOOKS: Partial<Record<"linkedin" | "indeed", string>> = {
  linkedin: process.env.N8N_LINKEDIN_WEBHOOK_URL
    ?? "https://shreyahubcredo.app.n8n.cloud/webhook-test/fetch-job-post",
  indeed: process.env.N8N_INDEED_WEBHOOK_URL, // TODO: set once the Indeed workflow exists
};

const CANDIDATE_SOURCING_WEBHOOK =
  process.env.N8N_CANDIDATE_WEBHOOK_URL
  ?? "https://shreyahubcredo.app.n8n.cloud/webhook-test/candidate";

async function postJson(url: string, body: unknown, timeoutMs = 15_000): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(`n8n webhook unreachable (${url}): ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const responseBody = await res.text().catch(() => "");
    throw new Error(`n8n webhook returned ${res.status} (${url}): ${responseBody.slice(0, 300)}`);
  }
}

// ── Job signals (LinkedIn / Indeed job postings) ────────────────────────────

async function callJobSignalWebhook(
  source: "linkedin" | "indeed",
  payload: Omit<TriggerScrapeParams, "source">
): Promise<void> {
  const url = JOB_SIGNAL_WEBHOOKS[source];
  if (!url) {
    throw new Error(`No n8n webhook configured for source "${source}"`);
  }
  await postJson(url, {
    source,
    user_id: payload.userId,
    keyword: payload.keyword,
    location: payload.location ?? null,
    experience: payload.experience ?? null,
    industry: payload.industry ?? null,
    country: payload.country ?? "IN",
    max_jobs: payload.maxJobs ?? 100,
  });
}

export async function triggerScrape(params: TriggerScrapeParams): Promise<void> {
  const { source, ...rest } = params;

  if (source === "both") {
    await Promise.all([
      callJobSignalWebhook("linkedin", rest),
      callJobSignalWebhook("indeed", rest),
    ]);
    return;
  }

  await callJobSignalWebhook(source, rest);
}

// ── Candidate sourcing (LinkedIn profile search) ────────────────────────────

export async function triggerCandidateSearch(params: TriggerCandidateSearchParams): Promise<void> {
  if (!params.role?.trim()) {
    throw new Error("role is required to trigger candidate search");
  }
  await postJson(CANDIDATE_SOURCING_WEBHOOK, {
    user_id: params.userId,
    role: params.role,
    location: params.location ?? "India",
    experience: params.experience ?? null,
    max_items: params.maxItems ?? 10,
  });
}