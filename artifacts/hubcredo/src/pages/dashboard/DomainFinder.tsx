import { useState, useEffect, useCallback, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { CreditCostBadge } from "@/components/ui/CreditCostBadge";
import {
  Globe, Search, Loader2, Briefcase, Sparkles, AlertCircle,
  ExternalLink, RefreshCw, ShoppingCart, User, Plus, Check,
  Trash2, Link, Copy, CheckCheck, Wallet, Tag, Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { useCreditStore } from "@/store/creditStore";

const USD_TO_CREDITS = 750;

function domainPriceToCredits(registrationPrice: number | null | undefined): number {
  if (registrationPrice == null) return 0;
  const dollars = registrationPrice > 500 ? registrationPrice / 100 : registrationPrice;
  return Math.round(dollars * USD_TO_CREDITS);
}

interface DomainResult {
  id?: string; domain?: string | null; company_name?: string | null;
  website?: string | null; industry?: string | null; purpose?: string | null;
  keyword?: string | null; created_at?: string | null;
  registration_price?: number | null;
  renewal_price?: number | null;
  [key: string]: unknown;
}

interface Contact {
  id: string; first_name: string; last_name: string; email: string;
  phone: string; address1: string; city: string; state?: string;
  postal_code: string; country: string; is_default: boolean;
}

const EMPTY_CONTACT = {
  first_name: "", last_name: "", email: "", phone: "",
  address1: "", city: "", state: "", postal_code: "", country: "US",
};

const SUPPORTED_TLDS = [".com", ".co", ".net", ".shop", ".org", ".info"];
function isSupportedTLD(domain: string) {
  return SUPPORTED_TLDS.some(tld => domain.toLowerCase().endsWith(tld));
}

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

const USD_TO_INR = 95;

function formatPrice(value: number | null | undefined, currency: "INR" | "USD" = "INR"): string | null {
  if (value == null) return null;
  const dollars = value > 500 ? value / 100 : value;
  if (currency === "USD") return `$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`;
  const inr = Math.round(dollars * USD_TO_INR);
  return `₹${inr.toLocaleString("en-IN")}`;
}

const POLL_INTERVAL_MS = 10_000;

// ── Connect Existing Domain component ───────────────────────────────
function ConnectExistingDomain({ onConnected }: { onConnected?: (domain: string) => void }) {
  const { toast } = useToast();
  const [domain, setDomain] = useState("");
  const [step, setStep] = useState<"idle" | "nameservers" | "checking" | "done">("idle");
  const [nameservers, setNameservers] = useState<string[]>([]);
  const [propagated, setPropagated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function handleGetNameservers() {
    if (!domain.trim()) return;
    setLoading(true);
    try {
      const res = await apiFetch("/api/inboxkit/nameservers", {
        method: "POST",
        body: JSON.stringify({ domain: domain.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const ns: string[] = data?.result?.[0]?.nameservers ?? [];
      if (!ns.length) throw new Error("No nameservers returned");
      setNameservers(ns);
      setStep("nameservers");
    } catch (err) {
      toast({
        title: "Failed to get nameservers",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally { setLoading(false); }
  }

  async function handleCheckPropagation() {
    setStep("checking");
    setLoading(true);
    try {
      const res = await apiFetch("/api/inboxkit/nameservers/check", {
        method: "POST",
        body: JSON.stringify({ domain: domain.trim() }),
      });
      const data = await res.json();
      const ok = data?.result?.[0]?.propagated === true;
      setPropagated(ok);
      setStep("done");
      if (ok) {
        toast({ title: "Domain connected! ✅", description: "SPF, DKIM & DMARC are now live." });
        onConnected?.(domain.trim());
      } else {
        toast({ title: "Not yet propagated", description: "DNS can take 1–4 hours. Try again shortly.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Check failed", variant: "destructive" });
      setStep("nameservers");
    } finally { setLoading(false); }
  }

  function copyNs(ns: string) {
    navigator.clipboard.writeText(ns);
    setCopied(ns);
    setTimeout(() => setCopied(null), 2000);
  }

  function reset() {
    setDomain(""); setStep("idle"); setNameservers([]); setPropagated(false);
  }

  return (
    <div className="space-y-3">
      {step === "idle" && (
        <div className="flex gap-2">
          <input
            value={domain}
            onChange={e => setDomain(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleGetNameservers()}
            placeholder="yourdomain.com"
            className="flex-1 px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
          />
          <button
            onClick={handleGetNameservers}
            disabled={!domain.trim() || loading}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors active:scale-95"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link className="w-3.5 h-3.5" />}
            Connect
          </button>
        </div>
      )}

      {step === "nameservers" && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-bold text-amber-700 mb-1">Step 1 — Copy these nameservers</p>
            <p className="text-[11px] text-amber-600 mb-3">
              Go to your registrar (GoDaddy / Namecheap / etc.) → DNS Settings → Replace nameservers with:
            </p>
            {nameservers.map((ns, i) => (
              <div key={i} className="flex items-center justify-between bg-white border border-amber-200 rounded-lg px-3 py-2 mb-1.5">
                <span className="text-sm font-mono text-gray-800">{ns}</span>
                <button onClick={() => copyNs(ns)}
                  className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-semibold ml-2 shrink-0">
                  {copied === ns ? <CheckCheck className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied === ns ? "Copied!" : "Copy"}
                </button>
              </div>
            ))}
            <p className="text-[10px] text-amber-500 mt-2">
              ⏱ Propagation takes <strong>1–4 hours</strong>. Come back and click "Check Status" after waiting.
            </p>
          </div>

          <p className="text-xs font-bold text-gray-800">Step 2 — Check propagation</p>
          <div className="flex gap-2">
            <button
              onClick={handleCheckPropagation}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#6B5CE7] text-white text-sm font-semibold rounded-xl hover:bg-[#5a4bd6] disabled:opacity-50 transition-colors active:scale-95"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
              {loading ? "Checking…" : "Check Propagation Status"}
            </button>
            <button onClick={reset}
              className="px-3 py-2.5 border border-gray-200 text-gray-500 text-sm rounded-xl hover:bg-gray-50 transition-colors">
              Reset
            </button>
          </div>
        </div>
      )}

      {step === "checking" && (
        <div className="flex items-center justify-center gap-2 py-5 text-gray-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking DNS propagation…
        </div>
      )}

      {step === "done" && (
        <div className={`rounded-xl p-4 border text-sm ${propagated
          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
          : "bg-amber-50 border-amber-200 text-amber-700"}`}>
          {propagated ? (
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <div>
                <p className="font-semibold">Domain connected!</p>
                <p className="text-xs mt-0.5 text-emerald-600">SPF, DKIM & DMARC are now live on <strong>{domain}</strong>. You can now create a mailbox.</p>
              </div>
            </div>
          ) : (
            <div>
              <p className="font-semibold">Not yet propagated</p>
              <p className="text-xs mt-0.5 text-amber-600">DNS changes can take 1–4 hours. Check again shortly.</p>
              <div className="flex gap-2 mt-3">
                <button onClick={handleCheckPropagation} disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50">
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Retry
                </button>
                <button onClick={reset} className="px-3 py-1.5 border border-amber-200 text-amber-600 text-xs rounded-lg hover:bg-amber-50">
                  Start over
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────
export default function DomainFinder() {
  const { toast } = useToast();
  const { balance, deductOptimistic, fetchBalance, setBalance } = useCreditStore();

  const [currency, setCurrency] = useState<"INR" | "USD">("INR");
  const [keyword, setKeyword] = useState("");
  const [industry, setIndustry] = useState("");
  const [purpose, setPurpose] = useState("");
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingStored, setLoadingStored] = useState(true);
  const [storedDomains, setStoredDomains] = useState<DomainResult[]>([]);
  const [newDomainsAdded, setNewDomainsAdded] = useState(false);
  const knownCountRef = useRef<number>(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  const [showContactModal, setShowContactModal] = useState(false);
  const [pendingDomain, setPendingDomain] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [showNewContactForm, setShowNewContactForm] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [newContact, setNewContact] = useState(EMPTY_CONTACT);
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  const [buyingDomain, setBuyingDomain] = useState<string | null>(null);
  const [showMailboxModal, setShowMailboxModal] = useState(false);
  const [purchasedDomain, setPurchasedDomain] = useState<{ id: string; name: string } | null>(null);
  const [mailboxUsername, setMailboxUsername] = useState("");
  const [creatingMailbox, setCreatingMailbox] = useState(false);

  useEffect(() => {
    apiFetch("/api/inboxkit/wallet")
      .then(r => r.json())
      .then(d => setWalletBalance(d?.balance ?? d?.wallet_balance ?? 0))
      .catch(() => {});
  }, []);

  const fetchDomains = useCallback(async (silent = false) => {
    if (!silent) setLoadingStored(true);
    try {
      const res = await apiFetch("/api/domains");
      if (!res.ok) throw new Error("Failed to load");
      const data: DomainResult[] = await res.json();
      setStoredDomains(data);
      knownCountRef.current = data.length;
    } catch { } finally {
      if (!silent) setLoadingStored(false);
    }
  }, []);

  const pollForNewDomains = useCallback(async () => {
    if (searching) return;
    try {
      const res = await apiFetch("/api/domains");
      if (!res.ok) return;
      const data: DomainResult[] = await res.json();
      if (data.length > knownCountRef.current) {
        knownCountRef.current = data.length;
        setStoredDomains(data);
        setNewDomainsAdded(true);
      }
    } catch { }
  }, [searching]);

  useEffect(() => {
    fetchDomains();
    pollTimerRef.current = setInterval(pollForNewDomains, POLL_INTERVAL_MS);
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, [fetchDomains, pollForNewDomains]);

  async function handleRefresh() {
    setRefreshing(true); setNewDomainsAdded(false);
    try {
      await fetchDomains(true);
      toast({ title: "Refreshed", description: "Domain list is up to date." });
    } catch {
      toast({ title: "Refresh failed", variant: "destructive" });
    } finally { setRefreshing(false); }
  }

  async function handleFind(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;

    if (balance !== null && balance < 10) {
      toast({
        title: "Not enough credits",
        description: `Domain search costs 10 credits but you only have ${balance}. Top up in Billing.`,
        variant: "destructive",
      });
      return;
    }

    setSearching(true); setNewDomainsAdded(false);
    deductOptimistic(10);

    try {
      const res = await apiFetch("/api/domains/find", {
        method: "POST",
        body: JSON.stringify({
          keyword: keyword.trim(),
          industry: industry.trim() || undefined,
          purpose: purpose.trim() || "outreach",
        }),
      });
      const data = await res.json();

      if (typeof data.newBalance === "number") setBalance(data.newBalance);

      if (res.status === 402) {
        toast({
          title: "Not enough credits",
          description: `Domain search costs 10 credits but you only have ${data.balance ?? 0}. Top up in Billing.`,
          variant: "destructive",
        });
        fetchBalance();
        return;
      }

      if (!res.ok) throw new Error(data.error || "Domain search failed");

      toast({ title: "Search started!", description: "Domains will appear here shortly. 10 credits deducted." });
      setTimeout(() => fetchDomains(true), 5000);
      setTimeout(() => fetchDomains(true), 10000);
      setTimeout(() => fetchDomains(true), 18000);
    } catch (err: unknown) {
      fetchBalance();
      toast({
        title: "Search failed",
        description: err instanceof Error ? err.message : "Could not reach domain finder service.",
        variant: "destructive",
      });
    } finally { setSearching(false); }
  }

  async function openContactModal(domain: string) {
    setPendingDomain(domain);
    setShowContactModal(true);
    setShowNewContactForm(false);
    setSelectedContactId(null);
    setLoadingContacts(true);
    try {
      const res = await apiFetch("/api/contacts");
      if (!res.ok) throw new Error();
      const data: Contact[] = await res.json();
      setContacts(data);
      const def = data.find(c => c.is_default);
      if (def) setSelectedContactId(def.id);
      if (data.length === 0) setShowNewContactForm(true);
    } catch {
      setShowNewContactForm(true);
    } finally { setLoadingContacts(false); }
  }

  async function handleSaveNewContact() {
    const { first_name, last_name, email, phone, address1, city, postal_code } = newContact;
    if (!first_name || !last_name || !email || !phone || !address1 || !city || !postal_code) {
      toast({ title: "Missing fields", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }
    setSavingContact(true);
    try {
      const res = await apiFetch("/api/contacts", {
        method: "POST",
        body: JSON.stringify({ ...newContact, is_default: saveAsDefault }),
      });
      if (!res.ok) throw new Error();
      const saved: Contact = await res.json();
      setContacts(prev => [saved, ...prev.map(c => saveAsDefault ? { ...c, is_default: false } : c)]);
      setSelectedContactId(saved.id);
      setShowNewContactForm(false);
      setNewContact(EMPTY_CONTACT);
      setSaveAsDefault(false);
      toast({ title: "Contact saved!" });
    } catch {
      toast({ title: "Failed to save contact", variant: "destructive" });
    } finally { setSavingContact(false); }
  }

  async function handleDeleteContact(id: string) {
    try {
      await apiFetch(`/api/contacts/${id}`, { method: "DELETE" });
      setContacts(prev => prev.filter(c => c.id !== id));
      if (selectedContactId === id) setSelectedContactId(null);
    } catch {
      toast({ title: "Failed to delete contact", variant: "destructive" });
    }
  }

  async function handleConfirmPurchase() {
    if (!pendingDomain || !selectedContactId) return;
    const contact = contacts.find(c => c.id === selectedContactId);
    if (!contact) return;

    const domainData = storedDomains.find(d => (d.domain || d.website) === pendingDomain);
    const creditsRequired = domainPriceToCredits(domainData?.registration_price);

    if (creditsRequired > 0 && balance !== null && balance < creditsRequired) {
      toast({
        title: "Not enough credits",
        description: `This domain costs ${creditsRequired} credits but you only have ${balance}. Top up in Billing.`,
        variant: "destructive",
      });
      return;
    }

    setShowContactModal(false);
    setBuyingDomain(pendingDomain);

    if (creditsRequired > 0) deductOptimistic(creditsRequired);

    try {
      const checkRes = await apiFetch(`/api/inboxkit/check?domain=${encodeURIComponent(pendingDomain)}`);
      const checkData = await checkRes.json();
      if (checkData.available === false) {
        if (creditsRequired > 0) fetchBalance();
        toast({ title: "Domain unavailable", variant: "destructive" }); return;
      }

      const purchaseRes = await apiFetch("/api/inboxkit/purchase", {
        method: "POST",
        body: JSON.stringify({
          domain: pendingDomain,
          contact_details: {
            first_name: contact.first_name,
            last_name: contact.last_name,
            email: contact.email,
            phone: contact.phone,
            address_line1: contact.address1,
            city: contact.city,
            state: contact.state ?? "",
            postal_code: contact.postal_code,
            country: contact.country,
          },
        }),
      });
      const purchaseData = await purchaseRes.json();
      if (!purchaseRes.ok) throw new Error(purchaseData.error ?? "Purchase failed");

      if (creditsRequired > 0) {
        const spendRes = await apiFetch("/api/billing/spend-fixed", {
          method: "POST",
          body: JSON.stringify({
            amount: creditsRequired,
            description: `domain_purchase: ${pendingDomain}`,
          }),
        });
        const spendData = await spendRes.json();
        if (spendRes.ok && typeof spendData.newBalance === "number") {
          setBalance(spendData.newBalance);
        } else {
          fetchBalance();
        }
      }

      const domainId = purchaseData?.domain_id || purchaseData?.domains?.[0]?.id;
      if (!domainId) throw new Error("Failed to extract domain ID from purchase response");

      setPurchasedDomain({ id: String(domainId), name: pendingDomain });

      toast({
        title: "Domain purchased!",
        description: `${pendingDomain} purchased — ${creditsRequired} credits deducted. SPF/DKIM/DMARC auto-configured.`,
      });
      setShowMailboxModal(true);
    } catch (err) {
      if (creditsRequired > 0) fetchBalance();
      toast({
        title: "Purchase failed",
        description: err instanceof Error ? err.message : "Could not purchase domain.",
        variant: "destructive",
      });
    } finally {
      setBuyingDomain(null);
      setPendingDomain(null);
    }
  }

  async function handleCreateMailbox() {
    if (!purchasedDomain?.id || !mailboxUsername.trim()) {
      toast({ title: "Missing information", description: "Domain ID and username are required.", variant: "destructive" });
      return;
    }
    setCreatingMailbox(true);
    try {
      const res = await apiFetch("/api/inboxkit/mailbox", {
        method: "POST",
        body: JSON.stringify({ domain_id: purchasedDomain.id, username: mailboxUsername.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Mailbox creation failed");
      toast({ title: "Mailbox created!", description: `${mailboxUsername}@${purchasedDomain.name} is ready. Warmup started.` });
      setShowMailboxModal(false);
      setMailboxUsername("");
      setPurchasedDomain(null);
    } catch (err) {
      toast({ title: "Mailbox creation failed", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    } finally { setCreatingMailbox(false); }
  }

  function Field({ label, required, placeholder, value, onChange, hint, type = "text" }: {
    label: string; required?: boolean; placeholder: string;
    value: string; onChange: (v: string) => void; hint?: string; type?: string;
  }) {
    return (
      <div>
        <label className="text-xs font-semibold text-gray-700 mb-1 block">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#6B5CE7] focus:ring-2 focus:ring-[rgba(107,92,231,.2)] transition-all" />
        {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
      </div>
    );
  }

  const nc = newContact;
  const setNc = (k: keyof typeof EMPTY_CONTACT) => (v: string) => setNewContact(p => ({ ...p, [k]: v }));
  const canProceed = !!selectedContactId;
  const requiredFilled = nc.first_name && nc.last_name && nc.email && nc.phone && nc.address1 && nc.city && nc.postal_code;

  const pendingDomainData = storedDomains.find(d => (d.domain || d.website) === pendingDomain);
  const pendingRegPrice = formatPrice(pendingDomainData?.registration_price, currency);
  const pendingCredits = domainPriceToCredits(pendingDomainData?.registration_price);
  const shortfall = balance !== null && pendingCredits > 0 ? Math.max(0, pendingCredits - balance) : 0;
  const insufficientCredits = shortfall > 0;

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full bg-[#f8f8fc] min-h-screen">

        {/* Header */}
        <div className="mb-5 sm:mb-8 pt-1 sm:pt-2">
          <h1 style={{ fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: "0.04em" }}
            className="text-gray-900 mb-1 text-3xl sm:text-4xl font-bold">Domain Finder</h1>
          <p className="text-gray-500 text-sm">Get available domains for the right industry and right purpose</p>
        </div>

        {/* Wallet balance banner */}
        {walletBalance !== null && (
          <div className={`mb-5 flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-sm ${
            walletBalance > 0
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-amber-50 border-amber-200 text-amber-700"
          }`}>
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 shrink-0" />
              {walletBalance > 0 ? (
                <span>InboxKit wallet: <strong>${walletBalance.toFixed(2)}</strong> available</span>
              ) : (
                <span><strong>Wallet empty</strong> — domain purchase needs credits.{" "}
                  <button
                    onClick={async () => {
                      const r = await apiFetch("/api/inboxkit/billing-portal");
                      const d = await r.json();
                      if (d.url) window.open(d.url, "_blank");
                    }}
                    className="underline font-semibold hover:opacity-80">Top up →</button>
                </span>
              )}
            </div>
            <span className="text-xs opacity-60 shrink-0 hidden sm:inline">Only .com .co .net .shop .org .info supported</span>
          </div>
        )}

        {/* Connect Existing Domain (FREE) */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 sm:p-6 mb-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-center shrink-0">
              <Link className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-gray-800 text-sm">Connect an existing domain</p>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">FREE</span>
              </div>
              <p className="text-xs text-gray-500">Already own a domain? Point it to InboxKit — SPF/DKIM/DMARC auto-configured at no cost.</p>
            </div>
          </div>
          <ConnectExistingDomain
            onConnected={(d) => toast({ title: `${d} is connected!`, description: "You can now create a mailbox on this domain." })}
          />
        </div>

        {/* Search card */}
        <div className="relative rounded-2xl p-5 sm:p-8 mb-6 sm:mb-8 overflow-hidden" style={{ background: "linear-gradient(135deg, #6B5CE7, #7C6FE0)" }}>
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }} />
          <div className="relative">
            <div className="flex items-center gap-3 mb-4 sm:mb-5">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm sm:text-base leading-tight">Find & buy new domains</p>
                <p className="text-white/70 text-xs">Enter a keyword — industry and purpose are optional</p>
              </div>
            </div>
            <form onSubmit={handleFind} className="flex flex-col gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
                <input value={keyword} onChange={e => setKeyword(e.target.value)}
                  placeholder='Keyword — e.g. "fitness app", "saas crm" *' required
                  className="w-full pl-9 pr-4 py-3 bg-white/15 border border-white/25 rounded-xl text-white placeholder:text-white/50 text-sm focus:outline-none focus:bg-white/20 focus:border-white/50 transition-all" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
                  <input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="Industry — optional"
                    className="w-full pl-9 pr-4 py-3 bg-white/15 border border-white/25 rounded-xl text-white placeholder:text-white/50 text-sm focus:outline-none focus:bg-white/20 focus:border-white/50 transition-all" />
                </div>
                <div className="relative">
                  <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
                  <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Purpose — optional"
                    className="w-full pl-9 pr-4 py-3 bg-white/15 border border-white/25 rounded-xl text-white placeholder:text-white/50 text-sm focus:outline-none focus:bg-white/20 focus:border-white/50 transition-all" />
                </div>
              </div>
              <button type="submit" disabled={searching || !keyword.trim()}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl transition-all disabled:opacity-50 shadow-lg active:scale-95 text-sm border border-white/25">
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {searching ? "Searching…" : "Find domains"}
                {!searching && <CreditCostBadge action="domain_check" variant="dark" />}
              </button>
            </form>
          </div>
        </div>

        {/* Searching spinner */}
        {searching && (
          <div className="flex flex-col items-center justify-center py-16 sm:py-20 gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-[rgba(107,92,231,.1)] border border-[rgba(107,92,231,.2)] rounded-2xl flex items-center justify-center">
              <Globe className="w-6 h-6 sm:w-7 sm:h-7 text-[#6B5CE7] animate-pulse" />
            </div>
            <div className="text-center">
              <p className="text-gray-800 font-semibold mb-1">AI is finding domains…</p>
              <p className="text-gray-500 text-sm">This usually takes 10–20 seconds</p>
              <div className="mt-3 flex items-center justify-center gap-1.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 bg-[#6B5CE7] rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Skeleton */}
        {!searching && loadingStored && (
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 sm:px-5 py-3.5 ${i < 4 ? "border-b border-gray-100" : ""}`}>
                <div className="w-7 h-7 rounded-lg bg-gray-100 animate-pulse shrink-0" />
                <div className="flex-1 h-4 bg-gray-100 rounded animate-pulse" />
                <div className="w-16 h-4 bg-gray-100 rounded animate-pulse shrink-0" />
              </div>
            ))}
          </div>
        )}

        {/* New domains banner */}
        {newDomainsAdded && !searching && (
          <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 bg-[rgba(107,92,231,.08)] border border-[rgba(107,92,231,.2)] rounded-xl">
            <div className="flex items-center gap-2 text-sm text-[#6B5CE7] font-medium">
              <Sparkles className="w-4 h-4 shrink-0" /><span>New domains were added!</span>
            </div>
            <button onClick={() => setNewDomainsAdded(false)} className="text-xs text-[#6B5CE7] font-semibold">Dismiss</button>
          </div>
        )}

        {/* Domain list */}
        {!searching && !loadingStored && storedDomains.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2 flex-wrap">
              <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">
                {storedDomains.length} domain{storedDomains.length !== 1 ? "s" : ""} saved
              </p>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5 bg-gray-100 border border-gray-200 rounded-lg p-0.5 text-xs font-semibold select-none">
                  <button
                    onClick={() => setCurrency("INR")}
                    className={`px-2.5 py-1 rounded-md transition-all ${currency === "INR" ? "bg-[#6B5CE7] text-white shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
                  >₹ INR</button>
                  <button
                    onClick={() => setCurrency("USD")}
                    className={`px-2.5 py-1 rounded-md transition-all ${currency === "USD" ? "bg-[#6B5CE7] text-white shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
                  >$ USD</button>
                </div>
                <button onClick={handleRefresh} disabled={refreshing || searching}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-all disabled:opacity-50 shadow-sm active:scale-95 shrink-0">
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  <span className="hidden xs:inline">{refreshing ? "Refreshing…" : "Refresh"}</span>
                </button>
              </div>
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              {storedDomains.map((d, i) => {
                const domainVal = d.domain || d.website || null;
                const href = domainVal ? (domainVal.startsWith("http") ? domainVal : `https://${domainVal}`) : null;
                const label = domainVal ?? d.company_name ?? "Unknown";
                const supported = domainVal ? isSupportedTLD(domainVal) : false;
                const regPrice = formatPrice(d.registration_price, currency);
                const renPrice = formatPrice(d.renewal_price, currency);
                const itemCredits = domainPriceToCredits(d.registration_price);
                const notEnough = itemCredits > 0 && balance !== null && balance < itemCredits;

                return (
                  <div key={d.id ?? i}
                    className={`flex items-center gap-2 sm:gap-3 px-4 sm:px-5 py-3 sm:py-3.5 hover:bg-gray-50 transition-colors ${i < storedDomains.length - 1 ? "border-b border-gray-100" : ""}`}>

                    {/* Avatar */}
                    <div className="w-7 h-7 rounded-lg bg-[rgba(107,92,231,.1)] border border-[rgba(107,92,231,.2)] flex items-center justify-center text-[#6B5CE7] font-bold text-xs shrink-0">
                      {label[0]?.toUpperCase() ?? "?"}
                    </div>

                    {/* Domain name */}
                    <span className="flex-1 text-sm text-gray-800 font-medium truncate min-w-0">{label}</span>

                    {/* Keyword tag */}
                    {d.keyword && (
                      <span className="text-xs text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full shrink-0">{d.keyword}</span>
                    )}

                    {/* Price badge */}
                    {regPrice && (
                      <div className="flex flex-col items-end shrink-0 min-w-[72px]">
                        <div className="flex items-center gap-1">
                          <Tag className="w-3 h-3 text-[#6B5CE7]" />
                          <span className="text-xs font-bold text-gray-800">{regPrice}<span className="font-normal text-gray-400">/yr</span></span>
                        </div>
                        {renPrice && renPrice !== regPrice && (
                          <span className="text-[10px] text-gray-400 mt-0.5">renews {renPrice}</span>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {href && (
                        <a href={href} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-[#6B5CE7] hover:text-[#5a4bd6] px-2 py-1 rounded-lg hover:bg-[rgba(107,92,231,.08)] transition-colors">
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Visit</span>
                        </a>
                      )}
                      {domainVal && (
                        supported ? (
                          <button onClick={() => openContactModal(domainVal)} disabled={!!buyingDomain}
                            title={notEnough ? `You need ${itemCredits.toLocaleString()} credits (you have ${(balance ?? 0).toLocaleString()})` : undefined}
                            className={`flex items-center gap-1 text-xs font-semibold border px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 active:scale-95 ${
                              notEnough
                                ? "text-red-500 border-red-200 hover:bg-red-50"
                                : "text-emerald-600 hover:text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                            }`}>
                            {buyingDomain === domainVal
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : notEnough
                                ? <AlertCircle className="w-3 h-3" />
                                : <ShoppingCart className="w-3 h-3" />}
                            <span>
                              {buyingDomain === domainVal
                                ? "Buying…"
                                : notEnough
                                  ? `Need ${itemCredits.toLocaleString()} cr`
                                  : "Buy & Setup"}
                            </span>
                          </button>
                        ) : (
                          <span title={`Only ${SUPPORTED_TLDS.join(", ")} domains are supported`}
                            className="flex items-center gap-1 text-xs text-gray-400 border border-gray-200 px-2.5 py-1 rounded-lg cursor-not-allowed">
                            <ShoppingCart className="w-3 h-3" />
                            <span>Unsupported TLD</span>
                          </span>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!searching && !loadingStored && storedDomains.length === 0 && (
          <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-10 sm:p-16 text-center shadow-sm">
            <div className="w-11 h-11 sm:w-12 sm:h-12 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
            </div>
            <p className="text-gray-800 font-semibold mb-1">No domains yet</p>
            <p className="text-gray-500 text-sm">Enter a keyword above to discover available company domains.</p>
          </div>
        )}
      </div>

      {/* ── Contact Modal ─────────────────────────────────────────────── */}
      {showContactModal && pendingDomain && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={() => setShowContactModal(false)} />
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white border border-gray-100 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-100 px-5 sm:px-6 py-4 rounded-t-2xl z-10">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-[rgba(107,92,231,.1)] border border-[rgba(107,92,231,.2)] rounded-xl flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-4 h-4 text-[#6B5CE7]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 text-sm">Registrant Contact</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-gray-500 truncate">Purchasing <span className="font-medium text-[#6B5CE7]">{pendingDomain}</span></p>
                      {pendingRegPrice && (
                        <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
                          <Tag className="w-3 h-3" />
                          {pendingRegPrice}/yr
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-5 sm:px-6 py-5 space-y-4">
                {loadingContacts && (
                  <div className="flex items-center justify-center py-8 gap-2 text-gray-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading contacts…
                  </div>
                )}

                {!loadingContacts && contacts.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Saved contacts</p>
                    <div className="space-y-2">
                      {contacts.map(c => {
                        const isSel = selectedContactId === c.id;
                        return (
                          <div key={c.id} onClick={() => { setSelectedContactId(c.id); setShowNewContactForm(false); }}
                            className={`flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer transition-all ${
                              isSel
                                ? "border-[rgba(107,92,231,.4)] bg-[rgba(107,92,231,.06)]"
                                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                            }`}>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isSel ? "bg-[#6B5CE7]" : "bg-gray-100"}`}>
                              {isSel ? <Check className="w-4 h-4 text-white" /> : <User className="w-4 h-4 text-gray-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">{c.first_name} {c.last_name}</p>
                              <p className="text-xs text-gray-500 truncate">{c.email} · {c.phone}</p>
                              <p className="text-xs text-gray-400 truncate">{c.address1}, {c.city}, {c.country}</p>
                            </div>
                            {c.is_default && (
                              <span className="text-[10px] font-semibold text-[#6B5CE7] bg-[rgba(107,92,231,.08)] border border-[rgba(107,92,231,.2)] px-1.5 py-0.5 rounded-full shrink-0">Default</span>
                            )}
                            <button onClick={e => { e.stopPropagation(); handleDeleteContact(c.id); }}
                              className="p-1 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {!showNewContactForm && (
                      <button onClick={() => { setShowNewContactForm(true); setSelectedContactId(null); }}
                        className="mt-3 flex items-center gap-1.5 text-xs text-[#6B5CE7] hover:text-[#5a4bd6] font-semibold">
                        <Plus className="w-3.5 h-3.5" /> Add new contact
                      </button>
                    )}
                  </div>
                )}

                {!loadingContacts && showNewContactForm && (
                  <div className="space-y-3 border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">New contact</p>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="First name" required placeholder="John" value={nc.first_name} onChange={setNc("first_name")} />
                      <Field label="Last name" required placeholder="Smith" value={nc.last_name} onChange={setNc("last_name")} />
                    </div>
                    <Field label="Email" required type="email" placeholder="john@example.com" value={nc.email} onChange={setNc("email")} />
                    <Field label="Phone" required placeholder="+1.5555555555" value={nc.phone} onChange={setNc("phone")} hint="Format: +1.5555555555" />
                    <Field label="Address" required placeholder="123 Main St" value={nc.address1} onChange={setNc("address1")} />
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="City" required placeholder="New York" value={nc.city} onChange={setNc("city")} />
                      <Field label="State" placeholder="NY" value={nc.state ?? ""} onChange={setNc("state")} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Postal code" required placeholder="10001" value={nc.postal_code} onChange={setNc("postal_code")} />
                      <Field label="Country" required placeholder="US" value={nc.country} onChange={setNc("country")} />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer mt-1">
                      <input type="checkbox" checked={saveAsDefault} onChange={e => setSaveAsDefault(e.target.checked)}
                        className="w-3.5 h-3.5 rounded accent-[#6B5CE7]" />
                      <span className="text-xs text-gray-500">Save as default contact</span>
                    </label>
                    <div className="flex gap-2 pt-1">
                      <button onClick={handleSaveNewContact} disabled={savingContact || !requiredFilled}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#6B5CE7] text-white text-xs font-semibold rounded-xl hover:bg-[#5a4bd6] disabled:opacity-50 transition-colors active:scale-95">
                        {savingContact ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        {savingContact ? "Saving…" : "Save & Select"}
                      </button>
                      {contacts.length > 0 && (
                        <button onClick={() => setShowNewContactForm(false)}
                          className="px-3 py-2 border border-gray-200 text-gray-500 text-xs font-semibold rounded-xl hover:bg-gray-100 transition-colors">
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Price summary */}
                {pendingRegPrice && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Tag className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-xs text-gray-500 font-medium">Registration</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-gray-800">{pendingRegPrice}</span>
                        <span className="text-xs text-gray-400">/yr</span>
                        {formatPrice(pendingDomainData?.renewal_price, currency) && formatPrice(pendingDomainData?.renewal_price, currency) !== pendingRegPrice && (
                          <p className="text-[10px] text-gray-400">renews at {formatPrice(pendingDomainData?.renewal_price, currency)}/yr</p>
                        )}
                      </div>
                    </div>
                    {pendingCredits > 0 && (
                      <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200">
                        <div className="flex items-center gap-2">
                          <Zap className="w-3.5 h-3.5 text-[#6B5CE7]" />
                          <span className="text-xs font-medium text-gray-500">Credits charged</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-[#6B5CE7]">{pendingCredits.toLocaleString()} cr</span>
                          {balance !== null && (
                            <p className="text-[10px] text-gray-400">your balance: {balance.toLocaleString()} cr</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Insufficient credits warning */}
                {insufficientCredits && (
                  <div className="flex items-start gap-3 px-4 py-3.5 bg-red-50 border border-red-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-red-600">Not enough credits</p>
                      <p className="text-xs text-red-500 mt-0.5">
                        This domain costs <strong>{pendingCredits.toLocaleString()} credits</strong> but you only have{" "}
                        <strong>{(balance ?? 0).toLocaleString()}</strong>.{" "}
                        You need <strong>{shortfall.toLocaleString()} more credits</strong> to proceed.
                      </p>
                      <button
                        onClick={() => { setShowContactModal(false); window.location.href = "/billing"; }}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-red-500 underline underline-offset-2 hover:text-red-600">
                        Top up credits →
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handleConfirmPurchase}
                    disabled={!canProceed || insufficientCredits}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#6B5CE7] text-white text-sm font-semibold rounded-xl hover:bg-[#5a4bd6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95">
                    <ShoppingCart className="w-4 h-4" />
                    {insufficientCredits
                      ? `Need ${shortfall.toLocaleString()} more credits`
                      : canProceed
                        ? `Confirm Purchase${pendingRegPrice ? ` · ${pendingRegPrice}` : ""}`
                        : "Select a contact to continue"}
                  </button>
                  <button onClick={() => setShowContactModal(false)}
                    className="px-4 py-3 border border-gray-200 text-gray-500 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors active:scale-95 shrink-0">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Mailbox Modal ─────────────────────────────────────────────── */}
      {showMailboxModal && purchasedDomain && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={() => setShowMailboxModal(false)} />
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white border border-gray-100 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-center shrink-0">
                  <Globe className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 text-sm sm:text-base">Setup Email Mailbox</p>
                  <p className="text-xs text-gray-500 truncate">{purchasedDomain.name} · SPF/DKIM/DMARC configured ✓</p>
                </div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-5 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-700 font-medium">DNS records auto-configured. Propagates in 1–4 hours.</p>
              </div>
              <div className="space-y-3 mb-5">
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">Username <span className="text-red-500">*</span></label>
                  <div className="flex items-center bg-white border border-gray-200 rounded-xl overflow-hidden focus-within:border-[#6B5CE7] focus-within:ring-2 focus-within:ring-[rgba(107,92,231,.2)] transition-all">
                    <input value={mailboxUsername} onChange={e => setMailboxUsername(e.target.value)} placeholder="john.smith"
                      className="flex-1 px-3 py-2.5 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none min-w-0" />
                    <span className="px-2 sm:px-3 py-2.5 bg-gray-50 text-xs text-gray-500 border-l border-gray-200 shrink-0 truncate max-w-[140px]">
                      @{purchasedDomain.name}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={handleCreateMailbox} disabled={creatingMailbox || !mailboxUsername.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#6B5CE7] text-white text-sm font-semibold rounded-xl hover:bg-[#5a4bd6] transition-colors disabled:opacity-50 active:scale-95">
                  {creatingMailbox ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {creatingMailbox ? "Creating…" : "Create Mailbox & Start Warmup"}
                </button>
                <button onClick={() => setShowMailboxModal(false)}
                  className="px-4 py-2.5 border border-gray-200 text-gray-500 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors active:scale-95 shrink-0">
                  Skip
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}