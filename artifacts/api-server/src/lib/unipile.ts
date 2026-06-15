/* ─────────────────────────────────────────────────────────────────────────── */
/*  lib/unipile.ts  — Unipile API wrapper for LinkedIn outreach                */
/* ─────────────────────────────────────────────────────────────────────────── */

const UNIPILE_DSN = process.env.UNIPILE_DSN!;
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
/*  HOSTED AUTH                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function createUnipileHostedAuthLink(params: {
  userId: string;
  successRedirectUrl: string;
  failureRedirectUrl: string;
  notifyUrl: string;
}): Promise<{ url: string }> {
  const expiresOn = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const res = await fetch(url("/hosted/accounts/link"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      type: "create",
      providers: ["LINKEDIN"],
      api_url: UNIPILE_DSN,
      expiresOn,
      name: params.userId,
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
/*  ACCOUNTS                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function getUnipileAccount(accountId: string) {
  const res = await fetch(url(`/accounts/${accountId}`), { headers: headers() });
  if (!res.ok) throw new Error(`Get account failed: ${res.status}`);
  return res.json();
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  PROFILE                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function resolveLinkedInProfile(params: {
  accountId: string;
  publicIdentifier: string;
}): Promise<{
  provider_id: string;
  public_identifier: string;
  first_name: string;
  last_name: string;
  headline: string;
  relation?: string;
}> {
  const res = await fetch(
    url(`/users/${params.publicIdentifier}?account_id=${params.accountId}`),
    { headers: headers() }
  );
  if (!res.ok) throw new Error(`Resolve profile failed: ${res.status}`);
  return res.json();
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  INVITE                                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function sendLinkedInInvitation(params: {
  accountId: string;
  providerId: string;
  message?: string;
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
/*  WEBHOOKS                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function registerUnipileWebhook(params: {
  name: string;
  requestUrl: string;
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

/* ─────────────────────────────────────────────────────────────────────────── */
/*  TYPES                                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

export interface UnipileAttendee {
  id?: string;
  member_id?: string;
  provider_id?: string;
  name?: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  public_identifier?: string;
  headline?: string;
  is_me?: boolean;
}

export interface UnipileChat {
  id: string;
  account_id: string;
  provider_id?: string;
  account_type?: string;
  name?: string | null;
  subject?: string | null;
  unread?: number;
  unread_count?: number;
  attendees?: UnipileAttendee[];
  attendee_provider_id?: string | null;
  timestamp?: string | null;
  display_name?: string | null;
  last_message_text?: string | null;
  last_message_sender_is_me?: boolean | null;
}

export interface UnipileMessage {
  id: string;
  chat_id: string;
  text?: string | null;
  body?: string | null;
  timestamp?: string;
  created_at?: string;
  date?: string;
  is_sender?: boolean;
  is_event?: boolean;
  hidden?: boolean;
  sender_id?: string;
  attachments?: any[];
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  INTERNAL HELPERS                                                           */
/* ─────────────────────────────────────────────────────────────────────────── */

async function fetchLatestMessage(chatId: string): Promise<{
  text: string | null;
  is_sender: boolean;
  timestamp: string | null;
} | null> {
  try {
    const res = await fetch(
      url(`/chats/${encodeURIComponent(chatId)}/messages?limit=10`),
      { headers: headers() }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const messages: UnipileMessage[] = data.items ?? [];
    for (const msg of messages) {
      if (msg.hidden || msg.is_event) continue;
      const text = msg.text ?? msg.body ?? null;
      const hasAttachment = (msg.attachments?.length ?? 0) > 0;
      return {
        text: text ?? (hasAttachment ? "📎 Attachment" : null),
        is_sender: msg.is_sender ?? false,
        timestamp: msg.timestamp ?? msg.created_at ?? msg.date ?? null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchChatDisplayName(chatId: string): Promise<string | null> {
  try {
    const res = await fetch(
      url(`/chats/${encodeURIComponent(chatId)}/attendees`),
      { headers: headers() }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const attendees: UnipileAttendee[] = data.items ?? data.attendees ?? [];
    const other = attendees.find((a) => a.is_me === false) ?? attendees.find((a) => !a.is_me) ?? null;
    if (!other) return null;
    return (
      other.display_name ??
      other.name ??
      ((other.first_name || other.last_name)
        ? `${other.first_name ?? ""} ${other.last_name ?? ""}`.trim()
        : null)
    );
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  listChats                                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function listChats(
  accountId: string,
  limit = 50
): Promise<{ items: UnipileChat[] }> {
  const listRes = await fetch(
    url(`/chats?account_id=${encodeURIComponent(accountId)}&limit=${limit}`),
    { headers: headers() }
  );

  if (!listRes.ok) {
    const err = await listRes.json().catch(() => ({}));
    throw new Error((err as any).message || `List chats failed: ${listRes.status}`);
  }

  const listData = await listRes.json();
  const rawChats: any[] = listData.items ?? [];
  if (rawChats.length === 0) return { items: [] };

  const settled = await Promise.allSettled(
    rawChats.slice(0, 25).map(async (chat: any): Promise<UnipileChat> => {
      const [latestMsg, resolvedName] = await Promise.all([
        fetchLatestMessage(chat.id),
        (chat.display_name == null || chat.display_name === "")
          ? fetchChatDisplayName(chat.id)
          : Promise.resolve(chat.display_name as string),
      ]);

      return {
        ...chat,
        display_name: resolvedName ?? chat.display_name ?? null,
        last_message_text: latestMsg?.text ?? chat.last_message_text ?? null,
        last_message_sender_is_me: latestMsg != null
          ? latestMsg.is_sender
          : (chat.last_message_sender_is_me === 1 || chat.last_message_sender_is_me === true),
        timestamp: latestMsg?.timestamp ?? chat.timestamp ?? null,
        unread_count: chat.unread_count ?? chat.unread ?? 0,
      };
    })
  );

  return {
    items: settled
      .filter((r): r is PromiseFulfilledResult<UnipileChat> => r.status === "fulfilled")
      .map((r) => r.value),
  };
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  getChatMessages — full message history for a chat                         */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function getChatMessages(
  chatId: string,
  limit = 50
): Promise<{ items: UnipileMessage[] }> {
  // Note: /chats/{id}/messages does NOT require account_id per Unipile docs
  const res = await fetch(
    url(`/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}`),
    { headers: headers() }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `Get chat messages failed: ${res.status}`);
  }

  return res.json();
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  sendMessage — send a message in an existing chat                          */
/*                                                                             */
/*  Endpoint: POST /chats/{chat_id}/messages                                  */
/*  Content-Type: multipart/form-data  (required by Unipile)                 */
/*  Field: text                                                               */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function sendMessage(params: {
  chatId: string;
  text: string;
}): Promise<{ id: string; chat_id: string }> {
  // Must use multipart/form-data — Unipile does NOT accept JSON for this endpoint
  const form = new FormData();
  form.append("text", params.text);

  const res = await fetch(url(`/chats/${encodeURIComponent(params.chatId)}/messages`), {
    method: "POST",
    headers: {
      "X-API-KEY": UNIPILE_API_KEY,
      accept: "application/json",
      // Do NOT set Content-Type — let fetch set it with the boundary
    },
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `Send message failed: ${res.status}`);
  }

  return res.json();
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  sendLinkedInMessage — kept for backward compatibility (start new chat)    */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function sendLinkedInMessage(params: {
  accountId: string;
  providerId: string;
  message: string;
}): Promise<{ object: string; chat_id: string }> {
  const form = new FormData();
  form.append("account_id", params.accountId);
  form.append("text", params.message);
  form.append("attendees_ids", params.providerId);

  const res = await fetch(url("/chats"), {
    method: "POST",
    headers: {
      "X-API-KEY": UNIPILE_API_KEY,
      accept: "application/json",
    },
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `Send message failed: ${res.status}`);
  }

  return res.json();
}
