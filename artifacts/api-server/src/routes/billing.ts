import { Router, type IRouter } from "express";
import crypto from "crypto";
import { getRazorpay } from "../lib/razorpay";
import { supabase } from "../lib/supabase";
import { grantCredits, spendCreditsFixed, getCreditBalance } from "../lib/credits";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";

const router: IRouter = Router();

// ── Pack / tier definitions ────────────────────────────────────────────
// INR amounts in paise (1 INR = 100 paise), USD amounts in cents (1 USD = 100 cents)
// Exchange rate: ₹95 per $1
const TOPUP_PACKS: Record<string, { credits: number; amount_inr: number; amount_usd: number; name: string }> = {
  starter: { credits: 1000,  amount_inr: 38000,  amount_usd: 400,  name: "Starter Pack" },
  growth:  { credits: 5000,  amount_inr: 95000,  amount_usd: 1000, name: "Growth Pack"  },
  scale:   { credits: 15000, amount_inr: 237500, amount_usd: 2500, name: "Scale Pack"   },
};

// Growth=$4/mo→₹380, Scale=$9/mo→₹855 (at ₹95/$1)
const SUBSCRIPTION_TIERS: Record<string, { credits: number; amount_inr: number; amount_usd: number }> = {
  growth: { credits: 3000,  amount_inr: 38000, amount_usd: 400 },
  scale:  { credits: 12000, amount_inr: 85500, amount_usd: 900 },
};

// ── POST /billing/create-order ────────────────────────────────────────
router.post("/billing/create-order", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { type, tier, pack_id, currency = "INR" } = req.body as {
    type: "subscription" | "topup";
    tier?: string;
    pack_id?: string;
    currency?: "INR" | "USD";
  };

  if (type !== "subscription" && type !== "topup") {
    res.status(400).json({ error: "type must be 'subscription' or 'topup'" });
    return;
  }

  if (currency !== "INR" && currency !== "USD") {
    res.status(400).json({ error: "currency must be 'INR' or 'USD'" });
    return;
  }

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", req.userId!)
      .single();

    const razorpay = getRazorpay();
    const receiptId = crypto.randomUUID().replace(/-/g, "").slice(0, 20);

    if (type === "topup") {
      const pack = pack_id ? TOPUP_PACKS[pack_id] : null;
      if (!pack) {
        res.status(400).json({ error: "pack_id must be 'starter', 'growth', or 'scale'" });
        return;
      }

      const amount = currency === "USD" ? pack.amount_usd : pack.amount_inr;

      const order = await razorpay.orders.create({
        amount,
        currency,
        receipt: receiptId,
        notes: {
          user_id: req.userId!,
          pack_id: pack_id!,
          credits: String(pack.credits),
          type: "topup",
        },
      } as any);

      await supabase.from("topup_purchases").insert({
        user_id: req.userId!,
        pack_id,
        credits: pack.credits,
        amount_paid_cents: amount,
        razorpay_payment_intent_id: order.id,
        status: "pending",
      });

      res.json({
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        key_id: process.env.RAZORPAY_KEY_ID,
        user_name: (profile?.full_name as string) ?? "",
        user_email: (profile?.email as string) ?? "",
      });
      return;
    }

    // subscription
    if (tier !== "growth" && tier !== "scale") {
      res.status(400).json({ error: "tier must be 'growth' or 'scale'" });
      return;
    }

    const tierConfig = SUBSCRIPTION_TIERS[tier];
    const amount = currency === "USD" ? tierConfig.amount_usd : tierConfig.amount_inr;

    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt: receiptId,
      notes: {
        user_id: req.userId!,
        tier,
        credits: String(tierConfig.credits),
        type: "subscription",
      },
    } as any);

    await supabase.from("subscriptions").upsert({
      user_id: req.userId!,
      tier,
      status: "pending",
    }, { onConflict: "user_id" });

    res.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
      user_name: (profile?.full_name as string) ?? "",
      user_email: (profile?.email as string) ?? "",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create Razorpay order");
    res.status(500).json({ error: "Failed to create order" });
  }
});

// ── POST /billing/verify-payment ─────────────────────────────────────
router.post("/billing/verify-payment", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, type, pack_id, tier } = req.body as {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    type: "subscription" | "topup";
    pack_id?: string;
    tier?: string;
  };

  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    res.status(500).json({ error: "Razorpay secret not configured" });
    return;
  }

  // Verify HMAC SHA256 signature
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    res.status(400).json({ error: "Payment verification failed" });
    return;
  }

  try {
    if (type === "topup") {
      const pack = pack_id ? TOPUP_PACKS[pack_id] : null;
      if (!pack) {
        res.status(400).json({ error: "Invalid pack_id" });
        return;
      }

      const newBalance = await grantCredits(
        req.userId!,
        pack.credits,
        "topup",
        `Credit top-up: ${pack.name}`,
        razorpay_payment_id
      );

      // Mark topup as completed — order ID was stored as razorpay_payment_intent_id
      await supabase
        .from("topup_purchases")
        .update({
          status: "completed",
          razorpay_payment_intent_id: razorpay_payment_id,
        })
        .eq("razorpay_payment_intent_id", razorpay_order_id);

      res.json({ success: true, credits_added: pack.credits, new_balance: newBalance });
      return;
    }

    // subscription
    if (tier !== "growth" && tier !== "scale") {
      res.status(400).json({ error: "Invalid tier" });
      return;
    }

    const credits = SUBSCRIPTION_TIERS[tier].credits;

    const newBalance = await grantCredits(
      req.userId!,
      credits,
      "subscription_grant",
      `${tier} plan credits`,
      razorpay_payment_id
    );

    // Note: DB column has a typo — "razorpy_subscription_id" (missing 'a')
    await supabase.from("subscriptions").upsert({
      user_id: req.userId!,
      tier,
      status: "active",
      razorpy_subscription_id: razorpay_payment_id,
      credits_granted_this_period: true,
    }, { onConflict: "user_id" });

    await supabase
      .from("profiles")
      .update({ subscription_tier: tier, subscription_status: "active" })
      .eq("id", req.userId!);

    res.json({ success: true, credits_added: credits, new_balance: newBalance });
  } catch (err) {
    req.log.error({ err }, "Failed to verify payment");
    res.status(500).json({ error: "Failed to process payment" });
  }
});

// ── GET /billing/status ──────────────────────────────────────────────
router.get("/billing/status", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const [{ data: profile }, { data: sub }, { data: txns }] = await Promise.all([
      supabase
        .from("profiles")
        .select("credit_balance, subscription_tier, subscription_status")
        .eq("id", req.userId!)
        .single(),
      supabase
        .from("subscriptions")
        .select("tier, status, current_period_end")
        .eq("user_id", req.userId!)
        .maybeSingle(),
      supabase
        .from("credit_transactions")
        .select("id, type, amount, balance_after, description, created_at")
        .eq("user_id", req.userId!)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    res.json({
      credit_balance: (profile?.credit_balance as number) ?? 0,
      subscription_tier: (profile?.subscription_tier as string) ?? "free",
      subscription_status: (profile?.subscription_status as string) ?? "inactive",
      current_period_end: sub?.current_period_end ?? null,
      transactions: txns ?? [],
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch billing status");
    res.status(500).json({ error: "Failed to fetch billing status" });
  }
});

// ── POST /billing/spend-fixed ─────────────────────────────────────────
// Deduct a fixed number of credits (e.g. for domain purchases where cost = price × 95)
router.post("/billing/spend-fixed", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { amount, description } = req.body as { amount?: unknown; description?: unknown };

  if (typeof amount !== "number" || amount <= 0 || !Number.isInteger(amount)) {
    res.status(400).json({ error: "amount must be a positive integer" });
    return;
  }

  const spend = await spendCreditsFixed(req.userId!, amount, String(description ?? "domain_purchase"));
  if (!spend.success) {
    const balance = await getCreditBalance(req.userId!);
    res.status(402).json({ error: "Insufficient credits", required: spend.required ?? amount, balance });
    return;
  }

  res.json({ success: true, newBalance: spend.newBalance });
});

// ── GET /billing/credit-costs ────────────────────────────────────────
router.get("/billing/credit-costs", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from("credit_action_costs")
      .select("action_type, credits_cost, description");

    if (error) throw error;

    const costs: Record<string, number> = {};
    for (const row of data ?? []) {
      costs[row.action_type as string] = row.credits_cost as number;
    }

    res.json(costs);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch credit costs");
    res.status(500).json({ error: "Failed to fetch credit costs" });
  }
});

// ── POST /billing/cancel-subscription ───────────────────────────────
router.post("/billing/cancel-subscription", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    await supabase
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("user_id", req.userId!);

    await supabase
      .from("profiles")
      .update({ subscription_status: "inactive", subscription_tier: "free" })
      .eq("id", req.userId!);

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to cancel subscription");
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

export default router;
