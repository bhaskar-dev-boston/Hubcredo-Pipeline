import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";

const router: IRouter = Router();

const INBOXKIT_BASE = "https://api.inboxkit.com/v1/api";
const INBOXKIT_HEADERS = {
  "Authorization": `Bearer ${process.env.INBOXKIT_API_KEY}`,
  "X-Workspace-Id": process.env.INBOXKIT_WORKSPACE_ID ?? "",
  "Content-Type": "application/json",
};

// ── Check domain availability ────────────────────────────────────────
router.get("/inboxkit/check", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { domain } = req.query;
  if (!domain || typeof domain !== "string") {
    res.status(400).json({ error: "domain is required" }); return;
  }
  try {
    const response = await fetch(
      `${INBOXKIT_BASE}/domains/check?domain=${encodeURIComponent(domain)}`,
      { headers: INBOXKIT_HEADERS }
    );
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Availability check failed" });
  }
});

// ── Purchase domain ──────────────────────────────────────────────────
router.post("/inboxkit/purchase", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { domain, years = 1, contact_details } = req.body as {
    domain?: string;
    years?: number;
    contact_details?: {
      first_name: string; last_name: string; email: string; phone: string;
      address_line1: string; city: string; state?: string;
      postal_code: string; country: string;
    };
  };

  if (!domain) { res.status(400).json({ error: "domain is required" }); return; }
  if (!contact_details) { res.status(400).json({ error: "contact_details is required" }); return; }

  // Set INBOXKIT_TEST_MODE=true in env to test without spending wallet credits
  const useWallet = process.env.INBOXKIT_TEST_MODE !== "true";

  try {
    const response = await fetch(`${INBOXKIT_BASE}/domains/register`, {
      method: "POST",
      headers: INBOXKIT_HEADERS,
      body: JSON.stringify({
        domains: [{ name: domain, registration_years: years }],
        dmarc_email: `dmarc@${domain}`,
        domain_forwarding_url: "https://hubcredo.com",
        use_wallet_balance: useWallet,
        contact_details,
      }),
    });
    const data = await response.json() as { message?: string };
    if (!response.ok) {
      res.status(response.status).json({ error: data?.message ?? "Purchase failed" }); return;
    }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Purchase failed" });
  }
});

// ── Create mailbox ───────────────────────────────────────────────────
router.post("/inboxkit/mailbox", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { domain_id, username, first_name, last_name } = req.body as {
    domain_id?: string; username?: string; first_name?: string; last_name?: string;
  };
  if (!domain_id || !username) {
    res.status(400).json({ error: "domain_id and username are required" }); return;
  }
  try {
    const response = await fetch(`${INBOXKIT_BASE}/prewarm/buy-domain`, {
      method: "POST",
      headers: INBOXKIT_HEADERS,
      body: JSON.stringify({
        domains: [{
          domain_id,
          mailboxes: [{ username, first_name: first_name ?? username, last_name: last_name ?? "" }],
        }],
      }),
    });
    const data = await response.json() as { message?: string };
    if (!response.ok) {
      res.status(response.status).json({ error: data?.message ?? "Mailbox creation failed" }); return;
    }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Mailbox creation failed" });
  }
});

// ── Wallet balance ───────────────────────────────────────────────────
router.get("/inboxkit/wallet", requireAuth, async (_req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const response = await fetch(`${INBOXKIT_BASE}/billing/wallet`, { headers: INBOXKIT_HEADERS });
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to fetch wallet balance" });
  }
});

// ── Billing portal link (for top-up redirect) ────────────────────────
router.get("/inboxkit/billing-portal", requireAuth, async (_req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const response = await fetch(`${INBOXKIT_BASE}/billing/portal`, { headers: INBOXKIT_HEADERS });
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to get billing portal" });
  }
});

// ── Get nameservers for existing domain (FREE) ───────────────────────
router.post("/inboxkit/nameservers", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { domain } = req.body as { domain?: string };
  if (!domain) { res.status(400).json({ error: "domain is required" }); return; }
  try {
    const response = await fetch(`${INBOXKIT_BASE}/domains/nameservers`, {
      method: "POST",
      headers: INBOXKIT_HEADERS,
      body: JSON.stringify({ domains: [domain], mask_forwarding: false }),
    });
    const data = await response.json();
    if (!response.ok) {
      res.status(response.status).json({ error: "Failed to get nameservers" }); return;
    }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to get nameservers" });
  }
});

// ── Check nameserver propagation ─────────────────────────────────────
router.post("/inboxkit/nameservers/check", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { domain } = req.body as { domain?: string };
  if (!domain) { res.status(400).json({ error: "domain is required" }); return; }
  try {
    const response = await fetch(`${INBOXKIT_BASE}/domains/nameservers/check-propagation`, {
      method: "POST",
      headers: INBOXKIT_HEADERS,
      body: JSON.stringify({ domains: [domain] }),
    });
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to check propagation" });
  }
});

export default router;