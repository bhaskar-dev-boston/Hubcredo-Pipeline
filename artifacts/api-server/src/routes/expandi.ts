const EXPANDI_API_KEY = process.env.EXPANDI_API_KEY;
const EXPANDI_BASE = "https://api.expandi.io";

export const expandiAvailable = !!EXPANDI_API_KEY;

async function expandiRequest(path: string, method = "GET", body?: unknown) {
  if (!EXPANDI_API_KEY) throw new Error("EXPANDI_API_KEY not configured");

  const res = await fetch(`${EXPANDI_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${EXPANDI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Expandi API error ${res.status}: ${text}`);
  }

  return res.json();
}

export async function createExpandiCampaign(params: {
  name: string;
  connectionMessage: string;
  followupMessage?: string;
  followupDelayDays?: number;
  linkedinCookie: string;
  dailyLimit: number;
}) {
  return expandiRequest("/api/v1/campaigns", "POST", {
    name: params.name,
    type: "connector",
    daily_limit: Math.min(params.dailyLimit, 30),
    connection_message: params.connectionMessage.slice(0, 300),
    steps: params.followupMessage
      ? [
          {
            type: "message",
            message: params.followupMessage,
            delay_days: params.followupDelayDays ?? 2,
          },
        ]
      : [],
  });
}

export async function pauseExpandiCampaign(campaignId: string) {
  return expandiRequest(`/api/v1/campaigns/${campaignId}/pause`, "POST");
}

export async function resumeExpandiCampaign(campaignId: string) {
  return expandiRequest(`/api/v1/campaigns/${campaignId}/start`, "POST");
}

export async function addLeadToExpandiCampaign(
  campaignId: string,
  lead: { linkedinUrl: string; firstName?: string; lastName?: string }
) {
  return expandiRequest(`/api/v1/campaigns/${campaignId}/leads`, "POST", {
    linkedin_url: lead.linkedinUrl,
    first_name: lead.firstName,
    last_name: lead.lastName,
  });
}
