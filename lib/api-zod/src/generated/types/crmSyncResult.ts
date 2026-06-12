
export interface CrmSyncResult {
  success: boolean;
  /** @nullable */
  crm_contact_id?: string | null;
  /** @nullable */
  error?: string | null;
}