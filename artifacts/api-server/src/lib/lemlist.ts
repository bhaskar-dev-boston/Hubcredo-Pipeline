const LEMLIST_BASE = "https://api.lemlist.com/api";
const API_KEY = process.env.LEMLIST_API_KEY || "";

function lemlistHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`:${API_KEY}`).toString("base64")}`,
  };
}

export const lemlistAvailable = !!API_KEY;

// ── Campaigns ──────────────────────────────────────────────────────────

export async function listLemlistCampaigns() {
  const res = await fetch(`${LEMLIST_BASE}/campaigns`, {
    headers: lemlistHeaders(),
  });
  if (!res.ok) throw new Error(`Lemlist error: ${res.status}`);
  return res.json();
}

export async function createLemlistCampaign(params: {
  name: string;
}) {
  const res = await fetch(`${LEMLIST_BASE}/campaigns`, {
    method: "POST",
    headers: lemlistHeaders(),
    body: JSON.stringify({ name: params.name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || `Lemlist campaign create failed: ${res.status}`);
  }
  return res.json() as Promise<{ _id: string; name: string }>;
}

// ── Leads ───────────────────────────────────────────────────────────────

export async function addLeadToLemlistCampaign(
  campaignId: string,
  lead: {
    email?: string;
    firstName?: string;
    lastName?: string;
    companyName?: string;
    linkedinUrl?: string;
    icebreaker?: string;
  }
) {
  const email = lead.email || `${lead.firstName?.toLowerCase()}.${lead.lastName?.toLowerCase()}@placeholder.com`;
  
  const res = await fetch(`${LEMLIST_BASE}/campaigns/${campaignId}/leads/${email}`, {
    method: "POST",
    headers: lemlistHeaders(),
    body: JSON.stringify({
      firstName: lead.firstName || "",
      lastName: lead.lastName || "",
      companyName: lead.companyName || "",
      linkedinUrl: lead.linkedinUrl || "",
      icebreaker: lead.icebreaker || "",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || `Add lead failed: ${res.status}`);
  }
  return res.json();
}

export async function getLemlistCampaignStats(campaignId: string) {
  const res = await fetch(`${LEMLIST_BASE}/campaigns/${campaignId}/stats`, {
    headers: lemlistHeaders(),
  });
  if (!res.ok) throw new Error(`Stats fetch failed: ${res.status}`);
  return res.json();
}

export async function listCampaignLeads(campaignId: string) {
  const res = await fetch(`${LEMLIST_BASE}/campaigns/${campaignId}/leads`, {
    headers: lemlistHeaders(),
  });
  if (!res.ok) throw new Error(`Leads fetch failed: ${res.status}`);
  return res.json();
}

export async function pauseLemlistCampaign(campaignId: string) {
  const res = await fetch(`${LEMLIST_BASE}/campaigns/${campaignId}/pause`, {
    method: "POST",
    headers: lemlistHeaders(),
  });
  if (!res.ok) throw new Error(`Pause failed: ${res.status}`);
  return res.json();
}

export async function resumeLemlistCampaign(campaignId: string) {
  const res = await fetch(`${LEMLIST_BASE}/campaigns/${campaignId}/resume`, {
    method: "POST",
    headers: lemlistHeaders(),
  });
  if (!res.ok) throw new Error(`Resume failed: ${res.status}`);
  return res.json();
}