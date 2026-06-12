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
  useGetCrmConnection,
  useConnectCrm,
  useDisconnectCrm,
  useGetCrmFieldMapping,
  useUpdateCrmFieldMapping,
} from "@workspace/api-client-react";
import {
  Loader2,
  Save,
  CheckCircle,
  Link2,
  Link2Off,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  Key,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Icp, OutreachSettings } from "@workspace/api-client-react";

const INDUSTRIES = [
  "SaaS", "FinTech", "HealthTech", "EdTech", "E-commerce",
  "Marketplace", "Developer Tools", "AI/ML", "Cybersecurity", "PropTech",
];
const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

const ATTIO_API_KEY_URL =
  "https://app.attio.com/hubcredoworkspace/settings/developers/access-tokens";

type TabId = "profile" | "icp" | "outreach" | "crm";

const CRM_FIELDS: { key: string; label: string; description: string }[] = [
  { key: "first_name",    label: "First Name",    description: "Maps to Attio name.first_name" },
  { key: "last_name",     label: "Last Name",     description: "Maps to Attio name.last_name" },
  { key: "email",         label: "Email",         description: "Maps to Attio email_addresses" },
  { key: "job_title",     label: "Job Title",     description: "Maps to Attio job_title" },
  { key: "company_name",  label: "Company Name",  description: "Maps to Attio company_name" },
  { key: "linkedin_url",  label: "LinkedIn URL",  description: "Maps to Attio linkedin" },
];

export default function Settings() {
  const { toast } = useToast();

  // Read ?tab= from URL on mount to support sidebar "CRM Connect" deep-link
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as TabId | null;
    return tab && ["profile", "icp", "outreach", "crm"].includes(tab) ? tab : "profile";
  });

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

  const [monthlyLeadTarget, setMonthlyLeadTarget] = useState<string>("");
  const [messagingFramework, setMessagingFramework] = useState<string>("");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [linkedinEnabled, setLinkedinEnabled] = useState(true);
  const updateOutreach = useUpdateOutreachSettings();

  // CRM state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: crmConnection, refetch: refetchCrm, error: crmError } = useGetCrmConnection({ query: { retry: false } as any });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: crmFieldMapping, refetch: refetchMapping } = useGetCrmFieldMapping({ query: { enabled: !!crmConnection, retry: false } as any });
  const connectCrm = useConnectCrm();
  const disconnectCrm = useDisconnectCrm();
  const updateFieldMapping = useUpdateCrmFieldMapping();
  const [crmApiKey, setCrmApiKey] = useState("");
  const [urlCopied, setUrlCopied] = useState(false);
  const [fieldMapping, setFieldMapping] = useState<Record<string, boolean>>({
    first_name: true, last_name: true, email: true,
    job_title: true, company_name: true, linkedin_url: true,
  });
  const isConnected = !!crmConnection && !crmError;

  useEffect(() => {
    if (crmFieldMapping?.mapping) {
      setFieldMapping(crmFieldMapping.mapping as Record<string, boolean>);
    }
  }, [crmFieldMapping]);

  useEffect(() => {
    if (profile?.full_name) setFullName(profile.full_name);
  }, [profile]);

  useEffect(() => {
    if ((icps as Icp[]).length > 0) {
      const icp = (icps as Icp[])[0];
      if (icp.job_titles)          setJobTitles(icp.job_titles);
      if (icp.buying_signals)      setBuyingSignals(icp.buying_signals);
      if (icp.industries)          setTargetIndustries(icp.industries);
      if (icp.company_sizes)       setTargetSize(icp.company_sizes);
      if (icp.geographies)         setTargetGeo(icp.geographies);
      if (icp.excluded_industries) setExcludedIndustries(icp.excluded_industries);
    }
  }, [icps]);

  useEffect(() => {
    if (outreachSettings) {
      if (outreachSettings.monthly_lead_target != null)
        setMonthlyLeadTarget(String(outreachSettings.monthly_lead_target));
      if (outreachSettings.messaging_framework)
        setMessagingFramework(outreachSettings.messaging_framework);
      setEmailEnabled(outreachSettings.email_enabled ?? true);
      setLinkedinEnabled(outreachSettings.linkedin_enabled ?? true);
    }
  }, [outreachSettings]);

  // ── Handlers ──────────────────────────────────────────────────────────────

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
      toast({ title: "ICP saved" });
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
      toast({ title: "Outreach settings saved" });
    } catch {
      toast({ title: "Error", description: "Could not save outreach settings.", variant: "destructive" });
    }
  }

  async function handleConnectCrm() {
    if (!crmApiKey.trim()) return;
    try {
      await connectCrm.mutateAsync({ data: { api_key: crmApiKey.trim() } });
      setCrmApiKey("");
      await refetchCrm();
      await refetchMapping();
      toast({
        title: "Attio connected!",
        description: "Your leads will sync to Attio automatically when approved.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      toast({ title: "Connection failed", description: msg, variant: "destructive" });
    }
  }

  async function handleDisconnectCrm() {
    try {
      await disconnectCrm.mutateAsync();
      await refetchCrm();
      toast({ title: "Attio disconnected" });
    } catch {
      toast({ title: "Error", description: "Could not disconnect.", variant: "destructive" });
    }
  }

  async function handleSaveFieldMapping() {
    try {
      await updateFieldMapping.mutateAsync({ data: { mapping: fieldMapping } });
      toast({ title: "Field mapping saved" });
    } catch {
      toast({ title: "Error", description: "Could not save field mapping.", variant: "destructive" });
    }
  }

  function copyAttioUrl() {
    navigator.clipboard.writeText(ATTIO_API_KEY_URL);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  }

  // ── Shared style tokens ───────────────────────────────────────────────────

  const tabs: { id: TabId; label: string }[] = [
    { id: "profile",  label: "Profile" },
    { id: "icp",      label: "ICP" },
    { id: "outreach", label: "Outreach" },
    { id: "crm",      label: "CRM" },
  ];

  const chipBase    = "px-3 py-2 rounded-lg text-sm transition-colors border cursor-pointer";
  const chipActive  = "bg-[#EFF6FF] border-[#BFDBFE] text-[#2563EB]";
  const chipInactive= "border-[#E2E8F0] text-[#64748B] hover:text-[#0A0A0A] hover:border-[#CBD5E1] hover:bg-[#F5F7FA]";
  const inputClass  = "w-full px-3 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-sm text-[#0A0A0A] placeholder:text-[#64748B] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 transition-colors";
  const saveBtn     = "flex items-center gap-2 px-4 py-2.5 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-8 max-w-3xl mx-auto">
        <div className="mb-6 sm:mb-8 pt-2">
          <h1
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", letterSpacing: "0.04em" }}
            className="text-[#0A0A0A] mb-1"
          >
            Settings
          </h1>
          <p className="text-[#64748B] text-sm">Manage your profile, ICP, and outreach preferences</p>
        </div>

        {/* ── Tab bar ── */}
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

        {/* ── Profile tab ── */}
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

        {/* ── ICP tab ── */}
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
            </div>
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
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTargetSize((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}
                    className={`${chipBase} ${targetSize.includes(s) ? chipActive : chipInactive}`}
                  >
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

        {/* ── Outreach tab ── */}
        {activeTab === "outreach" && (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <h2 className="text-[#0A0A0A] font-semibold">Outreach settings</h2>
            <div className="space-y-3">
              {[
                { label: "Email outreach",    sub: "Enable email as an outreach channel",    val: emailEnabled,    set: setEmailEnabled },
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
              <input
                type="number"
                value={monthlyLeadTarget}
                onChange={(e) => setMonthlyLeadTarget(e.target.value)}
                placeholder="e.g. 50"
                className={inputClass}
              />
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

        {/* ── CRM tab ── */}
        {activeTab === "crm" && (
          <div className="space-y-4">

            {/* ── How sync works — info cards ── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { icon: <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />, title: "On approval",         desc: "Lead synced as Attio People contact" },
                { icon: <RefreshCw    className="w-4 h-4 text-[#2563EB]" />, title: "On reply/connection", desc: "Note pushed to Attio contact" },
                { icon: <Link2        className="w-4 h-4 text-[#7C3AED]" />, title: "Sync badge",          desc: "Shows synced, error, or pending" },
                { icon: <Clock        className="w-4 h-4 text-[#EA580C]" />, title: "Manual sync",         desc: "Force re-sync from any lead card" },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
                  <div className="mb-2">{icon}</div>
                  <p className="text-xs font-semibold text-[#0A0A0A]">{title}</p>
                  <p className="text-[11px] text-[#64748B] mt-0.5 leading-tight">{desc}</p>
                </div>
              ))}
            </div>

            {/* ── Connection card ── */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
              <div className="flex items-start gap-4 mb-5">
                <div className="w-10 h-10 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none">
                    <rect width="32" height="32" rx="8" fill="#1A1A2E"/>
                    <circle cx="10" cy="16" r="3" fill="#7C3AED"/>
                    <circle cx="22" cy="10" r="3" fill="#7C3AED"/>
                    <circle cx="22" cy="22" r="3" fill="#7C3AED"/>
                    <line x1="13" y1="14.5" x2="19" y2="11.5" stroke="#7C3AED" strokeWidth="1.5"/>
                    <line x1="13" y1="17.5" x2="19" y2="20.5" stroke="#7C3AED" strokeWidth="1.5"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[#0A0A0A] font-semibold">Attio CRM</h2>
                    {isConnected && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 font-medium">
                        <CheckCircle className="w-3 h-3" /> Connected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Sync approved leads as contacts in Attio. Activities auto-update when leads reply or connect.
                  </p>
                </div>
              </div>

              {isConnected ? (
                /* ── Already connected state ── */
                <div className="space-y-4">
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
                    <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-green-800">Attio is connected</p>
                      {crmConnection?.workspace_id && (
                        <p className="text-xs text-green-700 truncate">Workspace: {crmConnection.workspace_id}</p>
                      )}
                      <p className="text-xs text-green-600 mt-0.5">
                        Connected{" "}
                        {crmConnection?.connected_at
                          ? new Date(crmConnection.connected_at).toLocaleDateString()
                          : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleDisconnectCrm}
                    disabled={disconnectCrm.isPending}
                    className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {disconnectCrm.isPending
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Link2Off className="w-4 h-4" />}
                    Disconnect Attio
                  </button>
                </div>
              ) : (
                /* ── Not connected — show full setup guide ── */
                <div className="space-y-5">

                  {/* Step-by-step guide */}
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Key className="w-4 h-4 text-[#64748B]" />
                      <h4 className="text-sm font-semibold text-[#0A0A0A]">How to get your Attio API key</h4>
                    </div>
                    <ol className="space-y-3">
                      {[
                        {
                          step: "1",
                          text: (
                            <>
                              In Attio, click the dropdown beside your workspace name →{" "}
                              <strong className="font-semibold text-[#0A0A0A]">Workspace Settings → Developers</strong>.
                            </>
                          ),
                        },
                        {
                          step: "2",
                          text: (
                            <>
                              Click <strong className="font-semibold text-[#0A0A0A]">+ New access token</strong>, name it{" "}
                              <span className="font-mono text-xs bg-white border border-[#E2E8F0] px-1.5 py-0.5 rounded">
                                HubCredo
                              </span>
                              , and set scopes to <em>read/write People &amp; Notes</em>.
                            </>
                          ),
                        },
                        { step: "3", text: "Copy the token immediately — it's only shown once." },
                        { step: "4", text: "Paste it in the field below and click Connect Attio." },
                      ].map(({ step, text }) => (
                        <li key={step} className="flex gap-3">
                          <span className="w-6 h-6 rounded-full bg-[#2563EB] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {step}
                          </span>
                          <p className="text-sm text-[#475569] leading-relaxed">{text}</p>
                        </li>
                      ))}
                    </ol>

                    {/* Direct URL row */}
                    <div className="mt-4 pt-4 border-t border-[#E2E8F0]">
                      <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-widest mb-2">
                        Direct link to your token page
                      </p>
                      <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-xl px-3 py-2.5">
                        <span className="flex-1 text-xs font-mono text-[#475569] truncate select-all">
                          {ATTIO_API_KEY_URL}
                        </span>
                        <button
                          onClick={copyAttioUrl}
                          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#EFF6FF] transition-colors"
                          title="Copy URL"
                        >
                          {urlCopied
                            ? <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                            : <Copy className="w-3.5 h-3.5 text-[#64748B]" />}
                        </button>
                        <a
                          href={ATTIO_API_KEY_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#EFF6FF] transition-colors"
                          title="Open in Attio"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-[#64748B]" />
                        </a>
                      </div>
                      <p className="text-[11px] text-[#94A3B8] mt-1.5">
                        You must be a workspace <strong>Admin</strong> to create API keys.
                      </p>
                    </div>
                  </div>

                  {/* API key input */}
                  <div>
                    <label className="block text-sm font-medium text-[#0A0A0A] mb-1.5">Attio API key</label>
                    <input
                      type="password"
                      value={crmApiKey}
                      onChange={(e) => setCrmApiKey(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleConnectCrm(); }}
                      placeholder="Paste your Attio access token…"
                      className={`${inputClass} font-mono`}
                      autoComplete="off"
                    />
                  </div>

                  <button
                    onClick={handleConnectCrm}
                    disabled={connectCrm.isPending || !crmApiKey.trim()}
                    className={saveBtn}
                  >
                    {connectCrm.isPending
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Link2 className="w-4 h-4" />}
                    {connectCrm.isPending ? "Verifying…" : "Connect Attio"}
                  </button>

                  {/* Security notice */}
                  <div className="flex items-start gap-3 px-4 py-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl">
                    <ShieldCheck className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                    <p className="text-xs text-[#92400E] leading-relaxed">
                      <strong>Keep your API key safe.</strong> Treat it like a password. If compromised, delete it on the{" "}
                      <a href={ATTIO_API_KEY_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-[#78350F]">
                        Developers page
                      </a>{" "}
                      and generate a new one. Attio support will never ask for your token.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ── Field mapper (connected only) ── */}
            {isConnected && (
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                <div className="mb-4">
                  <h2 className="text-[#0A0A0A] font-semibold">Field mapping</h2>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Choose which HubCredo lead fields to sync into Attio People records.
                  </p>
                </div>
                <div className="space-y-2 mb-5">
                  {CRM_FIELDS.map(({ key, label, description }) => (
                    <div
                      key={key}
                      className="flex items-center justify-between p-3 bg-[#F5F7FA] border border-[#E2E8F0] rounded-lg hover:bg-white hover:border-[#2563EB]/30 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-[#0A0A0A]">{label}</p>
                        <p className="text-xs text-[#64748B]">{description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFieldMapping((m) => ({ ...m, [key]: !m[key] }))}
                        className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${fieldMapping[key] ? "bg-[#2563EB]" : "bg-[#CBD5E1]"}`}
                      >
                        <span className={`block w-4 h-4 bg-white rounded-full absolute top-1 shadow-sm transition-transform ${fieldMapping[key] ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-start gap-2 mb-4">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    Email is used to match contacts in Attio. Disabling it means new records will be created every sync instead of updating existing ones.
                  </span>
                </div>
                <button onClick={handleSaveFieldMapping} disabled={updateFieldMapping.isPending} className={saveBtn}>
                  {updateFieldMapping.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <RefreshCw className="w-4 h-4" />}
                  Save field mapping
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}