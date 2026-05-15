import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { ListToolsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// Static fallback tools if tools_catalogue table is empty
const STATIC_TOOLS = [
  {
    id: "1",
    slug: "apollo",
    name: "Apollo.io",
    category: "leads",
    description: "All-in-one sales intelligence platform with 270M+ verified contacts",
    logo_url: null,
    pricing_summary: "Free tier + paid plans from $49/mo",
    referral_url: "https://apollo.io",
    setup_guide_url: null,
    phase: "mvp",
    is_active: true,
  },
  {
    id: "2",
    slug: "instantly",
    name: "Instantly",
    category: "email",
    description: "Cold email platform built for scale with AI-powered personalization",
    logo_url: null,
    pricing_summary: "From $37/mo",
    referral_url: "https://instantly.ai",
    setup_guide_url: null,
    phase: "phase2",
    is_active: true,
  },
  {
    id: "3",
    slug: "mailreach",
    name: "Mailreach",
    category: "warmup",
    description: "Email warmup tool to protect your sender reputation",
    logo_url: null,
    pricing_summary: "From $25/mo",
    referral_url: "https://mailreach.co",
    setup_guide_url: null,
    phase: "phase2",
    is_active: true,
  },
  {
    id: "4",
    slug: "expandi",
    name: "Expandi",
    category: "linkedin",
    description: "Safe, cloud-based LinkedIn automation for outbound campaigns",
    logo_url: null,
    pricing_summary: "From $99/mo",
    referral_url: "https://expandi.io",
    setup_guide_url: null,
    phase: "phase2",
    is_active: true,
  },
  {
    id: "5",
    slug: "hubspot",
    name: "HubSpot CRM",
    category: "crm",
    description: "Free CRM to track deals, contacts, and pipeline",
    logo_url: null,
    pricing_summary: "Free forever + paid from $45/mo",
    referral_url: "https://hubspot.com",
    setup_guide_url: null,
    phase: "phase2",
    is_active: true,
  },
  {
    id: "6",
    slug: "slack",
    name: "Slack",
    category: "alerts",
    description: "Real-time notifications for lead activity across channels",
    logo_url: null,
    pricing_summary: "Free + Pro from $7.25/mo",
    referral_url: "https://slack.com",
    setup_guide_url: null,
    phase: "phase2",
    is_active: true,
  },
];

router.get("/tools", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data, error } = await supabase
    .from("tools_catalogue")
    .select("*")
    .eq("is_active", true)
    .order("phase", { ascending: true });

  // If table is empty or errored, return static tools
  if (error || !data || data.length === 0) {
    res.json(ListToolsResponse.parse(STATIC_TOOLS));
    return;
  }

  res.json(ListToolsResponse.parse(data));
});

export default router;
