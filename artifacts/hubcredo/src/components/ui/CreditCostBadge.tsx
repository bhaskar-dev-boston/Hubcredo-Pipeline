import { Zap } from "lucide-react";

interface CreditCostBadgeProps {
  action: string;
  variant?: "light" | "dark";
}

const CREDIT_COSTS: Record<string, number> = {
  domain_check: 10,
  lead_scraping: 50,
  company_analysis: 100,
};

export function CreditCostBadge({ action, variant = "light" }: CreditCostBadgeProps) {
  const credits = CREDIT_COSTS[action] || 0;

  const bgClass = variant === "dark" 
    ? "bg-[#0A0A0A] text-white" 
    : "bg-[#F5F7FA] text-[#0A0A0A]";

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${bgClass}`}>
      <Zap className="w-3 h-3" />
      <span>{credits} credits</span>
    </div>
  );
}
