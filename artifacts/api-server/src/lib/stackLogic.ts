export interface ToolRecommendation {
  slug: string;
  tool_name: string;
  category: string;
  reason: string;
  is_required: boolean;
  phase: string;
}

interface IcpData {
  job_titles?: string[] | null;
  industries?: string[] | null;
  company_sizes?: string[] | null;
  pain_points?: string[] | null;
  geographies?: string[] | null;
}

interface SettingsData {
  email_enabled?: boolean | null;
  linkedin_enabled?: boolean | null;
  monthly_lead_target?: number | null;
  messaging_framework?: string | null;
}

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function computeStackRecommendations(
  icp: IcpData,
  settings: SettingsData = {}
): Promise<ToolRecommendation[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const icpSummary = [
    icp.job_titles?.length ? `Target roles: ${icp.job_titles.join(", ")}` : null,
    icp.industries?.length ? `Industries: ${icp.industries.join(", ")}` : null,
    icp.company_sizes?.length ? `Company sizes: ${icp.company_sizes.join(", ")}` : null,
    icp.pain_points?.length ? `Pain points: ${icp.pain_points.join(", ")}` : null,
    icp.geographies?.length ? `Geographies: ${icp.geographies.join(", ")}` : null,
    settings.email_enabled != null ? `Email outreach: ${settings.email_enabled ? "enabled" : "disabled"}` : null,
    settings.linkedin_enabled != null ? `LinkedIn outreach: ${settings.linkedin_enabled ? "enabled" : "disabled"}` : null,
    settings.monthly_lead_target != null ? `Monthly lead target: ${settings.monthly_lead_target}` : null,
    settings.messaging_framework ? `Messaging framework: ${settings.messaging_framework}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `You are a B2B sales stack expert advisor for early-stage SaaS founders.

Based on the following ICP (Ideal Customer Profile) and outreach settings, recommend the best GTM (Go-To-Market) sales tools. Be specific and opinionated — recommend tools that genuinely fit this exact ICP, not generic tools.

ICP & Settings:
${icpSummary}

Return ONLY a valid JSON array of tool recommendation objects. No markdown, no explanation, no code fences — just the raw JSON array.

Each object must have exactly these fields:
- slug: string (lowercase, hyphenated, e.g. "apollo-io")
- tool_name: string (proper name, e.g. "Apollo.io")
- category: string (one of: leads, crm, email, linkedin, enrichment, automation, analytics, warmup, alerts, other)
- reason: string (2 sentences max, specific to THIS ICP — explain WHY this tool fits their specific target audience)
- is_required: boolean (true for must-have MVP tools, false for nice-to-have)
- phase: string (one of: mvp, phase2, phase3)

Rules:
- Recommend 5 to 8 tools total
- Always include at least 1 leads tool and 1 outreach tool
- If targeting enterprise (VP, C-suite, large companies): lean toward LinkedIn + account-based tools
- If targeting SMB/mid-market: lean toward email sequences + data enrichment
- If linkedin_enabled: always include a LinkedIn automation tool
- If email_enabled: always include an email sequencing tool + a warmup tool
- Make the "reason" field hyper-specific to the ICP — mention the job titles or industries by name
- Do NOT recommend tools just because they are popular; justify each pick against this ICP`;

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error ${response.status}: ${err}`);
  }

  const json = await response.json() as { choices: Array<{ message: { content: string } }> };
  const content = json.choices[0]?.message?.content ?? "[]";

  let tools: ToolRecommendation[];
  try {
    tools = JSON.parse(content.trim());
  } catch {
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("Groq returned unparseable JSON");
    tools = JSON.parse(match[0]);
  }

  if (!Array.isArray(tools)) throw new Error("Groq response is not an array");

  return tools.map((t) => ({
    slug: String(t.slug ?? "").toLowerCase().replace(/\s+/g, "-"),
    tool_name: String(t.tool_name ?? ""),
    category: String(t.category ?? "other").toLowerCase(),
    reason: String(t.reason ?? ""),
    is_required: Boolean(t.is_required),
    phase: String(t.phase ?? "mvp"),
  }));
}
