import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TagInput } from "@/components/ui/TagInput";
import {
  useGetMe,
  useUpdateProfile,
  useListIcps,
  useCreateIcp,
  useAutoFillIcp,
  useGetOutreachSettings,
  useUpdateOutreachSettings,
} from "@workspace/api-client-react";
import { Loader2, Save, CheckCircle, Sparkles } from "lucide-react";
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

  const [fullName, setFullName] = useState("");
  const updateProfile = useUpdateProfile();

  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [buyingSignals, setBuyingSignals] = useState<string[]>([]);
  const [targetIndustries, setTargetIndustries] = useState<string[]>([]);
  const [targetSize, setTargetSize] = useState<string[]>([]);
  const [targetGeo, setTargetGeo] = useState<string[]>([]);
  const [excludedIndustries, setExcludedIndustries] = useState<string[]>([]);
  const createIcp = useCreateIcp();
  const autoFillIcp = useAutoFillIcp();

  const [monthlyLeadTarget, setMonthlyLeadTarget] = useState<string>("");
  const [messagingFramework, setMessagingFramework] = useState<string>("");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [linkedinEnabled, setLinkedinEnabled] = useState(true);
  const updateOutreach = useUpdateOutreachSettings();

  useEffect(() => { if (profile?.full_name) setFullName(profile.full_name); }, [profile]);

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
      toast({ title: "Profile saved" });
    } catch {
      toast({ title: "Error", description: "Could not save profile.", variant: "destructive" });
    }
  }

  async function handleSaveIcp() {
    try {
      await createIcp.mutateAsync({ data: { job_titles: jobTitles, buying_signals: buyingSignals, industries: targetIndustries, company_sizes: targetSize, geographies: targetGeo, excluded_industries: excludedIndustries } });
      refetchIcps();
      toast({ title: "ICP saved" });
    } catch {
      toast({ title: "Error", description: "Could not save ICP.", variant: "destructive" });
    }
  }

  async function handleAutoFillIcp() {
    try {
      const filled = await autoFillIcp.mutateAsync();
      if (filled.job_titles) setJobTitles(filled.job_titles);
      if (filled.industries) setTargetIndustries(filled.industries);
      if (filled.company_sizes) setTargetSize(filled.company_sizes);
      if (filled.geographies) setTargetGeo(filled.geographies);
      if (filled.buying_signals) setBuyingSignals(filled.buying_signals);
      if (filled.excluded_industries) setExcludedIndustries(filled.excluded_industries);
      refetchIcps();
      toast({ title: "ICP auto-filled!", description: "AI has populated your ICP from your website analysis. Review and save." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not auto-fill ICP.";
      toast({ title: "Auto-fill failed", description: msg, variant: "destructive" });
    }
  }

  async function handleSaveOutreach() {
    try {
      await updateOutreach.mutateAsync({ data: { email_enabled: emailEnabled, linkedin_enabled: linkedinEnabled, monthly_lead_target: monthlyLeadTarget ? Number(monthlyLeadTarget) : undefined, messaging_framework: messagingFramework || undefined } });
      toast({ title: "Outreach settings saved" });
    } catch {
      toast({ title: "Error", description: "Could not save outreach settings.", variant: "destructive" });
    }
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "icp", label: "ICP" },
    { id: "outreach", label: "Outreach" },
  ];

  const chipBase = "px-3 py-2 rounded-lg text-sm transition-colors border cursor-pointer";
  const chipActive = "bg-[#EFF6FF] border-[#BFDBFE] text-[#2563EB]";
  const chipInactive = "border-[#E2E8F0] text-[#64748B] hover:text-[#0A0A0A] hover:border-[#CBD5E1] hover:bg-[#F5F7FA]";

  const inputClass = "w-full px-3 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-sm text-[#0A0A0A] placeholder:text-[#64748B] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 transition-colors";
  const saveBtn = "flex items-center gap-2 px-4 py-2.5 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50";

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-8 max-w-3xl mx-auto">
        <div className="mb-6 sm:mb-8 pt-2">
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", letterSpacing: "0.04em" }} className="text-[#0A0A0A] mb-1">
            Settings
          </h1>
          <p className="text-[#64748B] text-sm">Manage your profile, ICP, and outreach preferences</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 sm:mb-8 bg-[#F5F7FA] border border-[#E2E8F0] rounded-lg p-1 w-full sm:w-fit overflow-x-auto">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === id
                  ? "bg-white text-[#0A0A0A] shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-[#E2E8F0]"
                  : "text-[#64748B] hover:text-[#0A0A0A]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "profile" && (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <h2 className="text-[#0A0A0A] font-semibold">Profile details</h2>
            <div>
              <label className="block text-sm font-medium text-[#0A0A0A] mb-1.5">Full name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0A0A0A] mb-1.5">Email</label>
              <input value={profile?.email ?? ""} disabled className={`${inputClass} opacity-50 cursor-not-allowed`} />
              <p className="text-xs text-[#64748B] mt-1.5">Email cannot be changed here.</p>
            </div>
            <button onClick={handleSaveProfile} disabled={updateProfile.isPending} className={saveBtn}>
              {updateProfile.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save changes
            </button>
          </div>
        )}

        {activeTab === "icp" && (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[#0A0A0A] font-semibold">Ideal Customer Profile</h2>
                {(icps as Icp[]).length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-green-700 mt-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Configured
                  </div>
                )}
              </div>
              <button
                onClick={handleAutoFillIcp}
                disabled={autoFillIcp.isPending}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#2563EB] text-white text-xs font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50 shrink-0"
              >
                {autoFillIcp.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Sparkles className="w-3.5 h-3.5" />}
                {autoFillIcp.isPending ? "Analysing…" : "Auto-fill from website"}
              </button>
            </div>
            {autoFillIcp.isPending && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                AI is reading your website analysis and generating your ICP — this takes about 5 seconds…
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-[#0A0A0A] mb-1.5">Target job titles</label>
              <TagInput value={jobTitles} onChange={setJobTitles} placeholder="e.g. VP of Sales, Head of Growth" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0A0A0A] mb-1.5">Buying signals</label>
              <TagInput value={buyingSignals} onChange={setBuyingSignals} placeholder="e.g. hiring SDRs, new funding, CRO hire" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0A0A0A] mb-1.5">Target industries</label>
              <TagInput value={targetIndustries} onChange={setTargetIndustries} placeholder="e.g. SaaS, FinTech" suggestions={INDUSTRIES} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0A0A0A] mb-2">Company sizes</label>
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
              <label className="block text-sm font-medium text-[#0A0A0A] mb-1.5">Geographies</label>
              <TagInput value={targetGeo} onChange={setTargetGeo} placeholder="e.g. US, UK, DACH" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0A0A0A] mb-1.5">Excluded industries</label>
              <TagInput value={excludedIndustries} onChange={setExcludedIndustries} placeholder="e.g. Government, Non-profit" />
            </div>
            <button onClick={handleSaveIcp} disabled={createIcp.isPending} className={saveBtn}>
              {createIcp.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save ICP
            </button>
          </div>
        )}

        {activeTab === "outreach" && (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <h2 className="text-[#0A0A0A] font-semibold">Outreach settings</h2>
            <div className="space-y-3">
              {[
                { label: "Email outreach", sub: "Enable email as an outreach channel", val: emailEnabled, set: setEmailEnabled },
                { label: "LinkedIn outreach", sub: "Enable LinkedIn as an outreach channel", val: linkedinEnabled, set: setLinkedinEnabled },
              ].map(({ label, sub, val, set }) => (
                <div key={label} className="flex items-center justify-between p-4 bg-[#F5F7FA] border border-[#E2E8F0] rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-[#0A0A0A]">{label}</p>
                    <p className="text-xs text-[#64748B]">{sub}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => set((v) => !v)}
                    className={`w-11 h-6 rounded-full transition-colors relative ${val ? "bg-[#2563EB]" : "bg-[#CBD5E1]"}`}
                  >
                    <span className={`block w-4 h-4 bg-white rounded-full absolute top-1 shadow-sm transition-transform ${val ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
              ))}
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0A0A0A] mb-1.5">Monthly lead target</label>
              <input type="number" value={monthlyLeadTarget} onChange={(e) => setMonthlyLeadTarget(e.target.value)} placeholder="e.g. 50" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0A0A0A] mb-1.5">Messaging framework</label>
              <textarea
                value={messagingFramework}
                onChange={(e) => setMessagingFramework(e.target.value)}
                placeholder="Describe your outreach approach, key messages, or value props to lead with..."
                rows={4}
                className={`${inputClass} resize-none`}
              />
            </div>
            <button onClick={handleSaveOutreach} disabled={updateOutreach.isPending} className={saveBtn}>
              {updateOutreach.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save settings
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
