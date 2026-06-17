import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Zap, TrendingUp, Crown, Rocket, ShoppingCart, AlertTriangle, CheckCircle,
  ArrowUpCircle, ArrowDownCircle, Loader2, Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { useCreditStore } from "@/store/creditStore";
import { openRazorpayCheckout, type RazorpayPaymentResponse } from "@/lib/razorpay";

type Currency = "INR" | "USD";

interface BillingStatus {
  credit_balance: number;
  subscription_tier: string;
  subscription_status: string;
  current_period_end: string | null;
  transactions: Transaction[];
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  balance_after: number;
  created_at: string;
}

// Monthly credit allowances per tier
const TIER_ALLOWANCE: Record<string, number> = {
  free: 100,
  starter: 35,
  growth: 500,
  scale: 1000,
};

// 1 credit = $1 purchasing power
const PLANS = [
  {
    id: "free",
    name: "Trial",
    priceINR: "₹0",
    priceUSD: "$0",
    credits: 100,
    creditsLabel: "100 trial credits",
    note: "One-time, no renewal",
    features: [
      "100 free credits on signup",
      "Company analysis (2 cr each)",
      "Lead enrichment (1 cr/lead)",
      "LinkedIn outreach (1 cr/send)",
      "Domain finder (free)",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    priceINR: "₹2,755/mo",
    priceUSD: "$29/mo",
    credits: 35,
    creditsLabel: "35 credits/month",
    note: "$0.83/credit — 17% off",
    features: [
      "35 credits every month",
      "~17 company analyses",
      "~35 leads enriched",
      "~35 LinkedIn sends",
      "Email support",
    ],
    highlight: false,
  },
  {
    id: "growth",
    name: "Growth",
    priceINR: "₹37,905/mo",
    priceUSD: "$399/mo",
    credits: 500,
    creditsLabel: "500 credits/month",
    note: "$0.80/credit — 20% off",
    features: [
      "500 credits every month",
      "~250 company analyses",
      "~500 leads enriched",
      "~500 LinkedIn sends",
      "Domain finder (free)",
      "Priority email support",
    ],
    highlight: true,
  },
  {
    id: "scale",
    name: "Scale",
    priceINR: "₹75,905/mo",
    priceUSD: "$799/mo",
    credits: 1000,
    creditsLabel: "1000 credits/month",
    note: "$0.80/credit — 20% off",
    features: [
      "1000 credits every month",
      "~500 company analyses",
      "~1000 leads enriched",
      "~1000 LinkedIn sends",
      "Domain finder (free)",
      "Dedicated support + onboarding",
    ],
  },
];

// Top-up packs — bonus credits for larger one-time purchases
const TOPUP_PACKS = [
  { id: "small",  name: "$10 Pack",  credits: 10,  priceINR: "₹950",   priceUSD: "$10",  description: "10 credits — no frills",          bonus: "" },
  { id: "medium", name: "$25 Pack",  credits: 28,  priceINR: "₹2,375", priceUSD: "$25",  description: "28 credits — 3 bonus credits",     bonus: "+12% bonus" },
  { id: "large",  name: "$50 Pack",  credits: 60,  priceINR: "₹4,750", priceUSD: "$50",  description: "60 credits — 10 bonus credits",    bonus: "+20% bonus" },
  { id: "xl",     name: "$100 Pack", credits: 130, priceINR: "₹9,500", priceUSD: "$100", description: "130 credits — 30 bonus credits",   bonus: "+30% bonus" },
];

// What each action costs (mirrors server-side constants)
const ACTION_COSTS = [
  { action: "Company Analysis",    credits: 2, note: "per analysis" },
  { action: "Lead Generation",      credits: 1, note: "per 25 leads" },
  { action: "LinkedIn Send",       credits: 1, note: "per invitation" },
  { action: "Domain Finder",        credits: 0, note: "free" },
  { action: "Research Blurb (AI)", credits: 1, note: "per generation" },
];

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

function CurrencyToggle({ currency, onChange }: { currency: Currency; onChange: (c: Currency) => void }) {
  return (
    <div className="flex items-center gap-1 bg-[rgba(255,255,255,.06)] border border-[rgba(255,255,255,.1)] rounded-xl p-1 text-sm font-semibold select-none">
      <button
        onClick={() => onChange("INR")}
        className={`px-3 py-1.5 rounded-lg transition-all ${
          currency === "INR"
            ? "bg-[rgba(255,255,255,.12)] text-white shadow-sm"
            : "text-[rgba(255,255,255,.5)] hover:text-white"
        }`}
      >
        ₹ INR
      </button>
      <button
        onClick={() => onChange("USD")}
        className={`px-3 py-1.5 rounded-lg transition-all ${
          currency === "USD"
            ? "bg-[rgba(255,255,255,.12)] text-white shadow-sm"
            : "text-[rgba(255,255,255,.5)] hover:text-white"
        }`}
      >
        $ USD
      </button>
    </div>
  );
}

export default function Billing() {
  const { toast } = useToast();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [currency, setCurrency] = useState<Currency>("INR");
  const { setBalance, fetchBalance } = useCreditStore();

  useEffect(() => { fetchStatus(); }, []);

  async function fetchStatus() {
    setLoading(true);
    try {
      const res = await apiFetch("/api/billing/status");
      if (!res.ok) throw new Error();
      const data: BillingStatus = await res.json();
      setStatus(data);
      setBalance(data.credit_balance);
    } catch {
      toast({ title: "Failed to load billing info", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function startPayment(loadingKey: string, type: "subscription" | "topup", extra: { tier?: string; pack_id?: string }) {
    setCheckoutLoading(loadingKey);
    try {
      const res = await apiFetch("/api/billing/create-order", {
        method: "POST",
        body: JSON.stringify({ type, currency, ...extra }),
      });
      const orderData = await res.json();
      if (!res.ok) throw new Error(orderData.error ?? "Failed to create order");

      const description = type === "subscription"
        ? `${extra.tier} plan subscription`
        : `${extra.pack_id} credit pack`;

      openRazorpayCheckout({
        ...orderData,
        description,
        onSuccess: async (response: RazorpayPaymentResponse) => {
          try {
            const verifyRes = await apiFetch("/api/billing/verify-payment", {
              method: "POST",
              body: JSON.stringify({ ...response, type, ...extra }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok) throw new Error(verifyData.error ?? "Verification failed");
            toast({ title: "Payment successful!", description: "Credits have been added to your account." });
            await fetchBalance();
            fetchStatus();
          } catch (err) {
            toast({ title: "Payment failed", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
          } finally {
            setCheckoutLoading(null);
          }
        },
        onFailure: () => {
          toast({ title: "Payment cancelled", description: "No charges were made.", variant: "destructive" });
          setCheckoutLoading(null);
        },
      });
    } catch (err) {
      toast({ title: "Failed to start checkout", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
      setCheckoutLoading(null);
    }
  }

  async function handleCancel() {
    if (!confirm("Cancel your subscription? Access will be removed immediately.")) return;
    setCancelLoading(true);
    try {
      const res = await apiFetch("/api/billing/cancel-subscription", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast({ title: "Subscription cancelled" });
      fetchStatus();
    } catch (err) {
      toast({ title: "Failed to cancel", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    } finally {
      setCancelLoading(false);
    }
  }

  const tier = status?.subscription_tier ?? "free";
  const balance = status?.credit_balance ?? 0;
  const monthlyAllowance = TIER_ALLOWANCE[tier] ?? 100;
  const isTrial = tier === "free";

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-[#4f46e5]" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white">Billing & Credits</h1>
            <p className="text-sm text-[rgba(255,255,255,.5)] mt-1">1 credit = $1. Pay only for what you use.</p>
          </div>
          <CurrencyToggle currency={currency} onChange={setCurrency} />
        </div>

        {/* ── Section 1: Credit Balance ── */}
        <section className="bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 bg-[#eef2ff] border border-[#c7d2fe] rounded-xl flex items-center justify-center">
              <Zap className="w-4 h-4 text-[#4f46e5]" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Credit Balance</h2>
              <p className="text-xs text-[rgba(255,255,255,.5)]">
                {isTrial ? "Trial plan · 100 credits one-time" : `${tier.charAt(0).toUpperCase() + tier.slice(1)} plan · ${monthlyAllowance} credits/month`}
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-3xl font-bold text-white">{balance.toLocaleString()}</p>
              <p className="text-xs text-[rgba(255,255,255,.5)]">credits remaining (~${balance})</p>
            </div>
          </div>

          {balance < 5 && (
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5 mb-4 text-sm text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Low balance — less than 5 credits remaining. Top up to keep working.</span>
            </div>
          )}

          {/* Action cost reference */}
          <div className="mb-5 bg-[rgba(255,255,255,.03)] border border-[rgba(255,255,255,.08)] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-3.5 h-3.5 text-[rgba(255,255,255,.5)]" />
              <span className="text-xs font-semibold text-[rgba(255,255,255,.5)] uppercase tracking-wider">Credit costs per action</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ACTION_COSTS.map((a) => (
                <div key={a.action} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-[rgba(255,255,255,.65)]">{a.action}</span>
                  <span className="font-semibold text-white whitespace-nowrap">
                    {a.credits} cr <span className="text-[rgba(255,255,255,.35)] font-normal">({a.note})</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {status?.transactions && status.transactions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-[rgba(255,255,255,.35)] uppercase tracking-widest mb-3">Recent Transactions</h3>
              <div className="border border-[rgba(255,255,255,.08)] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[rgba(255,255,255,.04)] text-xs text-[rgba(255,255,255,.5)] uppercase tracking-wide">
                      <th className="text-left px-4 py-2.5">Date</th>
                      <th className="text-left px-4 py-2.5">Action</th>
                      <th className="text-right px-4 py-2.5">Credits</th>
                      <th className="text-right px-4 py-2.5">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.transactions.map((tx) => (
                      <tr key={tx.id} className="border-t border-[rgba(255,255,255,.08)] hover:bg-[rgba(255,255,255,.04)]">
                        <td className="px-4 py-2.5 text-[rgba(255,255,255,.5)] text-xs whitespace-nowrap">
                          {new Date(tx.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2.5 text-white capitalize">
                          {tx.description?.replace(/_/g, " ")}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${tx.amount >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          <span className="flex items-center justify-end gap-1">
                            {tx.amount >= 0 ? <ArrowUpCircle className="w-3.5 h-3.5" /> : <ArrowDownCircle className="w-3.5 h-3.5" />}
                            {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-[rgba(255,255,255,.5)] tabular-nums">{tx.balance_after?.toLocaleString() ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* ── Section 2: Subscription Plans ── */}
        <section>
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-white text-lg">Monthly Plans</h2>
            <span className="text-xs text-[rgba(255,255,255,.35)]">Paying in {currency === "INR" ? "Indian Rupees (₹)" : "US Dollars ($)"}</span>
          </div>
          <p className="text-sm text-[rgba(255,255,255,.5)] mb-4">Subscribe to get bulk credits each month at a discounted rate.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map((plan) => {
              const isActive = tier === plan.id;
              const isCancelling = isActive && status?.subscription_status === "cancelled";
              return (
                <div key={plan.id}
                  className={`relative bg-[rgba(255,255,255,.04)] border rounded-2xl p-5 flex flex-col shadow-sm transition-all ${
                    isActive ? "border-[#4f46e5] shadow-[0_0_0_2px_rgba(79,70,229,0.15)]" : plan.highlight ? "border-[#7C3AED]" : "border-[rgba(255,255,255,.08)]"
                  }`}>
                  {plan.highlight && !isActive && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-[#7C3AED] text-white text-[10px] font-bold px-3 py-1 rounded-full">POPULAR</span>
                    </div>
                  )}
                  {isActive && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-[#4f46e5] text-white text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> CURRENT
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-3 mt-2">
                    {plan.id === "free"    && <Zap        className="w-4 h-4 text-[rgba(255,255,255,.5)]" />}
                    {plan.id === "starter" && <Rocket     className="w-4 h-4 text-[#10B981]" />}
                    {plan.id === "growth"  && <TrendingUp className="w-4 h-4 text-[#7C3AED]" />}
                    {plan.id === "scale"   && <Crown      className="w-4 h-4 text-[#F59E0B]" />}
                    <span className="font-bold text-white">{plan.name}</span>
                  </div>

                  <p className="text-2xl font-bold text-white mb-0.5 transition-all">
                    {currency === "INR" ? plan.priceINR : plan.priceUSD}
                  </p>
                  <p className="text-xs font-medium text-[#818cf8] mb-0.5">{plan.creditsLabel}</p>
                  {plan.note && <p className="text-xs text-[rgba(255,255,255,.35)] mb-3">{plan.note}</p>}

                  <ul className="space-y-2 flex-1 mb-5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-[rgba(255,255,255,.65)]">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {isActive && plan.id !== "free" && (
                    <button
                      onClick={handleCancel}
                      disabled={cancelLoading || isCancelling}
                      className="w-full py-2 text-sm text-red-400 border border-[rgba(248,113,113,.3)] rounded-xl hover:bg-[rgba(239,68,68,.1)] disabled:opacity-50 transition-colors"
                    >
                      {cancelLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : isCancelling ? "Cancelled" : "Cancel subscription"}
                    </button>
                  )}

                  {!isActive && plan.id !== "free" && (
                    <button
                      onClick={() => startPayment(plan.id, "subscription", { tier: plan.id })}
                      disabled={!!checkoutLoading}
                      className={`w-full py-2 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 ${
                        plan.highlight ? "bg-[#7C3AED] text-white hover:bg-[#6D28D9]" : "bg-[#4f46e5] text-white hover:bg-[#4338ca]"
                      }`}
                    >
                      {checkoutLoading === plan.id ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Subscribe · ${currency === "INR" ? plan.priceINR : plan.priceUSD}`}
                    </button>
                  )}

                  {isActive && plan.id === "free" && (
                    <div className="py-2 text-center text-xs text-[rgba(255,255,255,.35)]">Your current plan</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Section 3: Top-Up Packs ── */}
        <section>
          <h2 className="font-semibold text-white mb-1 text-lg">Buy More Credits</h2>
          <p className="text-sm text-[rgba(255,255,255,.5)] mb-4">One-time purchases. Bigger packs give bonus credits. Credits never expire.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TOPUP_PACKS.map((pack) => (
              <div key={pack.id} className="bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.08)] rounded-2xl p-5 shadow-sm flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-[#4f46e5]" />
                    <span className="font-bold text-white">{pack.name}</span>
                  </div>
                  {pack.bonus && (
                    <span className="text-[10px] font-bold bg-emerald-500/15 text-emerald-300 px-2 py-0.5 rounded-full">
                      {pack.bonus}
                    </span>
                  )}
                </div>
                <p className="text-2xl font-bold text-white mb-0.5 transition-all">
                  {currency === "INR" ? pack.priceINR : pack.priceUSD}
                </p>
                <p className="text-sm font-medium text-[#818cf8] mb-1">{pack.credits} credits</p>
                <p className="text-xs text-[rgba(255,255,255,.35)] mb-5 flex-1">{pack.description}</p>
                <button
                  onClick={() => startPayment(`topup_${pack.id}`, "topup", { pack_id: pack.id })}
                  disabled={!!checkoutLoading}
                  className="w-full py-2 text-sm font-semibold text-white bg-[#4f46e5] hover:bg-[#4338ca] rounded-xl transition-colors disabled:opacity-50"
                >
                  {checkoutLoading === `topup_${pack.id}` ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    `Buy · ${currency === "INR" ? pack.priceINR : pack.priceUSD}`
                  )}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}