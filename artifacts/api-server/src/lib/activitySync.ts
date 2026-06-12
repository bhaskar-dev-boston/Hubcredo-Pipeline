import { CRMSyncService } from "./crmSync";
import { supabase } from "./supabase";
import type { Logger } from "pino";

export type ActivityType = "email_open" | "email_reply" | "linkedin_connection";

export interface ActivityEvent {
  leadId: string;
  userId: string;
  type: ActivityType;
  details?: Record<string, unknown>;
  timestamp?: string;
}

export class ActivitySyncHelper {
  private syncService: CRMSyncService;
  private logger?: Logger;

  constructor(attioConfig: { clientId: string; clientSecret: string; redirectUri: string }, logger?: Logger) {
    this.syncService = new CRMSyncService(attioConfig, logger);
    this.logger = logger;
  }

  /**
   * Log an activity to the CRM for a lead
   */
  async logActivityToCRM(event: ActivityEvent): Promise<{ success: boolean; error?: string }> {
    try {
      // Get lead details
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .select("id, crm_contact_id")
        .eq("id", event.leadId)
        .eq("user_id", event.userId)
        .single();

      if (leadError || !lead) {
        this.logger?.warn({ leadId: event.leadId }, "Lead not found for activity sync");
        return { success: false, error: "Lead not found" };
      }

      // Skip if lead is not synced to CRM
      if (!lead.crm_contact_id) {
        this.logger?.debug(
          { leadId: event.leadId },
          "Lead not synced to CRM, skipping activity log"
        );
        return { success: false, error: "Lead not synced to CRM" };
      }

      // Add activity to CRM
      const result = await this.syncService.addActivityToContact(
        event.userId,
        event.leadId,
        lead.crm_contact_id,
        event.type,
        event.details
      );

      if (result.success) {
        this.logger?.debug({ leadId: event.leadId, type: event.type }, "Activity logged to CRM");
      }

      return result;
    } catch (error) {
      this.logger?.error({ error, leadId: event.leadId }, "Error logging activity to CRM");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Log email open activity
   */
  async logEmailOpen(
    leadId: string,
    userId: string,
    emailId?: string,
    timestamp?: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.logActivityToCRM({
      leadId,
      userId,
      type: "email_open",
      details: {
        email_id: emailId,
        opened_at: timestamp || new Date().toISOString(),
      },
    });
  }

  /**
   * Log email reply activity
   */
  async logEmailReply(
    leadId: string,
    userId: string,
    emailId?: string,
    senderEmail?: string,
    timestamp?: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.logActivityToCRM({
      leadId,
      userId,
      type: "email_reply",
      details: {
        email_id: emailId,
        from: senderEmail,
        replied_at: timestamp || new Date().toISOString(),
      },
    });
  }

  /**
   * Log LinkedIn connection acceptance
   */
  async logLinkedInConnection(
    leadId: string,
    userId: string,
    linkedInUrl?: string,
    timestamp?: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.logActivityToCRM({
      leadId,
      userId,
      type: "linkedin_connection",
      details: {
        linkedin_url: linkedInUrl,
        accepted_at: timestamp || new Date().toISOString(),
      },
    });
  }

  /**
   * Log multiple activities in batch
   */
  async logActivitiesBatch(events: ActivityEvent[]): Promise<
    Array<{
      event: ActivityEvent;
      success: boolean;
      error?: string;
    }>
  > {
    const results = await Promise.all(
      events.map(async (event) => ({
        event,
        ...(await this.logActivityToCRM(event)),
      }))
    );

    const failedCount = results.filter((r) => !r.success).length;
    if (failedCount > 0) {
      this.logger?.warn(
        { total: events.length, failed: failedCount },
        "Some activities failed to sync"
      );
    }

    return results;
  }
}
