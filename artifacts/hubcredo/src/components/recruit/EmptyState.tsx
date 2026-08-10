import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  action?: { label: string; onClick: () => void };
}

/** icon + one sentence + one primary action — never a bare "no data" screen. */
export function EmptyState({ icon: Icon, message, action }: EmptyStateProps) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "64px 32px", gap: 16, textAlign: "center",
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: "#F5F3FF", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon style={{ width: 26, height: 26, color: "#6B4EFF" }} />
      </div>
      <p style={{ fontSize: "0.9375rem", color: "#64748B", maxWidth: 340, margin: 0 }}>{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            padding: "9px 20px", borderRadius: 10, border: "none",
            background: "#6B4EFF", color: "#fff",
            fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
