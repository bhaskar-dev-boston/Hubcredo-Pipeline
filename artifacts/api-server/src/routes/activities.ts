import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { ActivitySyncHelper, type ActivityType } from "../lib/activitySync";
import { z } from "zod";

const router: IRouter = Router();

const getAttioConfig = () => ({
  clientId: process.env.ATTIO_CLIENT_ID || "",
  clientSecret: process.env.ATTIO_CLIENT_SECRET || "",
  redirectUri: process.env.ATTIO_REDIRECT_URI || "",
});

// Log activity for a lead
router.post(
  "/leads/:id/log-activity",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const paramsSchema = z.object({
        id: z.string(),
      });

      const bodySchema = z.object({
        type: z.enum(["email_open", "email_reply", "linkedin_connection"]),
        details: z.record(z.unknown()).optional(),
      });

      const params = paramsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({ error: params.error.message });
        return;
      }

      const body = bodySchema.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: body.error.message });
        return;
      }

      const config = getAttioConfig();
      const activityHelper = new ActivitySyncHelper(config, req.log);

      const result = await activityHelper.logActivityToCRM({
        leadId: params.data.id,
        userId: req.userId!,
        type: body.data.type as ActivityType,
        details: body.data.details,
      });

      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      req.log.error({ error }, "Failed to log activity");
      res.status(500).json({ error: "Failed to log activity" });
    }
  }
);

// Log email open
router.post(
  "/leads/:id/log-email-open",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const paramsSchema = z.object({
        id: z.string(),
      });

      const bodySchema = z.object({
        email_id: z.string().optional(),
        timestamp: z.string().optional(),
      });

      const params = paramsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({ error: params.error.message });
        return;
      }

      const body = bodySchema.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: body.error.message });
        return;
      }

      const config = getAttioConfig();
      const activityHelper = new ActivitySyncHelper(config, req.log);

      const result = await activityHelper.logEmailOpen(
        params.data.id,
        req.userId!,
        body.data.email_id,
        body.data.timestamp
      );

      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      req.log.error({ error }, "Failed to log email open");
      res.status(500).json({ error: "Failed to log email open" });
    }
  }
);

// Log email reply
router.post(
  "/leads/:id/log-email-reply",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const paramsSchema = z.object({
        id: z.string(),
      });

      const bodySchema = z.object({
        email_id: z.string().optional(),
        sender_email: z.string().optional(),
        timestamp: z.string().optional(),
      });

      const params = paramsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({ error: params.error.message });
        return;
      }

      const body = bodySchema.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: body.error.message });
        return;
      }

      const config = getAttioConfig();
      const activityHelper = new ActivitySyncHelper(config, req.log);

      const result = await activityHelper.logEmailReply(
        params.data.id,
        req.userId!,
        body.data.email_id,
        body.data.sender_email,
        body.data.timestamp
      );

      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      req.log.error({ error }, "Failed to log email reply");
      res.status(500).json({ error: "Failed to log email reply" });
    }
  }
);

// Log LinkedIn connection
router.post(
  "/leads/:id/log-linkedin-connection",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const paramsSchema = z.object({
        id: z.string(),
      });

      const bodySchema = z.object({
        linkedin_url: z.string().optional(),
        timestamp: z.string().optional(),
      });

      const params = paramsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({ error: params.error.message });
        return;
      }

      const body = bodySchema.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: body.error.message });
        return;
      }

      const config = getAttioConfig();
      const activityHelper = new ActivitySyncHelper(config, req.log);

      const result = await activityHelper.logLinkedInConnection(
        params.data.id,
        req.userId!,
        body.data.linkedin_url,
        body.data.timestamp
      );

      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      req.log.error({ error }, "Failed to log LinkedIn connection");
      res.status(500).json({ error: "Failed to log LinkedIn connection" });
    }
  }
);

export default router;
