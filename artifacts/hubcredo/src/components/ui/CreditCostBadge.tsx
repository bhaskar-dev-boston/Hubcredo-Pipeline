import { Zap } from "lucide-react";

interface CreditCostBadgeProps {
  action: string;
  variant?: "light" | "dark";
}

// 1 credit = $1. Costs reflect actual tool costs + healthy margin.
const CREDIT_COSTS: Record<string, number> = {
  company_analysis: 2,
  lead_scraping: 0,   // special: 25 leads per credit — displayed separately
  domain_check: 0,
  linkedin_outreach: 1,
  research_blurb: 1,
};

const CREDIT_LABELS: Record<string, string> = {
  lead_scraping: "25 leads / $1",
};

export function CreditCostBadge({ action, variant = "light" }: CreditCostBadgeProps) {
  const credits = CREDIT_COSTS[action] ?? 0;
  const customLabel = CREDIT_LABELS[action];

  const bgClass = variant === "dark"
    ? "bg-[#0A0A0A] text-white"
    : "bg-[#F5F7FA] text-[#0A0A0A]";

  if (customLabel) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${bgClass}`}>
        <Zap className="w-3 h-3" />
        <span>{customLabel}</span>
      </div>
    );
  }

  if (credits === 0) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${bgClass}`}>
        <Zap className="w-3 h-3" />
        <span>Free</span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${bgClass}`}>
      <Zap className="w-3 h-3" />
      <span>{credits} {credits === 1 ? "credit" : "credits"} = ${credits}</span>
    </div>
  );
}
