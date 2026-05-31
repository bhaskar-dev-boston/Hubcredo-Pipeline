import { create } from "zustand";
import { getToken } from "@/lib/auth";

interface CreditStore {
  balance: number | null;
  fetchBalance: () => Promise<void>;
  deductOptimistic: (amount: number) => void;
  setBalance: (balance: number) => void;
}

export const useCreditStore = create<CreditStore>((set) => ({
  balance: null,

  fetchBalance: async () => {
    try {
      const res = await fetch("/api/billing/status", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      set({ balance: data.credit_balance ?? 0 });
    } catch {}
  },

  deductOptimistic: (amount: number) => {
    set((state) => ({
      balance: state.balance !== null ? Math.max(0, state.balance - amount) : null,
    }));
  },

  setBalance: (balance: number) => set({ balance }),
}));
