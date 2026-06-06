import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Zap, TrendingUp, Crown, ShoppingCart, AlertTriangle, CheckCircle,
  ArrowUpCircle, ArrowDownCircle, Loader2,
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

const TIER_ALLOWANCE: Record<string, number> = { free: 200, growth: 3000, scale: 12000 };

const PLANS = [
  {
    id: "free",
    name: "Free",
    priceINR: "₹0",
    priceUSD: "$0",
    credits: 200,
    features: ["200 credits/month", "Basic company analysis", "Up to 10 leads/month", "Community support"],
  },
  {
    id: "growth",
    name: "Growth",
    priceINR: "₹380/mo",
    priceUSD: "$4/mo",
    credits: 3000,
    features: ["3,000 credits/month", "Unlimited company analyses", "Up to 500 leads/month", "Domain finder", "Email support"],
    highlight: true,
  },
  {
    id: "scale",
    name: "Scale",
    priceINR: "₹855/mo",
    priceUSD: "$9/mo",
    credits: 12000,
    features: ["12,000 credits/month", "Everything in Growth", "Unlimited leads", "Priority support", "Custom integrations"],
  },
];

const TOPUP_PACKS = [
  { id: "starter", name: "Starter",     credits: 1000,  priceINR: "₹380",   priceUSD: "$4",  description: "Perfect for occasional use" },
  { id: "growth",  name: "Growth Pack", credits: 5000,  priceINR: "₹950",   priceUSD: "$10", description: "Most popular" },
  { id: "scale",   name: "Scale Pack",  credits: 15000, priceINR: "₹2,375", priceUSD: "$25", description: "Best value per credit" },
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
    <div className="flex items-center gap-1 bg-[#F1F5F9] rounded-xl p-1 text-sm font-semibold select-none">
      <button
        onClick={() => onChange("INR")}
        className={`px-3 py-1.5 rounded-lg transition-all ${
          currency === "INR"
            ? "bg-white text-[#0A0A0A] shadow-sm"
            : "text-[#64748B] hover:text-[#0A0A0A]"
        }`}
      >
        ₹ INR
      </button>
      <button
        onClick={() => onChange("USD")}
        className={`px-3 py-1.5 rounded-lg transition-all ${
          currency === "USD"
            ? "bg-white text-[#0A0A0A] shadow-sm"
            : "text-[#64748B] hover:text-[#0A0A0A]"
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
              body: JSON.stringify({
                ...response,
                type,
                ...extra,
              }),
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
  const allowance = TIER_ALLOWANCE[tier] ?? 200;
  const usedPercent = Math.min(100, Math.round(((allowance - balance) / allowance) * 100));
  const lowBalance = balance < allowance * 0.2;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-[#2563EB]" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-[#0A0A0A]">Billing & Credits</h1>
            <p className="text-sm text-[#64748B] mt-1">Manage your subscription and credit balance.</p>
          </div>
          <CurrencyToggle currency={currency} onChange={setCurrency} />
        </div>

        {/* ── Section 1: Credit Balance ── */}
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl flex items-center justify-center">
              <Zap className="w-4 h-4 text-[#2563EB]" />
            </div>
            <div>
              <h2 className="font-semibold text-[#0A0A0A]">Credit Balance</h2>
              <p className="text-xs text-[#64748B]">{tier.charAt(0).toUpperCase() + tier.slice(1)} plan · {allowance.toLocaleString()} credits/month</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-3xl font-bold text-[#0A0A0A]">{balance.toLocaleString()}</p>
              <p className="text-xs text-[#64748B]">credits remaining</p>
            </div>
          </div>

          {lowBalance && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Low balance — less than 20% of your monthly allowance remaining.</span>
            </div>
          )}

          <div className="mb-5">
            <div className="flex justify-between text-xs text-[#64748B] mb-1.5">
              <span>{(allowance - balance).toLocaleString()} used</span>
              <span>{balance.toLocaleString()} remaining</span>
            </div>
            <div className="h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${usedPercent > 80 ? "bg-red-500" : usedPercent > 50 ? "bg-amber-400" : "bg-[#2563EB]"}`}
                style={{ width: `${usedPercent}%` }}
              />
            </div>
          </div>

          {status?.transactions && status.transactions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-[#94A3B8] uppercase tracking-widest mb-3">Recent Transactions</h3>
              <div className="border border-[#F1F5F9] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F5F7FA] text-xs text-[#64748B] uppercase tracking-wide">
                      <th className="text-left px-4 py-2.5">Date</th>
                      <th className="text-left px-4 py-2.5">Action</th>
                      <th className="text-right px-4 py-2.5">Credits</th>
                      <th className="text-right px-4 py-2.5">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.transactions.map((tx) => (
                      <tr key={tx.id} className="border-t border-[#F1F5F9] hover:bg-[#F5F7FA]">
                        <td className="px-4 py-2.5 text-[#64748B] text-xs whitespace-nowrap">
                          {new Date(tx.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2.5 text-[#0A0A0A] capitalize">
                          {tx.description?.replace(/_/g, " ")}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${tx.amount >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          <span className="flex items-center justify-end gap-1">
                            {tx.amount >= 0 ? <ArrowUpCircle className="w-3.5 h-3.5" /> : <ArrowDownCircle className="w-3.5 h-3.5" />}
                            {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-[#64748B] tabular-nums">{tx.balance_after?.toLocaleString() ?? "-"}</td>
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[#0A0A0A] text-lg">Subscription Plans</h2>
            <span className="text-xs text-[#94A3B8]">Paying in {currency === "INR" ? "Indian Rupees (₹)" : "US Dollars ($)"}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLANS.map((plan) => {
              const isActive = tier === plan.id;
              const isCancelling = isActive && status?.subscription_status === "cancelled";
              return (
                <div key={plan.id}
                  className={`relative bg-white border rounded-2xl p-5 flex flex-col shadow-sm transition-all ${
                    isActive ? "border-[#2563EB] shadow-[0_0_0_2px_rgba(37,99,235,0.15)]" : plan.highlight ? "border-[#7C3AED]" : "border-[#E2E8F0]"
                  }`}>
                  {plan.highlight && !isActive && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-[#7C3AED] text-white text-[10px] font-bold px-3 py-1 rounded-full">POPULAR</span>
                    </div>
                  )}
                  {isActive && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-[#2563EB] text-white text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> CURRENT PLAN
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-3 mt-2">
                    {plan.id === "free"   && <Zap       className="w-4 h-4 text-[#64748B]" />}
                    {plan.id === "growth" && <TrendingUp className="w-4 h-4 text-[#7C3AED]" />}
                    {plan.id === "scale"  && <Crown      className="w-4 h-4 text-[#F59E0B]" />}
                    <span className="font-bold text-[#0A0A0A]">{plan.name}</span>
                  </div>

                  <p className="text-2xl font-bold text-[#0A0A0A] mb-1 transition-all">
                    {currency === "INR" ? plan.priceINR : plan.priceUSD}
                  </p>
                  <p className="text-xs text-[#64748B] mb-4">{plan.credits.toLocaleString()} credits/month</p>

                  <ul className="space-y-2 flex-1 mb-5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-[#475569]">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {isActive && plan.id !== "free" && (
                    <button
                      onClick={handleCancel}
                      disabled={cancelLoading || isCancelling}
                      className="w-full py-2 text-sm text-red-500 border border-red-200 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      {cancelLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : isCancelling ? "Cancelled" : "Cancel subscription"}
                    </button>
                  )}

                  {!isActive && plan.id !== "free" && (
                    <button
                      onClick={() => startPayment(plan.id, "subscription", { tier: plan.id })}
                      disabled={!!checkoutLoading}
                      className={`w-full py-2 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 ${
                        plan.highlight ? "bg-[#7C3AED] text-white hover:bg-[#6D28D9]" : "bg-[#2563EB] text-white hover:bg-[#1D4ED8]"
                      }`}
                    >
                      {checkoutLoading === plan.id ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Upgrade · ${currency === "INR" ? plan.priceINR : plan.priceUSD}`}
                    </button>
                  )}

                  {isActive && plan.id === "free" && (
                    <div className="py-2 text-center text-xs text-[#94A3B8]">Your current plan</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Section 3: Top-Up Packs ── */}
        <section>
          <h2 className="font-semibold text-[#0A0A0A] mb-1 text-lg">Buy More Credits</h2>
          <p className="text-sm text-[#64748B] mb-4">One-time credit purchases — never expire.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {TOPUP_PACKS.map((pack) => (
              <div key={pack.id} className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <ShoppingCart className="w-4 h-4 text-[#2563EB]" />
                  <span className="font-bold text-[#0A0A0A]">{pack.name}</span>
                </div>
                <p className="text-2xl font-bold text-[#0A0A0A] mb-0.5 transition-all">
                  {currency === "INR" ? pack.priceINR : pack.priceUSD}
                </p>
                <p className="text-sm text-[#64748B] mb-1">{pack.credits.toLocaleString()} credits</p>
                <p className="text-xs text-[#94A3B8] mb-5 flex-1">{pack.description}</p>
                <button
                  onClick={() => startPayment(`topup_${pack.id}`, "topup", { pack_id: pack.id })}
                  disabled={!!checkoutLoading}
                  className="w-full py-2 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-xl transition-colors disabled:opacity-50"
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
