import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

// ── GET /inbox — fetch all inbound replies across user's campaigns
router.get(
  "/inbox",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
    if (!INSTANTLY_API_KEY) {
      res.status(500).json({ error: "INSTANTLY_API_KEY not set" });
      return;
    }

    try {
      const { data: campaigns } = await supabase
        .from("email_campaigns")
        .select("id, name, sending_domain, external_campaign_id")
        .eq("user_id", req.userId!)
        .not("external_campaign_id", "is", null);

      if (!campaigns || campaigns.length === 0) {
        res.json([]);
        return;
      }

      const allReplies: any[] = [];

      await Promise.all(
        campaigns.map(async (campaign: any) => {
          try {
            let startingAfter: string | null = null;
            let fetched = 0;
            const MAX_PER_CAMPAIGN = 100;

            do {
              const params = new URLSearchParams({
                campaign_id: campaign.external_campaign_id,
                email_type: "received",
                limit: "50",
                sort_order: "desc",
                preview_only: "false",
              });
              if (startingAfter) params.set("starting_after", startingAfter);

              const inboxRes = await fetch(
                `https://api.instantly.ai/api/v2/emails?${params}`,
                { headers: { Authorization: `Bearer ${INSTANTLY_API_KEY}` } }
              );

              if (!inboxRes.ok) {
                const errText = await inboxRes.text();
                console.warn(
                  `Instantly /emails failed for campaign ${campaign.id}: ${inboxRes.status} ${errText}`
                );
                break;
              }

              const data = await inboxRes.json();
              const items: any[] = data.items ?? [];

              for (const item of items) {
                const fromJson = Array.isArray(item.from_address_json)
                  ? item.from_address_json[0]
                  : null;
                const fromName: string | null = fromJson?.name ?? null;
                const fromEmail: string =
                  item.from_address_email ?? fromJson?.email ?? item.lead ?? "";

                const eaccount: string | null =
                  typeof item.eaccount === "string" && item.eaccount.includes("@")
                    ? item.eaccount
                    : null;

                allReplies.push({
                  id: item.id as string,
                  thread_id: (item.thread_id as string) ?? null,
                  campaign_id: campaign.id as string,
                  from_email: fromEmail,
                  from_name: fromName,
                  subject: (item.subject as string) ?? null,
                  body: extractBody(item.body),
                  received_at: (item.timestamp_email ?? item.timestamp_created) as string,
                  is_read: !item.is_unread,
                  eaccount,
                  email_campaigns: {
                    name: campaign.name as string,
                    sending_domain: (campaign.sending_domain as string) ?? "",
                  },
                });
              }

              fetched += items.length;
              startingAfter = (data.next_starting_after as string) ?? null;
            } while (startingAfter && fetched < MAX_PER_CAMPAIGN);
          } catch (err) {
            console.warn(`Inbox fetch failed for campaign ${campaign.id}:`, err);
          }
        })
      );

      allReplies.sort(
        (a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
      );

      res.json(allReplies);
    } catch (err: any) {
      console.error("INBOX ERROR:", err);
      res.status(500).json({ error: "Failed to fetch inbox", details: err?.message });
    }
  }
);

// ── GET /inbox/:id/thread — fetch full conversation thread (sent + received)
// Uses Instantly's search=thread:{thread_id} filter to get ALL emails in the thread
router.get(
  "/inbox/:id/thread",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
    const { id } = req.params;

    if (!INSTANTLY_API_KEY) {
      res.status(500).json({ error: "INSTANTLY_API_KEY not set" });
      return;
    }

    try {
      // Step 1: Fetch the clicked email to get its thread_id
      const emailRes = await fetch(`https://api.instantly.ai/api/v2/emails/${id}`, {
        headers: { Authorization: `Bearer ${INSTANTLY_API_KEY}` },
      });

      if (!emailRes.ok) {
        const errText = await emailRes.text();
        console.warn(`GET /emails/${id} failed: ${emailRes.status} ${errText}`);
        res.status(emailRes.status).json({ error: "Could not fetch email", details: errText });
        return;
      }

      const emailData = await emailRes.json();
      const threadId: string | null = (emailData.thread_id as string) ?? null;

      console.log(`Thread lookup — email ${id}, thread_id: ${threadId}`);

      if (!threadId) {
        // No thread_id — return just this single email
        res.json({ thread_id: null, messages: [buildMessage(emailData, "received")] });
        return;
      }

      // Step 2: Fetch ALL emails in the thread using search=thread:{thread_id}
      // Instantly docs: use "thread:" prefix in the search param
      const threadMessages: any[] = [];
      let startingAfter: string | null = null;

      do {
        const params = new URLSearchParams({
          search: `thread:${threadId}`,
          limit: "100",
          sort_order: "asc", // oldest first for conversation view
          preview_only: "false",
        });
        if (startingAfter) params.set("starting_after", startingAfter);

        const threadRes = await fetch(
          `https://api.instantly.ai/api/v2/emails?${params}`,
          { headers: { Authorization: `Bearer ${INSTANTLY_API_KEY}` } }
        );

        if (!threadRes.ok) {
          const errText = await threadRes.text();
          console.warn(`Thread fetch failed: ${threadRes.status} ${errText}`);
          break;
        }

        const threadData = await threadRes.json();
        const items: any[] = threadData.items ?? [];

        console.log(`Thread page: ${items.length} emails fetched`);

        for (const item of items) {
          // ue_type: 1 = sent (outbound campaign), 2 = received (lead reply), 3 = manually sent
          const direction: "sent" | "received" =
            item.ue_type === 2 ? "received" : "sent";
          threadMessages.push(buildMessage(item, direction));
        }

        startingAfter = (threadData.next_starting_after as string) ?? null;
      } while (startingAfter && threadMessages.length < 500);

      // Deduplicate by id (in case of overlap)
      const seen = new Set<string>();
      const unique = threadMessages.filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });

      // Sort oldest → newest
      unique.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      console.log(`Thread complete: ${unique.length} unique messages`);

      res.json({ thread_id: threadId, messages: unique });
    } catch (err: any) {
      console.error("THREAD ERROR:", err);
      res.status(500).json({ error: "Failed to fetch thread", details: err?.message });
    }
  }
);

// Strip HTML tags and decode common entities to plain text
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractBody(body: any): string | null {
  if (!body) return null;
  if (body.text && typeof body.text === "string" && body.text.trim()) {
    return body.text.trim();
  }
  if (body.html && typeof body.html === "string" && body.html.trim()) {
    return stripHtml(body.html);
  }
  return null;
}

function buildMessage(item: any, direction: "sent" | "received") {
  const fromJson = Array.isArray(item.from_address_json)
    ? item.from_address_json[0]
    : null;

  return {
    id: item.id as string,
    direction,
    from_email:
      item.from_address_email ?? fromJson?.email ?? item.lead ?? item.eaccount ?? "",
    from_name: (fromJson?.name as string) ?? null,
    to_email: item.to_address_email_list ?? null,
    subject: (item.subject as string) ?? null,
    body: extractBody(item.body),
    timestamp: (item.timestamp_email ?? item.timestamp_created) as string,
    eaccount: typeof item.eaccount === "string" ? item.eaccount : null,
    ue_type: item.ue_type ?? null,
    is_unread: !!item.is_unread,
  };
}

// ── PATCH /inbox/:id/read — mark an email as read
router.patch(
  "/inbox/:id/read",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
    const { id } = req.params;

    if (INSTANTLY_API_KEY) {
      fetch(`https://api.instantly.ai/api/v2/emails/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${INSTANTLY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_unread: 0 }),
      }).catch(() => {});
    }

    res.json({ success: true });
  }
);

// ── POST /inbox/:id/reply — send a reply via Instantly v2
router.post(
  "/inbox/:id/reply",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
    const { id } = req.params;
    const { subject, body } = req.body as { subject?: string; body?: string };

    if (!INSTANTLY_API_KEY) {
      res.status(500).json({ error: "INSTANTLY_API_KEY not set" });
      return;
    }
    if (!body) {
      res.status(400).json({ error: "body is required" });
      return;
    }

    try {
      // Step 1: Fetch the inbound email to get thread_id and maybe eaccount
      const emailRes = await fetch(`https://api.instantly.ai/api/v2/emails/${id}`, {
        headers: { Authorization: `Bearer ${INSTANTLY_API_KEY}` },
      });

      if (!emailRes.ok) {
        const errText = await emailRes.text();
        res.status(emailRes.status).json({ error: "Could not fetch original email", details: errText });
        return;
      }

      const emailData = await emailRes.json();

      // Step 2: Resolve eaccount — three fallback strategies
      let eaccount = "";

      // Strategy A: inbound email carries a valid eaccount
      if (
        emailData.eaccount &&
        typeof emailData.eaccount === "string" &&
        emailData.eaccount.includes("@")
      ) {
        eaccount = emailData.eaccount;
      }

      // Strategy B: find the outbound email in the same thread
      if (!eaccount && emailData.thread_id) {
        const threadRes = await fetch(
          `https://api.instantly.ai/api/v2/emails?search=${encodeURIComponent(
            `thread:${emailData.thread_id}`
          )}&email_type=sent&limit=10&preview_only=false`,
          { headers: { Authorization: `Bearer ${INSTANTLY_API_KEY}` } }
        );
        if (threadRes.ok) {
          const threadData = await threadRes.json();
          const sentEmails: any[] = threadData.items ?? [];
          const sentEmail = sentEmails.find(
            (e: any) => e.eaccount && typeof e.eaccount === "string" && e.eaccount.includes("@")
          );
          if (sentEmail) eaccount = sentEmail.eaccount as string;
        }
      }

      // Strategy C: fall back to the first active account in the workspace
      if (!eaccount) {
        const acctRes = await fetch(
          `https://api.instantly.ai/api/v2/accounts?limit=1&status=1`,
          { headers: { Authorization: `Bearer ${INSTANTLY_API_KEY}` } }
        );
        if (acctRes.ok) {
          const acctData = await acctRes.json();
          const accounts: any[] = acctData.items ?? [];
          if (accounts.length > 0 && accounts[0].email) {
            eaccount = accounts[0].email as string;
          }
        }
      }

      if (!eaccount) {
        res.status(400).json({
          error: "No sending account found. Please add an email account in Instantly.",
        });
        return;
      }

      console.log(`Replying as eaccount: ${eaccount} to email ${id}`);

      // Step 3: Send the reply
      const replyRes = await fetch("https://api.instantly.ai/api/v2/emails/reply", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${INSTANTLY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eaccount,
          reply_to_uuid: id,
          subject: subject ?? "",
          body: {
            text: body,
            html: `<p>${body.replace(/\n/g, "<br>")}</p>`,
          },
        }),
      });

      if (!replyRes.ok) {
        const errText = await replyRes.text();
        console.warn(`Instantly /emails/reply failed: ${replyRes.status} ${errText}`);
        res.status(replyRes.status).json({ error: "Instantly reply failed", details: errText });
        return;
      }

      const data = await replyRes.json();
      res.json({ success: true, eaccount, data });
    } catch (err: any) {
      console.error("REPLY ERROR:", err);
      res.status(500).json({ error: "Failed to send reply", details: err?.message });
    }
  }
);

export default router;