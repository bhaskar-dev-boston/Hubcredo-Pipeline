export type ApplicationStage =
  | "sourced" | "contacted" | "responded" | "screening"
  | "shortlisted" | "submitted" | "client_interview"
  | "offer" | "placed" | "rejected" | "withdrawn";

const STAGE_COLORS: Record<ApplicationStage, { bg: string; color: string; label: string }> = {
  sourced:          { bg: "#F1F5F9", color: "#64748B", label: "Sourced" },
  contacted:        { bg: "#EFF6FF", color: "#2563EB", label: "Contacted" },
  responded:        { bg: "#EFF6FF", color: "#1D4ED8", label: "Responded" },
  screening:        { bg: "#FAF5FF", color: "#7C3AED", label: "Screening" },
  shortlisted:      { bg: "#FFF7ED", color: "#C2410C", label: "Shortlisted" },
  submitted:        { bg: "#FEF3C7", color: "#B45309", label: "Submitted" },
  client_interview: { bg: "#ECFDF5", color: "#047857", label: "Client Interview" },
  offer:            { bg: "#ECFDF5", color: "#065F46", label: "Offer" },
  placed:           { bg: "#DCFCE7", color: "#15803D", label: "Placed ✓" },
  rejected:         { bg: "#F1F5F9", color: "#94A3B8", label: "Rejected" },
  withdrawn:        { bg: "#F1F5F9", color: "#94A3B8", label: "Withdrawn" },
};

interface StageBadgeProps {
  stage: string;
  size?: "sm" | "md";
}

export function StageBadge({ stage, size = "md" }: StageBadgeProps) {
  const cfg = STAGE_COLORS[stage as ApplicationStage] ?? { bg: "#F1F5F9", color: "#64748B", label: stage };
  return (
    <span style={{
      display: "inline-block",
      padding: size === "sm" ? "2px 8px" : "3px 10px",
      borderRadius: 9999,
      background: cfg.bg,
      color: cfg.color,
      fontSize: size === "sm" ? "0.6875rem" : "0.75rem",
      fontWeight: 600,
      whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}

export { STAGE_COLORS };
export const ALL_STAGES: ApplicationStage[] = [
  "sourced","contacted","responded","screening","shortlisted",
  "submitted","client_interview","offer","placed","rejected","withdrawn",
];
