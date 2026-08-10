interface ScorePillProps {
  score: number | null | undefined;
  size?: "sm" | "md";
}

/** Score display: 80+ green, 60-79 amber, <60 grey. Never red. */
export function ScorePill({ score, size = "md" }: ScorePillProps) {
  if (score == null) return <span style={{ color: "#94A3B8", fontSize: "0.75rem" }}>—</span>;

  const color = score >= 80 ? "#16A34A" : score >= 60 ? "#D97706" : "#64748B";
  const bg    = score >= 80 ? "#DCFCE7" : score >= 60 ? "#FEF3C7" : "#F1F5F9";

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      padding: size === "sm" ? "2px 7px" : "3px 10px",
      borderRadius: 9999,
      background: bg,
      color,
      fontSize: size === "sm" ? "0.6875rem" : "0.75rem",
      fontWeight: 700,
      lineHeight: 1,
    }}>
      {score}
    </span>
  );
}
