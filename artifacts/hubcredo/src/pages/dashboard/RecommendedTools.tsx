import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { recommendedTools } from "@/lib/recommendedTools";
import { ExternalLink, Star } from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  "domains & mailboxes": "bg-orange-50 border-orange-200 text-orange-700",
  "linkedin outreach":   "bg-sky-50 border-sky-200 text-sky-700",
  "cold email + crm":    "bg-[rgba(107,78,255,.08)] border-[rgba(107,78,255,.25)] text-[#6B4EFF]",
  "crm":                 "bg-[rgba(107,78,255,.08)] border-[rgba(107,78,255,.25)] text-[#6B4EFF]",
  "email & phone finder":"bg-emerald-50 border-emerald-200 text-emerald-700",
};

function categoryColor(category: string) {
  return (
    CATEGORY_COLORS[category.toLowerCase()] ??
    "bg-[#F5F3FF] border-[rgba(107,78,255,.15)] text-[#6B4EFF]"
  );
}

const TOOL_LOGOS: Record<string, { src: string; bg: string }> = {
  inboxkit:  { src: "/logos/inboxkit.png",  bg: "#fff" },
  unipile:   { src: "/logos/unipile.png",   bg: "#091626" },
  instantly: { src: "/logos/instantly.svg", bg: "#0a1929" },
  attio:     { src: "/logos/attio.png",     bg: "#fff" },
  prospeo:   { src: "/logos/prospeo.webp",   bg: "#fff" },
};

export default function RecommendedTools() {
  return (
    <DashboardLayout>
      <div className="p-4 sm:p-8 max-w-4xl mx-auto">
        <div className="mb-8 pt-2">
          <h1
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: "2rem", letterSpacing: "0.04em" }}
            className="text-[#1E1B4B] mb-1"
          >
            Recommended Tools
          </h1>
          <p className="text-[#6B7280] text-sm">
            The exact outbound stack we use and recommend for GTM success.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {recommendedTools.map((tool) => {
            const logoInfo = TOOL_LOGOS[tool.id];
            return (
              <div
                key={tool.id}
                className={`relative bg-white rounded-xl p-6 flex flex-col gap-4 transition-all shadow-sm hover:shadow-md ${
                  tool.featured
                    ? "border-2 border-[#6B4EFF]"
                    : "border border-[rgba(107,78,255,.12)] hover:border-[rgba(107,78,255,.25)]"
                }`}
              >
                {tool.featured && (
                  <div className="absolute -top-3 left-5">
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#6B4EFF] text-white text-[11px] font-semibold rounded-full shadow-sm">
                      <Star className="w-3 h-3 fill-white" />
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  {logoInfo ? (
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden p-1.5"
                      style={{ background: logoInfo.bg, border: "1px solid #E2E8F0" }}
                    >
                      <img
                        src={logoInfo.src}
                        alt={tool.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 bg-[#6B4EFF]">
                      {tool.name.slice(0, 2)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1E1B4B]">{tool.name}</p>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${categoryColor(tool.category)}`}
                    >
                      {tool.category}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-[#6B7280] leading-relaxed flex-1">{tool.description}</p>

                <a
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center justify-center gap-2 w-full py-2.5 text-sm font-semibold rounded-lg transition-colors ${
                    tool.featured
                      ? "bg-[#6B4EFF] text-white hover:bg-[#5A3FE0]"
                      : "bg-[#F5F3FF] border border-[rgba(107,78,255,.15)] text-[#1E1B4B] hover:bg-[#EEF2FF] hover:border-[#6B4EFF] hover:text-[#6B4EFF]"
                  }`}
                >
                  {tool.ctaLabel}
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}