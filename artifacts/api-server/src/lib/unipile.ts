/* ─────────────────────────────────────────────────────────────────────────── */
/*  lib/unipile.ts  — Unipile API wrapper for LinkedIn outreach                */
/* ─────────────────────────────────────────────────────────────────────────── */

const UNIPILE_DSN = process.env.UNIPILE_DSN!;           // e.g. https://api1.unipile.com:13111
const UNIPILE_API_KEY = process.env.UNIPILE_API_KEY!;

export const unipileAvailable = !!(UNIPILE_DSN && UNIPILE_API_KEY);

function headers() {
  return {
    "Content-Type": "application/json",
    "X-API-KEY": UNIPILE_API_KEY,
    accept: "application/json",
  };
}

function url(path: string) {
  return `${UNIPILE_DSN}/api/v1${path}`;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  HOSTED AUTH — generate a "Connect LinkedIn" link for a user                */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function createUnipileHostedAuthLink(params: {
  userId: string;           // your internal Supabase user ID → returned in webhook
  successRedirectUrl: string;
  failureRedirectUrl: string;
  notifyUrl: string;        // your backend webhook endpoint
}): Promise<{ url: string }> {
  const expiresOn = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

  const res = await fetch(url("/hosted/accounts/link"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      type: "create",
      providers: ["LINKEDIN"],
      api_url: UNIPILE_DSN,
      expiresOn,
      name: params.userId,                          // ← we get this back in the webhook
      success_redirect_url: params.successRedirectUrl,
      failure_redirect_url: params.failureRedirectUrl,
      notify_url: params.notifyUrl,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `Unipile hosted auth failed: ${res.status}`);
  }

  return res.json() as Promise<{ url: string }>;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  ACCOUNTS — list connected accounts for a user                              */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function getUnipileAccount(accountId: string) {
  const res = await fetch(url(`/accounts/${accountId}`), { headers: headers() });
  if (!res.ok) throw new Error(`Get account failed: ${res.status}`);
  return res.json();
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  PROFILE — resolve public LinkedIn URL slug → internal provider_id          */
/*  Required before sending an invitation                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function resolveLinkedInProfile(params: {
  accountId: string;        // Unipile account_id of the sender
  publicIdentifier: string; // e.g. "satyanadella" from linkedin.com/in/satyanadella
}): Promise<{
  provider_id: string;
  public_identifier: string;
  first_name: string;
  last_name: string;
  headline: string;
  relation?: string;        // "FIRST_DEGREE" | "SECOND_DEGREE" etc.
}> {
  const res = await fetch(
    url(`/users/${params.publicIdentifier}?account_id=${params.accountId}`),
    { headers: headers() }
  );
  if (!res.ok) throw new Error(`Resolve profile failed: ${res.status}`);
  return res.json();
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  INVITE — send a LinkedIn connection request                                 */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function sendLinkedInInvitation(params: {
  accountId: string;        // Unipile account_id of the sender
  providerId: string;       // internal provider_id from resolveLinkedInProfile
  message?: string;         // optional note (max 300 chars)
}): Promise<{ object: string; identifier: string }> {
  const res = await fetch(url("/users/invite"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      account_id: params.accountId,
      provider_id: params.providerId,
      message: params.message || undefined,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `Send invitation failed: ${res.status}`);
  }

  return res.json();
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  MESSAGE — send a follow-up message (after connection accepted)             */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function sendLinkedInMessage(params: {
  accountId: string;
  providerId: string;       // internal provider_id of the recipient
  message: string;
}): Promise<{ object: string; chat_id: string }> {
  const res = await fetch(url("/chats"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      account_id: params.accountId,
      provider_id: params.providerId,
      text: params.message,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `Send message failed: ${res.status}`);
  }

  return res.json();
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  WEBHOOKS — register Unipile webhooks (call once at setup)                  */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function registerUnipileWebhook(params: {
  name: string;
  requestUrl: string;       // your backend URL to receive events
  source: "users" | "messaging" | "email";
}) {
  const res = await fetch(url("/webhooks"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: params.name,
      source: params.source,
      request_url: params.requestUrl,
      headers: [{ key: "Content-Type", value: "application/json" }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `Register webhook failed: ${res.status}`);
  }

  return res.json();
}