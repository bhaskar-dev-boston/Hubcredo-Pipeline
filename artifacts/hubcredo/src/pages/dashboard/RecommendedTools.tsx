import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { recommendedTools } from "@/lib/recommendedTools";
import { ExternalLink, Star } from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  "domains & mailboxes": "bg-orange-50 border-orange-200 text-orange-700",
  "linkedin outreach":   "bg-sky-50 border-sky-200 text-sky-700",
  "cold email + crm":    "bg-[rgba(124,58,237,.15)] border-[rgba(192,132,252,.3)] text-[#c084fc]",
  "crm":                 "bg-[rgba(99,102,241,.15)] border-[rgba(129,140,248,.3)] text-[#818cf8]",
  "email & phone finder":"bg-[rgba(16,185,129,.1)] border-[rgba(52,211,153,.25)] text-[#34d399]",
};

function categoryColor(category: string) {
  return (
    CATEGORY_COLORS[category.toLowerCase()] ??
    "bg-[rgba(255,255,255,.04)] border-[rgba(255,255,255,.08)] text-[rgba(255,255,255,.5)]"
  );
}

const TOOL_LOGOS: Record<string, { src: string; bg: string }> = {
  inboxkit:  { src: "/logos/inboxkit.png",  bg: "#fff" },
  unipile:   { src: "/logos/unipile.svg",   bg: "#091626" },
  instantly: { src: "/logos/instantly.svg", bg: "#0a1929" },
  attio:     { src: "/logos/attio.png",     bg: "#fff" },
  prospeo:   { src: "/logos/prospeo.jpg",   bg: "#fff" },
};

export default function RecommendedTools() {
  return (
    <DashboardLayout>
      <div className="p-4 sm:p-8 max-w-4xl mx-auto">
        <div className="mb-8 pt-2">
          <h1
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: "2rem", letterSpacing: "0.04em" }}
            className="text-white mb-1"
          >
            Recommended Tools
          </h1>
          <p className="text-[rgba(255,255,255,.5)] text-sm">
            The exact outbound stack we use and recommend for GTM success.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {recommendedTools.map((tool) => {
            const logoInfo = TOOL_LOGOS[tool.id];
            return (
              <div
                key={tool.id}
                className={`relative bg-[rgba(255,255,255,.04)] rounded-xl p-6 flex flex-col gap-4 transition-all shadow-none hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)] ${
                  tool.featured
                    ? "border-2 border-[#4f46e5]"
                    : "border border-[rgba(255,255,255,.08)] hover:border-[rgba(255,255,255,.15)]"
                }`}
              >
                {tool.featured && (
                  <div className="absolute -top-3 left-5">
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#4f46e5] text-white text-[11px] font-semibold rounded-full shadow-sm">
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
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 bg-[#64748B]">
                      {tool.name.slice(0, 2)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{tool.name}</p>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${categoryColor(tool.category)}`}
                    >
                      {tool.category}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-[rgba(255,255,255,.5)] leading-relaxed flex-1">{tool.description}</p>

                <a
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center justify-center gap-2 w-full py-2.5 text-sm font-semibold rounded-lg transition-colors ${
                    tool.featured
                      ? "bg-[#4f46e5] text-white hover:bg-[#4338ca]"
                      : "bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] text-white hover:bg-[#eef2ff] hover:border-[#c7d2fe] hover:text-[#4f46e5]"
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
