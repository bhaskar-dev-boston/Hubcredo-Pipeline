export interface RecommendedTool {
  id: string;
  name: string;
  category: string;
  description: string;
  ctaLabel: string;
  url: string;
  featured: boolean;
}

export const recommendedTools: RecommendedTool[] = [
  {
    id: "inboxkit",
    name: "Inboxkit",
    category: "Domains & Mailboxes",
    description:
      "Set up professional email infrastructure with Google Workspace & Microsoft 365 mailboxes",
    ctaLabel: "Get Started →",
    url: "https://refer.instantly.ai/6jb0phac9fgz",
    featured: false,
  },
  {
    id: "unipile",
    name: "Unipile",
    category: "LinkedIn Outreach",
    description:
      "Connect LinkedIn, WhatsApp, Gmail, and Outlook into one unified messaging layer",
    ctaLabel: "Get Started →",
    url: "https://refer.instantly.ai/6jb0phac9fgz",
    featured: false,
  },
  {
    id: "instantly",
    name: "Instantly.ai",
    category: "Cold Email + CRM",
    description:
      "Send cold email campaigns at scale with built-in warmup, deliverability tools, and a full CRM",
    ctaLabel: "Get Started →",
    url: "https://refer.instantly.ai/6jb0phac9fgz",
    featured: true,
  },
  {
    id: "attio",
    name: "Attio",
    category: "CRM",
    description:
      "A modern CRM built for fast-moving sales teams. Manage contacts, pipelines, and relationships",
    ctaLabel: "Get Started →",
    url: "https://refer.instantly.ai/6jb0phac9fgz",
    featured: false,
  },
  {
    id: "prospeo",
    name: "Prospeo",
    category: "Email & Phone Finder",
    description:
      "Find verified B2B emails and phone numbers directly from LinkedIn profiles",
    ctaLabel: "Get Started →",
    url: "https://refer.instantly.ai/6jb0phac9fgz",
    featured: false,
  },
];

export const CORE_STACK_SLUGS = ["inboxkit", "unipile", "instantly", "attio", "prospeo"];
