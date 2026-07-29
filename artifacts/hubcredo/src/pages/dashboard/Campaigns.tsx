import { useState, useEffect, useCallback, useRef } from "react";
import { useSearch } from "wouter";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Mail, Plus, Loader2, Send, Play, Pause, CheckCircle2, AlertCircle,
  Sparkles, X, Edit3, Globe, ArrowRight, Trash2, RefreshCw, TrendingUp,
  Eye, MessageSquare, MousePointerClick, Users, ChevronLeft, ChevronRight, ChevronDown,
  BookmarkPlus, BookOpen, Pencil, Save,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { useListLeadLists, useListIcps } from "@workspace/api-client-react";
import type { LeadList } from "@workspace/api-client-react";

async function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(opts?.headers ?? {}),
    },
  });
}

interface CampaignAnalytics {
  sent_count: number;
  opened_count: number;
  replied_count: number;
  bounced_count: number;
  clicked_count?: number;
}

type StepType = "email";

interface CampaignSequence {
  id?: string;
  step_number: number;
  subject: string;
  body: string;
  delay_days: number;
  type?: StepType;
}

interface Campaign {
  id: string;
  name: string;
  sending_domain: string;
  lead_list_id?: string | null;
  status: "draft" | "active" | "paused" | "completed" | "error";
  external_campaign_id?: string | null;
  created_at: string;
  campaign_analytics?: CampaignAnalytics | CampaignAnalytics[];
  campaign_sequences?: CampaignSequence[];
}

interface DomainWarmup {
  id: string;
  domain: string;
  status: "warming" | "ready" | "paused" | "failed";
  score: number;
  provider: string;
}

interface InstantlyLead {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  status?: number;
  email_open_count?: number;
  timestamp_created?: string;
}

// ── Reply.io variable mapping ─────────────────────────────────
const REPLY_STANDARD_FIELDS = [
  { value: "firstName",     label: "First Name" },
  { value: "lastName",      label: "Last Name" },
  { value: "fullName",      label: "Full Name" },
  { value: "email",         label: "Email" },
  { value: "companyName",   label: "Company Name" },
  { value: "title",         label: "Job Title" },
  { value: "industry",      label: "Industry" },
  { value: "hqCountry",     label: "Country" },
  { value: "hqCity",        label: "City" },
  { value: "department",    label: "Department" },
  { value: "seniority",     label: "Seniority" },
  { value: "companySize",   label: "Company Size" },
  { value: "companyDomain", label: "Company Domain" },
  { value: "researchBlurb", label: "Research Blurb" },
  { value: "linkedInUrl",   label: "LinkedIn URL" },
];

/** Mirrors the backend's toCamelCaseVar(): strip everything from the first ":"
 *  onward (that's AI-fill instructions, not part of the key), then camelCase
 *  the remaining words. Without this, a var like
 *  "{{whatDroveTheValue: community, recurring revenue...}}" never resolves to
 *  the "whatDroveTheValue" custom field key the backend actually generated. */
function toCamelCaseVar(raw: string): string {
  const base = raw.split(":")[0].trim();
  const hasSeparators = /[^a-zA-Z0-9]/.test(base);
  const isAllUpper = base === base.toUpperCase();
  const isAllLower = base === base.toLowerCase();

  if (!hasSeparators && !isAllUpper && !isAllLower) {
    return base.charAt(0).toLowerCase() + base.slice(1);
  }

  const words = base.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (words.length === 0) return "";
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}
/** Extract all unique {{var}} tokens from a set of email steps */
function extractTemplateVars(steps: { subject: string; body: string }[]): string[] {
  const vars = new Set<string>();
  for (const s of steps) {
    for (const text of [s.subject, s.body]) {
      const matches = text.matchAll(/\{\{([^}]+)\}\}/g);
      for (const m of matches) vars.add(m[1].trim());
    }
  }
  return [...vars].sort((a, b) => a.localeCompare(b));
}

// Common aliases seen in AI-generated templates that don't literally match a
// standard field name but clearly mean one. Extend this list as new patterns
// show up in your templates.
const FIELD_SYNONYMS: Record<string, string> = {
  sector: "industry",
  vertical: "industry",
  niche: "industry",
  space: "industry",
  role: "title",
  jobtitle: "title",
  position: "title",
  business: "companyName",
  company: "companyName",
  org: "companyName",
  organization: "companyName",
  location: "hqCity",
  region: "hqCountry",
};

/** True if a raw template var already resolves to a standard field via normalized match, or via a known synonym */
function varResolvesStandard(rawVar: string): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const nv = norm(toCamelCaseVar(rawVar));
  const direct = REPLY_STANDARD_FIELDS.find((f) => norm(f.value) === nv || norm(f.label) === nv)?.value;
  if (direct) return direct;
  return FIELD_SYNONYMS[nv] ?? null;
}

// ── Reply.io types (email only) ───────────────────────────────
interface ReplySeq {
  id: number;
  name: string;
  status: "active" | "paused" | "stopped";
  isArchived: boolean;
  channel?: "email" | "linkedin";
}

interface ReplyContact {
  email: string;
  firstName: string;
  lastName: string;
  status: { status: string; replied: boolean; opened: boolean; bounced: boolean };
}

interface ReplyStats {
  sequenceId: number;
  total: number;          // contacted
  active: number;         // always 0 from v3 reporting
  delivered: number;
  replied: number;
  opened: number;
  bounced: number;
  deliveredPercentage: number;
  openedPercentage: number;
  repliedPercentage: number;
  bouncedPercentage: number;
}

const LEAD_STATUS_MAP: Record<number, { label: string; color: string }> = {
  1:   { label: "Active",       color: "text-[#5B4FE8] bg-[#F5F3FF] border-[#E0D9FF]" },
  2:   { label: "Paused",       color: "text-amber-700 bg-amber-50 border-amber-200" },
  3:   { label: "Completed",    color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  [-1]:{ label: "Bounced",      color: "text-red-500 bg-red-50 border-red-200" },
  [-2]:{ label: "Unsubscribed", color: "text-orange-700 bg-orange-50 border-orange-200" },
  [-3]:{ label: "Skipped",      color: "text-[#6B7280] bg-[#F3F4F6] border-[#E5E7EB]" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft:     { label: "Draft",  color: "bg-[#F3F4F6] border-[#E5E7EB] text-[#6B7280]",          icon: <Edit3      className="w-3 h-3" /> },
  active:    { label: "Active", color: "bg-emerald-50 border-emerald-200 text-emerald-600",       icon: <Play       className="w-3 h-3" /> },
  paused:    { label: "Paused", color: "bg-amber-50 border-amber-200 text-amber-700",             icon: <Pause      className="w-3 h-3" /> },
  completed: { label: "Done",   color: "bg-[#F5F3FF] border-[#E0D9FF] text-[#5B4FE8]",           icon: <CheckCircle2 className="w-3 h-3" /> },
  error:     { label: "Error",  color: "bg-red-50 border-red-200 text-red-500",                  icon: <AlertCircle className="w-3 h-3" /> },
};

interface EmailTemplate {
  id: string;
  name: string;
  sequences: CampaignSequence[];
}

const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "smykm",
    name: "Template 1 — SMYKM (Curiosity Hook)",
    sequences: [{
      step_number: 1, delay_days: 0,
      subject: "Benji the Bengal's Favorite Pilot/Flying J",
      body: `Hi [First Name],\n\nWe haven't met yet, but I run the growth team at [Your Company]. I was doing some research and came across your profile — noticed you've built something pretty impressive at [Prospect Company].\n\nQuick trivia while I have you: what's the closest major logistics hub to your headquarters?\n\nThe real reason I'm reaching out — at [Your Company], we help businesses like yours increase per-transaction revenue by 20% or more without adding headcount.\n\nIf you're up for a 10-minute chat, I'd be thrilled to find a time that works.\n\nCheers,\n[Your Name]`,
    }],
  },
  {
    id: "pas",
    name: "Template 2 — PAS (Pain-Agitate-Solution)",
    sequences: [{
      step_number: 1, delay_days: 0,
      subject: "Are you still dealing with scattered data and missed follow-ups?",
      body: `Hi [First Name],\n\nI was doing some research on your company and came across your profile. I also noticed your team has been expanding rapidly this year — exciting stuff.\n\n[Your Company] gets you to a better place faster. We recently helped [Similar Company] cut their response time by 40% and close 2x more deals in the same pipeline.\n\nInterested in learning more?\n\nCheers,\n[Your Name]`,
    }],
  },
  {
    id: "value-first",
    name: "Template 3 — Value-First (Soft Opener)",
    sequences: [{
      step_number: 1, delay_days: 0,
      subject: "[Prospect Company] + [Your Company] — quick thought",
      body: `Hi [First Name],\n\nI came across [Prospect Company] while researching your space and noticed you've been pushing hard into new markets this quarter — really solid momentum.\n\nWe recently worked with [Similar Company] to help them go from inconsistent outreach to a repeatable system that brought in 3x more booked calls within 60 days.\n\nWould a quick 10-minute call this week make sense?\n\nBest,\n[Your Name]`,
    }],
  },
];

function WarmupProgress({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-400" : "bg-[#5B4FE8]";
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <div className="flex-1 bg-[#E5E7EB] rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-[#1a1a2e] shrink-0">{pct}%</span>
    </div>
  );
}

function StatCard({ icon, label, value, rate, color }: { icon: React.ReactNode; label: string; value: number; rate?: string; color: string }) {
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-xl p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${color}`}>{icon}</div>
      <p className="text-2xl font-bold text-[#1a1a2e]">{value.toLocaleString()}</p>
      <p className="text-xs text-[#6B7280] mt-0.5">{label}</p>
      {rate && <p className="text-xs font-semibold text-[#5B4FE8] mt-1">{rate}</p>}
    </div>
  );
}

function TemplateDropdown({ onSelect }: { onSelect: (t: EmailTemplate) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E5E7EB] text-[#6B7280] text-xs font-semibold rounded-lg hover:border-[#5B4FE8] hover:text-[#5B4FE8] transition-colors"
      >
        Use Template
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-20 w-72 bg-white border border-[#E5E7EB] rounded-xl shadow-lg overflow-hidden">
            <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-widest px-3 pt-2.5 pb-1.5">
              Choose a starting template — fully editable after
            </p>
            {EMAIL_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { onSelect(t); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 hover:bg-[#F5F3FF] transition-colors border-t border-[#F1F5F9] first:border-t-0"
              >
                <p className="text-xs font-semibold text-[#1a1a2e] leading-tight">{t.name}</p>
                <p className="text-[11px] text-[#6B7280] mt-0.5 truncate">{t.sequences[0]?.subject}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Campaigns() {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [warmupDomains, setWarmupDomains] = useState<DomainWarmup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Campaign | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [wizardName, setWizardName] = useState("");
  const [wizardDomain, setWizardDomain] = useState("");
  const [wizardListId, setWizardListId] = useState<string>("");
  const [sequences, setSequences] = useState<CampaignSequence[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [warmupInput, setWarmupInput] = useState("");
  const [warmupAdding, setWarmupAdding] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [leads, setLeads] = useState<InstantlyLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsCursor, setLeadsCursor] = useState<string | undefined>(undefined);
  const [leadsHasMore, setLeadsHasMore] = useState(false);
  const [leadsCursorStack, setLeadsCursorStack] = useState<string[]>([]);

  // ── Reply.io state (email only) ───────────────────────────
  const [replyMode, setReplyMode] = useState(false);
  const search = useSearch();
  const replyioDeepLinked = useRef(false);
  const [replyConnected, setReplyConnected] = useState(false);
  const [replySeqs, setReplySeqs] = useState<ReplySeq[]>([]);
  const [replySeqsLoading, setReplySeqsLoading] = useState(false);
  const [replySelectedId, setReplySelectedId] = useState<number | null>(null);
  const [replyContacts, setReplyContacts] = useState<ReplyContact[]>([]);
  const [replyStats, setReplyStats] = useState<ReplyStats | null>(null);
  const [replyDetailLoading, setReplyDetailLoading] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollSeqId, setEnrollSeqId] = useState<number | null>(null);
  const [enrollEmail, setEnrollEmail] = useState("");
  const [enrollFirst, setEnrollFirst] = useState("");
  const [enrollLast, setEnrollLast] = useState("");
  const [enrolling, setEnrolling] = useState(false);

  // ── Connected email accounts (mailboxes) ─────────────────
  const [emailAccounts, setEmailAccounts] = useState<Array<{ id: number; email: string; connectionStatus: string; alias?: string }>>([]);
  const [emailAccountsLoading, setEmailAccountsLoading] = useState(false);

  // ── Reply.io wizard state ──────────────────────────────────
  const [replyWizard, setReplyWizard] = useState(false);
  const [replyWizStep, setReplyWizStep] = useState<1 | 2 | 3 | 4>(1);
  const [replyWizCustomKeys, setReplyWizCustomKeys] = useState<string[]>([]);
  const [customKeysLoading, setCustomKeysLoading] = useState(false);
  const [replyWizName, setReplyWizName] = useState("");
  const [replyWizSteps, setReplyWizSteps] = useState<CampaignSequence[]>([]);
  const [replyWizListId, setReplyWizListId] = useState("");
  /** Maps raw template variable (e.g. "CLIENT") → lead field key (e.g. "companyName"), or "" to leave as custom */
  const [replyWizVarMap, setReplyWizVarMap] = useState<Record<string, string>>({});
  const [replyCreating, setReplyCreating] = useState(false);
  const [replyActivatingId, setReplyActivatingId] = useState<number | null>(null);
  const [replyPausingId, setReplyPausingId] = useState<number | null>(null);
  const [replyDeletingId, setReplyDeletingId] = useState<number | null>(null);
  const [replyDeleteConfirmId, setReplyDeleteConfirmId] = useState<number | null>(null);
  const [replyEnrollListId, setReplyEnrollListId] = useState("");
  const [replyEnrollingList, setReplyEnrollingList] = useState(false);

  // ── Generate Preview state ─────────────────────────────────
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewStepIdx, setPreviewStepIdx] = useState(0);
  const [previewLead, setPreviewLead] = useState<Record<string, string> | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // ── Launch modal (email selector) ─────────────────────────
  const [launchModalOpen, setLaunchModalOpen] = useState(false);
  const [launchSeqId, setLaunchSeqId] = useState<number | null>(null);
  const [launchEmailAccounts, setLaunchEmailAccounts] = useState<Array<{ id: number; email: string; connectionStatus: string; alias?: string }>>([]);
  const [launchEmailAccountsLoading, setLaunchEmailAccountsLoading] = useState(false);
  const [launchSelectedEmailId, setLaunchSelectedEmailId] = useState<number | null>(null);
  const [launchConfirming, setLaunchConfirming] = useState(false);
  const [launchEmailsPerDay, setLaunchEmailsPerDay] = useState<number>(200);

  // ── Saved templates ────────────────────────────────────────
  interface SavedTemplate { id: string; name: string; steps: CampaignSequence[]; created_at: string; }
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<SavedTemplate | null>(null);
  const [editTemplateName, setEditTemplateName] = useState("");
  const [launchListId, setLaunchListId] = useState<string>("");

  const { data: leadLists = [] } = useListLeadLists();
  const { data: icps = [] } = useListIcps();
  const lists = leadLists as LeadList[];

  // Check Reply.io connection on mount
  useEffect(() => {
    apiFetch("/api/replyio/validate")
      .then((r) => r.json())
      .then((d) => setReplyConnected(d.valid))
      .catch(() => setReplyConnected(false));
  }, []);

  // Activate Reply.io mode when deep-linked with ?replyio=1
  useEffect(() => {
    if (new URLSearchParams(search).get("replyio") === "1" && !replyioDeepLinked.current) {
      replyioDeepLinked.current = true;
      setReplyMode(true);
    }
  }, [search]);

  // Auto-load Reply.io data once connected and mode is active
  useEffect(() => {
    if (replyMode && replyConnected) {
      if (replySeqs.length === 0) loadReplySeqs();
      if (emailAccounts.length === 0) loadEmailAccounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyMode, replyConnected]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, wRes] = await Promise.all([apiFetch("/api/campaigns"), apiFetch("/api/domain-warmup")]);
      if (cRes.ok) setCampaigns(await cRes.json());
      if (wRes.ok) setWarmupDomains(await wRes.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Reply.io functions (email only) ───────────────────────
  async function loadReplySeqs() {
    setReplySeqsLoading(true);
    try {
      const res = await apiFetch("/api/replyio/sequences");
      const data = await res.json();
      setReplySeqs(
        (data.sequences || []).filter(
          (s: ReplySeq) => !s.isArchived && s.channel !== "linkedin"
        )
      );
    } catch {
      toast({ title: "Failed to load Reply.io sequences", variant: "destructive" });
    } finally {
      setReplySeqsLoading(false);
    }
  }
  async function loadEmailAccounts() {
    setEmailAccountsLoading(true);
    try {
      const res = await apiFetch("/api/replyio/email-accounts");
      const data = await res.json();
      setEmailAccounts(data.accounts ?? []);
    } catch { /* ignore */ }
    finally { setEmailAccountsLoading(false); }
  }

  async function loadReplyDetail(id: number) {
    setReplySelectedId(id);
    setReplyDetailLoading(true);

    try {
      const [cRes, sRes] = await Promise.all([
        apiFetch(`/api/replyio/sequences/${id}/contacts`),
        apiFetch(`/api/replyio/sequences/${id}/stats`),
      ]);
      if (cRes.ok) setReplyContacts((await cRes.json()).contacts ?? []);
      if (sRes.ok) setReplyStats(await sRes.json());
    } finally {
      setReplyDetailLoading(false);
    }
  }

  async function handleEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!enrollSeqId || !enrollEmail.trim()) return;
    setEnrolling(true);
    try {
      const res = await apiFetch("/api/replyio/enroll", {
        method: "POST",
        body: JSON.stringify({
          contact: { email: enrollEmail.trim(), firstName: enrollFirst || undefined, lastName: enrollLast || undefined },
          sequenceId: enrollSeqId,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Contact enrolled!", description: `${enrollEmail} added to Reply.io sequence.` });
      setEnrollOpen(false);
      setEnrollEmail(""); setEnrollFirst(""); setEnrollLast("");
      if (replySelectedId === enrollSeqId) loadReplyDetail(enrollSeqId);
    } catch (err: unknown) {
      toast({ title: "Enroll failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setEnrolling(false);
    }
  }

  function handleToggleReplyMode(on: boolean) {
    setReplyMode(on);
    if (on) {
      if (replySeqs.length === 0) loadReplySeqs();
      if (emailAccounts.length === 0) loadEmailAccounts();
    }
  }

  function resetReplyWizard() { setReplyWizStep(1); setReplyWizName(""); setReplyWizSteps([]); setReplyWizListId(""); setReplyWizVarMap({}); setReplyWizCustomKeys([]); setCustomKeysLoading(false); }

  /** Fetch custom field keys from the first lead of a list, for use in the variable mapper.
   *  Returns when the fetch is settled — callers can await to gate navigation. */
  async function loadCustomFieldKeys(listId: string) {
    if (!listId) { setReplyWizCustomKeys([]); return; }
    setCustomKeysLoading(true);
    try {
      const res = await apiFetch(`/api/leads?lead_list_id=${listId}&limit=1`);
      if (!res.ok) {
        toast({ title: "Could not load custom field keys", description: `Server returned ${res.status}`, variant: "destructive" });
        setReplyWizCustomKeys([]);
        return;
      }
      const data = await res.json();
      const leadsArr = Array.isArray(data) ? data : data.leads ?? data.items ?? data;
      const lead = leadsArr?.[0];
      if (lead?.custom_fields && typeof lead.custom_fields === "object") {
        setReplyWizCustomKeys(Object.keys(lead.custom_fields as Record<string, string>));
      } else {
        setReplyWizCustomKeys([]);
      }
    } catch {
      toast({ title: "Could not load custom field keys", description: "Network error — mapping will still work for standard fields.", variant: "destructive" });
      setReplyWizCustomKeys([]);
    } finally {
      setCustomKeysLoading(false);
    }
  }

  function addReplyWizStep() {
    setReplyWizSteps((p) => [...p, { step_number: p.length + 1, subject: "", body: "", delay_days: p.length === 0 ? 0 : 3, type: "email" }]);
  }

  function applyReplyTemplate(t: EmailTemplate) {
    setReplyWizSteps(t.sequences.map((s, i) => ({ ...s, step_number: i + 1, type: "email" as StepType })));
    toast({ title: "Template applied" });
  }

  async function loadSavedTemplates() {
    if (templatesLoaded) return;
    try {
      const res = await apiFetch("/api/campaign-templates");
      if (res.ok) {
        const data = await res.json();
        setSavedTemplates(data ?? []);
      }
    } catch { /* ignore */ }
    setTemplatesLoaded(true);
  }

  async function handleSaveTemplate() {
    if (!saveTemplateName.trim()) { toast({ title: "Template name required", variant: "destructive" }); return; }
    if (replyWizSteps.length === 0) { toast({ title: "Add at least one step first", variant: "destructive" }); return; }
    setSavingTemplate(true);
    try {
      const res = await apiFetch("/api/campaign-templates", {
        method: "POST",
        body: JSON.stringify({ name: saveTemplateName.trim(), steps: replyWizSteps }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSavedTemplates((prev) => [data, ...prev]);
      setSaveTemplateOpen(false);
      setSaveTemplateName("");
      toast({ title: "Template saved!", description: `"${data.name}" is ready to reuse.` });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not save template", variant: "destructive" });
    } finally { setSavingTemplate(false); }
  }

  async function handleDeleteTemplate(id: string) {
    setDeletingTemplateId(id);
    try {
      const res = await apiFetch(`/api/campaign-templates/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setSavedTemplates((prev) => prev.filter((t) => t.id !== id));
      toast({ title: "Template deleted" });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not delete", variant: "destructive" });
    } finally { setDeletingTemplateId(null); }
  }

  async function handleRenameTemplate() {
    if (!editingTemplate || !editTemplateName.trim()) return;
    try {
      const res = await apiFetch(`/api/campaign-templates/${editingTemplate.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editTemplateName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSavedTemplates((prev) => prev.map((t) => t.id === editingTemplate.id ? { ...t, name: data.name } : t));
      setEditingTemplate(null);
      toast({ title: "Template renamed" });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not rename", variant: "destructive" });
    }
  }

  function applySavedTemplate(tpl: { name: string; steps: CampaignSequence[] }) {
    setReplyWizSteps(tpl.steps.map((s, i) => ({ ...s, step_number: i + 1, type: "email" as StepType })));
    toast({ title: "Template applied", description: `"${tpl.name}" loaded into sequence.` });
  }

  async function handleGeneratePreview(listId?: string) {
    const lid = listId || replyWizListId;
    if (!lid) {
      toast({ title: "Select a lead list first", description: "Choose a lead list in Step 3 to preview with real lead data.", variant: "destructive" });
      return;
    }
    if (replyWizSteps.length === 0) {
      toast({ title: "No steps to preview", variant: "destructive" });
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await apiFetch(`/api/leads?lead_list_id=${lid}&limit=1`);
      const data = await res.json();
      const leadsArr = Array.isArray(data) ? data : data.leads ?? data.items ?? data;
      const lead = leadsArr[0] ?? null;
      if (!lead) {
        toast({ title: "No leads in list", description: "Upload or generate leads first.", variant: "destructive" });
        return;
      }
      // Spread custom fields so {{varName}} works in templates
      const customFields = (lead.custom_fields && typeof lead.custom_fields === "object")
        ? (lead.custom_fields as Record<string, string>)
        : {};
      const baseLead: Record<string, string> = {
        firstName: (lead.first_name || "Jane").split(" ")[0],
        lastName: lead.last_name || "Smith",
        fullName: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Jane Smith",
        email: lead.email || "jane@company.com",
        title: lead.job_title || "VP Sales",
        companyName: lead.company_name || "Acme Corp",
        linkedInUrl: lead.linkedin_url || "",
        industry: lead.industry || "",
        country: lead.hq_country || "",
        city: lead.hq_city || "",
        seniority: lead.seniority || "",
        department: lead.department || "",
        companySize: lead.company_size || "",
        hqCity: lead.hq_city || "",
        hqCountry: lead.hq_country || "",
        companyDomain: lead.company_domain || "",
        researchBlurb: lead.research_blurb || "",
        // Custom fields — all keys become available as {{key}} in templates
        ...customFields,
      };
      // Apply variable mappings from the wizard's Step 3 var map.
      // fieldKey is either a standard lead field ("companyName"), a "__csv__<key>" ref,
      // or "" meaning resolve automatically from custom_fields.
      for (const [templateVar, fieldKey] of Object.entries(replyWizVarMap)) {
        if (!fieldKey) continue;
        if (fieldKey.startsWith("__csv__")) {
          const csvKey = fieldKey.slice("__csv__".length);
          if (baseLead[csvKey] !== undefined) baseLead[templateVar] = baseLead[csvKey];
        } else if (baseLead[fieldKey] !== undefined) {
          baseLead[templateVar] = baseLead[fieldKey];
        }
      }
      setPreviewLead(baseLead);
      setPreviewStepIdx(0);
      setPreviewOpen(true);
    } catch {
      toast({ title: "Preview failed", variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  }

  function fillTemplate(text: string, lead: Record<string, string>): string {
    // Build a normalised lookup: strip every non-alphanumeric char and lowercase.
    // This makes {{FOUNDER NAMES}}, {{founderNames}}, and {{founder_names}} all resolve
    // to the same stored key regardless of how the template was written.
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const normMap = new Map<string, string>();
    for (const [k, v] of Object.entries(lead)) {
      const nk = norm(k);
      if (!normMap.has(nk)) normMap.set(nk, v ?? ""); // first key wins on collision
    }

    const resolve = (key: string): string | null => {
      if (lead[key] !== undefined) return lead[key] ?? "";
      const nk = norm(key);
      if (normMap.has(nk)) return normMap.get(nk)!;

      // Fall back to the backend-style canonical key: strip everything from
      // the first ":" onward (AI-fill instructions) and camelCase the rest.
      // This is what lets "{{whatDroveTheValue: community, recurring revenue...}}"
      // resolve against a stored "whatDroveTheValue" custom field.
      const canonical = toCamelCaseVar(key);
      if (canonical) {
        if (lead[canonical] !== undefined) return lead[canonical] ?? "";
        const nc = norm(canonical);
        if (normMap.has(nc)) return normMap.get(nc)!;
      }
      return null;
    };

    return text
      // [Bracket] style aliases
      .replace(/\[First Name\]/gi, lead.firstName || "")
      .replace(/\[Last Name\]/gi, lead.lastName || "")
      .replace(/\[Full Name\]/gi, lead.fullName || "")
      .replace(/\[Company\]/gi, lead.companyName || "")
      .replace(/\[Job Title\]/gi, lead.title || "")
      .replace(/\[Industry\]/gi, lead.industry || "")
      .replace(/\[Country\]/gi, lead.country || "")
      // {{key}} — key may contain spaces, dots, hyphens, colons (AI-fill instructions), or any printable char except }}
      .replace(/\{\{([^}]+)\}\}/g, (match, raw: string) => {
        const key = raw.trim();
        const val = resolve(key);
        return val !== null ? val : match; // leave unresolved vars as-is
      });
  }

  async function handleCreateReplySeq() {
    if (!replyWizName.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    setReplyCreating(true);
    try {
      const res = await apiFetch("/api/replyio/sequences", {
        method: "POST",
        body: JSON.stringify({
          name: replyWizName.trim(),
          steps: replyWizSteps.map((s) => ({ type: "email", delay_days: s.delay_days, subject: s.subject, body: s.body })),
        }),
      });
      const seq = await res.json();
      if (!res.ok) throw new Error(seq.error ?? "Failed to create campaign");
      const stepWarning = seq.stepErrors?.length ? ` (${seq.stepErrors.length} step(s) failed — check Reply.io)` : "";
      if (replyWizListId) {
        const eRes = await apiFetch(`/api/replyio/sequences/${seq.id}/enroll-list`, { method: "POST", body: JSON.stringify({ lead_list_id: replyWizListId, var_map: replyWizVarMap }) });
        const eData = await eRes.json();
        toast({ title: "Campaign created!" + stepWarning, description: eRes.ok ? `Enrolled ${eData.enrolled} of ${eData.total} leads.` : `Created — enroll failed: ${eData.error}` });
      } else {
        toast({ title: "Campaign created!" + stepWarning, description: `"${seq.name}" is ready in Reply.io.` });
      }
      setReplyWizard(false); resetReplyWizard(); loadReplySeqs();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not create campaign", variant: "destructive" });
    } finally { setReplyCreating(false); }
  }

  async function openLaunchModal(seqId: number) {
    setLaunchSeqId(seqId);
    setLaunchSelectedEmailId(null);
    setLaunchListId("");
    setLaunchEmailsPerDay(200);
    setLaunchModalOpen(true);
    setLaunchEmailAccountsLoading(true);
    try {
      const res = await apiFetch("/api/replyio/email-accounts");
      const data = await res.json();
      setLaunchEmailAccounts(data.accounts ?? []);
    } catch {
      toast({ title: "Could not load email accounts", variant: "destructive" });
    } finally {
      setLaunchEmailAccountsLoading(false);
    }
  }

  async function handleConfirmLaunch() {
    if (!launchSeqId) return;
    setLaunchConfirming(true);
    try {
      // Step 1: update emailsCountPerDay before activating
      const settingsRes = await apiFetch(`/api/replyio/sequences/${launchSeqId}/settings`, {
        method: "PATCH",
        body: JSON.stringify({ emailsCountPerDay: launchEmailsPerDay }),
      });
      if (!settingsRes.ok) {
        const d = await settingsRes.json();
        throw new Error(d.error ?? "Failed to update email limit");
      }

      // Step 2: activate (assign email account + enroll leads + start)
      const res = await apiFetch(`/api/replyio/sequences/${launchSeqId}/activate`, {
        method: "POST",
        body: JSON.stringify({
          emailAccountId: launchSelectedEmailId ?? undefined,
          lead_list_id: launchListId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReplySeqs((prev) => prev.map((s) => s.id === launchSeqId ? { ...s, status: "active" } : s));
      toast({
        title: "Sequence launched! 🚀",
        description: data.enrolled
          ? `Sending via ${data.emailAccount} · ${data.enrolled}/${data.total} leads enrolled · ${launchEmailsPerDay} emails/day`
          : `Sending via ${data.emailAccount} · ${launchEmailsPerDay} emails/day`,
      });
      setLaunchModalOpen(false);
    } catch (err) {
      toast({ title: "Launch failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setLaunchConfirming(false);
    }
  }

  async function handlePauseReply(id: number) {
    setReplyPausingId(id);
    try {
      const res = await apiFetch(`/api/replyio/sequences/${id}/pause-seq`, { method: "POST" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setReplySeqs((prev) => prev.map((s) => s.id === id ? { ...s, status: "paused" } : s));
      toast({ title: "Sequence paused." });
    } catch (err) { toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); }
    finally { setReplyPausingId(null); }
  }

  async function handleDeleteReplySeq(id: number) {
    setReplyDeletingId(id);
    try {
      const res = await apiFetch(`/api/replyio/sequences/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setReplySeqs((prev) => prev.filter((s) => s.id !== id));
      if (replySelectedId === id) { setReplySelectedId(null); setReplyContacts([]); setReplyStats(null); }
      setReplyDeleteConfirmId(null);
      toast({ title: "Sequence deleted." });
    } catch (err) { toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); }
    finally { setReplyDeletingId(null); }
  }

  async function handleEnrollListToSeq(seqId: number, listId: string) {
    if (!listId) { toast({ title: "Select a lead list first", variant: "destructive" }); return; }
    setReplyEnrollingList(true);
    try {
      const res = await apiFetch(`/api/replyio/sequences/${seqId}/enroll-list`, { method: "POST", body: JSON.stringify({ lead_list_id: listId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Leads enrolled!", description: `${data.enrolled} of ${data.total} contacts added to sequence.` });
      if (replySelectedId === seqId) loadReplyDetail(seqId);
    } catch (err) { toast({ title: "Enroll failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" }); }
    finally { setReplyEnrollingList(false); }
  }

  async function loadDetail(id: string) {
    setSelectedId(id); setWizard(false); setDetailLoading(true);
    setLeads([]); setLeadsCursor(undefined); setLeadsCursorStack([]); setLeadsHasMore(false);
    try {
      const res = await apiFetch(`/api/campaigns/${id}?t=${Date.now()}`);
      if (res.ok) { const data = await res.json(); setDetail(data); if (data.external_campaign_id) fetchLeads(id, undefined); }
    } finally { setDetailLoading(false); }
  }

  async function fetchLeads(campaignId: string, cursor: string | undefined) {
    setLeadsLoading(true);
    try {
      const url = cursor ? `/api/campaigns/${campaignId}/leads?limit=10&starting_after=${cursor}` : `/api/campaigns/${campaignId}/leads?limit=10`;
      const res = await apiFetch(url);
      if (!res.ok) { toast({ title: "Could not load leads", variant: "destructive" }); return; }
      const data = await res.json();
      setLeads(data.items || []); setLeadsHasMore(!!data.next_starting_after); setLeadsCursor(data.next_starting_after);
    } finally { setLeadsLoading(false); }
  }

  function handleLeadsNext() {
    if (!selectedId || !leadsCursor) return;
    setLeadsCursorStack((prev) => [...prev, leadsCursor]);
    fetchLeads(selectedId, leadsCursor);
  }

  function handleLeadsPrev() {
    if (!selectedId) return;
    const stack = [...leadsCursorStack];
    const prevCursor = stack.length > 1 ? stack[stack.length - 2] : undefined;
    stack.pop(); setLeadsCursorStack(stack); fetchLeads(selectedId, prevCursor);
  }

  async function handleSync(id: string) {
    setSyncing(true);
    try {
      const res = await apiFetch(`/api/campaigns/${id}/sync`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: "Analytics synced!", description: `Sent: ${data.analytics.sent} · Opened: ${data.analytics.opened} · Replied: ${data.analytics.replied}` });
        const ua: CampaignAnalytics = { sent_count: data.analytics.sent, opened_count: data.analytics.opened, replied_count: data.analytics.replied, bounced_count: data.analytics.bounced, clicked_count: data.analytics.clicked };
        setDetail((prev) => prev ? { ...prev, campaign_analytics: [ua] } : prev);
        setCampaigns((prev) => prev.map((c) => c.id === id ? { ...c, campaign_analytics: [ua] } : c));
      } else { toast({ title: "Sync failed", description: data.error || "Could not fetch from Instantly", variant: "destructive" }); }
    } catch { toast({ title: "Sync error", variant: "destructive" }); }
    finally { setSyncing(false); }
  }

  async function handleAddWarmup() {
    if (!warmupInput.trim()) return;
    setWarmupAdding(true);
    try {
      const res = await apiFetch("/api/domain-warmup", { method: "POST", body: JSON.stringify({ domain: warmupInput.trim() }) });
      if (res.ok) { const e = await res.json(); setWarmupDomains((prev) => [e, ...prev]); setWarmupInput(""); toast({ title: "Warmup started", description: `${warmupInput.trim()} is now warming up.` }); }
      else { const err = await res.json(); toast({ title: "Error", description: err.error || "Could not start warmup.", variant: "destructive" }); }
    } finally { setWarmupAdding(false); }
  }

  async function handleMarkReady(warmup: DomainWarmup) {
    const res = await apiFetch(`/api/domain-warmup/${warmup.id}`, { method: "PATCH", body: JSON.stringify({ status: "ready", score: 100 }) });
    if (res.ok) { setWarmupDomains((prev) => prev.map((w) => w.id === warmup.id ? { ...w, status: "ready", score: 100 } : w)); toast({ title: "Domain ready" }); }
  }

  async function handleRemoveWarmup(id: string) {
    await apiFetch(`/api/domain-warmup/${id}`, { method: "DELETE" });
    setWarmupDomains((prev) => prev.filter((w) => w.id !== id));
  }

  async function handleGenerateAI() {
    setAiLoading(true);
    try {
      const tmpRes = await apiFetch("/api/campaigns", { method: "POST", body: JSON.stringify({ name: "__tmp__", sending_domain: wizardDomain || "example.com", sequences: [] }) });
      if (!tmpRes.ok) throw new Error("Could not create temp campaign");
      const tmp = (await tmpRes.json()) as Campaign;
      const aiRes = await apiFetch(`/api/campaigns/${tmp.id}/ai-copy`, { method: "POST" });
      await apiFetch(`/api/campaigns/${tmp.id}`, { method: "DELETE" });
      if (aiRes.ok) { const { sequences: aiSeqs } = (await aiRes.json()) as { sequences: CampaignSequence[] }; setSequences(aiSeqs); toast({ title: "AI copy generated!" }); }
    } catch { toast({ title: "Error", description: "Could not generate AI copy.", variant: "destructive" }); }
    finally { setAiLoading(false); }
  }

  async function handleCreateCampaign() {
    setSaving(true);
    try {
      const res = await apiFetch("/api/campaigns", { method: "POST", body: JSON.stringify({ name: wizardName, sending_domain: wizardDomain, lead_list_id: wizardListId || null, sequences }) });
      if (!res.ok) throw new Error((await res.json()).error);
      const created = (await res.json()) as Campaign;
      setCampaigns((prev) => [created, ...prev]); setWizard(false); resetWizard(); await loadDetail(created.id);
      toast({ title: "Campaign created!", description: `"${created.name}" is ready to launch.` });
    } catch (err) { toast({ title: "Error", description: err instanceof Error ? err.message : "Could not create campaign.", variant: "destructive" }); }
    finally { setSaving(false); }
  }

  async function handleLaunch(id: string) {
    setLaunching(true);
    try {
      const res = await apiFetch(`/api/campaigns/${id}/launch`, { method: "POST" });
      const data = (await res.json()) as { success: boolean; message?: string; error?: string };
      if (data.success) {
        toast({ title: "Campaign launched! 🚀", description: data.message || "Your campaign is now active." });
        setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status: "active" } : c)));
        if (detail?.id === id) setDetail((prev) => (prev ? { ...prev, status: "active" } : prev));
      } else { toast({ title: "Launch failed", description: data.error || "Something went wrong", variant: "destructive" }); }
    } catch { toast({ title: "Error", description: "Could not launch campaign.", variant: "destructive" }); }
    finally { setLaunching(false); }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await apiFetch(`/api/campaigns/${id}`, { method: "DELETE" });
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      if (selectedId === id) { setSelectedId(null); setDetail(null); }
      setDeleteId(null); toast({ title: "Campaign deleted" });
    } finally { setDeleting(false); }
  }

  async function handleUpdateSequences() {
    if (!detail) return;
    const res = await apiFetch(`/api/campaigns/${detail.id}/sequences`, { method: "PUT", body: JSON.stringify({ sequences: detail.campaign_sequences || [] }) });
    if (res.ok) toast({ title: "Sequences saved" });
  }

  function resetWizard() { setStep(1); setWizardName(""); setWizardDomain(""); setWizardListId(""); setSequences([]); }
  function addSequenceStep() { setSequences((prev) => [...prev, { step_number: prev.length + 1, subject: "", body: "", delay_days: prev.length === 0 ? 0 : 3 }]); }
  function handleApplyTemplate(template: EmailTemplate) {
    setSequences(template.sequences.map((s, i) => ({ ...s, step_number: i + 1 })));
    toast({ title: "Template applied", description: `"${template.name}" loaded — edit it as needed.` });
  }

  const analytics = detail ? (Array.isArray(detail.campaign_analytics) ? detail.campaign_analytics[0] : detail.campaign_analytics) : null;
  const readyDomains = warmupDomains.filter((w) => w.status === "ready");
  const openRate  = analytics && analytics.sent_count > 0 ? `${Math.round((analytics.opened_count  / analytics.sent_count) * 100)}%` : null;
  const replyRate = analytics && analytics.sent_count > 0 ? `${Math.round((analytics.replied_count / analytics.sent_count) * 100)}%` : null;
  const clickRate = analytics && analytics.sent_count > 0 && analytics.clicked_count ? `${Math.round((analytics.clicked_count / analytics.sent_count) * 100)}%` : null;
  const replySelectedSeq = replySeqs.find((s) => s.id === replySelectedId);

  const inputCls = "w-full px-3 py-2.5 border border-[#E5E7EB] rounded-lg text-sm text-[#1a1a2e] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5B4FE8] focus:ring-2 focus:ring-[#5B4FE8]/10 bg-white";
  const selectCls = "w-full px-3 py-2.5 border border-[#E5E7EB] rounded-lg text-sm text-[#1a1a2e] focus:outline-none focus:border-[#5B4FE8] bg-white";
  const btnBack = "px-4 py-2.5 border border-[#E5E7EB] text-[#6B7280] text-sm font-semibold rounded-lg hover:bg-[#F9FAFB]";
  const btnPrimary = "bg-[#5B4FE8] text-white text-sm font-semibold rounded-lg hover:bg-[#4A3FD6] transition-colors disabled:opacity-50";
  const enrollInputCls = "w-full px-3 py-2 text-sm bg-white border border-[#E5E7EB] rounded-lg text-[#1a1a2e] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5B4FE8] focus:ring-2 focus:ring-[#5B4FE8]/10 transition-colors";

  // suppress unused warning for icps
  void icps;

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F8F9FB]">
      <div className="p-4 sm:p-8 max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 pt-2">
          <div>
            <h1 style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: "2rem", letterSpacing: "0.04em" }} className="text-[#1a1a2e] mb-1">
              Campaigns
            </h1>
            <p className="text-[#6B7280] text-sm">Build and send email outreach from your warmed domains</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Reply.io mode toggle */}
            <div className="flex items-center gap-1 p-1 bg-white border border-[#E5E7EB] rounded-xl shadow-sm">
              <button
                onClick={() => handleToggleReplyMode(false)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${!replyMode ? "bg-[#5B4FE8] text-white shadow-sm" : "text-[#6B7280] hover:text-[#1a1a2e]"}`}
              >
                Native (Instantly)
              </button>
              <button
                onClick={() => { if (replyConnected) handleToggleReplyMode(true); }}
                disabled={!replyConnected}
                title={!replyConnected ? "Connect Reply.io in Settings → Integrations first" : undefined}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${replyMode ? "bg-[#5B4FE8] text-white shadow-sm" : !replyConnected ? "text-[#C4C4C4] cursor-not-allowed" : "text-[#6B7280] hover:text-[#1a1a2e]"}`}
              >
                <svg width="12" height="12" viewBox="0 0 32 32" fill="none">
                  <path d="M8 10h10a4 4 0 010 8H12v4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="22" cy="22" r="2.5" fill="currentColor"/>
                </svg>
                Reply.io
                {replyConnected && !replyMode && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                {!replyConnected && <span className="text-[10px] font-normal text-[#C4C4C4]">(not connected)</span>}
              </button>
            </div>
            {!replyMode && (
              <button
                onClick={() => { setWizard(true); setSelectedId(null); setDetail(null); resetWizard(); }}
                className={`flex items-center gap-2 px-4 py-2.5 ${btnPrimary}`}
              >
                <Plus className="w-4 h-4" /> New Campaign
              </button>
            )}
          </div>
        </div>

        {/* ── Reply.io Mode (Email only) ── */}
        {replyMode && (
          <div className="space-y-4">
            {/* Connected mailboxes */}
            {(emailAccounts.length > 0 || emailAccountsLoading) && (
              <div className="bg-white border border-[#E5E7EB] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Mail className="w-4 h-4 text-[#5B4FE8]" />
                  <p className="text-xs font-semibold text-[#1a1a2e]">Connected Mailboxes</p>
                  {emailAccountsLoading && <Loader2 className="w-3 h-3 animate-spin text-[#9CA3AF]" />}
                </div>
                {emailAccounts.length === 0 && !emailAccountsLoading ? null : (
                  <div className="flex flex-wrap gap-2">
                    {emailAccounts.map((acc) => (
                      <div key={acc.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${acc.connectionStatus === "connected" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-gray-50 border-gray-200 text-gray-500"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${acc.connectionStatus === "connected" ? "bg-emerald-500" : "bg-gray-400"}`} />
                        {acc.alias || acc.email}
                        {acc.connectionStatus !== "connected" && <span className="text-[10px] text-gray-400 ml-0.5">({acc.connectionStatus})</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#9CA3AF] uppercase tracking-widest font-medium">Reply.io Email Sequences</p>
                <p className="text-xs text-[#6B7280] mt-0.5">Create and send email campaigns via Reply.io sequences</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={loadReplySeqs} className="flex items-center gap-1 text-xs text-[#5B4FE8] hover:text-[#4A3FD6]">
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
                <button
                  onClick={() => { setEnrollSeqId(replySelectedId); setEnrollOpen(true); }}
                  disabled={!replySelectedId}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#5B4FE8] text-[#5B4FE8] rounded-lg hover:bg-[#F5F3FF] transition-colors disabled:opacity-40"
                >
                  <Users className="w-3 h-3" /> Enroll Contact
                </button>
                <button
                  onClick={() => { setReplyWizard(true); resetReplyWizard(); loadSavedTemplates(); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 ${btnPrimary}`}
                >
                  <Plus className="w-3.5 h-3.5" /> New Campaign
                </button>
              </div>
            </div>

            {replySeqsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-[#5B4FE8]" /></div>
            ) : replySeqs.length === 0 ? (
              <div className="bg-white border border-dashed border-[#E5E7EB] rounded-xl p-10 text-center">
                <div className="w-12 h-12 bg-[#F5F3FF] rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Mail className="w-6 h-6 text-[#5B4FE8]" />
                </div>
                <p className="text-sm font-semibold text-[#1a1a2e]">No email sequences yet</p>
                <p className="text-xs text-[#6B7280] mt-1">Create your first email campaign directly from HubCredo.</p>
                <button
                  onClick={() => { setReplyWizard(true); resetReplyWizard(); loadSavedTemplates(); }}
                  className={`mt-4 flex items-center gap-1.5 px-4 py-2 mx-auto ${btnPrimary}`}
                >
                  <Plus className="w-3.5 h-3.5" /> Create first campaign
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Sequence list */}
                <div className="space-y-2">
                  {replySeqs.map((seq) => (
                    <div key={seq.id}
                      className={`rounded-xl border transition-all ${replySelectedId === seq.id ? "bg-[#F5F3FF] border-[#5B4FE8]/40 shadow-[0_0_0_3px_rgba(91,79,232,0.08)]" : "bg-white border-[#E5E7EB] hover:border-[#5B4FE8]/40 hover:shadow-sm"}`}
                    >
                      <button className="w-full text-left px-4 pt-3 pb-2" onClick={() => loadReplyDetail(seq.id)}>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${seq.status === "active" ? "bg-emerald-400" : seq.status === "paused" ? "bg-amber-400" : "bg-gray-300"}`} />
                          <span className="text-sm font-medium text-[#1a1a2e] truncate">{seq.name}</span>
                        </div>
                        <span className={`mt-1 inline-flex text-xs px-1.5 py-0.5 rounded-full capitalize font-medium ${seq.status === "active" ? "bg-emerald-50 text-emerald-700" : seq.status === "paused" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                          {seq.status}
                        </span>
                      </button>
                      <div className="flex items-center gap-1 px-4 pb-2">
                        {seq.status !== "active" ? (
                          <button onClick={(e) => { e.stopPropagation(); openLaunchModal(seq.id); }} disabled={replyActivatingId === seq.id}
                            className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-50">
                            <Play className="w-2.5 h-2.5" /> Launch
                          </button>
                        ) : (
                          <button onClick={() => handlePauseReply(seq.id)} disabled={replyPausingId === seq.id}
                            className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 hover:text-amber-700 disabled:opacity-50">
                            {replyPausingId === seq.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Pause className="w-2.5 h-2.5" />} Pause
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setReplyDeleteConfirmId(seq.id); }}
                          className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-[#9CA3AF] hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-2.5 h-2.5" /> Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Sequence detail */}
                <div className="lg:col-span-2">
                  {!replySelectedSeq ? (
                    <div className="bg-white border border-dashed border-[#E5E7EB] rounded-xl flex items-center justify-center h-48">
                      <p className="text-sm text-[#9CA3AF]">Select a sequence to view details</p>
                    </div>
                  ) : replyDetailLoading ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-[#5B4FE8]" /></div>
                  ) : (
                    <div className="space-y-3">

                      {replyStats && (
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                          {[
                            { label: "Contacted",  value: replyStats.total,     sub: null,                                                        color: "text-[#1a1a2e]" },
                            { label: "Delivered",  value: replyStats.delivered, sub: `${(replyStats.deliveredPercentage ?? 0).toFixed(0)}%`, color: "text-[#5B4FE8]" },
                            { label: "Opened",     value: replyStats.opened,    sub: `${(replyStats.openedPercentage    ?? 0).toFixed(0)}%`, color: "text-indigo-600" },
                            { label: "Replied",    value: replyStats.replied,   sub: `${(replyStats.repliedPercentage   ?? 0).toFixed(0)}%`, color: "text-blue-600" },
                            { label: "Bounced",    value: replyStats.bounced,   sub: `${(replyStats.bouncedPercentage   ?? 0).toFixed(0)}%`, color: "text-red-500" },
                          ].map(({ label, value, sub, color }) => (
                            <div key={label} className="bg-white border border-[#E5E7EB] rounded-xl p-3 text-center">
                              <p className={`text-xl font-bold ${color}`}>{value}</p>
                              {sub && <p className="text-xs font-semibold text-[#5B4FE8]">{sub}</p>}
                              <p className="text-[10px] text-[#9CA3AF] mt-0.5">{label}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Bulk enroll from lead list */}
                      <div className="bg-white border border-[#E5E7EB] rounded-xl p-4">
                        <p className="text-xs font-semibold text-[#1a1a2e] mb-2">Enroll from lead list</p>
                        <div className="flex gap-2">
                          <select value={replyEnrollListId} onChange={(e) => setReplyEnrollListId(e.target.value)} className={`${selectCls} flex-1`}>
                            <option value="">Select a lead list…</option>
                            {lists.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                          </select>
                          <button
                            onClick={() => handleEnrollListToSeq(replySelectedId!, replyEnrollListId)}
                            disabled={!replyEnrollListId || replyEnrollingList}
                            className={`flex items-center gap-1.5 px-3 py-2 ${btnPrimary} disabled:opacity-40`}
                          >
                            {replyEnrollingList ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            Enroll list
                          </button>
                        </div>
                      </div>

                      <div className="bg-white border border-[#E5E7EB] rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-semibold text-[#1a1a2e]">
                            {replySelectedSeq.name}
                            <span className="ml-2 text-xs text-[#9CA3AF] font-normal">{replyContacts.length} contacts</span>
                          </p>
                          <button onClick={() => { setEnrollSeqId(replySelectedId); setEnrollOpen(true); }} className="text-xs text-[#5B4FE8] font-medium hover:underline">+ Add contact</button>
                        </div>
                        {replyContacts.length === 0 ? (
                          <div className="text-center py-6">
                            <p className="text-sm text-[#9CA3AF]">No contacts yet</p>
                            <button onClick={() => { setEnrollSeqId(replySelectedId); setEnrollOpen(true); }} className="mt-2 text-xs text-[#5B4FE8] hover:underline font-medium">Enroll first contact →</button>
                          </div>
                        ) : (
                          <div className="divide-y divide-[#F3F4F6]">
                            {replyContacts.map((c) => (
                              <div key={c.email} className="flex items-center justify-between py-2.5 gap-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-7 h-7 rounded-full bg-[#F5F3FF] flex items-center justify-center text-xs font-semibold text-[#5B4FE8] flex-shrink-0">
                                    {(c.firstName?.[0] ?? c.email[0]).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-[#1a1a2e] truncate">{c.firstName} {c.lastName}</p>
                                    <p className="text-[11px] text-[#9CA3AF] truncate">{c.email}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize ${c.status?.status === "active" ? "bg-emerald-50 text-emerald-700" : c.status?.status === "finished" ? "bg-purple-50 text-purple-700" : "bg-gray-100 text-gray-500"}`}>
                                    {c.status?.status?.replace(/_/g, " ") ?? "unknown"}
                                  </span>
                                  {c.status?.opened && <span title="Opened"><Eye className="w-3 h-3 text-blue-400" /></span>}
                                  {c.status?.replied && <span title="Replied"><MessageSquare className="w-3 h-3 text-emerald-400" /></span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Native Mode ── */}
        {!replyMode && (
          <>
            {/* Domain Warmup */}
            <div className="bg-white border border-[#E5E7EB] rounded-xl p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-[#F5F3FF] rounded-lg flex items-center justify-center">
                    <Globe className="w-4 h-4 text-[#5B4FE8]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#1a1a2e]">Domain Warmup</p>
                    <p className="text-xs text-[#6B7280]">Warm your sending domains before launching campaigns</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={warmupInput}
                    onChange={(e) => setWarmupInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddWarmup()}
                    placeholder="yourdomain.com"
                    className="w-44 px-3 py-1.5 border border-[#E5E7EB] rounded-lg text-sm text-[#1a1a2e] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5B4FE8] focus:ring-2 focus:ring-[#5B4FE8]/10 bg-white"
                  />
                  <button onClick={handleAddWarmup} disabled={warmupAdding || !warmupInput.trim()} className={`flex items-center gap-1.5 px-3 py-1.5 ${btnPrimary}`}>
                    {warmupAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
                  </button>
                </div>
              </div>
              {warmupDomains.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-[#E5E7EB] rounded-lg">
                  <Globe className="w-8 h-8 text-[#9CA3AF] mx-auto mb-2" />
                  <p className="text-sm text-[#6B7280]">No domains warming yet</p>
                  <p className="text-xs text-[#9CA3AF] mt-0.5">Add a domain you purchased to start the warmup process</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {warmupDomains.map((w) => (
                    <div key={w.id} className="flex items-center gap-4 p-3 bg-[#F9FAFB] rounded-lg border border-[#E5E7EB]">
                      <div className="flex items-center gap-2 w-48 shrink-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${w.status === "ready" ? "bg-emerald-500" : w.status === "failed" ? "bg-red-500" : "bg-amber-400 animate-pulse"}`} />
                        <span className="text-sm font-medium text-[#1a1a2e] truncate">{w.domain}</span>
                      </div>
                      <WarmupProgress score={w.score ?? 0} />
                      <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 capitalize ${w.status === "ready" ? "bg-emerald-50 border-emerald-200 text-emerald-600" : w.status === "failed" ? "bg-red-50 border-red-200 text-red-500" : "bg-amber-50 border-amber-200 text-amber-700"}`}>{w.status}</span>
                      <div className="flex items-center gap-2 shrink-0 ml-auto">
                        {w.status === "warming" && <button onClick={() => handleMarkReady(w)} className="text-xs text-[#5B4FE8] hover:underline font-medium">Mark ready</button>}
                        <button onClick={() => handleRemoveWarmup(w.id)} className="w-6 h-6 flex items-center justify-center rounded text-[#9CA3AF] hover:text-red-500 hover:bg-red-50 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Campaign list */}
              <div className="space-y-2">
                <p className="text-xs text-[#9CA3AF] uppercase tracking-widest font-medium px-1 mb-3">Your Campaigns</p>
                {loading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 text-[#9CA3AF] animate-spin" /></div>
                ) : campaigns.length === 0 ? (
                  <div className="bg-white border border-dashed border-[#E5E7EB] rounded-xl p-8 text-center">
                    <Mail className="w-8 h-8 text-[#9CA3AF] mx-auto mb-2" />
                    <p className="text-sm text-[#6B7280]">No campaigns yet</p>
                    <button onClick={() => { setWizard(true); setSelectedId(null); setDetail(null); resetWizard(); }} className="mt-3 text-xs text-[#5B4FE8] font-medium hover:underline">Create your first →</button>
                  </div>
                ) : (
                  campaigns.map((c) => {
                    const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.draft;
                    const a = Array.isArray(c.campaign_analytics) ? c.campaign_analytics[0] : c.campaign_analytics;
                    return (
                      <div
                        key={c.id}
                        onClick={() => loadDetail(c.id)}
                        className={`group cursor-pointer bg-white border rounded-xl p-4 transition-all ${selectedId === c.id ? "border-[#5B4FE8] shadow-[0_0_0_3px_rgba(91,79,232,0.1)]" : "border-[#E5E7EB] hover:border-[#5B4FE8]/40 hover:shadow-sm"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-[#1a1a2e] leading-tight flex-1 truncate">{c.name}</p>
                          <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border shrink-0 ${cfg.color}`}>{cfg.icon}{cfg.label}</span>
                        </div>
                        <p className="text-xs text-[#6B7280] mt-1 truncate">{c.sending_domain}</p>
                        {a && (
                          <div className="flex items-center gap-3 mt-2 text-xs text-[#9CA3AF]">
                            <span>{a.sent_count} sent</span><span>{a.opened_count} opened</span><span>{a.replied_count} replied</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Right panel */}
              <div className="lg:col-span-2">
                {/* CREATE WIZARD */}
                {wizard && (
                  <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden">
                    <div className="flex border-b border-[#E5E7EB]">
                      {([1, 2, 3] as const).map((s) => (
                        <div key={s} className={`flex-1 py-3 text-center text-xs font-semibold transition-colors ${step === s ? "text-[#5B4FE8] border-b-2 border-[#5B4FE8] bg-[#F5F3FF]" : step > s ? "text-emerald-600 bg-emerald-50" : "text-[#9CA3AF]"}`}>
                          {step > s ? <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" /> : null}
                          {s === 1 ? "1. Setup" : s === 2 ? "2. Sequences" : "3. Review"}
                        </div>
                      ))}
                    </div>
                    <div className="p-6">
                      {step === 1 && (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-1.5">Campaign Name</label>
                            <input value={wizardName} onChange={(e) => setWizardName(e.target.value)} placeholder="e.g. Q3 SaaS Founders Outreach" className={inputCls} />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-1.5">
                              Sending Domain {readyDomains.length > 0 && <span className="ml-2 text-emerald-600 normal-case font-normal">({readyDomains.length} ready)</span>}
                            </label>
                            {readyDomains.length > 0 ? (
                              <select value={wizardDomain} onChange={(e) => setWizardDomain(e.target.value)} className={selectCls}>
                                <option value="">Select a domain…</option>
                                {readyDomains.map((d) => <option key={d.id} value={d.domain}>{d.domain}</option>)}
                                <option value="__custom__">Enter manually…</option>
                              </select>
                            ) : null}
                            {(wizardDomain === "__custom__" || readyDomains.length === 0) && (
                              <input value={wizardDomain === "__custom__" ? "" : wizardDomain} onChange={(e) => setWizardDomain(e.target.value)} placeholder="yourdomain.com" className={`${inputCls} mt-2`} />
                            )}
                            {readyDomains.length === 0 && <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> No warmed domains yet</p>}
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-1.5">Lead List (optional)</label>
                            <select value={wizardListId} onChange={(e) => setWizardListId(e.target.value)} className={selectCls}>
                              <option value="">No list selected</option>
                              {lists.map((l) => <option key={l.id} value={l.id}>{l.label || "Untitled list"}</option>)}
                            </select>
                          </div>
                          <button
                            onClick={() => { if (wizardName && wizardDomain) setStep(2); }}
                            disabled={!wizardName.trim() || !wizardDomain.trim() || wizardDomain === "__custom__"}
                            className={`w-full py-2.5 flex items-center justify-center gap-2 ${btnPrimary}`}
                          >
                            Continue <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      {step === 2 && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-[#1a1a2e]">Email Sequences ({sequences.length} step{sequences.length !== 1 ? "s" : ""})</p>
                            <div className="flex items-center gap-2">
                              <TemplateDropdown onSelect={handleApplyTemplate} />
                              <button onClick={handleGenerateAI} disabled={aiLoading} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F5F3FF] border border-[#E0D9FF] text-[#5B4FE8] text-xs font-semibold rounded-lg hover:bg-[#EDE9FF] transition-colors disabled:opacity-50">
                                {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                AI Generate
                              </button>
                            </div>
                          </div>
                          {sequences.length === 0 ? (
                            <div className="border border-dashed border-[#E5E7EB] rounded-lg p-8 text-center">
                              <Mail className="w-8 h-8 text-[#9CA3AF] mx-auto mb-2" />
                              <p className="text-sm text-[#6B7280] mb-3">No steps yet</p>
                              <div className="flex items-center justify-center gap-2 flex-wrap">
                                <button onClick={handleGenerateAI} disabled={aiLoading} className={`flex items-center gap-1.5 px-3 py-2 ${btnPrimary}`}>
                                  {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Auto-generate
                                </button>
                                <button onClick={addSequenceStep} className="px-3 py-2 border border-[#E5E7EB] text-[#6B7280] text-sm font-semibold rounded-lg hover:bg-[#F9FAFB]">Add blank step</button>
                              </div>
                              <p className="text-xs text-[#9CA3AF] mt-3">or use the <span className="font-semibold text-[#6B7280]">Use Template</span> dropdown above</p>
                            </div>
                          ) : (
                            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                              {sequences.map((seq, i) => (
                                <div key={i} className="border border-[#E5E7EB] rounded-lg overflow-hidden">
                                  <div className="flex items-center gap-3 px-3 py-2 bg-[#F9FAFB] border-b border-[#E5E7EB]">
                                    <span className="w-5 h-5 bg-[#5B4FE8] rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                                    <span className="text-xs text-[#6B7280]">Day</span>
                                    <input type="number" min={0} value={seq.delay_days}
                                      onChange={(e) => setSequences((prev) => prev.map((s, j) => j === i ? { ...s, delay_days: parseInt(e.target.value) || 0 } : s))}
                                      className="w-14 px-2 py-0.5 border border-[#E5E7EB] rounded text-xs text-center bg-white text-[#1a1a2e] focus:outline-none focus:border-[#5B4FE8]"
                                    />
                                    <button onClick={() => setSequences((prev) => prev.filter((_, j) => j !== i))} className="ml-auto text-[#9CA3AF] hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                                  </div>
                                  <div className="p-3 space-y-2 bg-white">
                                    <input value={seq.subject}
                                      onChange={(e) => setSequences((prev) => prev.map((s, j) => j === i ? { ...s, subject: e.target.value } : s))}
                                      placeholder="Subject line"
                                      className="w-full px-2.5 py-1.5 border border-[#E5E7EB] rounded text-sm text-[#1a1a2e] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5B4FE8] bg-white"
                                    />
                                    <textarea value={seq.body}
                                      onChange={(e) => setSequences((prev) => prev.map((s, j) => j === i ? { ...s, body: e.target.value } : s))}
                                      placeholder="Email body…" rows={4}
                                      className="w-full px-2.5 py-1.5 border border-[#E5E7EB] rounded text-xs text-[#1a1a2e] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5B4FE8] bg-white resize-none font-mono leading-relaxed"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {sequences.length > 0 && (
                            <button onClick={addSequenceStep} className="flex items-center gap-1.5 text-xs text-[#5B4FE8] hover:underline font-medium">
                              <Plus className="w-3.5 h-3.5" /> Add follow-up step
                            </button>
                          )}
                          <div className="flex gap-3 pt-2">
                            <button onClick={() => setStep(1)} className={btnBack}>Back</button>
                            <button onClick={() => { if (sequences.length > 0) setStep(3); }} disabled={sequences.length === 0} className={`flex-1 py-2.5 flex items-center justify-center gap-2 ${btnPrimary}`}>
                              Review <ArrowRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}

                      {step === 3 && (
                        <div className="space-y-4">
                          <div className="bg-[#F9FAFB] rounded-lg p-4 space-y-2">
                            {[
                              ["Campaign name", wizardName],
                              ["Sending domain", wizardDomain],
                              ["Lead list", wizardListId ? (lists.find((l) => l.id === wizardListId)?.label ?? "Unknown") : "None selected"],
                              ["Email steps", `${sequences.length} step${sequences.length !== 1 ? "s" : ""}`],
                            ].map(([label, value]) => (
                              <div key={label} className="flex items-center justify-between text-sm">
                                <span className="text-[#6B7280]">{label}</span>
                                <span className="font-semibold text-[#1a1a2e]">{value}</span>
                              </div>
                            ))}
                          </div>
                          <div className="space-y-2">
                            {sequences.map((seq, i) => (
                              <div key={i} className="flex items-center gap-3 p-3 bg-white border border-[#E5E7EB] rounded-lg">
                                <span className="w-6 h-6 bg-[#F5F3FF] rounded-full text-[#5B4FE8] text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-[#1a1a2e] truncate">{seq.subject || "(no subject)"}</p>
                                  <p className="text-xs text-[#6B7280]">Day {seq.delay_days}</p>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="flex gap-3">
                            <button onClick={() => setStep(2)} className={btnBack}>Back</button>
                            <button onClick={handleCreateCampaign} disabled={saving} className={`flex-1 py-2.5 flex items-center justify-center gap-2 ${btnPrimary}`}>
                              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                              {saving ? "Saving…" : "Save Campaign"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* CAMPAIGN DETAIL */}
                {!wizard && selectedId && (detailLoading ? (
                  <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 text-[#9CA3AF] animate-spin" /></div>
                ) : detail ? (
                  <div className="space-y-5">
                    <div className="bg-white border border-[#E5E7EB] rounded-xl p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2 className="text-lg font-bold text-[#1a1a2e] leading-tight">{detail.name}</h2>
                          <p className="text-sm text-[#6B7280] mt-0.5 font-mono">{detail.sending_domain}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {detail.status === "draft" && (
                            <button onClick={() => handleLaunch(detail.id)} disabled={launching} className={`flex items-center gap-2 px-4 py-2 ${btnPrimary}`}>
                              {launching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Launch
                            </button>
                          )}
                          {detail.status === "active" && (
                            <>
                              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-600 text-sm font-semibold rounded-lg">
                                <Play className="w-3.5 h-3.5" /> Active
                              </span>
                              <button onClick={() => handleSync(detail.id)} disabled={syncing} className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E5E7EB] text-[#6B7280] text-sm font-semibold rounded-lg hover:bg-[#F9FAFB] transition-colors disabled:opacity-50">
                                {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Sync
                              </button>
                            </>
                          )}
                          <button onClick={() => setDeleteId(detail.id)} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#9CA3AF] hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs text-[#9CA3AF] uppercase tracking-widest font-medium">Analytics</p>
                        {detail.status === "active" && (
                          <button onClick={() => handleSync(detail.id)} disabled={syncing} className="flex items-center gap-1 text-xs text-[#5B4FE8] hover:underline font-medium disabled:opacity-50">
                            {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh from Instantly
                          </button>
                        )}
                      </div>
                      {analytics ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <StatCard icon={<Send className="w-4 h-4 text-[#5B4FE8]" />} label="Sent" value={analytics.sent_count} color="bg-[#F5F3FF]" />
                          <StatCard icon={<Eye className="w-4 h-4 text-[#7C3AED]" />} label="Opened" value={analytics.opened_count} rate={openRate ? `${openRate} open rate` : undefined} color="bg-purple-50" />
                          <StatCard icon={<MessageSquare className="w-4 h-4 text-emerald-600" />} label="Replied" value={analytics.replied_count} rate={replyRate ? `${replyRate} reply rate` : undefined} color="bg-emerald-50" />
                          <StatCard icon={<MousePointerClick className="w-4 h-4 text-amber-600" />} label="Clicked" value={analytics.clicked_count ?? 0} rate={clickRate ? `${clickRate} click rate` : undefined} color="bg-amber-50" />
                        </div>
                      ) : (
                        <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 text-center">
                          <TrendingUp className="w-8 h-8 text-[#9CA3AF] mx-auto mb-2" />
                          <p className="text-sm text-[#6B7280]">No analytics yet</p>
                          {detail.status === "active" && (
                            <button onClick={() => handleSync(detail.id)} disabled={syncing} className="mt-3 flex items-center gap-1.5 text-xs text-[#5B4FE8] font-medium hover:underline mx-auto disabled:opacity-50">
                              {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Sync from Instantly
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {detail.external_campaign_id && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs text-[#9CA3AF] uppercase tracking-widest font-medium flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Leads</p>
                          <button onClick={() => { setLeads([]); setLeadsCursor(undefined); setLeadsCursorStack([]); fetchLeads(detail.id, undefined); }} disabled={leadsLoading} className="flex items-center gap-1 text-xs text-[#5B4FE8] hover:underline font-medium disabled:opacity-50">
                            {leadsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
                          </button>
                        </div>
                        {leadsLoading && leads.length === 0 ? (
                          <div className="flex items-center justify-center py-10 bg-white border border-[#E5E7EB] rounded-xl"><Loader2 className="w-5 h-5 text-[#9CA3AF] animate-spin" /></div>
                        ) : leads.length === 0 ? (
                          <div className="bg-white border border-dashed border-[#E5E7EB] rounded-xl p-6 text-center">
                            <Users className="w-7 h-7 text-[#9CA3AF] mx-auto mb-2" />
                            <p className="text-sm text-[#6B7280]">No leads found</p>
                          </div>
                        ) : (
                          <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden">
                            <div className="grid grid-cols-[2fr_2fr_1.5fr_1.2fr] gap-3 px-4 py-2.5 bg-[#F9FAFB] border-b border-[#E5E7EB]">
                              {["Email", "Name", "Company", "Status"].map((h) => (
                                <span key={h} className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">{h}</span>
                              ))}
                            </div>
                            <div className="divide-y divide-[#F3F4F6]">
                              {leads.map((lead) => {
                                const statusInfo = lead.status !== undefined ? LEAD_STATUS_MAP[lead.status] : null;
                                return (
                                  <div key={lead.id} className="grid grid-cols-[2fr_2fr_1.5fr_1.2fr] gap-3 px-4 py-3 hover:bg-[#F9FAFB] transition-colors">
                                    <span className="text-xs text-[#1a1a2e] truncate font-mono">{lead.email || "—"}</span>
                                    <span className="text-xs text-[#1a1a2e] truncate">{[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—"}</span>
                                    <span className="text-xs text-[#6B7280] truncate">{lead.company_name || "—"}</span>
                                    <span className="flex flex-wrap items-center gap-1">
                                      {statusInfo ? (
                                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full border font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                                      ) : (
                                        <span className="text-xs text-[#9CA3AF] bg-[#F3F4F6] border border-[#E5E7EB] px-2 py-0.5 rounded-full">Not contacted</span>
                                      )}
                                      {lead.email_open_count && lead.email_open_count > 0 ? (
                                        <span className="inline-block text-xs px-2 py-0.5 rounded-full border font-medium text-amber-700 bg-amber-50 border-amber-200">Email opened</span>
                                      ) : null}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="flex items-center justify-between px-4 py-3 border-t border-[#E5E7EB] bg-[#F9FAFB]">
                              <button onClick={handleLeadsPrev} disabled={leadsCursorStack.length === 0 || leadsLoading} className="flex items-center gap-1 text-xs font-medium text-[#6B7280] hover:text-[#5B4FE8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                                <ChevronLeft className="w-3.5 h-3.5" /> Previous
                              </button>
                              <span className="text-xs text-[#9CA3AF]">{leads.length} leads on this page</span>
                              <button onClick={handleLeadsNext} disabled={!leadsHasMore || leadsLoading} className="flex items-center gap-1 text-xs font-medium text-[#6B7280] hover:text-[#5B4FE8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                                Next <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs text-[#9CA3AF] uppercase tracking-widest font-medium">Email Sequence</p>
                        {detail.campaign_sequences && detail.campaign_sequences.length > 0 && (
                          <button onClick={handleUpdateSequences} className="text-xs text-[#5B4FE8] hover:underline font-medium">Save changes</button>
                        )}
                      </div>
                      {!detail.campaign_sequences || detail.campaign_sequences.length === 0 ? (
                        <div className="bg-white border border-dashed border-[#E5E7EB] rounded-xl p-6 text-center text-sm text-[#6B7280]">No email steps yet</div>
                      ) : (
                        <div className="space-y-3">
                          {detail.campaign_sequences.sort((a, b) => a.step_number - b.step_number).map((seq, i) => (
                            <div key={seq.id || i} className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden">
                              <div className="flex items-center gap-3 px-4 py-2 bg-[#F9FAFB] border-b border-[#E5E7EB]">
                                <span className="w-5 h-5 bg-[#5B4FE8] rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                                <span className="text-xs text-[#6B7280]">Day {seq.delay_days}</span>
                                <span className="text-xs font-medium text-[#1a1a2e] flex-1 truncate">{seq.subject}</span>
                              </div>
                              <div className="px-4 py-3">
                                <pre className="text-xs text-[#6B7280] whitespace-pre-wrap leading-relaxed font-sans line-clamp-4">{seq.body}</pre>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null)}

                {!wizard && !selectedId && (
                  <div className="flex flex-col items-center justify-center h-64 text-center">
                    <Mail className="w-10 h-10 text-[#9CA3AF] mb-3" />
                    <p className="text-[#6B7280] font-medium">Select a campaign to view details</p>
                    <p className="text-sm text-[#9CA3AF] mt-1">or create a new one to get started</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      </div>

      {/* Delete confirm */}
      {deleteId && (
        <>
          <div className="fixed inset-0 bg-black/20 z-50 backdrop-blur-[2px]" onClick={() => setDeleteId(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-[#1a1a2e] font-semibold text-base">Delete campaign?</p>
                  <p className="text-[#6B7280] text-sm mt-1">This will permanently delete the campaign, all sequences, and analytics.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDeleteId(null)} className={`flex-1 py-2.5 ${btnBack}`}>Cancel</button>
                <button onClick={() => handleDelete(deleteId)} disabled={deleting} className="flex-1 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Reply.io Create Campaign wizard (email only) ── */}
      {replyWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] flex-shrink-0">
              <div>
                <h3 className="text-sm font-bold text-[#1a1a2e]">New Reply.io Email Campaign</h3>
                <p className="text-xs text-[#6B7280] mt-0.5">Step {replyWizStep} of 4</p>
              </div>
              <button onClick={() => setReplyWizard(false)} className="text-[#9CA3AF] hover:text-[#1a1a2e]"><X className="w-4 h-4" /></button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-0 px-6 pt-3 flex-shrink-0">
              {[1, 2, 3, 4].map((s) => (
                <div key={s} className="flex items-center">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${replyWizStep >= s ? "bg-[#5B4FE8] text-white" : "bg-[#F3F4F6] text-[#9CA3AF]"}`}>{s}</div>
                  {s < 4 && <div className={`w-10 h-0.5 mx-1 ${replyWizStep >= s + 1 ? "bg-[#5B4FE8]" : "bg-[#E5E7EB]"}`} />}
                </div>
              ))}
              <div className="ml-3 text-xs text-[#9CA3AF]">
                {replyWizStep === 1 ? "Name & email steps" : replyWizStep === 2 ? "Select lead list" : replyWizStep === 3 ? "Map variables" : "Create campaign"}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {replyWizStep === 1 && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-[#6B7280] mb-1.5">Campaign name <span className="text-red-400">*</span></label>
                    <input
                      autoFocus
                      value={replyWizName}
                      onChange={(e) => setReplyWizName(e.target.value)}
                      placeholder="e.g. Q3 SaaS Outreach"
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:border-[#5B4FE8] focus:ring-2 focus:ring-[#5B4FE8]/10"
                    />
                  </div>

                  {/* Template picker */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-medium text-[#6B7280]">Apply template (optional)</label>
                      <button
                        onClick={() => setManageTemplatesOpen(true)}
                        className="flex items-center gap-1 text-xs text-[#6B7280] hover:text-[#5B4FE8] font-medium transition-colors"
                      >
                        <BookOpen className="w-3 h-3" /> Manage
                      </button>
                    </div>

                    {/* Saved templates row */}
                    {savedTemplates.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-1">
                        {savedTemplates.map((tpl) => (
                          <button
                            key={tpl.id}
                            onClick={() => applySavedTemplate(tpl)}
                            className="flex items-center gap-1 text-xs bg-[#F5F3FF] text-[#5B4FE8] border border-[#5B4FE8]/20 px-2.5 py-1.5 rounded-lg hover:bg-[#EDE9FF] transition-colors font-medium"
                          >
                            <BookmarkPlus className="w-3 h-3 shrink-0" />
                            {tpl.name}
                            <span className="text-[10px] text-[#9CA3AF] font-normal ml-0.5">{tpl.steps.length}s</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Built-in templates dropdown */}
                    <select
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) {
                          try {
                            const tpl = JSON.parse(val) as EmailTemplate;
                            applyReplyTemplate(tpl);
                          } catch { /* */ }
                        }
                        e.target.value = "";
                      }}
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:border-[#5B4FE8]"
                    >
                      <option value="">Pick a built-in template…</option>
                      <option value={JSON.stringify({ sequences: [{ step_number: 1, delay_days: 0, subject: "Quick question", body: "Hi {{firstName}},\n\nI work with B2B companies to improve their outbound sales infrastructure. I thought you might be a great fit.\n\nWould love to connect — are you open to a quick 15-min call?\n\nBest,\n{{senderName}}" }, { step_number: 2, delay_days: 3, subject: "Re: Quick question", body: "Hi {{firstName}},\n\nJust following up in case this slipped through. Would you be open to a quick chat about improving your outbound?\n\nBest,\n{{senderName}}" }] })}>Cold Outreach (2-step)</option>
                      <option value={JSON.stringify({ sequences: [{ step_number: 1, delay_days: 0, subject: "Idea for {{companyName}}", body: "Hi {{firstName}},\n\nI noticed {{companyName}} is growing fast. I have a few ideas on how to scale your pipeline — mind if I share?\n\n{{senderName}}" }, { step_number: 2, delay_days: 4, subject: "One more thought", body: "Hey {{firstName}}, just wanted to drop one more note. Happy to show you how we've helped similar companies 2x their reply rates.\n\n{{senderName}}" }, { step_number: 3, delay_days: 7, subject: "Last note", body: "Hi {{firstName}}, I'll leave you alone after this — but if you ever want to talk outbound, I'm here. {{senderName}}" }] })}>Value-First (3-step)</option>
                    </select>
                  </div>

                  {/* Email sequence steps only */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-[#6B7280]">Email steps</label>
                      <div className="flex items-center gap-2">
                        {replyWizSteps.length > 0 && (
                          <button
                            onClick={() => { setSaveTemplateName(""); setSaveTemplateOpen(true); }}
                            className="flex items-center gap-1 text-xs text-[#059669] font-medium hover:text-[#047857] border border-[#059669]/30 bg-[#F0FDF4] px-2 py-1 rounded-lg transition-colors"
                          >
                            <BookmarkPlus className="w-3 h-3" /> Save as template
                          </button>
                        )}
                        <button onClick={() => addReplyWizStep()} className="flex items-center gap-1 text-xs text-[#5B4FE8] font-medium hover:text-[#4A3FD6]">
                          <Mail className="w-3 h-3" /> Add email step
                        </button>
                      </div>
                    </div>
                    {replyWizSteps.length === 0 ? (
                      <div className="bg-[#F9FAFB] border border-dashed border-[#E5E7EB] rounded-xl p-6 text-center">
                        <Mail className="w-8 h-8 text-[#9CA3AF] mx-auto mb-2" />
                        <p className="text-sm text-[#9CA3AF] mb-2">No email steps yet</p>
                        <button onClick={() => addReplyWizStep()} className="text-xs text-[#5B4FE8] hover:underline font-medium flex items-center gap-1 mx-auto">
                          <Mail className="w-3 h-3" /> Add first email step
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {replyWizSteps.map((s, i) => (
                          <div key={i} className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold text-[#5B4FE8]">Step {i + 1}</span>
                                <span className="flex items-center gap-0.5 text-[10px] bg-[#5B4FE8]/10 text-[#5B4FE8] px-1.5 py-0.5 rounded-full font-medium">
                                  <Mail className="w-2.5 h-2.5" /> Email
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {i > 0 && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-[#9CA3AF]">Delay:</span>
                                    <input type="number" min={1} value={s.delay_days} onChange={(e) => setReplyWizSteps((prev) => prev.map((st, j) => j === i ? { ...st, delay_days: Number(e.target.value) } : st))} className="w-14 px-1.5 py-0.5 border border-[#E5E7EB] rounded text-xs text-center focus:outline-none focus:border-[#5B4FE8]" />
                                    <span className="text-[10px] text-[#9CA3AF]">days</span>
                                  </div>
                                )}
                                {i === 0 && <span className="text-[10px] text-[#9CA3AF]">Sends immediately</span>}
                                <button onClick={() => setReplyWizSteps((p) => p.filter((_, j) => j !== i))} className="text-[#9CA3AF] hover:text-red-400"><X className="w-3 h-3" /></button>
                              </div>
                            </div>
                            <input value={s.subject} onChange={(e) => setReplyWizSteps((p) => p.map((st, j) => j === i ? { ...st, subject: e.target.value } : st))} placeholder="Email subject" className="w-full px-3 py-1.5 border border-[#E5E7EB] rounded-lg text-xs focus:outline-none focus:border-[#5B4FE8] bg-white" />
                            <textarea value={s.body} onChange={(e) => setReplyWizSteps((p) => p.map((st, j) => j === i ? { ...st, body: e.target.value } : st))} placeholder="Email body… use {{firstName}}, {{companyName}}, {{title}}" rows={4} className="w-full px-3 py-1.5 border border-[#E5E7EB] rounded-lg text-xs focus:outline-none focus:border-[#5B4FE8] bg-white resize-none" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── Step 2: Select lead list ── */}
              {replyWizStep === 2 && (
                <div className="space-y-4">
                  <div className="bg-[#F5F3FF] border border-[#5B4FE8]/20 rounded-xl p-3">
                    <p className="text-xs font-semibold text-[#5B4FE8] mb-0.5">Choose your lead list</p>
                    <p className="text-[11px] text-[#6B7280]">Select the list you'll be sending to. HubCredo will read its custom field keys so you can map them to your template variables in the next step.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#6B7280] mb-1.5">Lead list <span className="text-[#9CA3AF] font-normal">(optional — can enroll later)</span></label>
                    <select
                      value={replyWizListId}
                      onChange={(e) => setReplyWizListId(e.target.value)}
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:border-[#5B4FE8]"
                    >
                      <option value="">Skip — enroll manually later</option>
                      {lists.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                    </select>
                    {replyWizListId && (
                      <p className="text-[11px] text-[#9CA3AF] mt-1">All approved leads from this list will be enrolled once the campaign is created.</p>
                    )}
                  </div>
                  {!replyWizListId && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <p className="text-xs text-amber-700">Without a list, custom field keys won't be available to map — you can still map to standard lead fields and add the list after creation.</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Step 3: Map Variables ── */}
              {replyWizStep === 3 && (() => {
                const detectedVars = extractTemplateVars(replyWizSteps);
                if (detectedVars.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="w-12 h-12 bg-[#F5F3FF] rounded-xl flex items-center justify-center mb-3">
                        <CheckCircle2 className="w-6 h-6 text-[#5B4FE8]" />
                      </div>
                      <p className="text-sm font-semibold text-[#1a1a2e]">No template variables found</p>
                      <p className="text-xs text-[#9CA3AF] mt-1 max-w-xs">Your email steps don't contain any <code className="bg-[#F3F4F6] px-1 rounded">{"{{variables}}"}</code>. Continue to create the campaign.</p>
                    </div>
                  );
                }
                const selectedListName = lists.find((l) => l.id === replyWizListId)?.label;
                return (
                  <div className="space-y-3">
                    <div className="bg-[#F5F3FF] border border-[#5B4FE8]/20 rounded-xl p-3">
                      <p className="text-xs font-semibold text-[#5B4FE8] mb-0.5">Map your template variables</p>
                      <p className="text-[11px] text-[#6B7280]">
                        Tell HubCredo which lead field each <code className="bg-[#EDE9FF] px-0.5 rounded">{"{{variable}}"}</code> should pull from.
                        {selectedListName && <> Custom field keys are loaded from <strong>{selectedListName}</strong>.</>}
                      </p>
                    </div>
                    <div className="space-y-2">
                      {detectedVars.map((v) => {
                        const canonical = toCamelCaseVar(v);
                        const current = replyWizVarMap[v] ?? (varResolvesStandard(v) || "");
                        const isCustomKey =
                          replyWizCustomKeys.includes(v) ||
                          replyWizCustomKeys.some((k) => k.toLowerCase() === v.toLowerCase()) ||
                          replyWizCustomKeys.includes(canonical) ||
                          replyWizCustomKeys.some((k) => k.toLowerCase() === canonical.toLowerCase());
                        return (
                          <div key={v} className="flex items-center gap-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-4 py-3">
                            <code className="text-[11px] font-mono text-[#5B4FE8] bg-[#EDE9FF] px-2 py-1 rounded-lg shrink-0 whitespace-nowrap">{`{{${v}}}`}</code>
                            <span className="text-[#9CA3AF] text-xs shrink-0">→</span>
                            <select
                              value={current}
                              onChange={(e) => setReplyWizVarMap((prev) => ({ ...prev, [v]: e.target.value }))}
                              className="flex-1 px-2.5 py-1.5 border border-[#E5E7EB] rounded-lg text-xs focus:outline-none focus:border-[#5B4FE8] bg-white text-[#1a1a2e]"
                            >
                              <option value="">— Custom field (from CSV) —</option>
                              <optgroup label="Standard lead fields">
                                {REPLY_STANDARD_FIELDS.map((f) => (
                                  <option key={f.value} value={f.value}>{f.label}</option>
                                ))}
                              </optgroup>
                              {replyWizCustomKeys.length > 0 && (
                                <optgroup label={`CSV custom fields${selectedListName ? ` · ${selectedListName}` : ""}`}>
                                  {replyWizCustomKeys.map((k) => (
                                    <option key={`csv:${k}`} value={`__csv__${k}`}>{k}</option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                            {current ? (
                              current.startsWith("__csv__") ? (
                                <span className="text-[10px] text-[#0891B2] font-medium shrink-0 whitespace-nowrap">CSV: {current.replace("__csv__", "")}</span>
                              ) : (
                                <span className="text-[10px] text-[#059669] font-medium shrink-0 whitespace-nowrap">
                                  {REPLY_STANDARD_FIELDS.find((f) => f.value === current)?.label}
                                </span>
                              )
                            ) : (
                              <span className={`text-[10px] font-medium shrink-0 whitespace-nowrap ${isCustomKey ? "text-[#0891B2]" : "text-[#9CA3AF]"}`}>
                                {isCustomKey ? "CSV key ✓" : "CSV key"}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-[#9CA3AF] px-1">
                      Variables left as "Custom field" resolve automatically if the lead has a matching key in their CSV data.
                    </p>
                  </div>
                );
              })()}

              {/* ── Step 4: Create campaign ── */}
              {replyWizStep === 4 && (
                <div className="space-y-4">
                  <div className="bg-[#F5F3FF] border border-[#5B4FE8]/20 rounded-xl p-4">
                    <p className="text-xs font-semibold text-[#5B4FE8] mb-0.5">Campaign ready to create</p>
                    <p className="text-sm font-bold text-[#1a1a2e]">{replyWizName}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="flex items-center gap-0.5 text-[10px] bg-[#5B4FE8]/10 text-[#5B4FE8] px-1.5 py-0.5 rounded-full font-medium">
                        <Mail className="w-2.5 h-2.5" /> {replyWizSteps.length} email step{replyWizSteps.length !== 1 ? "s" : ""}
                      </span>
                      {replyWizListId && (
                        <span className="text-[10px] bg-[#F0FDF4] text-[#059669] border border-[#059669]/20 px-1.5 py-0.5 rounded-full font-medium">
                          {lists.find((l) => l.id === replyWizListId)?.label ?? "List selected"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Generate Preview */}
                  <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-[#6B7280]">Preview with real lead data</p>
                      <button
                        onClick={() => handleGeneratePreview()}
                        disabled={previewLoading || !replyWizListId}
                        className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#5B4FE8] hover:bg-[#4A3FD6] px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                      >
                        {previewLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                        Generate Preview
                      </button>
                    </div>
                    <p className="text-[11px] text-[#9CA3AF]">
                      Fills template variables using the first lead from your selected list, applying all your mappings.
                    </p>
                    {!replyWizListId && (
                      <p className="text-[11px] text-amber-600">No list selected — go back to Step 2 to choose one.</p>
                    )}
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-xs text-amber-700">After creation, activate the sequence in Reply.io (or use the Launch button here) to start sending.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-[#E5E7EB] flex-shrink-0">
              {replyWizStep === 1 && (
                <>
                  <button onClick={() => setReplyWizard(false)} className="flex-1 py-2 border border-[#E5E7EB] text-sm font-semibold text-[#6B7280] rounded-xl hover:bg-[#F9FAFB]">Cancel</button>
                  <button
                    onClick={() => {
                      if (!replyWizName.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
                      if (replyWizSteps.length === 0) { toast({ title: "Add at least one email step", variant: "destructive" }); return; }
                      // Auto-initialise var map with detected standard field matches
                      const vars = extractTemplateVars(replyWizSteps);
                      setReplyWizVarMap((prev) => {
                        const next = { ...prev };
                        for (const v of vars) {
                          if (!(v in next)) next[v] = varResolvesStandard(v) ?? "";
                        }
                        return next;
                      });
                      setReplyWizStep(2);
                    }}
                    className={`flex-1 py-2 ${btnPrimary}`}
                  >
                    Next → Select lead list
                  </button>
                </>
              )}
              {replyWizStep === 2 && (
                <>
                  <button onClick={() => setReplyWizStep(1)} className="flex-1 py-2 border border-[#E5E7EB] text-sm font-semibold text-[#6B7280] rounded-xl hover:bg-[#F9FAFB]">← Back</button>
                  <button
                    onClick={async () => {
                      await loadCustomFieldKeys(replyWizListId);
                      setReplyWizStep(3);
                    }}
                    disabled={customKeysLoading}
                    className={`flex-1 py-2 ${btnPrimary} disabled:opacity-50 flex items-center justify-center gap-2`}
                  >
                    {customKeysLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading fields…</> : "Next → Map variables"}
                  </button>
                </>
              )}
              {replyWizStep === 3 && (
                <>
                  <button onClick={() => setReplyWizStep(2)} className="flex-1 py-2 border border-[#E5E7EB] text-sm font-semibold text-[#6B7280] rounded-xl hover:bg-[#F9FAFB]">← Back</button>
                  <button onClick={() => setReplyWizStep(4)} className={`flex-1 py-2 ${btnPrimary}`}>
                    Next → Review &amp; create
                  </button>
                </>
              )}
              {replyWizStep === 4 && (
                <>
                  <button onClick={() => setReplyWizStep(3)} className="flex-1 py-2 border border-[#E5E7EB] text-sm font-semibold text-[#6B7280] rounded-xl hover:bg-[#F9FAFB]">← Back</button>
                  <button onClick={handleCreateReplySeq} disabled={replyCreating} className={`flex-1 py-2 ${btnPrimary} disabled:opacity-50 flex items-center justify-center gap-2`}>
                    {replyCreating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : <><CheckCircle2 className="w-4 h-4" /> Create campaign</>}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reply.io Enroll modal */}
      {enrollOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
              <h3 className="text-sm font-semibold text-[#1a1a2e]">Enroll Contact in Reply.io</h3>
              <button onClick={() => setEnrollOpen(false)} className="text-[#9CA3AF] hover:text-[#1a1a2e]"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleEnroll} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1">Sequence</label>
                <select value={enrollSeqId ?? ""} onChange={(e) => setEnrollSeqId(Number(e.target.value))} className={enrollInputCls}>
                  <option value="">Select sequence…</option>
                  {replySeqs.filter((s) => s.status === "active").map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1">Email <span className="text-red-500">*</span></label>
                <input type="email" required value={enrollEmail} onChange={(e) => setEnrollEmail(e.target.value)} placeholder="name@company.com" className={enrollInputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[#6B7280] mb-1">First name</label>
                  <input value={enrollFirst} onChange={(e) => setEnrollFirst(e.target.value)} placeholder="Jane" className={enrollInputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B7280] mb-1">Last name</label>
                  <input value={enrollLast} onChange={(e) => setEnrollLast(e.target.value)} placeholder="Smith" className={enrollInputCls} />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEnrollOpen(false)} className={`flex-1 py-2 ${btnBack}`}>Cancel</button>
                <button type="submit" disabled={enrolling || !enrollEmail || !enrollSeqId} className={`flex-1 py-2 flex items-center justify-center gap-1.5 ${btnPrimary}`}>
                  {enrolling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  {enrolling ? "Enrolling…" : "Enroll"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Save Template modal ── */}
      {saveTemplateOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[#F0FDF4] rounded-lg flex items-center justify-center">
                  <BookmarkPlus className="w-4 h-4 text-[#059669]" />
                </div>
                <h3 className="text-sm font-bold text-[#1a1a2e]">Save as Template</h3>
              </div>
              <button onClick={() => setSaveTemplateOpen(false)} className="text-[#9CA3AF] hover:text-[#1a1a2e]"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1.5">Template name <span className="text-red-400">*</span></label>
                <input
                  autoFocus
                  value={saveTemplateName}
                  onChange={(e) => setSaveTemplateName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveTemplate(); }}
                  placeholder="e.g. Cold Email 3-Step"
                  className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:border-[#5B4FE8] focus:ring-2 focus:ring-[#5B4FE8]/10"
                />
              </div>
              <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3 space-y-1">
                <p className="text-[10px] uppercase tracking-widest font-medium text-[#9CA3AF] mb-1.5">Steps to save</p>
                {replyWizSteps.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 bg-[#5B4FE8]">{i + 1}</span>
                    <Mail className="w-3 h-3 text-[#5B4FE8] shrink-0" />
                    <span className="text-xs text-[#6B7280] truncate">{s.subject || s.body?.slice(0, 40) || "No content"}</span>
                    <span className="text-[10px] text-[#9CA3AF] ml-auto shrink-0">Day {s.delay_days}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setSaveTemplateOpen(false)} className={`flex-1 py-2 ${btnBack}`}>Cancel</button>
                <button
                  onClick={handleSaveTemplate}
                  disabled={savingTemplate || !saveTemplateName.trim()}
                  className="flex-1 py-2 flex items-center justify-center gap-1.5 bg-[#059669] hover:bg-[#047857] text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
                >
                  {savingTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {savingTemplate ? "Saving…" : "Save template"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Manage Templates modal ── */}
      {manageTemplatesOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB] flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[#F5F3FF] rounded-lg flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-[#5B4FE8]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1a1a2e]">My Templates</h3>
                  <p className="text-xs text-[#9CA3AF]">{savedTemplates.length} saved template{savedTemplates.length !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <button onClick={() => setManageTemplatesOpen(false)} className="text-[#9CA3AF] hover:text-[#1a1a2e]"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {savedTemplates.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 bg-[#F5F3FF] rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <BookmarkPlus className="w-6 h-6 text-[#5B4FE8]" />
                  </div>
                  <p className="text-sm font-semibold text-[#1a1a2e]">No templates yet</p>
                  <p className="text-xs text-[#6B7280] mt-1">Build a sequence and click "Save as template" to reuse it later.</p>
                </div>
              ) : (
                savedTemplates.map((tpl) => (
                  <div key={tpl.id} className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E7EB]">
                      {editingTemplate?.id === tpl.id ? (
                        <div className="flex items-center gap-2 flex-1 mr-2">
                          <input
                            autoFocus
                            value={editTemplateName}
                            onChange={(e) => setEditTemplateName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleRenameTemplate(); if (e.key === "Escape") setEditingTemplate(null); }}
                            className="flex-1 px-2 py-1 text-sm border border-[#5B4FE8] rounded-lg focus:outline-none"
                          />
                          <button onClick={handleRenameTemplate} className="text-[#5B4FE8] hover:text-[#4A3FD6]"><Save className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setEditingTemplate(null)} className="text-[#9CA3AF] hover:text-[#6B7280]"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-1">
                          <BookmarkPlus className="w-3.5 h-3.5 text-[#5B4FE8] shrink-0" />
                          <span className="text-sm font-semibold text-[#1a1a2e] truncate">{tpl.name}</span>
                          <span className="text-[10px] text-[#9CA3AF] bg-white border border-[#E5E7EB] px-1.5 py-0.5 rounded-full ml-1 shrink-0">{tpl.steps.length} step{tpl.steps.length !== 1 ? "s" : ""}</span>
                        </div>
                      )}
                      {editingTemplate?.id !== tpl.id && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => { applySavedTemplate(tpl); setManageTemplatesOpen(false); }}
                            className="flex items-center gap-1 text-xs text-[#5B4FE8] font-medium bg-[#F5F3FF] hover:bg-[#EDE9FF] border border-[#5B4FE8]/20 px-2 py-1 rounded-lg transition-colors"
                          >
                            <ArrowRight className="w-3 h-3" /> Use
                          </button>
                          <button
                            onClick={() => { setEditingTemplate(tpl); setEditTemplateName(tpl.name); }}
                            className="p-1.5 text-[#9CA3AF] hover:text-[#5B4FE8] hover:bg-[#F5F3FF] rounded-lg transition-colors"
                            title="Rename"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(tpl.id)}
                            disabled={deletingTemplateId === tpl.id}
                            className="p-1.5 text-[#9CA3AF] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Delete"
                          >
                            {deletingTemplateId === tpl.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="px-4 py-2 flex flex-wrap gap-1.5">
                      {tpl.steps.map((s, i) => (
                        <span key={i} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium bg-[#5B4FE8]/10 text-[#5B4FE8]">
                          <Mail className="w-2.5 h-2.5" />
                          {s.subject || "Step"} · Day {s.delay_days}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="px-5 py-4 border-t border-[#E5E7EB] flex-shrink-0">
              <button onClick={() => setManageTemplatesOpen(false)} className={`w-full py-2 ${btnPrimary}`}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Generate Preview modal ── */}
      {previewOpen && previewLead && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB] flex-shrink-0">
              <div>
                <h3 className="text-sm font-bold text-[#1a1a2e]">Template Preview</h3>
                <p className="text-xs text-[#6B7280] mt-0.5">Filled with data from: <span className="font-medium text-[#1a1a2e]">{previewLead.fullName}</span> · {previewLead.companyName}</p>
              </div>
              <button onClick={() => setPreviewOpen(false)} className="text-[#9CA3AF] hover:text-[#1a1a2e]"><X className="w-4 h-4" /></button>
            </div>

            {/* Step tabs */}
            {replyWizSteps.length > 1 && (
              <div className="flex gap-1 px-5 pt-3 pb-0 flex-shrink-0 flex-wrap">
                {replyWizSteps.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setPreviewStepIdx(i)}
                    className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${previewStepIdx === i ? "bg-[#5B4FE8] text-white" : "bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]"}`}
                  >
                    <Mail className="w-3 h-3" />
                    Step {i + 1}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {(() => {
                const s = replyWizSteps[previewStepIdx];
                if (!s) return null;
                const filledSubject = fillTemplate(s.subject, previewLead);
                const filledBody = fillTemplate(s.body, previewLead);
                return (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-xs bg-[#5B4FE8]/10 text-[#5B4FE8] px-2 py-1 rounded-lg font-medium">
                        <Mail className="w-3 h-3" /> Email
                      </span>
                      <span className="text-xs text-[#9CA3AF]">Day {s.delay_days}</span>
                    </div>
                    {filledSubject && (
                      <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3">
                        <p className="text-[10px] uppercase tracking-widest font-medium text-[#9CA3AF] mb-1">Subject</p>
                        <p className="text-sm font-semibold text-[#1a1a2e]">{filledSubject}</p>
                      </div>
                    )}
                    <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3">
                      <p className="text-[10px] uppercase tracking-widest font-medium text-[#9CA3AF] mb-1">Message</p>
                      <pre className="text-sm text-[#1a1a2e] whitespace-pre-wrap leading-relaxed font-sans">
                        {filledBody || <span className="text-[#9CA3AF] italic">No message body</span>}
                      </pre>
                    </div>
                    <div className="bg-[#F0FDF4] border border-emerald-200 rounded-xl p-3">
                      <p className="text-[10px] uppercase tracking-widest font-medium text-emerald-600 mb-1.5">Lead data used</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {Object.entries(previewLead).filter(([, v]) => v).map(([k, v]) => (
                          <div key={k} className="flex items-center gap-1">
                            <span className="text-[10px] text-emerald-600 font-mono shrink-0">{`{{${k}}}`}</span>
                            <span className="text-[10px] text-[#6B7280] truncate">→ {v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-[#E5E7EB] flex-shrink-0">
              {replyWizSteps.length > 1 && (
                <>
                  <button onClick={() => setPreviewStepIdx((p) => Math.max(0, p - 1))} disabled={previewStepIdx === 0} className="flex items-center gap-1 px-3 py-2 text-xs font-medium border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:bg-[#F9FAFB] disabled:opacity-40">
                    ← Prev
                  </button>
                  <button onClick={() => setPreviewStepIdx((p) => Math.min(replyWizSteps.length - 1, p + 1))} disabled={previewStepIdx === replyWizSteps.length - 1} className="flex items-center gap-1 px-3 py-2 text-xs font-medium border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:bg-[#F9FAFB] disabled:opacity-40">
                    Next →
                  </button>
                </>
              )}
              <button onClick={() => setPreviewOpen(false)} className={`flex-1 py-2 ${btnPrimary}`}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Reply.io Delete Sequence confirm */}
      {replyDeleteConfirmId !== null && (
        <>
          <div className="fixed inset-0 bg-black/20 z-50 backdrop-blur-[2px]" onClick={() => setReplyDeleteConfirmId(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-[#1a1a2e] font-semibold text-base">Delete sequence?</p>
                  <p className="text-[#6B7280] text-sm mt-1">
                    This will permanently delete the sequence and all its contacts from Reply.io.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setReplyDeleteConfirmId(null)} className={`flex-1 py-2.5 ${btnBack}`}>Cancel</button>
                <button
                  onClick={() => handleDeleteReplySeq(replyDeleteConfirmId!)}
                  disabled={replyDeletingId === replyDeleteConfirmId}
                  className="flex-1 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {replyDeletingId === replyDeleteConfirmId
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>
                    : <><Trash2 className="w-4 h-4" /> Yes, delete</>}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Launch modal — mailbox picker */}
      {launchModalOpen && (
        <>
          <div className="fixed inset-0 bg-black/20 z-50 backdrop-blur-[2px]" onClick={() => !launchConfirming && setLaunchModalOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-[#F5F3FF] rounded-xl flex items-center justify-center shrink-0">
                  <Send className="w-5 h-5 text-[#5B4FE8]" />
                </div>
                <div>
                  <p className="text-[#1a1a2e] font-semibold text-base">Launch Sequence</p>
                  <p className="text-[#6B7280] text-sm mt-1">Choose the mailbox to send from, then go live.</p>
                </div>
              </div>

              {/* Mailbox picker */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
                  Sending mailbox
                </label>
                {launchEmailAccountsLoading ? (
                  <div className="flex items-center gap-2 py-3">
                    <Loader2 className="w-4 h-4 animate-spin text-[#5B4FE8]" />
                    <span className="text-sm text-[#6B7280]">Loading connected mailboxes…</span>
                  </div>
                ) : launchEmailAccounts.length === 0 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-xs text-amber-700 font-medium">No connected email accounts found in Reply.io.</p>
                    <a href="https://app.reply.io/settings/email-accounts" target="_blank" rel="noopener noreferrer"
                      className="text-xs text-[#5B4FE8] underline mt-1 block">
                      Connect a mailbox in Reply.io →
                    </a>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {launchEmailAccounts.map((acc) => (
                      <button
                        key={acc.id}
                        onClick={() => setLaunchSelectedEmailId(acc.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                          launchSelectedEmailId === acc.id
                            ? "border-[#5B4FE8] bg-[#F5F3FF] shadow-[0_0_0_3px_rgba(91,79,232,0.1)]"
                            : "border-[#E5E7EB] hover:border-[#5B4FE8]/40"
                        }`}
                      >
                        <div className="w-7 h-7 rounded-full bg-[#5B4FE8]/10 flex items-center justify-center text-xs font-bold text-[#5B4FE8] shrink-0">
                          {acc.email[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#1a1a2e] truncate">{acc.alias || acc.email}</p>
                          {acc.alias && <p className="text-xs text-[#9CA3AF] truncate">{acc.email}</p>}
                        </div>
                        {launchSelectedEmailId === acc.id && (
                          <CheckCircle2 className="w-4 h-4 text-[#5B4FE8] shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Lead list */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
                  Enroll lead list <span className="font-normal normal-case text-[#9CA3AF]">(required if no contacts yet)</span>
                </label>
                <select
                  value={launchListId}
                  onChange={(e) => setLaunchListId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-lg text-sm text-[#1a1a2e] focus:outline-none focus:border-[#5B4FE8] bg-white"
                >
                  <option value="">Skip — contacts already enrolled</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>{l.label}</option>
                  ))}
                </select>
                {launchListId && (
                  <p className="text-[11px] text-[#6B7280]">
                    Approved leads will be enrolled before the sequence starts.
                  </p>
                )}
              </div>

              {/* Max emails per day */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
                  Max emails per day
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={2000}
                    value={launchEmailsPerDay}
                    onChange={(e) => setLaunchEmailsPerDay(Math.max(1, Math.min(2000, Number(e.target.value) || 1)))}
                    className="w-28 px-3 py-2.5 border border-[#E5E7EB] rounded-lg text-sm text-[#1a1a2e] focus:outline-none focus:border-[#5B4FE8] focus:ring-2 focus:ring-[#5B4FE8]/10 bg-white text-center font-mono"
                  />
                  <div className="flex gap-1.5 flex-wrap">
                    {[50, 100, 200, 400].map((v) => (
                      <button
                        key={v}
                        onClick={() => setLaunchEmailsPerDay(v)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                          launchEmailsPerDay === v
                            ? "bg-[#5B4FE8] text-white border-[#5B4FE8]"
                            : "bg-white text-[#6B7280] border-[#E5E7EB] hover:border-[#5B4FE8]/40 hover:text-[#5B4FE8]"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-[#9CA3AF]">
                  Controls how many emails this sequence sends across all mailboxes daily.
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setLaunchModalOpen(false)}
                  disabled={launchConfirming}
                  className="flex-1 py-2.5 border border-[#E5E7EB] text-[#6B7280] text-sm font-semibold rounded-lg hover:bg-[#F9FAFB]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmLaunch}
                  disabled={launchConfirming || launchEmailAccountsLoading || launchEmailAccounts.length === 0}
                  className="flex-1 py-2.5 bg-[#5B4FE8] text-white text-sm font-semibold rounded-lg hover:bg-[#4A3FD6] disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  {launchConfirming
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Launching…</>
                    : <><Play className="w-4 h-4" /> Go Live</>}
                </button>
              </div>

              {launchEmailAccounts.length > 0 && !launchSelectedEmailId && (
                <p className="text-xs text-[#9CA3AF] text-center -mt-2">
                  No mailbox selected — will auto-pick first connected account.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}