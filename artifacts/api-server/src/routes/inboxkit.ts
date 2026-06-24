import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

const INBOXKIT_BASE = "https://api.inboxkit.com/v1/api";

// TEST MODE: no wallet deduction when true
const IS_TEST_MODE = process.env.INBOXKIT_TEST_MODE === "true";

async function getInboxkitCreds(userId: string): Promise<{ apiKey: string; workspaceId: string }> {
  try {
    const { data } = await supabase
      .from("user_integrations")
      .select("api_key, workspace_id")
      .eq("user_id", userId)
      .eq("service", "inboxkit")
      .maybeSingle();
    if (data?.api_key) {
      return { apiKey: data.api_key, workspaceId: data.workspace_id ?? "" };
    }
  } catch { /* fall through to env vars */ }
  return {
    apiKey: process.env.INBOXKIT_API_KEY ?? "",
    workspaceId: process.env.INBOXKIT_WORKSPACE_ID ?? "",
  };
}

function inboxkitHeaders(apiKey: string, workspaceId: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (workspaceId) {
    headers["X-Workspace-Id"] = workspaceId;
  }
  return headers;
}

// ─────────────────────────────────────────────────────────────
// Validate connection
// Docs: GET /billing/wallet
// ─────────────────────────────────────────────────────────────
router.get("/inboxkit/validate", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { apiKey, workspaceId } = await getInboxkitCreds(req.userId!);
  if (!apiKey) {
    res.json({ connected: false, error: "No InboxKit API key configured" });
    return;
  }
  try {
    const response = await fetch(`${INBOXKIT_BASE}/billing/wallet`, {
      headers: inboxkitHeaders(apiKey, workspaceId),
    });
    const data = await response.json();
    if (!response.ok) {
      res.json({ connected: false, error: `InboxKit returned ${response.status}`, detail: data });
      return;
    }
    res.json({
      connected: true,
      workspace_id: workspaceId,
      wallet: {
        balance: data.credits_remaining,
        total: data.total_credits,
        used: data.credits_used,
        currency: "credits",
      },
    });
  } catch {
    res.json({ connected: false, error: "Could not reach InboxKit API" });
  }
});

// ─────────────────────────────────────────────────────────────
// List purchased domains
// Docs: POST /domains/list
// Returns full domain object including assigned_mailboxes, nameserver_match_status etc.
// ─────────────────────────────────────────────────────────────
router.get("/inboxkit/domains", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { apiKey, workspaceId } = await getInboxkitCreds(req.userId!);
  if (!apiKey) {
    res.status(401).json({ error: "No InboxKit API key configured. Add it in Settings → Integrations." });
    return;
  }
  try {
    const response = await fetch(`${INBOXKIT_BASE}/domains/list`, {
      method: "POST",
      headers: inboxkitHeaders(apiKey, workspaceId),
      body: JSON.stringify({ page: 1, limit: 100 }),
    });
    const data = await response.json();
    if (!response.ok) {
      res.status(response.status).json({ error: data?.message ?? "Failed to fetch domains" });
      return;
    }
    // Full domain objects: uid, name, status, renewal_date, assigned_mailboxes, available_mailboxes,
    // nameserver_match_status, dmarc_email, forwarding_url, tags, connection_type, tld, price, etc.
    const domains = Array.isArray(data.domains) ? data.domains : [];
    res.json({
      domains,
      total: data.total ?? domains.length,
      status_counts: data.status_counts ?? {},
      nameserver_status_counts: data.nameserver_status_counts ?? {},
    });
  } catch (error) {
    console.error("INBOXKIT DOMAINS ERROR:", error);
    res.status(500).json({ error: "Failed to fetch domains" });
  }
});

// ─────────────────────────────────────────────────────────────
// List ALL mailboxes (workspace-wide)
// Docs: POST /mailboxes/list
// Mailbox fields: uid, domain_name, username, first_name, last_name, platform,
//   status, sequencer_status, dns_propagation_status, renewal_cycle, renewal_status, tags
// ─────────────────────────────────────────────────────────────
router.get("/inboxkit/mailboxes", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { apiKey, workspaceId } = await getInboxkitCreds(req.userId!);
  if (!apiKey) {
    res.status(401).json({ error: "No InboxKit API key configured." });
    return;
  }
  const { domain_uid, domain } = req.query;
  try {
    const body: Record<string, unknown> = { page: 1, limit: 200 };
    if (domain_uid) body.domain_uid = String(domain_uid);
    if (domain) body.domain = String(domain);

    const response = await fetch(`${INBOXKIT_BASE}/mailboxes/list`, {
      method: "POST",
      headers: inboxkitHeaders(apiKey, workspaceId),
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      res.status(response.status).json({ error: data?.message ?? "Failed to fetch mailboxes" });
      return;
    }
    const mailboxes = Array.isArray(data.mailboxes) ? data.mailboxes : [];
    res.json({ mailboxes, total: data.total ?? mailboxes.length });
  } catch (error) {
    console.error("INBOXKIT MAILBOXES ERROR:", error);
    res.status(500).json({ error: "Failed to fetch mailboxes" });
  }
});

// ─────────────────────────────────────────────────────────────
// List mailboxes for a SPECIFIC domain (by domain name)
// Used by the frontend to expand mailboxes per domain row
// Docs: POST /mailboxes/list with domain filter
// ─────────────────────────────────────────────────────────────
router.get("/inboxkit/mailboxes/by-domain", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { domain } = req.query;
  if (!domain || typeof domain !== "string") {
    res.status(400).json({ error: "domain query param is required" });
    return;
  }
  const { apiKey, workspaceId } = await getInboxkitCreds(req.userId!);
  if (!apiKey) {
    res.status(401).json({ error: "No InboxKit API key configured." });
    return;
  }
  try {
    const response = await fetch(`${INBOXKIT_BASE}/mailboxes/list`, {
      method: "POST",
      headers: inboxkitHeaders(apiKey, workspaceId),
      body: JSON.stringify({ page: 1, limit: 100, domain }),
    });
    const data = await response.json();
    if (!response.ok) {
      res.status(response.status).json({ error: data?.message ?? "Failed to fetch mailboxes" });
      return;
    }
    const mailboxes = Array.isArray(data.mailboxes) ? data.mailboxes : [];
    res.json({ mailboxes, total: data.total ?? mailboxes.length });
  } catch (error) {
    console.error("INBOXKIT MAILBOXES BY-DOMAIN ERROR:", error);
    res.status(500).json({ error: "Failed to fetch mailboxes" });
  }
});

// ─────────────────────────────────────────────────────────────
// Get mailbox credentials (SMTP/IMAP details)
// Docs: GET /mailboxes/{uid}/credentials
// ─────────────────────────────────────────────────────────────
router.get("/inboxkit/mailboxes/:uid/credentials", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { uid } = req.params;
  const { apiKey, workspaceId } = await getInboxkitCreds(req.userId!);
  if (!apiKey) {
    res.status(401).json({ error: "No InboxKit API key configured." });
    return;
  }
  try {
    const response = await fetch(`${INBOXKIT_BASE}/mailboxes/${uid}/credentials`, {
      headers: inboxkitHeaders(apiKey, workspaceId),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch credentials" });
  }
});

// ─────────────────────────────────────────────────────────────
// Check domain availability
// Docs: GET /domains/check?domain=example.com
// ─────────────────────────────────────────────────────────────
router.get("/inboxkit/check", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { domain } = req.query;
  if (!domain || typeof domain !== "string") {
    res.status(400).json({ error: "domain is required" });
    return;
  }
  const { apiKey, workspaceId } = await getInboxkitCreds(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No InboxKit API key configured" }); return; }
  try {
    const response = await fetch(
      `${INBOXKIT_BASE}/domains/check?domain=${encodeURIComponent(domain)}`,
      { headers: inboxkitHeaders(apiKey, workspaceId) }
    );
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error("CHECK DOMAIN ERROR:", error);
    res.status(500).json({ error: "Availability check failed" });
  }
});

// ─────────────────────────────────────────────────────────────
// Search available domains
// Docs: POST /domains/search
// ─────────────────────────────────────────────────────────────
router.post("/inboxkit/domains/search", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { keyword } = req.body as { keyword?: string };
  if (!keyword) { res.status(400).json({ error: "keyword is required" }); return; }
  const { apiKey, workspaceId } = await getInboxkitCreds(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No InboxKit API key configured" }); return; }
  try {
    const response = await fetch(`${INBOXKIT_BASE}/domains/search`, {
      method: "POST",
      headers: inboxkitHeaders(apiKey, workspaceId),
      body: JSON.stringify({ keyword }),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: "Domain search failed" });
  }
});

// ─────────────────────────────────────────────────────────────
// Register / purchase domain
// Docs: POST /domains/register
// ─────────────────────────────────────────────────────────────
router.post("/inboxkit/purchase", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { domain, years = 1, contact_details } = req.body as {
    domain?: string;
    years?: number;
    contact_details?: {
      first_name: string; last_name: string; email: string; phone: string;
      address_line1: string; city: string; state?: string; postal_code: string; country: string;
    };
  };
  if (!domain) { res.status(400).json({ error: "domain is required" }); return; }
  if (!contact_details) { res.status(400).json({ error: "contact_details is required" }); return; }

  const { apiKey, workspaceId } = await getInboxkitCreds(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No InboxKit API key configured" }); return; }

  try {
    const requestBody = {
      domains: [{ name: domain, registration_years: years }],
      dmarc_email: `dmarc@${domain}`,
      domain_forwarding_url: "https://hubcredo.com",
      use_wallet_balance: !IS_TEST_MODE,
      contact_details,
    };

    const response = await fetch(`${INBOXKIT_BASE}/domains/register`, {
      method: "POST",
      headers: inboxkitHeaders(apiKey, workspaceId),
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    let purchaseData: any = {};
    try { purchaseData = JSON.parse(responseText); } catch { purchaseData = { raw: responseText }; }

    if (!response.ok) {
      res.status(response.status).json({
        error: purchaseData?.message ?? purchaseData?.error ?? "Purchase failed",
        full_response: purchaseData,
      });
      return;
    }

    // domain_uids returned as array e.g. ["dom_aaa"]
    const domainUid = Array.isArray(purchaseData?.domain_uids) ? purchaseData.domain_uids[0] : null;

    res.json({
      success: true,
      test_mode: IS_TEST_MODE,
      domain,
      domain_uid: domainUid,
      pending_sync: true,
      message: "Domain purchase request completed successfully.",
      purchase_response: purchaseData,
    });
  } catch (error: any) {
    console.error("PURCHASE DOMAIN ERROR:", error);
    res.status(500).json({ error: "Purchase failed", details: error?.message || error });
  }
});

// ─────────────────────────────────────────────────────────────
// Buy mailboxes
// Docs: POST /prewarm/buy-domain
// ─────────────────────────────────────────────────────────────
router.post("/inboxkit/mailbox", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { domain_id, username, first_name, last_name } = req.body as {
    domain_id?: string;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  if (!domain_id || !username) {
    res.status(400).json({ error: "domain_id and username are required" });
    return;
  }

  const { apiKey, workspaceId } = await getInboxkitCreds(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No InboxKit API key configured" }); return; }

  try {
    const requestBody = {
      domains: [{
        domain_id,
        mailboxes: [{
          username,
          first_name: first_name ?? username,
          last_name: last_name ?? "",
        }],
      }],
    };
    const response = await fetch(`${INBOXKIT_BASE}/prewarm/buy-domain`, {
      method: "POST",
      headers: inboxkitHeaders(apiKey, workspaceId),
      body: JSON.stringify(requestBody),
    });
    const responseText = await response.text();
    let data: any = {};
    try { data = JSON.parse(responseText); } catch { data = { raw: responseText }; }
    if (!response.ok) {
      res.status(response.status).json({
        error: data?.message ?? data?.error ?? "Mailbox creation failed",
        full_response: data,
      });
      return;
    }
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: "Mailbox creation failed", details: error?.message || error });
  }
});

// ─────────────────────────────────────────────────────────────
// Wallet balance
// Docs: GET /billing/wallet
// ─────────────────────────────────────────────────────────────
router.get("/inboxkit/wallet", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { apiKey, workspaceId } = await getInboxkitCreds(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No InboxKit API key configured" }); return; }
  try {
    const response = await fetch(`${INBOXKIT_BASE}/billing/wallet`, {
      headers: inboxkitHeaders(apiKey, workspaceId),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch wallet balance" });
  }
});

// ─────────────────────────────────────────────────────────────
// Billing portal link
// ─────────────────────────────────────────────────────────────
router.get("/inboxkit/billing-portal", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { apiKey, workspaceId } = await getInboxkitCreds(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No InboxKit API key configured" }); return; }
  try {
    const response = await fetch(`${INBOXKIT_BASE}/billing/portal`, {
      headers: inboxkitHeaders(apiKey, workspaceId),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to get billing portal" });
  }
});

// ─────────────────────────────────────────────────────────────
// Get nameservers for domain connection
// ─────────────────────────────────────────────────────────────
router.post("/inboxkit/nameservers", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { domain } = req.body as { domain?: string };
  if (!domain) { res.status(400).json({ error: "domain is required" }); return; }
  const { apiKey, workspaceId } = await getInboxkitCreds(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No InboxKit API key configured" }); return; }
  try {
    const response = await fetch(`${INBOXKIT_BASE}/domains/nameservers`, {
      method: "POST",
      headers: inboxkitHeaders(apiKey, workspaceId),
      body: JSON.stringify({ domains: [domain], mask_forwarding: false }),
    });
    const data = await response.json();
    if (!response.ok) {
      res.status(response.status).json({ error: "Failed to get nameservers", detail: data });
      return;
    }
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to get nameservers" });
  }
});

// ─────────────────────────────────────────────────────────────
// Check nameserver propagation
// ─────────────────────────────────────────────────────────────
router.post("/inboxkit/nameservers/check", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { domain } = req.body as { domain?: string };
  if (!domain) { res.status(400).json({ error: "domain is required" }); return; }
  const { apiKey, workspaceId } = await getInboxkitCreds(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No InboxKit API key configured" }); return; }
  try {
    const response = await fetch(`${INBOXKIT_BASE}/domains/nameservers/check-propagation`, {
      method: "POST",
      headers: inboxkitHeaders(apiKey, workspaceId),
      body: JSON.stringify({ domains: [domain] }),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to check nameserver propagation" });
  }
});

export default router;