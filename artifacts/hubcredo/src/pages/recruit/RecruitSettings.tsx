import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useGetMe, useUpdateProfile } from "@workspace/api-client-react";
import { Loader2, CheckCircle, Briefcase, Users, Star, Calendar, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

type TabId = "workspace" | "scoring" | "interview-templates" | "fee-models";

export default function RecruitSettings() {
  const [tab, setTab] = useState<TabId>("workspace");
  const { data: profile, refetch } = useGetMe();
  const updateProfile = useUpdateProfile();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [switching, setSwitching] = useState(false);

  const isRecruit = profile?.workspace_type === "recruit";

  async function switchToSales() {
    setSwitching(true);
    try {
      await updateProfile.mutateAsync({ data: { workspace_type: "sales" } });
      await refetch();
      toast({ title: "Switched to Sales mode" });
      setLocation("/dashboard");
    } catch {
      toast({ title: "Error switching workspace", variant: "destructive" });
    } finally { setSwitching(false); }
  }

  const TABS: { id: TabId; label: string; icon: any }[] = [
    { id: "workspace", label: "Workspace", icon: Briefcase },
    { id: "scoring", label: "Scoring Criteria", icon: Star },
    { id: "interview-templates", label: "Interview Templates", icon: Calendar },
    { id: "fee-models", label: "Fee Models", icon: DollarSign },
  ];

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0A0A0A", margin: 0 }}>Recruit Settings</h1>
          <p style={{ color: "#64748B", margin: "4px 0 0", fontSize: "0.9375rem" }}>Configure your recruiting workspace</p>
        </div>

        <div style={{ display: "flex", gap: 24 }}>
          {/* Sidebar nav */}
          <nav style={{ width: 192, flexShrink: 0 }}>
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)} style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "9px 12px", border: "none", borderRadius: 9, cursor: "pointer",
                fontSize: "0.875rem", fontWeight: 500, textAlign: "left", marginBottom: 2,
                background: tab === id ? "#EFF6FF" : "transparent",
                color: tab === id ? "#2563EB" : "#64748B",
              }}>
                <Icon style={{ width: 15, height: 15 }} />{label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div style={{ flex: 1 }}>
            {tab === "workspace" && (
              <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, overflow: "hidden" }}>
                <div style={{ padding: "20px 22px", borderBottom: "1px solid #E2E8F0" }}>
                  <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A0A0A", margin: 0 }}>Workspace mode</h2>
                  <p style={{ fontSize: "0.875rem", color: "#64748B", margin: "4px 0 0" }}>
                    Switch between Sales and Recruit workspaces. One mode per account in v1.
                  </p>
                </div>
                <div style={{ padding: "22px" }}>
                  {/* Current mode card */}
                  <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                    {/* Recruit (active) */}
                    <div style={{
                      flex: 1, padding: "16px 18px", borderRadius: 12,
                      border: "2px solid #2563EB", background: "#EFF6FF",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <Users style={{ width: 18, height: 18, color: "#2563EB" }} />
                        <span style={{ fontWeight: 700, color: "#1D4ED8", fontSize: "0.9375rem" }}>Recruit</span>
                        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: "0.75rem", fontWeight: 700, color: "#2563EB" }}>
                          <CheckCircle style={{ width: 12, height: 12 }} />Active
                        </span>
                      </div>
                      <p style={{ fontSize: "0.8125rem", color: "#1E40AF", margin: 0 }}>
                        Clients, Roles, Candidates, Pipeline, Resume review, Job signals
                      </p>
                    </div>

                    {/* Sales (inactive) */}
                    <div style={{ flex: 1, padding: "16px 18px", borderRadius: 12, border: "1px solid #E2E8F0", background: "#F8FAFC" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <Briefcase style={{ width: 18, height: 18, color: "#64748B" }} />
                        <span style={{ fontWeight: 700, color: "#374151", fontSize: "0.9375rem" }}>Sales</span>
                      </div>
                      <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: 0 }}>
                        Leads, ICP Finder, LinkedIn Outreach, Campaigns, Cold Calling
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={switchToSales}
                    disabled={switching}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      padding: "9px 20px", borderRadius: 10, border: "1px solid #E2E8F0",
                      background: "#fff", color: "#374151", fontWeight: 600,
                      fontSize: "0.875rem", cursor: "pointer",
                    }}
                  >
                    {switching && <Loader2 style={{ width: 14, height: 14 }} />}
                    Switch to Sales mode
                  </button>
                  <p style={{ fontSize: "0.75rem", color: "#94A3B8", marginTop: 10 }}>
                    Switching reloads your sidebar. Your recruit data stays intact.
                  </p>
                </div>
              </div>
            )}

            {tab === "scoring" && (
              <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "22px" }}>
                <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A0A0A", margin: "0 0 8px" }}>Scoring Criteria</h2>
                <p style={{ fontSize: "0.875rem", color: "#64748B", marginBottom: 20 }}>
                  Default weights for candidate match scores. Editing will come in Phase 2 with resume parsing.
                </p>
                {[
                  { label: "Skills match", weight: 40 },
                  { label: "Experience level", weight: 25 },
                  { label: "Industry fit", weight: 20 },
                  { label: "Location / remote preference", weight: 15 },
                ].map(({ label, weight }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                    <span style={{ fontSize: "0.875rem", color: "#374151", minWidth: 220 }}>{label}</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: "#E2E8F0", overflow: "hidden" }}>
                      <div style={{ width: `${weight}%`, height: "100%", background: "#2563EB", borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#2563EB", minWidth: 34 }}>{weight}%</span>
                  </div>
                ))}
              </div>
            )}

            {tab === "interview-templates" && (
              <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "22px" }}>
                <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A0A0A", margin: "0 0 8px" }}>Interview Templates</h2>
                <p style={{ fontSize: "0.875rem", color: "#64748B" }}>
                  Saved question sets from the <code style={{ background: "#F1F5F9", padding: "1px 5px", borderRadius: 4, fontSize: "0.8rem" }}>interview_question_templates</code> table.
                  Building out in Phase 3 alongside the interview scheduling workflow.
                </p>
              </div>
            )}

            {tab === "fee-models" && (
              <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "22px" }}>
                <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A0A0A", margin: "0 0 8px" }}>Fee Models</h2>
                <p style={{ fontSize: "0.875rem", color: "#64748B" }}>
                  Default fee structures (contingency, retained, RPO) from the <code style={{ background: "#F1F5F9", padding: "1px 5px", borderRadius: 4, fontSize: "0.8rem" }}>fee_model_defaults</code> table.
                  Assigned per client — configurable in Phase 4.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
