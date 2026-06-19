import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TagInput } from "@/components/ui/TagInput";
import {
  useGetMe, useUpdateProfile, useListIcps, useCreateIcp,
  useGetOutreachSettings, useUpdateOutreachSettings,
  useGetCrmConnection, useConnectCrm, useDisconnectCrm,
  useGetCrmFieldMapping, useUpdateCrmFieldMapping,
} from "@workspace/api-client-react";
import {
  Loader2, Save, CheckCircle, Link2, Link2Off, RefreshCw, AlertCircle,
  ExternalLink, Copy, Check, ShieldCheck, Key, CheckCircle2, Clock, Plug,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import type { Icp, OutreachSettings } from "@workspace/api-client-react";

const INDUSTRIES = ["SaaS","FinTech","HealthTech","EdTech","E-commerce","Marketplace","Developer Tools","AI/ML","Cybersecurity","PropTech"];
const COMPANY_SIZES = ["1-10","11-50","51-200","201-500","501-1000","1000+"];
const ATTIO_API_KEY_URL = "https://app.attio.com/hubcredoworkspace/settings/developers/access-tokens";

type TabId = "profile" | "icp" | "outreach" | "crm" | "integrations";

const CRM_FIELDS = [
  { key: "first_name",   label: "First Name",   description: "Maps to Attio name.first_name" },
  { key: "last_name",    label: "Last Name",     description: "Maps to Attio name.last_name" },
  { key: "email",        label: "Email",         description: "Maps to Attio email_addresses" },
  { key: "job_title",    label: "Job Title",     description: "Maps to Attio job_title" },
  { key: "company_name", label: "Company Name",  description: "Maps to Attio company_name" },
  { key: "linkedin_url", label: "LinkedIn URL",  description: "Maps to Attio linkedin" },
];

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

export default function Settings() {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as TabId | null;
    return tab && ["profile","icp","outreach","crm","integrations"].includes(tab) ? tab : "profile";
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

  // CRM
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

  // ── Reply.io integration state ─────────────────────────────
  const [replyApiKey, setReplyApiKey] = useState("");
  const [replyConnected, setReplyConnected] = useState(false);
  const [replyUser, setReplyUser] = useState<{ email: string; name: string } | null>(null);
  const [replyChecking, setReplyChecking] = useState(false);
  const [replySaving, setReplySaving] = useState(false);
  const [replyDisconnecting, setReplyDisconnecting] = useState(false);
  const [replyKeyVisible, setReplyKeyVisible] = useState(false);

  async function checkReplyConnection() {
    setReplyChecking(true);
    try {
      const res = await fetch("/api/replyio/validate", { headers: authHeaders() });
      const data = await res.json();
      setReplyConnected(data.valid);
      setReplyUser(data.user ?? null);
    } catch {
      setReplyConnected(false);
    } finally {
      setReplyChecking(false);
    }
  }

  useEffect(() => {
    if (activeTab === "integrations") checkReplyConnection();
  }, [activeTab]);

  async function handleConnectReply() {
    if (!replyApiKey.trim()) return;
    setReplySaving(true);
    try {
      // Save key to backend settings
      const res = await fetch("/api/settings/integrations/replyio", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ api_key: replyApiKey.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
      setReplyApiKey("");
      await checkReplyConnection();
      toast({ title: "Reply.io connected!", description: "Email and LinkedIn outreach can now use Reply.io sequences." });
    } catch (err: unknown) {
      // Fallback: key may need to just be in .env — show guidance
      toast({
        title: "Add key to .env instead",
        description: "Set REPLY_IO_API_KEY in artifacts/api-server/.env and restart the server.",
        variant: "destructive",
      });
    } finally {
      setReplySaving(false);
    }
  }

  async function handleDisconnectReply() {
    setReplyDisconnecting(true);
    try {
      await fetch("/api/settings/integrations/replyio", { method: "DELETE", headers: authHeaders() });
      setReplyConnected(false);
      setReplyUser(null);
      toast({ title: "Reply.io disconnected" });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setReplyDisconnecting(false);
    }
  }

  // ── existing effects ───────────────────────────────────────

  useEffect(() => {
    if (crmFieldMapping?.mapping) setFieldMapping(crmFieldMapping.mapping as Record<string, boolean>);
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
      if (outreachSettings.monthly_lead_target != null) setMonthlyLeadTarget(String(outreachSettings.monthly_lead_target));
      if (outreachSettings.messaging_framework)        setMessagingFramework(outreachSettings.messaging_framework);
      setEmailEnabled(outreachSettings.email_enabled ?? true);
      setLinkedinEnabled(outreachSettings.linkedin_enabled ?? true);
    }
  }, [outreachSettings]);

  // ── handlers (unchanged) ──────────────────────────────────

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

  async function handleSaveOutreach() {
    try {
      await updateOutreach.mutateAsync({ data: { email_enabled: emailEnabled, linkedin_enabled: linkedinEnabled, monthly_lead_target: monthlyLeadTarget ? Number(monthlyLeadTarget) : undefined, messaging_framework: messagingFramework || undefined } });
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
      toast({ title: "Attio connected!", description: "Your leads will sync to Attio automatically when approved." });
    } catch (err: unknown) {
      toast({ title: "Connection failed", description: err instanceof Error ? err.message : "Connection failed", variant: "destructive" });
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

  // ── Style tokens ──────────────────────────────────────────

  const tabs: { id: TabId; label: string }[] = [
    { id: "profile",      label: "Profile" },
    { id: "icp",          label: "ICP" },
    { id: "outreach",     label: "Outreach" },
    { id: "crm",          label: "CRM" },
    { id: "integrations", label: "Integrations" },
  ];

  const chipBase     = "px-3 py-2 rounded-lg text-sm transition-colors border cursor-pointer";
  const chipActive   = "bg-[rgba(107,78,255,.1)] border-[rgba(107,78,255,.4)] text-[#6B4EFF]";
  const chipInactive = "border-[rgba(107,78,255,.12)] text-[#6B7280] hover:text-[#1E1B4B] hover:border-[rgba(107,78,255,.25)] hover:bg-[#F5F3FF]";
  const inputClass   = "w-full px-3 py-2.5 bg-white border border-[rgba(107,78,255,.15)] rounded-lg text-sm text-[#1E1B4B] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#6B4EFF] focus:ring-2 focus:ring-[rgba(107,78,255,.15)] transition-colors";
  const saveBtn      = "flex items-center gap-2 px-4 py-2.5 bg-[#6B4EFF] text-white text-sm font-semibold rounded-lg hover:bg-[#5A3FE0] transition-colors disabled:opacity-50";

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-8 max-w-3xl mx-auto">
        <div className="mb-6 sm:mb-8 pt-2">
          <h1 style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: "2rem", letterSpacing: "0.04em" }} className="text-[#1E1B4B] mb-1">
            Settings
          </h1>
          <p className="text-[#6B7280] text-sm">Manage your profile, ICP, and outreach preferences</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 sm:mb-8 bg-[#F5F3FF] border border-[rgba(107,78,255,.12)] rounded-lg p-1 w-full overflow-x-auto">
          {tabs.map(({ id, label }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === id ? "bg-white text-[#6B4EFF] border border-[rgba(107,78,255,.2)] shadow-sm" : "text-[#6B7280] hover:text-[#1E1B4B]"
              }`}
            >
              {label}
              {id === "integrations" && replyConnected && (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 align-middle" />
              )}
            </button>
          ))}
        </div>

        {/* ── Profile tab ── */}
        {activeTab === "profile" && (
          <div className="bg-white border border-[rgba(107,78,255,.12)] rounded-xl p-6 space-y-5 shadow-sm">
            <h2 className="text-[#1E1B4B] font-semibold">Profile details</h2>
            <div>
              <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">Full name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">Email</label>
              <input value={profile?.email ?? ""} disabled className={`${inputClass} opacity-50 cursor-not-allowed`} />
              <p className="text-xs text-[#9CA3AF] mt-1.5">Email cannot be changed here.</p>
            </div>
            <button onClick={handleSaveProfile} disabled={updateProfile.isPending} className={saveBtn}>
              {updateProfile.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save changes
            </button>
          </div>
        )}

        {/* ── ICP tab ── */}
        {activeTab === "icp" && (
          <div className="bg-white border border-[rgba(107,78,255,.12)] rounded-xl p-6 space-y-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[#1E1B4B] font-semibold">Ideal Customer Profile</h2>
                {(icps as Icp[]).length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 mt-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Configured
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">Target job titles</label>
              <TagInput value={jobTitles} onChange={setJobTitles} placeholder="e.g. VP of Sales, Head of Growth" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">Buying signals</label>
              <TagInput value={buyingSignals} onChange={setBuyingSignals} placeholder="e.g. hiring SDRs, new funding, CRO hire" />
            </div>
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
                    className={`${chipBase} ${targetSize.includes(s) ? chipActive : chipInactive}`}
                  >{s}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">Geographies</label>
              <TagInput value={targetGeo} onChange={setTargetGeo} placeholder="e.g. US, UK, DACH" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">Excluded industries</label>
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
          <div className="bg-white border border-[rgba(107,78,255,.12)] rounded-xl p-6 space-y-6 shadow-sm">
            <h2 className="text-[#1E1B4B] font-semibold">Outreach settings</h2>
            <div className="space-y-3">
              {[
                { label: "Email outreach",    sub: "Enable email as an outreach channel",    val: emailEnabled,    set: setEmailEnabled },
                { label: "LinkedIn outreach", sub: "Enable LinkedIn as an outreach channel", val: linkedinEnabled, set: setLinkedinEnabled },
              ].map(({ label, sub, val, set }) => (
                <div key={label} className="flex items-center justify-between p-4 bg-[#F5F3FF] border border-[rgba(107,78,255,.12)] rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-[#1E1B4B]">{label}</p>
                    <p className="text-xs text-[#6B7280]">{sub}</p>
                  </div>
                  <button type="button" onClick={() => set((v) => !v)}
                    className={`w-11 h-6 rounded-full transition-colors relative ${val ? "bg-[#6B4EFF]" : "bg-[#E5E7EB]"}`}
                  >
                    <span className={`block w-4 h-4 bg-white rounded-full absolute top-1 shadow-sm transition-transform ${val ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
              ))}
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">Monthly lead target</label>
              <input type="number" value={monthlyLeadTarget} onChange={(e) => setMonthlyLeadTarget(e.target.value)} placeholder="e.g. 50" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">Messaging framework</label>
              <textarea value={messagingFramework} onChange={(e) => setMessagingFramework(e.target.value)}
                placeholder="Describe your outreach approach, key messages, or value props to lead with..."
                rows={4} className={`${inputClass} resize-none`} />
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />, title: "On approval", desc: "Lead synced as Attio People contact", bg: "rgba(16,185,129,.06)", border: "rgba(16,185,129,.2)" },
                { icon: <RefreshCw className="w-4 h-4 text-[#6B4EFF]" />, title: "On reply/connection", desc: "Note pushed to Attio contact", bg: "rgba(107,78,255,.06)", border: "rgba(107,78,255,.2)" },
                { icon: <Link2 className="w-4 h-4 text-purple-600" />, title: "Sync badge", desc: "Shows synced, error, or pending", bg: "rgba(168,85,247,.06)", border: "rgba(168,85,247,.2)" },
                { icon: <Clock className="w-4 h-4 text-orange-500" />, title: "Manual sync", desc: "Force re-sync from any lead card", bg: "rgba(249,115,22,.06)", border: "rgba(249,115,22,.2)" },
              ].map(({ icon, title, desc, bg, border }) => (
                <div key={title} className="p-3.5 rounded-xl" style={{ background: bg, border: `1px solid ${border}` }}>
                  <div className="mb-2">{icon}</div>
                  <p className="text-xs font-semibold text-[#1E1B4B]">{title}</p>
                  <p className="text-[11px] text-[#6B7280] mt-0.5 leading-tight">{desc}</p>
                </div>
              ))}
            </div>
            <div className="bg-white border border-[rgba(107,78,255,.12)] rounded-xl p-6 shadow-sm">
              <div className="flex items-start gap-4 mb-5">
                <div className="w-10 h-10 rounded-lg bg-[#F5F3FF] border border-[rgba(107,78,255,.2)] flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none">
                    <rect width="32" height="32" rx="8" fill="#1A1A2E"/>
                    <circle cx="10" cy="16" r="3" fill="#6B4EFF"/>
                    <circle cx="22" cy="10" r="3" fill="#6B4EFF"/>
                    <circle cx="22" cy="22" r="3" fill="#6B4EFF"/>
                    <line x1="13" y1="14.5" x2="19" y2="11.5" stroke="#6B4EFF" strokeWidth="1.5"/>
                    <line x1="13" y1="17.5" x2="19" y2="20.5" stroke="#6B4EFF" strokeWidth="1.5"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[#1E1B4B] font-semibold">Attio CRM</h2>
                    {isConnected && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                        <CheckCircle className="w-3 h-3" /> Connected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#6B7280] mt-0.5">Sync approved leads as contacts in Attio. Activities auto-update when leads reply or connect.</p>
                </div>
              </div>
              {isConnected ? (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-emerald-700">Attio is connected</p>
                      {crmConnection?.workspace_id && <p className="text-xs text-emerald-600/80 truncate">Workspace: {crmConnection.workspace_id}</p>}
                      <p className="text-xs text-emerald-600/80 mt-0.5">Connected {crmConnection?.connected_at ? new Date(crmConnection.connected_at).toLocaleDateString() : ""}</p>
                    </div>
                  </div>
                  <button onClick={handleDisconnectCrm} disabled={disconnectCrm.isPending}
                    className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50">
                    {disconnectCrm.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2Off className="w-4 h-4" />}
                    Disconnect Attio
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="bg-[#F5F3FF] border border-[rgba(107,78,255,.12)] rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Key className="w-4 h-4 text-[#6B7280]" />
                      <h4 className="text-sm font-semibold text-[#1E1B4B]">How to get your Attio API key</h4>
                    </div>
                    <ol className="space-y-3">
                      {[
                        { step: "1", text: <>In Attio, click the dropdown beside your workspace name → <strong className="font-semibold text-[#1E1B4B]">Workspace Settings → Developers</strong>.</> },
                        { step: "2", text: <>Click <strong className="font-semibold text-[#1E1B4B]">+ New access token</strong>, name it <span className="font-mono text-xs bg-white border border-[rgba(107,78,255,.15)] px-1.5 py-0.5 rounded text-[#1E1B4B]">HubCredo</span>, and set scopes to <em className="text-[#6B7280]">read/write People &amp; Notes</em>.</> },
                        { step: "3", text: <span className="text-[#6B7280]">Copy the token immediately — it's only shown once.</span> },
                        { step: "4", text: <span className="text-[#6B7280]">Paste it in the field below and click Connect Attio.</span> },
                      ].map(({ step, text }) => (
                        <li key={step} className="flex gap-3">
                          <span className="w-6 h-6 rounded-full bg-[#6B4EFF] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{step}</span>
                          <p className="text-sm text-[#6B7280] leading-relaxed">{text}</p>
                        </li>
                      ))}
                    </ol>
                    <div className="mt-4 pt-4 border-t border-[rgba(107,78,255,.12)]">
                      <p className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-widest mb-2">Direct link to your token page</p>
                      <div className="flex items-center gap-2 bg-white border border-[rgba(107,78,255,.12)] rounded-xl px-3 py-2.5">
                        <span className="flex-1 text-xs font-mono text-[#6B7280] truncate select-all">{ATTIO_API_KEY_URL}</span>
                        <button onClick={copyAttioUrl} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg border border-[rgba(107,78,255,.12)] bg-[#F5F3FF] hover:bg-[#EEF2FF] transition-colors" title="Copy URL">
                          {urlCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-[#6B7280]" />}
                        </button>
                        <a href={ATTIO_API_KEY_URL} target="_blank" rel="noopener noreferrer" className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg border border-[rgba(107,78,255,.12)] bg-[#F5F3FF] hover:bg-[#EEF2FF] transition-colors" title="Open in Attio">
                          <ExternalLink className="w-3.5 h-3.5 text-[#6B7280]" />
                        </a>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">Attio API key</label>
                    <input type="password" value={crmApiKey} onChange={(e) => setCrmApiKey(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleConnectCrm(); }}
                      placeholder="Paste your Attio access token…" className={`${inputClass} font-mono`} autoComplete="off" />
                  </div>
                  <button onClick={handleConnectCrm} disabled={connectCrm.isPending || !crmApiKey.trim()} className={saveBtn}>
                    {connectCrm.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    {connectCrm.isPending ? "Verifying…" : "Connect Attio"}
                  </button>
                  <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 leading-relaxed">
                      <strong className="text-amber-700">Keep your API key safe.</strong> Treat it like a password. If compromised, delete it on the{" "}
                      <a href={ATTIO_API_KEY_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-700">Developers page</a>{" "}
                      and generate a new one.
                    </p>
                  </div>
                </div>
              )}
            </div>
            {isConnected && (
              <div className="bg-white border border-[rgba(107,78,255,.12)] rounded-xl p-6 shadow-sm">
                <div className="mb-4">
                  <h2 className="text-[#1E1B4B] font-semibold">Field mapping</h2>
                  <p className="text-xs text-[#6B7280] mt-0.5">Choose which HubCredo lead fields to sync into Attio People records.</p>
                </div>
                <div className="space-y-2 mb-5">
                  {CRM_FIELDS.map(({ key, label, description }) => (
                    <div key={key} className="flex items-center justify-between p-3 bg-[#F5F3FF] border border-[rgba(107,78,255,.12)] rounded-lg hover:border-[rgba(107,78,255,.3)] transition-colors">
                      <div>
                        <p className="text-sm font-medium text-[#1E1B4B]">{label}</p>
                        <p className="text-xs text-[#6B7280]">{description}</p>
                      </div>
                      <button type="button" onClick={() => setFieldMapping((m) => ({ ...m, [key]: !m[key] }))}
                        className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${fieldMapping[key] ? "bg-[#6B4EFF]" : "bg-[#E5E7EB]"}`}>
                        <span className={`block w-4 h-4 bg-white rounded-full absolute top-1 shadow-sm transition-transform ${fieldMapping[key] ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2 mb-4">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                  <span>Email is used to match contacts in Attio. Disabling it means new records will be created every sync instead of updating existing ones.</span>
                </div>
                <button onClick={handleSaveFieldMapping} disabled={updateFieldMapping.isPending} className={saveBtn}>
                  {updateFieldMapping.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Save field mapping
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Integrations tab ── */}
        {activeTab === "integrations" && (
          <div className="space-y-4">

            {/* Reply.io card */}
            <div className="bg-white border border-[rgba(107,78,255,.12)] rounded-xl p-6 shadow-sm">
              <div className="flex items-start gap-4 mb-5">
                <div className="w-10 h-10 rounded-lg bg-[#F5F3FF] border border-[rgba(107,78,255,.2)] flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none">
                    <rect width="32" height="32" rx="8" fill="#1a1a2e"/>
                    <path d="M8 10h10a4 4 0 010 8H12v4" stroke="#6B4EFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="22" cy="22" r="2.5" fill="#6B4EFF"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[#1E1B4B] font-semibold">Reply.io</h2>
                    {replyChecking ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6B7280]" />
                    ) : replyConnected ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                        <CheckCircle className="w-3 h-3" /> Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200 font-medium">
                        Not connected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    Use Reply.io sequences for email and LinkedIn outreach. Toggle between native and Reply.io mode on the LinkedIn and Campaigns pages.
                  </p>
                </div>
              </div>

              {replyConnected ? (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-emerald-700">Reply.io is connected</p>
                      {replyUser && <p className="text-xs text-emerald-600/80">{replyUser.email}</p>}
                    </div>
                    <button onClick={checkReplyConnection} className="ml-auto text-emerald-600 hover:text-emerald-800">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* What this enables */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { icon: "✉️", title: "Email outreach", desc: "Use Reply.io sequences on the Campaigns page" },
                      { icon: "💼", title: "LinkedIn outreach", desc: "Use Reply.io sequences on the LinkedIn page" },
                    ].map(({ icon, title, desc }) => (
                      <div key={title} className="p-3 bg-[#F5F3FF] border border-[rgba(107,78,255,.12)] rounded-lg">
                        <p className="text-sm">{icon}</p>
                        <p className="text-xs font-semibold text-[#1E1B4B] mt-1">{title}</p>
                        <p className="text-xs text-[#6B7280] mt-0.5">{desc}</p>
                      </div>
                    ))}
                  </div>

                  <button onClick={handleDisconnectReply} disabled={replyDisconnecting}
                    className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50">
                    {replyDisconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2Off className="w-4 h-4" />}
                    Disconnect Reply.io
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Setup guide */}
                  <div className="bg-[#F5F3FF] border border-[rgba(107,78,255,.12)] rounded-xl p-4 space-y-2">
                    <p className="text-sm font-semibold text-[#1E1B4B] flex items-center gap-2"><Key className="w-4 h-4" /> How to get your Reply.io API key</p>
                    {[
                      "Log in to Reply.io → click your avatar → Settings.",
                      "Go to API → copy your API key.",
                      "Add it to artifacts/api-server/.env as REPLY_IO_API_KEY=your_key and restart the server.",
                    ].map((step, i) => (
                      <div key={i} className="flex gap-3">
                        <span className="w-5 h-5 rounded-full bg-[#6B4EFF] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        <p className="text-sm text-[#6B7280]">{step}</p>
                      </div>
                    ))}
                    <div className="mt-3 pt-3 border-t border-[rgba(107,78,255,.12)]">
                      <p className="text-xs font-mono bg-white border border-[rgba(107,78,255,.12)] rounded-lg px-3 py-2 text-[#6B7280]">
                        REPLY_IO_API_KEY=a1BhMEpns3fSHSdBG3ZefOK9
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">Reply.io API key</label>
                    <div className="relative">
                      <input
                        type={replyKeyVisible ? "text" : "password"}
                        value={replyApiKey}
                        onChange={(e) => setReplyApiKey(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleConnectReply(); }}
                        placeholder="Paste your Reply.io API key…"
                        className={`${inputClass} font-mono pr-10`}
                        autoComplete="off"
                      />
                      <button type="button" onClick={() => setReplyKeyVisible((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B4EFF]">
                        {replyKeyVisible ? <Check className="w-4 h-4" /> : <Key className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button onClick={handleConnectReply} disabled={replySaving || !replyApiKey.trim()} className={saveBtn}>
                    {replySaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
                    {replySaving ? "Connecting…" : "Connect Reply.io"}
                  </button>

                  <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">
                      <strong className="text-amber-700">Easiest method:</strong> Add <code className="font-mono bg-amber-100 px-1 rounded">REPLY_IO_API_KEY</code> directly to your <code className="font-mono bg-amber-100 px-1 rounded">.env</code> file and restart the api-server. The page will show Connected automatically.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
