export interface ToolRecommendation {
  slug: string;
  tool_name: string;
  category: string;
  reason: string;
  is_required: boolean;
  phase: string;
}

interface OutreachSettings {
  email_enabled?: boolean;
  linkedin_enabled?: boolean;
  monthly_lead_target?: number | null;
}

export function computeStackRecommendations(settings: OutreachSettings): ToolRecommendation[] {
  const tools: ToolRecommendation[] = [];
  const slugsSeen = new Set<string>();

  const addTool = (tool: ToolRecommendation) => {
    if (!slugsSeen.has(tool.slug)) {
      slugsSeen.add(tool.slug);
      tools.push(tool);
    }
  };

  // Always recommend Apollo
  addTool({
    slug: "apollo",
    tool_name: "Apollo.io",
    category: "leads",
    reason: "Best source for B2B leads matching your ICP",
    is_required: true,
    phase: "mvp",
  });

  if (settings.email_enabled) {
    addTool({
      slug: "instantly",
      tool_name: "Instantly",
      category: "email",
      reason: "High-deliverability cold email at scale",
      is_required: false,
      phase: "phase2",
    });
    addTool({
      slug: "mailreach",
      tool_name: "Mailreach",
      category: "warmup",
      reason: "Warm up your email domain to land in the inbox",
      is_required: false,
      phase: "phase2",
    });
  }

  if (settings.linkedin_enabled) {
    addTool({
      slug: "expandi",
      tool_name: "Expandi",
      category: "linkedin",
      reason: "Safe LinkedIn outreach automation that stays within limits",
      is_required: false,
      phase: "phase2",
    });
  }

  if ((settings.monthly_lead_target ?? 0) >= 50) {
    addTool({
      slug: "hubspot",
      tool_name: "HubSpot CRM",
      category: "crm",
      reason: "Track your pipeline as lead volume grows past 50/month",
      is_required: false,
      phase: "phase2",
    });
  }

  if (settings.email_enabled && settings.linkedin_enabled) {
    addTool({
      slug: "slack",
      tool_name: "Slack",
      category: "alerts",
      reason: "Get real-time alerts when leads engage across both channels",
      is_required: false,
      phase: "phase2",
    });
  }

  return tools;
}
