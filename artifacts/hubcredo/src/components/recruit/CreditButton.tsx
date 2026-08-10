import { useState } from "react";
import { Zap, Loader2 } from "lucide-react";
import { useCreditStore } from "@/store/creditStore";
import { getToken } from "@/lib/auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface CreditButtonProps {
  label: string;
  creditCost: number;
  actionName: string;
  onConfirm: () => Promise<void>;
  disabled?: boolean;
  variant?: "primary" | "outline";
}

/**
 * Any credit-consuming action shows its cost inline before it fires.
 * Batch actions above 50 credits show a confirmation modal.
 */
export function CreditButton({ label, creditCost, actionName, onConfirm, disabled, variant = "primary" }: CreditButtonProps) {
  const { balance, fetchBalance } = useCreditStore();
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const needsConfirm = creditCost > 50;

  async function execute() {
    setLoading(true);
    try {
      await onConfirm();
      fetchBalance();
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  }

  function handleClick() {
    if (needsConfirm) { setShowConfirm(true); return; }
    execute();
  }

  const isPrimary = variant === "primary";
  const hasEnough = balance == null || balance >= creditCost;

  return (
    <>
      <button
        onClick={handleClick}
        disabled={disabled || loading || !hasEnough}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "8px 16px", borderRadius: 10, cursor: "pointer",
          fontSize: "0.875rem", fontWeight: 600,
          border: isPrimary ? "none" : "1px solid rgba(107,78,255,.3)",
          background: isPrimary ? (disabled || !hasEnough ? "#CBD5E1" : "#6B4EFF") : "transparent",
          color: isPrimary ? "#fff" : "#6B4EFF",
          opacity: disabled ? 0.6 : 1,
          transition: "all .15s",
        }}
        title={!hasEnough ? `Not enough credits (need ${creditCost})` : undefined}
      >
        {loading ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : null}
        {label}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          padding: "2px 7px", borderRadius: 9999,
          background: isPrimary ? "rgba(255,255,255,.2)" : "#F5F3FF",
          fontSize: "0.7rem", fontWeight: 700,
          color: isPrimary ? "rgba(255,255,255,.9)" : "#6B4EFF",
        }}>
          <Zap style={{ width: 9, height: 9 }} /> {creditCost}
        </span>
      </button>

      {/* Confirmation modal for large batch actions */}
      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: 380, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,.15)" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: "1rem", fontWeight: 700 }}>Confirm: {actionName}</h3>
            <p style={{ margin: "0 0 20px", color: "#64748B", fontSize: "0.875rem" }}>
              This will use <strong>{creditCost} credits</strong>. You have{" "}
              <strong>{balance?.toLocaleString()} credits</strong> remaining.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowConfirm(false)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", cursor: "pointer", fontSize: "0.875rem" }}>
                Cancel
              </button>
              <button onClick={execute} disabled={loading} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#6B4EFF", color: "#fff", cursor: "pointer", fontSize: "0.875rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                {loading && <Loader2 style={{ width: 14, height: 14 }} />}
                Confirm ({creditCost} credits)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
