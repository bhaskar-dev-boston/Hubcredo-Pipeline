import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TagInput } from "@/components/ui/TagInput";
import {
  useGetMe,
  useUpdateProfile,
  useListIcps,
  useCreateIcp,
  useGetOutreachSettings,
  useUpdateOutreachSettings,
} from "@workspace/api-client-react";
import { Loader2, Save, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Icp, OutreachSettings } from "@workspace/api-client-react";

const INDUSTRIES = ["SaaS", "FinTech", "HealthTech", "EdTech", "E-commerce", "Marketplace", "Developer Tools", "AI/ML", "Cybersecurity", "PropTech"];
const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

type TabId = "profile" | "icp" | "outreach";

export default function Settings() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  const { data: profile } = useGetMe();
  const { data: icps = [], refetch: refetchIcps } = useListIcps();
  const { data: outreachRaw } = useGetOutreachSettings();
  const outreachSettings = outreachRaw as OutreachSettings | undefined;

  // Profile state
  const [fullName, setFullName] = useState("");
  const updateProfile = useUpdateProfile();

  // ICP state
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [buyingSignals, setBuyingSignals] = useState<string[]>([]);
  const [targetIndustries, setTargetIndustries] = useState<string[]>([]);
  const [targetSize, setTargetSize] = useState<string[]>([]);
  const [targetGeo, setTargetGeo] = useState<string[]>([]);
  const [excludedIndustries, setExcludedIndustries] = useState<string[]>([]);
  const createIcp = useCreateIcp();

  // Outreach state
  const [monthlyLeadTarget, setMonthlyLeadTarget] = useState<string>("");
  const [messagingFramework, setMessagingFramework] = useState<string>("");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [linkedinEnabled, setLinkedinEnabled] = useState(true);
  const updateOutreach = useUpdateOutreachSettings();

  // Sync from API
  useEffect(() => {
    if (profile?.full_name) setFullName(profile.full_name);
  }, [profile]);

  useEffect(() => {
    if ((icps as Icp[]).length > 0) {
      const icp = (icps as Icp[])[0];
      if (icp.job_titles) setJobTitles(icp.job_titles);
      if (icp.buying_signals) setBuyingSignals(icp.buying_signals);
      if (icp.industries) setTargetIndustries(icp.industries);
      if (icp.company_sizes) setTargetSize(icp.company_sizes);
      if (icp.geographies) setTargetGeo(icp.geographies);
      if (icp.excluded_industries) setExcludedIndustries(icp.excluded_industries);
    }
  }, [icps]);

  useEffect(() => {
    if (outreachSettings) {
      if (outreachSettings.monthly_lead_target != null) setMonthlyLeadTarget(String(outreachSettings.monthly_lead_target));
      if (outreachSettings.messaging_framework) setMessagingFramework(outreachSettings.messaging_framework);
      setEmailEnabled(outreachSettings.email_enabled ?? true);
      setLinkedinEnabled(outreachSettings.linkedin_enabled ?? true);
    }
  }, [outreachSettings]);

  async function handleSaveProfile() {
    try {
      await updateProfile.mutateAsync({ data: { full_name: fullName } });
      toast({ title: "Profile saved", description: "Your profile has been updated." });
    } catch {
      toast({ title: "Error", description: "Could not save profile.", variant: "destructive" });
    }
  }

  async function handleSaveIcp() {
    try {
      await createIcp.mutateAsync({
        data: {
          job_titles: jobTitles,
          buying_signals: buyingSignals,
          industries: targetIndustries,
          company_sizes: targetSize,
          geographies: targetGeo,
          excluded_industries: excludedIndustries,
        },
      });
      refetchIcps();
      toast({ title: "ICP saved", description: "Your ideal customer profile has been updated." });
    } catch {
      toast({ title: "Error", description: "Could not save ICP.", variant: "destructive" });
    }
  }

  async function handleSaveOutreach() {
    try {
      await updateOutreach.mutateAsync({
        data: {
          email_enabled: emailEnabled,
          linkedin_enabled: linkedinEnabled,
          monthly_lead_target: monthlyLeadTarget ? Number(monthlyLeadTarget) : undefined,
          messaging_framework: messagingFramework || undefined,
        },
      });
      toast({ title: "Outreach settings saved", description: "Your settings have been updated." });
    } catch {
      toast({ title: "Error", description: "Could not save outreach settings.", variant: "destructive" });
    }
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "icp", label: "ICP" },
    { id: "outreach", label: "Outreach" },
  ];

  return (
    <DashboardLayout>
      <div className="p-8 max-w-3xl mx-auto">
        <div className="mb-8">
          <h1
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", letterSpacing: "0.04em" }}
            className="text-white mb-1"
          >
            Settings
          </h1>
          <p className="text-[#888888] text-sm">Manage your profile, ICP, and outreach preferences</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg p-1 w-fit">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === id ? "bg-[#F5A623] text-[#0E0E0E]" : "text-[#888888] hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "profile" && (
          <div className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-xl p-6 space-y-5">
            <h2 className="text-white font-semibold">Profile details</h2>
            <div>
              <label className="block text-sm text-[#888888] mb-1.5">Full name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                className="w-full px-3 py-2.5 bg-[#0E0E0E] border border-[#2A2A2A] rounded-lg text-sm text-white placeholder:text-[#888888] focus:outline-none focus:border-[#F5A623] focus:ring-1 focus:ring-[#F5A623]/30 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-[#888888] mb-1.5">Email</label>
              <input
                value={profile?.email ?? ""}
                disabled
                className="w-full px-3 py-2.5 bg-[#0E0E0E] border border-[#2A2A2A] rounded-lg text-sm text-[#888888] cursor-not-allowed opacity-50"
              />
              <p className="text-xs text-[#888888] mt-1.5">Email cannot be changed here.</p>
            </div>
            <button
              onClick={handleSaveProfile}
              disabled={updateProfile.isPending}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#F5A623] text-[#0E0E0E] text-sm font-semibold rounded-lg hover:bg-[#E09612] transition-colors disabled:opacity-50"
            >
              {updateProfile.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save changes
            </button>
          </div>
        )}

        {activeTab === "icp" && (
          <div className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold">Ideal Customer Profile</h2>
              {(icps as Icp[]).length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-green-400">
                  <CheckCircle className="w-3.5 h-3.5" /> Configured
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm text-[#888888] mb-1.5">Target job titles</label>
              <TagInput value={jobTitles} onChange={setJobTitles} placeholder="e.g. VP of Sales, Head of Growth" />
            </div>
            <div>
              <label className="block text-sm text-[#888888] mb-1.5">Buying signals</label>
              <TagInput value={buyingSignals} onChange={setBuyingSignals} placeholder="e.g. hiring SDRs, new funding, CRO hire" />
            </div>
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
            <div>
              <label className="block text-sm text-[#888888] mb-1.5">Excluded industries</label>
              <TagInput value={excludedIndustries} onChange={setExcludedIndustries} placeholder="e.g. Government, Non-profit" />
            </div>
            <button
              onClick={handleSaveIcp}
              disabled={createIcp.isPending}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#F5A623] text-[#0E0E0E] text-sm font-semibold rounded-lg hover:bg-[#E09612] transition-colors disabled:opacity-50"
            >
              {createIcp.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save ICP
            </button>
          </div>
        )}

        {activeTab === "outreach" && (
          <div className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-xl p-6 space-y-6">
            <h2 className="text-white font-semibold">Outreach settings</h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-[#0E0E0E] border border-[#2A2A2A] rounded-lg">
                <div>
                  <p className="text-sm font-medium text-white">Email outreach</p>
                  <p className="text-xs text-[#888888]">Enable email as an outreach channel</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEmailEnabled((v) => !v)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${emailEnabled ? "bg-[#F5A623]" : "bg-[#2A2A2A]"}`}
                >
                  <span className={`block w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${emailEnabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              <div className="flex items-center justify-between p-4 bg-[#0E0E0E] border border-[#2A2A2A] rounded-lg">
                <div>
                  <p className="text-sm font-medium text-white">LinkedIn outreach</p>
                  <p className="text-xs text-[#888888]">Enable LinkedIn as an outreach channel</p>
                </div>
                <button
                  type="button"
                  onClick={() => setLinkedinEnabled((v) => !v)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${linkedinEnabled ? "bg-[#F5A623]" : "bg-[#2A2A2A]"}`}
                >
                  <span className={`block w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${linkedinEnabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-[#888888] mb-1.5">Monthly lead target</label>
              <input
                type="number"
                value={monthlyLeadTarget}
                onChange={(e) => setMonthlyLeadTarget(e.target.value)}
                placeholder="e.g. 50"
                className="w-full px-3 py-2.5 bg-[#0E0E0E] border border-[#2A2A2A] rounded-lg text-sm text-white placeholder:text-[#888888] focus:outline-none focus:border-[#F5A623] focus:ring-1 focus:ring-[#F5A623]/30 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-[#888888] mb-1.5">Messaging framework</label>
              <textarea
                value={messagingFramework}
                onChange={(e) => setMessagingFramework(e.target.value)}
                placeholder="Describe your outreach approach, key messages, or value props to lead with..."
                rows={4}
                className="w-full px-3 py-2.5 bg-[#0E0E0E] border border-[#2A2A2A] rounded-lg text-sm text-white placeholder:text-[#888888] focus:outline-none focus:border-[#F5A623] focus:ring-1 focus:ring-[#F5A623]/30 transition-colors resize-none"
              />
            </div>
            <button
              onClick={handleSaveOutreach}
              disabled={updateOutreach.isPending}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#F5A623] text-[#0E0E0E] text-sm font-semibold rounded-lg hover:bg-[#E09612] transition-colors disabled:opacity-50"
            >
              {updateOutreach.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save settings
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
