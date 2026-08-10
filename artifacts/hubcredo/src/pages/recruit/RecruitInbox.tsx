import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Inbox } from "lucide-react";

export default function RecruitInbox() {
  const [, setLocation] = useLocation();
  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0A0A0A", margin: 0 }}>Inbox</h1>
          <p style={{ color: "#64748B", margin: "4px 0 0", fontSize: "0.9375rem" }}>
            Messages from clients and candidates
          </p>
        </div>

        {/* Placeholder — Phase 3 will add Clients/Candidates tabs + candidate sidebar */}
        <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 14, padding: "48px 32px", textAlign: "center" }}>
          <Inbox style={{ width: 40, height: 40, color: "#CBD5E1", margin: "0 auto 14px", display: "block" }} />
          <h3 style={{ margin: "0 0 8px", fontSize: "1rem", fontWeight: 700, color: "#374151" }}>Inbox — Phase 3</h3>
          <p style={{ color: "#64748B", fontSize: "0.875rem", marginBottom: 20 }}>
            In Phase 3, this page will show Client and Candidate tabs with unread counts.
            Candidate threads will include a sidebar with role, stage, match score, and quick stage-change buttons.
          </p>
          <button
            onClick={() => setLocation("/dashboard/inbox")}
            style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: "#2563EB", color: "#fff", fontWeight: 600, fontSize: "0.875rem", cursor: "pointer" }}
          >
            Open main Inbox →
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
