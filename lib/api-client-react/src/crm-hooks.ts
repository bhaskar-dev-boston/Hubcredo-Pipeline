import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface CRMConnection {
  connected: boolean;
  crm_type?: string;
  workspace_id?: string;
  workspace_name?: string;
  field_mapping?: Record<string, boolean>;
  connected_at?: string;
}

interface FieldMapping {
  first_name?: boolean;
  last_name?: boolean;
  email?: boolean;
  job_title?: boolean;
  company_name?: boolean;
  linkedin_url?: boolean;
}

interface SyncStatus {
  status: "not_synced" | "synced" | "pending" | "error";
  contactId?: string;
  error?: string;
  syncedAt?: string;
}

const API_BASE = "http://localhost:3001/api";

/**
 * Get CRM authorization URL for OAuth flow
 */
export function useGetCRMAuthUrl() {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE}/crm/authorize/attio`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to get authorization URL");
      }

      const data = (await response.json()) as { authorization_url: string };
      return data;
    },
  });
}

/**
 * Handle OAuth callback with code
 */
export function useConnectCRM() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ code, state }: { code: string; state: string }) => {
      const response = await fetch(`${API_BASE}/crm/callback/attio`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ code, state }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to connect to Attio");
      }

      const data = (await response.json()) as {
        success: boolean;
        workspace_id: string;
        workspace_name: string;
        connected_at: string;
      };
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-connection"] });
    },
  });
}

/**
 * Get current CRM connection status
 */
export function useGetCRMConnection() {
  return useQuery({
    queryKey: ["crm-connection"],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/crm/connection`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch CRM connection");
      }

      const data = (await response.json()) as CRMConnection;
      return data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Update field mapping
 */
export function useUpdateFieldMapping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mapping: FieldMapping) => {
      const response = await fetch(`${API_BASE}/crm/field-mapping`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(mapping),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to update field mapping");
      }

      const data = (await response.json()) as { field_mapping: Record<string, boolean> };
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-connection"] });
    },
  });
}

/**
 * Disconnect CRM
 */
export function useDisconnectCRM() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE}/crm/connection`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to disconnect CRM");
      }

      const data = (await response.json()) as { success: boolean };
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-connection"] });
    },
  });
}

/**
 * Get lead sync status
 */
export function useGetLeadSyncStatus(leadId: string) {
  return useQuery({
    queryKey: ["lead-sync-status", leadId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/leads/${leadId}/crm-sync-status`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch sync status");
      }

      const data = (await response.json()) as SyncStatus;
      return data;
    },
    enabled: !!leadId,
    staleTime: 1000 * 30, // 30 seconds
  });
}

/**
 * Manually trigger sync for a lead (for testing/retries)
 */
export function useSyncLeadToCRM() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: string) => {
      const response = await fetch(`${API_BASE}/leads/${leadId}/sync-to-crm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to sync lead");
      }

      const data = (await response.json()) as { success: boolean; contact_id: string };
      return data;
    },
    onSuccess: (_data, leadId) => {
      queryClient.invalidateQueries({ queryKey: ["lead-sync-status", leadId] });
    },
  });
}
