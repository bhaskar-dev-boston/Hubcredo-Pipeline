// ============================================================
// useReplyio.ts  –  React hook for Reply.io state & actions
// Place at: artifacts/hubcredo/src/hooks/useReplyio.ts
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { replyioApi, ReplySequence, ReplySequenceContact, ReplyStats } from "../lib/replyioApi";

interface UseReplyioReturn {
  // Connection
  isConnected: boolean;
  connectionLoading: boolean;
  connectedUser: { email: string; name: string } | null;
  checkConnection: () => Promise<void>;

  // Sequences
  sequences: ReplySequence[];
  sequencesLoading: boolean;
  fetchSequences: () => Promise<void>;

  // Selected sequence
  selectedSequenceId: number | null;
  setSelectedSequenceId: (id: number | null) => void;
  sequenceContacts: ReplySequenceContact[];
  sequenceStats: ReplyStats | null;
  contactsLoading: boolean;
  fetchSequenceData: (id: number) => Promise<void>;

  // Enroll
  enrolling: boolean;
  enrollContact: (payload: {
    email: string;
    firstName?: string;
    lastName?: string;
    title?: string;
    company?: string;
    linkedInProfile?: string;
    phone?: string;
    sequenceId: number;
  }) => Promise<void>;

  // Pause contact
  pausingContactId: number | null;
  pauseContact: (sequenceId: number, contactId: number) => Promise<void>;

  // Webhooks
  webhooks: unknown[];
  webhooksLoading: boolean;
  fetchWebhooks: () => Promise<void>;
  registeringWebhook: boolean;
  registerWebhook: (event: string, callbackUrl: string) => Promise<void>;

  // Errors / toasts
  error: string | null;
  successMessage: string | null;
  clearMessages: () => void;
}

export function useReplyio(): UseReplyioReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [connectedUser, setConnectedUser] = useState<{ email: string; name: string } | null>(null);

  const [sequences, setSequences] = useState<ReplySequence[]>([]);
  const [sequencesLoading, setSequencesLoading] = useState(false);

  const [selectedSequenceId, setSelectedSequenceId] = useState<number | null>(null);
  const [sequenceContacts, setSequenceContacts] = useState<ReplySequenceContact[]>([]);
  const [sequenceStats, setSequenceStats] = useState<ReplyStats | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);

  const [enrolling, setEnrolling] = useState(false);
  const [pausingContactId, setPausingContactId] = useState<number | null>(null);

  const [webhooks, setWebhooks] = useState<unknown[]>([]);
  const [webhooksLoading, setWebhooksLoading] = useState(false);
  const [registeringWebhook, setRegisteringWebhook] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const clearMessages = () => {
    setError(null);
    setSuccessMessage(null);
  };

  const toast = (msg: string, type: "success" | "error") => {
    if (type === "success") setSuccessMessage(msg);
    else setError(msg);
    setTimeout(() => {
      setSuccessMessage(null);
      setError(null);
    }, 4000);
  };

  // ── Connection Check ──────────────────────────────────────

  const checkConnection = useCallback(async () => {
    setConnectionLoading(true);
    try {
      const result = await replyioApi.validate();
      setIsConnected(result.valid);
      setConnectedUser(result.user ?? null);
    } catch {
      setIsConnected(false);
      setConnectedUser(null);
    } finally {
      setConnectionLoading(false);
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  // ── Sequences ─────────────────────────────────────────────

  const fetchSequences = useCallback(async () => {
    setSequencesLoading(true);
    try {
      const { sequences } = await replyioApi.listSequences();
      setSequences(sequences);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load sequences";
      toast(msg, "error");
    } finally {
      setSequencesLoading(false);
    }
  }, []);

  // Auto-load sequences once connected
  useEffect(() => {
    if (isConnected) fetchSequences();
  }, [isConnected, fetchSequences]);

  // ── Sequence Detail ───────────────────────────────────────

  const fetchSequenceData = useCallback(async (id: number) => {
    setContactsLoading(true);
    try {
      const [{ contacts }, stats] = await Promise.all([
        replyioApi.listContacts(id),
        replyioApi.getStats(id).catch(() => null),
      ]);
      setSequenceContacts(contacts);
      setSequenceStats(stats);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load sequence data";
      toast(msg, "error");
    } finally {
      setContactsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSequenceId !== null) fetchSequenceData(selectedSequenceId);
  }, [selectedSequenceId, fetchSequenceData]);

  // ── Enroll ────────────────────────────────────────────────

  const enrollContact = useCallback(
    async (payload: {
      email: string;
      firstName?: string;
      lastName?: string;
      title?: string;
      company?: string;
      linkedInProfile?: string;
      phone?: string;
      sequenceId: number;
    }) => {
      setEnrolling(true);
      try {
        const { sequenceId, ...contact } = payload;
        await replyioApi.enroll({ contact, sequenceId });
        toast(`${payload.email} enrolled successfully`, "success");
        // Refresh contacts if we're viewing that sequence
        if (selectedSequenceId === sequenceId) {
          await fetchSequenceData(sequenceId);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to enroll contact";
        toast(msg, "error");
        throw err; // re-throw so modal can stay open
      } finally {
        setEnrolling(false);
      }
    },
    [selectedSequenceId, fetchSequenceData]
  );

  // ── Pause Contact ─────────────────────────────────────────

  const pauseContact = useCallback(
    async (sequenceId: number, contactId: number) => {
      setPausingContactId(contactId);
      try {
        await replyioApi.pauseContact(sequenceId, contactId);
        toast("Contact paused", "success");
        await fetchSequenceData(sequenceId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to pause contact";
        toast(msg, "error");
      } finally {
        setPausingContactId(null);
      }
    },
    [fetchSequenceData]
  );

  // ── Webhooks ──────────────────────────────────────────────

  const fetchWebhooks = useCallback(async () => {
    setWebhooksLoading(true);
    try {
      const { webhooks } = await replyioApi.listWebhooks();
      setWebhooks(webhooks);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load webhooks";
      toast(msg, "error");
    } finally {
      setWebhooksLoading(false);
    }
  }, []);

  const registerWebhook = useCallback(async (event: string, callbackUrl: string) => {
    setRegisteringWebhook(true);
    try {
      await replyioApi.registerWebhook(event, callbackUrl);
      toast("Webhook registered", "success");
      await fetchWebhooks();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to register webhook";
      toast(msg, "error");
    } finally {
      setRegisteringWebhook(false);
    }
  }, [fetchWebhooks]);

  return {
    isConnected,
    connectionLoading,
    connectedUser,
    checkConnection,
    sequences,
    sequencesLoading,
    fetchSequences,
    selectedSequenceId,
    setSelectedSequenceId,
    sequenceContacts,
    sequenceStats,
    contactsLoading,
    fetchSequenceData,
    enrolling,
    enrollContact,
    pausingContactId,
    pauseContact,
    webhooks,
    webhooksLoading,
    fetchWebhooks,
    registeringWebhook,
    registerWebhook,
    error,
    successMessage,
    clearMessages,
  };
}