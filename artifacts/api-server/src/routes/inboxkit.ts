import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";

const router: IRouter = Router();

const INBOXKIT_BASE = "https://api.inboxkit.com/v1/api";

const INBOXKIT_HEADERS = {
  Authorization: `Bearer ${process.env.INBOXKIT_API_KEY}`,
  "X-Workspace-Id": process.env.INBOXKIT_WORKSPACE_ID ?? "",
  "Content-Type": "application/json",
};

// TEST MODE
// true  = no wallet deduction
// false = real purchase
const IS_TEST_MODE =
  process.env.INBOXKIT_TEST_MODE === "true";

// ─────────────────────────────────────────────────────────────
// Check domain availability
// ─────────────────────────────────────────────────────────────
router.get(
  "/inboxkit/check",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { domain } = req.query;

    if (!domain || typeof domain !== "string") {
      res.status(400).json({
        error: "domain is required",
      });

      return;
    }

    try {
      const response = await fetch(
        `${INBOXKIT_BASE}/domains/check?domain=${encodeURIComponent(
          domain
        )}`,
        {
          headers: INBOXKIT_HEADERS,
        }
      );

      const data = await response.json();

      res.json(data);
    } catch (error) {
      console.error("CHECK DOMAIN ERROR:", error);

      res.status(500).json({
        error: "Availability check failed",
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────
// Purchase domain
// ─────────────────────────────────────────────────────────────
router.post(
  "/inboxkit/purchase",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { domain, years = 1, contact_details } = req.body as {
      domain?: string;
      years?: number;
      contact_details?: {
        first_name: string;
        last_name: string;
        email: string;
        phone: string;
        address_line1: string;
        city: string;
        state?: string;
        postal_code: string;
        country: string;
      };
    };

    if (!domain) {
      res.status(400).json({
        error: "domain is required",
      });

      return;
    }

    if (!contact_details) {
      res.status(400).json({
        error: "contact_details is required",
      });

      return;
    }

    try {
      // IMPORTANT
      // In test mode:
      // use_wallet_balance = false

      const useWalletBalance = !IS_TEST_MODE;

      console.log("INBOXKIT TEST MODE:", IS_TEST_MODE);

      const requestBody = {
        domains: [
          {
            name: domain,
            registration_years: years,
          },
        ],
        dmarc_email: `dmarc@${domain}`,
        domain_forwarding_url: "https://hubcredo.com",
        use_wallet_balance: useWalletBalance,
        contact_details,
      };

      console.log(
        "PURCHASE REQUEST BODY:",
        JSON.stringify(requestBody, null, 2)
      );

      const purchaseResponse = await fetch(
        `${INBOXKIT_BASE}/domains/register`,
        {
          method: "POST",
          headers: INBOXKIT_HEADERS,
          body: JSON.stringify(requestBody),
        }
      );

      const purchaseText =
        await purchaseResponse.text();

      console.log(
        "RAW PURCHASE RESPONSE:",
        purchaseText
      );

      let purchaseData: any = {};

      try {
        purchaseData = JSON.parse(purchaseText);
      } catch {
        purchaseData = {
          raw: purchaseText,
        };
      }

      console.log(
        "PARSED PURCHASE RESPONSE:",
        JSON.stringify(purchaseData, null, 2)
      );

      if (!purchaseResponse.ok) {
        res.status(purchaseResponse.status).json({
          error:
            purchaseData?.message ||
            purchaseData?.error ||
            "Purchase failed",
          full_response: purchaseData,
        });

        return;
      }

      // Extract possible domain ID
      let possibleDomainId: string | null =
        null;

      if (purchaseData?.domain_id) {
        possibleDomainId =
          purchaseData.domain_id;
      } else if (purchaseData?.id) {
        possibleDomainId = purchaseData.id;
      } else if (purchaseData?.data?.id) {
        possibleDomainId =
          purchaseData.data.id;
      } else if (
        purchaseData?.data?.domain_id
      ) {
        possibleDomainId =
          purchaseData.data.domain_id;
      } else if (
        Array.isArray(
          purchaseData?.domain_uids
        )
      ) {
        possibleDomainId =
          purchaseData.domain_uids[0];
      } else if (
        Array.isArray(
          purchaseData?.data?.domain_uids
        )
      ) {
        possibleDomainId =
          purchaseData.data.domain_uids[0];
      }

      console.log(
        "EXTRACTED DOMAIN ID:",
        possibleDomainId
      );

      res.json({
        success: true,
        test_mode: IS_TEST_MODE,
        domain,
        domain_id: possibleDomainId,
        pending_sync: true,
        message:
          "Domain purchase request completed successfully.",
        purchase_response: purchaseData,
      });
    } catch (error: any) {
      console.error(
        "PURCHASE DOMAIN ERROR:",
        error
      );

      res.status(500).json({
        error: "Purchase failed",
        details: error?.message || error,
        stack: error?.stack,
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────
// Create mailbox
// ─────────────────────────────────────────────────────────────
router.post(
  "/inboxkit/mailbox",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { domain_id, username } = req.body as {
      domain_id?: string;
      username?: string;
    };

    if (!domain_id || !username) {
      res.status(400).json({
        error:
          "domain_id and username are required",
      });

      return;
    }

    try {
      console.log("CREATING MAILBOX");

      console.log({
        domain_id,
        username,
      });

      const requestBody = {
        domains: [
          {
            domain_id,
            mailboxes: [
              {
                username,
              },
            ],
          },
        ],
      };

      console.log(
        "MAILBOX REQUEST BODY:",
        JSON.stringify(requestBody, null, 2)
      );

      const response = await fetch(
        `${INBOXKIT_BASE}/prewarm/buy-domain`,
        {
          method: "POST",
          headers: INBOXKIT_HEADERS,
          body: JSON.stringify(requestBody),
        }
      );

      const responseText =
        await response.text();

      console.log(
        "MAILBOX RAW RESPONSE:",
        responseText
      );

      let data: any = {};

      try {
        data = JSON.parse(responseText);
      } catch {
        data = {
          raw: responseText,
        };
      }

      if (!response.ok) {
        res.status(response.status).json({
          error:
            data?.message ||
            data?.error ||
            "Mailbox creation failed",
          full_response: data,
        });

        return;
      }

      res.json(data);
    } catch (error: any) {
      console.error(
        "MAILBOX CREATION ERROR:",
        error
      );

      res.status(500).json({
        error: "Mailbox creation failed",
        details: error?.message || error,
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────
// Wallet balance
// ─────────────────────────────────────────────────────────────
router.get(
  "/inboxkit/wallet",
  requireAuth,
  async (_req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const response = await fetch(
        `${INBOXKIT_BASE}/billing/wallet`,
        {
          headers: INBOXKIT_HEADERS,
        }
      );

      const data = await response.json();

      res.json(data);
    } catch (error) {
      console.error(
        "WALLET FETCH ERROR:",
        error
      );

      res.status(500).json({
        error: "Failed to fetch wallet balance",
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────
// Billing portal
// ─────────────────────────────────────────────────────────────
router.get(
  "/inboxkit/billing-portal",
  requireAuth,
  async (_req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const response = await fetch(
        `${INBOXKIT_BASE}/billing/portal`,
        {
          headers: INBOXKIT_HEADERS,
        }
      );

      const data = await response.json();

      res.json(data);
    } catch (error) {
      console.error(
        "BILLING PORTAL ERROR:",
        error
      );

      res.status(500).json({
        error: "Failed to get billing portal",
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────
// Get nameservers
// ─────────────────────────────────────────────────────────────
router.post(
  "/inboxkit/nameservers",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { domain } = req.body as {
      domain?: string;
    };

    if (!domain) {
      res.status(400).json({
        error: "domain is required",
      });

      return;
    }

    try {
      const response = await fetch(
        `${INBOXKIT_BASE}/domains/nameservers`,
        {
          method: "POST",
          headers: INBOXKIT_HEADERS,
          body: JSON.stringify({
            domains: [domain],
            mask_forwarding: false,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        res.status(response.status).json({
          error: "Failed to get nameservers",
        });

        return;
      }

      res.json(data);
    } catch (error) {
      console.error(
        "NAMESERVER ERROR:",
        error
      );

      res.status(500).json({
        error: "Failed to get nameservers",
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────
// Check nameserver propagation
// ─────────────────────────────────────────────────────────────
router.post(
  "/inboxkit/nameservers/check",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { domain } = req.body as {
      domain?: string;
    };

    if (!domain) {
      res.status(400).json({
        error: "domain is required",
      });

      return;
    }

    try {
      const response = await fetch(
        `${INBOXKIT_BASE}/domains/nameservers/check-propagation`,
        {
          method: "POST",
          headers: INBOXKIT_HEADERS,
          body: JSON.stringify({
            domains: [domain],
          }),
        }
      );

      const data = await response.json();

      res.json(data);
    } catch (error) {
      console.error(
        "PROPAGATION CHECK ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Failed to check nameserver propagation",
      });
    }
  }
);

export default router;