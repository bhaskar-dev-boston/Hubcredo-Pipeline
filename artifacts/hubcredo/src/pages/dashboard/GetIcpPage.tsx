import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TagInput } from "@/components/ui/TagInput";
import { useCreateIcp } from "@workspace/api-client-react";
import { Loader2, Save, Target, Sparkles, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

/** Parse a size string like "201-500", "1000+", "201-1000" into [min, max] */
function parseSizeRange(s: string): [number, number] {
  const plus = s.match(/^(\d+)\+$/);
  if (plus) return [parseInt(plus[1]), Infinity];
  const range = s.match(/^(\d+)[–\-](\d+)$/);
  if (range) return [parseInt(range[1]), parseInt(range[2])];
  const single = s.match(/^(\d+)$/);
  if (single) { const n = parseInt(single[1]); return [n, n]; }
  return [0, Infinity];
}

/** Map webhook company size strings (which may not match chip labels exactly)
 *  to the set of COMPANY_SIZES chips they overlap with. */
function mapCompanySizes(rawSizes: string[]): string[] {
  const selected = new Set<string>();
  for (const raw of rawSizes) {
    const [rMin, rMax] = parseSizeRange(raw);
    for (const chip of COMPANY_SIZES) {
      const [cMin, cMax] = parseSizeRange(chip);
      // ranges overlap if rMin <= cMax && cMin <= rMax
      if (rMin <= cMax && cMin <= rMax) selected.add(chip);
    }
  }
  return Array.from(selected);
}

const chipBase = "px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors cursor-pointer";
const chipActive = "bg-[#6B4EFF] border-[#6B4EFF] text-white";
const chipInactive = "bg-white border-[#E5E7EB] text-[#6B7280] hover:border-[#6B4EFF] hover:text-[#6B4EFF]";
const saveBtn = "flex items-center gap-2 px-5 py-2.5 bg-[#6B4EFF] text-white text-sm font-semibold rounded-xl hover:bg-[#5B3FE0] transition-colors disabled:opacity-50";

interface IcpResult {
  // Webhook actual fields
  suggested_job_titles?: string[];
  icp_signals?: string[];
  suggested_industries?: string[];
  suggested_company_sizes?: string[];
  suggested_geographies?: string[];
  // Generic / legacy variants
  job_titles?: string[];
  target_job_titles?: string[];
  buying_signals?: string[];
  target_industries?: string[];
  company_sizes?: string[];
  geographies?: string[];
  excluded_industries?: string[];
}

function normalizeIcp(raw: IcpResult) {
  return {
    jobTitles:          raw.suggested_job_titles ?? raw.job_titles ?? raw.target_job_titles ?? [],
    buyingSignals:      raw.icp_signals ?? raw.buying_signals ?? [],
    targetIndustries:   raw.suggested_industries ?? raw.target_industries ?? [],
    companySizes:       mapCompanySizes((raw.suggested_company_sizes ?? raw.company_sizes ?? []).filter(Boolean)),
    geographies:        (raw.suggested_geographies ?? raw.geographies ?? []).filter(Boolean),
    excludedIndustries: raw.excluded_industries ?? [],
  };
}

/** The webhook returns either a single object or an array — normalise both. */
function extractFirst(data: unknown): IcpResult {
  if (Array.isArray(data)) return (data[0] ?? {}) as IcpResult;
  return (data ?? {}) as IcpResult;
}

export default function GetIcpPage() {
  const { toast } = useToast();
  const createIcp = useCreateIcp();

  const [websiteUrl, setWebsiteUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof normalizeIcp> | null>(null);

  // Editable state (user can tweak before saving)
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [buyingSignals, setBuyingSignals] = useState<string[]>([]);
  const [targetIndustries, setTargetIndustries] = useState<string[]>([]);
  const [companySizes, setCompanySizes] = useState<string[]>([]);
  const [geographies, setGeographies] = useState<string[]>([]);
  const [excludedIndustries, setExcludedIndustries] = useState<string[]>([]);

  async function handleGetIcp() {
    const url = websiteUrl.trim();
    if (!url) {
      toast({ title: "Website required", description: "Please enter your company website or domain.", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/webhooks/get-icp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ website_url: url }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to get ICP");
      }
      const data = await res.json();
      const normalized = normalizeIcp(extractFirst(data));
      setResult(normalized);
      setJobTitles(normalized.jobTitles);
      setBuyingSignals(normalized.buyingSignals);
      setTargetIndustries(normalized.targetIndustries);
      setCompanySizes(normalized.companySizes);
      setGeographies(normalized.geographies);
      setExcludedIndustries(normalized.excludedIndustries);
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message ?? "Something went wrong.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveIcp() {
    try {
      await createIcp.mutateAsync({
        data: {
          job_titles: jobTitles,
          buying_signals: buyingSignals,
          industries: targetIndustries,
          company_sizes: companySizes,
          geographies: geographies,
          excluded_industries: excludedIndustries,
        },
      });
      toast({ title: "ICP saved!", description: "Your Ideal Customer Profile has been saved to settings." });
    } catch {
      toast({ title: "Failed to save ICP", description: "Please try again.", variant: "destructive" });
    }
  }

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px", fontFamily: "'Inter', system-ui, sans-serif" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#F5F3FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Target style={{ width: 18, height: 18, color: "#6B4EFF" }} />
            </div>
            <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "#1E1B4B", margin: 0 }}>Get Your Company ICP</h1>
          </div>
          <p style={{ fontSize: "0.875rem", color: "#6B7280", margin: 0 }}>
            Enter your company website and our AI will analyse it to extract your Ideal Customer Profile.
          </p>
        </div>

        {/* URL input card */}
        <div style={{ background: "#fff", border: "1px solid rgba(107,78,255,.15)", borderRadius: 14, padding: 24, marginBottom: 24, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#1E1B4B", marginBottom: 8 }}>
            Company website or domain
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              type="url"
              value={websiteUrl}
              onChange={e => setWebsiteUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !loading && handleGetIcp()}
              placeholder="https://yourcompany.com"
              style={{
                flex: 1, padding: "10px 14px", border: "1.5px solid #E5E7EB", borderRadius: 10,
                fontSize: "0.875rem", color: "#1E1B4B", outline: "none", fontFamily: "inherit",
                transition: "border-color .15s",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "#6B4EFF"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#E5E7EB"; }}
            />
            <button
              onClick={handleGetIcp}
              disabled={loading}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 20px",
                background: loading ? "#9CA3AF" : "#6B4EFF", color: "#fff", border: "none",
                borderRadius: 10, fontSize: "0.875rem", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
                transition: "background .15s", whiteSpace: "nowrap",
              }}
            >
              {loading ? <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> : <Sparkles style={{ width: 15, height: 15 }} />}
              {loading ? "Analysing…" : "Get ICP"}
            </button>
          </div>
        </div>

        {/* Results */}
        {result && (
          <div style={{ background: "#fff", border: "1px solid rgba(107,78,255,.15)", borderRadius: 14, padding: 28, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
            {/* Title row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#1E1B4B", margin: "0 0 4px" }}>Ideal Customer Profile</h2>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem", color: "#059669" }}>
                  <CheckCircle style={{ width: 13, height: 13 }} /> AI-generated — review and edit before saving
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {/* Target job titles */}
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#1E1B4B", marginBottom: 6 }}>Target job titles</label>
                <TagInput value={jobTitles} onChange={setJobTitles} placeholder="e.g. VP of Sales, Head of Growth" />
              </div>

              {/* Buying signals */}
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#1E1B4B", marginBottom: 6 }}>Buying signals</label>
                <TagInput value={buyingSignals} onChange={setBuyingSignals} placeholder="e.g. hiring SDRs, new funding, CRO hire" />
              </div>

              {/* Target industries */}
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#1E1B4B", marginBottom: 6 }}>Target industries</label>
                <TagInput value={targetIndustries} onChange={setTargetIndustries} placeholder="e.g. SaaS, FinTech" />
              </div>

              {/* Company sizes */}
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#1E1B4B", marginBottom: 8 }}>Company sizes</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {COMPANY_SIZES.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setCompanySizes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                      className={`${chipBase} ${companySizes.includes(s) ? chipActive : chipInactive}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Geographies */}
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#1E1B4B", marginBottom: 6 }}>Geographies</label>
                <TagInput value={geographies} onChange={setGeographies} placeholder="e.g. North America, EMEA, APAC" />
              </div>

              {/* Excluded industries */}
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#1E1B4B", marginBottom: 6 }}>Excluded industries</label>
                <TagInput value={excludedIndustries} onChange={setExcludedIndustries} placeholder="e.g. Government, Non-profit" />
              </div>

              {/* Save button */}
              <div style={{ paddingTop: 4 }}>
                <button onClick={handleSaveIcp} disabled={createIcp.isPending} className={saveBtn}>
                  {createIcp.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save ICP
                </button>
              </div>
            </div>
          </div>
        )}

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </DashboardLayout>
  );
}
