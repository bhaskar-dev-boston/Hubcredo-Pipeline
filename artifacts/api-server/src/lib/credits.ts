import { supabase } from "./supabase";

export type CreditActionType =
  | "company_analysis"
  | "lead_enrichment"
  | "research_blurb"
  | "domain_search";

export interface SpendResult {
  success: boolean;
  newBalance: number;
  error?: string;
  required?: number;
}

export async function getCreditBalance(userId: string): Promise<number> {
  const { data } = await supabase
    .from("profiles")
    .select("credit_balance")
    .eq("id", userId)
    .single();
  return (data?.credit_balance as number) ?? 0;
}

export async function spendCredits(
  userId: string,
  actionType: CreditActionType,
  count: number = 1
): Promise<SpendResult> {
  const { data: costRow } = await supabase
    .from("credit_action_costs")
    .select("credits_cost")
    .eq("action_type", actionType)
    .single();

  const costPerUnit = (costRow?.credits_cost as number) ?? 0;
  const totalCost = costPerUnit * Math.max(1, count);

  const { data: profile } = await supabase
    .from("profiles")
    .select("credit_balance")
    .eq("id", userId)
    .single();

  const balance = (profile?.credit_balance as number) ?? 0;

  if (balance < totalCost) {
    return { success: false, newBalance: balance, error: "Insufficient credits", required: totalCost };
  }

  const newBalance = balance - totalCost;

  await supabase
    .from("profiles")
    .update({ credit_balance: newBalance })
    .eq("id", userId);

  const description = count > 1
    ? `${actionType} ×${count}`
    : actionType;

  await supabase.from("credit_transactions").insert({
    user_id: userId,
    type: "action_spend",
    action_type: actionType,
    amount: -totalCost,
    description,
    balance_after: newBalance,
  });

  return { success: true, newBalance };
}

export async function spendCreditsFixed(
  userId: string,
  amount: number,
  description: string
): Promise<SpendResult> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("credit_balance")
    .eq("id", userId)
    .single();

  const balance = (profile?.credit_balance as number) ?? 0;

  if (balance < amount) {
    return { success: false, newBalance: balance, error: "Insufficient credits", required: amount };
  }

  const newBalance = balance - amount;

  await supabase
    .from("profiles")
    .update({ credit_balance: newBalance })
    .eq("id", userId);

  await supabase.from("credit_transactions").insert({
    user_id: userId,
    type: "action_spend",
    action_type: "domain_purchase",
    amount: -amount,
    description,
    balance_after: newBalance,
  });

  return { success: true, newBalance };
}

export async function grantCredits(
  userId: string,
  amount: number,
  type: string,
  description: string,
  referenceId?: string
): Promise<number> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("credit_balance")
    .eq("id", userId)
    .single();

  const current = (profile?.credit_balance as number) ?? 0;
  const newBalance = current + amount;

  await supabase
    .from("profiles")
    .update({ credit_balance: newBalance })
    .eq("id", userId);

  await supabase.from("credit_transactions").insert({
    user_id: userId,
    type,
    amount,
    description,
    reference_id: referenceId ?? null,
    balance_after: newBalance,
  });

  return newBalance;
}
