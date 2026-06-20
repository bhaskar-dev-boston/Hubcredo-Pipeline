import { useState } from "react";
import { useLocation } from "wouter";
import { Zap, ArrowRight, ArrowLeft, Loader2, Globe, CheckCircle, AlignCenter } from "lucide-react";
import { TagInput } from "@/components/ui/TagInput";
import {
  useUpdateProfile,
  useCreateAnalysis,
  useCreateIcp,
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

  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [stage, setStage] = useState("");
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [buyingSignals, setBuyingSignals] = useState<string[]>([]);
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

  const chipBase = "px-3 py-2 rounded-lg text-sm transition-colors border cursor-pointer";
  const chipActive = "bg-[#F5F3FF] border-[#6B4EFF] text-[#6B4EFF] font-medium";
  const chipInactive = "border-[rgba(107,78,255,0.15)] text-[#6B7280] hover:text-[#6B4EFF] hover:border-[#6B4EFF] hover:bg-[#F5F3FF] bg-white";

  function renderStep() {
    switch (step) {
      case 0:
        return (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">Company name *</label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Inc."
                className="w-full px-3 py-2.5 bg-white border border-[rgba(107,78,255,0.2)] rounded-lg text-sm text-[#1E1B4B] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#6B4EFF] focus:ring-2 focus:ring-[rgba(107,78,255,0.15)] transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">Website URL *</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
                <input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://acme.com"
                  className="w-full pl-10 pr-3 py-2.5 bg-white border border-[rgba(107,78,255,0.2)] rounded-lg text-sm text-[#1E1B4B] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#6B4EFF] focus:ring-2 focus:ring-[rgba(107,78,255,0.15)] transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E1B4B] mb-2">Industry</label>
              <div className="grid grid-cols-2 gap-2">
                {INDUSTRIES.map((i) => (
                  <button key={i} type="button" onClick={() => setIndustry(i)}
                    className={`${chipBase} text-left ${industry === i ? chipActive : chipInactive}`}>
                    {i}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E1B4B] mb-2">Stage</label>
              <div className="flex flex-wrap gap-2">
                {STAGES.map((s) => (
                  <button key={s} type="button" onClick={() => setStage(s)}
                    className={`${chipBase} ${stage === s ? chipActive : chipInactive}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleStep0}
              disabled={updateProfile.isPending || createAnalysis.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#6B4EFF] text-white font-semibold rounded-lg hover:bg-[#5B3FE0] transition-colors text-sm disabled:opacity-50"
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
              <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">Target job titles</label>
              <TagInput value={jobTitles} onChange={setJobTitles} placeholder="e.g. VP of Sales, Head of Growth" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">Buying signals</label>
              <TagInput value={buyingSignals} onChange={setBuyingSignals} placeholder="e.g. hiring SDRs, new CRO, funding" />
            </div>
            <button
              onClick={() => setStep(2)}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#6B4EFF] text-white font-semibold rounded-lg hover:bg-[#5B3FE0] transition-colors text-sm"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        );

      case 2:
        return (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">Target industries</label>
              <TagInput value={targetIndustries} onChange={setTargetIndustries} placeholder="e.g. SaaS, FinTech" suggestions={INDUSTRIES} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E1B4B] mb-2">Company sizes</label>
              <div className="flex flex-wrap gap-2">
                {COMPANY_SIZES.map((s) => (
                  <button key={s} type="button"
                    onClick={() => setTargetSize((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}
                    className={`${chipBase} ${targetSize.includes(s) ? chipActive : chipInactive}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">Geographies</label>
              <TagInput value={targetGeo} onChange={setTargetGeo} placeholder="e.g. US, UK, DACH" />
            </div>
            <button
              onClick={handleIcp}
              disabled={createIcp.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#6B4EFF] text-white font-semibold rounded-lg hover:bg-[#5B3FE0] transition-colors text-sm disabled:opacity-50"
            >
              {createIcp.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Finish setup <CheckCircle className="w-4 h-4" />
            </button>
          </div>
        );

      case 3:
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 mx-auto bg-[#F5F3FF] border border-[rgba(107,78,255,0.2)] rounded-full flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-[#6B4EFF]" />
            </div>
            <div>
              <h3 className="text-[#1E1B4B] font-semibold text-lg mb-2">You're all set!</h3>
              <p className="text-[#6B7280] text-sm leading-relaxed">
                Your sales infrastructure is ready. Head to the dashboard to generate leads and build your stack.
              </p>
            </div>
            <button
              onClick={() => setLocation("/dashboard")}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#6B4EFF] text-white font-semibold rounded-lg hover:bg-[#5B3FE0] transition-colors text-sm"
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
    <div className="min-h-screen bg-[#F8F7FF] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex justify-center mb-2">
  <img src="/favicon.svg" alt="HubCredo" style={{ width: 210, height: 90, objectFit: "contain" }} />
</div>
        {/* Progress bar */}
        <div className="flex items-center gap-1.5 mb-8">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
                i < step
                  ? "bg-[#6B4EFF]"
                  : i === step
                  ? "bg-[#6B4EFF]"
                  : "bg-[#E5E7EB]"
              }`}
            />
          ))}
        </div>

        {/* Card */}
        <div className="bg-white border border-[rgba(107,78,255,0.12)] rounded-2xl p-6 shadow-[0_4px_24px_rgba(107,78,255,0.08)]">
          <div className="mb-6">
            <p className="text-xs text-[#6B4EFF] font-semibold tracking-widest uppercase mb-1">
              Step {step + 1} of {steps.length}
            </p>
            <h2
              style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: "1.8rem", letterSpacing: "0.04em" }}
              className="text-[#1E1B4B] leading-tight font-bold"
            >
              {steps[step].title}
            </h2>
            <p className="text-[#6B7280] text-sm mt-1">{steps[step].subtitle}</p>
          </div>
          {renderStep()}
        </div>

        {/* Back button */}
        {step > 0 && step < 3 && (
          <button
            onClick={() => setStep((s) => s - 1)}
            className="flex items-center gap-2 mx-auto mt-4 text-sm text-[#9CA3AF] hover:text-[#6B4EFF] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        )}
      </div>
    </div>
  );
}