import { useState } from "react";
import { useLocation } from "wouter";
import { Zap, ArrowRight, ArrowLeft, Loader2, Globe, CheckCircle } from "lucide-react";
import { TagInput } from "@/components/ui/TagInput";
import {
  useUpdateProfile,
  useCreateAnalysis,
  useCreateIcp,
  useGetOutreachSettings,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const INDUSTRIES = ["SaaS", "FinTech", "HealthTech", "EdTech", "E-commerce", "Marketplace", "Developer Tools", "AI/ML", "Cybersecurity", "PropTech"];
const STAGES = ["Pre-seed", "Seed", "Series A", "Series B+", "Bootstrapped"];
const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

interface Step {
  title: string;
  subtitle: string;
}

const steps: Step[] = [
  { title: "Your company", subtitle: "Tell us about your product" },
  { title: "Your ICP", subtitle: "Define your ideal customer" },
  { title: "Target companies", subtitle: "Who are you selling to?" },
  { title: "You're all set", subtitle: "Start building your pipeline" },
];

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(0);

  // Step 0 — profile
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [stage, setStage] = useState("");

  // Step 1 — ICP personas / job titles
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [buyingSignals, setBuyingSignals] = useState<string[]>([]);

  // Step 2 — target companies
  const [targetIndustries, setTargetIndustries] = useState<string[]>([]);
  const [targetSize, setTargetSize] = useState<string[]>([]);
  const [targetGeo, setTargetGeo] = useState<string[]>([]);

  const updateProfile = useUpdateProfile();
  const createAnalysis = useCreateAnalysis();
  const createIcp = useCreateIcp();

  async function handleStep0() {
    if (!companyName || !website) {
      toast({ title: "Required", description: "Company name and website are required.", variant: "destructive" });
      return;
    }
    try {
      await updateProfile.mutateAsync({ data: { full_name: companyName } });
      await createAnalysis.mutateAsync({ data: { website_url: website } });
      setStep(1);
    } catch {
      toast({ title: "Error", description: "Could not save company details.", variant: "destructive" });
    }
  }

  async function handleIcp() {
    try {
      await createIcp.mutateAsync({
        data: {
          job_titles: jobTitles,
          buying_signals: buyingSignals,
          industries: targetIndustries,
          company_sizes: targetSize,
          geographies: targetGeo,
        },
      });
    } catch {
      // non-blocking
    }
    setStep(3);
  }

  function renderStep() {
    switch (step) {
      case 0:
        return (
          <div className="space-y-5">
            <div>
              <label className="block text-sm text-[#888888] mb-1.5">Company name *</label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Inc."
                className="w-full px-3 py-2.5 bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg text-sm text-white placeholder:text-[#888888] focus:outline-none focus:border-[#F5A623] focus:ring-1 focus:ring-[#F5A623]/30 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-[#888888] mb-1.5">Website URL *</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#888888]" />
                <input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://acme.com"
                  className="w-full pl-10 pr-3 py-2.5 bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg text-sm text-white placeholder:text-[#888888] focus:outline-none focus:border-[#F5A623] focus:ring-1 focus:ring-[#F5A623]/30 transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-[#888888] mb-1.5">Industry</label>
              <div className="grid grid-cols-2 gap-2">
                {INDUSTRIES.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIndustry(i)}
                    className={`px-3 py-2 rounded-lg text-sm text-left transition-colors border ${
                      industry === i
                        ? "bg-[#F5A623]/10 border-[#F5A623]/40 text-[#F5A623]"
                        : "border-[#2A2A2A] text-[#888888] hover:text-white hover:border-[#444]"
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-[#888888] mb-1.5">Stage</label>
              <div className="flex flex-wrap gap-2">
                {STAGES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStage(s)}
                    className={`px-3 py-2 rounded-lg text-sm transition-colors border ${
                      stage === s
                        ? "bg-[#F5A623]/10 border-[#F5A623]/40 text-[#F5A623]"
                        : "border-[#2A2A2A] text-[#888888] hover:text-white hover:border-[#444]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleStep0}
              disabled={updateProfile.isPending || createAnalysis.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#F5A623] text-[#0E0E0E] font-semibold rounded-lg hover:bg-[#E09612] transition-colors text-sm disabled:opacity-50"
            >
              {(updateProfile.isPending || createAnalysis.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        );

      case 1:
        return (
          <div className="space-y-5">
            <div>
              <label className="block text-sm text-[#888888] mb-1.5">Target job titles</label>
              <TagInput value={jobTitles} onChange={setJobTitles} placeholder="e.g. VP of Sales, Head of Growth" />
            </div>
            <div>
              <label className="block text-sm text-[#888888] mb-1.5">Buying signals</label>
              <TagInput value={buyingSignals} onChange={setBuyingSignals} placeholder="e.g. hiring SDRs, new CRO, funding" />
            </div>
            <button
              onClick={() => setStep(2)}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#F5A623] text-[#0E0E0E] font-semibold rounded-lg hover:bg-[#E09612] transition-colors text-sm"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        );

      case 2:
        return (
          <div className="space-y-5">
            <div>
              <label className="block text-sm text-[#888888] mb-1.5">Target industries</label>
              <TagInput value={targetIndustries} onChange={setTargetIndustries} placeholder="e.g. SaaS, FinTech" suggestions={INDUSTRIES} />
            </div>
            <div>
              <label className="block text-sm text-[#888888] mb-2">Company sizes</label>
              <div className="flex flex-wrap gap-2">
                {COMPANY_SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTargetSize((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}
                    className={`px-3 py-2 rounded-lg text-sm transition-colors border ${
                      targetSize.includes(s)
                        ? "bg-[#F5A623]/10 border-[#F5A623]/40 text-[#F5A623]"
                        : "border-[#2A2A2A] text-[#888888] hover:text-white hover:border-[#444]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-[#888888] mb-1.5">Geographies</label>
              <TagInput value={targetGeo} onChange={setTargetGeo} placeholder="e.g. US, UK, DACH" />
            </div>
            <button
              onClick={handleIcp}
              disabled={createIcp.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#F5A623] text-[#0E0E0E] font-semibold rounded-lg hover:bg-[#E09612] transition-colors text-sm disabled:opacity-50"
            >
              {createIcp.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Finish setup <CheckCircle className="w-4 h-4" />
            </button>
          </div>
        );

      case 3:
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 mx-auto bg-[#F5A623]/10 border border-[#F5A623]/20 rounded-full flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-[#F5A623]" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-lg mb-2">You're all set!</h3>
              <p className="text-[#888888] text-sm leading-relaxed">
                Your sales infrastructure is ready. Head to the dashboard to generate leads and build your stack.
              </p>
            </div>
            <button
              onClick={() => setLocation("/dashboard")}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#F5A623] text-[#0E0E0E] font-semibold rounded-lg hover:bg-[#E09612] transition-colors text-sm"
            >
              Go to Dashboard <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <div className="min-h-screen bg-[#0E0E0E] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-[#F5A623] rounded flex items-center justify-center">
              <Zap className="w-5 h-5 text-[#0E0E0E]" />
            </div>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem", letterSpacing: "0.08em" }} className="text-white">
              HubCredo
            </span>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-1.5 mb-8">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-1 rounded-full transition-colors ${
                i <= step ? "bg-[#F5A623]" : "bg-[#2A2A2A]"
              }`}
            />
          ))}
        </div>

        {/* Card */}
        <div className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-xl p-6">
          <div className="mb-6">
            <p className="text-xs text-[#F5A623] font-medium tracking-widest uppercase mb-1">
              Step {step + 1} of {steps.length}
            </p>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", letterSpacing: "0.04em" }} className="text-white leading-tight">
              {steps[step].title}
            </h2>
            <p className="text-[#888888] text-sm mt-1">{steps[step].subtitle}</p>
          </div>
          {renderStep()}
        </div>

        {step > 0 && step < 3 && (
          <button
            onClick={() => setStep((s) => s - 1)}
            className="flex items-center gap-2 mx-auto mt-4 text-sm text-[#888888] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        )}
      </div>
    </div>
  );
}
