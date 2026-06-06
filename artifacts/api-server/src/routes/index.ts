import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import analysesRouter from "./analyses";
import icpsRouter from "./icps";
import settingsRouter from "./settings";
import stacksRouter from "./stacks";
import leadsRouter from "./leads";
import dashboardRouter from "./dashboard";
import webhooksRouter from "./webhooks";
import toolsRouter from "./tools";
import domainsRouter from "./domains";
import inboxkitRouter from "./inboxkit";
import contactsRouter from "./contacts";
import billingRouter from "./billing";
import campaignsRouter from "./campaigns";
import linkedinRouter from "./linkedin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(analysesRouter);
router.use(icpsRouter);
router.use(settingsRouter);
router.use(stacksRouter);
router.use(leadsRouter);
router.use(dashboardRouter);
router.use(webhooksRouter);
router.use(toolsRouter);
router.use(domainsRouter);
router.use(inboxkitRouter);
router.use(contactsRouter);
router.use(billingRouter);
router.use(campaignsRouter);
router.use(linkedinRouter);

export default router;
